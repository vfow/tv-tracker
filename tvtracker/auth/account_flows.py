from __future__ import annotations

import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Callable
from uuid import UUID, uuid4

import psycopg

from tvtracker.auth.accounts import normalize_email, normalize_username, validated_username


VERIFY_EMAIL = "verify_email"
PASSWORD_RESET = "password_reset"
EMAIL_CHANGE = "email_change"
TOKEN_PURPOSES = frozenset({VERIFY_EMAIL, PASSWORD_RESET, EMAIL_CHANGE})
VERIFICATION_TTL = timedelta(hours=24)
PASSWORD_RESET_TTL = timedelta(minutes=30)
EMAIL_CHANGE_TTL = timedelta(hours=24)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class AccountFlowError(ValueError):
    code = "account_flow_error"


class IdentifierUnavailableError(AccountFlowError):
    code = "identifier_unavailable"


class InvalidTokenError(AccountFlowError):
    code = "invalid_or_expired_token"


@dataclass(frozen=True)
class IssuedToken:
    raw_token: str
    user_id: UUID
    purpose: str


def validated_email(value: str) -> str:
    email = str(value).strip()
    if len(email) > 254 or EMAIL_RE.fullmatch(email) is None:
        raise AccountFlowError("Enter a valid email address")
    return email


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(str(raw_token).encode("utf-8")).hexdigest()


def _ttl_for_purpose(purpose: str) -> timedelta:
    if purpose == VERIFY_EMAIL:
        return VERIFICATION_TTL
    if purpose == PASSWORD_RESET:
        return PASSWORD_RESET_TTL
    if purpose == EMAIL_CHANGE:
        return EMAIL_CHANGE_TTL
    raise ValueError("Unsupported account token purpose")


def _insert_token(
    cursor: Any,
    *,
    user_id: UUID,
    purpose: str,
    pending_email: str | None = None,
    expected_email: str | None = None,
) -> IssuedToken:
    if purpose not in TOKEN_PURPOSES:
        raise ValueError("Unsupported account token purpose")

    # Serialize issuance and consumption on the account, including simultaneous
    # resends where neither transaction initially sees a previous token.
    cursor.execute(
        "SELECT status, email_normalized FROM tv_tracker_users WHERE user_id = %s FOR UPDATE",
        (user_id,),
    )
    account = cursor.fetchone()
    allowed_states = {"unverified"} if purpose == VERIFY_EMAIL else {"active", "unverified"}
    if purpose == EMAIL_CHANGE:
        allowed_states = {"active"}
        pending_email = validated_email(pending_email or "")
    if account is None or account[0] not in allowed_states:
        raise InvalidTokenError("This account cannot use that link")
    if expected_email is not None and account[1] != normalize_email(expected_email):
        raise InvalidTokenError("The account changed. Please request a new link")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)
    normalized_pending = normalize_email(pending_email) if pending_email is not None else None

    cursor.execute(
        """
        UPDATE tv_tracker_account_tokens
        SET used_at = NOW()
        WHERE user_id = %s
          AND purpose = %s
          AND used_at IS NULL
        """,
        (user_id, purpose),
    )
    cursor.execute(
        """
        INSERT INTO tv_tracker_account_tokens
        (token_id, user_id, purpose, token_hash, pending_email,
         pending_email_normalized, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW() + %s)
        """,
        (
            uuid4(),
            user_id,
            purpose,
            token_hash,
            pending_email,
            normalized_pending,
            _ttl_for_purpose(purpose),
        ),
    )
    return IssuedToken(raw_token=raw_token, user_id=user_id, purpose=purpose)


def issue_token(
    connection_factory: Callable[[], Any],
    *,
    user_id: UUID | str,
    purpose: str,
    pending_email: str | None = None,
    expected_email: str | None = None,
) -> IssuedToken:
    parsed_user_id = UUID(str(user_id))
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            token = _insert_token(
                cursor,
                user_id=parsed_user_id,
                purpose=purpose,
                pending_email=pending_email,
                expected_email=expected_email,
            )
        connection.commit()
    return token


def create_user_with_verification_token(
    connection_factory: Callable[[], Any],
    *,
    email: str,
    username: str,
    password_hash: str,
) -> tuple[UUID, IssuedToken]:
    display_email = validated_email(email)
    display_username = validated_username(username)
    user_id = uuid4()
    try:
        with connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_users
                    (user_id, email, email_normalized, username, username_normalized,
                     password_hash, role, status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'user', 'unverified')
                    """,
                    (
                        user_id,
                        display_email,
                        normalize_email(display_email),
                        display_username,
                        normalize_username(display_username),
                        password_hash,
                    ),
                )
                token = _insert_token(
                    cursor,
                    user_id=user_id,
                    purpose=VERIFY_EMAIL,
                )
            connection.commit()
    except psycopg.errors.UniqueViolation as error:
        raise IdentifierUnavailableError(
            "That email or username is already in use"
        ) from error
    return user_id, token


def user_for_email(connection_factory: Callable[[], Any], email: str) -> dict[str, Any] | None:
    normalized = normalize_email(validated_email(email))
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT user_id, email, email_normalized, username, username_normalized,
                       password_hash, role, status, email_verified_at, session_version,
                       created_at, updated_at
                FROM tv_tracker_users
                WHERE email_normalized = %s
                LIMIT 1
                """,
                (normalized,),
            )
            row = cursor.fetchone()
    if row is None:
        return None
    return {
        "user_id": UUID(str(row[0])),
        "email": str(row[1]),
        "email_normalized": str(row[2]),
        "username": str(row[3]),
        "username_normalized": str(row[4]),
        "password_hash": str(row[5]),
        "role": str(row[6]),
        "status": str(row[7]),
        "email_verified_at": row[8],
        "session_version": int(row[9]),
        "created_at": row[10],
        "updated_at": row[11],
    }


