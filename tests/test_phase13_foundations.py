from __future__ import annotations

import json
from pathlib import Path
import unittest

from tvtracker.migrations.runner import SqlMigration, run_migrations


ROOT = Path(__file__).resolve().parents[1]


class FakeCursor:
    def __init__(self) -> None:
        self.applied: dict[str, str] = {}
        self.executed_sql: list[str] = []
        self._rows: list[tuple[str, str]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=None):
        text = str(sql)
        self.executed_sql.append(text)
        if "SELECT migration_id, checksum FROM tv_tracker_migrations" in text:
            self._rows = sorted(self.applied.items())
        elif "INSERT INTO tv_tracker_migrations" in text:
            assert params is not None
            self.applied[str(params[0])] = str(params[1])

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


class Phase13MigrationFoundationTests(unittest.TestCase):
    def test_runner_applies_once_and_rejects_checksum_rewrites(self):
        cursor = FakeCursor()
        connection = FakeConnection(cursor)
        migration = SqlMigration("0001_example", "CREATE TABLE example (id INTEGER);")

        self.assertEqual(run_migrations(lambda: connection, [migration]), ["0001_example"])
        self.assertEqual(run_migrations(lambda: connection, [migration]), [])
        self.assertEqual(connection.commit_count, 2)
        self.assertEqual(
            sum("CREATE TABLE example" in sql for sql in cursor.executed_sql),
            1,
        )

        changed = SqlMigration("0001_example", "CREATE TABLE example (id BIGINT);")
        with self.assertRaises(RuntimeError):
            run_migrations(lambda: connection, [changed])

    def test_runner_validates_registry_order_and_ids(self):
        with self.assertRaises(ValueError):
            SqlMigration("bad-name", "SELECT 1;")
        with self.assertRaises(RuntimeError):
            run_migrations(
                lambda: FakeConnection(FakeCursor()),
                [
                    SqlMigration("0002_second", "SELECT 2;"),
                    SqlMigration("0001_first", "SELECT 1;"),
                ],
            )


class Phase13ArchitectureFoundationTests(unittest.TestCase):
    def test_backend_package_homes_exist(self):
        for relative in (
            "tvtracker/application.py",
            "tvtracker/auth/__init__.py",
            "tvtracker/backup/__init__.py",
            "tvtracker/database/__init__.py",
            "tvtracker/media/__init__.py",
            "tvtracker/migrations/__init__.py",
            "tvtracker/sync/__init__.py",
            "tvtracker/tracker/__init__.py",
            "tvtracker/web/__init__.py",
        ):
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_frontend_build_and_legacy_boundary_are_explicit(self):
        frontend_package = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
        self.assertEqual(frontend_package["dependencies"]["vue"], "3.5.40")
        self.assertIn("vite", frontend_package["devDependencies"])
        self.assertIn("typescript", frontend_package["devDependencies"])
        self.assertTrue((ROOT / "frontend/package-lock.json").is_file())

        template = (ROOT / "templates/index.html").read_text(encoding="utf-8")
        self.assertIn("data-tv-modern-root", template)
        self.assertIn("modern/tvtracker-modern.js", template)
        self.assertNotIn('class="app-toast" id="toast"', template)

        feedback = (ROOT / "frontend/src/core/feedback.ts").read_text(encoding="utf-8")
        self.assertIn("window.TVTrackerFeedback", feedback)
        self.assertNotIn("createElement", feedback)

        bundle = (ROOT / "static/modern/tvtracker-modern.js").read_text(encoding="utf-8")
        self.assertNotIn(
            "process.env.NODE_ENV",
            bundle,
            "Committed browser bundle must not depend on a Node process global",
        )

    def test_ci_and_deploy_enforce_generated_frontend_and_migrations(self):
        ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        deploy = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        self.assertIn("npm --prefix frontend ci", ci)
        self.assertIn("npm run frontend:build", ci)
        self.assertIn("git diff --exit-code -- static/modern", ci)
        self.assertIn("npm run frontend:build", deploy)
        self.assertIn('"$PYTHON_BIN" -m tvtracker.migrations', deploy)


if __name__ == "__main__":
    unittest.main()
