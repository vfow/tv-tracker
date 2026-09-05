from __future__ import annotations

import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from argon2 import PasswordHasher
from flask import Flask, abort, request, session

from tvtracker.auth.phase3_routes import install_multi_user_phase3_routes
from tvtracker.auth.registration_policy import public_registration_enabled
from tvtracker.auth.users import MIN_USER_PASSWORD_CHARS


ROOT = Path(__file__).resolve().parents[1]


class Phase3Deps:
    PASSWORD_HASHER = PasswordHasher()

    def __init__(self):
        now = datetime.now(timezone.utc)
        self.account = {
            "user_id": uuid4(),
            "email": "alice@example.test",
            "email_normalized": "alice@example.test",
            "username": "Alice",
            "username_normalized": "alice",
            "password_hash": self.PASSWORD_HASHER.hash("correct horse battery staple"),
            "role": "user",
            "status": "active",
            "email_verified_at": now,
            "session_version": 1,
            "created_at": now,
            "updated_at": now,
        }
        self.failures: list[str] = []
        self.cleared: list[str] = []
        self.security_events: list[tuple[str, str]] = []
        self.revocations = 0

    def check_csrf(self):
        supplied = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token")
        if not supplied or supplied != session.get("csrf_token"):
            abort(403)

    def read_user_by_identifier(self, identifier: str):
        normalized = str(identifier).strip().lower()
        if normalized in {
            self.account["username_normalized"],
            self.account["email_normalized"],
        }:
            return dict(self.account)
        return None

    def current_user(self):
        if session.get("auth_kind") != "user":
            return None
        if session.get("user_login_key") != self.account["username_normalized"]:
            return None
        if int(session.get("session_version", 0)) != self.account["session_version"]:
            return None
        return dict(self.account)

    @staticmethod
    def client_key():
        return "127.0.0.1"

    @staticmethod
    def login_identifier_key(client_key: str, identifier: str):
        return f"{client_key}|identifier:{str(identifier).strip().lower()}"

    @staticmethod
    def login_is_limited(_key: str):
        return False

    def record_login_failure(self, key: str):
        self.failures.append(key)

    def clear_login_failures(self, key: str):
        self.cleared.append(key)

    @staticmethod
    def safe_next_url(_value):
        return "/app/list/watching"

    @staticmethod
    def account_change_is_limited(_key: str):
        return False

    def record_security_event(self, event_type: str, key: str):
        self.security_events.append((event_type, key))

    def update_user_password(self, user_id, password_hash: str):
        if user_id != self.account["user_id"]:
            raise AssertionError("wrong user")
        self.account["password_hash"] = password_hash
        self.account["session_version"] += 1
        return self.account["session_version"]

    def revoke_all_user_sessions(self, user_id):
        if user_id != self.account["user_id"]:
            raise AssertionError("wrong user")
        self.account["session_version"] += 1
        self.revocations += 1
        return self.account["session_version"]

    @staticmethod
    def login_required(view):
        return view

    @staticmethod
    def database_connection():
        raise AssertionError("legacy admin database path should not be used")

    @staticmethod
    def invalidate_admin_account_cache():
        pass


