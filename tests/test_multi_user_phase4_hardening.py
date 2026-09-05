from __future__ import annotations

import os
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import psycopg
from argon2 import PasswordHasher
from flask import Flask
from psycopg import sql

from tvtracker.auth.account_flows import (
    create_user_with_verification_token,
    verify_email_token,
)
from tvtracker.auth.account_updates import update_account_credentials
from tvtracker.auth.mail import MailDeliveryError
from tvtracker.auth.phase4_routes import install_multi_user_phase4_routes
from tvtracker.migrations import MIGRATIONS, run_migrations


ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()


class _RouteDeps:
    PASSWORD_HASHER = PasswordHasher()

    def __init__(self, account=None):
        self.account = account

    @staticmethod
    def login_required(view):
        return view

    def current_user(self):
        return self.account

    @staticmethod
    def database_connection():
        raise AssertionError("database access should be mocked in this route test")

    @staticmethod
    def check_csrf():
        return None

    @staticmethod
    def client_key():
        return "phase4-test-client"

    @staticmethod
    def account_change_is_limited(_key):
        return False

    @staticmethod
    def record_security_event(_event_type, _key):
        return None


def _app_with_phase4(deps: _RouteDeps) -> Flask:
    app = Flask(__name__, template_folder=str(ROOT / "templates"))
    app.secret_key = "phase4-hardening-test"
    install_multi_user_phase4_routes(app, deps)
    return app


def _prime_csrf(client) -> None:
    with client.session_transaction() as browser_session:
        browser_session["csrf_token"] = "phase4-test-csrf"


