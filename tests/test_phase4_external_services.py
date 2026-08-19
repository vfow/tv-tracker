from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from urllib.error import HTTPError

from flask import Flask, jsonify, request

from tvtracker.integrations.tvmaze import TVmazeProvider
from tvtracker.notifications import push_validation
from tvtracker.release_timing.service import ReleaseTimingResolver


class _JsonResponse:
    def __init__(self, payload: dict[str, object]):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class Phase4ExternalServiceTests(unittest.TestCase):
    def test_release_timing_provider_timeout_falls_back_to_tmdb_date(self):
        class FailingProvider:
            def resolve_episode(self, **kwargs):
                raise TimeoutError("provider timeout")

        resolver = ReleaseTimingResolver(
            provider=FailingProvider(),
            provider_enabled=True,
            query_enabled=True,
            exact_enabled=True,
            date_only_enabled=True,
        )
        result = resolver.resolve(
            tmdb_id=1399,
            season_number=1,
            episode_number=1,
            tmdb_air_date="2026-08-18",
            timezone_name="UTC",
        )

        self.assertIsNotNone(result)
        self.assertFalse(result.provider_used)
        self.assertEqual(result.confidence, "fallback")
        self.assertEqual(result.reason, "tmdb_date_fallback")
        self.assertEqual(result.release_date, "2026-08-18")

    def test_tvmaze_429_uses_bounded_retry_after_and_recovers(self):
        calls = []
        sleeps = []

        def opener(request_object, timeout):
            calls.append((request_object.full_url, timeout))
            if len(calls) == 1:
                raise HTTPError(
                    request_object.full_url,
                    429,
                    "Too Many Requests",
                    {"Retry-After": "30"},
                    None,
                )
            return _JsonResponse({"id": 42})

        provider = TVmazeProvider(
            connection_factory=lambda: None,
            tmdb_fetcher=lambda path, params=None: {},
            opener=opener,
            sleep=sleeps.append,
        )
        payload = provider._request_json_uncached("https://api.tvmaze.com/shows/42")

        self.assertEqual(payload, {"id": 42})
        self.assertEqual(len(calls), 2)
        self.assertEqual(provider.diagnostics["rate_limited"], 1)
        self.assertEqual(provider.diagnostics["failures"], 0)
        self.assertEqual(sleeps, [4.0])

    def test_push_browser_contract_strips_technical_diagnostics(self):
        public = push_validation.browser_push_config_payload({
            "ok": True,
            "configured": False,
            "publicKey": "public-value",
            "dependencyAvailable": False,
            "validationCode": "dependency_unavailable",
            "validationError": "VAPID crypto validation unavailable",
            "privateKey": "secret-value",
            "subject": "mailto:owner@example.test",
        })

        self.assertEqual(public, {
            "ok": True,
            "configured": False,
            "publicKey": "",
            "unavailable": True,
        })
        serialized = json.dumps(public)
        self.assertNotIn("dependency", serialized.lower())
        self.assertNotIn("validation", serialized.lower())
        self.assertNotIn("private", serialized.lower())
        self.assertNotIn("subject", serialized.lower())

    def test_push_installer_matches_wsgi_order_and_preserves_auth_errors(self):
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="phase4-test")
        module = SimpleNamespace(
            push_config=lambda: {
                "configured": False,
                "keysConfigured": False,
                "dependencyAvailable": False,
                "publicKey": "",
                "privateKey": "",
                "subject": "",
            }
        )

        # Production wsgi.py installs Push validation before final Push routes.
        push_validation.install_notification_polish(app, module)

        @app.get("/api/push/config", endpoint="push_config_api")
        def raw_config():
            if request.headers.get("X-Test-Auth") != "yes":
                return jsonify({"ok": False, "error": "Unauthorized"}), 401
            return jsonify({
                "ok": True,
                "configured": False,
                "publicKey": "",
                "dependencyAvailable": False,
                "validationCode": "dependency_unavailable",
            })

        @app.post("/api/push/subscribe", endpoint="push_subscribe_api")
        def raw_subscribe():
            return jsonify({"ok": False, "error": "Admin session version is unavailable"}), 400

        client = app.test_client()

        unauthorized = client.get("/api/push/config")
        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(unauthorized.get_json(), {"ok": False, "error": "Unauthorized"})

        config_response = client.get("/api/push/config", headers={"X-Test-Auth": "yes"})
        self.assertEqual(config_response.status_code, 200)
        self.assertEqual(config_response.get_json(), {
            "ok": True,
            "configured": False,
            "publicKey": "",
            "unavailable": True,
        })

        subscribe_response = client.post("/api/push/subscribe")
        self.assertEqual(subscribe_response.status_code, 400)
        self.assertEqual(subscribe_response.get_json(), {
            "ok": False,
            "error": "TV Tracker couldn’t enable Push on this device. Try again later.",
            "code": "push_enable_failed",
        })

    def test_push_server_config_keeps_diagnostics_for_logs_not_browser(self):
        from unittest.mock import patch

        from tvtracker.notifications.push_and_movies import push_config

        with patch.dict("os.environ", {}, clear=True), patch(
            "tvtracker.notifications.push_and_movies._pywebpush_available",
            return_value=False,
        ):
            server_config = push_config()

        self.assertEqual(server_config["validationCode"], "missing_public_key")
        self.assertIn("dependencyAvailable", server_config)
        browser_config = push_validation.browser_push_config_payload(server_config)
        self.assertNotIn("validationCode", browser_config)
        self.assertNotIn("dependencyAvailable", browser_config)


if __name__ == "__main__":
    unittest.main()
