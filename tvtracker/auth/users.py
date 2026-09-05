from __future__ import annotations

import hashlib
import hmac
from typing import Any, Callable
from uuid import UUID

from flask import g

from tvtracker.auth.accounts import USERNAME_RE, normalize_email, normalize_username


AUTH_KIND_USER = "user"
MIN_USER_PASSWORD_CHARS = 10

_USER_SELECT = """
    SELECT user_id,
           email,
           email_normalized,
           username,
           username_normalized,
           password_hash,
           role,
           status,
           email_verified_at,
           session_version,
           created_at,
           updated_at
    FROM tv_tracker_users
"""


def _serialize_user(row: Any) -> dict[str, Any]:
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


def read_user_by_identifier(
    connection_factory: Callable[[], Any], identifier: str
) -> dict[str, Any] | None:
    """Resolve one UUID account by its normalized username or email."""

    candidate = str(identifier).strip()
    if not candidate:
        return None

    # UUID-account usernames are ASCII letters/numbers/underscores by schema.
    # An identifier outside that username grammar can still be an email when it
    # contains ``@``. Everything else belongs to the temporary legacy-admin
    # fallback and must not force a UUID-account database lookup first.
    if "@" not in candidate and USERNAME_RE.fullmatch(candidate) is None:
        return None

    normalized_username = normalize_username(candidate)
    normalized_email = normalize_email(candidate)
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                _USER_SELECT
                + """
                WHERE username_normalized = %s
                   OR email_normalized = %s
                LIMIT 1
                """,
                (normalized_username, normalized_email),
            )
            row = cursor.fetchone()
    return _serialize_user(row) if row is not None else None


def read_user_by_id(
    connection_factory: Callable[[], Any], user_id: UUID | str
) -> dict[str, Any] | None:
    try:
        parsed_user_id = UUID(str(user_id))
    except (TypeError, ValueError, AttributeError):
        return None

    cached = getattr(g, "tv_tracker_user", None)
    if isinstance(cached, dict) and cached.get("user_id") == parsed_user_id:
        return cached

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                _USER_SELECT + " WHERE user_id = %s",
                (parsed_user_id,),
            )
            row = cursor.fetchone()
    if row is None:
        return None

    account = _serialize_user(row)
    g.tv_tracker_user = account
    return account


def user_can_enter_app(account: dict[str, Any]) -> bool:
    return (
        account.get("status") == "active"
        and account.get("email_verified_at") is not None
    )


def user_session_marker(account: dict[str, Any]) -> str:
    """Return an opaque account marker so the client cookie never contains the UUID."""

    material = f"{account['user_id']}|{account['created_at']}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def current_user(
    session_obj: Any, connection_factory: Callable[[], Any]
) -> dict[str, Any] | None:
    if session_obj.get("authenticated") is not True:
        return None
    if session_obj.get("auth_kind") != AUTH_KIND_USER:
        return None

    login_key = str(session_obj.get("user_login_key") or "").strip()
    marker = str(session_obj.get("user_account_marker") or "")
    if not login_key or not marker:
        return None

    account = read_user_by_identifier(connection_factory, login_key)
    if account is None or not user_can_enter_app(account):
        return None
    if not hmac.compare_digest(marker, user_session_marker(account)):
        return None

    try:
        stored_version = int(session_obj.get("session_version"))
    except (TypeError, ValueError):
        return None
    if stored_version != int(account["session_version"]):
        return None

    g.tv_tracker_user = account
    return account


def is_authenticated_user(
    session_obj: Any, connection_factory: Callable[[], Any]
) -> bool:
    return current_user(session_obj, connection_factory) is not None


def login_identifier_key(client_key: str, identifier: str) -> str:
    """Rate-limit one normalized identifier without storing it in security events."""

    normalized = str(identifier).strip().lower().encode("utf-8", errors="ignore")
    digest = hashlib.sha256(normalized).hexdigest()[:32]
    return f"{client_key}|login:{digest}"


def update_user_password(
    connection_factory: Callable[[], Any],
    user_id: UUID | str,
    password_hash: str,
) -> int:
    """Change the password and invalidate every session generation atomically."""

    parsed_user_id = UUID(str(user_id))
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE tv_tracker_users
                SET password_hash = %s,
                    session_version = session_version + 1,
                    updated_at = NOW()
                WHERE user_id = %s
                  AND status = 'active'
                RETURNING session_version
                """,
                (password_hash, parsed_user_id),
            )
            row = cursor.fetchone()
        connection.commit()
    if row is None:
        raise RuntimeError("User account could not be updated")
    return int(row[0])


def revoke_all_user_sessions(
    connection_factory: Callable[[], Any], user_id: UUID | str
) -> int:
    """Invalidate every browser session for one UUID account."""

    parsed_user_id = UUID(str(user_id))
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE tv_tracker_users
                SET session_version = session_version + 1,
                    updated_at = NOW()
                WHERE user_id = %s
                RETURNING session_version
                """,
                (parsed_user_id,),
            )
            row = cursor.fetchone()
        connection.commit()
    if row is None:
        raise RuntimeError("User account could not be found")
    return int(row[0])
