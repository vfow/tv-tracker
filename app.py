from __future__ import annotations

import gzip
import hashlib
import hmac
import json
import os
import re
import threading
import time
import math
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from functools import wraps
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from flask import (
    Flask,
    Response,
    g,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from psycopg.types.json import Jsonb
from werkzeug.middleware.proxy_fix import ProxyFix


APP_NAME = "TV Tracker"
BACKUP_VERSION = 2
SCHEMA_VERSION = 4
SUPPORTED_BACKUP_VERSIONS = {1, BACKUP_VERSION}
MAX_BODY_BYTES = 40 * 1024 * 1024
TMDB_PATH_RE = re.compile(r"^[A-Za-z0-9_./-]+$")
APP_SHOW_PATH_RE = re.compile(r"^/app/show/([1-9][0-9]{0,11})$")
APP_EPISODE_PATH_RE = re.compile(
    r"^/app/show/([1-9][0-9]{0,11})/season/([0-9]{1,5})/episode/([1-9][0-9]{0,5})$"
)
APP_SECTION_PATHS = {
    "/app/watchlist",
    "/app/upcoming",
    "/app/history",
    "/app/discover",
    "/app/profile",
    "/app/settings",
}
ERROR_PAGE_MESSAGES = {
    404: ("We're not in Kansas anymore", "This page is off the map."),
    500: ("Houston, we have a problem", "Something went wrong. Try again in a moment."),
}
PASSWORD_HASHER = PasswordHasher()
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
ACCOUNT_CHANGE_WINDOW_SECONDS = 60 * 60
ACCOUNT_CHANGE_MAX_ATTEMPTS = 5
ADMIN_ACCOUNT_CACHE_TTL_SECONDS = 2.0
ADMIN_ACCOUNT_CACHE: dict[str, Any] | None = None
ADMIN_ACCOUNT_CACHE_AT = 0.0
ADMIN_ACCOUNT_LOCK = threading.Lock()
SYNC_WINDOW_SECONDS = 60
SYNC_MAX_REQUESTS = 180
SYNC_REQUESTS: dict[str, deque[float]] = defaultdict(deque)
SYNC_LOCK = threading.Lock()
CHANGE_LOG_RETENTION_REVISIONS = 5000
CHANGE_LOG_RETENTION_DAYS = 30
OPERATION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")
DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
STATE_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
ALLOWED_STATE_KEYS = {"profile", "metadata_sync", "network_sync", "import_info"}
MAX_JSON_DEPTH = 16
MAX_JSON_CONTAINER_ITEMS = 500000
MAX_JSON_STRING_CHARS = 12 * 1024 * 1024
MAX_IDENTIFIER_CHARS = 240
MAX_SHOWS_PER_SYNC = 5000
MAX_HISTORY_PER_SYNC = 100000
MAX_DELETES_PER_SYNC = 100000
MAX_HISTORY_ORDER = 500000


def required_env(name: str, *, strip: bool = True) -> str:
    value = os.environ.get(name, "")
    if strip:
        value = value.strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def bootstrap_admin_credentials() -> tuple[str, str]:
    username = (
        os.environ.get("APP_USERNAME")
        or os.environ.get("ADMIN_USERNAME", "")
    ).strip()
    password_hash = (
        os.environ.get("APP_PASSWORD_HASH")
        or os.environ.get("ADMIN_PASSWORD_HASH", "")
    ).strip()
    return username, password_hash


def database_connection() -> psycopg.Connection[Any]:
    return psycopg.connect(
        host=required_env("DB_HOST"),
        port=int(os.environ.get("DB_PORT", "5432")),
        dbname=required_env("DB_NAME"),
        user=required_env("DB_USER"),
        password=required_env("DB_PASSWORD", strip=False),
        connect_timeout=10,
    )


def ensure_schema() -> None:
    statements = """
    CREATE TABLE IF NOT EXISTS tv_tracker_shows (
        show_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_history (
        entry_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_state (
        state_key TEXT PRIMARY KEY,
        data JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_meta (
        singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
        revision BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_changes (
        revision BIGINT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        delta JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_admin (
        singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        session_version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_security_events (
        event_id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        client_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_schema_meta (
        singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
        schema_version INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS tv_tracker_changes_created_at_idx
    ON tv_tracker_changes (created_at);

    CREATE INDEX IF NOT EXISTS tv_tracker_security_events_lookup_idx
    ON tv_tracker_security_events (event_type, client_key, created_at);

    INSERT INTO tv_tracker_meta (singleton_id, revision)
    VALUES (1, 0)
    ON CONFLICT (singleton_id) DO NOTHING;
    """

    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(statements)
            bootstrap_username, bootstrap_password_hash = bootstrap_admin_credentials()
            if bootstrap_username and bootstrap_password_hash:
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_admin
                    (singleton_id, username, password_hash, session_version)
                    VALUES (1, %s, %s, 1)
                    ON CONFLICT (singleton_id) DO NOTHING
                    """,
                    (bootstrap_username, bootstrap_password_hash),
                )

            cursor.execute(
                "SELECT 1 FROM tv_tracker_admin WHERE singleton_id = 1"
            )
            if cursor.fetchone() is None:
                raise RuntimeError(
                    "The admin account is not initialized. Configure APP_USERNAME and "
                    "APP_PASSWORD_HASH, or ADMIN_USERNAME and ADMIN_PASSWORD_HASH, "
                    "for first startup. You can also run tools/reset_admin.py "
                    "over SSH to recreate the missing singleton account."
                )

            cursor.execute(
                """
                INSERT INTO tv_tracker_schema_meta
                (singleton_id, schema_version, updated_at)
                VALUES (1, %s, NOW())
                ON CONFLICT (singleton_id) DO UPDATE
                SET schema_version = EXCLUDED.schema_version,
                    updated_at = NOW()
                """,
                (SCHEMA_VERSION,),
            )
        connection.commit()


def current_revision(cursor: psycopg.Cursor[Any]) -> int:
    cursor.execute(
        "SELECT revision FROM tv_tracker_meta WHERE singleton_id = 1"
    )
    row = cursor.fetchone()
    return int(row[0] if row else 0)


def tracker_health_status() -> dict[str, Any]:
    database_ok = False
    schema_version = 0

    try:
        with database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                database_ok = cursor.fetchone() == (1,)
                cursor.execute(
                    "SELECT schema_version FROM tv_tracker_schema_meta "
                    "WHERE singleton_id = 1"
                )
                row = cursor.fetchone()
                schema_version = int(row[0] if row else 0)
    except (psycopg.Error, RuntimeError, TypeError, ValueError):
        database_ok = False
        schema_version = 0

    return {
        "ok": database_ok and schema_version == SCHEMA_VERSION,
        "database": database_ok,
        "schemaVersion": schema_version,
    }


def read_tracker_data() -> tuple[dict[str, Any], int]:
    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            cursor.execute("SELECT show_id, data FROM tv_tracker_shows")
            shows = {str(row[0]): row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT entry_id, data FROM tv_tracker_history")
            history_map = {str(row[0]): row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT state_key, data FROM tv_tracker_state")
            state = {str(row[0]): row[1] for row in cursor.fetchall()}

            revision = current_revision(cursor)

    order = state.pop("history_order", [])
    history: list[Any] = []
    seen: set[str] = set()

    if isinstance(order, list):
        for raw_id in order:
            entry_id = str(raw_id)
            if entry_id in history_map and entry_id not in seen:
                history.append(history_map[entry_id])
                seen.add(entry_id)

    for entry_id, entry in history_map.items():
        if entry_id not in seen:
            history.append(entry)

    data: dict[str, Any] = {
        "shows": shows,
        "history": history,
        "profile": state.pop(
            "profile",
            {
                "username": "Username",
                "favorite_shows": [],
                "avatar_type": "initial",
                "avatar_preset": "silhouette-1",
                "avatar_data": "",
            },
        ),
    }
    data.update(state)
    return clean_legacy_metadata(data), revision


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


def read_admin_account(*, force: bool = False) -> dict[str, Any]:
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

    with database_connection() as connection:
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


def authenticated() -> bool:
    if session.get("authenticated") is not True:
        return False

    account = read_admin_account()
    stored_version = session.get("session_version")

    # Phase 3 sessions had no version. They may be upgraded only while the
    # migrated admin account is still at its initial version. After the first
    # username/password change, dormant pre-Phase-4 sessions must be rejected.
    if stored_version is None:
        if account["session_version"] != 1:
            return False
        session["session_version"] = 1
        return True

    try:
        return int(stored_version) == account["session_version"]
    except (TypeError, ValueError):
        return False


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not authenticated():
            if request.path.startswith("/api/"):
                session.clear()
                return jsonify({
                    "ok": False,
                    "error": "Authentication required",
                    "code": "session_expired",
                }), 401

            destination = safe_next_url(request.path)
            session.clear()
            session["post_login_path"] = destination
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def client_key() -> str:
    return request.remote_addr or "unknown"


def security_event_count(event_type: str, key: str, window_seconds: int) -> int:
    with database_connection() as connection:
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


def record_security_event(event_type: str, key: str) -> None:
    with database_connection() as connection:
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


def clear_security_events(event_type: str, key: str) -> None:
    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM tv_tracker_security_events
                WHERE event_type = %s AND client_key = %s
                """,
                (event_type, key),
            )
        connection.commit()


