from __future__ import annotations

import gzip
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
import math
import unicodedata
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode
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

from notifications_backend import (
    delete_notification as delete_notification_record,
    list_notifications as get_notification_records,
    mark_all_notifications_read as mark_notifications_read,
    notification_status as get_notification_status,
    read_notification_settings as get_notification_settings,
    run_notification_check as execute_notification_check,
    serialize_notification_settings,
    update_notification_settings as patch_notification_settings,
)


APP_NAME = "TV Tracker"
BACKUP_VERSION = 2
SCHEMA_VERSION = 4
SUPPORTED_BACKUP_VERSIONS = {1, BACKUP_VERSION}
MAX_BODY_BYTES = 40 * 1024 * 1024
TMDB_PATH_RE = re.compile(r"^[A-Za-z0-9_./-]+$")
APP_ROUTE_ID_SLUG = r"[1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?"
APP_EPISODE_ROUTE_ID_SLUG = APP_ROUTE_ID_SLUG
APP_SHOW_PATH_RE = re.compile(rf"^/app/show/({APP_ROUTE_ID_SLUG})$")
APP_EPISODE_PATH_RE = re.compile(
    rf"^/app/show/({APP_EPISODE_ROUTE_ID_SLUG})/season/([0-9]{{1,5}})/episode/([1-9][0-9]{{0,5}})$"
)
APP_GENRE_PATH_RE = re.compile(rf"^/app/genre/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_NETWORK_PATH_RE = re.compile(rf"^/app/network/({APP_ROUTE_ID_SLUG})$")
APP_LANGUAGE_PATH_RE = re.compile(r"^/app/language/(tv|movie)/[a-z]{2,3}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$")
APP_COUNTRY_PATH_RE = re.compile(r"^/app/country/(tv|movie)/[a-z]{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$")
APP_THEME_PATH_RE = re.compile(rf"^/app/theme/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_MOVIE_PATH_RE = re.compile(rf"^/app/movie/({APP_ROUTE_ID_SLUG})$")
APP_COMPANY_PATH_RE = re.compile(rf"^/app/company/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_PROVIDER_PATH_RE = re.compile(rf"^/app/provider/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_YEAR_PATH_RE = re.compile(r"^/app/year/(tv|movie)/((?:18|19|20|21)[0-9]{2})$")
APP_STATUS_PATH_RE = re.compile(r"^/app/status/(returning-series|ended|canceled|in-production)$")
APP_CERTIFICATION_PATH_RE = re.compile(r"^/app/certification/movie/[a-z0-9]+(?:-[a-z0-9]+)*$")
APP_COLLECTIONS_PATH_RE = re.compile(r"^/app/collections$")
APP_COLLECTION_PATH_RE = re.compile(rf"^/app/collection/({APP_ROUTE_ID_SLUG})$")
APP_BROWSE_PATH_RE = re.compile(r"^/app/browse/(tv|movie)$")
APP_BROWSE_SORT_MODES = {
    "popularity-desc",
    "popularity-asc",
    "rating-desc",
    "rating-asc",
    "date-desc",
    "date-asc",
}
APP_COLLECTION_SORT_MODES = {
    "name.asc",
    "size.desc",
    "date.desc",
    "date.asc",
    "rating.desc",
    "rating.asc",
    "popularity.desc",
    "popularity.asc",
}
APP_BROWSE_STATUS_VALUES = {"returning-series", "in-production", "ended", "canceled"}
APP_BROWSE_RUNTIME_VALUES = {
    "tv": {"under-30", "30-44", "45-59", "60-89", "90-plus"},
    "movie": {"under-90", "90-119", "120-149", "150-179", "180-plus"},
}
APP_DISCOVER_CATEGORY_PATH_RE = re.compile(
    r"^/app/discover/(?:(?:tv)/(?:popular|top-rated|airing-today|on-the-air)|(?:movie)/(?:popular|top-rated|now-playing|upcoming))$"
)
APP_LIST_PATH_RE = re.compile(r"^/app/list/(watching|paused|completed|plan-to-watch|dropped)$")
APP_LIBRARY_SORT_MODES = {
    "default",
    "title-az",
    "title-za",
    "recently-added",
    "recently-watched",
    "rating-desc",
    "year-newest",
    "year-oldest",
}
APP_PERSON_PATH_RE = re.compile(rf"^/app/person/({APP_ROUTE_ID_SLUG})$")
APP_SECTION_PATHS = {
    "/app/upcoming",
    "/app/history",
    "/app/discover",
    "/app/search",
    "/app/profile",
    "/app/settings",
    "/app/notifications",
    "/app/notifications/settings",
}
ERROR_PAGE_MESSAGES = {
    404: ("Are you lost?", ""),
    500: ("Houston, we have a problem", "Something went wrong. Try again in a moment."),
}
PASSWORD_HASHER = PasswordHasher()
MIN_ADMIN_PASSWORD_CHARS = 16
MAX_AVATAR_DATA_URL_CHARS = 3 * 1024 * 1024
MAX_HEADER_DATA_URL_CHARS = 5 * 1024 * 1024
ALLOWED_PROFILE_IMAGE_PREFIXES = {
    "data:image/png;base64",
    "data:image/jpeg;base64",
    "data:image/webp;base64",
}
BASE64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
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
TMDB_NETWORK_EXPORT_CACHE_TTL_SECONDS = 6 * 60 * 60
TMDB_NETWORK_EXPORT_LOOKBACK_DAYS = 4
TMDB_NETWORK_SEARCH_MAX_RESULTS = 20
TMDB_NETWORK_SEARCH_QUERY_MAX_CHARS = 80
TMDB_NETWORK_EXPORT_CACHE: dict[str, Any] = {
    "loaded_at": 0.0,
    "source_date": "",
    "records": [],
}
TMDB_NETWORK_EXPORT_LOCK = threading.Lock()
TMDB_COLLECTION_EXPORT_CACHE_TTL_SECONDS = 24 * 60 * 60
TMDB_COLLECTION_EXPORT_LOOKBACK_DAYS = 7
TMDB_COLLECTION_INDEX_BATCH_SIZE = 80
TMDB_COLLECTION_INDEX_VERSION = 1
TMDB_COLLECTION_INDEX_CACHE_FILE = "tmdb_collection_index.json"
TMDB_COLLECTION_INDEX_BUILD_STATE: dict[str, Any] = {
    "building": False,
    "started_at": 0.0,
    "last_error": "",
}
TMDB_COLLECTION_INDEX_LOCK = threading.Lock()
CHANGE_LOG_RETENTION_REVISIONS = 5000
CHANGE_LOG_RETENTION_DAYS = 30
OPERATION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")
DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
STATE_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
ALLOWED_STATE_KEYS = {
    "profile",
    "movies",
    "metadata_sync",
    "network_sync",
    "import_info",
    "provider_metadata",
}
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


def env_flag(name: str, *, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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

    CREATE TABLE IF NOT EXISTS tv_tracker_notification_settings (
        singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        timezone TEXT NOT NULL DEFAULT '',
        new_season BOOLEAN NOT NULL DEFAULT TRUE,
        season_premiere_tomorrow BOOLEAN NOT NULL DEFAULT TRUE,
        new_episode BOOLEAN NOT NULL DEFAULT TRUE,
        returns_tomorrow BOOLEAN NOT NULL DEFAULT TRUE,
        canceled_ended BOOLEAN NOT NULL DEFAULT TRUE,
        premiere_date_updates BOOLEAN NOT NULL DEFAULT TRUE,
        initialized_at TIMESTAMPTZ,
        last_checked_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_notification_baseline (
        show_id TEXT PRIMARY KEY,
        snapshot JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_notification_events (
        event_key TEXT PRIMARY KEY,
        show_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tv_tracker_notifications (
        notification_id BIGSERIAL PRIMARY KEY,
        group_key TEXT NOT NULL UNIQUE,
        event_key TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        show_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        image_path TEXT NOT NULL DEFAULT '',
        event_date DATE,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS tv_tracker_notifications_created_at_idx
    ON tv_tracker_notifications (created_at DESC);

    CREATE INDEX IF NOT EXISTS tv_tracker_notifications_unread_idx
    ON tv_tracker_notifications (is_read, created_at DESC);

    CREATE INDEX IF NOT EXISTS tv_tracker_notification_events_observed_idx
    ON tv_tracker_notification_events (observed_at);

    INSERT INTO tv_tracker_notification_settings (singleton_id)
    VALUES (1)
    ON CONFLICT (singleton_id) DO NOTHING;

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
                "favorite_movies": [],
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

            destination = safe_next_url(request.full_path)
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
    if str(entry.get("media_type") or "").lower() == "movie" or entry.get("movie_id"):
        movie_id = str(entry.get("movie_id") or entry.get("tmdb_id") or "").strip()
        if movie_id:
            return f"movie-watched-{movie_id}"
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
    is_movie = str(entry.get("media_type") or "").lower() == "movie" or bool(entry.get("movie_id"))

    if is_movie:
        movie_id = entry.get("movie_id", entry.get("tmdb_id"))
        entry["media_type"] = "movie"
        entry["movie_id"] = normalized_identifier(
            movie_id, f"History entry {index + 1} movie identifier", maximum=160
        )
        entry["tmdb_id"] = entry["movie_id"]
        for text_field, limit in {
            "title": 500,
            "poster_path": 500,
            "backdrop_path": 500,
            "release_date": 40,
            "year": 8,
            "action": 80,
        }.items():
            if text_field in entry and entry[text_field] is not None:
                if not isinstance(entry[text_field], (str, int, float)):
                    raise BackupValidationError(
                        f"History entry {index + 1} has invalid {text_field}"
                    )
                entry[text_field] = str(entry[text_field]).strip()[:limit]
    else:
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
    if str(entry.get("media_type") or "").lower() == "movie" or entry.get("movie_id"):
        return None
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


def validate_profile_image_data_url(value: Any, field: str, maximum: int) -> str:
    if value in (None, ""):
        return ""
    if not isinstance(value, str) or len(value) > maximum:
        raise BackupValidationError(f"Profile field {field} is invalid")

    prefix, separator, payload = value.partition(",")
    if (
        separator != ","
        or prefix not in ALLOWED_PROFILE_IMAGE_PREFIXES
        or not payload
        or len(payload) % 4 != 0
        or BASE64_RE.fullmatch(payload) is None
    ):
        raise BackupValidationError(f"Profile field {field} is invalid")

    return value


def validate_profile_record(raw_profile: Any) -> dict[str, Any]:
    if not isinstance(raw_profile, dict):
        raise BackupValidationError("Profile data is invalid")
    validate_json_value(raw_profile, "Profile")
    profile = json_clone(raw_profile)
    profile.pop("date_only_episode_time", None)

    allowed_fields = {
        "username", "favorite_shows", "favorite_movies", "avatar_type", "avatar_preset",
        "avatar_data", "header_type", "header_preset", "header_image", "streaming_region",
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

    favorite_movies = profile.get("favorite_movies", []) or []
    if not isinstance(favorite_movies, list) or len(favorite_movies) > 8:
        raise BackupValidationError("Profile favorite movies data is invalid")
    normalized_movie_ids: set[str] = set()
    normalized_movies: list[dict[str, Any]] = []
    for raw_movie in favorite_movies:
        if not isinstance(raw_movie, dict):
            raise BackupValidationError("Profile favorite movie entry is invalid")
        movie_id = normalized_identifier(
            raw_movie.get("id") or raw_movie.get("tmdb_id"),
            "Profile favorite movie identifier",
            maximum=160,
        )
        if movie_id in normalized_movie_ids:
            continue
        normalized_movie_ids.add(movie_id)
        movie = {"id": movie_id, "tmdb_id": movie_id}
        for field, limit in {
            "title": 240,
            "poster_path": 240,
            "backdrop_path": 240,
            "release_date": 40,
            "year": 8,
        }.items():
            value = raw_movie.get(field, "")
            if value is None:
                value = ""
            if not isinstance(value, (str, int, float)):
                raise BackupValidationError("Profile favorite movie entry is invalid")
            movie[field] = str(value).strip()[:limit]
        normalized_movies.append(movie)
    profile["favorite_movies"] = normalized_movies

    limits = {
        "username": 160,
        "avatar_type": 40,
        "avatar_preset": 120,
        "header_type": 40,
        "header_preset": 120,
    }
    for field, limit in limits.items():
        if field in profile and profile[field] is not None:
            if not isinstance(profile[field], str) or len(profile[field]) > limit:
                raise BackupValidationError(f"Profile field {field} is invalid")

    streaming_region = profile.get("streaming_region", "")
    if streaming_region is None:
        streaming_region = ""
    if not isinstance(streaming_region, str):
        raise BackupValidationError("Profile field streaming_region is invalid")
    streaming_region = streaming_region.strip().upper()
    if streaming_region and re.fullmatch(r"[A-Z]{2}", streaming_region) is None:
        raise BackupValidationError("Profile field streaming_region is invalid")
    profile["streaming_region"] = streaming_region

    if profile.get("avatar_type") not in (None, "", "initial", "preset", "upload"):
        raise BackupValidationError("Profile field avatar_type is invalid")
    if profile.get("header_type") not in (None, "", "preset", "upload"):
        raise BackupValidationError("Profile field header_type is invalid")

    profile["avatar_data"] = validate_profile_image_data_url(
        profile.get("avatar_data"),
        "avatar_data",
        MAX_AVATAR_DATA_URL_CHARS,
    )
    profile["header_image"] = validate_profile_image_data_url(
        profile.get("header_image"),
        "header_image",
        MAX_HEADER_DATA_URL_CHARS,
    )

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


def validate_movie_tracking_state(raw_value: Any) -> dict[str, Any]:
    if raw_value is None:
        return {}
    if not isinstance(raw_value, dict) or len(raw_value) > 50000:
        raise BackupValidationError("State movies is invalid")
    validate_json_value(raw_value, "State movies")
    normalized: dict[str, Any] = {}
    allowed_fields = {
        "id", "tmdb_id", "movie_id", "title", "poster_path", "backdrop_path",
        "release_date", "year", "watched", "plan", "plan_to_watch", "favorite",
        "watched_at", "updated_at", "status",
    }
    for raw_movie_id, raw_record in raw_value.items():
        movie_id = normalized_identifier(raw_movie_id, "Movie tracking identifier", maximum=160)
        if not isinstance(raw_record, dict):
            raise BackupValidationError("Movie tracking record is invalid")
        if set(raw_record) - allowed_fields:
            raise BackupValidationError("Movie tracking record contains unsupported fields")
        record_id = normalized_identifier(
            raw_record.get("id") or raw_record.get("tmdb_id") or raw_record.get("movie_id") or movie_id,
            "Movie tracking record identifier",
            maximum=160,
        )
        watched = raw_record.get("watched") is True or raw_record.get("status") == "watched"
        plan = (not watched) and (
            raw_record.get("plan") is True
            or raw_record.get("plan_to_watch") is True
            or raw_record.get("status") == "plan"
        )
        favorite = raw_record.get("favorite") is True
        if not watched and not plan and not favorite:
            continue
        record: dict[str, Any] = {
            "id": record_id,
            "tmdb_id": record_id,
            "title": "Untitled",
            "poster_path": "",
            "backdrop_path": "",
            "release_date": "",
            "year": "",
            "watched": watched,
            "plan": plan,
            "favorite": favorite,
            "watched_at": "",
            "updated_at": "",
        }
        for field, limit in {
            "title": 240,
            "poster_path": 500,
            "backdrop_path": 500,
            "release_date": 40,
            "year": 8,
        }.items():
            value = raw_record.get(field, record[field])
            if value is None:
                value = ""
            if not isinstance(value, (str, int, float)):
                raise BackupValidationError("Movie tracking record is invalid")
            record[field] = str(value).strip()[:limit] or ("Untitled" if field == "title" else "")
        for timestamp_field in ("watched_at", "updated_at"):
            value = raw_record.get(timestamp_field, "")
            if value is None:
                value = ""
            if not isinstance(value, str):
                raise BackupValidationError("Movie tracking timestamp is invalid")
            if value:
                validate_timestamp(value, f"Movie tracking {timestamp_field}")
            record[timestamp_field] = value
        if not record["watched"]:
            record["watched_at"] = ""
        normalized[record_id] = record
    return normalized


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


def validate_provider_metadata_state(raw_value: Any) -> dict[str, Any]:
    if raw_value is None:
        return {}
    if not isinstance(raw_value, dict) or len(raw_value) > 100000:
        raise BackupValidationError("State provider_metadata is invalid")
    validate_json_value(raw_value, "State provider_metadata")

    normalized: dict[str, Any] = {}
    key_re = re.compile(r"^(tv|movie):([1-9][0-9]{0,15}):([A-Z]{2})$")
    for raw_key, raw_entry in raw_value.items():
        if not isinstance(raw_key, str):
            raise BackupValidationError("State provider_metadata contains an invalid key")
        match = key_re.fullmatch(raw_key)
        if match is None or not isinstance(raw_entry, dict):
            raise BackupValidationError("State provider_metadata contains an invalid entry")

        clean_media, clean_id, clean_region = match.groups()
        allowed_fields = {"media", "id", "region", "refreshed_at", "providers"}
        if set(raw_entry) - allowed_fields:
            raise BackupValidationError("State provider_metadata contains unsupported fields")

        entry_media = str(raw_entry.get("media") or "").strip().lower()
        entry_id = normalized_identifier(
            raw_entry.get("id"), "Provider metadata title identifier", maximum=160
        )
        entry_region = str(raw_entry.get("region") or "").strip().upper()
        refreshed_at = raw_entry.get("refreshed_at")
        providers = raw_entry.get("providers")

        if entry_media != clean_media or entry_id != clean_id or entry_region != clean_region:
            raise BackupValidationError("State provider_metadata key does not match its entry")
        if not isinstance(refreshed_at, str) or not refreshed_at:
            raise BackupValidationError("State provider_metadata refreshed_at is invalid")
        validate_timestamp(refreshed_at, "Provider metadata refreshed_at")
        if not isinstance(providers, dict):
            raise BackupValidationError("State provider_metadata providers are invalid")
        provider_results = providers.get("results")
        if not isinstance(provider_results, dict):
            raise BackupValidationError("State provider_metadata providers are invalid")
        if set(provider_results) - {clean_region}:
            raise BackupValidationError("State provider_metadata contains another region")
        provider_id = providers.get("id", 0)
        if isinstance(provider_id, bool) or not isinstance(provider_id, (int, str)):
            raise BackupValidationError("State provider_metadata provider id is invalid")
        if str(provider_id).strip() and not str(provider_id).strip().isdigit():
            raise BackupValidationError("State provider_metadata provider id is invalid")

        normalized[raw_key] = {
            "media": clean_media,
            "id": clean_id,
            "region": clean_region,
            "refreshed_at": refreshed_at,
            "providers": json_clone(providers),
        }

    return normalized


def validate_state_record(key: Any, raw_value: Any) -> tuple[str, Any]:
    state_key = normalized_identifier(key, "State key", maximum=80)
    if not STATE_KEY_RE.fullmatch(state_key) or state_key not in ALLOWED_STATE_KEYS:
        raise BackupValidationError(f"Unsupported state key: {state_key}")
    if state_key == "profile":
        return state_key, validate_profile_record(raw_value)
    if state_key == "movies":
        return state_key, validate_movie_tracking_state(raw_value)
    if state_key == "import_info":
        return state_key, validate_import_info_state(raw_value)
    if state_key == "provider_metadata":
        return state_key, validate_provider_metadata_state(raw_value)
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
    for state_key in (
        "movies",
        "metadata_sync",
        "network_sync",
        "import_info",
        "provider_metadata",
    ):
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


APP_EYE_QUERY_FLAGS = ("fadeWatched", "hideWatched", "hidePlan", "hideFavorites")


def canonical_eye_query_params(raw_values: dict[str, str]) -> dict[str, str]:
    """Return supported tracked visibility flags as canonical URL params."""
    return {key: "1" for key in APP_EYE_QUERY_FLAGS if raw_values.get(key) == "1"}


def canonical_browse_query(raw_query: str, media_type: str) -> str:
    """Return a small canonical query string for Discover browse state."""
    media = "movie" if str(media_type or "").strip().lower() == "movie" else "tv"
    raw_values: dict[str, str] = {}
    for key, value in parse_qsl(str(raw_query or ""), keep_blank_values=False):
        if key not in raw_values:
            raw_values[key] = value.strip()

    def clean_id_list(key: str) -> str:
        values: list[str] = []
        seen: set[str] = set()
        for item in raw_values.get(key, "").split(","):
            clean = item.strip()
            if not re.fullmatch(r"[1-9][0-9]{0,11}", clean) or clean in seen:
                continue
            seen.add(clean)
            values.append(clean)
            if len(values) >= 12:
                break
        return ",".join(values)

    params: dict[str, str] = {}
    for key in ("genre", "theme", "company"):
        clean = clean_id_list(key)
        if clean:
            params[key] = clean

    if media == "tv":
        network = raw_values.get("network", "")
        if re.fullmatch(r"[1-9][0-9]{0,11}", network):
            params["network"] = network

    provider = clean_id_list("provider")
    if provider:
        params["provider"] = provider

    runtime = raw_values.get("runtime", "").lower()
    if runtime in APP_BROWSE_RUNTIME_VALUES[media]:
        params["runtime"] = runtime

    country = raw_values.get("country", "").lower()
    if re.fullmatch(r"[a-z]{2}", country):
        params["country"] = country

    language = raw_values.get("language", "").lower()
    if re.fullmatch(r"[a-z]{2,3}", language):
        params["language"] = language

    if raw_values.get("upcoming") == "1":
        params["upcoming"] = "1"
    else:
        year = raw_values.get("year", "")
        decade = raw_values.get("decade", "")
        if re.fullmatch(r"(?:18|19|20|21)[0-9]{2}", year):
            params["year"] = year
        elif re.fullmatch(r"(?:18|19|20|21)[0-9]0", decade):
            decade_value = int(decade)
            if 1870 <= decade_value <= 2190:
                params["decade"] = decade

    if media == "tv":
        statuses: list[str] = []
        seen_statuses: set[str] = set()
        for item in raw_values.get("status", "").split(","):
            clean = item.strip().lower()
            if clean in APP_BROWSE_STATUS_VALUES and clean not in seen_statuses:
                seen_statuses.add(clean)
                statuses.append(clean)
        if statuses:
            params["status"] = ",".join(statuses)
    else:
        certification = raw_values.get("certification", "").lower()
        if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", certification):
            params["certification"] = certification

    sort_mode = raw_values.get("sort", "").lower()
    if sort_mode in APP_BROWSE_SORT_MODES and sort_mode != "popularity-desc":
        params["sort"] = sort_mode

    params.update(canonical_eye_query_params(raw_values))

    return urlencode(params, safe=",") if params else ""


def app_browse_media_for_path(candidate: str) -> str | None:
    match = APP_BROWSE_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    if APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(candidate):
        parts = candidate.split("/")
        return parts[3] if len(parts) > 3 and parts[3] in {"tv", "movie"} else None
    match = APP_GENRE_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_LANGUAGE_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_COUNTRY_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_THEME_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_COMPANY_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_PROVIDER_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_YEAR_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    if APP_CERTIFICATION_PATH_RE.fullmatch(candidate):
        return "movie"
    if APP_NETWORK_PATH_RE.fullmatch(candidate) or APP_STATUS_PATH_RE.fullmatch(candidate):
        return "tv"
    return None


def safe_next_url(value: str | None) -> str:
    """Return a validated internal application route for post-login use."""
    raw_value = str(value or "").strip().split("#", 1)[0]
    raw_path, separator, raw_query = raw_value.partition("?")
    candidate = raw_path
    if candidate.startswith("/app/") and candidate != "/app/":
        candidate = candidate.rstrip("/")

    if candidate in {"/app", "/app/"}:
        return "/app/list/watching"
    if candidate == "/app/search":
        query = ""
        media_type = "tv"
        raw_values: dict[str, str] = {}
        if separator:
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                clean_value = value.strip()
                if key not in raw_values:
                    raw_values[key] = clean_value
                if key == "q" and clean_value and not query:
                    query = clean_value[:120]
                elif key == "type" and clean_value.lower() in {"tv", "movie", "person", "collection"}:
                    media_type = clean_value.lower()
        params = {"q": query, "type": media_type} if query else {}
        if query and media_type not in {"person", "collection"}:
            params.update(canonical_eye_query_params(raw_values))
        return "/app/search" + (("?" + urlencode(params)) if params else "")
    if APP_LIST_PATH_RE.fullmatch(candidate):
        query = ""
        genre = ""
        network = ""
        year = ""
        sort_mode = "default"
        if separator:
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                clean_value = value.strip()
                if key == "q" and clean_value and not query:
                    query = clean_value[:120]
                elif key == "genre" and clean_value and clean_value.lower() != "all" and not genre:
                    genre = clean_value[:120]
                elif key == "network" and clean_value and clean_value.lower() != "all" and not network:
                    network = clean_value[:120]
                elif key == "year" and re.fullmatch(r"\d{4}", clean_value) and not year:
                    year = clean_value
                elif key == "sort" and clean_value.lower() in APP_LIBRARY_SORT_MODES:
                    sort_mode = clean_value.lower()

        params = {}
        if query:
            params["q"] = query
        if genre:
            params["genre"] = genre
        if network:
            params["network"] = network
        if year:
            params["year"] = year
        if sort_mode != "default":
            params["sort"] = sort_mode
        return candidate + (("?" + urlencode(params)) if params else "")
    browse_media = app_browse_media_for_path(candidate)
    if browse_media:
        browse_query = canonical_browse_query(raw_query if separator else "", browse_media)
        return candidate + (("?" + browse_query) if browse_query else "")
    if candidate in APP_SECTION_PATHS:
        return candidate
    if APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_SHOW_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_EPISODE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_GENRE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_PERSON_PATH_RE.fullmatch(candidate):
        media_type = "tv"
        role = ""
        raw_values: dict[str, str] = {}
        if separator:
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                raw_clean_value = value.strip()
                clean_value = raw_clean_value.lower()
                if key not in raw_values:
                    raw_values[key] = raw_clean_value
                if key == "media" and clean_value in {"tv", "movie"}:
                    media_type = clean_value
                elif key == "role" and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", clean_value):
                    role = clean_value
        params = {}
        if media_type == "movie":
            params["media"] = "movie"
        if role:
            params["role"] = role
        params.update(canonical_eye_query_params(raw_values))
        return candidate + (("?" + urlencode(params)) if params else "")
    if APP_NETWORK_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_LANGUAGE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_COUNTRY_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_THEME_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_MOVIE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_COMPANY_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_PROVIDER_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_YEAR_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_STATUS_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_CERTIFICATION_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_COLLECTIONS_PATH_RE.fullmatch(candidate):
        query = ""
        genre = ""
        decade = ""
        sort_mode = "popularity.desc"
        page_number = ""
        if separator:
            current_decade = 2100
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                clean_value = value.strip()
                if key == "q" and clean_value and not query:
                    query = clean_value[:120]
                elif key == "genre" and re.fullmatch(r"[1-9][0-9]{0,11}", clean_value) and not genre:
                    genre = clean_value
                elif key == "decade" and re.fullmatch(r"(?:18|19|20|21)[0-9]0", clean_value):
                    decade_value = int(clean_value)
                    if 1870 <= decade_value <= current_decade and not decade:
                        decade = clean_value
                elif key == "sort" and clean_value.lower() in APP_COLLECTION_SORT_MODES:
                    sort_mode = clean_value.lower()
                elif key == "page" and re.fullmatch(r"[1-9][0-9]{0,5}", clean_value) and not page_number:
                    page_number = clean_value
        params = {}
        if query:
            params["q"] = query
        if genre:
            params["genre"] = genre
        if decade:
            params["decade"] = decade
        if sort_mode != "popularity.desc":
            params["sort"] = sort_mode
        if page_number and page_number != "1":
            params["page"] = page_number
        return candidate + (("?" + urlencode(params)) if params else "")
    if APP_COLLECTION_PATH_RE.fullmatch(candidate):
        return candidate
    return "/app/list/watching"


def valid_app_path(value: str | None) -> bool:
    candidate = str(value or "").strip()
    return (
        candidate in APP_SECTION_PATHS
        or APP_LIST_PATH_RE.fullmatch(candidate) is not None
        or APP_BROWSE_PATH_RE.fullmatch(candidate) is not None
        or APP_SHOW_PATH_RE.fullmatch(candidate) is not None
        or APP_EPISODE_PATH_RE.fullmatch(candidate) is not None
        or APP_GENRE_PATH_RE.fullmatch(candidate) is not None
        or APP_PERSON_PATH_RE.fullmatch(candidate) is not None
        or APP_NETWORK_PATH_RE.fullmatch(candidate) is not None
        or APP_LANGUAGE_PATH_RE.fullmatch(candidate) is not None
        or APP_COUNTRY_PATH_RE.fullmatch(candidate) is not None
        or APP_THEME_PATH_RE.fullmatch(candidate) is not None
        or APP_MOVIE_PATH_RE.fullmatch(candidate) is not None
        or APP_COMPANY_PATH_RE.fullmatch(candidate) is not None
        or APP_PROVIDER_PATH_RE.fullmatch(candidate) is not None
        or APP_YEAR_PATH_RE.fullmatch(candidate) is not None
        or APP_STATUS_PATH_RE.fullmatch(candidate) is not None
        or APP_CERTIFICATION_PATH_RE.fullmatch(candidate) is not None
        or APP_COLLECTIONS_PATH_RE.fullmatch(candidate) is not None
        or APP_COLLECTION_PATH_RE.fullmatch(candidate) is not None
        or APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(candidate) is not None
    )


def render_page_error(status_code: int):
    message_code = 404 if status_code == 404 else 500
    error_title, error_text = ERROR_PAGE_MESSAGES[message_code]
    signed_in = session.get("authenticated") is True
    route_error_gradient_class = ""
    if status_code == 404:
        gradient_count = 8
        previous_index = session.get("route_error_gradient_index")
        choices = [index for index in range(gradient_count) if index != previous_index]
        gradient_index = secrets.choice(choices or list(range(gradient_count)))
        session["route_error_gradient_index"] = gradient_index
        route_error_gradient_class = f"route-error-gradient-{gradient_index + 1}"
    action_url = "/app" if status_code == 404 or signed_in else url_for("login")
    action_label = "Back to app" if status_code == 404 or signed_in else "Back to sign in"
    return render_template(
        "error.html",
        status_code=status_code,
        error_title=error_title,
        error_text=error_text,
        action_url=action_url,
        action_label=action_label,
        route_error_gradient_class=route_error_gradient_class,
    ), status_code


def normalize_tmdb_network_search_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).split())


def tmdb_network_export_candidate_dates(now: datetime | None = None) -> list[date]:
    current = now or datetime.utcnow()
    first_date = current.date()
    if current.hour < 8:
        first_date -= timedelta(days=1)
    return [first_date - timedelta(days=offset) for offset in range(TMDB_NETWORK_EXPORT_LOOKBACK_DAYS)]


def parse_tmdb_network_export_payload(compressed: bytes) -> list[dict[str, Any]]:
    payload = gzip.decompress(compressed).decode("utf-8", errors="replace")
    records: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except (TypeError, ValueError):
            continue
        if not isinstance(item, dict):
            continue
        try:
            network_id = int(item.get("id") or 0)
        except (TypeError, ValueError):
            continue
        name = str(item.get("name") or item.get("original_name") or "").strip()
        if network_id <= 0 or not name or network_id in seen_ids:
            continue
        search_key = normalize_tmdb_network_search_text(name)
        if not search_key:
            continue
        seen_ids.add(network_id)
        record: dict[str, Any] = {
            "id": network_id,
            "name": name,
            "search_key": search_key,
        }
        origin_country = str(item.get("origin_country") or "").strip().upper()
        if re.fullmatch(r"[A-Z]{2}", origin_country):
            record["origin_country"] = origin_country
        records.append(record)
    records.sort(key=lambda item: (str(item["name"]).casefold(), int(item["id"])))
    return records


def fetch_tmdb_network_export(export_date: date) -> list[dict[str, Any]]:
    filename = f"tv_network_ids_{export_date:%m_%d_%Y}.json.gz"
    target = f"https://files.tmdb.org/p/exports/{filename}"
    upstream_request = Request(
        target,
        headers={
            "Accept": "application/gzip, application/octet-stream",
            "User-Agent": "TVTracker/1.0",
        },
    )
    with urlopen(upstream_request, timeout=20) as upstream:
        compressed = upstream.read()
    return parse_tmdb_network_export_payload(compressed)


def get_tmdb_network_export_records() -> tuple[list[dict[str, Any]], str]:
    now = time.time()
    cached_records = TMDB_NETWORK_EXPORT_CACHE.get("records")
    loaded_at = float(TMDB_NETWORK_EXPORT_CACHE.get("loaded_at") or 0.0)
    if isinstance(cached_records, list) and cached_records and now - loaded_at < TMDB_NETWORK_EXPORT_CACHE_TTL_SECONDS:
        return cached_records, str(TMDB_NETWORK_EXPORT_CACHE.get("source_date") or "")

    with TMDB_NETWORK_EXPORT_LOCK:
        now = time.time()
        cached_records = TMDB_NETWORK_EXPORT_CACHE.get("records")
        loaded_at = float(TMDB_NETWORK_EXPORT_CACHE.get("loaded_at") or 0.0)
        if isinstance(cached_records, list) and cached_records and now - loaded_at < TMDB_NETWORK_EXPORT_CACHE_TTL_SECONDS:
            return cached_records, str(TMDB_NETWORK_EXPORT_CACHE.get("source_date") or "")

        last_error: Exception | None = None
        for export_date in tmdb_network_export_candidate_dates():
            try:
                records = fetch_tmdb_network_export(export_date)
            except (HTTPError, URLError, TimeoutError, OSError, EOFError) as error:
                last_error = error
                continue
            if not records:
                continue
            TMDB_NETWORK_EXPORT_CACHE.update({
                "loaded_at": now,
                "source_date": export_date.isoformat(),
                "records": records,
            })
            return records, export_date.isoformat()

        if isinstance(cached_records, list) and cached_records:
            return cached_records, str(TMDB_NETWORK_EXPORT_CACHE.get("source_date") or "")
        raise RuntimeError("TMDB network export is unavailable") from last_error


def search_tmdb_network_export(query: str, *, limit: int = TMDB_NETWORK_SEARCH_MAX_RESULTS) -> tuple[list[dict[str, Any]], str]:
    clean_query = normalize_tmdb_network_search_text(query)
    if len(clean_query) < 2:
        return [], ""
    records, source_date = get_tmdb_network_export_records()
    query_tokens = clean_query.split()
    matches: list[tuple[tuple[int, int, str, int], dict[str, Any]]] = []
    for item in records:
        search_key = str(item.get("search_key") or "")
        if not search_key:
            continue
        if search_key == clean_query:
            rank = 0
        elif search_key.startswith(clean_query):
            rank = 1
        elif all(token in search_key.split() for token in query_tokens):
            rank = 2
        elif all(token in search_key for token in query_tokens):
            rank = 3
        elif clean_query in search_key:
            rank = 4
        else:
            continue
        public_item = {
            "id": int(item["id"]),
            "name": str(item["name"]),
        }
        if item.get("origin_country"):
            public_item["origin_country"] = str(item["origin_country"])
        matches.append(((rank, len(search_key), search_key, int(item["id"])), public_item))
    matches.sort(key=lambda item: item[0])
    safe_limit = max(1, min(int(limit or TMDB_NETWORK_SEARCH_MAX_RESULTS), TMDB_NETWORK_SEARCH_MAX_RESULTS))
    return [item for _, item in matches[:safe_limit]], source_date



def tmdb_collection_cache_path() -> Path:
    data_dir = Path(os.environ.get("TV_TRACKER_DATA_DIR") or (Path(__file__).resolve().parent / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / TMDB_COLLECTION_INDEX_CACHE_FILE


def read_tmdb_collection_index_cache() -> dict[str, Any]:
    path = tmdb_collection_cache_path()
    if not path.exists():
        return {
            "version": TMDB_COLLECTION_INDEX_VERSION,
            "source_date": "",
            "export_checked_at": 0.0,
            "indexed_at": 0.0,
            "cursor": 0,
            "total_ids": 0,
            "collection_ids": [],
            "collections": [],
        }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {
            "version": TMDB_COLLECTION_INDEX_VERSION,
            "source_date": "",
            "export_checked_at": 0.0,
            "indexed_at": 0.0,
            "cursor": 0,
            "total_ids": 0,
            "collection_ids": [],
            "collections": [],
        }
    if not isinstance(payload, dict) or int(payload.get("version") or 0) != TMDB_COLLECTION_INDEX_VERSION:
        return {
            "version": TMDB_COLLECTION_INDEX_VERSION,
            "source_date": "",
            "export_checked_at": 0.0,
            "indexed_at": 0.0,
            "cursor": 0,
            "total_ids": 0,
            "collection_ids": [],
            "collections": [],
        }
    payload.setdefault("source_date", "")
    payload.setdefault("export_checked_at", 0.0)
    payload.setdefault("indexed_at", 0.0)
    payload.setdefault("cursor", 0)
    payload.setdefault("total_ids", 0)
    payload.setdefault("collection_ids", [])
    payload.setdefault("collections", [])
    if not isinstance(payload["collection_ids"], list):
        payload["collection_ids"] = []
    if not isinstance(payload["collections"], list):
        payload["collections"] = []
    return payload


def write_tmdb_collection_index_cache(payload: dict[str, Any]) -> None:
    path = tmdb_collection_cache_path()
    safe_payload = {
        "version": TMDB_COLLECTION_INDEX_VERSION,
        "source_date": str(payload.get("source_date") or ""),
        "export_checked_at": float(payload.get("export_checked_at") or 0.0),
        "indexed_at": float(payload.get("indexed_at") or 0.0),
        "cursor": max(0, int(payload.get("cursor") or 0)),
        "total_ids": max(0, int(payload.get("total_ids") or 0)),
        "collection_ids": [int(value) for value in payload.get("collection_ids") or [] if str(value).isdigit()],
        "collections": [item for item in payload.get("collections") or [] if isinstance(item, dict) and item.get("id")],
    }
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(safe_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp_path, path)


def tmdb_collection_export_candidate_dates(now: datetime | None = None) -> list[date]:
    current = now or datetime.utcnow()
    first_date = current.date()
    if current.hour < 8:
        first_date -= timedelta(days=1)
    return [first_date - timedelta(days=offset) for offset in range(TMDB_COLLECTION_EXPORT_LOOKBACK_DAYS)]


def normalize_tmdb_collection_name(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def parse_tmdb_collection_export_payload(compressed: bytes) -> list[dict[str, Any]]:
    payload = gzip.decompress(compressed).decode("utf-8", errors="replace")
    records: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except (TypeError, ValueError):
            continue
        if not isinstance(item, dict):
            continue
        try:
            collection_id = int(item.get("id") or 0)
        except (TypeError, ValueError):
            continue
        name = normalize_tmdb_collection_name(item.get("name") or item.get("original_name"))
        if collection_id <= 0 or collection_id in seen_ids:
            continue
        try:
            popularity = float(item.get("popularity") or 0.0)
        except (TypeError, ValueError):
            popularity = 0.0
        seen_ids.add(collection_id)
        records.append({
            "id": collection_id,
            "name": name,
            "popularity": popularity,
        })
    records.sort(key=lambda item: (-float(item.get("popularity") or 0.0), str(item.get("name") or "").casefold(), int(item["id"])))
    return records


def fetch_tmdb_collection_export(export_date: date) -> list[dict[str, Any]]:
    filename = f"collection_ids_{export_date:%m_%d_%Y}.json.gz"
    target = f"https://files.tmdb.org/p/exports/{filename}"
    upstream_request = Request(
        target,
        headers={
            "Accept": "application/gzip, application/octet-stream",
            "User-Agent": "TVTracker/1.0",
        },
    )
    with urlopen(upstream_request, timeout=20) as upstream:
        compressed = upstream.read()
    return parse_tmdb_collection_export_payload(compressed)


def latest_tmdb_collection_export_records() -> tuple[list[dict[str, Any]], str]:
    last_error: Exception | None = None
    for export_date in tmdb_collection_export_candidate_dates():
        try:
            records = fetch_tmdb_collection_export(export_date)
        except (HTTPError, URLError, TimeoutError, OSError, EOFError) as error:
            last_error = error
            continue
        if records:
            return records, export_date.isoformat()
    raise RuntimeError("TMDB collection export is unavailable") from last_error


def slugify_tmdb_collection_label(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.casefold()).strip("-")
    return slug or "collection"


def tmdb_collection_detail_url(collection_id: int) -> str:
    return (
        "https://api.themoviedb.org/3/collection/"
        + str(int(collection_id))
        + "?"
        + urlencode({"api_key": required_env("TMDB_API_KEY")})
    )


def fetch_tmdb_collection_detail(collection_id: int) -> dict[str, Any]:
    upstream_request = Request(
        tmdb_collection_detail_url(collection_id),
        headers={
            "Accept": "application/json",
            "User-Agent": "TVTracker/1.0",
        },
    )
    with urlopen(upstream_request, timeout=20) as upstream:
        return json.loads(upstream.read().decode("utf-8", errors="replace"))


def normalize_collection_genre_ids(value: Any) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for raw in value if isinstance(value, list) else []:
        try:
            genre_id = int(raw)
        except (TypeError, ValueError):
            continue
        if genre_id <= 0 or genre_id in seen:
            continue
        seen.add(genre_id)
        ids.append(genre_id)
    return ids


def normalize_tmdb_collection_movie_part(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    try:
        movie_id = int(raw.get("id") or 0)
    except (TypeError, ValueError):
        return None
    title = normalize_tmdb_collection_name(raw.get("title") or raw.get("name") or raw.get("original_title"))
    if movie_id <= 0 or not title:
        return None
    return {
        "id": movie_id,
        "title": title,
        "name": title,
        "media_type": "movie",
        "poster_path": str(raw.get("poster_path") or ""),
        "backdrop_path": str(raw.get("backdrop_path") or ""),
        "overview": str(raw.get("overview") or ""),
        "release_date": str(raw.get("release_date") or ""),
        "date": str(raw.get("release_date") or ""),
        "genre_ids": normalize_collection_genre_ids(raw.get("genre_ids")),
        "original_language": str(raw.get("original_language") or "").strip().lower(),
        "vote_average": float(raw.get("vote_average") or 0.0),
        "popularity": float(raw.get("popularity") or 0.0),
        "adult": raw.get("adult") is True,
    }


def collection_part_release_year(movie: dict[str, Any]) -> int:
    release_date = str(movie.get("release_date") or movie.get("date") or "")
    match = re.match(r"^((?:18|19|20|21)[0-9]{2})", release_date)
    return int(match.group(1)) if match else 0


def compute_tmdb_collection_metadata(parts: list[dict[str, Any]]) -> dict[str, Any]:
    genre_ids: list[int] = []
    seen_genres: set[int] = set()
    decades: list[int] = []
    seen_decades: set[int] = set()
    release_years: list[int] = []
    popularity_total = 0.0
    popularity_count = 0
    rating_total = 0.0
    rating_count = 0
    for movie in parts:
        for genre_id in normalize_collection_genre_ids(movie.get("genre_ids")):
            if genre_id not in seen_genres:
                seen_genres.add(genre_id)
                genre_ids.append(genre_id)
        year = collection_part_release_year(movie)
        if year:
            release_years.append(year)
            decade = (year // 10) * 10
            if decade not in seen_decades:
                seen_decades.add(decade)
                decades.append(decade)
        popularity = float(movie.get("popularity") or 0.0)
        if popularity > 0:
            popularity_total += popularity
            popularity_count += 1
        rating = float(movie.get("vote_average") or 0.0)
        if rating > 0:
            rating_total += rating
            rating_count += 1
    return {
        "genre_ids": sorted(genre_ids),
        "decades": sorted(decades, reverse=True),
        "average_popularity": popularity_total / popularity_count if popularity_count else 0.0,
        "average_rating": rating_total / rating_count if rating_count else 0.0,
        "newest_release_year": max(release_years) if release_years else 0,
        "oldest_release_year": min(release_years) if release_years else 0,
    }


def normalize_tmdb_collection_detail(raw: Any, *, include_parts: bool = False) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    try:
        collection_id = int(raw.get("id") or 0)
    except (TypeError, ValueError):
        return None
    name = normalize_tmdb_collection_name(raw.get("name"))
    if collection_id <= 0 or not name:
        return None
    seen_movies: set[int] = set()
    parts: list[dict[str, Any]] = []
    for raw_part in raw.get("parts") if isinstance(raw.get("parts"), list) else []:
        part = normalize_tmdb_collection_movie_part(raw_part)
        if not part or int(part["id"]) in seen_movies:
            continue
        seen_movies.add(int(part["id"]))
        parts.append(part)
    if not parts:
        return None
    poster_paths = [str(movie.get("poster_path") or "") for movie in parts if movie.get("poster_path")][:3]
    if not poster_paths and raw.get("poster_path"):
        poster_paths.append(str(raw.get("poster_path")))
    poster_slots = [
        {
            "id": int(movie.get("id") or 0),
            "title": str(movie.get("title") or movie.get("name") or ""),
            "name": str(movie.get("title") or movie.get("name") or ""),
            "poster_path": str(movie.get("poster_path") or ""),
            "release_date": str(movie.get("release_date") or movie.get("date") or ""),
            "date": str(movie.get("release_date") or movie.get("date") or ""),
        }
        for movie in parts[:3]
    ]
    metadata = compute_tmdb_collection_metadata(parts)
    summary: dict[str, Any] = {
        "id": collection_id,
        "name": name,
        "title": name,
        "overview": str(raw.get("overview") or ""),
        "poster_path": str(raw.get("poster_path") or ""),
        "backdrop_path": str(raw.get("backdrop_path") or ""),
        "poster_paths": poster_paths,
        "poster_slots": poster_slots,
        "movie_count": len(parts),
        "route": f"/app/collection/{collection_id}-{slugify_tmdb_collection_label(name)}",
        **metadata,
    }
    if include_parts:
        summary["parts"] = parts
    return summary


def tmdb_collection_cache_is_stale(cache: dict[str, Any]) -> bool:
    export_checked_at = float(cache.get("export_checked_at") or 0.0)
    return not export_checked_at or time.time() - export_checked_at >= TMDB_COLLECTION_EXPORT_CACHE_TTL_SECONDS


def update_collection_cache_from_export(cache: dict[str, Any]) -> dict[str, Any]:
    if cache.get("collection_ids") and not tmdb_collection_cache_is_stale(cache):
        return cache
    records, source_date = latest_tmdb_collection_export_records()
    export_ids = [int(item["id"]) for item in records]
    current_collections = [item for item in cache.get("collections") or [] if isinstance(item, dict) and item.get("id")]
    valid_ids = set(export_ids)
    kept_collections = [item for item in current_collections if int(item.get("id") or 0) in valid_ids]
    cache.update({
        "version": TMDB_COLLECTION_INDEX_VERSION,
        "source_date": source_date,
        "export_checked_at": time.time(),
        "indexed_at": float(cache.get("indexed_at") or 0.0),
        "cursor": 0,
        "total_ids": len(export_ids),
        "collection_ids": export_ids,
        "collections": kept_collections,
    })
    write_tmdb_collection_index_cache(cache)
    return cache


def tmdb_collection_summary_has_poster_slots(summary: dict[str, Any]) -> bool:
    if not isinstance(summary, dict):
        return False
    slots = summary.get("poster_slots")
    if not isinstance(slots, list) or not slots:
        return False
    try:
        movie_count = int(summary.get("movie_count") or 0)
    except (TypeError, ValueError):
        movie_count = 0
    target_count = min(3, max(movie_count, 1))
    usable_slots = [
        slot for slot in slots[:target_count]
        if isinstance(slot, dict) and (str(slot.get("poster_path") or "").strip() or str(slot.get("title") or slot.get("name") or "").strip())
    ]
    return len(usable_slots) >= target_count


def build_tmdb_collection_index_batch() -> None:
    try:
        cache = update_collection_cache_from_export(read_tmdb_collection_index_cache())
        collection_ids = [int(value) for value in cache.get("collection_ids") or [] if str(value).isdigit()]
        if not collection_ids:
            return
        collection_map: dict[int, dict[str, Any]] = {}
        for item in cache.get("collections") or []:
            try:
                collection_map[int(item.get("id") or 0)] = item
            except (TypeError, ValueError):
                continue
        cursor = max(0, min(int(cache.get("cursor") or 0), len(collection_ids)))
        processed = 0
        while cursor < len(collection_ids) and processed < TMDB_COLLECTION_INDEX_BATCH_SIZE:
            collection_id = int(collection_ids[cursor])
            cursor += 1
            if collection_id in collection_map and tmdb_collection_summary_has_poster_slots(collection_map[collection_id]):
                continue
            try:
                raw_detail = fetch_tmdb_collection_detail(collection_id)
                summary = normalize_tmdb_collection_detail(raw_detail, include_parts=False)
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, RuntimeError):
                summary = None
            if summary:
                collection_map[collection_id] = summary
            processed += 1
        collections = sorted(collection_map.values(), key=lambda item: str(item.get("name") or "").casefold())
        cache.update({
            "indexed_at": time.time(),
            "cursor": cursor,
            "total_ids": len(collection_ids),
            "collections": collections,
        })
        write_tmdb_collection_index_cache(cache)
    except Exception as error:
        with TMDB_COLLECTION_INDEX_LOCK:
            TMDB_COLLECTION_INDEX_BUILD_STATE["last_error"] = str(error)
        raise


def start_tmdb_collection_index_build() -> bool:
    with TMDB_COLLECTION_INDEX_LOCK:
        if TMDB_COLLECTION_INDEX_BUILD_STATE.get("building"):
            return False
        TMDB_COLLECTION_INDEX_BUILD_STATE.update({
            "building": True,
            "started_at": time.time(),
            "last_error": "",
        })

    def runner() -> None:
        try:
            build_tmdb_collection_index_batch()
        except Exception:
            pass
        finally:
            with TMDB_COLLECTION_INDEX_LOCK:
                TMDB_COLLECTION_INDEX_BUILD_STATE["building"] = False

    thread = threading.Thread(target=runner, name="tmdb-collection-index", daemon=True)
    thread.start()
    return True


def collection_index_building() -> bool:
    with TMDB_COLLECTION_INDEX_LOCK:
        return bool(TMDB_COLLECTION_INDEX_BUILD_STATE.get("building"))


def get_tmdb_collection_index_response() -> dict[str, Any]:
    cache = read_tmdb_collection_index_cache()
    total_ids = int(cache.get("total_ids") or 0)
    cursor = int(cache.get("cursor") or 0)
    collections = [item for item in cache.get("collections") or [] if isinstance(item, dict) and item.get("id")]
    needs_poster_slot_backfill = any(
        not tmdb_collection_summary_has_poster_slots(item)
        for item in collections
        if isinstance(item, dict) and int(item.get("movie_count") or 0) >= 2
    )
    should_build = (not collections) or tmdb_collection_cache_is_stale(cache) or needs_poster_slot_backfill or (total_ids and cursor < total_ids)
    if needs_poster_slot_backfill and not collection_index_building():
        cache["cursor"] = 0
        cache["updated_at"] = time.time()
        write_tmdb_collection_index_cache(cache)
    if should_build:
        start_tmdb_collection_index_build()
    return {
        "ok": True,
        "collections": collections,
        "building": collection_index_building(),
        "source_date": str(cache.get("source_date") or ""),
        "indexed_count": len(collections),
        "total_ids": total_ids,
        "cursor": cursor,
    }


def get_cached_tmdb_collection_summary(collection_id: int) -> dict[str, Any] | None:
    cache = read_tmdb_collection_index_cache()
    for item in cache.get("collections") or []:
        try:
            if int(item.get("id") or 0) == int(collection_id):
                return item
        except (TypeError, ValueError):
            continue
    return None

def fetch_tmdb_notification_json(
    tmdb_path: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not TMDB_PATH_RE.fullmatch(tmdb_path):
        raise RuntimeError("Invalid TMDB notification path")

    query_items: list[tuple[str, str]] = []
    for key, value in (params or {}).items():
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            query_items.extend((str(key), str(item)) for item in value)
        else:
            query_items.append((str(key), str(value)))
    query_items.append(("api_key", required_env("TMDB_API_KEY")))

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
            payload = json.loads(upstream.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("TMDB notification request failed") from error
    if not isinstance(payload, dict):
        raise RuntimeError("TMDB notification response was invalid")
    return payload


def run_notification_check(now: datetime | None = None) -> dict[str, Any]:
    return execute_notification_check(
        database_connection,
        fetch_tmdb_notification_json,
        now,
    )


def create_app() -> Flask:
    app = Flask(__name__)
    if env_flag("TRUST_PROXY_HEADERS"):
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
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'",
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
            preserve_explicit_cache_control = (
                request.endpoint == "tmdb_proxy"
                and bool(response.headers.get("Cache-Control"))
            )
            if not preserve_explicit_cache_control:
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
            return redirect("/app/list/watching")
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
            return redirect("/app/list/watching")
        return redirect(url_for("login"))

    @app.get("/app")
    @app.get("/app/")
    @login_required
    def app_root():
        return redirect("/app/list/watching")

    def render_app_shell(initial_app_path: str):
        return render_template(
            "index.html",
            csrf_token=session["csrf_token"],
            initial_app_path=initial_app_path,
        )

    def redirect_app_path_preserving_query(path: str):
        query = request.query_string.decode("utf-8", errors="ignore")
        return redirect(path + (("?" + query) if query else ""))

    @app.get("/app/upcoming", strict_slashes=False)
    @app.get("/app/history", strict_slashes=False)
    @app.get("/app/discover", strict_slashes=False)
    @app.get("/app/search", strict_slashes=False)
    @app.get("/app/profile", strict_slashes=False)
    @app.get("/app/settings", strict_slashes=False)
    @app.get("/app/notifications", strict_slashes=False)
    @app.get("/app/notifications/settings", strict_slashes=False)
    @login_required
    def app_section_page():
        requested_path = request.path.rstrip("/")
        if requested_path not in APP_SECTION_PATHS:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)


    @app.get("/app/discover/<media_type>/<category_slug>", strict_slashes=False)
    @login_required
    def app_discover_category_page(media_type: str, category_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/browse/<media_type>", strict_slashes=False)
    @login_required
    def app_browse_page(media_type: str):
        requested_path = request.path.rstrip("/")
        if APP_BROWSE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/list/<list_slug>", strict_slashes=False)
    @login_required
    def app_list_page(list_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_LIST_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)


    @app.get("/app/genre/<genre_media>/<genre_slug>", strict_slashes=False)
    @login_required
    def app_genre_page(genre_media: str, genre_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_GENRE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/network/<network_key>", strict_slashes=False)
    @login_required
    def app_network_page(network_key: str):
        requested_path = request.path.rstrip("/")
        if APP_NETWORK_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/language/<media_type>/<language_code>", strict_slashes=False)
    @login_required
    def app_language_page(media_type: str, language_code: str):
        requested_path = request.path.rstrip("/")
        if APP_LANGUAGE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/country/<media_type>/<country_code>", strict_slashes=False)
    @login_required
    def app_country_page(media_type: str, country_code: str):
        requested_path = request.path.rstrip("/")
        if APP_COUNTRY_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/theme/<media_type>/<theme_key>", strict_slashes=False)
    @login_required
    def app_theme_page(media_type: str, theme_key: str):
        requested_path = request.path.rstrip("/")
        if APP_THEME_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/movie/<movie_key>", strict_slashes=False)
    @login_required
    def app_movie_page(movie_key: str):
        requested_path = request.path.rstrip("/")
        if APP_MOVIE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/company/<media_type>/<company_key>", strict_slashes=False)
    @login_required
    def app_company_page(media_type: str, company_key: str):
        requested_path = request.path.rstrip("/")
        if APP_COMPANY_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/provider/<media_type>/<provider_key>", strict_slashes=False)
    @login_required
    def app_provider_page(media_type: str, provider_key: str):
        requested_path = request.path.rstrip("/")
        if APP_PROVIDER_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/year/<media_type>/<int:year_value>", strict_slashes=False)
    @login_required
    def app_year_page(media_type: str, year_value: int):
        requested_path = request.path.rstrip("/")
        if APP_YEAR_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/status/<status_slug>", strict_slashes=False)
    @login_required
    def app_status_page(status_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_STATUS_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/certification/<media_type>/<certification_slug>", strict_slashes=False)
    @login_required
    def app_certification_page(media_type: str, certification_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_CERTIFICATION_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/collections", strict_slashes=False)
    @login_required
    def app_collections_page():
        requested_path = request.path.rstrip("/")
        if APP_COLLECTIONS_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/collection/<collection_key>", strict_slashes=False)
    @login_required
    def app_collection_page(collection_key: str):
        requested_path = request.path.rstrip("/")
        if APP_COLLECTION_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/person/<person_key>", strict_slashes=False)
    @login_required
    def app_person_page(person_key: str):
        requested_path = request.path.rstrip("/")
        if APP_PERSON_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/show/<show_key>", strict_slashes=False)
    @login_required
    def app_show_page(show_key: str):
        requested_path = request.path.rstrip("/")
        if APP_SHOW_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get(
        "/app/show/<show_key>/season/<int:season_number>/episode/<int:episode_number>",
        strict_slashes=False,
    )
    @login_required
    def app_episode_page(
        show_key: str,
        season_number: int,
        episode_number: int,
    ):
        requested_path = request.path.rstrip("/")
        if (
            APP_EPISODE_PATH_RE.fullmatch(requested_path) is None
            or season_number < 0
            or episode_number <= 0
        ):
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/<path:app_path>", strict_slashes=False)
    @login_required
    def app_valid_spa_fallback(app_path: str):
        requested_path = request.path.rstrip("/")
        if not valid_app_path(requested_path):
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/robots.txt")
    def robots():
        return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")

    @app.get("/healthz")
    def healthz():
        expected_token = os.environ.get("HEALTHZ_SECRET", "").strip()
        supplied_token = request.headers.get("X-Healthcheck-Token", "")
        if expected_token and not hmac.compare_digest(expected_token, supplied_token):
            return jsonify({"ok": False}), 404

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
            if len(new_password) < MIN_ADMIN_PASSWORD_CHARS:
                return jsonify({
                    "ok": False,
                    "error": f"New password must contain at least {MIN_ADMIN_PASSWORD_CHARS} characters",
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

    @app.get("/api/notifications/status")
    @login_required
    def notification_status_api():
        return jsonify({"ok": True, **get_notification_status(database_connection)})

    @app.get("/api/notifications")
    @login_required
    def notifications_api():
        return jsonify({
            "ok": True,
            "notifications": get_notification_records(database_connection),
        })

    @app.post("/api/notifications/read-all")
    @login_required
    def notifications_read_all_api():
        check_csrf()
        changed = mark_notifications_read(database_connection)
        return jsonify({"ok": True, "updated": changed})

    @app.delete("/api/notifications/<int:notification_id>")
    @login_required
    def notification_delete_api(notification_id: int):
        check_csrf()
        if notification_id <= 0 or not delete_notification_record(
            database_connection, notification_id
        ):
            return jsonify({
                "ok": False,
                "error": "Notification not found",
                "code": "not_found",
            }), 404
        return jsonify({"ok": True})

    @app.get("/api/notifications/settings")
    @login_required
    def notification_settings_api():
        settings = get_notification_settings(database_connection)
        return jsonify({
            "ok": True,
            "settings": serialize_notification_settings(settings),
        })

    @app.patch("/api/notifications/settings")
    @login_required
    def notification_settings_patch_api():
        check_csrf()
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({
                "ok": False,
                "error": "Invalid notification settings",
                "code": "invalid_notification_settings",
            }), 400
        try:
            settings = patch_notification_settings(database_connection, payload)
        except ValueError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
                "code": "invalid_notification_settings",
            }), 400
        return jsonify({
            "ok": True,
            "settings": serialize_notification_settings(settings),
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
                        "reset": True,
                        "conflict": True,
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

    @app.get("/api/tmdb/collections")
    @login_required
    def tmdb_collections_index():
        try:
            return jsonify(get_tmdb_collection_index_response())
        except Exception:
            app.logger.exception("TMDB collection index failed")
            cache = read_tmdb_collection_index_cache()
            collections = [item for item in cache.get("collections") or [] if isinstance(item, dict) and item.get("id")]
            if collections:
                return jsonify({
                    "ok": True,
                    "collections": collections,
                    "building": collection_index_building(),
                    "source_date": str(cache.get("source_date") or ""),
                    "indexed_count": len(collections),
                    "total_ids": int(cache.get("total_ids") or 0),
                    "cursor": int(cache.get("cursor") or 0),
                })
            return jsonify({
                "ok": False,
                "error": "Collections are temporarily unavailable",
                "code": "collection_index_unavailable",
            }), 502

    @app.get("/api/tmdb/collections/<int:collection_id>")
    @login_required
    def tmdb_collection_detail(collection_id: int):
        if collection_id <= 0:
            abort(404)
        try:
            raw_detail = fetch_tmdb_collection_detail(collection_id)
            collection = normalize_tmdb_collection_detail(raw_detail, include_parts=True)
            if not collection:
                abort(404)
            return jsonify(collection)
        except HTTPError as error:
            if error.code == 404:
                abort(404)
            app.logger.exception("TMDB collection detail failed")
            cached = get_cached_tmdb_collection_summary(collection_id)
            if cached:
                return jsonify(dict(cached, parts=[]))
            return jsonify({
                "ok": False,
                "error": "Collection is temporarily unavailable",
                "code": "collection_unavailable",
            }), 502
        except (URLError, TimeoutError, OSError, ValueError):
            app.logger.exception("TMDB collection detail failed")
            cached = get_cached_tmdb_collection_summary(collection_id)
            if cached:
                return jsonify(dict(cached, parts=[]))
            return jsonify({
                "ok": False,
                "error": "Collection is temporarily unavailable",
                "code": "collection_unavailable",
            }), 502

    @app.get("/api/tmdb/network-search")
    @login_required
    def tmdb_network_search():
        query = str(request.args.get("q") or "").strip()[:TMDB_NETWORK_SEARCH_QUERY_MAX_CHARS]
        if len(normalize_tmdb_network_search_text(query)) < 2:
            return jsonify({"results": [], "source_date": ""})
        try:
            results, source_date = search_tmdb_network_export(query)
        except RuntimeError:
            app.logger.exception("TMDB network export search failed")
            return jsonify({
                "ok": False,
                "error": "Network search is temporarily unavailable",
                "code": "network_index_unavailable",
            }), 502
        return jsonify({
            "results": results,
            "source_date": source_date,
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
