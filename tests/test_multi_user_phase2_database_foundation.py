from __future__ import annotations

import os
import unittest
import uuid

import psycopg
from psycopg import sql

from tvtracker import auth
from tvtracker.auth.accounts import (
    ACCOUNT_ROLES,
    ACCOUNT_STATUSES,
    new_user_id,
    normalize_email,
    normalize_username,
    validated_username,
)
from tvtracker.migrations import DATABASE_SCHEMA_VERSION, MIGRATIONS, run_migrations
from tvtracker.migrations.registry import MIGRATIONS as V6_MIGRATIONS
from tvtracker.migrations.registry_v7 import _OWNER_SCOPED_RELATIONS


TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

OWNER_RELATIONS = tuple(table_name for table_name, _index_name, _keys in _OWNER_SCOPED_RELATIONS)


class MultiUserPhase2DatabaseFoundationTests(unittest.TestCase):
    def test_schema_version_seven_extends_without_rewriting_v1_v6(self):
        self.assertEqual(DATABASE_SCHEMA_VERSION, 7)
        self.assertEqual(MIGRATIONS[-1].migration_id, "0007_multi_user_database_foundation")
        self.assertEqual(
            [(migration.migration_id, migration.checksum) for migration in MIGRATIONS[:6]],
            [(migration.migration_id, migration.checksum) for migration in V6_MIGRATIONS],
        )
        self.assertTrue(all(migration.schema_contract is None for migration in MIGRATIONS[:-1]))
        self.assertIsNotNone(MIGRATIONS[-1].schema_contract)
        self.assertEqual(MIGRATIONS[-1].schema_contract.schema_version, 7)
        self.assertEqual(MIGRATIONS[-1].schema_contract.legacy_schema_versions, (4, 5, 6))

    def test_user_schema_locks_identity_role_and_lifecycle_foundation(self):
        migration_sql = MIGRATIONS[-1].sql
        for fragment in (
            "CREATE TABLE IF NOT EXISTS tv_tracker_users",
            "user_id UUID CONSTRAINT tv_tracker_users_pkey PRIMARY KEY",
            "email_normalized TEXT NOT NULL",
            "username_normalized TEXT NOT NULL",
            "password_hash TEXT NOT NULL",
            "role TEXT NOT NULL DEFAULT 'user'",
            "status TEXT NOT NULL DEFAULT 'unverified'",
            "email_verified_at TIMESTAMPTZ",
            "session_version BIGINT NOT NULL DEFAULT 1",
            "deletion_requested_at TIMESTAMPTZ",
            "deletion_due_at TIMESTAMPTZ",
            "UNIQUE (email_normalized)",
            "UNIQUE (username_normalized)",
            "role IN ('user', 'admin')",
            "status IN ('unverified', 'active', 'deactivated', 'pending_deletion')",
            "username ~ '^[A-Za-z0-9_]{3,30}$'",
            "username_normalized = lower(username)",
            "email_normalized = lower(email)",
            "session_version >= 1",
            "deletion_due_at > deletion_requested_at",
        ):
            self.assertIn(fragment, migration_sql)

    def test_every_phase1_owned_boundary_gets_nullable_uuid_scaffolding(self):
        migration_sql = MIGRATIONS[-1].sql
        expected_relations = (
            "tv_tracker_shows",
            "tv_tracker_history",
            "tv_tracker_state",
            "tv_tracker_meta",
            "tv_tracker_changes",
            "tv_tracker_notification_settings",
            "tv_tracker_notification_baseline",
            "tv_tracker_notification_events",
            "tv_tracker_notifications",
            "tv_tracker_final_notification_settings",
            "tv_tracker_movie_notification_baseline",
            "tv_tracker_push_subscriptions",
            "tv_tracker_push_presence",
            "tv_tracker_push_deliveries",
            "tv_tracker_security_events",
        )
        self.assertEqual(OWNER_RELATIONS, expected_relations)
        for relation in expected_relations:
            self.assertIn(
                f"ALTER TABLE {relation} ADD COLUMN IF NOT EXISTS user_id UUID;",
                migration_sql,
            )
        self.assertNotIn("user_id UUID NOT NULL", migration_sql)
        self.assertNotRegex(migration_sql, r"(?i)\bUPDATE\b[^;]*\buser_id\b")
        self.assertNotRegex(migration_sql, r"(?i)\bINSERT\s+INTO\s+tv_tracker_users\b")
        self.assertNotRegex(migration_sql, r"(?i)\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b")

    def test_account_identity_primitives_match_locked_rules(self):
        first = new_user_id()
        second = new_user_id()
        self.assertIsInstance(first, uuid.UUID)
        self.assertNotEqual(first, second)
        self.assertEqual(ACCOUNT_ROLES, frozenset({"user", "admin"}))
        self.assertEqual(
            ACCOUNT_STATUSES,
            frozenset({"unverified", "active", "deactivated", "pending_deletion"}),
        )
        self.assertEqual(normalize_email("  Owner@Example.COM "), "owner@example.com")
        self.assertEqual(normalize_username("  Owner_Name "), "owner_name")
        self.assertEqual(validated_username("Owner_123"), "Owner_123")
        for invalid in ("ab", "a" * 31, "bad-name", "bad name", ""):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    validated_username(invalid)

    def test_registration_remains_closed_and_legacy_admin_remains_exported(self):
        self.assertFalse(auth.PUBLIC_REGISTRATION_ENABLED)
        self.assertFalse(auth.public_registration_enabled())
        self.assertEqual(auth.PUBLIC_REGISTRATION_OPEN_PHASE, 8)
        self.assertTrue(callable(auth.read_admin_account))
        self.assertTrue(callable(auth.new_user_id))


