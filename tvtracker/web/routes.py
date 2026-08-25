from __future__ import annotations

import gzip
import hmac
import json
import os
import secrets
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request

import psycopg
from flask import (
    Response,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from tvtracker.database.connection import required_env
from tvtracker.media.tmdb_exports import (
    TMDB_NETWORK_SEARCH_QUERY_MAX_CHARS,
    collection_index_building,
    fetch_tmdb_collection_detail,
    get_cached_tmdb_collection_summary,
    get_tmdb_collection_index_response,
    normalize_tmdb_collection_detail,
    normalize_tmdb_network_search_text,
    read_tmdb_collection_index_cache,
    search_tmdb_network_export,
)
from tvtracker.media.tmdb_proxy import (
    TMDB_PROXY_CACHE_BUSTER_PARAMS,
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
    serialize_notification_settings,
    update_notification_settings as patch_notification_settings,
)
from tvtracker.sync.change_log import (
    change_log_has_gap,
    current_revision,
    fetch_change_rows,
    serialize_change_rows,
)
from tvtracker.web.routing import (
    APP_BROWSE_PATH_RE,
    APP_CERTIFICATION_PATH_RE,
    APP_COLLECTION_PATH_RE,
    APP_COLLECTIONS_PATH_RE,
    APP_COMPANY_PATH_RE,
    APP_COUNTRY_PATH_RE,
    APP_DISCOVER_CATEGORY_PATH_RE,
    APP_EPISODE_PATH_RE,
    APP_GENRE_PATH_RE,
    APP_LANGUAGE_PATH_RE,
    APP_LIST_PATH_RE,
    APP_MOVIE_PATH_RE,
    APP_NETWORK_PATH_RE,
    APP_PERSON_PATH_RE,
    APP_PROVIDER_PATH_RE,
    APP_SECTION_PATHS,
    APP_SHOW_PATH_RE,
    APP_STATUS_PATH_RE,
    APP_THEME_PATH_RE,
    APP_YEAR_PATH_RE,
    ERROR_PAGE_MESSAGES,
    SETTINGS_SECTION_PATHS,
    safe_next_url,
    valid_app_path,
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




def register_routes(app, deps) -> None:
    """Register every application route, hook, and error handler.

    ``deps`` is the legacy app module; patch-sensitive names (database_connection,
    read_admin_account, urlopen, PASSWORD_HASHER, ...) are resolved through it at
    call time so patch.object(app_module, name) keeps intercepting requests.
    """

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
        if deps.authenticated():
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
        if deps.authenticated():
            return redirect("/app/list/watching")
        session["auth_tab"] = "signup"
        return redirect(url_for("login"))

    @app.post("/login")
    def login_post():
        deps.check_csrf()
        key = deps.client_key()

        if deps.login_is_limited(key):
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Too many failed attempts. Try again later.",
                notice="",
                initial_tab="login",
            ), 429

        username = str(request.form.get("username", ""))
        password = str(request.form.get("password", ""))
        account = deps.read_admin_account()
        valid_username = username == str(account["username"])
        valid_password = False

        try:
            valid_password = deps.PASSWORD_HASHER.verify(
                account["password_hash"], password
            )
        except (VerifyMismatchError, InvalidHashError):
            valid_password = False

        if not (valid_username and valid_password):
            deps.record_login_failure(key)
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Invalid username or password.",
                notice="",
                initial_tab="login",
            ), 401

        deps.clear_login_failures(key)
        destination = safe_next_url(session.get("post_login_path"))
        session.clear()
        session["authenticated"] = True
        session["session_version"] = account["session_version"]
        session["csrf_token"] = os.urandom(32).hex()
        session.permanent = True
        return redirect(destination)

    @app.post("/logout")
    @deps.login_required
    def logout():
        deps.check_csrf()
        session.clear()
        return redirect(url_for("login"))

    @app.get("/")
    def root():
        if deps.authenticated():
            return redirect("/app/list/watching")
        return redirect(url_for("login"))

    @app.get("/app")
    @app.get("/app/")
    @deps.login_required
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
    @deps.login_required
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
    @deps.login_required
    def app_settings_section_page(settings_section: str):
        requested_path = request.path.rstrip("/")
        if requested_path not in SETTINGS_SECTION_PATHS:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/notifications/settings", strict_slashes=False)
    @deps.login_required
    def legacy_notification_settings_page():
        return redirect_app_path_preserving_query("/app/settings/notifications")


    @app.get("/app/discover/<media_type>/<category_slug>", strict_slashes=False)
    @deps.login_required
    def app_discover_category_page(media_type: str, category_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/browse/<media_type>", strict_slashes=False)
    @deps.login_required
    def app_browse_page(media_type: str):
        requested_path = request.path.rstrip("/")
        if APP_BROWSE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/list/<list_slug>", strict_slashes=False)
    @deps.login_required
    def app_list_page(list_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_LIST_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)


    @app.get("/app/genre/<genre_media>/<genre_slug>", strict_slashes=False)
    @deps.login_required
    def app_genre_page(genre_media: str, genre_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_GENRE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/network/<network_key>", strict_slashes=False)
    @deps.login_required
    def app_network_page(network_key: str):
        requested_path = request.path.rstrip("/")
        if APP_NETWORK_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/language/<media_type>/<language_code>", strict_slashes=False)
    @deps.login_required
    def app_language_page(media_type: str, language_code: str):
        requested_path = request.path.rstrip("/")
        if APP_LANGUAGE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/country/<media_type>/<country_code>", strict_slashes=False)
    @deps.login_required
    def app_country_page(media_type: str, country_code: str):
        requested_path = request.path.rstrip("/")
        if APP_COUNTRY_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/theme/<media_type>/<theme_key>", strict_slashes=False)
    @deps.login_required
    def app_theme_page(media_type: str, theme_key: str):
        requested_path = request.path.rstrip("/")
        if APP_THEME_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/movie/<movie_key>", strict_slashes=False)
    @deps.login_required
    def app_movie_page(movie_key: str):
        requested_path = request.path.rstrip("/")
        if APP_MOVIE_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/company/<media_type>/<company_key>", strict_slashes=False)
    @deps.login_required
    def app_company_page(media_type: str, company_key: str):
        requested_path = request.path.rstrip("/")
        if APP_COMPANY_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/provider/<media_type>/<provider_key>", strict_slashes=False)
    @deps.login_required
    def app_provider_page(media_type: str, provider_key: str):
        requested_path = request.path.rstrip("/")
        if APP_PROVIDER_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/year/<media_type>/<int:year_value>", strict_slashes=False)
    @deps.login_required
    def app_year_page(media_type: str, year_value: int):
        requested_path = request.path.rstrip("/")
        if APP_YEAR_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/status/<status_slug>", strict_slashes=False)
    @deps.login_required
    def app_status_page(status_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_STATUS_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/certification/<media_type>/<certification_slug>", strict_slashes=False)
    @deps.login_required
    def app_certification_page(media_type: str, certification_slug: str):
        requested_path = request.path.rstrip("/")
        if APP_CERTIFICATION_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/collections", strict_slashes=False)
    @deps.login_required
    def app_collections_page():
        requested_path = request.path.rstrip("/")
        if APP_COLLECTIONS_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/collection/<collection_key>", strict_slashes=False)
    @deps.login_required
    def app_collection_page(collection_key: str):
        requested_path = request.path.rstrip("/")
        if APP_COLLECTION_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/person/<person_key>", strict_slashes=False)
    @deps.login_required
    def app_person_page(person_key: str):
        requested_path = request.path.rstrip("/")
        if APP_PERSON_PATH_RE.fullmatch(requested_path) is None:
            abort(404)
        if request.path != requested_path:
            return redirect_app_path_preserving_query(requested_path)
        return render_app_shell(requested_path)

    @app.get("/app/show/<show_key>", strict_slashes=False)
    @deps.login_required
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
    @deps.login_required
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
    @deps.login_required
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

        status = deps.tracker_health_status()
        payload = {"ok": status["ok"]}
        if deps.RELEASE_SHA is not None:
            payload["releaseSha"] = deps.RELEASE_SHA
        return jsonify(payload), 200 if status["ok"] else 503

    @app.get("/api/health")
    @deps.login_required
    def health():
        status = deps.tracker_health_status()
        response = jsonify({
            "ok": status["ok"],
            "app": deps.APP_NAME,
            "database": status["database"],
            "schemaVersion": status["schemaVersion"],
            "releaseSha": deps.RELEASE_SHA,
        })
        return (response, 200 if status["ok"] else 503)

    @app.get("/api/admin/account")
    @deps.login_required
    def get_admin_account():
        account = deps.read_admin_account()
        return jsonify({
            "ok": True,
            "username": account["username"],
        })

    @app.post("/api/admin/account")
    @deps.login_required
    def update_admin_account():
        deps.check_csrf()
        key = deps.client_key()

        if deps.account_change_is_limited(key):
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

        deps.record_security_event("account_change_attempt", key)
        current_password = str(payload.get("currentPassword") or "")
        requested_username = str(payload.get("username") or "").strip()
        new_password = str(payload.get("newPassword") or "")
        confirm_password = str(payload.get("confirmPassword") or "")
        account = deps.read_admin_account()

        if not current_password:
            return jsonify({
                "ok": False,
                "error": "Enter your current password",
                "code": "current_password_required",
            }), 400

        try:
            valid_current_password = deps.PASSWORD_HASHER.verify(
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
            if len(new_password) < deps.MIN_ADMIN_PASSWORD_CHARS:
                return jsonify({
                    "ok": False,
                    "error": f"New password must contain at least {deps.MIN_ADMIN_PASSWORD_CHARS} characters",
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
            deps.PASSWORD_HASHER.hash(new_password)
            if password_changed
            else account["password_hash"]
        )

        with deps.database_connection() as connection:
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

        deps.invalidate_admin_account_cache()
        session.clear()
        session["account_changed_notice"] = True
        return jsonify({
            "ok": True,
            "reauthenticate": True,
        })

    @app.get("/api/notifications/status")
    @deps.login_required
    def notification_status_api():
        return jsonify({"ok": True, **get_notification_status(deps.database_connection)})

    @app.get("/api/notifications")
    @deps.login_required
    def notifications_api():
        return jsonify({
            "ok": True,
            "notifications": get_notification_records(deps.database_connection),
        })

    @app.post("/api/notifications/read-all")
    @deps.login_required
    def notifications_read_all_api():
        deps.check_csrf()
        changed = mark_notifications_read(deps.database_connection)
        return jsonify({"ok": True, "updated": changed})

    @app.post("/api/notifications/<int:notification_id>/read")
    @deps.login_required
    def notification_read_api(notification_id: int):
        deps.check_csrf()
        if notification_id <= 0 or not mark_notification_read_record(
            deps.database_connection, notification_id
        ):
            return jsonify({
                "ok": False,
                "error": "Notification not found",
            }), 404
        return jsonify({"ok": True})

    @app.delete("/api/notifications/<int:notification_id>")
    @deps.login_required
    def notification_delete_api(notification_id: int):
        deps.check_csrf()
        if notification_id <= 0 or not delete_notification_record(
            deps.database_connection, notification_id
        ):
            return jsonify({
                "ok": False,
                "error": "Notification not found",
                "code": "not_found",
            }), 404
        return jsonify({"ok": True})

    @app.get("/api/notifications/settings")
    @deps.login_required
    def notification_settings_api():
        settings = get_notification_settings(deps.database_connection)
        return jsonify({
            "ok": True,
            "settings": serialize_notification_settings(settings),
        })

    @app.patch("/api/notifications/settings")
    @deps.login_required
    def notification_settings_patch_api():
        deps.check_csrf()
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({
                "ok": False,
                "error": "Invalid notification settings",
                "code": "invalid_notification_settings",
            }), 400
        try:
            settings = patch_notification_settings(deps.database_connection, payload)
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
    @deps.login_required
    def get_state():
        data, revision = deps.read_tracker_data()
        return jsonify({"ok": True, "revision": revision, "data": data})

    @app.get("/api/revision")
    @deps.login_required
    def get_revision():
        if deps.sync_request_is_limited(deps.client_key()):
            return jsonify({
                "ok": False,
                "error": "Too many sync requests",
                "code": "sync_rate_limited",
            }), 429

        with deps.database_connection() as connection:
            with connection.cursor() as cursor:
                revision = current_revision(cursor)

        return jsonify({"ok": True, "revision": revision})

    @app.get("/api/changes")
    @deps.login_required
    def get_changes():
        if deps.sync_request_is_limited(deps.client_key()):
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

        with deps.database_connection() as connection:
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
            data, revision = deps.read_tracker_data()
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
    @deps.login_required
    def patch_state():
        deps.check_csrf()
        payload = request.get_json(silent=True)
        body, status_code = deps.apply_state_patch(
            payload,
            connection_factory=deps.database_connection,
            validate_delta=deps.validate_sync_delta_payload,
            find_duplicate_history_ids=deps.find_logical_duplicate_history_ids,
            validation_errors=(deps.BackupValidationError,),
        )
        return jsonify(body), status_code

    @app.get("/api/backup")
    @deps.login_required
    def download_backup():
        raw_data, _ = deps.read_tracker_data()
        try:
            data = deps.validate_tracker_data(raw_data)
        except deps.BackupValidationError as error:
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
            "app": deps.APP_NAME,
            "backupType": "native-app-backup",
            "backupVersion": deps.BACKUP_VERSION,
            "schemaVersion": deps.SCHEMA_VERSION,
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
    @deps.login_required
    def import_backup():
        deps.check_csrf()
        backup = request.get_json(silent=True)

        try:
            data, summary = deps.validate_and_normalize_backup(backup)
        except deps.BackupValidationError as error:
            return jsonify({
                "ok": False,
                "error": str(error),
                "code": "invalid_backup",
            }), 400

        try:
            revision = deps.replace_tracker_data_transactionally(data)
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
    @deps.login_required
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
    @deps.login_required
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
    @deps.login_required
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
    @deps.login_required
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
            with deps.urlopen(upstream_request, timeout=20) as upstream:
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

