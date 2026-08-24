from __future__ import annotations

import gzip
import hmac
import json
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
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
from tvtracker.media.tmdb_client import fetch_tmdb_notification_json
from tvtracker.media.tmdb_exports import (
    TMDB_NETWORK_SEARCH_QUERY_MAX_CHARS,
    build_tmdb_collection_index_batch,
    collection_index_building,
    fetch_tmdb_collection_detail,
    get_cached_tmdb_collection_summary,
    get_tmdb_collection_index_response,
    get_tmdb_network_export_records,
    normalize_tmdb_collection_detail,
    normalize_tmdb_network_search_text,
    read_tmdb_collection_index_cache,
    search_tmdb_network_export,
    start_tmdb_collection_index_build,
)
from tvtracker.media.tmdb_proxy import (
    TMDB_PROXY_CACHE,
    TMDB_PROXY_CACHE_BUSTER_PARAMS,
    TMDB_PROXY_CACHE_LOCK,
    TMDB_PROXY_CACHE_TTL,
    TMDB_PROXY_PATH_SHAPES,
    tmdb_proxy_cached_body,
    tmdb_proxy_path_group,
    tmdb_proxy_store_cached_body,
    tmdb_proxy_validated_params,
)
from tvtracker.notifications.backend import (
    delete_notification as delete_notification_record,
    list_notifications as get_notification_records,
    mark_all_notifications_read as mark_notifications_read,
    mark_notification_read as mark_notification_read_record,
    notification_status as get_notification_status,
    read_notification_settings as get_notification_settings,
    run_notification_check as execute_notification_check,
    serialize_notification_settings,
    update_notification_settings as patch_notification_settings,
)
from tvtracker.migrations import (
    DATABASE_SCHEMA_VERSION,
    MIGRATIONS,
    run_migrations,
)
from tvtracker.sync.change_log import (
    change_log_has_gap,
    current_revision,
    deltas_conflict,
    fetch_change_rows,
    merge_history_order,
    normalize_delta,
    serialize_change_rows,
)
from tvtracker.sync.state_patch import apply_state_patch
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
}

SETTINGS_SECTION_PATHS = {
    "/app/settings/auth",
    "/app/settings/danger-zone",
    "/app/settings/data",
    "/app/settings/notifications",
    "/app/settings/profile",
    "/app/settings/streaming",
}
ERROR_PAGE_MESSAGES = {
    404: ("Are you lost?", ""),
    500: ("Houston, we have a problem", "Something went wrong. Try again in a moment."),
}
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
SYNC_WINDOW_SECONDS = 60
SYNC_MAX_REQUESTS = 180
SYNC_REQUESTS: dict[str, deque[float]] = defaultdict(deque)
SYNC_LOCK = threading.Lock()
# TMDB export/index caches live in tvtracker.media.tmdb_exports.
# Backup validation primitives and limits live in tvtracker.backup.primitives.


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
    """Apply migration-owned core DDL, then preserve admin startup validation.

    Migration-owned notification declarations include:
    CREATE TABLE IF NOT EXISTS tv_tracker_notifications
    CREATE TABLE IF NOT EXISTS tv_tracker_notification_settings
    CREATE TABLE IF NOT EXISTS tv_tracker_notification_baseline
    CREATE TABLE IF NOT EXISTS tv_tracker_notification_events
    """

    run_migrations(database_connection, MIGRATIONS)
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


def cleanup_stored_tracker_data() -> None:
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
    if candidate in SETTINGS_SECTION_PATHS:
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
    @login_required
    def app_section_page():
        requested_path = request.path.rstrip("/")
        if requested_path not in APP_SECTION_PATHS:
            abort(404)
        if requested_path == "/app/settings":
            return redirect_app_path_preserving_query("/app/settings/profile")
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/settings/<settings_section>", strict_slashes=False)
    @login_required
    def app_settings_section_page(settings_section: str):
        requested_path = request.path.rstrip("/")
        if requested_path not in SETTINGS_SECTION_PATHS:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/notifications/settings", strict_slashes=False)
    @login_required
    def legacy_notification_settings_page():
        return redirect_app_path_preserving_query("/app/settings/notifications")


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
        payload = {"ok": status["ok"]}
        if RELEASE_SHA is not None:
            payload["releaseSha"] = RELEASE_SHA
        return jsonify(payload), 200 if status["ok"] else 503

    @app.get("/api/health")
    @login_required
    def health():
        status = tracker_health_status()
        response = jsonify({
            "ok": status["ok"],
            "app": APP_NAME,
            "database": status["database"],
            "schemaVersion": status["schemaVersion"],
            "releaseSha": RELEASE_SHA,
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

    @app.post("/api/notifications/<int:notification_id>/read")
    @login_required
    def notification_read_api(notification_id: int):
        check_csrf()
        if notification_id <= 0 or not mark_notification_read_record(
            database_connection, notification_id
        ):
            return jsonify({
                "ok": False,
                "error": "Notification not found",
            }), 404
        return jsonify({"ok": True})

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
        body, status_code = apply_state_patch(
            payload,
            connection_factory=database_connection,
            validate_delta=validate_sync_delta_payload,
            find_duplicate_history_ids=find_logical_duplicate_history_ids,
            validation_errors=(BackupValidationError,),
        )
        return jsonify(body), status_code

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
        group = tmdb_proxy_path_group(tmdb_path)
        if group is None:
            invalid_id = any(
                regex.fullmatch(tmdb_path) for regex, _group in TMDB_PROXY_PATH_SHAPES
            )
            if invalid_id:
                return jsonify({
                    "ok": False,
                    "error": "TMDB id in path is invalid",
                    "code": "tmdb_invalid_id",
                }), 400
            return jsonify({
                "ok": False,
                "error": "TMDB endpoint is not allowed",
                "code": "tmdb_endpoint_not_allowed",
            }), 403

        validated_items = tmdb_proxy_validated_params(group, request.args)
        cache_busted = any(
            key in TMDB_PROXY_CACHE_BUSTER_PARAMS for key in request.args
        )
        cache_key = tmdb_path
        if validated_items:
            cache_key += "?" + urlencode(sorted(validated_items))
        if not cache_busted:
            cached = tmdb_proxy_cached_body(cache_key)
            if cached is not None:
                response = Response(cached, status=200, mimetype="application/json")
                response.headers["Cache-Control"] = "private, max-age=300"
                return response

        api_key = required_env("TMDB_API_KEY")
        query_items = validated_items + [("api_key", api_key)]
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
                if upstream.status == 200 and not cache_busted:
                    tmdb_proxy_store_cached_body(cache_key, content)
                return response
        except HTTPError as error:
            content = error.read()
            response = Response(
                content or b'{"status_message":"TMDB request failed"}',
                status=error.code,
                mimetype="application/json",
            )
            retry_after = error.headers.get("Retry-After") if error.headers else None
            if retry_after:
                response.headers["Retry-After"] = str(retry_after)
            return response
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
