from __future__ import annotations

import os
import unittest
import uuid

import psycopg
from psycopg import sql

from tvtracker.migrations import DATABASE_SCHEMA_VERSION, MIGRATIONS
from tvtracker.migrations.runner import run_migrations


TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()


@unittest.skipUnless(
    TEST_DATABASE_URL,
    "TEST_DATABASE_URL is required for PostgreSQL migration integration tests",
)
class LegacyMigrationAdoptionTests(unittest.TestCase):
    def setUp(self):
        self.schema = f"legacy_adoption_{uuid.uuid4().hex}"
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema))
                )

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
            cursor.execute(
                sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema))
            )
        return connection

    def execute(self, statement: str, params=None) -> None:
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                if params is None:
                    cursor.execute(statement)
                else:
                    cursor.execute(statement, params)

    def fetchone(self, statement: str, params=None):
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                if params is None:
                    cursor.execute(statement)
                else:
                    cursor.execute(statement, params)
                return cursor.fetchone()

    def prepare_unledgered_v5_database(self) -> None:
        v5_migrations = MIGRATIONS[:5]
        self.assertEqual(
            run_migrations(self.connection_factory, v5_migrations),
            [migration.migration_id for migration in v5_migrations],
        )
        self.execute(
            """
            INSERT INTO tv_tracker_shows (show_id, data)
            VALUES (
                'production-v5-show',
                '{"title":"Preserved Production V5","status":"watching"}'::jsonb
            );

            UPDATE tv_tracker_notification_settings
            SET enabled = FALSE,
                timezone = 'Europe/London',
                timezone_mode = 'manual',
                new_episode = FALSE,
                updated_at = TIMESTAMPTZ '2026-08-01 00:00:00+00'
            WHERE singleton_id = 1;

            UPDATE tv_tracker_final_notification_settings
            SET movie_released = FALSE,
                movie_release_updates = TRUE,
                updated_at = TIMESTAMPTZ '2026-08-02 00:00:00+00'
            WHERE singleton_id = 1;
            """
        )
        self.execute("DROP TABLE tv_tracker_migrations")

        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, to_regclass('tv_tracker_migrations') "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (5, None),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'tv_tracker_notification_settings' "
                "AND column_name IN ('movie_released', 'movie_release_updates')"
            ),
            (0,),
        )

    def test_real_v5_schema_runs_v6_migration_and_preserves_user_data(self):
        self.prepare_unledgered_v5_database()

        stable_settings_before = self.fetchone(
            "SELECT enabled, timezone, timezone_mode, new_episode "
            "FROM tv_tracker_notification_settings WHERE singleton_id = 1"
        )
        show_before = self.fetchone(
            "SELECT data FROM tv_tracker_shows WHERE show_id = 'production-v5-show'"
        )

        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [migration.migration_id for migration in MIGRATIONS],
        )

        self.assertEqual(
            self.fetchone(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'tv_tracker_notification_settings' "
                "AND column_name IN ('movie_released', 'movie_release_updates')"
            ),
            (2,),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT enabled, timezone, timezone_mode, new_episode "
                "FROM tv_tracker_notification_settings WHERE singleton_id = 1"
            ),
            stable_settings_before,
        )
        self.assertEqual(
            self.fetchone(
                "SELECT movie_released, movie_release_updates "
                "FROM tv_tracker_notification_settings WHERE singleton_id = 1"
            ),
            (False, True),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT data FROM tv_tracker_shows WHERE show_id = 'production-v5-show'"
            ),
            show_before,
        )
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version FROM tv_tracker_schema_meta "
                "WHERE singleton_id = 1"
            ),
            (DATABASE_SCHEMA_VERSION,),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT array_agg(migration_id ORDER BY migration_id) "
                "FROM tv_tracker_migrations"
            ),
            ([migration.migration_id for migration in MIGRATIONS],),
        )
        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])

    def test_real_v5_upgrade_rolls_back_when_prior_schema_is_malformed(self):
        self.prepare_unledgered_v5_database()
        self.execute(
            "ALTER TABLE tv_tracker_notification_settings "
            "ALTER COLUMN new_episode DROP NOT NULL"
        )

        with self.assertRaisesRegex(RuntimeError, "new_episode"):
            run_migrations(self.connection_factory, MIGRATIONS)

        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, to_regclass('tv_tracker_migrations') "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (5, None),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'tv_tracker_notification_settings' "
                "AND column_name IN ('movie_released', 'movie_release_updates')"
            ),
            (0,),
        )