@unittest.skipUnless(
    TEST_DATABASE_URL,
    "TEST_DATABASE_URL is required for PostgreSQL Phase 2 migration tests",
)
class MultiUserPhase2PostgreSQLTests(unittest.TestCase):
    def setUp(self):
        self.schema = f"multi_user_phase2_{uuid.uuid4().hex}"
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))

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

    def execute(self, statement: str, params=None) -> None:
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, params)

    def fetchone(self, statement: str, params=None):
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, params)
                return cursor.fetchone()

    def test_v6_data_is_preserved_and_left_unassigned_by_phase2(self):
        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS[:6]),
            [migration.migration_id for migration in MIGRATIONS[:6]],
        )
        self.execute(
            """
            INSERT INTO tv_tracker_shows (show_id, data)
            VALUES ('phase2-preserved-show', '{"title":"Preserved"}'::jsonb);
            INSERT INTO tv_tracker_history (entry_id, data)
            VALUES ('phase2-preserved-history', '{"title":"Preserved"}'::jsonb);
            INSERT INTO tv_tracker_state (state_key, data)
            VALUES ('profile', '{"username":"Legacy Owner"}'::jsonb);
            """
        )

        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [MIGRATIONS[-1].migration_id],
        )
        self.assertEqual(
            self.fetchone("SELECT schema_version FROM tv_tracker_schema_meta WHERE singleton_id = 1"),
            (7,),
        )
        self.assertEqual(self.fetchone("SELECT COUNT(*) FROM tv_tracker_users"), (0,))
        self.assertEqual(
            self.fetchone(
                "SELECT data->>'title', user_id FROM tv_tracker_shows "
                "WHERE show_id = 'phase2-preserved-show'"
            ),
            ("Preserved", None),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT data->>'title', user_id FROM tv_tracker_history "
                "WHERE entry_id = 'phase2-preserved-history'"
            ),
            ("Preserved", None),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT data->>'username', user_id FROM tv_tracker_state "
                "WHERE state_key = 'profile'"
            ),
            ("Legacy Owner", None),
        )
        for relation in OWNER_RELATIONS:
            with self.subTest(relation=relation):
                self.assertEqual(
                    self.fetchone(
                        f"SELECT COUNT(*) FROM {relation} WHERE user_id IS NOT NULL"
                    ),
                    (0,),
                )
        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])

    def test_user_table_rejects_duplicate_normalized_identifiers_and_bad_roles(self):
        run_migrations(self.connection_factory, MIGRATIONS)
        first_user = new_user_id()
        self.execute(
            """
            INSERT INTO tv_tracker_users
            (user_id, email, email_normalized, username, username_normalized,
             password_hash, role, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'user', 'unverified')
            """,
            (
                first_user,
                "Owner@Example.com",
                "owner@example.com",
                "Owner_Name",
                "owner_name",
                "argon2-test-hash",
            ),
        )
        with self.assertRaises(psycopg.errors.UniqueViolation):
            self.execute(
                """
                INSERT INTO tv_tracker_users
                (user_id, email, email_normalized, username, username_normalized,
                 password_hash, role, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'user', 'unverified')
                """,
                (
                    new_user_id(),
                    "owner@example.com",
                    "owner@example.com",
                    "Different_User",
                    "different_user",
                    "argon2-test-hash",
                ),
            )
        with self.assertRaises(psycopg.errors.CheckViolation):
            self.execute(
                """
                INSERT INTO tv_tracker_users
                (user_id, email, email_normalized, username, username_normalized,
                 password_hash, role, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'superadmin', 'active')
                """,
                (
                    new_user_id(),
                    "other@example.com",
                    "other@example.com",
                    "Other_User",
                    "other_user",
                    "argon2-test-hash",
                ),
            )
