from __future__ import annotations

import os
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import psycopg
from argon2 import PasswordHasher
from flask import Flask
from psycopg import sql

from tvtracker.auth.account_flows import (
    EMAIL_CHANGE,
    PASSWORD_RESET,
    InvalidTokenError,
    confirm_email_change_token,
    create_user_with_verification_token,
    hash_token,
    issue_token,
    reset_password_token,
    update_username,
    verify_email_token,
)
from tvtracker.auth.mail import MailConfig, MailConfigurationError
from tvtracker.auth.phase4_routes import install_multi_user_phase4_routes
from tvtracker.auth.registration_policy import public_registration_enabled
from tvtracker.migrations import DATABASE_SCHEMA_VERSION, MIGRATIONS, run_migrations
from tvtracker.migrations.registry_v7 import MIGRATIONS as V7_MIGRATIONS


ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()


class _ClosedRegistrationDeps:
    PASSWORD_HASHER = PasswordHasher()

    def __init__(self):
        self.database_calls = 0

    @staticmethod
    def login_required(view):
        return view

    @staticmethod
    def current_user():
        return None

    def database_connection(self):
        self.database_calls += 1
        raise AssertionError("closed registration must not touch the database")

    @staticmethod
    def check_csrf():
        raise AssertionError("closed registration must reject before CSRF/account creation")

    @staticmethod
    def client_key():
        return "test-client"

    @staticmethod
    def account_change_is_limited(_key):
        return False

    @staticmethod
    def record_security_event(_event_type, _key):
        return None