class MultiUserPhase3AuthTests(unittest.TestCase):
    def setUp(self):
        self.deps = Phase3Deps()
        self.app = Flask(
            __name__,
            template_folder=str(ROOT / "templates"),
        )
        self.app.secret_key = "phase3-test-secret"
        # Shared login templates link to Phase 4 recovery pages. Supply their
        # URLs without installing Phase 4's account interceptor in this test.
        self.app.add_url_rule(
            "/forgot-password", "phase4_forgot_password_page", lambda: "forgot"
        )
        self.app.add_url_rule(
            "/account/resend-verification", "phase4_resend_verification_page", lambda: "resend"
        )
        install_multi_user_phase3_routes(self.app, self.deps)

        @self.app.post("/login")
        def legacy_login_fallback():
            return "legacy-login-fallback", 418

        @self.app.get("/login")
        def login():
            return "login"

        @self.app.route("/api/admin/account", methods=["GET", "POST"])
        def legacy_account_fallback():
            return "legacy-account-fallback", 418

        self.client = self.app.test_client()

    def csrf(self) -> str:
        token = "phase3-csrf"
        with self.client.session_transaction() as browser_session:
            browser_session["csrf_token"] = token
        return token

    def login(self, identifier="Alice", password="correct horse battery staple"):
        token = self.csrf()
        return self.client.post(
            "/login",
            data={
                "csrf_token": token,
                "username": identifier,
                "password": password,
            },
        )

    def test_username_login_creates_uuid_account_session_without_exposing_uuid(self):
        response = self.login("Alice")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["Location"], "/app/list/watching")
        with self.client.session_transaction() as browser_session:
            self.assertTrue(browser_session["authenticated"])
            self.assertEqual(browser_session["auth_kind"], "user")
            self.assertEqual(browser_session["user_login_key"], "alice")
            self.assertEqual(browser_session["session_version"], 1)
            self.assertNotIn("user_id", browser_session)
            self.assertNotIn(str(self.deps.account["user_id"]), str(dict(browser_session)))
            self.assertEqual(len(browser_session["user_account_marker"]), 64)

    def test_email_login_resolves_the_same_uuid_account(self):
        response = self.login("ALICE@EXAMPLE.TEST")
        self.assertEqual(response.status_code, 302)
        with self.client.session_transaction() as browser_session:
            self.assertEqual(browser_session["user_login_key"], "alice")

    def test_unknown_identifier_falls_through_to_legacy_admin_during_migration(self):
        response = self.login("legacy-admin")
        self.assertEqual(response.status_code, 418)
        self.assertEqual(response.get_data(as_text=True), "legacy-login-fallback")

    def test_wrong_password_records_client_and_identifier_rate_limit_events(self):
        response = self.login(password="wrong password")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(len(self.deps.failures), 2)
        self.assertIn("127.0.0.1", self.deps.failures)
        self.assertTrue(any("identifier:alice" in key for key in self.deps.failures))

    def test_unverified_uuid_account_cannot_enter_application(self):
        self.deps.account["status"] = "unverified"
        self.deps.account["email_verified_at"] = None
        response = self.login()
        self.assertEqual(response.status_code, 403)
        self.assertIn("Verify your email", response.get_data(as_text=True))

    def test_password_change_requires_current_password_and_revokes_all_generations(self):
        self.assertEqual(self.login().status_code, 302)
        with self.client.session_transaction() as browser_session:
            csrf_token = browser_session["csrf_token"]

        response = self.client.post(
            "/api/admin/account",
            json={
                "username": "Alice",
                "currentPassword": "correct horse battery staple",
                "newPassword": "new password 123",
                "confirmPassword": "new password 123",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True, "reauthenticate": True})
        self.assertEqual(self.deps.account["session_version"], 2)
        self.assertTrue(
            self.deps.PASSWORD_HASHER.verify(
                self.deps.account["password_hash"], "new password 123"
            )
        )
        with self.client.session_transaction() as browser_session:
            self.assertNotIn("authenticated", browser_session)

    def test_phase3_does_not_pull_username_changes_forward(self):
        self.assertEqual(self.login().status_code, 302)
        with self.client.session_transaction() as browser_session:
            csrf_token = browser_session["csrf_token"]
        response = self.client.post(
            "/api/admin/account",
            json={
                "username": "Alice2",
                "currentPassword": "correct horse battery staple",
                "newPassword": "new password 123",
                "confirmPassword": "new password 123",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["code"], "username_change_unavailable")

    def test_sign_out_all_devices_invalidates_user_session_generation(self):
        self.assertEqual(self.login().status_code, 302)
        with self.client.session_transaction() as browser_session:
            csrf_token = browser_session["csrf_token"]
        response = self.client.post(
            "/api/account/sessions/sign-out-all",
            headers={"X-CSRF-Token": csrf_token},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.deps.revocations, 1)
        self.assertEqual(self.deps.account["session_version"], 2)
        with self.client.session_transaction() as browser_session:
            self.assertNotIn("authenticated", browser_session)

    def test_phase3_password_rule_and_registration_lock_match_project_contract(self):
        self.assertEqual(MIN_USER_PASSWORD_CHARS, 10)
        self.assertFalse(public_registration_enabled())
        phase3_source = (ROOT / "tvtracker" / "auth" / "phase3_routes.py").read_text()
        self.assertNotIn('@app.post("/signup")', phase3_source)
        login_source = (ROOT / "templates" / "login.html").read_text()
        self.assertIn("Username or email", login_source)
        self.assertIn("Registration coming soon", login_source)


if __name__ == "__main__":
    unittest.main()