def login_is_limited(key: str) -> bool:
    return security_event_count(
        "login_failure", key, LOGIN_WINDOW_SECONDS
    ) >= LOGIN_MAX_ATTEMPTS


def record_login_failure(key: str) -> None:
    record_security_event("login_failure", key)


def clear_login_failures(key: str) -> None:
    clear_security_events("login_failure", key)


def account_change_is_limited(key: str) -> bool:
    return security_event_count(
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


def normalize_delta(
    shows_upsert: dict[str, Any],
    shows_delete: list[Any],
    history_upsert: dict[str, Any],
    history_delete: list[Any],
    history_order: list[Any] | None,
    state_upsert: dict[str, Any],
) -> dict[str, Any]:
    return {
        "showsUpsert": {str(key): value for key, value in shows_upsert.items()},
        "showsDelete": [str(item) for item in shows_delete],
        "historyUpsert": {str(key): value for key, value in history_upsert.items()},
        "historyDelete": [str(item) for item in history_delete],
        "historyOrder": (
            [str(item) for item in history_order]
            if history_order is not None
            else None
        ),
        "stateUpsert": {str(key): value for key, value in state_upsert.items()},
    }


def touched_entities(delta: dict[str, Any]) -> dict[str, set[str]]:
    return {
        "shows": set(map(str, (delta.get("showsUpsert") or {}).keys()))
        | set(map(str, delta.get("showsDelete") or [])),
        "history": set(map(str, (delta.get("historyUpsert") or {}).keys()))
        | set(map(str, delta.get("historyDelete") or [])),
        "state": set(map(str, (delta.get("stateUpsert") or {}).keys())),
    }


def deltas_conflict(incoming: dict[str, Any], previous: dict[str, Any]) -> bool:
    incoming_entities = touched_entities(incoming)
    previous_entities = touched_entities(previous)
    return any(
        incoming_entities[group] & previous_entities[group]
        for group in ("shows", "history", "state")
    )


def fetch_change_rows(
    cursor: psycopg.Cursor[Any],
    since_revision: int,
    limit: int | None = None,
) -> list[tuple[int, str, dict[str, Any]]]:
    if limit is None:
        cursor.execute(
            """
            SELECT revision, operation_id, delta
            FROM tv_tracker_changes
            WHERE revision > %s
            ORDER BY revision ASC
            """,
            (since_revision,),
        )
    else:
        cursor.execute(
            """
            SELECT revision, operation_id, delta
            FROM tv_tracker_changes
            WHERE revision > %s
            ORDER BY revision ASC
            LIMIT %s
            """,
            (since_revision, limit),
        )

    return [
        (int(row[0]), str(row[1]), row[2])
        for row in cursor.fetchall()
    ]


def serialize_change_rows(
    rows: list[tuple[int, str, dict[str, Any]]]
) -> list[dict[str, Any]]:
    return [
        {
            "revision": revision,
            "operationId": operation_id,
            "delta": delta,
        }
        for revision, operation_id, delta in rows
    ]


def change_log_has_gap(
    cursor: psycopg.Cursor[Any], since_revision: int, current: int
) -> bool:
    if since_revision >= current:
        return False

    cursor.execute("SELECT MIN(revision) FROM tv_tracker_changes")
    row = cursor.fetchone()
    oldest = int(row[0]) if row and row[0] is not None else None
    return oldest is None or oldest > since_revision + 1


def merge_history_order(
    cursor: psycopg.Cursor[Any],
    requested_order: list[Any] | None,
    history_upsert: dict[str, Any],
    history_delete: list[Any],
) -> list[str] | None:
    if requested_order is None:
        return None

    cursor.execute(
        "SELECT data FROM tv_tracker_state WHERE state_key = 'history_order'"
    )
    row = cursor.fetchone()
    current_order = row[0] if row and isinstance(row[0], list) else []
    deleted = {str(item) for item in history_delete}
    merged: list[str] = []
    seen: set[str] = set()

    def append_id(raw_id: Any) -> None:
        entry_id = str(raw_id)
        if entry_id in deleted or entry_id in seen:
            return
        seen.add(entry_id)
        merged.append(entry_id)

    for raw_id in requested_order:
        append_id(raw_id)
    for raw_id in current_order:
        append_id(raw_id)
    for raw_id in history_upsert:
        append_id(raw_id)

    return merged


class BackupValidationError(ValueError):
    pass


class SyncValidationError(BackupValidationError):
    pass


def json_clone(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, allow_nan=False))


