from __future__ import annotations

import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import uuid

import psycopg
from psycopg import sql

from tvtracker.migrations import DATABASE_SCHEMA_VERSION, MIGRATIONS, run_migrations
from tvtracker.migrations import __main__ as migration_cli
from tvtracker.migrations.registry_v7 import MIGRATIONS as V7_MIGRATIONS


ROOT = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()


class MigrationCLIContractTests(unittest.TestCase):
    def test_entrypoint_uses_current_registry_and_preserves_json_output(self):
        output = io.StringIO()
        with patch.object(migration_cli, "run_migrations", return_value=[MIGRATIONS[-1].migration_id]) as run:
            with contextlib.redirect_stdout(output):
                self.assertEqual(migration_cli.main(), 0)
        run.assert_called_once_with(migration_cli.connect_database, MIGRATIONS)
        self.assertEqual(json.loads(output.getvalue()), {
            "ok": True, "applied": [MIGRATIONS[-1].migration_id],
        })


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL is required for the real migration CLI")
class MigrationCLIPostgreSQLTests(unittest.TestCase):
    def setUp(self):
        self.schema = "phase4_cli_" + uuid.uuid4().hex
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            self.connection_parameters = connection.info.get_parameters()
            # get_parameters deliberately omits passwords.
            self.connection_parameters.update(psycopg.conninfo.conninfo_to_dict(TEST_DATABASE_URL))
            connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
            connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))

    def connection_factory(self):
        connection = psycopg.connect(TEST_DATABASE_URL, connect_timeout=10)
        connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
        return connection

    def run_cli(self):
        environment = os.environ.copy()
        for name, key, default in (
            ("DB_HOST", "host", "localhost"), ("DB_PORT", "port", "5432"),
            ("DB_NAME", "dbname", ""), ("DB_USER", "user", ""),
            ("DB_PASSWORD", "password", ""),
        ):
            environment[name] = self.connection_parameters.get(key, default)
        # Isolate the real subprocess without replacing its connection adapter
        # or migration runner. Production invokes this exact module command.
        environment["PGOPTIONS"] = "-c search_path=" + self.schema
        completed = subprocess.run(
            [sys.executable, "-m", "tvtracker.migrations"], cwd=ROOT,
            env=environment, text=True, capture_output=True, timeout=45,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads(completed.stdout)

    def test_real_cli_upgrades_v7_to_current_and_is_repeatable(self):
        run_migrations(self.connection_factory, V7_MIGRATIONS)
        with self.connection_factory() as connection:
            connection.execute(
                "INSERT INTO tv_tracker_shows (show_id, data) VALUES (%s, %s)",
                ("phase4-preserved", '{"title":"Preserve this show"}'),
            )
            before = connection.execute(
                "SELECT migration_id, checksum FROM tv_tracker_migrations ORDER BY migration_id"
            ).fetchall()
        expected = [migration.migration_id for migration in MIGRATIONS[len(V7_MIGRATIONS):]]
        self.assertEqual(self.run_cli(), {"ok": True, "applied": expected})
        self.assertEqual(self.run_cli(), {"ok": True, "applied": []})
        with self.connection_factory() as connection:
            self.assertEqual(connection.execute(
                "SELECT schema_version FROM tv_tracker_schema_meta WHERE singleton_id = 1"
            ).fetchone()[0], DATABASE_SCHEMA_VERSION)
            self.assertIsNotNone(connection.execute(
                "SELECT to_regclass('tv_tracker_account_tokens')"
            ).fetchone()[0])
            self.assertEqual(connection.execute(
                "SELECT data, user_id FROM tv_tracker_shows WHERE show_id = 'phase4-preserved'"
            ).fetchone(), ({"title": "Preserve this show"}, None))
            self.assertEqual(connection.execute(
                "SELECT migration_id, checksum FROM tv_tracker_migrations ORDER BY migration_id"
            ).fetchall()[:len(before)], before)

    def test_real_cli_initializes_fresh_database(self):
        self.assertEqual(self.run_cli(), {
            "ok": True, "applied": [migration.migration_id for migration in MIGRATIONS],
        })
        self.assertEqual(self.run_cli(), {"ok": True, "applied": []})


if __name__ == "__main__":
    unittest.main()
