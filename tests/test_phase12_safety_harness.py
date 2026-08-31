from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import psycopg
from flask import jsonify, redirect, session
from werkzeug.serving import make_server


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app as app_module
from tvtracker.migrations import registry as migration_registry
from tvtracker.migrations import runner as migration_runner


class BackupAndMigrationSafetyTests(unittest.TestCase):
    maxDiff = None

    def test_supported_v1_and_v2_backups_normalize_to_same_user_truth(self):
        current_payload = {
            "version": 2,
            "exported_at": "2026-08-17T00:00:00+00:00",
            "data": {
                "shows": {
                    "10": {
                        "tmdb_id": 10,
                        "title": "Tracked Show",
                        "status": "watching",
                        "episodes_watched": [[1, 1]],
                    }
                },
                "movies": {},
                "favorites": [10],
                "favorite_movies": [],
                "history": [],
                "profile": {
                    "display_name": "Tester",
                    "avatar_url": "",
                    "custom_avatar_data": "",
                    "streaming_region": "US",
                    "timezone_mode": "automatic",
                    "timezone": "UTC",
                },
                "provider_metadata": {},
            },
            "summary": {
                "show_count": 1,
                "movie_count": 0,
                "history_count": 0,
                "favorite_count": 1,
                "favorite_movie_count": 0,
            },
        }
        legacy_payload = copy.deepcopy(current_payload)
        legacy_payload["version"] = 1
        legacy_payload.pop("summary")
        legacy_payload["data"]["profile"].pop("timezone_mode")
        legacy_payload["data"]["profile"].pop("timezone")
        legacy_payload["data"].pop("provider_metadata")

        current_normalized = app_module.validate_backup_payload(current_payload)
        legacy_normalized = app_module.validate_backup_payload(legacy_payload)

        self.assertEqual(current_normalized, legacy_normalized)
        self.assertEqual(current_normalized["shows"]["10"]["title"], "Tracked Show")
        self.assertEqual(current_normalized["profile"]["timezone"], "UTC")
        self.assertEqual(current_normalized["profile"]["timezone_mode"], "automatic")
        self.assertEqual(current_normalized["provider_metadata"], {})

    def test_v1_backup_can_be_semantically_reemitted_as_current_backup(self):
        legacy_payload = {
            "version": 1,
            "exported_at": "2026-08-17T00:00:00+00:00",
            "data": {
                "shows": {},
                "movies": {},
                "favorites": [],
                "favorite_movies": [],
                "history": [],
                "profile": {
                    "display_name": "",
                    "avatar_url": "",
                    "custom_avatar_data": "",
                    "streaming_region": "US",
                },
            },
        }
        normalized = app_module.validate_backup_payload(legacy_payload)
        reemitted = {
            "version": app_module.BACKUP_VERSION,
            "exported_at": "2026-08-17T00:00:00+00:00",
            "data": normalized,
            "summary": app_module.backup_summary(normalized),
        }
        self.assertEqual(app_module.validate_backup_payload(reemitted), normalized)

    def test_future_backup_versions_fail_closed(self):
        payload = {
            "version": app_module.BACKUP_VERSION + 1,
            "exported_at": "2026-08-17T00:00:00+00:00",
            "data": {},
        }
        with self.assertRaises(app_module.ValidationError):
            app_module.validate_backup_payload(payload)

    def test_schema_bootstrap_is_safe_to_run_across_restarts(self):
        statements: list[str] = []

        class FakeCursor:
            def execute(self, statement, _params=None):
                statements.append(str(statement))

            def fetchone(self):
                return None

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        class FakeConnection:
            def cursor(self):
                return FakeCursor()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        with mock.patch.object(app_module, "database_connection", return_value=FakeConnection()), mock.patch.object(
            app_module, "run_migrations"
        ) as run_migrations, mock.patch.object(app_module, "bootstrap_admin_account") as bootstrap:
            app_module.ensure_schema()
            app_module.ensure_schema()

        self.assertEqual(run_migrations.call_count, 2)
        self.assertEqual(bootstrap.call_count, 2)


class MaliciousInputAndConcurrencySafetyTests(unittest.TestCase):
    def test_json_limits_fail_closed_without_large_allocations(self):
        huge = "x" * (app_module.MAX_JSON_BYTES + 1)
        with app_module.app.test_request_context(
            "/api/state", method="PATCH", data=huge, content_type="application/json"
        ):
            with self.assertRaises(app_module.ValidationError):
                app_module.parse_json_request()

    def test_untrusted_state_keys_cannot_become_storage_or_sql_names(self):
        payload = {
            "changes": {
                "../../etc/passwd": {"value": "oops"},
                "shows": {},
            }
        }
        with self.assertRaises(app_module.ValidationError):
            app_module.validate_sync_delta(payload)

    def test_sync_conflict_matrix_detects_overlapping_entities_only(self):
        saved = {
            "shows": {"1": {"tmdb_id": 1}},
            "movies": {},
            "profile": {},
            "favorites": [],
            "favorite_movies": [],
            "history": [],
            "provider_metadata": {},
        }
        incoming = copy.deepcopy(saved)
        incoming["shows"]["2"] = {"tmdb_id": 2}
        conflicting = copy.deepcopy(saved)
        conflicting["shows"]["1"] = {"tmdb_id": 1, "status": "watching"}

        self.assertFalse(app_module.sync_delta_conflicts(saved, incoming))
        self.assertTrue(app_module.sync_delta_conflicts(saved, conflicting))


