from __future__ import annotations

import json
import logging
import unittest
from unittest.mock import Mock, patch
from urllib.request import Request

from flask import Flask

from tools import production_smoke
from tvtracker.infrastructure import observability
from tvtracker.notifications import runtime


class FakeResponse:
    def __init__(self, *, status: int, headers: dict[str, str], body: bytes):
        self.status = status
        self.headers = headers
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def getcode(self):
        return self.status

    def read(self):
        return self._body


class SequenceOpener:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = list(responses)
        self.requests: list[Request] = []

    def __call__(self, request: Request, timeout: float):
        self.requests.append(request)
        if not self.responses:
            raise AssertionError("unexpected request")
        return self.responses.pop(0)


class LockCursor:
    def __init__(self, lock_acquired: bool | None):
        self.lock_acquired = lock_acquired
        self.calls: list[tuple[str, object]] = []
        self._row = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        text = str(query)
        self.calls.append((text, params))
        if "pg_try_advisory_lock" in text:
            self._row = (
                (self.lock_acquired,)
                if isinstance(self.lock_acquired, bool)
                else None
            )
        elif "pg_advisory_unlock" in text:
            self._row = (True,)
        else:
            self._row = None

    def fetchone(self):
        return self._row


class LockConnection:
    def __init__(self, lock_acquired: bool | None):
        self.cursor_instance = LockCursor(lock_acquired)
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


class OperationalObservabilityTests(unittest.TestCase):
    def test_request_log_uses_route_template_and_excludes_sensitive_request_data(self):
        app = Flask(__name__)
        app.config.update(TESTING=True)
        ticks = iter([10.0, 10.125])

        @app.get("/shows/<show_id>")
        def show(show_id):
            return {"ok": True, "show": show_id}

        with patch.object(app.logger, "log") as log:
            observability.install_request_observability(
                app,
                release_sha="a" * 40,
                clock=lambda: next(ticks),
                request_id_factory=lambda: "b" * 32,
            )
            response = app.test_client().get("/shows/123?token=super-secret")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Request-ID"], "b" * 32)
        log.assert_called_once()
        level, message = log.call_args.args
        self.assertEqual(level, logging.INFO)
        payload = json.loads(message)
        self.assertEqual(payload["route"], "/shows/<show_id>")
        self.assertEqual(payload["status"], 200)
        self.assertEqual(payload["durationMs"], 125.0)
        self.assertEqual(payload["releaseSha"], "a" * 40)
        self.assertNotIn("123", message)
        self.assertNotIn("super-secret", message)
        self.assertNotIn("token", message)

    def test_successful_health_probe_gets_request_id_without_log_noise(self):
        app = Flask(__name__)
        app.config.update(TESTING=True)

        @app.get("/healthz")
        def healthz():
            return {"ok": True}

        with patch.object(app.logger, "log") as log:
            observability.install_request_observability(
                app,
                clock=lambda: 1.0,
                request_id_factory=lambda: "c" * 32,
            )
            response = app.test_client().get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Request-ID"], "c" * 32)
        log.assert_not_called()

    def test_worker_overlap_is_a_successful_noop(self):
        lock_connection = LockConnection(False)
        core_worker = Mock(return_value={"ok": True})
        with patch.object(
            runtime,
            "run_final_notification_worker_hardened",
            core_worker,
        ):
            result = runtime.run_scheduled_notification_worker(
                lambda: lock_connection,
                Mock(),
                Mock(),
                release_sha="d" * 40,
                clock=lambda: 1.0,
            )

        self.assertEqual(
            result,
            {"ok": True, "status": "skipped_overlap", "skipped": True},
        )
        core_worker.assert_not_called()
        self.assertEqual(lock_connection.commits, 1)

    def test_worker_lock_wraps_real_run_and_is_released(self):
        lock_connection = LockConnection(True)
        result = {
            "ok": True,
            "changedNotifications": 2,
            "push": {"delivered": 1, "failed": 0, "dead": 0},
        }
        hardened = Mock(return_value=result)
        ticks = iter([2.0, 2.250])

        with patch.object(
            runtime,
            "run_final_notification_worker_hardened",
            hardened,
        ):
            actual = runtime.run_scheduled_notification_worker(
                lambda: lock_connection,
                Mock(),
                Mock(),
                release_sha="e" * 40,
                clock=lambda: next(ticks),
            )

        self.assertIs(actual, result)
        hardened.assert_called_once()
        sql = "\n".join(query for query, _ in lock_connection.cursor_instance.calls)
        self.assertIn("pg_try_advisory_lock", sql)
        self.assertIn("pg_advisory_unlock", sql)
        self.assertEqual(lock_connection.commits, 2)

    def test_invalid_worker_lock_result_fails_closed(self):
        lock_connection = LockConnection(None)
        with self.assertRaisesRegex(RuntimeError, "lock query returned invalid result"):
            runtime.run_scheduled_notification_worker(
                lambda: lock_connection,
                Mock(),
                Mock(),
            )