class MultiUserPhase4ContractTests(unittest.TestCase):
    def test_schema_version_eight_adds_hashed_account_tokens_without_rewriting_v7(self):
        self.assertEqual(DATABASE_SCHEMA_VERSION, 8)
        self.assertEqual(MIGRATIONS[-1].migration_id, "0008_account_creation_email_tokens")
        self.assertEqual(
            [(migration.migration_id, migration.checksum) for migration in MIGRATIONS[:7]],
            [(migration.migration_id, migration.checksum) for migration in V7_MIGRATIONS],
        )
        migration_sql = MIGRATIONS[-1].sql
        for fragment in (
            "CREATE TABLE IF NOT EXISTS tv_tracker_account_tokens",
            "token_hash TEXT NOT NULL",
            "UNIQUE (token_hash)",
            "purpose IN ('verify_email', 'password_reset', 'email_change')",
            "REFERENCES tv_tracker_users(user_id) ON DELETE CASCADE",
            "expires_at TIMESTAMPTZ NOT NULL",
            "used_at TIMESTAMPTZ",
            "tv_tracker_account_tokens_user_purpose_idx",
            "tv_tracker_account_tokens_expiry_idx",
        ):
            self.assertIn(fragment, migration_sql)
        self.assertNotIn("raw_token", migration_sql)

    def test_public_signup_route_exists_but_closed_policy_rejects_before_database(self):
        self.assertFalse(public_registration_enabled())
        deps = _ClosedRegistrationDeps()
        app = Flask(__name__, template_folder=str(ROOT / "templates"))
        app.secret_key = "phase4-closed-registration-test"
        install_multi_user_phase4_routes(app, deps)
        client = app.test_client()
        response = client.post(
            "/signup",
            data={
                "email": "new@example.test",
                "signup_username": "New_User",
                "signup_password": "long enough password",
                "signup_confirm_password": "long enough password",
            },
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(deps.database_calls, 0)

    def test_login_ui_keeps_signup_form_behind_source_controlled_gate(self):
        source = (ROOT / "templates" / "login.html").read_text(encoding="utf-8")
        self.assertIn("{% if public_registration_enabled %}", source)
        self.assertIn("Registration coming soon", source)
        self.assertIn("phase4_signup_post", source)
        self.assertIn("Forgot password?", source)
        self.assertIn("Resend verification", source)

    def test_tokens_are_one_way_hashes(self):
        raw = "secret-token-value"
        digest = hash_token(raw)
        self.assertNotEqual(raw, digest)
        self.assertEqual(len(digest), 64)
        self.assertEqual(digest, hash_token(raw))

    def test_mail_configuration_is_provider_neutral_and_supports_alwaysdata_no_auth(self):
        values = {
            "MAIL_HOST": "smtp-example.alwaysdata.net",
            "MAIL_PORT": "587",
            "MAIL_SECURITY": "starttls",
            "MAIL_USERNAME": "",
            "MAIL_PASSWORD": "",
            "MAIL_FROM_ADDRESS": "noreply@example.test",
            "MAIL_FROM_NAME": "",
            "APP_DISPLAY_NAME": "My Watchlist",
        }
        with patch.dict(os.environ, values, clear=False):
            config = MailConfig.from_environment()
        self.assertEqual(config.host, "smtp-example.alwaysdata.net")
        self.assertEqual(config.port, 587)
        self.assertEqual(config.security, "starttls")
        self.assertEqual(config.username, "")
        self.assertEqual(config.from_name, "My Watchlist")
        self.assertEqual(config.display_name, "My Watchlist")

    def test_mail_configuration_rejects_partial_credentials(self):
        values = {
            "MAIL_HOST": "smtp.example.test",
            "MAIL_PORT": "587",
            "MAIL_SECURITY": "starttls",
            "MAIL_USERNAME": "mailer",
            "MAIL_PASSWORD": "",
            "MAIL_FROM_ADDRESS": "noreply@example.test",
        }
        with patch.dict(os.environ, values, clear=False):
            with self.assertRaises(MailConfigurationError):
                MailConfig.from_environment()


@unittest.skipUnless(
    TEST_DATABASE_URL,
    "TEST_DATABASE_URL is required for PostgreSQL Phase 4 account-flow tests",
)
class MultiUserPhase4PostgreSQLTests(unittest.TestCase):
    def setUp(self):
        self.schema = f"multi_user_phase4_{uuid.uuid4().hex}"
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        run_migrations(self.connection_factory, MIGRATIONS)
        self.hasher = PasswordHasher()

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(self.schema))
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

    def execute(self, statement: str, params=None) -> None:
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, params)

    def new_unverified_user(self):
        return create_user_with_verification_token(
            self.connection_factory,
            email="Alice@Example.test",
            username="Alice_User",
            password_hash=self.hasher.hash("correct horse battery staple"),
        )

    def test_verification_token_is_hashed_single_use_and_activates_account(self):
        user_id, token = self.new_unverified_user()
        stored = self.fetchone(
            "SELECT token_hash, used_at FROM tv_tracker_account_tokens WHERE user_id = %s",
            (user_id,),
        )
        self.assertEqual(stored[0], hash_token(token.raw_token))
        self.assertNotEqual(stored[0], token.raw_token)
        self.assertIsNone(stored[1])

        self.assertEqual(verify_email_token(self.connection_factory, token.raw_token), user_id)
        account = self.fetchone(
            "SELECT status, email_verified_at FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )
        self.assertEqual(account[0], "active")
        self.assertIsNotNone(account[1])
        with self.assertRaises(InvalidTokenError):
            verify_email_token(self.connection_factory, token.raw_token)

    def test_password_reset_is_single_use_and_revokes_all_session_generations(self):
        user_id, verification = self.new_unverified_user()
        verify_email_token(self.connection_factory, verification.raw_token)
        token = issue_token(
            self.connection_factory,
            user_id=user_id,
            purpose=PASSWORD_RESET,
        )
        before = self.fetchone(
            "SELECT session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )[0]
        reset_password_token(
            self.connection_factory,
            raw_token=token.raw_token,
            password_hash=self.hasher.hash("replacement password 123"),
        )
        password_hash, after = self.fetchone(
            "SELECT password_hash, session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )
        self.assertTrue(self.hasher.verify(password_hash, "replacement password 123"))
        self.assertEqual(after, before + 1)
        with self.assertRaises(InvalidTokenError):
            reset_password_token(
                self.connection_factory,
                raw_token=token.raw_token,
                password_hash=self.hasher.hash("another replacement 123"),
            )

    def test_expired_password_reset_token_is_rejected(self):
        user_id, verification = self.new_unverified_user()
        verify_email_token(self.connection_factory, verification.raw_token)
        token = issue_token(
            self.connection_factory,
            user_id=user_id,
            purpose=PASSWORD_RESET,
        )
        self.execute(
            """
            UPDATE tv_tracker_account_tokens
            SET created_at = NOW() - INTERVAL '31 minutes',
                expires_at = NOW() - INTERVAL '1 second'
            WHERE token_hash = %s
            """,
            (hash_token(token.raw_token),),
        )
        with self.assertRaises(InvalidTokenError):
            reset_password_token(
                self.connection_factory,
                raw_token=token.raw_token,
                password_hash=self.hasher.hash("replacement password 123"),
            )

    def test_email_change_keeps_old_address_until_verified_then_revokes_other_sessions(self):
        user_id, verification = self.new_unverified_user()
        verify_email_token(self.connection_factory, verification.raw_token)
        before = self.fetchone(
            "SELECT email, session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )
        token = issue_token(
            self.connection_factory,
            user_id=user_id,
            purpose=EMAIL_CHANGE,
            pending_email="NewAddress@Example.test",
        )
        pending = self.fetchone(
            "SELECT email FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )[0]
        self.assertEqual(pending, before[0])

        confirmed_user, version = confirm_email_change_token(
            self.connection_factory, token.raw_token
        )
        self.assertEqual(confirmed_user, user_id)
        after = self.fetchone(
            "SELECT email, email_normalized, session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )
        self.assertEqual(after[0], "NewAddress@Example.test")
        self.assertEqual(after[1], "newaddress@example.test")
        self.assertEqual(after[2], before[1] + 1)
        self.assertEqual(version, after[2])
        with self.assertRaises(InvalidTokenError):
            confirm_email_change_token(self.connection_factory, token.raw_token)

    def test_username_change_preserves_uuid_and_invalidates_other_sessions(self):
        user_id, verification = self.new_unverified_user()
        verify_email_token(self.connection_factory, verification.raw_token)
        before = self.fetchone(
            "SELECT session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )[0]
        display, normalized, version = update_username(
            self.connection_factory,
            user_id=user_id,
            username="Alice_Renamed",
        )
        row = self.fetchone(
            "SELECT user_id, username, username_normalized, session_version FROM tv_tracker_users WHERE user_id = %s",
            (user_id,),
        )
        self.assertEqual(row[0], user_id)
        self.assertEqual(display, "Alice_Renamed")
        self.assertEqual(normalized, "alice_renamed")
        self.assertEqual(row[1], display)
        self.assertEqual(row[2], normalized)
        self.assertEqual(row[3], before + 1)
        self.assertEqual(version, row[3])


if __name__ == "__main__":
    unittest.main()
