from __future__ import annotations

import json
import logging
import unittest
from functools import wraps

from flask import Flask, abort, request

from tvtracker.infrastructure.client_errors import (
    CLIENT_ERROR_LIMIT_PER_WINDOW,
    install_client_error_reporting,
)


class _CaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


class ClientErrorReportingTests(unittest.TestCase):
    def build_app(self, *, clock=lambda: 100.0):
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="test-secret")

        def login_required(view):
            @wraps(view)
            def wrapped(*args, **kwargs):
                if request.headers.get("X-Test-Auth") != "1":
                    return {"ok": False}, 401
                return view(*args, **kwargs)

            return wrapped

        def check_csrf() -> None:
            if request.headers.get("X-CSRF-Token") != "test-csrf":
                abort(403)

        install_client_error_reporting(
            app,
            login_required=login_required,
            check_csrf=check_csrf,
            release_sha="a" * 40,
            clock=clock,
            event_id_factory=lambda: "server-event-id",
        )
        capture = _CaptureHandler()
        app.logger.addHandler(capture)
        app.logger.setLevel(logging.ERROR)
        return app, capture

    def headers(self):
        return {
            "X-Test-Auth": "1",
            "X-CSRF-Token": "test-csrf",
        }

    def test_endpoint_requires_auth_and_csrf(self):
        app, _capture = self.build_app()
        client = app.test_client()
        self.assertEqual(client.post("/api/client-errors", json={}).status_code, 401)
        self.assertEqual(
            client.post(
                "/api/client-errors",
                json={},
                headers={"X-Test-Auth": "1"},
            ).status_code,
            403,
        )

    def test_log_schema_rejects_raw_browser_and_user_data(self):
        app, capture = self.build_app()
        response = app.test_client().post(
            "/api/client-errors",
            json={
                "clientEventId": "client-abc123",
                "category": "save",
                "surface": "tracker",
                "status": 503,
                "requestId": "A" * 32,
                "code": "database_unavailable",
                "message": "Private show title and password=hunter2",
                "stack": "Traceback private data",
                "url": "/app/show/123-private-title",
                "trackerData": {"shows": {"123": {"title": "Private"}}},
                "password": "hunter2",
            },
            headers=self.headers(),
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.get_json()["eventId"], "client-abc123")
        self.assertEqual(len(capture.messages), 1)
        event = json.loads(capture.messages[0])
        self.assertEqual(
            event,
            {
                "category": "save",
                "clientEventId": "client-abc123",
                "code": "database_unavailable",
                "event": "client_error",
                "releaseSha": "a" * 40,
                "requestId": "a" * 32,
                "status": 503,
                "surface": "tracker",
            },
        )
        serialized = capture.messages[0]
        for forbidden in (
            "Private show title",
            "hunter2",
            "Traceback",
            "/app/show/",
            "trackerData",
            "password",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_invalid_values_collapse_to_safe_defaults(self):
        app, capture = self.build_app()
        response = app.test_client().post(
            "/api/client-errors",
            json={
                "clientEventId": "../../unsafe",
                "category": "password-leak",
                "surface": "/app/show/private-title",
                "status": 999,
                "requestId": "not-a-request-id",
                "code": "contains spaces and secrets",
            },
            headers=self.headers(),
        )
        self.assertEqual(response.status_code, 202)
        event = json.loads(capture.messages[0])
        self.assertEqual(event["clientEventId"], "server-event-id")
        self.assertEqual(event["category"], "runtime")
        self.assertEqual(event["surface"], "app")
        self.assertNotIn("status", event)
        self.assertNotIn("requestId", event)
        self.assertNotIn("code", event)

    def test_oversized_payload_is_rejected_before_logging(self):
        app, capture = self.build_app()
        response = app.test_client().post(
            "/api/client-errors",
            data=json.dumps({"message": "x" * 5000}),
            content_type="application/json",
            headers=self.headers(),
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(capture.messages, [])

    def test_log_flood_is_bounded_per_process(self):
        app, capture = self.build_app()
        client = app.test_client()
        for index in range(CLIENT_ERROR_LIMIT_PER_WINDOW):
            response = client.post(
                "/api/client-errors",
                json={"clientEventId": f"event-{index}", "category": "runtime"},
                headers=self.headers(),
            )
            self.assertEqual(response.status_code, 202)
        limited = client.post(
            "/api/client-errors",
            json={"clientEventId": "event-over-limit", "category": "runtime"},
            headers=self.headers(),
        )
        self.assertEqual(limited.status_code, 204)
        self.assertEqual(len(capture.messages), CLIENT_ERROR_LIMIT_PER_WINDOW)


if __name__ == "__main__":
    unittest.main()
