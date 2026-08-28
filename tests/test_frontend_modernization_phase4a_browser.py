from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

from flask import jsonify, redirect, session
from werkzeug.serving import make_server

import app as tracker


ROOT = Path(__file__).resolve().parents[1]


class FrontendModernizationPhase4ABrowserTests(unittest.TestCase):
    @staticmethod
    def browser_binary() -> str | None:
        configured = os.environ.get("CHROME_BIN", "")
        if configured and Path(configured).is_file():
            return configured
        for candidate in (
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "chrome",
            "chrome.exe",
            "msedge",
            "msedge.exe",
        ):
            binary = shutil.which(candidate)
            if binary:
                return binary
        return None

    def dump_dom(self, browser: str, url: str) -> str:
        with tempfile.TemporaryDirectory(prefix="tv-tracker-phase4a-browser-") as profile_dir:
            completed = subprocess.run(
                [
                    browser,
                    "--headless=new",
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--disable-background-networking",
                    "--no-proxy-server",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--virtual-time-budget=5000",
                    f"--user-data-dir={profile_dir}",
                    "--dump-dom",
                    url,
                ],
                cwd=ROOT,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=25,
                check=False,
            )
        self.assertEqual(
            completed.returncode,
            0,
            msg=f"Headless browser failed for {url}: {completed.stderr[-2000:]}",
        )
        return completed.stdout

    def test_notifications_settings_vue_shell_mounts_canonical_controls_in_real_browser(self):
        browser = self.browser_binary()
        if browser is None:
            in_ci = any(
                os.environ.get(name, "").lower() in {"1", "true", "yes"}
                for name in ("CI", "GITHUB_ACTIONS")
            )
            if in_ci:
                self.fail("CI must provide Chromium/Chrome for the Phase 4A Notifications Vue E2E")
            self.skipTest("Chromium/Chrome is not installed in this local test environment")

        account = {
            "username": "phase4a-admin",
            "password_hash": "unused",
            "session_version": 1,
            "updated_at": None,
        }
        settings = {
            "enabled": True,
            "newSeason": True,
            "seasonPremiereTomorrow": True,
            "newEpisode": True,
            "returnsTomorrow": True,
            "canceledEnded": True,
            "premiereDateUpdates": True,
            "movieReleased": True,
            "movieReleaseUpdates": True,
            "timezone": "UTC",
            "timezoneMode": "manual",
        }
        with patch.object(tracker, "ensure_schema", return_value=None), patch.object(
            tracker, "cleanup_stored_tracker_data", return_value=None
        ), patch.object(tracker, "read_admin_account", return_value=account), patch.object(
            tracker, "read_tracker_data", return_value=({"shows": {}, "history": [], "profile": {}}, 0)
        ):
            app = tracker.create_app()
            app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
            app.view_functions["notifications_api"] = lambda: jsonify(
                {"ok": True, "notifications": []}
            )
            app.view_functions["notification_settings_api"] = lambda: jsonify(
                {"ok": True, "settings": settings}
            )
            app.view_functions["notification_settings_patch_api"] = lambda: jsonify(
                {"ok": True, "settings": settings}
            )
            app.view_functions["get_revision"] = lambda: jsonify(
                {"ok": True, "revision": 0}
            )
            app.view_functions["tmdb_proxy"] = lambda **_kwargs: jsonify(
                {"countries": [{"iso_3166_1": "US", "english_name": "United States"}]}
            )

            @app.get("/__phase4a_auth")
            def phase4a_auth():
                session["authenticated"] = True
                session["session_version"] = 1
                session["csrf_token"] = "phase4a-browser-csrf"
                return redirect("/app/settings/notifications")

            server = make_server("127.0.0.1", 0, app)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            try:
                dom = self.dump_dom(browser, f"{base_url}/__phase4a_auth")
                self.assertIn(
                    'meta name="app-route" content="/app/settings/notifications"',
                    dom,
                )
                self.assertIn(
                    'data-tvtracker-vue-notifications-settings="notifications"',
                    dom,
                    "the manifest-driven Vue bundle must replace the legacy Notifications shell",
                )
                self.assertIn('id="settings-v2-notification-list"', dom)
                self.assertIn('data-notification-setting="enabled"', dom)
                self.assertIn('data-notification-setting="newEpisode"', dom)
                self.assertIn('data-notification-setting="pushNotifications"', dom)
                self.assertIn('data-tv-tracker-app-ready="true"', dom)
                self.assertNotIn('data-tvtracker-vue-settings="streaming"', dom)
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
