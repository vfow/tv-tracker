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


class FrontendModernizationPhase4FBrowserTests(unittest.TestCase):
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
        with tempfile.TemporaryDirectory(prefix="tv-tracker-phase4f-browser-") as profile_dir:
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

    def test_profile_direct_route_mounts_completed_vue_settings_owner(self):
        browser = self.browser_binary()
        if browser is None:
            in_ci = any(
                os.environ.get(name, "").lower() in {"1", "true", "yes"}
                for name in ("CI", "GITHUB_ACTIONS")
            )
            if in_ci:
                self.fail("CI must provide Chromium/Chrome for the Phase 4F Settings completion E2E")
            self.skipTest("Chromium/Chrome is not installed in this local test environment")

        account = {
            "username": "phase4f-admin",
            "password_hash": "unused",
            "session_version": 1,
            "updated_at": None,
        }
        tracker_data = {
            "shows": {"101": {"name": "Phase 4F Show", "status": "watching"}},
            "movies": {},
            "history": [],
            "profile": {
                "username": "Phase 4F Profile",
                "favorite_shows": ["101"],
                "favorite_movies": [],
                "avatar_type": "initial",
                "avatar_preset": "silhouette-1",
                "avatar_data": "",
                "header_type": "preset",
                "header_preset": "default",
                "header_image": "",
                "adult_filter": True,
            },
        }
        with patch.object(tracker, "ensure_schema", return_value=None), patch.object(
            tracker, "cleanup_stored_tracker_data", return_value=None
        ), patch.object(tracker, "read_admin_account", return_value=account), patch.object(
            tracker, "read_tracker_data", return_value=(tracker_data, 0)
        ):
            app = tracker.create_app()
            app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
            app.view_functions["get_revision"] = lambda: jsonify(
                {"ok": True, "revision": 0}
            )
            app.view_functions["tmdb_proxy"] = lambda **_kwargs: jsonify(
                {"countries": [{"iso_3166_1": "US", "english_name": "United States"}]}
            )

            @app.get("/__phase4f_settings")
            def phase4f_settings():
                session["authenticated"] = True
                session["session_version"] = 1
                session["csrf_token"] = "phase4f-browser-csrf"
                return redirect("/app/settings/profile")

            server = make_server("127.0.0.1", 0, app)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            try:
                dom = self.dump_dom(browser, f"{base_url}/__phase4f_settings")
                self.assertIn(
                    'meta name="app-route" content="/app/settings/profile"',
                    dom,
                )
                self.assertIn(
                    'data-tvtracker-vue-profile-settings="profile"',
                    dom,
                    "the completed manifest-driven Vue owner must mount on a direct Profile route",
                )
                self.assertIn('id="profile-username-input"', dom)
                self.assertIn("Phase 4F Profile", dom)
                self.assertIn('data-tv-tracker-app-ready="true"', dom)
                self.assertNotIn('data-tvtracker-settings-loading="true"', dom)
                self.assertNotIn('data-tvtracker-settings-load-failed="true"', dom)
                self.assertNotIn('data-tvtracker-vue-notifications-settings="notifications"', dom)
                self.assertNotIn('data-tvtracker-vue-auth-settings="auth"', dom)
                self.assertNotIn('data-tvtracker-vue-data-settings="data"', dom)
                self.assertNotIn('data-tvtracker-vue-danger-settings="danger-zone"', dom)
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
