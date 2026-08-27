from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import psycopg
from flask import Flask, session
from werkzeug.middleware.proxy_fix import ProxyFix

# urlopen is re-exported so patch.object(app, "urlopen", ...) keeps intercepting
# upstream TMDB requests through the deps seam in tvtracker/web/routes.py.

from tvtracker.auth import security as auth_security
from tvtracker.auth.security import (
    MIN_ADMIN_PASSWORD_CHARS,
    PASSWORD_HASHER,
    check_csrf,
    client_key,
    invalidate_admin_account_cache,
)
from tvtracker.backup import storage as backup_storage
from tvtracker.backup import validation as backup_validation
from tvtracker.backup.primitives import (
    BackupValidationError,
    backup_int,
    validate_calendar_date,
    validate_json_value,
)
from tvtracker.backup.validation import (
    validate_history_record,
    validate_profile_record,
    validate_state_record,
    validate_sync_delta_payload,
    validate_tracker_data,
)
from tvtracker.infrastructure.static_assets import install_static_asset_versioning
from tvtracker.media.tmdb_client import fetch_tmdb_notification_json
from tvtracker.media.tmdb_proxy import (
    TMDB_PROXY_CACHE,
    TMDB_PROXY_CACHE_LOCK,
    TMDB_PROXY_CACHE_TTL,
)
from tvtracker.notifications.backend import (
    run_notification_check as execute_notification_check,
)
from tvtracker.migrations import (
    DATABASE_SCHEMA_VERSION,
    MIGRATIONS,
    run_migrations,
    verify_migrations_current,
)
from tvtracker.sync.change_log import deltas_conflict, normalize_delta
from tvtracker.sync.state_patch import apply_state_patch
from tvtracker.sync.throttle import sync_request_is_limited
from tvtracker.tracker.history import (
    clean_legacy_metadata,
    dedupe_history_by_episode,
    find_logical_duplicate_history_ids,
    generated_history_id,
    history_episode_identity,
)
from tvtracker.tracker.state import (
    cleanup_stored_tracker_data as cleanup_stored_tracker_data_state,
    read_tracker_data as read_tracker_data_state,
)
from tvtracker.web.routes import register_routes
from tvtracker.web.routing import (
    # Route-path regex re-exports kept for patch-compatible source contracts;
    # the canonical definitions live in tvtracker/web/routing.py.
    APP_BROWSE_PATH_RE,
    APP_GENRE_PATH_RE,
    APP_THEME_PATH_RE,
    safe_next_url,
)


APP_NAME = "TV Tracker"
BACKUP_VERSION = 2
# Native backup payload compatibility. Database DDL has its own version.
SCHEMA_VERSION = 5
RELEASE_SHA_PATTERN = re.compile(r"^[0-9a-fA-F]{40}$")


def load_release_sha(marker_path: Path | None = None) -> str | None:
    configured = os.environ.get("TVTRACKER_RELEASE_SHA")
    if configured is not None:
        candidate = configured.strip()
    else:
        path = marker_path or Path(__file__).with_name(".tvtracker-release-sha")
        try:
            candidate = path.read_text(encoding="ascii").strip()
        except (OSError, UnicodeError):
            return None
    return candidate.lower() if RELEASE_SHA_PATTERN.fullmatch(candidate) else None


# Captured once so an old process cannot report a marker written for a new release.
RELEASE_SHA = load_release_sha()
SUPPORTED_BACKUP_VERSIONS = {1, BACKUP_VERSION}
MAX_BODY_BYTES = 40 * 1024 * 1024
# TMDB proxy allowlist, validation, and cache live in tvtracker.media.tmdb_proxy.
# These names stay importable from app for patch-compatible tests and tools.
def authenticated() -> bool:
    return auth_security.is_authenticated(session, read_admin_account)


def login_required(view):
    return auth_security.login_required(
        view, is_authenticated=authenticated, safe_next_url=safe_next_url
    )


def read_admin_account(*, force: bool = False) -> dict[str, Any]:
    return auth_security.read_admin_account(database_connection, force=force)


def security_event_count(event_type: str, key: str, window_seconds: int) -> int:
    return auth_security.security_event_count(
        database_connection, event_type, key, window_seconds
    )


def record_security_event(event_type: str, key: str) -> None:
    return auth_security.record_security_event(database_connection, event_type, key)


def clear_security_events(event_type: str, key: str) -> None:
    return auth_security.clear_security_events(database_connection, event_type, key)


def login_is_limited(key: str) -> bool:
    return auth_security.login_is_limited(database_connection, key)


def record_login_failure(key: str) -> None:
    return auth_security.record_login_failure(database_connection, key)


def clear_login_failures(key: str) -> None:
    return auth_security.clear_login_failures(database_connection, key)


def account_change_is_limited(key: str) -> bool:
    return auth_security.account_change_is_limited(database_connection, key)


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


def _ensure_admin_account() -> None:
    with database_connection() as connection:
        with connection.cursor() as cursor:
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


def ensure_schema() -> None:
    """Fail closed unless explicit migrations already match this application.

    The historical function name remains for patch-compatible tests and tools,
    but web-process startup no longer applies DDL. Deployment and operators run
    ``python -m tvtracker.migrations`` before activation; workers only verify the
    ledger, schema version, and canonical schema contract before serving traffic.
    """

    verify_migrations_current(database_connection, MIGRATIONS)
    _ensure_admin_account()


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
        "ok": database_ok and schema_version == DATABASE_SCHEMA_VERSION,
        "database": database_ok,
        "schemaVersion": schema_version,
    }


def read_tracker_data() -> tuple[dict[str, Any], int]:
    return read_tracker_data_state(database_connection)


def cleanup_stored_tracker_data() -> int:
    """Compatibility wrapper for the explicit legacy cleanup operation."""
    return cleanup_stored_tracker_data_state(database_connection)


def validate_and_normalize_backup(backup: Any) -> tuple[dict[str, Any], dict[str, int]]:
    return backup_validation.validate_and_normalize_backup(
        backup,
        backup_app_name=APP_NAME,
        max_schema_version=SCHEMA_VERSION,
        supported_backup_versions=SUPPORTED_BACKUP_VERSIONS,
    )


def replace_tracker_data_transactionally(data: dict[str, Any]) -> int:
    return backup_storage.replace_tracker_data_transactionally(data, database_connection)


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
    register_routes(app, deps=sys.modules[__name__])
    install_static_asset_versioning(app)
    return app


app = create_app()

# Optional release-timing integration is installed after the core app exists so
# deleting its modules can never prevent Flask from constructing TV Tracker.
try:
    from tvtracker.release_timing.routes import install_release_timing_routes
    install_release_timing_routes(
        app,
        login_required=login_required,
        connection_factory=database_connection,
        tmdb_fetcher=fetch_tmdb_notification_json,
    )
except (ImportError, OSError, RuntimeError):
    app.logger.exception("Optional release timing integration unavailable; using core fallback")
