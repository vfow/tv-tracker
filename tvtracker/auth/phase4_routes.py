from __future__ import annotations

import hashlib
from typing import Any

from argon2.exceptions import InvalidHashError, VerifyMismatchError
from flask import abort, jsonify, redirect, render_template, request, session, url_for

from tvtracker.auth.account_flows import (
    AccountFlowError,
    EMAIL_CHANGE,
    PASSWORD_RESET,
    VERIFY_EMAIL,
    IdentifierUnavailableError,
    InvalidTokenError,
    confirm_email_change_token,
    create_user_with_verification_token,
    ensure_email_available,
    issue_token,
    reset_password_token,
    user_for_email,
    validated_email,
    verify_email_token,
)
from tvtracker.auth.account_updates import update_account_credentials
from tvtracker.auth.mail import (
    MailConfigurationError,
    MailDeliveryError,
    email_change_email,
    mail_is_configured,
    public_app_url,
    password_reset_email,
    verification_email,
)
from tvtracker.auth.registration_policy import public_registration_enabled
from tvtracker.auth.users import MIN_USER_PASSWORD_CHARS


RESEND_VERIFICATION_NOTICE = (
    "If that account still needs verification, a new link will be sent."
)
PASSWORD_RESET_NOTICE = (
    "If an account exists for that email, a reset link will be sent."
)


def _password_matches(hasher: Any, password_hash: str, password: str) -> bool:
    try:
        return bool(hasher.verify(password_hash, password))
    except (VerifyMismatchError, InvalidHashError):
        return False


def _absolute_url(endpoint: str, *, token: str) -> str:
    return public_app_url() + url_for(endpoint, token=token, _external=False)