class EntrypointSafetyTests(unittest.TestCase):
    def test_wsgi_startup_exports_application_and_installs_each_boundary_once(self):
        source = (ROOT / "wsgi.py").read_text(encoding="utf-8")
        self.assertIn("application = app", source)
        self.assertEqual(source.count("install_notification_polish("), 1)
        self.assertEqual(source.count("install_final_notifications("), 1)
        self.assertEqual(source.count("ensure_schema()"), 1)

    def test_notification_worker_main_path_is_hermetic_and_machine_readable(self):
        completed = subprocess.run(
            [sys.executable, "notification_worker.py", "--help"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("notification", completed.stdout.lower())


class BrowserEndToEndSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.browser_path = shutil.which("chromium") or shutil.which("chromium-browser")
        if not cls.browser_path:
            raise unittest.SkipTest("Chromium is unavailable")

    def dump_dom(self, browser: str, url: str) -> str:
        completed = subprocess.run(
            [
                browser,
                "--headless",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--virtual-time-budget=8000",
                "--dump-dom",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return completed.stdout

    def test_real_browser_covers_login_redirect_and_authenticated_app_shell(self):
        app = app_module.app
        app.config.update(TESTING=True, SECRET_KEY="phase12-browser-secret")

        with mock.patch.object(app_module, "authenticated", return_value=True), mock.patch.object(
            app_module, "read_tracker_data", return_value={
                "shows": {},
                "movies": {},
                "favorites": [],
                "favorite_movies": [],
                "history": [],
                "profile": {
                    "display_name": "",
                    "avatar_url": "",
                    "custom_avatar_data": "",
                    "streaming_region": "US",
                    "timezone_mode": "automatic",
                    "timezone": "UTC",
                },
                "provider_metadata": {},
            }
        ):
            original_before_request = list(app.before_request_funcs.get(None, ()))
            # The browser safety probe needs the real auth redirect first, then the
            # authenticated app shell. Temporarily leave auth behavior unpatched for
            # the initial request and set the session explicitly for the second.
            def real_authenticated():
                return session.get("authenticated") is True

            app_module.authenticated = real_authenticated
            app.view_functions["state_api"] = lambda: jsonify(
                {
                    "ok": True,
                    "data": {
                        "shows": {},
                        "movies": {},
                        "favorites": [],
                        "favorite_movies": [],
                        "history": [],
                        "profile": {
                            "display_name": "",
                            "avatar_url": "",
                            "custom_avatar_data": "",
                            "streaming_region": "US",
                            "timezone_mode": "automatic",
                            "timezone": "UTC",
                        },
                        "provider_metadata": {},
                    },
                }
            )
            app.view_functions["notifications_api"] = lambda: jsonify(
                {"ok": True, "notifications": []}
            )
            app.view_functions["notification_settings_api"] = lambda: jsonify(
                {"ok": True, "settings": {}}
            )
            app.view_functions["notification_settings_patch_api"] = lambda: jsonify(
                {"ok": True, "settings": {}}
            )
            app.view_functions["get_revision"] = lambda: jsonify(
                {"ok": True, "revision": 0}
            )
            app.view_functions["tmdb_proxy"] = lambda **_kwargs: jsonify({})

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
                self.assertIn("<title>Sign in</title>", logged_out_dom)
                self.assertIn(">WELCOME</h1>", logged_out_dom)
                self.assertIn('id="login-panel"', logged_out_dom)

                # The test-only route establishes the same authenticated session fields
                # used by the real login flow, then follows the protected Settings route.
                # The marker proves the real scripts completed API-backed initialization.
                authenticated_dom = self.dump_dom(browser, f"{base_url}/__phase12_auth")
                self.assertIn(
                    'meta name="app-route" content="/app/settings/profile"',
                    authenticated_dom,
                )
                self.assertIn('id="settings-page"', authenticated_dom)
                self.assertIn(
                    'data-tv-tracker-app-ready="true"',
                    authenticated_dom,
                    "the real browser must complete the full startup barrier",
                )
                self.assertIn('data-tv-tracker-startup="ready"', authenticated_dom)
            finally:
                server.shutdown()
                thread.join(timeout=5)
                app.before_request_funcs[None] = original_before_request
