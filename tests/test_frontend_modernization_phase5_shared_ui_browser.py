from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

from flask import jsonify, redirect, request, session
from werkzeug.serving import make_server

import app as tracker


ROOT = Path(__file__).resolve().parents[1]


class FrontendModernizationPhase5SharedUiBrowserTests(unittest.TestCase):
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
        with tempfile.TemporaryDirectory(prefix="tv-tracker-phase5-shared-ui-") as profile_dir:
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
                    "--virtual-time-budget=6500",
                    f"--user-data-dir={profile_dir}",
                    "--dump-dom",
                    url,
                ],
                cwd=ROOT,
                encoding="utf-8",
                errors="replace",
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

    def test_streaming_validation_reaches_single_feedback_surface_through_vue_adapter(self):
        browser = self.browser_binary()
        if browser is None:
            in_ci = any(
                os.environ.get(name, "").lower() in {"1", "true", "yes"}
                for name in ("CI", "GITHUB_ACTIONS")
            )
            if in_ci:
                self.fail("CI must provide Chromium/Chrome for the Phase 5 Shared UI E2E")
            self.skipTest("Chromium/Chrome is not installed in this local test environment")

        account = {
            "username": "phase5-admin",
            "password_hash": "unused",
            "session_version": 1,
            "updated_at": None,
        }
        tracker_data = {
            "shows": {},
            "movies": {},
            "history": [],
            "profile": {
                "username": "Phase 5 Profile",
                "favorite_shows": [],
                "favorite_movies": [],
                "avatar_type": "initial",
                "avatar_preset": "silhouette-1",
                "avatar_data": "",
                "header_type": "preset",
                "header_preset": "default",
                "header_image": "",
                "adult_filter": True,
                "streaming_region": "US",
            },
        }
        with patch.object(tracker, "ensure_schema", return_value=None), patch.object(
            tracker, "cleanup_stored_tracker_data", return_value=None
        ), patch.object(tracker, "read_admin_account", return_value=account), patch.object(
            tracker, "read_tracker_data", return_value=(tracker_data, 0)
        ):
            app = tracker.create_app()
            app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
            app.view_functions["get_revision"] = lambda: jsonify({"ok": True, "revision": 0})
            app.view_functions["tmdb_proxy"] = lambda **_kwargs: jsonify(
                {"countries": [{"iso_3166_1": "US", "english_name": "United States"}]}
            )

            @app.get("/__phase5_shared_ui")
            def phase5_shared_ui():
                session["authenticated"] = True
                session["session_version"] = 1
                session["csrf_token"] = "phase5-browser-csrf"
                return redirect("/app/settings/streaming")

            @app.after_request
            def inject_feedback_interaction(response):
                if request.path != "/app/settings/streaming" or not response.content_type.startswith("text/html"):
                    return response
                script = """
<script>
(() => {
  const timer = window.setInterval(() => {
    const input = document.getElementById('settings-vue-region-input');
    const button = document.querySelector('.settings-v2-button--primary');
    if (!input || !button) return;
    window.clearInterval(timer);
    input.value = 'Definitely not a country';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.setTimeout(() => button.click(), 250);
  }, 100);
})();
</script>
"""
                markup = response.get_data(as_text=True)
                response.set_data(markup.replace("</body>", script + "</body>"))
                return response

            server = make_server("127.0.0.1", 0, app)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            try:
                dom = self.dump_dom(browser, f"{base_url}/__phase5_shared_ui")
                self.assertIn('data-tvtracker-vue-settings="streaming"', dom)
                self.assertIn('id="tv-feedback-root"', dom)
                self.assertEqual(dom.count('id="tv-feedback-root"'), 1, "Shared UI must keep one visible feedback root")
                self.assertIn("tv-feedback-card--warning", dom)
                self.assertIn("Choose a country from the streaming region list or clear the field.", dom)
                self.assertNotIn('id="toast"', dom, "The legacy toast DOM must remain retired")
                self.assertIn('data-tv-tracker-app-ready="true"', dom)
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