def _lock_live_token(cursor: Any, *, raw_token: str, purpose: str):
    if not raw_token or len(raw_token) > 256:
        raise InvalidTokenError("This link is invalid or has expired")
    # Always acquire account then token locks, matching token issuance and
    # credential changes. Recheck token validity after acquiring both locks.
    cursor.execute(
        """
        SELECT u.user_id FROM tv_tracker_users u
        JOIN tv_tracker_account_tokens t ON t.user_id = u.user_id
        WHERE t.token_hash = %s AND t.purpose = %s
        FOR UPDATE OF u
        """,
        (hash_token(raw_token), purpose),
    )
    if cursor.fetchone() is None:
        raise InvalidTokenError("This link is invalid or has expired")
    cursor.execute(
        """
        SELECT token_id, user_id, pending_email, pending_email_normalized
        FROM tv_tracker_account_tokens
        WHERE token_hash = %s
          AND purpose = %s
          AND used_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE
        """,
        (hash_token(raw_token), purpose),
    )
    row = cursor.fetchone()
    if row is None:
        raise InvalidTokenError("This link is invalid or has expired")
    return row


def revoke_recovery_tokens(cursor: Any, user_id: UUID) -> None:
    """Invalidate old recovery/email-change links in the credential transaction."""
    cursor.execute(
        """
        UPDATE tv_tracker_account_tokens SET used_at = NOW()
        WHERE user_id = %s AND purpose IN ('password_reset', 'email_change')
          AND used_at IS NULL
        """,
        (user_id,),
    )


def verify_email_token(connection_factory: Callable[[], Any], raw_token: str) -> UUID:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            row = _lock_live_token(cursor, raw_token=raw_token, purpose=VERIFY_EMAIL)
            user_id = UUID(str(row[1]))
            cursor.execute(
                """
                UPDATE tv_tracker_users
                SET status = 'active',
                    email_verified_at = COALESCE(email_verified_at, NOW()),
                    updated_at = NOW()
                WHERE user_id = %s
                  AND status = 'unverified'
                """,
                (user_id,),
            )
            if cursor.rowcount != 1:
                raise InvalidTokenError("This verification link is no longer usable")
            cursor.execute(
                "UPDATE tv_tracker_account_tokens SET used_at = NOW() WHERE token_id = %s",
                (row[0],),
            )
        connection.commit()
    return user_id


def reset_password_token(
    connection_factory: Callable[[], Any],
    *,
    raw_token: str,
    password_hash: str,
) -> UUID:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            row = _lock_live_token(cursor, raw_token=raw_token, purpose=PASSWORD_RESET)
            user_id = UUID(str(row[1]))
            cursor.execute(
                """
                UPDATE tv_tracker_users
                SET password_hash = %s,
                    session_version = session_version + 1,
                    updated_at = NOW()
                WHERE user_id = %s
                  AND status IN ('active', 'unverified')
                """,
                (password_hash, user_id),
            )
            if cursor.rowcount != 1:
                raise InvalidTokenError("This reset link is no longer usable")
            revoke_recovery_tokens(cursor, user_id)
        connection.commit()
    return user_id


def confirm_email_change_token(
    connection_factory: Callable[[], Any], raw_token: str
) -> tuple[UUID, int]:
    try:
        with connection_factory() as connection:
            with connection.cursor() as cursor:
                row = _lock_live_token(cursor, raw_token=raw_token, purpose=EMAIL_CHANGE)
                user_id = UUID(str(row[1]))
                pending_email = str(row[2] or "").strip()
                pending_normalized = str(row[3] or "").strip()
                if not pending_email or not pending_normalized:
                    raise InvalidTokenError("This email-change link is invalid")
                cursor.execute(
                    """
                    UPDATE tv_tracker_users
                    SET email = %s,
                        email_normalized = %s,
                        email_verified_at = NOW(),
                        session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND status = 'active'
                    RETURNING session_version
                    """,
                    (pending_email, pending_normalized, user_id),
                )
                version_row = cursor.fetchone()
                if version_row is None:
                    raise InvalidTokenError("This email-change link is no longer usable")
                revoke_recovery_tokens(cursor, user_id)
            connection.commit()
    except psycopg.errors.UniqueViolation as error:
        raise IdentifierUnavailableError("That email address is already in use") from error
    return user_id, int(version_row[0])


def update_username(
    connection_factory: Callable[[], Any],
    *,
    user_id: UUID | str,
    username: str,
) -> tuple[str, str, int]:
    display_username = validated_username(username)
    normalized = normalize_username(display_username)
    try:
        with connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE tv_tracker_users
                    SET username = %s,
                        username_normalized = %s,
                        session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND status = 'active'
                    RETURNING session_version
                    """,
                    (display_username, normalized, UUID(str(user_id))),
                )
                row = cursor.fetchone()
            connection.commit()
    except psycopg.errors.UniqueViolation as error:
        raise IdentifierUnavailableError("That username is already in use") from error
    if row is None:
        raise AccountFlowError("Account could not be updated")
    return display_username, normalized, int(row[0])


def ensure_email_available(
    connection_factory: Callable[[], Any],
    *,
    email: str,
    excluding_user_id: UUID | str,
) -> str:
    display_email = validated_email(email)
    normalized = normalize_email(display_email)
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM tv_tracker_users
                WHERE email_normalized = %s
                  AND user_id <> %s
                LIMIT 1
                """,
                (normalized, UUID(str(excluding_user_id))),
            )
            if cursor.fetchone() is not None:
                raise IdentifierUnavailableError("That email address is already in use")
    return display_email
