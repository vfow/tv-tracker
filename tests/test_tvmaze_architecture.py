from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class TVmazeArchitectureTests(unittest.TestCase):
    def text(self, path):
        return (ROOT / path).read_text(encoding="utf-8")

    def test_provider_schema_is_not_mandatory_core_schema(self):
        app = self.text("app.py")
        ensure_start = app.index("def ensure_schema()")
        ensure_end = app.index("\ndef current_revision", ensure_start)
        ensure_body = app[ensure_start:ensure_end]
        self.assertNotIn("tv_tracker_tvmaze_", ensure_body)
        provider = self.text("tvmaze_integration.py")
        self.assertIn("tv_tracker_tvmaze_mapping", provider)
        self.assertIn("tv_tracker_tvmaze_episode_cache", provider)

    def test_provider_data_is_not_added_to_tracker_state(self):
        app_js = self.text("static/js/app.js")
        self.assertIn("function cleanLegacyMetadata", app_js)
        self.assertIn('return "tv" + "maze";', app_js)
        timing_js = self.text("static/js/release-timing.js")
        self.assertNotIn("DATA.shows[", timing_js)
        self.assertNotIn("DATA.history", timing_js)

    def test_provider_routes_do_not_replace_tmdb_identity_routes(self):
        routes = self.text("release_timing_routes.py")
        self.assertNotIn('/app/show/', routes)
        router = self.text("static/js/app-router.js")
        self.assertNotIn("tvmaze", router.lower())

    def test_provider_module_has_fixed_upstream_base(self):
        provider = self.text("tvmaze_integration.py")
        self.assertIn('TVMAZE_API_BASE = "https://api.tvmaze.com"', provider)
        self.assertNotIn("request.args", provider)
        self.assertNotIn("request.get_json", provider)

    def test_master_and_context_kill_switches_are_centralized(self):
        resolver = self.text("release_timing.py")
        routes = self.text("release_timing_routes.py")
        notifications = self.text("notifications_backend.py")
        for flag in (
            "TVMAZE_ENABLED",
            "TVMAZE_SHADOW_ENABLED",
            "TVMAZE_UPCOMING_ENABLED",
            "TVMAZE_NOTIFICATIONS_ENABLED",
        ):
            self.assertIn(flag, resolver)
        self.assertNotIn('env_flag("TVMAZE_EXACT_ENABLED")', resolver)
        self.assertNotIn('env_flag("TVMAZE_DATE_ONLY_ENABLED")', resolver)
        self.assertIn('if flags["master_enabled"] and any((', routes)
        self.assertIn('query_enabled=flags["shadow_enabled"] or flags["upcoming_enabled"]', routes)
        self.assertIn('query_enabled=flags["shadow_enabled"] or flags["notifications_enabled"]', notifications)

    def test_public_release_contract_is_provider_neutral(self):
        resolver = self.text("release_timing.py")
        runtime = self.text("static/js/release-timing.js")
        routes = self.text("release_timing_routes.py")
        for field in ("releaseAt", "releaseDate", "eligibleAt", "displayDate", "providerUsed"):
            self.assertIn(field, resolver)
        for field in ("releaseAt", "releaseDate", "eligibleAt", "displayDate"):
            self.assertIn(field, runtime)
        self.assertIn('serialized.get("providerUsed")', routes)
        self.assertNotIn('serialized.get("provider_used")', routes)

    def test_release_timing_is_loaded_before_app(self):
        template = self.text("templates/index.html")
        self.assertLess(template.index("js/release-timing.js"), template.index("js/app.js"))


if __name__ == "__main__":
    unittest.main()
