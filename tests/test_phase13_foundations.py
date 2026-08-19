from __future__ import annotations

from html.parser import HTMLParser
import importlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import textwrap
import time
import unittest
import uuid

import psycopg
from psycopg import sql

from tvtracker.migrations import DATABASE_SCHEMA_VERSION, MIGRATIONS
from tvtracker.migrations.runner import (
    MIGRATION_LOCK_KEY,
    SchemaContract,
    SqlMigration,
    run_migrations,
)


ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()


class FakeCursor:
    def __init__(
        self,
        *,
        schema_version: int | None = None,
        schema_meta_exists: bool | None = None,
        managed_relations: set[str] | None = None,
        validation_issues: list[str] | None = None,
    ) -> None:
        self.applied: dict[str, str] = {}
        self.executed: list[tuple[str, object]] = []
        self._rows: list[tuple[str, str]] = []
        self._row: tuple[object, ...] | None = None
        self.schema_version = schema_version
        self.schema_meta_exists = (
            schema_version is not None
            if schema_meta_exists is None
            else schema_meta_exists
        )
        self.managed_relations = set(managed_relations or set())
        self.validation_issues = list(validation_issues or [])

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=None):
        text = str(sql)
        self.executed.append((text, params))
        if "to_regclass('tv_tracker_schema_meta')" in text:
            relation = "tv_tracker_schema_meta" if self.schema_meta_exists else None
            self._row = (relation,)
        elif "SELECT schema_version FROM tv_tracker_schema_meta" in text:
            self._row = (
                (self.schema_version,)
                if self.schema_version is not None
                else None
            )
        elif "SELECT migration_id, checksum FROM tv_tracker_migrations" in text:
            self._rows = sorted(self.applied.items())
        elif "relation.relname = ANY" in text:
            assert params is not None
            expected_names = set(params[0])
            self._rows = [
                (relation_name, "")
                for relation_name in sorted(self.managed_relations & expected_names)
            ]
        elif "phase13_schema_validation" in text:
            self._rows = [(issue, "") for issue in self.validation_issues]
        elif "INSERT INTO tv_tracker_migrations" in text:
            assert params is not None
            self.applied[str(params[0])] = str(params[1])
        elif "CREATE TABLE IF NOT EXISTS tv_tracker_schema_meta" in text:
            self.schema_meta_exists = True
        elif "INSERT INTO tv_tracker_schema_meta" in text:
            assert params is not None
            self.schema_meta_exists = True
            self.schema_version = int(params[0])

    def fetchone(self):
        return self._row

    def fetchall(self):
        return list(self._rows)


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor
        self.commit_count = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commit_count += 1


