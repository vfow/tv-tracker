from __future__ import annotations

import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import MagicMock, patch

import psycopg
from flask import redirect, session
from werkzeug.serving import make_server


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"

os.environ.setdefault("SECRET_KEY", "phase12-test-secret")
os.environ.setdefault("DB_HOST", "phase12-db")
os.environ.setdefault("DB_NAME", "phase12-db")
os.environ.setdefault("DB_USER", "phase12-user")
os.environ.setdefault("DB_PASSWORD", "phase12-password")

# app.py creates its Flask application at import time. Keep the safety harness
# hermetic: importing the production module must never require a live database.
with patch("psycopg.connect") as mocked_connect:
    startup_connection = MagicMock()
    startup_cursor = MagicMock()
    mocked_connect.return_value.__enter__.return_value = startup_connection
    startup_connection.cursor.return_value.__enter__.return_value = startup_cursor
    startup_cursor.fetchone.return_value = (1,)
    import app as tracker


class BackupAndMigrationSafetyTests(unittest.TestCase):
    def load_fixture(self, name: str) -> dict:
        return json.loads((FIXTURES / name).read_text(encoding="utf-8"))

    def test_supported_v1_and_v2_backups_normalize_to_same_user_truth(self):
        v1_data, v1_summary = tracker.validate_and_normalize_backup(
            self.load_fixture("phase12_native_backup_v1.json")
        )
        v2_data, v2_summary = tracker.validate_and_normalize_backup(
            self.load_fixture("phase12_native_backup_v2.json")
        )

        self.assertEqual(v1_data, v2_data)
        for key in ("shows", "historyEntries", "favorites"):
            self.assertEqual(v1_summary[key], v2_summary[key])
        self.assertEqual(
            (v1_summary["backupVersion"], v1_summary["schemaVersion"]),
            (1, 4),
        )
        self.assertEqual(
            (v2_summary["backupVersion"], v2_summary["schemaVersion"]),
            (2, 5),
        )
        self.assertEqual(v2_data["shows"]["123"]["title"], "Fixture Show")
        self.assertEqual(v2_data["history"][0]["id"], "history-fixture-0001")

    def test_v1_backup_can_be_semantically_reemitted_as_current_backup(self):
        normalized, _summary = tracker.validate_and_normalize_backup(
            self.load_fixture("phase12_native_backup_v1.json")
        )
        current_backup = {
            "app": tracker.APP_NAME,
            "backupType": "native-app-backup",
            "backupVersion": tracker.BACKUP_VERSION,
            "schemaVersion": tracker.SCHEMA_VERSION,
            "data": normalized,
        }

        restored, restored_summary = tracker.validate_and_normalize_backup(current_backup)
        self.assertEqual(restored, normalized)
        self.assertEqual(restored_summary["shows"], 1)
        self.assertEqual(restored_summary["historyEntries"], 1)

    def test_future_backup_versions_fail_closed(self):
        future_version = self.load_fixture("phase12_native_backup_v2.json")
        future_version["backupVersion"] = tracker.BACKUP_VERSION + 100
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_and_normalize_backup(future_version)

        future_schema = self.load_fixture("phase12_native_backup_v2.json")
        future_schema["schemaVersion"] = tracker.SCHEMA_VERSION + 1
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_and_normalize_backup(future_schema)

    def test_schema_bootstrap_is_safe_to_run_across_restarts(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        cursor = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.fetchone.return_value = (1,)

        with patch.object(tracker, "database_connection", return_value=connection), patch.object(
            tracker, "bootstrap_admin_credentials", return_value=("", "")
        ):
            tracker.ensure_schema()
            tracker.ensure_schema()

        self.assertEqual(connection.commit.call_count, 2)
        sql = "\n".join(
            call.args[0]
            for call in cursor.execute.call_args_list
            if call.args and isinstance(call.args[0], str)
        )
        self.assertIn("CREATE TABLE IF NOT EXISTS tv_tracker_shows", sql)
        self.assertIn("ADD COLUMN IF NOT EXISTS timezone_mode", sql)
        self.assertIn("ON CONFLICT (singleton_id) DO NOTHING", sql)
        self.assertIn("tv_tracker_schema_meta", sql)


class MaliciousInputAndConcurrencySafetyTests(unittest.TestCase):
    def test_json_limits_fail_closed_without_large_allocations(self):
        with patch.object(tracker, "MAX_JSON_DEPTH", 2):
            with self.assertRaises(tracker.BackupValidationError):
                tracker.validate_json_value({"a": {"b": {"c": {}}}}, "payload")

        with patch.object(tracker, "MAX_JSON_STRING_CHARS", 8):
            with self.assertRaises(tracker.BackupValidationError):
                tracker.validate_json_value("x" * 9, "payload")

        with patch.object(tracker, "MAX_JSON_CONTAINER_ITEMS", 2):
            with self.assertRaises(tracker.BackupValidationError):
                tracker.validate_json_value([1, 2, 3], "payload")

    def test_untrusted_state_keys_cannot_become_storage_or_sql_names(self):
        with self.assertRaises(tracker.BackupValidationError):
            tracker.validate_sync_delta_payload(
                {"stateUpsert": {"profile; DROP TABLE tv_tracker_state": {}}}
            )

    def test_sync_conflict_matrix_detects_overlapping_entities_only(self):
        show_update = tracker.normalize_delta({"123": {"title": "A"}}, [], {}, [], None, {})
        other_show = tracker.normalize_delta({"456": {"title": "B"}}, [], {}, [], None, {})
        same_show_delete = tracker.normalize_delta({}, ["123"], {}, [], None, {})
        history_update = tracker.normalize_delta({}, [], {"history-a": {"id": "history-a"}}, [], None, {})
        history_delete = tracker.normalize_delta({}, [], {}, ["history-a"], None, {})
        profile_a = tracker.normalize_delta({}, [], {}, [], None, {"profile": {"username": "A"}})
        profile_b = tracker.normalize_delta({}, [], {}, [], None, {"profile": {"username": "B"}})

        self.assertFalse(tracker.deltas_conflict(show_update, other_show))
        self.assertTrue(tracker.deltas_conflict(show_update, same_show_delete))
        self.assertTrue(tracker.deltas_conflict(history_update, history_delete))
        self.assertTrue(tracker.deltas_conflict(profile_a, profile_b))


class EntrypointSafetyTests(unittest.TestCase):
    def test_wsgi_startup_exports_application_and_installs_each_boundary_once(self):
        calls: list[tuple] = []
        app_object = object()
        connection_factory = object()
        tmdb_fetcher = object()
        login_required = object()
        check_csrf = object()

        app_module = types.ModuleType("app")
        app_module.app = app_object
        app_module.check_csrf = check_csrf
        app_module.database_connection = connection_factory
        app_module.fetch_tmdb_notification_json = tmdb_fetcher
        app_module.login_required = login_required

        final_module = types.ModuleType("final_notifications")

        def install_final(app, **kwargs):
            calls.append(("final", app, kwargs))

        final_module.install_final_notifications = install_final

        final_runtime = types.ModuleType("final_notifications_runtime")
        final_runtime.prepare_final_notification_runtime = lambda factory: calls.append(
            ("runtime", factory)
        )

        polish_runtime = types.ModuleType("notification_polish_runtime")
        polish_runtime.install_notification_polish = lambda app, module: calls.append(
            ("polish", app, module)
        )

        static_runtime = types.ModuleType("static_asset_versioning")
        static_runtime.install_static_asset_versioning = lambda app: calls.append(("static", app))

        tvtracker_package = types.ModuleType("tvtracker")
        tvtracker_package.__path__ = []
        data_integrity = types.ModuleType("tvtracker.data_integrity")
        data_integrity.install_backup_summary_hardening = lambda app: calls.append(("backup", app))

        modules = {
            "app": app_module,
            "final_notifications": final_module,
            "final_notifications_runtime": final_runtime,
            "notification_polish_runtime": polish_runtime,
            "static_asset_versioning": static_runtime,
            "tvtracker": tvtracker_package,
            "tvtracker.data_integrity": data_integrity,
        }
        with patch.dict(sys.modules, modules):
            namespace = runpy.run_path(str(ROOT / "wsgi.py"), run_name="phase12_wsgi")

        self.assertIs(namespace["application"], app_object)
        self.assertEqual([item[0] for item in calls], ["runtime", "static", "backup", "polish", "final"])
        final_call = calls[-1]
        self.assertIs(final_call[1], app_object)
        self.assertIs(final_call[2]["login_required"], login_required)
        self.assertIs(final_call[2]["check_csrf"], check_csrf)
        self.assertIs(final_call[2]["connection_factory"], connection_factory)
        self.assertIs(final_call[2]["tmdb_fetcher"], tmdb_fetcher)

    def test_notification_worker_main_path_is_hermetic_and_machine_readable(self):
        calls: list[tuple] = []
        connection_factory = object()
        tmdb_fetcher = object()
        notification_check = object()
        result = {"ok": True, "notifications": 0, "push": "unavailable"}

        app_module = types.ModuleType("app")
        app_module.database_connection = connection_factory
        app_module.fetch_tmdb_notification_json = tmdb_fetcher
        app_module.run_notification_check = notification_check

        runtime_module = types.ModuleType("final_notifications_runtime")

        def run_worker(factory, fetcher, checker):
            calls.append((factory, fetcher, checker))
            return result

        runtime_module.run_final_notification_worker_hardened = run_worker

        stdout = io.StringIO()
        with patch.dict(
            sys.modules,
            {"app": app_module, "final_notifications_runtime": runtime_module},
        ), contextlib.redirect_stdout(stdout):
            runpy.run_path(str(ROOT / "notification_worker.py"), run_name="__main__")

        self.assertEqual(calls, [(connection_factory, tmdb_fetcher, notification_check)])
        self.assertEqual(json.loads(stdout.getvalue()), result)


class BrowserEndToEndSafetyTests(unittest.TestCase):
    @staticmethod
    def browser_binary() -> str | None:
        for candidate in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            binary = shutil.which(candidate)
            if binary:
                return binary
        return None

    def dump_dom(self, browser: str, url: str, *, javascript: bool = True) -> str:
        with tempfile.TemporaryDirectory(prefix="tv-tracker-phase12-browser-") as profile_dir:
            command = [
                browser,
                "--headless=new",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-background-networking",
                "--no-first-run",
                "--no-default-browser-check",
                f"--user-data-dir={profile_dir}",
                "--dump-dom",
            ]
            if not javascript:
                command.append("--disable-javascript")
            command.append(url)
            completed = subprocess.run(
                command,
                cwd=ROOT,
                text=True,
                capture_output=True,
                timeout=30,
                check=False,
            )
        self.assertEqual(
            completed.returncode,
            0,
            msg=f"Headless browser failed for {url}: {completed.stderr[-2000:]}",
        )
        return completed.stdout

    def test_real_browser_covers_login_redirect_and_authenticated_app_shell(self):
        browser = self.browser_binary()
        if browser is None:
            if os.environ.get("GITHUB_ACTIONS", "").lower() == "true":
                self.fail("GitHub Actions must provide a Chromium/Chrome binary for Phase 12 browser E2E")
            self.skipTest("Chromium/Chrome is not installed in this local test environment")

        account = {
            "username": "phase12-admin",
            "password_hash": "unused",
            "session_version": 1,
            "updated_at": None,
        }
        with patch.object(tracker, "ensure_schema", return_value=None), patch.object(
            tracker, "cleanup_stored_tracker_data", return_value=None
        ), patch.object(tracker, "read_admin_account", return_value=account):
            app = tracker.create_app()
            app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)

            @app.get("/__phase12_auth")
            def phase12_auth():
                session["authenticated"] = True
                session["session_version"] = 1
                session["csrf_token"] = "phase12-browser-csrf"
                return redirect("/app/settings")

            server = make_server("127.0.0.1", 0, app)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            try:
                logged_out_dom = self.dump_dom(browser, f"{base_url}/app/settings")
                self.assertIn("TV Tracker — Access", logged_out_dom)
                self.assertIn('id="login-panel"', logged_out_dom)

                # The test-only route establishes the same authenticated session fields
                # used by the real login flow, then redirects through the real protected
                # Settings route. JavaScript is disabled for this navigation so this
                # safety test stays hermetic and does not contact the database/providers.
                authenticated_dom = self.dump_dom(
                    browser,
                    f"{base_url}/__phase12_auth",
                    javascript=False,
                )
                self.assertIn('meta name="app-route" content="/app/settings"', authenticated_dom)
                self.assertIn('id="settings-page"', authenticated_dom)
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