def backup_int(
    value: Any,
    field: str,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    if isinstance(value, bool):
        raise BackupValidationError(f"{field} must be a number")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
        number = int(value.strip())
    else:
        raise BackupValidationError(f"{field} must be a number") from None
    if minimum is not None and number < minimum:
        raise BackupValidationError(f"{field} is outside the supported range")
    if maximum is not None and number > maximum:
        raise BackupValidationError(f"{field} is outside the supported range")
    return number


def validate_calendar_date(value: str, field: str) -> str:
    if not DATE_ONLY_RE.fullmatch(value):
        raise BackupValidationError(f"{field} must use YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise BackupValidationError(f"{field} is not a real calendar date") from None
    if parsed.isoformat() != value:
        raise BackupValidationError(f"{field} is not a real calendar date")
    return value


def validate_timestamp(value: str, field: str) -> str:
    if len(value) > 100:
        raise BackupValidationError(f"{field} is too long")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        datetime.fromisoformat(normalized)
    except ValueError:
        raise BackupValidationError(f"{field} is not a valid timestamp") from None
    return value


def validate_json_value(value: Any, field: str, *, depth: int = 0) -> None:
    if depth > MAX_JSON_DEPTH:
        raise BackupValidationError(f"{field} is nested too deeply")
    if value is None or isinstance(value, (str, bool, int)):
        if isinstance(value, str):
            if len(value) > MAX_JSON_STRING_CHARS:
                raise BackupValidationError(f"{field} contains an oversized string")
            if DATE_ONLY_RE.fullmatch(value):
                validate_calendar_date(value, field)
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise BackupValidationError(f"{field} contains an invalid number")
        return
    if isinstance(value, list):
        if len(value) > MAX_JSON_CONTAINER_ITEMS:
            raise BackupValidationError(f"{field} contains too many items")
        for index, item in enumerate(value):
            validate_json_value(item, f"{field}[{index}]", depth=depth + 1)
        return
    if isinstance(value, dict):
        if len(value) > MAX_JSON_CONTAINER_ITEMS:
            raise BackupValidationError(f"{field} contains too many fields")
        for raw_key, item in value.items():
            if not isinstance(raw_key, str) or not raw_key or len(raw_key) > 160:
                raise BackupValidationError(f"{field} contains an invalid field name")
            validate_json_value(item, f"{field}.{raw_key}", depth=depth + 1)
        return
    raise BackupValidationError(f"{field} contains an unsupported value")


def normalized_identifier(value: Any, field: str, *, maximum: int = MAX_IDENTIFIER_CHARS) -> str:
    if isinstance(value, (dict, list, bool)):
        raise BackupValidationError(f"{field} is invalid")
    identifier = str(value or "").strip()
    if not identifier or len(identifier) > maximum:
        raise BackupValidationError(f"{field} is invalid")
    return identifier


def generated_history_id(entry: dict[str, Any], index: int) -> str:
    signature = "|".join([
        str(entry.get("tmdb_id") or entry.get("show_id") or ""),
        str(entry.get("season") or 0),
        str(entry.get("episode") or 0),
        str(entry.get("watched_at") or entry.get("date") or ""),
        str(index),
    ])
    digest = hashlib.sha256(signature.encode("utf-8")).hexdigest()[:28]
    return f"legacy-{digest}"


def legacy_metadata_marker() -> str:
    return "tv" + "maze"


def is_legacy_metadata_key(key: Any) -> bool:
    name = str(key or "").lower()
    marker = legacy_metadata_marker()
    return (
        marker in name
        or name in {
            "air_time", "air_timestamp", "airtime", "airstamp",
            "metadata_source", "artwork_source", "provider",
            "_artwork_tmdb_id", "date_only_episode_time_override",
        }
    )


def clean_legacy_metadata(value: Any) -> Any:
    if isinstance(value, list):
        return [clean_legacy_metadata(item) for item in value]
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for raw_key, raw_item in value.items():
            if is_legacy_metadata_key(raw_key):
                continue
            cleaned[str(raw_key)] = clean_legacy_metadata(raw_item)
        return cleaned
    return value


def cleanup_stored_tracker_data() -> None:
    try:
        with database_connection() as connection:
            changed = False
            with connection.cursor() as cursor:
                cursor.execute("SELECT show_id, data FROM tv_tracker_shows")
                for show_id, raw_data in cursor.fetchall():
                    cleaned = clean_legacy_metadata(raw_data)
                    if cleaned != raw_data:
                        cursor.execute(
                            "UPDATE tv_tracker_shows SET data = %s, updated_at = NOW() WHERE show_id = %s",
                            (Jsonb(cleaned), show_id),
                        )
                        changed = True
                cursor.execute("SELECT state_key, data FROM tv_tracker_state")
                for state_key, raw_data in cursor.fetchall():
                    if state_key == "history_order":
                        continue
                    cleaned = clean_legacy_metadata(raw_data)
                    if cleaned != raw_data:
                        cursor.execute(
                            "UPDATE tv_tracker_state SET data = %s, updated_at = NOW() WHERE state_key = %s",
                            (Jsonb(cleaned), state_key),
                        )
                        changed = True
            if changed:
                connection.commit()
    except Exception:
        # Cleanup must never prevent the site from starting.
        return


def validate_show_record(show_id: str, raw_show: Any) -> dict[str, Any]:
    show_id = normalized_identifier(show_id, "Show identifier", maximum=160)
    if not isinstance(raw_show, dict):
        raise BackupValidationError(f"Show {show_id} is malformed")

    validate_json_value(raw_show, f"Show {show_id}")
    show = clean_legacy_metadata(json_clone(raw_show))
    title = show.get("title")
    if not isinstance(title, str) or not title.strip() or len(title) > 500:
        raise BackupValidationError(f"Show {show_id} has an invalid title")
    show["title"] = title.strip()

    tmdb_id = show.get("tmdb_id", show_id)
    show["tmdb_id"] = normalized_identifier(
        tmdb_id, f"Show {show_id} TMDB identifier", maximum=160
    )

    if "status" in show:
        supported_statuses = {
            "watching", "paused", "finished", "completed", "plan", "dropped"
        }
        if not isinstance(show.get("status"), str) or show["status"] not in supported_statuses:
            raise BackupValidationError(f"Show {show_id} has an unsupported status")

    show.pop("date_only_episode_time_override", None)

    watched = show.get("episodes_watched", {})
    if watched is None:
        watched = {}
    if not isinstance(watched, dict) or len(watched) > 10000:
        raise BackupValidationError(f"Show {show_id} has invalid watched episodes")
    normalized_watched: dict[str, list[int]] = {}
    for season_key, episode_values in watched.items():
        season = backup_int(
            season_key, f"Show {show_id} season", minimum=0, maximum=10000
        )
        if not isinstance(episode_values, list) or len(episode_values) > 100000:
            raise BackupValidationError(
                f"Show {show_id}, season {season_key} has invalid watched episodes"
            )
        episodes: list[int] = []
        for episode_value in episode_values:
            episode = backup_int(
                episode_value,
                f"Show {show_id}, season {season_key} episode",
                minimum=0,
                maximum=100000,
            )
            if episode not in episodes:
                episodes.append(episode)
        normalized_watched[str(season)] = episodes
    show["episodes_watched"] = normalized_watched

    for object_field in ("season_details", "seasons", "episode_details"):
        if object_field in show and show[object_field] is not None:
            if not isinstance(show[object_field], dict):
                raise BackupValidationError(
                    f"Show {show_id} has invalid {object_field.replace('_', ' ')}"
                )

    return show


def validate_history_record(
    raw_entry: Any,
    index: int,
    seen_ids: set[str],
    *,
    expected_id: str | None = None,
) -> tuple[str, dict[str, Any]]:
    if not isinstance(raw_entry, dict):
        raise BackupValidationError(f"History entry {index + 1} is malformed")

    validate_json_value(raw_entry, f"History entry {index + 1}")
    entry = clean_legacy_metadata(json_clone(raw_entry))
    show_id = entry.get("tmdb_id", entry.get("show_id"))
    entry["tmdb_id"] = normalized_identifier(
        show_id, f"History entry {index + 1} show identifier", maximum=160
    )
    entry["season"] = backup_int(
        entry.get("season"),
        f"History entry {index + 1} season",
        minimum=0,
        maximum=10000,
    )
    entry["episode"] = backup_int(
        entry.get("episode"),
        f"History entry {index + 1} episode",
        minimum=0,
        maximum=100000,
    )

    for text_field in ("title", "episode_name"):
        if text_field in entry and entry[text_field] is not None:
            if not isinstance(entry[text_field], str) or len(entry[text_field]) > 500:
                raise BackupValidationError(
                    f"History entry {index + 1} has invalid {text_field}"
                )
    if entry.get("date") is not None:
        if not isinstance(entry["date"], str):
            raise BackupValidationError(f"History entry {index + 1} has invalid date")
        validate_calendar_date(entry["date"], f"History entry {index + 1} date")
    if entry.get("watched_at") is not None:
        if not isinstance(entry["watched_at"], str):
            raise BackupValidationError(
                f"History entry {index + 1} has invalid watched_at"
            )
        validate_timestamp(
            entry["watched_at"], f"History entry {index + 1} watched_at"
        )
    if "special" in entry and not isinstance(entry["special"], bool):
        raise BackupValidationError(f"History entry {index + 1} has invalid special flag")

    explicit_id = str(entry.get("id") or "").strip()
    entry_id = expected_id or explicit_id or generated_history_id(entry, index)
    entry_id = normalized_identifier(
        entry_id, f"History entry {index + 1} ID", maximum=240
    )
    if expected_id and explicit_id and explicit_id != expected_id:
        raise BackupValidationError(
            f"History entry {index + 1} ID does not match its update key"
        )
    if entry_id in seen_ids:
        raise BackupValidationError(f"Duplicate History ID: {entry_id}")
    seen_ids.add(entry_id)
    entry["id"] = entry_id
    return entry_id, entry


def history_episode_identity(entry: dict[str, Any]) -> tuple[str, int, int] | None:
    try:
        return (
            str(entry.get("tmdb_id", "")),
            int(entry.get("season")),
            int(entry.get("episode")),
        )
    except (TypeError, ValueError):
        return None


def history_timestamp_value(entry: dict[str, Any]) -> float:
    value = entry.get("watched_at") or entry.get("date") or ""
    if not isinstance(value, str) or not value:
        return 0.0
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).timestamp()
    except ValueError:
        return 0.0


def dedupe_history_by_episode(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_episode: dict[tuple[str, int, int], dict[str, Any]] = {}
    passthrough: list[dict[str, Any]] = []

    for entry in history:
        identity = history_episode_identity(entry)
        if identity is None or not identity[0]:
            passthrough.append(entry)
            continue

        previous = by_episode.get(identity)
        if previous is None or history_timestamp_value(entry) >= history_timestamp_value(previous):
            by_episode[identity] = entry

    deduped = passthrough + list(by_episode.values())
    deduped.sort(key=history_timestamp_value, reverse=True)
    return deduped


def find_logical_duplicate_history_ids(
    cursor: psycopg.Cursor[Any],
    entry_id: str,
    entry: dict[str, Any],
) -> list[str]:
    identity = history_episode_identity(entry)
    if identity is None or not identity[0]:
        return []

    show_id, season, episode = identity
    cursor.execute(
        """
        SELECT entry_id
        FROM tv_tracker_history
        WHERE entry_id <> %s
          AND data->>'tmdb_id' = %s
          AND data->>'season' = %s
          AND data->>'episode' = %s
        """,
        (str(entry_id), show_id, str(season), str(episode)),
    )
    return [str(row[0]) for row in cursor.fetchall()]


def validate_profile_record(raw_profile: Any) -> dict[str, Any]:
    if not isinstance(raw_profile, dict):
        raise BackupValidationError("Profile data is invalid")
    validate_json_value(raw_profile, "Profile")
    profile = json_clone(raw_profile)
    profile.pop("date_only_episode_time", None)

    allowed_fields = {
        "username", "favorite_shows", "avatar_type", "avatar_preset",
        "avatar_data", "header_type", "header_preset", "header_image",
    }
    unknown = set(profile) - allowed_fields
    if unknown:
        raise BackupValidationError("Profile contains unsupported fields")

    favorites = profile.get("favorite_shows", []) or []
    if not isinstance(favorites, list) or len(favorites) > 8:
        raise BackupValidationError("Profile favorites data is invalid")
    normalized_favorites: list[str] = []
    for favorite in favorites:
        favorite_id = normalized_identifier(
            favorite, "Profile favorite show identifier", maximum=160
        )
        if favorite_id not in normalized_favorites:
            normalized_favorites.append(favorite_id)
    profile["favorite_shows"] = normalized_favorites

    limits = {
        "username": 160,
        "avatar_type": 40,
        "avatar_preset": 120,
        "avatar_data": MAX_JSON_STRING_CHARS,
        "header_type": 40,
        "header_preset": 120,
        "header_image": MAX_JSON_STRING_CHARS,
    }
    for field, limit in limits.items():
        if field in profile and profile[field] is not None:
            if not isinstance(profile[field], str) or len(profile[field]) > limit:
                raise BackupValidationError(f"Profile field {field} is invalid")
    return profile


def validate_sync_metadata_state(key: str, raw_value: Any) -> dict[str, Any]:
    if not isinstance(raw_value, dict):
        raise BackupValidationError(f"State {key} must be an object")
    validate_json_value(raw_value, f"State {key}")
    value = json_clone(raw_value)
    allowed = {
        "pending", "failed", "total", "completed", "paused", "active",
        "current", "lastRun", "lastError", "startedAt", "completedAt",
    }
    if set(value) - allowed:
        raise BackupValidationError(f"State {key} contains unsupported fields")
    pending = value.get("pending", []) or []
    if not isinstance(pending, list) or len(pending) > 10000:
        raise BackupValidationError(f"State {key}.pending is invalid")
    value["pending"] = [
        normalized_identifier(item, f"State {key}.pending item", maximum=160)
        for item in pending
    ]

    failed = value.get("failed", []) or []
    if not isinstance(failed, list) or len(failed) > 10000:
        raise BackupValidationError(f"State {key}.failed is invalid")
    normalized_failed: list[dict[str, str]] = []
    for index, item in enumerate(failed):
        # Older synchronization state stored failed show identifiers as scalars.
        # Accept and normalize those records so a strict validation rollout does
        # not make an otherwise recoverable legacy backup impossible to import.
        if not isinstance(item, dict):
            normalized_failed.append({
                "showId": normalized_identifier(
                    item, f"State {key}.failed item {index + 1}", maximum=160
                ),
                "title": "",
                "error": "",
            })
            continue
        if set(item) - {"showId", "id", "title", "error"}:
            raise BackupValidationError(f"State {key}.failed item {index + 1} is invalid")
        show_id = normalized_identifier(
            item.get("showId", item.get("id")),
            f"State {key}.failed show ID",
            maximum=160,
        )
        title = item.get("title", "")
        error_text = item.get("error", "")
        if not isinstance(title, str) or len(title) > 500:
            raise BackupValidationError(f"State {key}.failed title is invalid")
        if not isinstance(error_text, str) or len(error_text) > 2000:
            raise BackupValidationError(f"State {key}.failed error is invalid")
        normalized_failed.append({
            "showId": show_id,
            "title": title,
            "error": error_text,
        })
    value["failed"] = normalized_failed
    for field in ("total", "completed"):
        if field in value:
            value[field] = backup_int(
                value[field], f"State {key}.{field}", minimum=0, maximum=10000000
            )
    for field in ("paused", "active"):
        if field in value and not isinstance(value[field], bool):
            raise BackupValidationError(f"State {key}.{field} is invalid")
    for field in ("current", "lastRun", "lastError", "startedAt", "completedAt"):
        if field in value:
            if not isinstance(value[field], str) or len(value[field]) > 2000:
                raise BackupValidationError(f"State {key}.{field} is invalid")
    return value


def validate_import_info_state(raw_value: Any) -> dict[str, Any]:
    """Accept app-owned compatible-import metadata in native backups.

    Older exports may include a top-level `import_info` state object that records
    where imported data originally came from. This is not episode/date authority
    data and must not block an exact native backup restore.
    """
    if raw_value is None:
        return {}
    if not isinstance(raw_value, dict) or len(raw_value) > 200:
        raise BackupValidationError("State import_info is invalid")
    validate_json_value(raw_value, "State import_info")
    return json_clone(raw_value)


def validate_state_record(key: Any, raw_value: Any) -> tuple[str, Any]:
    state_key = normalized_identifier(key, "State key", maximum=80)
    if not STATE_KEY_RE.fullmatch(state_key) or state_key not in ALLOWED_STATE_KEYS:
        raise BackupValidationError(f"Unsupported state key: {state_key}")
    if state_key == "profile":
        return state_key, validate_profile_record(raw_value)
    if state_key == "import_info":
        return state_key, validate_import_info_state(raw_value)
    return state_key, validate_sync_metadata_state(state_key, raw_value)


def validate_tracker_data(raw_data: Any) -> dict[str, Any]:
    if not isinstance(raw_data, dict):
        raise BackupValidationError("Tracker data is invalid")
    allowed_top_level = {"shows", "history", "profile", *ALLOWED_STATE_KEYS}
    unknown = set(raw_data) - allowed_top_level
    if unknown:
        raise BackupValidationError("Tracker data contains unsupported state keys")

    raw_shows = raw_data.get("shows")
    raw_history = raw_data.get("history", [])
    if not isinstance(raw_shows, dict) or len(raw_shows) > 10000:
        raise BackupValidationError("Tracker shows data is invalid")
    if not isinstance(raw_history, list) or len(raw_history) > 500000:
        raise BackupValidationError("Tracker History data is invalid")

    shows: dict[str, Any] = {}
    for raw_show_id, raw_show in raw_shows.items():
        show_id = normalized_identifier(raw_show_id, "Show identifier", maximum=160)
        shows[show_id] = validate_show_record(show_id, raw_show)

    history: list[dict[str, Any]] = []
    seen_history_ids: set[str] = set()
    for index, raw_entry in enumerate(raw_history):
        _, entry = validate_history_record(raw_entry, index, seen_history_ids)
        history.append(entry)

    history = dedupe_history_by_episode(history)

    result: dict[str, Any] = {
        "shows": shows,
        "history": history,
        "profile": validate_profile_record(raw_data.get("profile", {})),
    }
    for state_key in ("metadata_sync", "network_sync", "import_info"):
        if state_key in raw_data:
            _, state_value = validate_state_record(state_key, raw_data[state_key])
            result[state_key] = state_value
    return result


def validate_and_normalize_backup(backup: Any) -> tuple[dict[str, Any], dict[str, int]]:
    if not isinstance(backup, dict):
        raise BackupValidationError("Invalid app backup file")
    if backup.get("app") != APP_NAME or backup.get("backupType") != "native-app-backup":
        raise BackupValidationError("This is not a TV Tracker app backup")

    version = backup_int(backup.get("backupVersion", 1), "Backup version", minimum=1)
    if version not in SUPPORTED_BACKUP_VERSIONS:
        raise BackupValidationError("This backup version is not supported")
    schema_version = backup_int(
        backup.get("schemaVersion", 1), "Schema version", minimum=1
    )
    if schema_version > SCHEMA_VERSION:
        raise BackupValidationError("This backup was created by a newer TV Tracker version")

    data = validate_tracker_data(clean_legacy_metadata(backup.get("data")))
    summary = {
        "shows": len(data["shows"]),
        "historyEntries": len(data["history"]),
        "favorites": len(data["profile"].get("favorite_shows") or []),
        "backupVersion": version,
        "schemaVersion": schema_version,
    }
    return data, summary


def validate_identifier_list(
    raw_values: Any,
    field: str,
    *,
    maximum_items: int,
    maximum_chars: int,
) -> list[str]:
    if not isinstance(raw_values, list) or len(raw_values) > maximum_items:
        raise SyncValidationError(f"{field} is invalid")
    result: list[str] = []
    for raw_value in raw_values:
        identifier = normalized_identifier(raw_value, field, maximum=maximum_chars)
        if identifier not in result:
            result.append(identifier)
    return result


def validate_sync_delta_payload(payload: dict[str, Any]) -> tuple[
    dict[str, Any], list[str], dict[str, Any], list[str], list[str] | None, dict[str, Any]
]:
    shows_upsert_raw = payload.get("showsUpsert", {})
    shows_delete_raw = payload.get("showsDelete", [])
    history_upsert_raw = payload.get("historyUpsert", {})
    history_delete_raw = payload.get("historyDelete", [])
    history_order_raw = payload.get("historyOrder")
    state_upsert_raw = payload.get("stateUpsert", {})

    if not isinstance(shows_upsert_raw, dict) or len(shows_upsert_raw) > MAX_SHOWS_PER_SYNC:
        raise SyncValidationError("Invalid shows update")
    if not isinstance(history_upsert_raw, dict) or len(history_upsert_raw) > MAX_HISTORY_PER_SYNC:
        raise SyncValidationError("Invalid history update")
    if not isinstance(state_upsert_raw, dict) or len(state_upsert_raw) > len(ALLOWED_STATE_KEYS):
        raise SyncValidationError("Invalid state update")

    shows_upsert: dict[str, Any] = {}
    for raw_show_id, raw_show in shows_upsert_raw.items():
        show_id = normalized_identifier(raw_show_id, "Show identifier", maximum=160)
        shows_upsert[show_id] = validate_show_record(show_id, raw_show)

    shows_delete = validate_identifier_list(
        shows_delete_raw,
        "Shows delete list",
        maximum_items=MAX_DELETES_PER_SYNC,
        maximum_chars=160,
    )

    history_upsert: dict[str, Any] = {}
    seen_history_ids: set[str] = set()
    for index, (raw_entry_id, raw_entry) in enumerate(history_upsert_raw.items()):
        entry_id = normalized_identifier(
            raw_entry_id, "History update identifier", maximum=240
        )
        _, entry = validate_history_record(
            raw_entry, index, seen_history_ids, expected_id=entry_id
        )
        history_upsert[entry_id] = entry

    history_delete = validate_identifier_list(
        history_delete_raw,
        "History delete list",
        maximum_items=MAX_DELETES_PER_SYNC,
        maximum_chars=240,
    )

    history_order = None
    if history_order_raw is not None:
        history_order = validate_identifier_list(
            history_order_raw,
            "History order",
            maximum_items=MAX_HISTORY_ORDER,
            maximum_chars=240,
        )

    state_upsert: dict[str, Any] = {}
    for raw_key, raw_value in state_upsert_raw.items():
        key, value = validate_state_record(raw_key, raw_value)
        state_upsert[key] = value

    if set(shows_upsert) & set(shows_delete):
        raise SyncValidationError("A show cannot be updated and deleted together")
    if set(history_upsert) & set(history_delete):
        raise SyncValidationError("A History entry cannot be updated and deleted together")

    return (
        shows_upsert,
        shows_delete,
        history_upsert,
        history_delete,
        history_order,
        state_upsert,
    )

def replace_tracker_data_transactionally(data: dict[str, Any]) -> int:
    data = clean_legacy_metadata(data)
    shows = data.get("shows") or {}
    history = data.get("history") or []
    state = {
        str(key): value
        for key, value in data.items()
        if key not in {"shows", "history", "history_order"}
    }
    history_order = [str(entry["id"]) for entry in history]

    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT revision FROM tv_tracker_meta "
                "WHERE singleton_id = 1 FOR UPDATE"
            )
            row = cursor.fetchone()
            revision = int(row[0] if row else 0) + 1

            cursor.execute("DELETE FROM tv_tracker_changes")
            cursor.execute("DELETE FROM tv_tracker_shows")
            cursor.execute("DELETE FROM tv_tracker_history")
            cursor.execute("DELETE FROM tv_tracker_state")

            if shows:
                cursor.executemany(
                    """
                    INSERT INTO tv_tracker_shows (show_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    [
                        (str(show_id), Jsonb(show_data))
                        for show_id, show_data in shows.items()
                    ],
                )

            if history:
                cursor.executemany(
                    """
                    INSERT INTO tv_tracker_history (entry_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    [
                        (str(entry["id"]), Jsonb(entry))
                        for entry in history
                    ],
                )

            if state:
                cursor.executemany(
                    """
                    INSERT INTO tv_tracker_state (state_key, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    [
                        (state_key, Jsonb(state_data))
                        for state_key, state_data in state.items()
                    ],
                )

            cursor.execute(
                """
                INSERT INTO tv_tracker_state (state_key, data, updated_at)
                VALUES ('history_order', %s, NOW())
                """,
                (Jsonb(history_order),),
            )
            cursor.execute(
                """
                UPDATE tv_tracker_meta
                SET revision = %s, updated_at = NOW()
                WHERE singleton_id = 1
                """,
                (revision,),
            )
        connection.commit()

    return revision


def safe_next_url(value: str | None) -> str:
    """Return a validated internal application route for post-login use."""
    candidate = str(value or "").strip().split("?", 1)[0].split("#", 1)[0]
    if candidate.startswith("/app/") and candidate != "/app/":
        candidate = candidate.rstrip("/")

    if candidate in {"/app", "/app/"}:
        return "/app/watchlist"
    if candidate in APP_SECTION_PATHS:
        return candidate
    if APP_SHOW_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_EPISODE_PATH_RE.fullmatch(candidate):
        return candidate
    return "/app/watchlist"


def valid_app_path(value: str | None) -> bool:
    candidate = str(value or "").strip()
    return (
        candidate in APP_SECTION_PATHS
        or APP_SHOW_PATH_RE.fullmatch(candidate) is not None
        or APP_EPISODE_PATH_RE.fullmatch(candidate) is not None
    )


def render_page_error(status_code: int):
    message_code = 404 if status_code == 404 else 500
    error_title, error_text = ERROR_PAGE_MESSAGES[message_code]
    signed_in = session.get("authenticated") is True
    return render_template(
        "error.html",
        status_code=status_code,
        error_title=error_title,
        error_text=error_text,
        action_url="/app/watchlist" if signed_in else url_for("login"),
        action_label="Back to app" if signed_in else "Back to sign in",
    ), status_code


def create_app() -> Flask:
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.config.update(
        SECRET_KEY=required_env("SECRET_KEY"),
        MAX_CONTENT_LENGTH=MAX_BODY_BYTES,
        SESSION_COOKIE_NAME="tv_tracker_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_SAMESITE="Lax",
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    )

    ensure_schema()
    cleanup_stored_tracker_data()

    @app.before_request
    def establish_csrf() -> None:
        if "csrf_token" not in session:
            session["csrf_token"] = os.urandom(32).hex()

    @app.after_request
    def security_headers(response: Response) -> Response:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        response.headers["Content-Security-Policy"] = "; ".join(
            [
                "default-src 'self'",
                "script-src 'self' https://cdn.jsdelivr.net",
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
                "img-src 'self' data: blob: https://image.tmdb.org",
                "font-src 'self' data:",
                "connect-src 'self'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
                "upgrade-insecure-requests",
            ]
        )
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        if (
            request.path.startswith("/api/")
            or request.path.startswith("/app")
            or request.path in {"/", "/login", "/signup"}
        ):
            response.headers["Cache-Control"] = "no-store"
        elif request.path.startswith("/static/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"

        accepts_gzip = "gzip" in request.headers.get("Accept-Encoding", "").lower()
        compressible = response.mimetype in {
            "application/json",
            "text/css",
            "text/html",
            "text/javascript",
            "application/javascript",
            "image/svg+xml",
        }

        if (
            accepts_gzip
            and compressible
            and response.status_code == 200
            and not response.headers.get("Content-Encoding")
            and not response.direct_passthrough
        ):
            body = response.get_data()

            if len(body) >= 2048:
                compressed = gzip.compress(body, compresslevel=4)

                if len(compressed) < len(body):
                    response.set_data(compressed)
                    response.headers["Content-Encoding"] = "gzip"
                    response.headers["Content-Length"] = str(len(compressed))
                    response.headers.add("Vary", "Accept-Encoding")

        return response

    @app.get("/login")
    def login():
        if authenticated():
            destination = safe_next_url(session.pop("post_login_path", None))
            return redirect(destination)

        notice = ""
        if session.pop("account_changed_notice", False):
            notice = "Admin account updated. Sign in again."

        initial_tab = session.pop("auth_tab", "login")
        if initial_tab not in {"login", "signup"}:
            initial_tab = "login"

        return render_template(
            "login.html",
            csrf_token=session["csrf_token"],
            error="",
            notice=notice,
            initial_tab=initial_tab,
        )

    @app.get("/signup")
    def signup():
        if authenticated():
            return redirect("/app/watchlist")
        session["auth_tab"] = "signup"
        return redirect(url_for("login"))

    @app.post("/login")
    def login_post():
        check_csrf()
        key = client_key()

        if login_is_limited(key):
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Too many failed attempts. Try again later.",
                notice="",
                initial_tab="login",
            ), 429

        username = str(request.form.get("username", ""))
        password = str(request.form.get("password", ""))
        account = read_admin_account()
        valid_username = username == str(account["username"])
        valid_password = False

        try:
            valid_password = PASSWORD_HASHER.verify(
                account["password_hash"], password
            )
        except (VerifyMismatchError, InvalidHashError):
            valid_password = False

        if not (valid_username and valid_password):
            record_login_failure(key)
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Invalid username or password.",
                notice="",
                initial_tab="login",
            ), 401

        clear_login_failures(key)
        destination = safe_next_url(session.get("post_login_path"))
        session.clear()
        session["authenticated"] = True
        session["session_version"] = account["session_version"]
        session["csrf_token"] = os.urandom(32).hex()
        session.permanent = True
        return redirect(destination)

    @app.post("/logout")
    @login_required
    def logout():
        check_csrf()
        session.clear()
        return redirect(url_for("login"))

    @app.get("/")
    def root():
        if authenticated():
            return redirect("/app/watchlist")
        return redirect(url_for("login"))

    @app.get("/app")
    @app.get("/app/")
    @login_required
    def app_root():
        return redirect("/app/watchlist")

    def render_app_shell(initial_app_path: str):
        return render_template(
            "index.html",
            csrf_token=session["csrf_token"],
            initial_app_path=initial_app_path,
        )

    @app.get("/app/watchlist", strict_slashes=False)
    @app.get("/app/upcoming", strict_slashes=False)
    @app.get("/app/history", strict_slashes=False)
    @app.get("/app/discover", strict_slashes=False)
    @app.get("/app/profile", strict_slashes=False)
    @app.get("/app/settings", strict_slashes=False)
    @login_required
    def app_section_page():
        requested_path = request.path.rstrip("/")
        if requested_path not in APP_SECTION_PATHS:
            abort(404)
        if request.path != requested_path:
            return redirect(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/show/<int:tmdb_id>", strict_slashes=False)
    @login_required
    def app_show_page(tmdb_id: int):
        requested_path = request.path.rstrip("/")
        if tmdb_id <= 0 or APP_SHOW_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect(requested_path)
        return render_app_shell(requested_path)

    @app.get(
        "/app/show/<int:tmdb_id>/season/<int:season_number>/episode/<int:episode_number>",
        strict_slashes=False,
    )
    @login_required
    def app_episode_page(
        tmdb_id: int,
        season_number: int,
        episode_number: int,
    ):
        requested_path = request.path.rstrip("/")
        if (
            tmdb_id <= 0
            or season_number < 0
            or episode_number <= 0
            or APP_EPISODE_PATH_RE.fullmatch(requested_path) is None
        ):
            abort(404)
        if request.path != requested_path:
            return redirect(requested_path)
        return render_app_shell(requested_path)

    @app.get("/robots.txt")
    def robots():
        return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")

    @app.get("/healthz")
    def healthz():
        status = tracker_health_status()
        return jsonify({"ok": status["ok"]}), 200 if status["ok"] else 503

    @app.get("/api/health")
    @login_required
    def health():
        status = tracker_health_status()
        response = jsonify({
            "ok": status["ok"],
            "app": APP_NAME,
            "database": status["database"],
            "schemaVersion": status["schemaVersion"],
        })
        return (response, 200 if status["ok"] else 503)

    @app.get("/api/admin/account")
    @login_required
    def get_admin_account():
        account = read_admin_account()
        return jsonify({
            "ok": True,
            "username": account["username"],
        })

    @app.post("/api/admin/account")
    @login_required
    def update_admin_account():
        check_csrf()
        key = client_key()

        if account_change_is_limited(key):
            return jsonify({
                "ok": False,
                "error": "Too many account-change attempts. Try again later.",
                "code": "account_rate_limited",
            }), 429

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({
                "ok": False,
                "error": "Invalid account request",
                "code": "invalid_account_request",
            }), 400

        record_security_event("account_change_attempt", key)
        current_password = str(payload.get("currentPassword") or "")
        requested_username = str(payload.get("username") or "").strip()
        new_password = str(payload.get("newPassword") or "")
        confirm_password = str(payload.get("confirmPassword") or "")
        account = read_admin_account()

        if not current_password:
            return jsonify({
                "ok": False,
                "error": "Enter your current password",
                "code": "current_password_required",
            }), 400

        try:
            valid_current_password = PASSWORD_HASHER.verify(
                account["password_hash"], current_password
            )
        except (VerifyMismatchError, InvalidHashError):
            valid_current_password = False

        if not valid_current_password:
            return jsonify({
                "ok": False,
                "error": "Current password is incorrect",
                "code": "invalid_current_password",
            }), 400

        if not requested_username:
            return jsonify({
                "ok": False,
                "error": "Admin username cannot be blank",
                "code": "invalid_username",
            }), 400
        if len(requested_username) > 80:
            return jsonify({
                "ok": False,
                "error": "Admin username is too long",
                "code": "invalid_username",
            }), 400

        changing_password = bool(new_password or confirm_password)
        if changing_password:
            if new_password != confirm_password:
                return jsonify({
                    "ok": False,
                    "error": "New passwords do not match",
                    "code": "password_mismatch",
                }), 400
            if len(new_password) < 8:
                return jsonify({
                    "ok": False,
                    "error": "New password must contain at least 8 characters",
                    "code": "password_too_short",
                }), 400

        username_changed = requested_username != str(account["username"])
        password_changed = changing_password

        if not username_changed and not password_changed:
            return jsonify({
                "ok": False,
                "error": "No account changes were entered",
                "code": "no_account_changes",
            }), 400

        next_password_hash = (
            PASSWORD_HASHER.hash(new_password)
            if password_changed
            else account["password_hash"]
        )

        with database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE tv_tracker_admin
                    SET username = %s,
                        password_hash = %s,
                        session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE singleton_id = 1
                    RETURNING session_version
                    """,
                    (requested_username, next_password_hash),
                )
                row = cursor.fetchone()
            connection.commit()

        if row is None:
            return jsonify({
                "ok": False,
                "error": "Admin account could not be updated",
                "code": "account_update_failed",
            }), 500

        invalidate_admin_account_cache()
        session.clear()
        session["account_changed_notice"] = True
        return jsonify({
            "ok": True,
            "reauthenticate": True,
        })

    @app.get("/api/state")
    @login_required
    def get_state():
        data, revision = read_tracker_data()
        return jsonify({"ok": True, "revision": revision, "data": data})

    @app.get("/api/revision")
    @login_required
    def get_revision():
        if sync_request_is_limited(client_key()):
            return jsonify({
                "ok": False,
                "error": "Too many sync requests",
                "code": "sync_rate_limited",
            }), 429

        with database_connection() as connection:
            with connection.cursor() as cursor:
                revision = current_revision(cursor)

        return jsonify({"ok": True, "revision": revision})

    @app.get("/api/changes")
    @login_required
    def get_changes():
        if sync_request_is_limited(client_key()):
            return jsonify({
                "ok": False,
                "error": "Too many sync requests",
                "code": "sync_rate_limited",
            }), 429

        try:
            since_revision = int(request.args.get("since", "0"))
        except (TypeError, ValueError):
            return jsonify({
                "ok": False,
                "error": "Invalid revision",
                "code": "invalid_revision",
            }), 400

        raw_limit = request.args.get("limit")
        if raw_limit is None:
            change_limit: int | None = None
        else:
            try:
                change_limit = int(raw_limit)
            except (TypeError, ValueError):
                return jsonify({
                    "ok": False,
                    "error": "Invalid change limit",
                    "code": "invalid_change_limit",
                }), 400

            if change_limit < 1 or change_limit > 50:
                return jsonify({
                    "ok": False,
                    "error": "Invalid change limit",
                    "code": "invalid_change_limit",
                }), 400

        if since_revision < 0:
            return jsonify({
                "ok": False,
                "error": "Invalid revision",
                "code": "invalid_revision",
            }), 400

        with database_connection() as connection:
            with connection.cursor() as cursor:
                revision = current_revision(cursor)

                if since_revision > revision:
                    return jsonify({
                        "ok": False,
                        "error": "Client revision is newer than the server",
                        "revision": revision,
                        "reset": True,
                    }), 409

                if change_log_has_gap(cursor, since_revision, revision):
                    needs_reset = True
                    rows: list[tuple[int, str, dict[str, Any]]] = []
                else:
                    needs_reset = False
                    rows = fetch_change_rows(
                        cursor, since_revision, change_limit
                    )

        if needs_reset:
            data, revision = read_tracker_data()
            return jsonify({
                "ok": True,
                "revision": revision,
                "serverRevision": revision,
                "throughRevision": revision,
                "hasMore": False,
                "reset": True,
                "data": data,
                "changes": [],
            })

        through_revision = rows[-1][0] if rows else since_revision

        return jsonify({
            "ok": True,
            "revision": revision,
            "serverRevision": revision,
            "throughRevision": through_revision,
            "hasMore": through_revision < revision,
            "reset": False,
            "changes": serialize_change_rows(rows),
        })

    @app.patch("/api/state")
    @login_required
    def patch_state():
        check_csrf()
        payload = request.get_json(silent=True)

        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Invalid JSON body"}), 400

        operation_id = str(payload.get("operationId") or "")

        try:
            base_revision = int(payload.get("baseRevision"))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Invalid base revision"}), 400

        if base_revision < 0:
            return jsonify({"ok": False, "error": "Invalid base revision"}), 400
        if not OPERATION_ID_RE.fullmatch(operation_id):
            return jsonify({"ok": False, "error": "Invalid operation ID"}), 400

        try:
            (
                shows_upsert,
                shows_delete,
                history_upsert,
                history_delete,
                history_order,
                state_upsert,
            ) = validate_sync_delta_payload(payload)
        except BackupValidationError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
                "code": "invalid_sync_record",
            }), 400

        incoming_delta = normalize_delta(
            shows_upsert,
            shows_delete,
            history_upsert,
            history_delete,
            history_order,
            state_upsert,
        )

        with database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT revision FROM tv_tracker_meta "
                    "WHERE singleton_id = 1 FOR UPDATE"
                )
                row = cursor.fetchone()
                revision_before = int(row[0] if row else 0)

                cursor.execute(
                    "SELECT revision FROM tv_tracker_changes "
                    "WHERE operation_id = %s",
                    (operation_id,),
                )
                duplicate_row = cursor.fetchone()

                if duplicate_row:
                    rows = (
                        []
                        if change_log_has_gap(cursor, base_revision, revision_before)
                        else fetch_change_rows(cursor, base_revision)
                    )
                    return jsonify({
                        "ok": True,
                        "revision": revision_before,
                        "operationRevision": int(duplicate_row[0]),
                        "duplicate": True,
                        "reset": not bool(rows) and base_revision < revision_before,
                        "changes": serialize_change_rows(rows),
                    })

                if base_revision > revision_before:
                    return jsonify({
                        "ok": False,
                        "error": "Client revision is newer than the server",
                        "revision": revision_before,
                        "reset": True,
                    }), 409

                if change_log_has_gap(cursor, base_revision, revision_before):
                    return jsonify({
                        "ok": False,
                        "error": "Synchronization history is unavailable",
                        "revision": revision_before,
                        "reset": True,
                    }), 409

                concurrent_rows = fetch_change_rows(cursor, base_revision)
                conflicting = any(
                    deltas_conflict(incoming_delta, row_delta)
                    for _, _, row_delta in concurrent_rows
                )

                if conflicting:
                    return jsonify({
                        "ok": False,
                        "error": "The same tracker data changed on another device",
                        "revision": revision_before,
                        "reset": False,
                        "conflict": True,
                        "changes": serialize_change_rows(concurrent_rows),
                    }), 409

                logical_history_delete: list[str] = []
                for entry_id, entry_data in history_upsert.items():
                    for duplicate_id in find_logical_duplicate_history_ids(
                        cursor, str(entry_id), entry_data
                    ):
                        if (
                            duplicate_id not in logical_history_delete
                            and duplicate_id not in history_delete
                        ):
                            logical_history_delete.append(duplicate_id)

                effective_history_delete = list(history_delete) + logical_history_delete

                actual_history_order = merge_history_order(
                    cursor, history_order, history_upsert, effective_history_delete
                )

                for show_id, show_data in shows_upsert.items():
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_shows (show_id, data, updated_at)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (show_id) DO UPDATE
                        SET data = EXCLUDED.data, updated_at = NOW()
                        """,
                        (str(show_id), Jsonb(show_data)),
                    )

                if shows_delete:
                    cursor.execute(
                        "DELETE FROM tv_tracker_shows WHERE show_id = ANY(%s)",
                        ([str(item) for item in shows_delete],),
                    )

                for entry_id, entry_data in history_upsert.items():
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_history (entry_id, data, updated_at)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (entry_id) DO UPDATE
                        SET data = EXCLUDED.data, updated_at = NOW()
                        """,
                        (str(entry_id), Jsonb(entry_data)),
                    )

                if effective_history_delete:
                    cursor.execute(
                        "DELETE FROM tv_tracker_history WHERE entry_id = ANY(%s)",
                        ([str(item) for item in effective_history_delete],),
                    )

                for key, value in state_upsert.items():
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_state (state_key, data, updated_at)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (state_key) DO UPDATE
                        SET data = EXCLUDED.data, updated_at = NOW()
                        """,
                        (str(key), Jsonb(value)),
                    )

                if actual_history_order is not None:
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_state (state_key, data, updated_at)
                        VALUES ('history_order', %s, NOW())
                        ON CONFLICT (state_key) DO UPDATE
                        SET data = EXCLUDED.data, updated_at = NOW()
                        """,
                        (Jsonb(actual_history_order),),
                    )

                revision = revision_before + 1
                actual_delta = normalize_delta(
                    shows_upsert,
                    shows_delete,
                    history_upsert,
                    effective_history_delete,
                    actual_history_order,
                    state_upsert,
                )

                cursor.execute(
                    """
                    UPDATE tv_tracker_meta
                    SET revision = %s, updated_at = NOW()
                    WHERE singleton_id = 1
                    """,
                    (revision,),
                )
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_changes
                    (revision, operation_id, delta, created_at)
                    VALUES (%s, %s, %s, NOW())
                    """,
                    (revision, operation_id, Jsonb(actual_delta)),
                )
                cursor.execute(
                    """
                    DELETE FROM tv_tracker_changes
                    WHERE revision < %s
                       OR created_at < NOW() - (%s * INTERVAL '1 day')
                    """,
                    (
                        max(0, revision - CHANGE_LOG_RETENTION_REVISIONS),
                        CHANGE_LOG_RETENTION_DAYS,
                    ),
                )
            connection.commit()

        return jsonify({
            "ok": True,
            "revision": revision,
            "duplicate": False,
            "reset": False,
            "changes": serialize_change_rows(concurrent_rows),
            "appliedDelta": actual_delta,
        })

    @app.get("/api/backup")
    @login_required
    def download_backup():
        raw_data, _ = read_tracker_data()
        try:
            data = validate_tracker_data(raw_data)
        except BackupValidationError as error:
            app.logger.error("Backup export blocked malformed stored data: %s", error)
            return jsonify({
                "ok": False,
                "error": "Stored tracker data failed validation. Export was blocked.",
                "code": "backup_validation_failed",
            }), 500

        history = data["history"]
        shows = data["shows"]
        profile = data["profile"]
        special_count = sum(
            1
            for entry in history
            if isinstance(entry, dict)
            and (entry.get("special") is True or int(entry.get("season") or -1) == 0)
        )
        backup = {
            "app": APP_NAME,
            "backupType": "native-app-backup",
            "backupVersion": BACKUP_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "summary": {
                "shows": len(shows),
                "historyEntries": len(history),
                "regularHistoryEntries": len(history) - special_count,
                "specialHistoryEntries": special_count,
                "favorites": len(profile.get("favorite_shows") or []),
            },
            "data": data,
        }
        body = json.dumps(backup, ensure_ascii=False, indent=2) + "\n"
        response = Response(body, mimetype="application/json")
        response.headers["Content-Disposition"] = (
            'attachment; filename="tv-tracker-online-backup.json"'
        )
        return response

    @app.post("/api/backup/import")
    @login_required
    def import_backup():
        check_csrf()
        backup = request.get_json(silent=True)

        try:
            data, summary = validate_and_normalize_backup(backup)
        except BackupValidationError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
                "code": "invalid_backup",
            }), 400

        try:
            revision = replace_tracker_data_transactionally(data)
        except Exception:
            app.logger.exception("Transactional backup import failed")
            return jsonify({
                "ok": False,
                "error": "The backup could not be imported. No data was changed.",
                "code": "import_failed",
            }), 503

        return jsonify({
            "ok": True,
            "revision": revision,
            "summary": summary,
        })

    @app.get("/api/tmdb/<path:tmdb_path>")
    @login_required
    def tmdb_proxy(tmdb_path: str):
        if not TMDB_PATH_RE.fullmatch(tmdb_path):
            abort(404)

        api_key = required_env("TMDB_API_KEY")
        query_items = [
            (key, value)
            for key in request.args
            for value in request.args.getlist(key)
            if key != "api_key"
        ]
        query_items.append(("api_key", api_key))
        target = (
            "https://api.themoviedb.org/3/"
            + tmdb_path
            + "?"
            + urlencode(query_items)
        )
        upstream_request = Request(
            target,
            headers={
                "Accept": "application/json",
                "User-Agent": "TVTracker/1.0",
            },
        )

        try:
            with urlopen(upstream_request, timeout=20) as upstream:
                content = upstream.read()
                response = Response(
                    content,
                    status=upstream.status,
                    mimetype="application/json",
                )
                response.headers["Cache-Control"] = "private, max-age=300"
                return response
        except HTTPError as error:
            content = error.read()
            return Response(
                content or b'{"status_message":"TMDB request failed"}',
                status=error.code,
                mimetype="application/json",
            )
        except (URLError, TimeoutError):
            return jsonify({
                "ok": False,
                "error": "TMDB is unavailable",
                "code": "tmdb_unavailable",
            }), 502

    @app.errorhandler(psycopg.Error)
    def database_error(error):
        app.logger.error(
            "Database request failed",
            exc_info=(type(error), error, error.__traceback__),
        )
        if request.path.startswith("/api/"):
            return jsonify({
                "ok": False,
                "error": "The database is temporarily unavailable",
                "code": "database_unavailable",
            }), 503
        return render_page_error(503)

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({
                "ok": False,
                "error": "Not found",
                "code": "not_found",
            }), 404
        return render_page_error(404)

    @app.errorhandler(500)
    def server_error(_error):
        if request.path.startswith("/api/"):
            return jsonify({
                "ok": False,
                "error": "Something went wrong",
                "code": "server_error",
            }), 500
        return render_page_error(500)

    @app.errorhandler(413)
    def body_too_large(_error):
        return jsonify({
            "ok": False,
            "error": "Upload is too large",
            "code": "upload_too_large",
        }), 413

    @app.errorhandler(403)
    def forbidden(_error):
        if request.path.startswith("/api/"):
            return jsonify({
                "ok": False,
                "error": "Security token rejected",
                "code": "csrf_rejected",
            }), 403
        return "Forbidden", 403

    return app


app = create_app()
