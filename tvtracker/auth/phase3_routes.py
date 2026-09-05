from __future__ import annotations

import os
from typing import Any

from argon2.exceptions import InvalidHashError, VerifyMismatchError
from flask import jsonify, redirect, render_template, request, session, url_for

from tvtracker.auth.phase4_routes import install_multi_user_phase4_routes
from tvtracker.auth.users import AUTH_KIND_USER, MIN_USER_PASSWORD_CHARS, user_can_enter_app, user_session_marker


def _password_matches(hasher: Any, password_hash: str, password: str) -> bool:
    try:
        return bool(hasher.verify(password_hash, password))
    except (VerifyMismatchError, InvalidHashError):
        return False


def _render_login_error(message: str, status_code: int):
    return render_template(
        "login.html",
        csrf_token=session["csrf_token"],
        error=message,
        notice="",
        initial_tab="login",
        login_action=request.path,
    ), status_code


def install_multi_user_phase3_routes(app, deps) -> None:
    """Layer UUID-user authentication over the legacy singleton admin safely.

    Phase 4 is installed first so its account/email extensions can handle the
    UUID-user operations it owns while unmatched requests continue through this
    Phase 3 compatibility bridge and, finally, the legacy singleton admin.
    """

    install_multi_user_phase4_routes(app, deps)

    def current_uuid_user() -> dict[str, Any] | None:
        return deps.current_user()

    def revoke_legacy_admin_sessions() -> None:
        with deps.database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE tv_tracker_admin
                    SET session_version = session_version + 1,
                        updated_at = NOW()
                    WHERE singleton_id = 1
                    """
                )
            connection.commit()
        deps.invalidate_admin_account_cache()

    def sign_out_all_sessions() -> None:
        account = current_uuid_user()
        if account is not None:
            deps.revoke_all_user_sessions(account["user_id"])
        else:
            revoke_legacy_admin_sessions()
        session.clear()

    @app.before_request
    def multi_user_phase3_interceptor():
        if request.path == "/login" and request.method == "POST":
            deps.check_csrf()
            identifier = str(
                request.form.get("identifier")
                or request.form.get("username")
                or ""
            ).strip()
            if not identifier:
                return None

            account = deps.read_user_by_identifier(identifier)
            if account is None:
                # The current singleton admin remains a migration fallback.
                return None

            client_rate_key = deps.client_key()
            identifier_rate_key = deps.login_identifier_key(client_rate_key, identifier)
            if deps.login_is_limited(client_rate_key) or deps.login_is_limited(identifier_rate_key):
                return _render_login_error(
                    "Too many failed attempts. Try again later.", 429
                )

            password = str(request.form.get("password", ""))
            if not _password_matches(deps.PASSWORD_HASHER, account["password_hash"], password):
                deps.record_login_failure(client_rate_key)
                deps.record_login_failure(identifier_rate_key)
                return _render_login_error("Invalid username, email, or password.", 401)

            if not user_can_enter_app(account):
                if account["status"] == "unverified" or account["email_verified_at"] is None:
                    return _render_login_error(
                        "Verify your email before signing in.", 403
                    )
                return _render_login_error("This account is currently unavailable.", 403)

            deps.clear_login_failures(client_rate_key)
            deps.clear_login_failures(identifier_rate_key)
            destination = deps.safe_next_url(session.get("post_login_path"))
            session.clear()
            session["authenticated"] = True
            session["auth_kind"] = AUTH_KIND_USER
            # UUIDs remain internal. The signed client session gets only a
            # normalized lookup key plus an opaque account marker.
            session["user_login_key"] = account["username_normalized"]
            session["user_account_marker"] = user_session_marker(account)
            session["session_version"] = int(account["session_version"])
            session["csrf_token"] = os.urandom(32).hex()
            session.permanent = True
            return redirect(destination)

        if request.path == "/logout" and request.method == "POST":
            if current_uuid_user() is None:
                return None
            deps.check_csrf()
            session.clear()
            return redirect(url_for("login"))

        if request.path == "/api/admin/account" and request.method == "GET":
            account = current_uuid_user()
            if account is None:
                return None
            return jsonify({
                "ok": True,
                "username": account["username"],
                "accountType": "user",
            })

        if request.path == "/api/admin/account" and request.method == "POST":
            account = current_uuid_user()
            if account is None:
                return None

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

            if not current_password:
                return jsonify({
                    "ok": False,
                    "error": "Enter your current password",
                    "code": "current_password_required",
                }), 400
            if not _password_matches(
                deps.PASSWORD_HASHER, account["password_hash"], current_password
            ):
                return jsonify({
                    "ok": False,
                    "error": "Current password is incorrect",
                    "code": "invalid_current_password",
                }), 400

            # Phase 4 handles changed UUID usernames before this interceptor.
            # Reaching this branch means the username is unchanged and this
            # remains the canonical password-change path from Phase 3.
            if requested_username and requested_username != account["username"]:
                return jsonify({
                    "ok": False,
                    "error": "Username change could not be completed",
                    "code": "username_change_unavailable",
                }), 409

            if not new_password and not confirm_password:
                return jsonify({
                    "ok": False,
                    "error": "Enter a new password",
                    "code": "no_account_changes",
                }), 400
            if new_password != confirm_password:
                return jsonify({
                    "ok": False,
                    "error": "New passwords do not match",
                    "code": "password_mismatch",
                }), 400
            if len(new_password) < MIN_USER_PASSWORD_CHARS:
                return jsonify({
                    "ok": False,
                    "error": f"New password must contain at least {MIN_USER_PASSWORD_CHARS} characters",
                    "code": "password_too_short",
                }), 400

            deps.update_user_password(
                account["user_id"], deps.PASSWORD_HASHER.hash(new_password)
            )
            session.clear()
            return jsonify({"ok": True, "reauthenticate": True})

        return None

    @app.post("/api/account/sessions/sign-out-all")
    @deps.login_required
    def sign_out_all_sessions_api():
        deps.check_csrf()
        sign_out_all_sessions()
        return jsonify({"ok": True, "reauthenticate": True})

    @app.post("/account/sign-out-all")
    @deps.login_required
    def sign_out_all_sessions_form():
        deps.check_csrf()
        sign_out_all_sessions()
        return redirect(url_for("login"))
