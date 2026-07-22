from __future__ import annotations

import gzip
import hmac
import json
import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
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
MAX_BODY_BYTES = 40 * 1024 * 1024
TMDB_PATH_RE = re.compile(r"^[A-Za-z0-9_./-]+$")
PASSWORD_HASHER = PasswordHasher()
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
LOGIN_ATTEMPTS: dict[str, deque[float]] = defaultdict(deque)
LOGIN_LOCK = threading.Lock()
SYNC_WINDOW_SECONDS = 60
SYNC_MAX_REQUESTS = 180
SYNC_REQUESTS: dict[str, deque[float]] = defaultdict(deque)
SYNC_LOCK = threading.Lock()
CHANGE_LOG_RETENTION_REVISIONS = 5000
CHANGE_LOG_RETENTION_DAYS = 30
OPERATION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")


def required_env(name: str, *, strip: bool = True) -> str:
    value = os.environ.get(name, "")
    if strip:
        value = value.strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


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

    CREATE INDEX IF NOT EXISTS tv_tracker_changes_created_at_idx
    ON tv_tracker_changes (created_at);

    INSERT INTO tv_tracker_meta (singleton_id, revision)
    VALUES (1, 0)
    ON CONFLICT (singleton_id) DO NOTHING;
    """

    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(statements)
        connection.commit()


def current_revision(cursor: psycopg.Cursor[Any]) -> int:
    cursor.execute(
        "SELECT revision FROM tv_tracker_meta WHERE singleton_id = 1"
    )
    row = cursor.fetchone()
    return int(row[0] if row else 0)


def read_tracker_data() -> tuple[dict[str, Any], int]:
    with database_connection() as connection:
        with connection.cursor() as cursor:
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
    return data, revision


def check_csrf() -> None:
    expected = str(session.get("csrf_token", ""))
    supplied = str(
        request.headers.get("X-CSRF-Token")
        or request.form.get("csrf_token")
        or ""
    )

    if not expected or not supplied or not hmac.compare_digest(expected, supplied):
        abort(403)


def authenticated() -> bool:
    return session.get("authenticated") is True


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not authenticated():
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "error": "Authentication required"}), 401
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)

    return wrapped


def client_key() -> str:
    return request.remote_addr or "unknown"


def login_is_limited(key: str) -> bool:
    now = time.monotonic()
    cutoff = now - LOGIN_WINDOW_SECONDS

    with LOGIN_LOCK:
        attempts = LOGIN_ATTEMPTS[key]
        while attempts and attempts[0] < cutoff:
            attempts.popleft()
        return len(attempts) >= LOGIN_MAX_ATTEMPTS


def record_login_failure(key: str) -> None:
    with LOGIN_LOCK:
        LOGIN_ATTEMPTS[key].append(time.monotonic())


def clear_login_failures(key: str) -> None:
    with LOGIN_LOCK:
        LOGIN_ATTEMPTS.pop(key, None)


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


def safe_next_url(value: str | None) -> str:
    candidate = str(value or "")
    if candidate.startswith("/") and not candidate.startswith("//"):
        return candidate
    return "/"


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
                "connect-src 'self' https://api.tvmaze.com",
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

        if request.path.startswith("/api/") or request.path in {"/", "/login"}:
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
            return redirect("/")
        return render_template(
            "login.html",
            csrf_token=session["csrf_token"],
            next_url=safe_next_url(request.args.get("next")),
            error="",
        )

    @app.post("/login")
    def login_post():
        check_csrf()
        key = client_key()

        if login_is_limited(key):
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                next_url=safe_next_url(request.form.get("next")),
                error="Too many failed attempts. Try again later.",
            ), 429

        username = str(request.form.get("username", ""))
        password = str(request.form.get("password", ""))
        expected_username = required_env("APP_USERNAME")
        password_hash = required_env("APP_PASSWORD_HASH")
        valid_username = hmac.compare_digest(username, expected_username)
        valid_password = False

        try:
            valid_password = PASSWORD_HASHER.verify(password_hash, password)
        except (VerifyMismatchError, InvalidHashError):
            valid_password = False

        if not (valid_username and valid_password):
            record_login_failure(key)
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                next_url=safe_next_url(request.form.get("next")),
                error="Invalid username or password.",
            ), 401

        clear_login_failures(key)
        destination = safe_next_url(request.form.get("next"))
        session.clear()
        session["authenticated"] = True
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
    @login_required
    def index():
        return render_template("index.html", csrf_token=session["csrf_token"])

    @app.get("/robots.txt")
    def robots():
        return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")

    @app.get("/api/health")
    @login_required
    def health():
        return jsonify({"ok": True, "app": APP_NAME})

    @app.get("/api/state")
    @login_required
    def get_state():
        data, revision = read_tracker_data()
        return jsonify({"ok": True, "revision": revision, "data": data})

    @app.get("/api/revision")
    @login_required
    def get_revision():
        if sync_request_is_limited(client_key()):
            return jsonify({"ok": False, "error": "Too many sync requests"}), 429

        with database_connection() as connection:
            with connection.cursor() as cursor:
                revision = current_revision(cursor)

        return jsonify({"ok": True, "revision": revision})

    @app.get("/api/changes")
    @login_required
    def get_changes():
        if sync_request_is_limited(client_key()):
            return jsonify({"ok": False, "error": "Too many sync requests"}), 429

        try:
            since_revision = int(request.args.get("since", "0"))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Invalid revision"}), 400

        raw_limit = request.args.get("limit")
        if raw_limit is None:
            change_limit: int | None = None
        else:
            try:
                change_limit = int(raw_limit)
            except (TypeError, ValueError):
                return jsonify({"ok": False, "error": "Invalid change limit"}), 400

            if change_limit < 1 or change_limit > 50:
                return jsonify({"ok": False, "error": "Invalid change limit"}), 400

        if since_revision < 0:
            return jsonify({"ok": False, "error": "Invalid revision"}), 400

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
        payload = request.get_json(silent=False)

        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Invalid JSON body"}), 400

        shows_upsert = payload.get("showsUpsert") or {}
        shows_delete = payload.get("showsDelete") or []
        history_upsert = payload.get("historyUpsert") or {}
        history_delete = payload.get("historyDelete") or []
        history_order = payload.get("historyOrder")
        state_upsert = payload.get("stateUpsert") or {}
        operation_id = str(payload.get("operationId") or "")

        try:
            base_revision = int(payload.get("baseRevision"))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Invalid base revision"}), 400

        if base_revision < 0:
            return jsonify({"ok": False, "error": "Invalid base revision"}), 400
        if not OPERATION_ID_RE.fullmatch(operation_id):
            return jsonify({"ok": False, "error": "Invalid operation ID"}), 400
        if not isinstance(shows_upsert, dict) or len(shows_upsert) > 5000:
            return jsonify({"ok": False, "error": "Invalid shows update"}), 400
        if not isinstance(history_upsert, dict) or len(history_upsert) > 100000:
            return jsonify({"ok": False, "error": "Invalid history update"}), 400
        if not isinstance(shows_delete, list) or not isinstance(history_delete, list):
            return jsonify({"ok": False, "error": "Invalid delete list"}), 400
        if history_order is not None and not isinstance(history_order, list):
            return jsonify({"ok": False, "error": "Invalid history order"}), 400
        if not isinstance(state_upsert, dict):
            return jsonify({"ok": False, "error": "Invalid state update"}), 400

        state_upsert.pop("shows", None)
        state_upsert.pop("history", None)
        state_upsert.pop("history_order", None)

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

                actual_history_order = merge_history_order(
                    cursor, history_order, history_upsert, history_delete
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

                if history_delete:
                    cursor.execute(
                        "DELETE FROM tv_tracker_history WHERE entry_id = ANY(%s)",
                        ([str(item) for item in history_delete],),
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
                    history_delete,
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
        data, _ = read_tracker_data()
        history = data.get("history") if isinstance(data.get("history"), list) else []
        shows = data.get("shows") if isinstance(data.get("shows"), dict) else {}
        profile = data.get("profile") if isinstance(data.get("profile"), dict) else {}
        special_count = sum(
            1
            for entry in history
            if isinstance(entry, dict)
            and (entry.get("special") is True or int(entry.get("season") or -1) == 0)
        )
        backup = {
            "app": APP_NAME,
            "backupType": "native-app-backup",
            "backupVersion": 1,
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
            return jsonify({"ok": False, "error": "TMDB is unavailable"}), 502

    @app.errorhandler(413)
    def body_too_large(_error):
        return jsonify({"ok": False, "error": "Upload is too large"}), 413

    @app.errorhandler(403)
    def forbidden(_error):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Security token rejected"}), 403
        return "Forbidden", 403

    return app


app = create_app()
