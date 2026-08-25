from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_source(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class Phase16NotificationConsolidationTests(unittest.TestCase):
    def setUp(self):
        self.app = read_source("app.py")
        self.wsgi = read_source("wsgi.py")
        self.worker = read_source("notification_worker.py")
        self.settings_module = read_source("tvtracker/notifications/backend.py")
        self.engine = read_source("tvtracker/notifications/engine.py")
        self.canonical = read_source("tvtracker/notifications/push_and_movies.py")
        self.runtime = read_source("tvtracker/notifications/runtime.py")
        self.validation = read_source("tvtracker/notifications/push_validation.py")
        self.registry = read_source("tvtracker/migrations/registry.py")
        self.versions = read_source("tvtracker/migrations/versions.py")

    def test_single_canonical_settings_table_in_use(self):
        for source in (
            self.settings_module,
            self.canonical,
            self.runtime,
            self.validation,
            self.engine,
            self.app,
            self.wsgi,
            self.worker,
        ):
            self.assertNotIn(
                "tv_tracker_final_notification_settings",
                source,
                "application code must not read the retired settings table",
            )
        self.assertIn(
            "FROM tv_tracker_notification_settings WHERE singleton_id = 1",
            self.settings_module,
        )
        self.assertIn('"movieReleased": "movie_released"', self.settings_module)
        self.assertIn('"movieReleaseUpdates": "movie_release_updates"', self.settings_module)
        self.assertIn('    "movie_released",', self.settings_module)
        self.assertIn('    "movie_release_updates",', self.settings_module)

    def test_migration_0006_moves_movie_settings(self):
        self.assertIn("0006_notification_settings_consolidation", self.registry)
        self.assertIn(
            "ADD COLUMN IF NOT EXISTS movie_released BOOLEAN NOT NULL DEFAULT TRUE",
            self.registry,
        )
        self.assertIn(
            "ADD COLUMN IF NOT EXISTS movie_release_updates BOOLEAN NOT NULL DEFAULT TRUE",
            self.registry,
        )
        self.assertIn(
            "FROM tv_tracker_final_notification_settings AS final_settings",
            self.registry,
        )
        self.assertIn("DATABASE_SCHEMA_VERSION = 6", self.versions)

    def test_no_runtime_monkey_patching_between_notification_modules(self):
        for forbidden in (
            "unittest.mock",
            "patch(",
            "setattr",
            "view_functions",
            "_ORIGINAL_",
            "_schema_already_prepared",
            "final.ensure_final_schema =",
        ):
            self.assertNotIn(forbidden, self.runtime)
        self.assertIn(
            "final.ensure_final_schema(connection_factory)",
            self.runtime,
        )
        self.assertIn(
            "final.run_final_notification_worker(",
            self.runtime,
        )
        self.assertEqual(
            self.runtime.count("run_final_notification_worker_hardened"),
            1,
        )

    def test_removed_shims_are_gone_from_canonical_owner(self):
        for removed in (
            "serialize_combined_settings",
            "update_combined_settings",
            "list_notifications_final",
            "read_final_settings",
            "FINAL_SETTING_MAP",
            "harden_push_config",
            "tv_tracker_final_notification_settings",
        ):
            self.assertNotIn(removed, self.canonical)

    def test_single_endpoint_registration_per_route(self):
        self.routes = read_source("tvtracker/web/routes.py")
        combined = self.routes + self.canonical
        app_owned = (
            '@app.get("/api/notifications/status")',
            '@app.get("/api/notifications")',
            '@app.post("/api/notifications/read-all")',
            '@app.post("/api/notifications/<int:notification_id>/read")',
            '@app.delete("/api/notifications/<int:notification_id>")',
            '@app.get("/api/notifications/settings")',
            '@app.patch("/api/notifications/settings")',
        )
        canonical_owned = (
            '@app.get("/api/push/config")',
            '@app.get("/api/push/device")',
            '@app.post("/api/push/subscribe")',
            '@app.post("/api/push/unsubscribe")',
            '@app.post("/api/push/presence")',
        )
        for decorator in app_owned:
            self.assertEqual(combined.count(decorator), 1, decorator)
            self.assertEqual(self.routes.count(decorator), 1, decorator)
            self.assertNotIn(decorator, self.canonical)
        for decorator in canonical_owned:
            self.assertEqual(combined.count(decorator), 1, decorator)
            self.assertEqual(self.canonical.count(decorator), 1, decorator)
            self.assertNotIn(decorator, self.routes)

    def test_installer_never_overwrites_notification_endpoints(self):
        for endpoint in (
            "notification_settings_api",
            "notification_settings_patch_api",
            "notifications_api",
            "push_config_api",
            "push_device_api",
            "push_subscribe_api",
            "push_unsubscribe_api",
            "push_presence_api",
        ):
            self.assertNotIn(
                f'app.view_functions["{endpoint}"] =',
                self.canonical,
            )
        self.assertIn('app.view_functions["logout"]', self.canonical)
        self.assertIn('app.view_functions["update_admin_account"]', self.canonical)

    def test_movies_and_tv_flow_through_same_canonical_runner(self):
        self.assertIn("def run_final_notification_worker", self.canonical)
        self.assertIn(
            "movie_result = run_movie_notification_check(connection_factory, tmdb_fetcher, now)",
            self.canonical,
        )
        self.assertIn("core_result = core_runner(now)", self.canonical)
        self.assertIn(
            "return final.run_final_notification_worker(",
            self.runtime,
        )

    def test_notification_persists_before_push_delivery(self):
        ordered = (
            "before = _notification_versions(connection_factory)",
            "core_result = core_runner(now)",
            "movie_result = run_movie_notification_check(connection_factory, tmdb_fetcher, now)",
            "changed = _changed_notifications(connection_factory, before)",
            "queued = enqueue_push_deliveries(connection_factory, changed)",
            "_prepare_push_outbox_state(connection_factory)",
            "push_result = deliver_push_outbox(connection_factory, now)",
        )
        positions = [self.canonical.index(needle) for needle in ordered]
        self.assertEqual(positions, sorted(positions))

    def test_push_is_optional(self):
        self.assertIn('if not config["configured"]:', self.canonical)
        self.assertIn(
            'return {"configured": False, "delivered": 0, "failed": 0, "dead": 0}',
            self.canonical,
        )
        self.assertIn("from pywebpush import WebPushException, webpush", self.canonical)
        self.assertIn("except ImportError:", self.canonical)
        self.assertIn('find_spec("pywebpush")', self.canonical)

    def test_wsgi_installs_polish_then_final_once(self):
        self.assertIn("prepare_final_notification_runtime(database_connection)", self.wsgi)
        self.assertIn("install_notification_polish(app, notifications_module)", self.wsgi)
        self.assertIn("notifications_module.install_final_notifications(", self.wsgi)
        self.assertEqual(self.wsgi.count("install_final_notifications("), 1)
        self.assertIn("run_final_notification_worker_hardened", self.worker)


if __name__ == "__main__":
    unittest.main()