class ProductionSmokeTests(unittest.TestCase):
    def successful_responses(self, release_sha: str) -> list[FakeResponse]:
        return [
            FakeResponse(
                status=200,
                headers={"Content-Type": "application/json"},
                body=json.dumps({"ok": True, "releaseSha": release_sha}).encode(),
            ),
            FakeResponse(
                status=200,
                headers={
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
                    "X-Request-ID": "f" * 32,
                },
                body=b"<html></html>",
            ),
        ]

    def test_smoke_verifies_health_release_login_security_and_request_id(self):
        release_sha = "1" * 40
        opener = SequenceOpener(self.successful_responses(release_sha))
        result = production_smoke.check_production(
            base_url="https://example.test",
            health_token="health-secret",
            expected_release_sha=release_sha,
            opener=opener,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["releaseSha"], release_sha)
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(opener.requests[0].full_url, "https://example.test/healthz")
        self.assertEqual(
            opener.requests[0].get_header("X-healthcheck-token"),
            "health-secret",
        )
        self.assertEqual(opener.requests[1].full_url, "https://example.test/login")

    def test_smoke_rejects_release_drift(self):
        opener = SequenceOpener(self.successful_responses("2" * 40))
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            production_smoke.check_production(
                base_url="https://example.test",
                health_token="health-secret",
                expected_release_sha="3" * 40,
                opener=opener,
            )

    def test_smoke_rejects_missing_security_header(self):
        release_sha = "4" * 40
        responses = self.successful_responses(release_sha)
        responses[1].headers.pop("X-Content-Type-Options")
        with self.assertRaisesRegex(RuntimeError, "X-Content-Type-Options"):
            production_smoke.check_production(
                base_url="https://example.test",
                health_token="health-secret",
                expected_release_sha=release_sha,
                opener=SequenceOpener(responses),
            )

    def test_retry_recovers_from_transient_failure(self):
        release_sha = "5" * 40
        attempts = {"count": 0}
        sleeps: list[float] = []

        def opener(request: Request, timeout: float):
            if request.full_url.endswith("/healthz"):
                attempts["count"] += 1
                if attempts["count"] == 1:
                    raise OSError("temporary network failure")
                return self.successful_responses(release_sha)[0]
            return self.successful_responses(release_sha)[1]

        result = production_smoke.check_with_retries(
            base_url="https://example.test",
            health_token="health-secret",
            expected_release_sha=release_sha,
            attempts=2,
            delay_seconds=0.25,
            opener=opener,
            sleeper=sleeps.append,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(sleeps, [0.25])


class Phase9SourceContracts(unittest.TestCase):
    def test_production_smoke_workflow_is_pinned_and_scheduled(self):
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        workflow = (root / ".github" / "workflows" / "production-smoke.yml").read_text()
        self.assertIn("schedule:", workflow)
        self.assertIn("17 */6 * * *", workflow)
        self.assertIn(
            "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
            workflow,
        )
        self.assertIn(
            "actions/setup-python@83679a892e2d95755f2dac6acb0bfd1e9ac5d548",
            workflow,
        )
        self.assertIn("python tools/production_smoke.py", workflow)

    def test_wsgi_installs_request_observability_after_runtime_boundaries(self):
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        source = (root / "wsgi.py").read_text()
        self.assertIn("install_request_observability", source)
        self.assertLess(
            source.index("notifications_module.install_final_notifications"),
            source.index("install_request_observability("),
        )


if __name__ == "__main__":
    unittest.main()
