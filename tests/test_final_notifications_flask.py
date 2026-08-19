from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from flask import Flask, jsonify

from tvtracker.notifications import push_and_movies as final
from tvtracker.notifications import runtime as runtime


class RecordingCursor:
    def __init__(self):
        self.calls: list[tuple[str, object]] = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        self.calls.append((str(query), params))
        self.rowcount = 0

    def fetchone(self):
        return None

    def fetchall(self):
        return []


class RecordingConnection:
    def __init__(self, cursor: RecordingCursor):
        self.cursor_instance = cursor
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


class RecordingFactory:
    def __init__(self):
        self.cursors: list[RecordingCursor] = []
        self.connections: list[RecordingConnection] = []

    def __call__(self):
        cursor = RecordingCursor()
        connection = RecordingConnection(cursor)
        self.cursors.append(cursor)
        self.connections.append(connection)
        return connection

    @property
    def queries(self) -> list[str]:
        return [query for cursor in self.cursors for query, _ in cursor.calls]


class FinalNotificationFlaskIntegrationTests(unittest.TestCase):
    def build_app(self) -> Flask:
        app = Flask(__name__)
        app.config.update(TESTING=True, SECRET_KEY="test-secret")

        @app.post("/logout", endpoint="logout")
        def logout():
            return jsonify({"ok": True})

        @app.post("/api/admin/account", endpoint="update_admin_account")
        def update_admin_account():
            return jsonify({"ok": True, "reauthenticate": True})

        @app.get("/api/notifications", endpoint="notifications_api")
        def notifications_api_original():
            return jsonify({"legacy": True})

        @app.get("/api/notifications/settings", endpoint="notification_settings_api")
        def notification_settings_original():
            return jsonify({"legacy": True})

        @app.patch("/api/notifications/settings", endpoint="notification_settings_patch_api")
        def notification_settings_patch_original():
            return jsonify({"legacy": True})

        def login_required(view):
            return view

        def check_csrf():
            return None

        with patch.object(final, "ensure_final_schema"):
            final.install_final_notifications(
                app,
                login_required=login_required,
                check_csrf=check_csrf,
                connection_factory=RecordingFactory(),
                tmdb_fetcher=Mock(),
            )
        return app

    def test_installed_service_worker_route_is_push_only_and_uncached(self):
        app = self.build_app()
        response = app.test_client().get("/service-worker.js")
        self.assertEqual(response.status_code, 200)
        source = response.get_data(as_text=True)
        self.assertIn('addEventListener("push"', source)
        self.assertIn('addEventListener("notificationclick"', source)
        self.assertIn("showNotification", source)
        self.assertNotIn('addEventListener("fetch"', source)
        self.assertEqual(response.headers.get("Service-Worker-Allowed"), "/")
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))

    def test_installed_notifications_routes_are_not_overwritten(self):
        app = self.build_app()
        response = app.test_client().get("/api/notifications")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"legacy": True})
        settings = app.test_client().get("/api/notifications/settings")
        self.assertEqual(settings.status_code, 200)
        self.assertEqual(settings.get_json(), {"legacy": True})

    def test_installed_push_subscribe_route_sets_device_cookie(self):
        app = self.build_app()
        payload = {
            "deviceId": "device-12345678",
            "subscription": {
                "endpoint": "https://push.example.test/subscription",
                "keys": {"p256dh": "key", "auth": "auth"},
            },
        }
        with patch.object(final, "subscribe_device") as subscribe:
            response = app.test_client().post("/api/push/subscribe", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["subscribed"])
        subscribe.assert_called_once()
        cookie = response.headers.get("Set-Cookie", "")
        self.assertIn(final.PUSH_DEVICE_COOKIE + "=device-12345678", cookie)
        self.assertIn("HttpOnly", cookie)

    def test_installed_push_presence_route_calls_device_presence(self):
        app = self.build_app()
        payload = {
            "deviceId": "device-12345678",
            "clientId": "tab-12345678",
            "visible": True,
        }
        with patch.object(final, "update_device_presence", return_value=True) as update:
            response = app.test_client().post("/api/push/presence", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["active"])
        update.assert_called_once()

    def test_logout_cleanup_failure_never_breaks_logout(self):
        app = self.build_app()
        client = app.test_client()
        client.set_cookie(final.PUSH_DEVICE_COOKIE, "device-12345678")
        with patch.object(final, "unsubscribe_device", side_effect=RuntimeError("db down")):
            response = client.post("/logout")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        self.assertIn(final.PUSH_DEVICE_COOKIE + "=;", response.headers.get("Set-Cookie", ""))

    def test_account_cleanup_failure_never_breaks_account_update(self):
        app = self.build_app()
        with patch.object(final, "unsubscribe_all_devices", side_effect=RuntimeError("db down")):
            response = app.test_client().post("/api/admin/account")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["reauthenticate"])

    def test_no_region_clears_movie_baselines_before_returning(self):
        factory = RecordingFactory()
        with patch.object(final, "ensure_final_schema"), patch.object(
            final,
            "_read_tracker_movies_and_region",
            return_value=({"123": {"plan": True}}, ""),
        ):
            result = final.run_movie_notification_check(factory, Mock())
        self.assertEqual(result["status"], "needs_region")
        self.assertTrue(any("DELETE FROM tv_tracker_movie_notification_baseline" in query for query in factory.queries))
        self.assertEqual(sum(connection.commits for connection in factory.connections), 1)

    def test_push_preflight_handles_active_retries_and_exhausted_stale_sends(self):
        factory = RecordingFactory()
        with patch.object(final, "ensure_final_schema"):
            final._prepare_push_outbox_state(factory)
        sql = "\n".join(factory.queries)
        self.assertIn("d.status IN ('pending', 'retry')", sql)
        self.assertIn("p.visible = TRUE", sql)
        self.assertIn("status = 'suppressed'", sql)
        self.assertIn("attempts >= %s", sql)
        self.assertIn("status = 'failed'", sql)
        self.assertIn("s.session_version <> a.session_version", sql)

    def test_direct_schema_preparation_uses_canonical_migration_runner(self):
        factory = RecordingFactory()
        original_prepared = final._SCHEMA_PREPARED
        final._SCHEMA_PREPARED = False
        try:
            with patch.object(final, "run_migrations") as run_migrations:
                final.ensure_final_schema(factory)
                final.ensure_final_schema(factory)
            run_migrations.assert_called_once_with(factory, final.MIGRATIONS)
            self.assertEqual(factory.connections, [])
        finally:
            final._SCHEMA_PREPARED = original_prepared

    def test_runtime_preparation_runs_schema_once_without_patching(self):
        factory = RecordingFactory()
        original_ensure = final.ensure_final_schema
        original_prepared = final._SCHEMA_PREPARED
        final._SCHEMA_PREPARED = False
        try:
            with patch.object(final, "run_migrations") as run_migrations:
                runtime.prepare_final_notification_runtime(factory)
                runtime.prepare_final_notification_runtime(factory)
                runtime.prepare_final_notification_runtime(factory)
            run_migrations.assert_called_once_with(factory, final.MIGRATIONS)
            self.assertIs(final.ensure_final_schema, original_ensure)
            self.assertTrue(runtime.runtime_is_prepared())
        finally:
            final.ensure_final_schema = original_ensure
            final._SCHEMA_PREPARED = original_prepared

    def test_hardened_worker_orders_persistence_preflight_and_delivery(self):
        order: list[str] = []
        core_result = {"ok": True, "created": 2}
        movie_result = {"ok": True, "created": 1}
        push_result = {"configured": True, "delivered": 1, "failed": 0, "dead": 0}

        def core_runner(_now):
            order.append("core")
            return core_result

        def movie_runner(*_args, **_kwargs):
            order.append("movies")
            return movie_result

        def changed(*_args, **_kwargs):
            order.append("changed")
            return [{"id": 1, "eventKey": "event-1"}]

        def enqueue(*_args, **_kwargs):
            order.append("enqueue")
            return 1

        def preflight(*_args, **_kwargs):
            order.append("preflight")

        def deliver(*_args, **_kwargs):
            order.append("deliver")
            return push_result

        with patch.object(runtime, "prepare_final_notification_runtime"), \
             patch.object(final, "ensure_final_schema"), \
             patch.object(final, "_notification_versions", return_value={}), \
             patch.object(final, "run_movie_notification_check", side_effect=movie_runner), \
             patch.object(final, "_changed_notifications", side_effect=changed), \
             patch.object(final, "enqueue_push_deliveries", side_effect=enqueue), \
             patch.object(final, "_prepare_push_outbox_state", side_effect=preflight), \
             patch.object(final, "deliver_push_outbox", side_effect=deliver):
            result = runtime.run_final_notification_worker_hardened(
                RecordingFactory(),
                Mock(),
                core_runner,
            )

        self.assertEqual(order, ["core", "movies", "changed", "enqueue", "preflight", "deliver"])
        self.assertEqual(result["core"], core_result)
        self.assertEqual(result["movies"], movie_result)
        self.assertEqual(result["push"]["queued"], 1)
        self.assertEqual(result["push"]["delivered"], 1)


if __name__ == "__main__":
    unittest.main()
