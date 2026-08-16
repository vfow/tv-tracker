from __future__ import annotations

import sys
import unittest
from contextlib import ExitStack
from unittest.mock import Mock, patch

import final_notifications as final


class FakeCursor:
    def __init__(self):
        self.calls = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        self.calls.append((query, params))
        self.rowcount = 0

    def fetchall(self):
        return []

    def fetchone(self):
        return None


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor()
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


class FinalNotificationDestructionTests(unittest.TestCase):
    def test_missing_streaming_region_stops_before_tmdb_fetch(self):
        fetcher = Mock()
        with patch.object(final, "ensure_final_schema"), patch.object(
            final,
            "_read_tracker_movies_and_region",
            return_value=({"123": {"plan": True}}, ""),
        ):
            result = final.run_movie_notification_check(lambda: FakeConnection(), fetcher)
        self.assertEqual(result["status"], "needs_region")
        self.assertEqual(result["created"], 0)
        fetcher.assert_not_called()

    def test_tmdb_failure_does_not_invent_movie_notification(self):
        connection = FakeConnection()
        fetcher = Mock(side_effect=RuntimeError("TMDB unavailable"))
        with ExitStack() as stack:
            stack.enter_context(patch.object(final, "ensure_final_schema"))
            stack.enter_context(patch.object(
                final,
                "_read_tracker_movies_and_region",
                return_value=({"123": {"plan": True, "title": "Test Movie"}}, "MY"),
            ))
            stack.enter_context(patch.object(final, "_read_movie_baselines", return_value={}))
            stack.enter_context(patch.object(
                final,
                "read_notification_settings",
                return_value={"enabled": True, "timezone": "Asia/Kuala_Lumpur"},
            ))
            stack.enter_context(patch.object(
                final,
                "read_final_settings",
                return_value={"movie_released": True, "movie_release_updates": True},
            ))
            result = final.run_movie_notification_check(lambda: connection, fetcher)
        self.assertEqual(result["created"], 0)
        self.assertEqual(result["fetchFailures"], 1)
        self.assertEqual(result["checked"], 1)

    def test_missing_push_dependency_is_nonfatal(self):
        with ExitStack() as stack:
            stack.enter_context(patch.object(final, "ensure_final_schema"))
            stack.enter_context(patch.object(
                final,
                "push_config",
                return_value={
                    "configured": True,
                    "publicKey": "public",
                    "privateKey": "private",
                    "subject": "mailto:test@example.com",
                },
            ))
            stack.enter_context(patch.object(final, "read_notification_settings", return_value={"enabled": True}))
            stack.enter_context(patch.dict(sys.modules, {"pywebpush": None}))
            result = final.deliver_push_outbox(lambda: FakeConnection())
        self.assertEqual(result["delivered"], 0)
        self.assertEqual(result["failed"], 0)
        self.assertFalse(result["configured"])
        self.assertIn("pywebpush", result.get("error", ""))

    def test_missing_vapid_configuration_is_nonfatal(self):
        with patch.object(final, "ensure_final_schema"), patch.object(
            final,
            "push_config",
            return_value={"configured": False, "publicKey": "", "privateKey": "", "subject": ""},
        ):
            result = final.deliver_push_outbox(lambda: FakeConnection())
        self.assertEqual(result, {"configured": False, "delivered": 0, "failed": 0, "dead": 0})

    def test_push_failure_result_does_not_replace_successful_core_results(self):
        core = {"ok": True, "status": "checked", "created": 2}
        movie = {"ok": True, "status": "checked", "created": 1}
        push = {"configured": True, "delivered": 0, "failed": 2, "dead": 0}
        with ExitStack() as stack:
            stack.enter_context(patch.object(final, "ensure_final_schema"))
            stack.enter_context(patch.object(final, "_notification_versions", return_value={}))
            stack.enter_context(patch.object(final, "run_movie_notification_check", return_value=movie))
            stack.enter_context(patch.object(final, "_changed_notifications", return_value=[{"id": 1, "eventKey": "e1"}]))
            stack.enter_context(patch.object(final, "enqueue_push_deliveries", return_value=2))
            stack.enter_context(patch.object(final, "deliver_push_outbox", return_value=push))
            result = final.run_final_notification_worker(
                lambda: FakeConnection(),
                Mock(),
                Mock(return_value=core),
            )
        self.assertEqual(result["core"], core)
        self.assertEqual(result["movies"], movie)
        self.assertEqual(result["push"]["failed"], 2)
        self.assertTrue(result["ok"])

    def test_worker_orders_persistence_before_push_delivery(self):
        order = []

        def core_runner(_now):
            order.append("core")
            return {"ok": True}

        def movie_runner(*_args, **_kwargs):
            order.append("movies")
            return {"ok": True}

        def changed(*_args, **_kwargs):
            order.append("changed")
            return []

        def enqueue(*_args, **_kwargs):
            order.append("enqueue")
            return 0

        def deliver(*_args, **_kwargs):
            order.append("deliver")
            return {"configured": False, "delivered": 0, "failed": 0, "dead": 0}

        with ExitStack() as stack:
            stack.enter_context(patch.object(final, "ensure_final_schema"))
            stack.enter_context(patch.object(final, "_notification_versions", return_value={}))
            stack.enter_context(patch.object(final, "run_movie_notification_check", side_effect=movie_runner))
            stack.enter_context(patch.object(final, "_changed_notifications", side_effect=changed))
            stack.enter_context(patch.object(final, "enqueue_push_deliveries", side_effect=enqueue))
            stack.enter_context(patch.object(final, "deliver_push_outbox", side_effect=deliver))
            final.run_final_notification_worker(lambda: FakeConnection(), Mock(), core_runner)

        self.assertEqual(order, ["core", "movies", "changed", "enqueue", "deliver"])


if __name__ == "__main__":
    unittest.main()
