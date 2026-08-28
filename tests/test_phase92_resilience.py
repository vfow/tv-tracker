from __future__ import annotations

import io
import json
import os
import secrets
import shutil
import subprocess
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from tools import postgres_restore_drill
from tvtracker import maintenance
from tvtracker.migrations import DATABASE_SCHEMA_VERSION, MIGRATIONS, run_migrations
from tvtracker.operations import collect_operational_baseline


ROOT = Path(__file__).resolve().parents[1]


class OperationalMaintenanceTests(unittest.TestCase):
    def test_operational_check_is_read_only_machine_readable(self):
        result = {
            "ok": True,
            "operation": "operational-check",
            "schemaVersion": DATABASE_SCHEMA_VERSION,
        }
        output = io.StringIO()
        with patch.object(
            maintenance,
            "collect_operational_baseline",
            return_value=result,
        ) as mocked_check, redirect_stdout(output):
            exit_code = maintenance.main(["operational-check"])

        self.assertEqual(exit_code, 0)
        mocked_check.assert_called_once_with(maintenance.connect_database)
        self.assertEqual(json.loads(output.getvalue()), result)

    def test_restore_drill_refuses_remote_database(self):
        with self.assertRaisesRegex(RuntimeError, "non-loopback"):
            postgres_restore_drill.parse_local_database_url(
                "postgresql://operator:secret@db.example.test/tvtracker"
            )

    def test_restore_tool_failure_does_not_echo_stderr(self):
        def failing_runner(command, **kwargs):
            return subprocess.CompletedProcess(
                command,
                1,
                stdout="",
                stderr="password=do-not-leak",
            )

        with self.assertRaises(RuntimeError) as raised:
            postgres_restore_drill._run_postgres_tool(
                ["/usr/bin/pg_dump"],
                environment={"PGPASSWORD": "do-not-leak"},
                runner=failing_runner,
            )

        self.assertNotIn("do-not-leak", str(raised.exception))
        self.assertNotIn("password", str(raised.exception).lower())


class Phase92PostgreSQLIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_url = os.environ.get("TEST_DATABASE_URL", "").strip()
        if not cls.base_url:
            raise unittest.SkipTest("TEST_DATABASE_URL is not configured")

        if not shutil.which("pg_dump") or not shutil.which("pg_restore"):
            raise AssertionError(
                "PostgreSQL CI must provide pg_dump and pg_restore for restore-drill coverage"
            )

        cls.config = postgres_restore_drill.parse_local_database_url(cls.base_url)

    def setUp(self):
        self.source_database = f"tvtracker_resilience_{secrets.token_hex(5)}"
        self.source_url = self._database_url(self.source_database)
        self._admin_execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(self.source_database))
        )

        source_factory = lambda: psycopg.connect(self.source_url)
        run_migrations(source_factory, MIGRATIONS)
        with source_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_state (state_key, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    ("restore_drill_marker", Jsonb({"ok": True})),
                )
            connection.commit()

    def tearDown(self):
        self._admin_execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                sql.Identifier(self.source_database)
            )
        )

    def _database_url(self, database_name: str) -> str:
        parsed = urlsplit(self.base_url)
        return urlunsplit(parsed._replace(path=f"/{database_name}", query="", fragment=""))

    def _admin_execute(self, statement) -> None:
        with psycopg.connect(
            host=self.config.host,
            port=self.config.port,
            dbname="postgres",
            user=self.config.user,
            password=self.config.password,
            connect_timeout=10,
            autocommit=True,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement)

    def test_operational_baseline_and_real_dump_restore_drill(self):
        source_factory = lambda: psycopg.connect(self.source_url)

        baseline = collect_operational_baseline(source_factory)
        rendered = json.dumps(baseline, sort_keys=True)

        self.assertTrue(baseline["ok"])
        self.assertEqual(baseline["operation"], "operational-check")
        self.assertEqual(baseline["schemaVersion"], DATABASE_SCHEMA_VERSION)
        self.assertEqual(baseline["migrationCount"], len(MIGRATIONS))
        self.assertGreater(baseline["databaseSizeBytes"], 0)
        self.assertGreater(baseline["maxConnections"], 0)
        self.assertTrue(
            any(row["table"] == "tv_tracker_state" for row in baseline["tables"])
        )
        if self.config.password:
            self.assertNotIn(self.config.password, rendered)
        self.assertNotIn(self.config.host, rendered)
        self.assertNotIn(self.config.user, rendered)

        drill = postgres_restore_drill.run_restore_drill(self.source_url)
        self.assertTrue(drill["ok"])
        self.assertEqual(drill["operation"], "postgres-restore-drill")
        self.assertTrue(drill["schemaVerified"])
        self.assertTrue(drill["rowCountsMatch"])
        self.assertGreater(drill["tableCount"], 0)


class Phase92SourceContracts(unittest.TestCase):
    def test_dependabot_has_deterministic_weekly_non_major_groups(self):
        source = (ROOT / ".github" / "dependabot.yml").read_text()
        self.assertEqual(source.count("timezone: Asia/Kuala_Lumpur"), 3)
        self.assertIn("python-non-major:", source)
        self.assertIn("npm-non-major:", source)
        self.assertIn("actions-non-major:", source)
        self.assertGreaterEqual(source.count('patterns: ["*"]'), 3)
        self.assertGreaterEqual(source.count('update-types: ["minor", "patch"]'), 3)

    def test_recovery_runbook_keeps_production_out_of_automated_restore_drill(self):
        source = (ROOT / "docs" / "RECOVERY.md").read_text()
        self.assertIn("loopback-only", source)
        self.assertIn("Never run the automated restore drill against production", source)
        self.assertIn("python -m tvtracker.maintenance operational-check", source)

    def test_restore_drill_cleans_only_its_disposable_target_before_restore(self):
        source = (ROOT / "tools" / "postgres_restore_drill.py").read_text()
        restore_block = source[source.index("pg_restore,") : source.index("target_factory =")]
        self.assertIn('"--clean"', restore_block)
        self.assertIn('"--if-exists"', restore_block)
        self.assertIn('f"--dbname={target_database}"', restore_block)
        self.assertIn("str(dump_path)", restore_block)
        self.assertIn("parse_local_database_url(database_url)", source)
        self.assertIn("Restore drill refuses a non-loopback database host", source)


if __name__ == "__main__":
    unittest.main()