class MultiUserPhase4RouteHardeningTests(unittest.TestCase):
    def test_forgot_password_does_not_reveal_account_existence_or_mail_failure(self):
        app = _app_with_phase4(_RouteDeps())
        client = app.test_client()
        _prime_csrf(client)
        generic_notice = b"If an account exists for that email, a reset link will be sent."

        with patch("tvtracker.auth.phase4_routes.mail_is_configured", return_value=True), patch(
            "tvtracker.auth.phase4_routes.user_for_email", return_value=None
        ):
            missing = client.post("/forgot-password", data={"email": "missing@example.test"})

        eligible_account = {
            "user_id": uuid.uuid4(),
            "email": "member@example.test",
            "status": "active",
        }
        with patch("tvtracker.auth.phase4_routes.mail_is_configured", return_value=True), patch(
            "tvtracker.auth.phase4_routes.user_for_email", return_value=eligible_account
        ), patch(
            "tvtracker.auth.phase4_routes.issue_token",
            return_value=SimpleNamespace(raw_token="RAW-RESET-TOKEN"),
        ), patch(
            "tvtracker.auth.phase4_routes.password_reset_email",
            side_effect=MailDeliveryError("smtp unavailable"),
        ):
            delivery_failure = client.post(
                "/forgot-password", data={"email": "member@example.test"}
            )

        self.assertEqual(missing.status_code, 200)
        self.assertEqual(delivery_failure.status_code, 200)
        self.assertIn(generic_notice, missing.data)
        self.assertIn(generic_notice, delivery_failure.data)
        self.assertNotIn(b"RAW-RESET-TOKEN", delivery_failure.data)
        self.assertNotIn(b"smtp unavailable", delivery_failure.data)

    def test_resend_verification_does_not_reveal_account_state(self):
        app = _app_with_phase4(_RouteDeps())
        client = app.test_client()
        _prime_csrf(client)
        generic_notice = b"If that account still needs verification, a new link will be sent."

        cases = [
            None,
            {
                "user_id": uuid.uuid4(),
                "email": "verified@example.test",
                "status": "active",
                "email_verified_at": object(),
            },
            {
                "user_id": uuid.uuid4(),
                "email": "disabled@example.test",
                "status": "deactivated",
                "email_verified_at": None,
            },
        ]
        for account in cases:
            with self.subTest(account=account and account["status"]):
                with patch(
                    "tvtracker.auth.phase4_routes.mail_is_configured", return_value=True
                ), patch(
                    "tvtracker.auth.phase4_routes.user_for_email", return_value=account
                ):
                    response = client.post(
                        "/account/resend-verification",
                        data={"email": "person@example.test"},
                    )
                self.assertEqual(response.status_code, 200)
                self.assertIn(generic_notice, response.data)

    def test_signup_delivery_failure_is_safe_503_without_token_leak(self):
        app = _app_with_phase4(_RouteDeps())
        client = app.test_client()
        _prime_csrf(client)
        token = SimpleNamespace(raw_token="RAW-VERIFY-TOKEN")

        with patch(
            "tvtracker.auth.phase4_routes.public_registration_enabled",
            return_value=True,
        ), patch(
            "tvtracker.auth.phase4_routes.mail_is_configured", return_value=True
        ), patch(
            "tvtracker.auth.phase4_routes.create_user_with_verification_token",
            return_value=(uuid.uuid4(), token),
        ), patch(
            "tvtracker.auth.phase4_routes.verification_email",
            side_effect=MailDeliveryError("smtp unavailable"),
        ):
            response = client.post(
                "/signup",
                data={
                    "email": "new@example.test",
                    "signup_username": "New_User",
                    "signup_password": "long enough password",
                    "signup_confirm_password": "long enough password",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn(b"verification email is temporarily unavailable", response.data)
        self.assertNotIn(b"RAW-VERIFY-TOKEN", response.data)
        self.assertNotIn(b"smtp unavailable", response.data)

    def test_authenticated_email_change_delivery_failure_is_safe_503(self):
        hasher = PasswordHasher()
        account = {
            "user_id": uuid.uuid4(),
            "email": "old@example.test",
            "username": "Member_User",
            "password_hash": hasher.hash("current password 123"),
        }
        deps = _RouteDeps(account)
        deps.PASSWORD_HASHER = hasher
        app = _app_with_phase4(deps)
        client = app.test_client()
        _prime_csrf(client)

        with patch(
            "tvtracker.auth.phase4_routes.mail_is_configured", return_value=True
        ), patch(
            "tvtracker.auth.phase4_routes.ensure_email_available",
            return_value="new@example.test",
        ), patch(
            "tvtracker.auth.phase4_routes.issue_token",
            return_value=SimpleNamespace(raw_token="RAW-EMAIL-TOKEN"),
        ), patch(
            "tvtracker.auth.phase4_routes.email_change_email",
            side_effect=MailDeliveryError("smtp unavailable"),
        ):
            response = client.post(
                "/account/email",
                data={
                    "current_password": "current password 123",
                    "email": "new@example.test",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn(b"Email service is temporarily unavailable", response.data)
        self.assertNotIn(b"RAW-EMAIL-TOKEN", response.data)
        self.assertNotIn(b"smtp unavailable", response.data)


@unittest.skipUnless(
    TEST_DATABASE_URL,
    "TEST_DATABASE_URL is required for PostgreSQL Phase 4 hardening tests",
)
class MultiUserPhase4AtomicUpdateTests(unittest.TestCase):
    def setUp(self):
        self.schema = f"multi_user_phase4_hardening_{uuid.uuid4().hex}"
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        run_migrations(self.connection_factory, MIGRATIONS)
        self.hasher = PasswordHasher()

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                        sql.Identifier(self.schema)
                    )
                )

    def connection_factory(self):
        connection = psycopg.connect(TEST_DATABASE_URL, connect_timeout=10)
        with connection.cursor() as cursor:
            cursor.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
        return connection

    def fetchone(self, statement: str, params=None):
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, params)
                return cursor.fetchone()

    def test_combined_username_password_change_is_atomic_with_one_generation_bump(self):
        user_id, verification = create_user_with_verification_token(
            self.connection_factory,
            email="atomic@example.test",
            username="Atomic_User",
            password_hash=self.hasher.hash("old password 123"),
        )
        verify_email_token(self.connection_factory, verification.raw_token)
        before = self.fetchone(
            "SELECT session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )[0]

        display, normalized, version = update_account_credentials(
            self.connection_factory,
            user_id=user_id,
            username="Atomic_Renamed",
            password_hash=self.hasher.hash("new password 456"),
        )
        row = self.fetchone(
            "SELECT username, username_normalized, password_hash, session_version "
            "FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )

        self.assertEqual(display, "Atomic_Renamed")
        self.assertEqual(normalized, "atomic_renamed")
        self.assertEqual(row[0], display)
        self.assertEqual(row[1], normalized)
        self.assertTrue(self.hasher.verify(row[2], "new password 456"))
        self.assertEqual(row[3], before + 1)
        self.assertEqual(version, row[3])


if __name__ == "__main__":
    unittest.main()
