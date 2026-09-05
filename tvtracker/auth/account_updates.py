from __future__ import annotations

from typing import Any, Callable
from uuid import UUID

import psycopg

from tvtracker.auth.account_flows import AccountFlowError, IdentifierUnavailableError
from tvtracker.auth.accounts import normalize_username, validated_username


def update_account_credentials(
    connection_factory: Callable[[], Any],
    *,
    user_id: UUID | str,
    username: str,
    password_hash: str | None = None,
) -> tuple[str, str, int]:
    """Atomically update a UUID account username and optional password.

    Credential changes share one transaction and one session-generation bump so
    a combined username/password request can never leave a half-applied account
    update behind.
    """

    display_username = validated_username(username)
    normalized_username = normalize_username(display_username)
    canonical_user_id = UUID(str(user_id))

    try:
        with connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT username_normalized
                    FROM tv_tracker_users
                    WHERE user_id = %s
                      AND status = 'active'
                    FOR UPDATE
                    """,
                    (canonical_user_id,),
                )
                current = cursor.fetchone()
                if current is None:
                    raise AccountFlowError("Account could not be updated")

                if str(current[0]) != normalized_username:
                    cursor.execute(
                        """
                        SELECT 1
                        FROM tv_tracker_users
                        WHERE username_normalized = %s
                          AND user_id <> %s
                        LIMIT 1
                        """,
                        (normalized_username, canonical_user_id),
                    )
                    if cursor.fetchone() is not None:
                        raise IdentifierUnavailableError(
                            "That username is already in use"
                        )

                cursor.execute(
                    """
                    UPDATE tv_tracker_users
                    SET username = %s,
                        username_normalized = %s,
                        password_hash = CASE
                            WHEN %s IS NULL THEN password_hash
                            ELSE %s
                        END,
                        session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE user_id = %s
                      AND status = 'active'
                    RETURNING session_version
                    """,
                    (
                        display_username,
                        normalized_username,
                        password_hash,
                        password_hash,
                        canonical_user_id,
                    ),
                )
                updated = cursor.fetchone()
                if updated is None:
                    raise AccountFlowError("Account could not be updated")
            connection.commit()
    except psycopg.errors.UniqueViolation as error:
        raise IdentifierUnavailableError("That username is already in use") from error

    return display_username, normalized_username, int(updated[0])