class TemplateElements(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.elements: list[tuple[str, dict[str, str | None]]] = []

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


def workflow_run_commands(path: Path) -> list[str]:
    """Return commands from executable YAML blocks, excluding names and comments."""

    lines = path.read_text(encoding="utf-8").splitlines()
    commands: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        match = re.match(
            r"^(?P<indent>\s*)(?:-\s*)?(?:run|script):\s*(?P<value>.*)$",
            line,
        )
        if not match:
            index += 1
            continue

        value = match.group("value").strip()
        if value not in {"|", ">"}:
            commands.append(value)
            index += 1
            continue

        parent_indent = len(match.group("indent"))
        index += 1
        while index < len(lines):
            child = lines[index]
            child_indent = len(child) - len(child.lstrip())
            if child.strip() and child_indent <= parent_indent:
                break
            if child.strip():
                commands.append(child.strip())
            index += 1
    return commands


class Phase13MigrationFoundationTests(unittest.TestCase):
    @staticmethod
    def contract_migration(
        sql: str = "CREATE TABLE example (id INTEGER);",
        *,
        adoption_seed_sql: str | None = "SELECT phase13_adoption_seed",
    ):
        return SqlMigration(
            "0001_example",
            sql,
            schema_contract=SchemaContract(
                schema_version=DATABASE_SCHEMA_VERSION,
                managed_relations=("tv_tracker_example",),
                validation_sql="SELECT phase13_schema_validation",
                legacy_schema_versions=(DATABASE_SCHEMA_VERSION - 1,),
                adoption_seed_sql=adoption_seed_sql,
            ),
        )

    def test_runner_applies_once_and_rejects_checksum_rewrites(self):
        cursor = FakeCursor()
        connection = FakeConnection(cursor)
        migration = SqlMigration("0001_example", "CREATE TABLE example (id INTEGER);")

        self.assertEqual(run_migrations(lambda: connection, [migration]), ["0001_example"])
        self.assertEqual(run_migrations(lambda: connection, [migration]), [])
        self.assertEqual(connection.commit_count, 2)
        self.assertEqual(
            sum("CREATE TABLE example" in sql for sql, _params in cursor.executed),
            1,
        )

        changed = SqlMigration("0001_example", "CREATE TABLE example (id BIGINT);")
        with self.assertRaises(RuntimeError):
            run_migrations(lambda: connection, [changed])

        lock_calls = [
            params
            for sql, params in cursor.executed
            if "pg_advisory_xact_lock" in sql
        ]
        self.assertEqual(lock_calls, [(MIGRATION_LOCK_KEY,)] * 3)
        first_run_sql = [sql for sql, _params in cursor.executed[:7]]
        self.assertLess(
            next(index for index, sql in enumerate(first_run_sql) if "pg_advisory_xact_lock" in sql),
            next(index for index, sql in enumerate(first_run_sql) if "CREATE TABLE IF NOT EXISTS tv_tracker_migrations" in sql),
        )

    def test_runner_validates_registry_order_ids_and_checksums(self):
        with self.assertRaises(ValueError):
            SqlMigration("bad-name", "SELECT 1;")
        with self.assertRaises(ValueError):
            SqlMigration("0001_empty", "  ")
        with self.assertRaisesRegex(ValueError, "adoption seed SQL"):
            self.contract_migration(adoption_seed_sql="  ")
        with self.assertRaises(RuntimeError):
            run_migrations(
                lambda: FakeConnection(FakeCursor()),
                [
                    SqlMigration("0002_second", "SELECT 2;"),
                    SqlMigration("0001_first", "SELECT 1;"),
                ],
            )
        with self.assertRaises(RuntimeError):
            run_migrations(
                lambda: FakeConnection(FakeCursor()),
                [
                    SqlMigration("0001_first", "SELECT 1;"),
                    SqlMigration("0001_first", "SELECT 1;"),
                ],
            )

        unix = SqlMigration("0001_first", "SELECT 1;\n")
        windows = SqlMigration("0001_first", "SELECT 1;\r\n")
        self.assertEqual(unix.checksum, windows.checksum)

    def test_runner_rejects_unknown_nonprefix_and_database_ahead_state(self):
        first = SqlMigration("0001_first", "SELECT 1;")
        second = SqlMigration("0002_second", "SELECT 2;")

        unknown_cursor = FakeCursor()
        unknown_cursor.applied["9999_unknown"] = "unknown"
        with self.assertRaisesRegex(RuntimeError, "unknown applied migrations"):
            run_migrations(
                lambda: FakeConnection(unknown_cursor),
                [first, second],
            )

        nonprefix_cursor = FakeCursor()
        nonprefix_cursor.applied[second.migration_id] = second.checksum
        with self.assertRaisesRegex(RuntimeError, "ordered prefix"):
            run_migrations(
                lambda: FakeConnection(nonprefix_cursor),
                [first, second],
            )

        ahead_cursor = FakeCursor(schema_version=DATABASE_SCHEMA_VERSION + 1)
        with self.assertRaisesRegex(RuntimeError, "newer than this application"):
            run_migrations(
                lambda: FakeConnection(ahead_cursor),
                [self.contract_migration()],
            )
        self.assertIn("pg_advisory_xact_lock", ahead_cursor.executed[0][0])
        self.assertFalse(
            any(
                "CREATE TABLE IF NOT EXISTS tv_tracker_migrations" in statement
                for statement, _params in ahead_cursor.executed
            )
        )

        unsupported_cursor = FakeCursor(schema_version=1)
        with self.assertRaisesRegex(
            RuntimeError,
            "unsupported unledgered database schema version 1",
        ):
            run_migrations(
                lambda: FakeConnection(unsupported_cursor),
                [self.contract_migration()],
            )
        self.assertFalse(
            any(
                "phase13_schema_validation" in statement
                for statement, _params in unsupported_cursor.executed
            )
        )

    def test_runner_validates_legacy_adoption_before_stamping(self):
        migration = self.contract_migration()
        for schema_version in (
            DATABASE_SCHEMA_VERSION,
            DATABASE_SCHEMA_VERSION - 1,
        ):
            with self.subTest(schema_version=schema_version):
                canonical_cursor = FakeCursor(schema_version=schema_version)
                self.assertEqual(
                    run_migrations(
                        lambda: FakeConnection(canonical_cursor),
                        [migration],
                    ),
                    [migration.migration_id],
                )
                self.assertEqual(
                    canonical_cursor.applied,
                    {migration.migration_id: migration.checksum},
                )
                self.assertEqual(
                    canonical_cursor.schema_version,
                    DATABASE_SCHEMA_VERSION,
                )
                self.assertFalse(
                    any(
                        migration.sql in statement
                        for statement, _params in canonical_cursor.executed
                    )
                )
                statements = [
                    statement
                    for statement, _params in canonical_cursor.executed
                ]
                validation_index = next(
                    index
                    for index, statement in enumerate(statements)
                    if "phase13_schema_validation" in statement
                )
                seed_index = next(
                    index
                    for index, statement in enumerate(statements)
                    if "phase13_adoption_seed" in statement
                )
                ledger_index = next(
                    index
                    for index, statement in enumerate(statements)
                    if "INSERT INTO tv_tracker_migrations" in statement
                )
                self.assertLess(validation_index, seed_index)
                self.assertLess(seed_index, ledger_index)
                if schema_version == DATABASE_SCHEMA_VERSION - 1:
                    version_index = next(
                        index
                        for index, statement in enumerate(statements)
                        if "INSERT INTO tv_tracker_schema_meta" in statement
                    )
                    self.assertLess(seed_index, version_index)

                self.assertEqual(
                    run_migrations(
                        lambda: FakeConnection(canonical_cursor),
                        [migration],
                    ),
                    [],
                )
                self.assertEqual(
                    sum(
                        "phase13_adoption_seed" in statement
                        for statement, _params in canonical_cursor.executed
                    ),
                    1,
                )

        for schema_version in (
            DATABASE_SCHEMA_VERSION,
            DATABASE_SCHEMA_VERSION - 1,
        ):
            with self.subTest(malformed_schema_version=schema_version):
                malformed_cursor = FakeCursor(
                    schema_version=schema_version,
                    validation_issues=["column tv_tracker_example.id differs"],
                )
                with self.assertRaisesRegex(
                    RuntimeError,
                    "repair the reported drift",
                ):
                    run_migrations(
                        lambda: FakeConnection(malformed_cursor),
                        [migration],
                    )
                self.assertEqual(malformed_cursor.applied, {})
                self.assertEqual(
                    malformed_cursor.schema_version,
                    schema_version,
                )
                self.assertFalse(
                    any(
                        "phase13_adoption_seed" in statement
                        for statement, _params in malformed_cursor.executed
                    )
                )

    def test_runner_rejects_ambiguous_unledgered_schema(self):
        migration = self.contract_migration()
        cursor = FakeCursor(managed_relations={"tv_tracker_example"})

        with self.assertRaisesRegex(RuntimeError, "unversioned existing schema"):
            run_migrations(lambda: FakeConnection(cursor), [migration])

        self.assertEqual(cursor.applied, {})
        self.assertFalse(
            any(migration.sql in statement for statement, _params in cursor.executed)
        )

    def test_runner_repairs_missing_or_behind_version_for_complete_ledger(self):
        migration = self.contract_migration()
        for label, cursor in (
            (
                "missing",
                FakeCursor(schema_meta_exists=False),
            ),
            (
                "behind",
                FakeCursor(schema_version=DATABASE_SCHEMA_VERSION - 1),
            ),
        ):
            with self.subTest(label=label):
                cursor.applied[migration.migration_id] = migration.checksum
                self.assertEqual(
                    run_migrations(lambda: FakeConnection(cursor), [migration]),
                    [],
                )
                self.assertEqual(cursor.schema_version, DATABASE_SCHEMA_VERSION)
                self.assertEqual(
                    cursor.applied,
                    {migration.migration_id: migration.checksum},
                )
                self.assertTrue(
                    any(
                        "phase13_schema_validation" in statement
                        for statement, _params in cursor.executed
                    )
                )

    def test_registry_is_ordered_additive_and_covers_current_schema(self):
        migration_ids = [migration.migration_id for migration in MIGRATIONS]
        self.assertEqual(
            migration_ids,
            [
                "0001_core_schema",
                "0002_notification_schema",
                "0003_notification_timezone_mode",
                "0004_final_notification_schema",
                "0005_push_schema",
            ],
        )
        self.assertEqual(
            int(migration_ids[-1].split("_", 1)[0]),
            DATABASE_SCHEMA_VERSION,
        )
        self.assertIsNotNone(MIGRATIONS[-1].schema_contract)
        self.assertEqual(
            MIGRATIONS[-1].schema_contract.schema_version,
            DATABASE_SCHEMA_VERSION,
        )
        self.assertEqual(
            MIGRATIONS[-1].schema_contract.legacy_schema_versions,
            (4,),
        )
        adoption_seed_sql = MIGRATIONS[-1].schema_contract.adoption_seed_sql
        self.assertIsNotNone(adoption_seed_sql)
        self.assertEqual(adoption_seed_sql.upper().count("INSERT INTO"), 3)
        self.assertEqual(
            adoption_seed_sql.upper().count(
                "ON CONFLICT (SINGLETON_ID) DO NOTHING"
            ),
            3,
        )
        for table in (
            "tv_tracker_meta",
            "tv_tracker_notification_settings",
            "tv_tracker_final_notification_settings",
        ):
            self.assertIn(f"INSERT INTO {table}", adoption_seed_sql)

        migration_sql = "\n".join(migration.sql for migration in MIGRATIONS)
        for table in (
            "tv_tracker_shows",
            "tv_tracker_admin",
            "tv_tracker_schema_meta",
            "tv_tracker_notifications",
            "tv_tracker_final_notification_settings",
            "tv_tracker_movie_notification_baseline",
            "tv_tracker_push_subscriptions",
            "tv_tracker_push_presence",
            "tv_tracker_push_deliveries",
        ):
            self.assertIn(f"CREATE TABLE IF NOT EXISTS {table}", migration_sql)
        for column in ("timezone_mode", "media_type", "session_version"):
            self.assertRegex(
                migration_sql,
                rf"ADD COLUMN IF NOT EXISTS {column}\b",
            )
        self.assertNotRegex(
            migration_sql,
            r"\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b",
        )

        app_source = (ROOT / "app.py").read_text(encoding="utf-8")
        self.assertRegex(app_source, r"(?m)^SCHEMA_VERSION = 5$")
        self.assertIn("DATABASE_SCHEMA_VERSION", app_source)
        self.assertIn("run_migrations(database_connection, MIGRATIONS)", app_source)
        self.assertIn("def _ensure_admin_account()", app_source)
        self.assertNotIn("APP_PASSWORD_HASH", migration_sql)

    def test_schema_validation_avoids_postgresql_15_only_index_catalog_field(self):
        registry_source = (
            ROOT / "tvtracker/migrations/registry.py"
        ).read_text(encoding="utf-8")
        validation_sql = MIGRATIONS[-1].schema_contract.validation_sql

        self.assertNotRegex(registry_source, r"\bindnullsnotdistinct\b")
        self.assertIn("pg_catalog.pg_get_indexdef", validation_sql)
        self.assertIn(
            "[[:space:]]nulls[[:space:]]+not[[:space:]]+distinct",
            validation_sql,
        )
        self.assertIn("actual.is_unique <> expected.is_unique", validation_sql)
        self.assertIn(
            "actual.key_definitions <> expected.key_definitions",
            validation_sql,
        )
        self.assertIn("index_row.indpred IS NULL", validation_sql)
        self.assertIn("index_row.indnatts = index_row.indnkeyatts", validation_sql)
        # CI currently executes PostgreSQL 16. PostgreSQL 12-14 execution remains
        # desirable matrix coverage; this guards against a parse-time dependency
        # on the index-catalog field added in PostgreSQL 15.


@unittest.skipUnless(
    TEST_DATABASE_URL,
    "TEST_DATABASE_URL is required for PostgreSQL migration integration tests",
)
class Phase13PostgreSQLIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.schema = f"phase13_{uuid.uuid4().hex}"
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

    def apply_unledgered_current_schema(self) -> None:
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                for migration in MIGRATIONS:
                    cursor.execute(migration.sql)

    def singleton_seed_rows(self) -> dict[str, object]:
        return {
            "meta": self.fetchone(
                "SELECT singleton_id, revision, updated_at "
                "FROM tv_tracker_meta WHERE singleton_id = 1"
            ),
            "notification_settings": self.fetchone(
                "SELECT singleton_id, enabled, timezone, timezone_mode, "
                "new_episode, initialized_at, last_checked_at, updated_at "
                "FROM tv_tracker_notification_settings WHERE singleton_id = 1"
            ),
            "final_settings": self.fetchone(
                "SELECT singleton_id, movie_released, movie_release_updates, "
                "updated_at FROM tv_tracker_final_notification_settings "
                "WHERE singleton_id = 1"
            ),
        }

    def adoption_seed_state(self) -> dict[str, object]:
        state = self.singleton_seed_rows()
        state.update(
            {
                "schema_meta": self.fetchone(
                    "SELECT schema_version, updated_at FROM tv_tracker_schema_meta "
                    "WHERE singleton_id = 1"
                ),
                "ledger": self.fetchone(
                    "SELECT COUNT(*), MIN(applied_at), MAX(applied_at) "
                    "FROM tv_tracker_migrations"
                ),
                "show": self.fetchone(
                    "SELECT data FROM tv_tracker_shows "
                    "WHERE show_id = 'seed-repair-show'"
                ),
            }
        )
        return state

    def assert_adoption_repairs_singleton_seeds(
        self,
        *,
        missing: set[str],
        schema_version: int,
    ) -> None:
        seed_tables = {
            "meta": "tv_tracker_meta",
            "notification_settings": "tv_tracker_notification_settings",
            "final_settings": "tv_tracker_final_notification_settings",
        }
        self.assertTrue(missing)
        self.assertLessEqual(missing, set(seed_tables))

        self.apply_unledgered_current_schema()
        self.execute(
            """
            INSERT INTO tv_tracker_shows (show_id, data)
            VALUES (
                'seed-repair-show',
                '{"title":"Preserved During Seed Repair"}'::jsonb
            );
            UPDATE tv_tracker_meta
            SET revision = 41,
                updated_at = TIMESTAMPTZ '2001-01-01 00:00:00+00'
            WHERE singleton_id = 1;
            UPDATE tv_tracker_notification_settings
            SET enabled = FALSE,
                timezone = 'Pacific/Auckland',
                timezone_mode = 'manual',
                new_episode = FALSE,
                initialized_at = TIMESTAMPTZ '2002-01-01 00:00:00+00',
                last_checked_at = TIMESTAMPTZ '2002-01-02 00:00:00+00',
                updated_at = TIMESTAMPTZ '2002-01-03 00:00:00+00'
            WHERE singleton_id = 1;
            UPDATE tv_tracker_final_notification_settings
            SET movie_released = FALSE,
                movie_release_updates = FALSE,
                updated_at = TIMESTAMPTZ '2003-01-01 00:00:00+00'
            WHERE singleton_id = 1;
            """
        )
        self.execute(
            "UPDATE tv_tracker_schema_meta SET schema_version = %s, "
            "updated_at = TIMESTAMPTZ '2004-01-01 00:00:00+00' "
            "WHERE singleton_id = 1",
            (schema_version,),
        )
        for seed_name in missing:
            self.execute(
                f"DELETE FROM {seed_tables[seed_name]} WHERE singleton_id = 1"
            )

        rows_before = self.singleton_seed_rows()
        for seed_name in seed_tables:
            if seed_name in missing:
                self.assertIsNone(rows_before[seed_name])
            else:
                self.assertIsNotNone(rows_before[seed_name])

        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [migration.migration_id for migration in MIGRATIONS],
        )
        rows_after = self.singleton_seed_rows()

        for seed_name in set(seed_tables) - missing:
            self.assertEqual(rows_after[seed_name], rows_before[seed_name])
        if "meta" in missing:
            self.assertEqual(rows_after["meta"][:2], (1, 0))
        if "notification_settings" in missing:
            self.assertEqual(
                rows_after["notification_settings"][:7],
                (1, True, "", "automatic", True, None, None),
            )
        if "final_settings" in missing:
            self.assertEqual(rows_after["final_settings"][:3], (1, True, True))

        self.assertEqual(
            self.fetchone(
                "SELECT data->>'title' FROM tv_tracker_shows "
                "WHERE show_id = 'seed-repair-show'"
            ),
            ("Preserved During Seed Repair",),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version FROM tv_tracker_schema_meta "
                "WHERE singleton_id = 1"
            ),
            (DATABASE_SCHEMA_VERSION,),
        )
        self.assertEqual(
            self.fetchone("SELECT COUNT(*) FROM tv_tracker_migrations"),
            (len(MIGRATIONS),),
        )

        state_after_adoption = self.adoption_seed_state()
        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])
        self.assertEqual(self.adoption_seed_state(), state_after_adoption)

    def test_v4_adoption_repairs_missing_meta_singleton_seed(self):
        self.assert_adoption_repairs_singleton_seeds(
            missing={"meta"},
            schema_version=4,
        )

    def test_v5_adoption_repairs_missing_notification_settings_seed(self):
        self.assert_adoption_repairs_singleton_seeds(
            missing={"notification_settings"},
            schema_version=5,
        )

    def test_v4_adoption_repairs_missing_final_settings_seed(self):
        self.assert_adoption_repairs_singleton_seeds(
            missing={"final_settings"},
            schema_version=4,
        )

    def test_v5_adoption_repairs_all_singleton_seeds(self):
        self.assert_adoption_repairs_singleton_seeds(
            missing={"meta", "notification_settings", "final_settings"},
            schema_version=5,
        )

    def test_fresh_apply_creates_current_schema(self):
        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [migration.migration_id for migration in MIGRATIONS],
        )

        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = current_schema()"
                )
                tables = {str(row[0]) for row in cursor.fetchall()}
                cursor.execute(
                    "SELECT migration_id, checksum FROM tv_tracker_migrations "
                    "ORDER BY migration_id"
                )
                ledger = cursor.fetchall()
                cursor.execute(
                    "SELECT schema_version FROM tv_tracker_schema_meta "
                    "WHERE singleton_id = 1"
                )
                schema_version = cursor.fetchone()
                cursor.execute("SELECT COUNT(*) FROM tv_tracker_admin")
                admin_count = cursor.fetchone()

        self.assertEqual(
            tables,
            {
                "tv_tracker_admin",
                "tv_tracker_changes",
                "tv_tracker_final_notification_settings",
                "tv_tracker_history",
                "tv_tracker_meta",
                "tv_tracker_migrations",
                "tv_tracker_movie_notification_baseline",
                "tv_tracker_notification_baseline",
                "tv_tracker_notification_events",
                "tv_tracker_notification_settings",
                "tv_tracker_notifications",
                "tv_tracker_push_deliveries",
                "tv_tracker_push_presence",
                "tv_tracker_push_subscriptions",
                "tv_tracker_schema_meta",
                "tv_tracker_security_events",
                "tv_tracker_shows",
                "tv_tracker_state",
            },
        )
        self.assertEqual(
            ledger,
            [
                (migration.migration_id, migration.checksum)
                for migration in MIGRATIONS
            ],
        )
        self.assertEqual(schema_version, (DATABASE_SCHEMA_VERSION,))
        self.assertEqual(admin_count, (0,))

    def test_repeat_apply_is_a_noop_and_preserves_data(self):
        run_migrations(self.connection_factory, MIGRATIONS)
        self.execute(
            """
            INSERT INTO tv_tracker_shows (show_id, data)
            VALUES ('preserved-show', '{"title":"Preserved"}'::jsonb);
            UPDATE tv_tracker_notification_settings
            SET enabled = FALSE, timezone = 'Pacific/Auckland'
            WHERE singleton_id = 1;
            INSERT INTO tv_tracker_push_subscriptions
            (device_id, endpoint, p256dh, auth, session_version)
            VALUES ('preserved-device', 'https://push.test/preserved', 'key', 'auth', 7);
            """
        )

        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])
        self.assertEqual(
            self.fetchone(
                "SELECT data->>'title' FROM tv_tracker_shows "
                "WHERE show_id = 'preserved-show'"
            ),
            ("Preserved",),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT enabled, timezone FROM tv_tracker_notification_settings "
                "WHERE singleton_id = 1"
            ),
            (False, "Pacific/Auckland"),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT endpoint, session_version FROM tv_tracker_push_subscriptions "
                "WHERE device_id = 'preserved-device'"
            ),
            ("https://push.test/preserved", 7),
        )

    def test_schema_version_five_empty_ledger_is_adopted_without_data_loss(self):
        self.execute(
            """
            CREATE TABLE tv_tracker_shows (
                show_id TEXT PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_shows (show_id, data)
            VALUES (
                'existing-show',
                '{"title":"Existing Show","status":"watching"}'::jsonb
            );

            CREATE TABLE tv_tracker_history (
                entry_id TEXT PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE tv_tracker_state (
                state_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_state (state_key, data)
            VALUES ('profile', '{"username":"Existing Owner"}'::jsonb);

            CREATE TABLE tv_tracker_meta (
                singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                revision BIGINT NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_meta (singleton_id, revision)
            VALUES (1, 41);

            CREATE TABLE tv_tracker_changes (
                revision BIGINT PRIMARY KEY,
                operation_id TEXT NOT NULL UNIQUE,
                delta JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE tv_tracker_admin (
                singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                session_version BIGINT NOT NULL DEFAULT 1,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_admin
            (singleton_id, username, password_hash, session_version)
            VALUES (1, 'existing-admin', 'existing-hash', 9);

            CREATE TABLE tv_tracker_security_events (
                event_id BIGSERIAL PRIMARY KEY,
                event_type TEXT NOT NULL,
                client_key TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE tv_tracker_schema_meta (
                singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                schema_version INTEGER NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_schema_meta
            (singleton_id, schema_version, updated_at)
            VALUES (1, 5, TIMESTAMPTZ '2026-08-01 00:00:00+00');

            CREATE TABLE tv_tracker_notification_settings (
                singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                timezone TEXT NOT NULL DEFAULT '',
                timezone_mode TEXT NOT NULL DEFAULT 'automatic',
                new_season BOOLEAN NOT NULL DEFAULT TRUE,
                season_premiere_tomorrow BOOLEAN NOT NULL DEFAULT TRUE,
                new_episode BOOLEAN NOT NULL DEFAULT TRUE,
                returns_tomorrow BOOLEAN NOT NULL DEFAULT TRUE,
                canceled_ended BOOLEAN NOT NULL DEFAULT TRUE,
                premiere_date_updates BOOLEAN NOT NULL DEFAULT TRUE,
                initialized_at TIMESTAMPTZ,
                last_checked_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_notification_settings
            (singleton_id, enabled, timezone, timezone_mode, new_episode)
            VALUES (1, FALSE, 'Europe/London', 'manual', FALSE);

            CREATE TABLE tv_tracker_notification_baseline (
                show_id TEXT PRIMARY KEY,
                snapshot JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE tv_tracker_notification_events (
                event_key TEXT PRIMARY KEY,
                show_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE tv_tracker_notifications (
                notification_id BIGSERIAL PRIMARY KEY,
                group_key TEXT NOT NULL UNIQUE,
                event_key TEXT NOT NULL,
                notification_type TEXT NOT NULL,
                show_id TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                image_path TEXT NOT NULL DEFAULT '',
                event_date DATE,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                media_type TEXT NOT NULL DEFAULT 'tv'
            );
            INSERT INTO tv_tracker_notifications
            (notification_id, group_key, event_key, notification_type, show_id,
             title, message, payload, media_type)
            VALUES (
                23,
                'existing-group',
                'existing-event',
                'movie_released',
                '77',
                'Existing notice',
                'Preserve this notification',
                '{"movieId":"77","source":"existing-main"}'::jsonb,
                'movie'
            );

            CREATE TABLE tv_tracker_final_notification_settings (
                singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                movie_released BOOLEAN NOT NULL DEFAULT TRUE,
                movie_release_updates BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_final_notification_settings
            (singleton_id, movie_released, movie_release_updates)
            VALUES (1, FALSE, TRUE);

            CREATE TABLE tv_tracker_movie_notification_baseline (
                movie_id TEXT PRIMARY KEY,
                region TEXT NOT NULL,
                snapshot JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_movie_notification_baseline
            (movie_id, region, snapshot)
            VALUES (
                '77',
                'GB',
                '{"releaseDate":"2026-08-20","type":4}'::jsonb
            );

            CREATE TABLE tv_tracker_push_subscriptions (
                subscription_id BIGSERIAL PRIMARY KEY,
                device_id TEXT NOT NULL,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                user_agent TEXT NOT NULL DEFAULT '',
                session_version BIGINT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_success_at TIMESTAMPTZ,
                failure_count INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO tv_tracker_push_subscriptions
            (subscription_id, device_id, endpoint, p256dh, auth, user_agent,
             session_version, failure_count)
            VALUES (
                17,
                'existing-device',
                'https://push.test/existing',
                'existing-key',
                'existing-auth',
                'Existing Browser',
                9,
                2
            );

            CREATE TABLE tv_tracker_push_presence (
                device_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                visible BOOLEAN NOT NULL DEFAULT FALSE,
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (device_id, client_id)
            );
            INSERT INTO tv_tracker_push_presence
            (device_id, client_id, visible)
            VALUES ('existing-device', 'existing-client', TRUE);

            CREATE TABLE tv_tracker_push_deliveries (
                delivery_key TEXT PRIMARY KEY,
                subscription_id BIGINT NOT NULL REFERENCES tv_tracker_push_subscriptions(subscription_id) ON DELETE CASCADE,
                notification_id BIGINT,
                payload JSONB NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_error TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO tv_tracker_push_deliveries
            (delivery_key, subscription_id, notification_id, payload, status,
             attempts, last_error)
            VALUES (
                'existing-delivery',
                17,
                23,
                '{"title":"Existing queued push"}'::jsonb,
                'retry',
                2,
                'temporary failure'
            );

            CREATE INDEX tv_tracker_changes_created_at_idx
            ON tv_tracker_changes (created_at);
            CREATE INDEX tv_tracker_security_events_lookup_idx
            ON tv_tracker_security_events (event_type, client_key, created_at);
            CREATE INDEX tv_tracker_notifications_created_at_idx
            ON tv_tracker_notifications (created_at DESC);
            CREATE INDEX tv_tracker_notifications_unread_idx
            ON tv_tracker_notifications (is_read, created_at DESC);
            CREATE INDEX tv_tracker_notification_events_observed_idx
            ON tv_tracker_notification_events (observed_at);
            CREATE UNIQUE INDEX tv_tracker_push_subscriptions_device_idx
            ON tv_tracker_push_subscriptions (device_id);
            CREATE INDEX tv_tracker_push_presence_active_idx
            ON tv_tracker_push_presence (device_id, visible, last_seen_at);
            CREATE INDEX tv_tracker_push_deliveries_pending_idx
            ON tv_tracker_push_deliveries (status, next_attempt_at);
            CREATE INDEX tv_tracker_push_deliveries_notification_idx
            ON tv_tracker_push_deliveries (notification_id);
            """
        )

        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, to_regclass('tv_tracker_migrations') "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (5, None),
        )
        preserved_queries = {
            "shows": "SELECT * FROM tv_tracker_shows WHERE show_id = 'existing-show'",
            "state": "SELECT * FROM tv_tracker_state WHERE state_key = 'profile'",
            "meta": "SELECT * FROM tv_tracker_meta WHERE singleton_id = 1",
            "admin": "SELECT * FROM tv_tracker_admin WHERE singleton_id = 1",
            "schema_meta": "SELECT * FROM tv_tracker_schema_meta WHERE singleton_id = 1",
            "notification_settings": (
                "SELECT * FROM tv_tracker_notification_settings WHERE singleton_id = 1"
            ),
            "notifications": (
                "SELECT * FROM tv_tracker_notifications WHERE notification_id = 23"
            ),
            "final_settings": (
                "SELECT * FROM tv_tracker_final_notification_settings WHERE singleton_id = 1"
            ),
            "movie_baseline": (
                "SELECT * FROM tv_tracker_movie_notification_baseline WHERE movie_id = '77'"
            ),
            "push_subscriptions": (
                "SELECT * FROM tv_tracker_push_subscriptions WHERE subscription_id = 17"
            ),
            "push_presence": (
                "SELECT * FROM tv_tracker_push_presence "
                "WHERE device_id = 'existing-device' AND client_id = 'existing-client'"
            ),
            "push_deliveries": (
                "SELECT * FROM tv_tracker_push_deliveries "
                "WHERE delivery_key = 'existing-delivery'"
            ),
        }
        rows_before_adoption = {
            name: self.fetchone(query)
            for name, query in preserved_queries.items()
        }

        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [migration.migration_id for migration in MIGRATIONS],
        )

        rows_after_adoption = {
            name: self.fetchone(query)
            for name, query in preserved_queries.items()
        }
        self.assertEqual(rows_after_adoption, rows_before_adoption)
        self.assertEqual(
            self.fetchone(
                "SELECT COUNT(*), COUNT(DISTINCT migration_id) "
                "FROM tv_tracker_migrations"
            ),
            (len(MIGRATIONS), len(MIGRATIONS)),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version FROM tv_tracker_schema_meta "
                "WHERE singleton_id = 1"
            ),
            (DATABASE_SCHEMA_VERSION,),
        )
        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])

    def test_schema_version_four_current_schema_is_certified_and_adopted(self):
        self.apply_unledgered_current_schema()
        self.execute(
            """
            INSERT INTO tv_tracker_shows (show_id, data)
            VALUES ('behind-version-show', '{"title":"Preserved Behind Version"}'::jsonb);
            UPDATE tv_tracker_schema_meta
            SET schema_version = 4,
                updated_at = TIMESTAMPTZ '2026-08-01 00:00:00+00'
            WHERE singleton_id = 1;
            """
        )

        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [migration.migration_id for migration in MIGRATIONS],
        )
        self.assertEqual(
            self.fetchone(
                "SELECT data->>'title' FROM tv_tracker_shows "
                "WHERE show_id = 'behind-version-show'"
            ),
            ("Preserved Behind Version",),
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

    def test_unknown_version_one_is_not_adopted_even_when_schema_is_current(self):
        self.apply_unledgered_current_schema()
        self.execute(
            "UPDATE tv_tracker_schema_meta SET schema_version = 1 "
            "WHERE singleton_id = 1"
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "unsupported unledgered database schema version 1",
        ):
            run_migrations(self.connection_factory, MIGRATIONS)
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, to_regclass('tv_tracker_migrations') "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (1, None),
        )

    def test_malformed_behind_schema_is_not_adopted_or_stamped(self):
        self.apply_unledgered_current_schema()
        self.execute(
            """
            UPDATE tv_tracker_schema_meta
            SET schema_version = 4
            WHERE singleton_id = 1;
            ALTER TABLE tv_tracker_notifications
            ALTER COLUMN media_type DROP NOT NULL;
            ALTER TABLE tv_tracker_push_deliveries
            ALTER COLUMN status SET DEFAULT 'queued';
            ALTER TABLE tv_tracker_push_deliveries
            DROP CONSTRAINT tv_tracker_push_deliveries_subscription_id_fkey;
            DROP INDEX tv_tracker_notifications_unread_idx;
            CREATE INDEX tv_tracker_notifications_unread_idx
            ON tv_tracker_notifications (created_at, is_read);
            """
        )

        with self.assertRaisesRegex(
            RuntimeError,
            r"(?s)(?=.*column .*media_type)(?=.*column .*status)"
            r"(?=.*constraint)(?=.*index)",
        ):
            run_migrations(self.connection_factory, MIGRATIONS)

        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, to_regclass('tv_tracker_migrations') "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (4, None),
        )

    def test_nulls_not_distinct_index_is_not_certified(self):
        server_version = int(self.fetchone("SHOW server_version_num")[0])
        if server_version < 150000:
            self.skipTest("NULLS NOT DISTINCT syntax requires PostgreSQL 15+")

        self.apply_unledgered_current_schema()
        self.execute(
            """
            DROP INDEX tv_tracker_push_subscriptions_device_idx;
            CREATE UNIQUE INDEX tv_tracker_push_subscriptions_device_idx
            ON tv_tracker_push_subscriptions (device_id) NULLS NOT DISTINCT;
            """
        )

        with self.assertRaisesRegex(
            RuntimeError,
            r"index tv_tracker_push_subscriptions_device_idx differs",
        ):
            run_migrations(self.connection_factory, MIGRATIONS)
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, to_regclass('tv_tracker_migrations') "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (DATABASE_SCHEMA_VERSION, None),
        )

    def test_complete_ledger_repairs_missing_and_behind_schema_version(self):
        run_migrations(self.connection_factory, MIGRATIONS)
        self.execute("DROP TABLE tv_tracker_schema_meta")

        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])
        repaired = self.fetchone(
            "SELECT schema_version, updated_at FROM tv_tracker_schema_meta "
            "WHERE singleton_id = 1"
        )
        self.assertIsNotNone(repaired)
        self.assertEqual(repaired[0], DATABASE_SCHEMA_VERSION)

        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, updated_at FROM tv_tracker_schema_meta "
                "WHERE singleton_id = 1"
            ),
            repaired,
        )

        self.execute(
            "UPDATE tv_tracker_schema_meta "
            "SET schema_version = %s, updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00' "
            "WHERE singleton_id = 1",
            (DATABASE_SCHEMA_VERSION - 1,),
        )
        self.assertEqual(run_migrations(self.connection_factory, MIGRATIONS), [])
        self.assertEqual(
            self.fetchone(
                "SELECT schema_version, updated_at > TIMESTAMPTZ "
                "'2000-01-01 00:00:00+00' "
                "FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ),
            (DATABASE_SCHEMA_VERSION, True),
        )
        self.assertEqual(
            self.fetchone(
                "SELECT COUNT(*) FROM tv_tracker_migrations"
            ),
            (len(MIGRATIONS),),
        )

    def test_known_partial_ledger_applies_remaining_prefix(self):
        prefix_length = 2
        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS[:prefix_length]),
            [migration.migration_id for migration in MIGRATIONS[:prefix_length]],
        )

        self.assertEqual(
            run_migrations(self.connection_factory, MIGRATIONS),
            [migration.migration_id for migration in MIGRATIONS[prefix_length:]],
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

    def test_checksum_and_unknown_applied_migrations_fail_closed(self):
        run_migrations(self.connection_factory, MIGRATIONS)
        self.execute(
            "UPDATE tv_tracker_migrations SET checksum = 'rewritten' "
            "WHERE migration_id = %s",
            (MIGRATIONS[0].migration_id,),
        )
        with self.assertRaisesRegex(RuntimeError, "checksum changed"):
            run_migrations(self.connection_factory, MIGRATIONS)

        self.execute(
            "UPDATE tv_tracker_migrations SET checksum = %s WHERE migration_id = %s",
            (MIGRATIONS[0].checksum, MIGRATIONS[0].migration_id),
        )
        self.execute(
            "INSERT INTO tv_tracker_migrations (migration_id, checksum) "
            "VALUES ('9999_future', 'future')"
        )
        with self.assertRaisesRegex(RuntimeError, "unknown applied migrations"):
            run_migrations(self.connection_factory, MIGRATIONS)

    def test_database_ahead_fails_before_ledger_creation(self):
        self.execute(
            """
            CREATE TABLE tv_tracker_schema_meta (
                singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                schema_version INTEGER NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        self.execute(
            "INSERT INTO tv_tracker_schema_meta (singleton_id, schema_version) "
            "VALUES (1, %s)",
            (DATABASE_SCHEMA_VERSION + 1,),
        )

        with self.assertRaisesRegex(RuntimeError, "newer than this application"):
            run_migrations(self.connection_factory, MIGRATIONS)
        self.assertEqual(
            self.fetchone("SELECT to_regclass('tv_tracker_migrations')"),
            (None,),
        )

    def test_failing_migration_rolls_back_the_entire_batch(self):
        migrations = (
            SqlMigration(
                "0001_probe",
                "CREATE TABLE phase13_rollback_probe (value INTEGER);",
            ),
            SqlMigration(
                "0002_fail",
                "INSERT INTO phase13_rollback_probe VALUES (1); SELECT 1 / 0;",
            ),
        )
        with self.assertRaises(psycopg.Error):
            run_migrations(self.connection_factory, migrations)

        self.assertEqual(
            self.fetchone(
                "SELECT to_regclass('tv_tracker_migrations'), "
                "to_regclass('phase13_rollback_probe')"
            ),
            (None, None),
        )

    def test_two_processes_apply_the_registry_once(self):
        worker = textwrap.dedent(
            """
            import json
            import os
            import time

            import psycopg
            from psycopg import sql

            from tvtracker.migrations import MIGRATIONS, run_migrations

            database_url = os.environ["TEST_DATABASE_URL"]
            schema_name = os.environ["PHASE13_TEST_SCHEMA"]

            def connection_factory():
                connection = psycopg.connect(database_url, connect_timeout=10)
                with connection.cursor() as cursor:
                    cursor.execute(
                        sql.SQL("SET search_path TO {}").format(
                            sql.Identifier(schema_name)
                        )
                    )
                return connection

            delay = float(os.environ["PHASE13_START_AT"]) - time.time()
            if delay > 0:
                time.sleep(delay)
            print(json.dumps(run_migrations(connection_factory, MIGRATIONS)))
            """
        )
        environment = os.environ.copy()
        environment["TEST_DATABASE_URL"] = TEST_DATABASE_URL
        environment["PHASE13_TEST_SCHEMA"] = self.schema
        environment["PHASE13_START_AT"] = str(time.time() + 2.0)
        environment["PYTHONPATH"] = os.pathsep.join(
            item
            for item in (str(ROOT), environment.get("PYTHONPATH", ""))
            if item
        )
        processes = [
            subprocess.Popen(
                [sys.executable, "-c", worker],
                cwd=ROOT,
                env=environment,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            for _index in range(2)
        ]
        outputs: list[tuple[str, str]] = []
        try:
            for process in processes:
                outputs.append(process.communicate(timeout=30))
        finally:
            for process in processes:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)

        results: list[list[str]] = []
        for process, (stdout, stderr) in zip(processes, outputs):
            self.assertEqual(
                process.returncode,
                0,
                msg=f"Migration subprocess failed:\n{stdout}\n{stderr}",
            )
            results.append(json.loads(stdout.strip().splitlines()[-1]))

        self.assertEqual(
            sorted(len(result) for result in results),
            [0, len(MIGRATIONS)],
        )
        self.assertEqual(
            self.fetchone(
                "SELECT COUNT(*), COUNT(DISTINCT migration_id) "
                "FROM tv_tracker_migrations"
            ),
            (len(MIGRATIONS), len(MIGRATIONS)),
        )


class Phase13ArchitectureFoundationTests(unittest.TestCase):
    def test_backend_package_homes_are_importable(self):
        expected_modules = {
            "tvtracker.application": "tvtracker/application.py",
            "tvtracker.auth": "tvtracker/auth/__init__.py",
            "tvtracker.backup": "tvtracker/backup/__init__.py",
            "tvtracker.database": "tvtracker/database/__init__.py",
            "tvtracker.media": "tvtracker/media/__init__.py",
            "tvtracker.migrations": "tvtracker/migrations/__init__.py",
            "tvtracker.sync": "tvtracker/sync/__init__.py",
            "tvtracker.tracker": "tvtracker/tracker/__init__.py",
            "tvtracker.web": "tvtracker/web/__init__.py",
        }
        for module_name, relative_path in expected_modules.items():
            with self.subTest(module=module_name):
                module = importlib.import_module(module_name)
                self.assertEqual(Path(module.__file__).resolve(), (ROOT / relative_path).resolve())

    def test_browser_native_foundation_behavior(self):
        node = shutil.which("node")
        if node is None:
            self.fail("Node.js is required to execute the browser-core contract test")

        foundation = ROOT / "static/js/core/foundation.js"
        script = textwrap.dedent(
            r"""
            "use strict";
            const assert = require("node:assert/strict");
            const fs = require("node:fs");
            const vm = require("node:vm");

            const sourcePath = process.argv[1];
            const source = fs.readFileSync(sourcePath,"utf8");
            const calls = [];
            const reports = [];
            const logs = [];
            const responses = [];
            let renderAttempts = 0;

            const context = {
                URL,
                Headers,
                Error,
                TypeError,
                location:{href:"https://tracker.test/app/settings",origin:"https://tracker.test"},
                document:{
                    querySelector(selector){
                        return selector === 'meta[name="csrf-token"]'
                            ? {content:"phase13-csrf"}
                            : null;
                    },
                    createElement(){
                        renderAttempts += 1;
                        throw new Error("The core must not render UI");
                    }
                },
                console:{error(...args){ logs.push(args); }},
                TVTrackerFeedback:{
                    reportError(error,message,options){
                        reports.push({error,message,options});
                        return "feedback-id";
                    }
                },
                async fetch(path,init){
                    calls.push({path,init});
                    const response = responses.shift();
                    if(response instanceof Error){ throw response; }
                    return response;
                }
            };
            context.window = context;
            vm.createContext(context);

            function jsonResponse(payload,status=200){
                return new Response(JSON.stringify(payload),{
                    status,
                    headers:{"content-type":"application/json; charset=utf-8"}
                });
            }

            (async()=>{
                vm.runInContext(source,context,{filename:sourcePath});
                const core = context.TVTrackerCore;
                assert.ok(core);
                assert.equal(core.version,"phase13-v1");
                assert.ok(Object.isFrozen(core));
                assert.ok(Object.isFrozen(core.api));
                assert.ok(Object.isFrozen(core.errors));
                assert.ok(Object.isFrozen(core.errors.Classification));
                assert.ok(Object.isFrozen(core.feedback));

                const descriptor = Object.getOwnPropertyDescriptor(context,"TVTrackerCore");
                assert.equal(descriptor.writable,false);
                assert.equal(descriptor.configurable,false);
                assert.equal(descriptor.enumerable,false);

                vm.runInContext(source,context,{filename:sourcePath});
                assert.equal(context.TVTrackerCore,core,"install must be idempotent");

                const kinds = core.errors.Classification;
                const actionable = core.errors.classify({status:409,code:"CONFLICT"});
                assert.equal(actionable.classification,kinds.USER_ACTIONABLE);
                assert.equal(actionable.code,"CONFLICT");
                assert.equal(actionable.retryable,true);
                assert.ok(Object.isFrozen(actionable));
                assert.equal(
                    core.errors.classify({status:400,code:"BAD_INPUT"}).classification,
                    kinds.USER_ACTIONABLE
                );
                assert.equal(
                    core.errors.classify({status:404}).classification,
                    kinds.USER_ACTIONABLE
                );
                assert.equal(
                    core.errors.classify({status:422}).classification,
                    kinds.VALIDATION
                );
                assert.equal(
                    core.errors.classify({status:401}).classification,
                    kinds.AUTHORIZATION_SESSION
                );
                assert.equal(
                    core.errors.classify({status:403}).classification,
                    kinds.AUTHORIZATION_SESSION
                );
                assert.equal(
                    core.errors.classify({status:401,code:"session_expired"}).classification,
                    kinds.SECURITY_SENSITIVE
                );
                assert.equal(
                    core.errors.classify({status:403,code:"csrf"}).classification,
                    kinds.SECURITY_SENSITIVE
                );
                assert.equal(
                    core.errors.classify(new Error("Failed to fetch")).classification,
                    kinds.OFFLINE_NETWORK
                );
                assert.equal(
                    core.errors.classify({status:503}).classification,
                    kinds.OPTIONAL_PROVIDER_FAILURE
                );
                assert.equal(
                    core.errors.classify({code:"provider_malformed"}).classification,
                    kinds.OPTIONAL_PROVIDER_FAILURE
                );
                assert.equal(
                    core.errors.classify({status:500}).classification,
                    kinds.SERVER_INTERNAL
                );
                const rateLimited = core.errors.classify({status:429});
                assert.equal(rateLimited.classification,kinds.SERVER_INTERNAL);
                assert.equal(rateLimited.retryable,true);
                assert.equal(
                    core.errors.classify(new Error("unexpected")).classification,
                    kinds.SERVER_INTERNAL
                );
                assert.equal(core.errors.classify({status:null}).status,null);

                responses.push(jsonResponse({saved:true}));
                const saved = await core.api.post(
                    "/api/shows",
                    {id:42},
                    {credentials:"include"}
                );
                assert.equal(saved.saved,true);
                assert.equal(calls[0].path,"/api/shows");
                assert.equal(calls[0].init.method,"POST");
                assert.equal(calls[0].init.credentials,"same-origin");
                assert.equal(calls[0].init.headers.get("Accept"),"application/json");
                assert.equal(calls[0].init.headers.get("Content-Type"),"application/json");
                assert.equal(calls[0].init.headers.get("X-CSRF-Token"),"phase13-csrf");
                assert.equal(calls[0].init.body,JSON.stringify({id:42}));

                responses.push(jsonResponse({shows:[]}));
                await core.api.get("/api/shows");
                assert.equal(calls[1].init.method,"GET");
                assert.equal(calls[1].init.headers.has("X-CSRF-Token"),false);

                await assert.rejects(
                    core.api.get("https://outside.test/api/shows"),
                    /same-origin absolute paths/
                );
                await assert.rejects(
                    core.api.get("//outside.test/api/shows"),
                    /same-origin absolute paths/
                );
                assert.equal(calls.length,2,"cross-origin paths must never reach fetch");

                responses.push(jsonResponse({code:"INVALID_STATE"},422));
                let requestError;
                try{
                    await core.api.patch("/api/shows/42",{status:"bad"});
                }catch(error){
                    requestError = error;
                }
                assert.ok(requestError instanceof core.errors.ApiRequestError);
                assert.equal(requestError.status,422);
                assert.equal(requestError.code,"INVALID_STATE");
                assert.equal(requestError.classified.classification,kinds.VALIDATION);

                context.fetch = async()=>{ throw new Error("Failed to fetch"); };
                let networkError;
                try{
                    await core.api.get("/api/offline");
                }catch(error){
                    networkError = error;
                }
                assert.equal(
                    networkError.classified.classification,
                    kinds.OFFLINE_NETWORK
                );

                const feedbackId = core.feedback.presentError(
                    {status:400,code:"BAD_INPUT"},
                    {userMessage:"Fix the highlighted fields.",context:"settings save"}
                );
                assert.equal(feedbackId,"feedback-id");
                assert.equal(reports.length,1);
                assert.equal(reports[0].message,"Fix the highlighted fields.");
                assert.equal(reports[0].options.context,"settings save");

                core.feedback.presentError({status:503},{background:true});
                assert.equal(reports.length,1,"recoverable background failures stay silent");

                context.TVTrackerFeedback = null;
                core.feedback.presentError(new Error("unexpected"));
                assert.equal(logs.length,1,"missing feedback surface falls back to console only");
                assert.equal(renderAttempts,0,"the foundation must never create a second UI");
            })().catch(error=>{
                console.error(error);
                process.exitCode = 1;
            });
            """
        )
        completed = subprocess.run(
            [node, "-e", script, str(foundation)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            0,
            msg=f"Browser-core contract failed:\n{completed.stdout}\n{completed.stderr}",
        )

    def test_browser_core_is_the_only_frontend_foundation(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(
            package["scripts"],
            {
                "css:build": "tailwindcss -i ./static/css/tailwind-input.css -o ./static/css/tailwind.css --minify",
                "build:css": "npm run css:build",
                "css:watch": "tailwindcss -i ./static/css/tailwind-input.css -o ./static/css/tailwind.css --watch",
            },
        )

        forbidden_packages = {"vue", "vite", "typescript", "@vitejs/plugin-vue"}
        dependencies = set(package.get("dependencies", {}))
        dependencies.update(package.get("devDependencies", {}))
        self.assertTrue(dependencies.isdisjoint(forbidden_packages))

        lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
        locked_names = {
            path.rsplit("node_modules/", 1)[-1]
            for path in lock.get("packages", {})
            if "node_modules/" in path
        }
        self.assertTrue(locked_names.isdisjoint(forbidden_packages))
        self.assertFalse(any(name.startswith("@vue/") for name in locked_names))
        self.assertFalse(any(name.startswith("@typescript/") for name in locked_names))

        frontend = ROOT / "frontend"
        modern = ROOT / "static/modern"
        self.assertFalse(
            frontend.exists() and any(path.is_file() for path in frontend.rglob("*"))
        )
        self.assertFalse(
            modern.exists() and any(path.is_file() for path in modern.rglob("*"))
        )
        self.assertTrue((ROOT / "static/js/core/foundation.js").is_file())

        parser = TemplateElements()
        parser.feed((ROOT / "templates/index.html").read_text(encoding="utf-8"))
        scripts = [attrs for tag, attrs in parser.elements if tag == "script"]
        core_source = "{{ url_for('static', filename='js/core/foundation.js') }}"
        feedback_source = "{{ url_for('static', filename='js/feedback.js') }}"
        core_scripts = [attrs for attrs in scripts if attrs.get("src") == core_source]
        self.assertEqual(len(core_scripts), 1)
        self.assertNotEqual(core_scripts[0].get("type"), "module")
        self.assertLess(
            next(index for index, attrs in enumerate(scripts) if attrs.get("src") == feedback_source),
            next(index for index, attrs in enumerate(scripts) if attrs.get("src") == core_source),
        )
        self.assertFalse(
            any(attrs.get("id") == "tv-modern-root" for _tag, attrs in parser.elements)
        )
        self.assertFalse(
            any("modern/" in str(attrs.get("src") or "") for attrs in scripts)
        )

    def test_ci_and_deploy_build_tailwind_and_run_migrations(self):
        ci_path = ROOT / ".github/workflows/ci.yml"
        deploy_path = ROOT / ".github/workflows/deploy.yml"
        attributes = (ROOT / ".gitattributes").read_text(encoding="utf-8")
        ci_commands = workflow_run_commands(ci_path)
        deploy_commands = workflow_run_commands(deploy_path)

        self.assertIn("static/css/tailwind-input.css text eol=lf", attributes)
        self.assertIn("static/css/tailwind.css text eol=lf", attributes)

        for workflow, path, commands in (
            ("CI", ci_path, ci_commands),
            ("deploy", deploy_path, deploy_commands),
        ):
            with self.subTest(workflow=workflow):
                source = path.read_text(encoding="utf-8")
                self.assertIn("image: postgres:16-alpine", source)
                self.assertIn(
                    "TEST_DATABASE_URL: postgresql://tvtracker_test:tvtracker_test@127.0.0.1:5432/tvtracker_test",
                    source,
                )
                self.assertEqual(commands.count("npm ci --audit=false"), 1)
                self.assertEqual(
                    commands.count("npm audit --audit-level=high"),
                    1,
                )
                self.assertEqual(commands.count("npm run build:css"), 1)
                self.assertEqual(
                    commands.count("git diff --exit-code -- static/css/tailwind.css"),
                    1,
                )
                self.assertLess(
                    commands.index("npm ci --audit=false"),
                    commands.index("npm run build:css"),
                )
                self.assertLess(
                    commands.index("npm run build:css"),
                    commands.index("git diff --exit-code -- static/css/tailwind.css"),
                )
                for command in commands:
                    self.assertNotRegex(
                        command,
                        r"(?:--prefix\s+frontend|frontend:|static/modern)",
                    )

        self.assertIn("python tests/run_all.py", ci_commands)
        migration_command = '"$PYTHON_BIN" -m tvtracker.migrations'
        restart_command = "curl --fail --silent --show-error \\"
        self.assertIn(migration_command, deploy_commands)
        self.assertIn(restart_command, deploy_commands)
        self.assertLess(
            deploy_commands.index(migration_command),
            deploy_commands.index(restart_command),
        )


if __name__ == "__main__":
    unittest.main()