def install_multi_user_phase4_routes(app, deps) -> None:
    """Install Phase 4 account creation and email flows.

    Signup code exists in this phase, but the source-controlled registration
    policy remains false. The POST route rejects requests before any account is
    created unless Phase 8 deliberately opens that policy after acceptance.
    """

    @app.before_request
    def limit_account_email_requests():
        paths = {"/signup", "/forgot-password", "/reset-password",
                 "/account/resend-verification", "/account/email"}
        if request.method != "POST" or request.path not in paths:
            return None
        if request.path == "/signup" and not public_registration_enabled():
            return None  # Closed signup must not touch even rate-limit storage.
        deps.check_csrf()
        event = "account_email_attempt"
        client = "client:" + deps.client_key()
        keys = [(client, 30)]
        # Shared per-recipient limits also apply across different client IPs.
        email = str(request.form.get("email") or "").strip().lower()
        if email:
            keys.append(("email:" + hashlib.sha256(email.encode()).hexdigest(), 5))
        if any(deps.security_event_count(event, key, 900) >= limit for key, limit in keys):
            return render_template(
                "account_flow_result.html", title="Try again later",
                message="Too many attempts. Please try again in 15 minutes.",
                success=False,
            ), 429, {"Retry-After": "900"}
        for key, _limit in keys:
            deps.record_security_event(event, key)
        return None

    @app.after_request
    def account_email_response_headers(response):
        if request.path.startswith("/account/") or request.path in {"/forgot-password", "/reset-password"}:
            response.headers["Cache-Control"] = "no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.context_processor
    def phase4_auth_template_context():
        return {
            "public_registration_enabled": public_registration_enabled(),
            "account_mail_configured": mail_is_configured(),
        }

    def current_uuid_user() -> dict[str, Any] | None:
        return deps.current_user()

    def account_page(*, error: str = "", notice: str = "", status: int = 200):
        account = current_uuid_user()
        if account is None:
            return redirect(url_for("login"))
        return (
            render_template(
                "account_email.html",
                csrf_token=session["csrf_token"],
                email=account["email"],
                username=account["username"],
                error=error,
                notice=notice,
                mail_configured=mail_is_configured(),
            ),
            status,
        )

    def forgot_page(*, error: str = "", notice: str = "", status: int = 200):
        return (
            render_template(
                "forgot_password.html",
                csrf_token=session["csrf_token"],
                error=error,
                notice=notice,
                mail_configured=mail_is_configured(),
            ),
            status,
        )

    def resend_page(*, error: str = "", notice: str = "", status: int = 200):
        return (
            render_template(
                "resend_verification.html",
                csrf_token=session["csrf_token"],
                error=error,
                notice=notice,
                mail_configured=mail_is_configured(),
            ),
            status,
        )

    @app.before_request
    def multi_user_phase4_account_interceptor():
        if request.path == "/api/admin/account" and request.method == "GET":
            account = current_uuid_user()
            if account is None:
                return None
            return jsonify(
                {
                    "ok": True,
                    "username": account["username"],
                    "email": account["email"],
                    "accountType": "user",
                }
            )

        if request.path != "/api/admin/account" or request.method != "POST":
            return None

        account = current_uuid_user()
        if account is None:
            return None

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return None
        requested_username = str(payload.get("username") or "").strip()
        if not requested_username or requested_username == account["username"]:
            return None

        deps.check_csrf()
        key = deps.client_key()
        if deps.account_change_is_limited(key):
            return jsonify(
                {
                    "ok": False,
                    "error": "Too many account-change attempts. Try again later.",
                    "code": "account_rate_limited",
                }
            ), 429

        # Failed password checks count too; otherwise this path bypasses the
        # existing account-change throttle.
        deps.record_security_event("account_change_attempt", key)

        current_password = str(payload.get("currentPassword") or "")
        if not current_password:
            return jsonify(
                {
                    "ok": False,
                    "error": "Enter your current password",
                    "code": "current_password_required",
                }
            ), 400
        if not _password_matches(
            deps.PASSWORD_HASHER, account["password_hash"], current_password
        ):
            return jsonify(
                {
                    "ok": False,
                    "error": "Current password is incorrect",
                    "code": "invalid_current_password",
                }
            ), 400

        new_password = str(payload.get("newPassword") or "")
        confirm_password = str(payload.get("confirmPassword") or "")
        if new_password or confirm_password:
            if new_password != confirm_password:
                return jsonify(
                    {
                        "ok": False,
                        "error": "New passwords do not match",
                        "code": "password_mismatch",
                    }
                ), 400
            if len(new_password) < MIN_USER_PASSWORD_CHARS:
                return jsonify(
                    {
                        "ok": False,
                        "error": f"New password must contain at least {MIN_USER_PASSWORD_CHARS} characters",
                        "code": "password_too_short",
                    }
                ), 400

        password_hash = (
            deps.PASSWORD_HASHER.hash(new_password) if new_password else None
        )
        try:
            display_username, normalized_username, session_version = (
                update_account_credentials(
                    deps.database_connection,
                    user_id=account["user_id"],
                    username=requested_username,
                    password_hash=password_hash,
                )
            )
        except IdentifierUnavailableError as error:
            return jsonify({"ok": False, "error": str(error), "code": error.code}), 409
        except (AccountFlowError, ValueError) as error:
            return jsonify(
                {
                    "ok": False,
                    "error": str(error),
                    "code": "invalid_username",
                }
            ), 400

        if new_password:
            session.clear()
            return jsonify(
                {
                    "ok": True,
                    "username": display_username,
                    "reauthenticate": True,
                }
            )

        # Keep this browser signed in after a username-only change while the
        # single session-version bump invalidates every other browser generation.
        session["user_login_key"] = normalized_username
        session["session_version"] = session_version
        return jsonify(
            {
                "ok": True,
                "username": display_username,
                "reauthenticate": False,
            }
        )

    @app.post("/signup")
    def phase4_signup_post():
        if not public_registration_enabled():
            abort(404)
        deps.check_csrf()
        if not mail_is_configured():
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Registration is temporarily unavailable.",
                notice="",
                initial_tab="signup",
            ), 503

        email = str(request.form.get("email") or "").strip()
        username = str(request.form.get("signup_username") or "").strip()
        password = str(request.form.get("signup_password") or "")
        confirm_password = str(request.form.get("signup_confirm_password") or "")
        if password != confirm_password:
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Passwords do not match.",
                notice="",
                initial_tab="signup",
            ), 400
        if len(password) < MIN_USER_PASSWORD_CHARS:
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error=f"Password must contain at least {MIN_USER_PASSWORD_CHARS} characters.",
                notice="",
                initial_tab="signup",
            ), 400

        try:
            _user_id, token = create_user_with_verification_token(
                deps.database_connection,
                email=email,
                username=username,
                password_hash=deps.PASSWORD_HASHER.hash(password),
            )
            verification_email(
                to_address=validated_email(email),
                verification_url=_absolute_url("phase4_verify_email", token=token.raw_token),
            )
        except IdentifierUnavailableError as error:
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error=str(error),
                notice="",
                initial_tab="signup",
            ), 409
        except (AccountFlowError, ValueError) as error:
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error=str(error),
                notice="",
                initial_tab="signup",
            ), 400
        except (MailConfigurationError, MailDeliveryError):
            return render_template(
                "login.html",
                csrf_token=session["csrf_token"],
                error="Account created, but verification email is temporarily unavailable. Use resend verification later.",
                notice="",
                initial_tab="login",
            ), 503

        return render_template(
            "login.html",
            csrf_token=session["csrf_token"],
            error="",
            notice="Check your email for a verification link before signing in.",
            initial_tab="login",
        ), 201

    @app.get("/account/verify-email")
    def phase4_verify_email():
        token = str(request.args.get("token") or "")
        try:
            verify_email_token(deps.database_connection, token)
        except InvalidTokenError as error:
            return render_template(
                "account_flow_result.html",
                title="Email verification",
                message=str(error),
                success=False,
            ), 400
        return render_template(
            "account_flow_result.html",
            title="Email verified",
            message="Your email is verified. You can sign in now.",
            success=True,
        )

    @app.get("/account/resend-verification")
    def phase4_resend_verification_page():
        return resend_page()

    @app.post("/account/resend-verification")
    def phase4_resend_verification_post():
        deps.check_csrf()
        email = str(request.form.get("email") or "").strip()
        try:
            account = user_for_email(deps.database_connection, email)
        except AccountFlowError as error:
            return resend_page(error=str(error), status=400)

        if (
            account is None
            or account["status"] != "unverified"
            or account["email_verified_at"] is not None
        ):
            return resend_page(notice=RESEND_VERIFICATION_NOTICE)
        if not mail_is_configured():
            app.logger.warning("Verification email delivery is unavailable")
            return resend_page(notice=RESEND_VERIFICATION_NOTICE)

        try:
            token = issue_token(
                deps.database_connection,
                user_id=account["user_id"],
                purpose=VERIFY_EMAIL,
                expected_email=account["email"],
            )
            verification_email(
                to_address=account["email"],
                verification_url=_absolute_url(
                    "phase4_verify_email", token=token.raw_token
                ),
            )
        except (MailConfigurationError, MailDeliveryError, InvalidTokenError):
            app.logger.warning("Verification email delivery failed")
        return resend_page(notice=RESEND_VERIFICATION_NOTICE)

    @app.get("/forgot-password")
    def phase4_forgot_password_page():
        return forgot_page()

    @app.post("/forgot-password")
    def phase4_forgot_password_post():
        deps.check_csrf()
        email = str(request.form.get("email") or "").strip()
        try:
            account = user_for_email(deps.database_connection, email)
        except AccountFlowError as error:
            return forgot_page(error=str(error), status=400)

        if account is None or account["status"] not in {"active", "unverified"}:
            return forgot_page(notice=PASSWORD_RESET_NOTICE)
        if not mail_is_configured():
            app.logger.warning("Password-reset email delivery is unavailable")
            return forgot_page(notice=PASSWORD_RESET_NOTICE)

        try:
            token = issue_token(
                deps.database_connection,
                user_id=account["user_id"],
                purpose=PASSWORD_RESET,
                expected_email=account["email"],
            )
            password_reset_email(
                to_address=account["email"],
                reset_url=_absolute_url(
                    "phase4_reset_password_page", token=token.raw_token
                ),
            )
        except (MailConfigurationError, MailDeliveryError, InvalidTokenError):
            app.logger.warning("Password-reset email delivery failed")
        return forgot_page(notice=PASSWORD_RESET_NOTICE)

    @app.get("/reset-password")
    def phase4_reset_password_page():
        token = str(request.args.get("token") or "")
        return render_template(
            "reset_password.html",
            csrf_token=session["csrf_token"],
            token=token,
            error="",
        )

    @app.post("/reset-password")
    def phase4_reset_password_post():
        deps.check_csrf()
        token = str(request.form.get("token") or "")
        password = str(request.form.get("password") or "")
        confirm_password = str(request.form.get("confirm_password") or "")
        if password != confirm_password:
            return render_template(
                "reset_password.html",
                csrf_token=session["csrf_token"],
                token=token,
                error="Passwords do not match.",
            ), 400
        if len(password) < MIN_USER_PASSWORD_CHARS:
            return render_template(
                "reset_password.html",
                csrf_token=session["csrf_token"],
                token=token,
                error=f"Password must contain at least {MIN_USER_PASSWORD_CHARS} characters.",
            ), 400
        try:
            reset_password_token(
                deps.database_connection,
                raw_token=token,
                password_hash=deps.PASSWORD_HASHER.hash(password),
            )
        except InvalidTokenError as error:
            return render_template(
                "reset_password.html",
                csrf_token=session["csrf_token"],
                token=token,
                error=str(error),
            ), 400
        session.clear()
        return redirect(url_for("login"))

    @app.get("/account/email")
    @deps.login_required
    def phase4_email_change_page():
        return account_page()

    @app.post("/account/email")
    @deps.login_required
    def phase4_email_change_post():
        deps.check_csrf()
        account = current_uuid_user()
        if account is None:
            return redirect(url_for("login"))
        current_password = str(request.form.get("current_password") or "")
        if not _password_matches(
            deps.PASSWORD_HASHER, account["password_hash"], current_password
        ):
            return account_page(error="Current password is incorrect.", status=400)

        requested_email = str(request.form.get("email") or "").strip()
        try:
            display_email = ensure_email_available(
                deps.database_connection,
                email=requested_email,
                excluding_user_id=account["user_id"],
            )
        except IdentifierUnavailableError as error:
            return account_page(error=str(error), status=409)
        except AccountFlowError as error:
            return account_page(error=str(error), status=400)
        if display_email.lower() == str(account["email"]).lower():
            return account_page(notice="That is already your account email.")
        if not mail_is_configured():
            return account_page(error="Email service is temporarily unavailable.", status=503)

        try:
            token = issue_token(
                deps.database_connection,
                user_id=account["user_id"],
                purpose=EMAIL_CHANGE,
                pending_email=display_email,
                expected_email=account["email"],
            )
            email_change_email(
                to_address=display_email,
                verification_url=_absolute_url(
                    "phase4_confirm_email_change", token=token.raw_token
                ),
            )
        except (MailConfigurationError, MailDeliveryError):
            return account_page(
                error="Email service is temporarily unavailable.", status=503
            )
        except InvalidTokenError:
            return account_page(error="Your account changed. Please sign in again.", status=409)
        return account_page(
            notice="Check the new address for a confirmation link. Your current email stays active until then."
        )

    @app.get("/account/confirm-email")
    def phase4_confirm_email_change():
        token = str(request.args.get("token") or "")
        active_account = current_uuid_user()
        try:
            user_id, session_version = confirm_email_change_token(
                deps.database_connection, token
            )
        except (InvalidTokenError, IdentifierUnavailableError) as error:
            return render_template(
                "account_flow_result.html",
                title="Email change",
                message=str(error),
                success=False,
            ), 400

        if active_account is not None and active_account["user_id"] == user_id:
            session["session_version"] = session_version
        return render_template(
            "account_flow_result.html",
            title="Email updated",
            message="Your email address has been updated.",
            success=True,
        )
