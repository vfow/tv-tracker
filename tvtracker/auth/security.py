from __future__ import annotations

import hmac
import threading
import time
from functools import wraps
from typing import Any, Callable

from argon2 import PasswordHasher
from flask import abort, g, jsonify, redirect, request, session, url_for


PASSWORD_HASHER = PasswordHasher()
MIN_ADMIN_PASSWORD_CHARS = 16
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
ACCOUNT_CHANGE_WINDOW_SECONDS = 60 * 60
ACCOUNT_CHANGE_MAX_ATTEMPTS = 5
ADMIN_ACCOUNT_CACHE_TTL_SECONDS = 2.0
ADMIN_ACCOUNT_CACHE: dict[str, Any] | None = None
ADMIN_ACCOUNT_CACHE_AT = 0.0
ADMIN_ACCOUNT_LOCK = threading.Lock()
def check_csrf() -> None:
    expected = str(session.get("csrf_token", ""))
    supplied = str(
        request.headers.get("X-CSRF-Token")
        or request.form.get("csrf_token")
        or ""
    )

    if not expected or not supplied or not hmac.compare_digest(expected, supplied):
        abort(403)


def invalidate_admin_account_cache() -> None:
    global ADMIN_ACCOUNT_CACHE, ADMIN_ACCOUNT_CACHE_AT
    with ADMIN_ACCOUNT_LOCK:
        ADMIN_ACCOUNT_CACHE = None
        ADMIN_ACCOUNT_CACHE_AT = 0.0


def read_admin_account(
    connection_factory: Callable[[], Any], *, force: bool = False
) -> dict[str, Any]:
    global ADMIN_ACCOUNT_CACHE, ADMIN_ACCOUNT_CACHE_AT
    request_cached = getattr(g, "tv_tracker_admin", None)
    if request_cached is not None and not force:
        return request_cached

    now = time.monotonic()
    with ADMIN_ACCOUNT_LOCK:
        if (
            not force
            and ADMIN_ACCOUNT_CACHE is not None
            and now - ADMIN_ACCOUNT_CACHE_AT < ADMIN_ACCOUNT_CACHE_TTL_SECONDS
        ):
            account = dict(ADMIN_ACCOUNT_CACHE)
            g.tv_tracker_admin = account
            return account

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT username, password_hash, session_version, updated_at
                FROM tv_tracker_admin
                WHERE singleton_id = 1
                """
            )
            row = cursor.fetchone()

    if row is None:
        raise RuntimeError("The admin account is not initialized")

    account = {
        "username": str(row[0]),
        "password_hash": str(row[1]),
        "session_version": int(row[2]),
        "updated_at": row[3],
    }

    with ADMIN_ACCOUNT_LOCK:
        ADMIN_ACCOUNT_CACHE = dict(account)
        ADMIN_ACCOUNT_CACHE_AT = now

    g.tv_tracker_admin = account
    return account


def is_authenticated(session_obj: Any, read_account: Callable[[], dict[str, Any]]) -> bool:
    if session_obj.get("authenticated") is not True:
        return False

    account = read_account()
    stored_version = session_obj.get("session_version")

    # Phase 3 sessions had no version. They may be upgraded only while the
    # migrated admin account is still at its initial version. After the first
    # username/password change, dormant pre-Phase-4 sessions must be rejected.
    if stored_version is None:
        if account["session_version"] != 1:
            return False
        session_obj["session_version"] = 1
        return True

    try:
        return int(stored_version) == account["session_version"]
    except (TypeError, ValueError):
        return False


def login_required(
    view,
    *,
    is_authenticated: Callable[[], bool],
    safe_next_url: Callable[..., str],
):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_authenticated():
            if request.path.startswith("/api/"):
                session.clear()
                return jsonify({
                    "ok": False,
                    "error": "Authentication required",
                    "code": "session_expired",
                }), 401

            destination = safe_next_url(request.full_path)
            session.clear()
            session["post_login_path"] = destination
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def client_key() -> str:
    return request.remote_addr or "unknown"


def security_event_count(
    connection_factory: Callable[[], Any],
    event_type: str,
    key: str,
    window_seconds: int,
) -> int:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM tv_tracker_security_events
                WHERE created_at < NOW() - INTERVAL '2 days'
                """
            )
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM tv_tracker_security_events
                WHERE event_type = %s
                  AND client_key = %s
                  AND created_at >= NOW() - (%s * INTERVAL '1 second')
                """,
                (event_type, key, window_seconds),
            )
            row = cursor.fetchone()
        connection.commit()
    return int(row[0] if row else 0)


def record_security_event(
    connection_factory: Callable[[], Any], event_type: str, key: str
) -> None:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO tv_tracker_security_events
                (event_type, client_key, created_at)
                VALUES (%s, %s, NOW())
                """,
                (event_type, key),
            )
        connection.commit()


def clear_security_events(
    connection_factory: Callable[[], Any], event_type: str, key: str
) -> None:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM tv_tracker_security_events
                WHERE event_type = %s AND client_key = %s
                """,
                (event_type, key),
            )
        connection.commit()


def login_is_limited(connection_factory: Callable[[], Any], key: str) -> bool:
    return security_event_count(
        connection_factory,
        "login_failure", key, LOGIN_WINDOW_SECONDS
    ) >= LOGIN_MAX_ATTEMPTS


def record_login_failure(connection_factory: Callable[[], Any], key: str) -> None:
    record_security_event(
        connection_factory,"login_failure", key)


def clear_login_failures(connection_factory: Callable[[], Any], key: str) -> None:
    clear_security_events(
        connection_factory,"login_failure", key)


def account_change_is_limited(connection_factory: Callable[[], Any], key: str) -> bool:
    return security_event_count(
        connection_factory,
        "account_change_attempt", key, ACCOUNT_CHANGE_WINDOW_SECONDS
    ) >= ACCOUNT_CHANGE_MAX_ATTEMPTS


def sync_request_is_limited(key: str) -> bool:
    now = time.monotonic()
    cutoff = now - SYNC_WINDOW_SECONDS

    with SYNC_LOCK:
        requests = SYNC_REQUESTS[key]
        while requests and requests[0] < cutoff:
            requests.popleft()
        if len(requests) >= SYNC_MAX_REQUESTS:
            return True
        requests.append(now)
        return False


