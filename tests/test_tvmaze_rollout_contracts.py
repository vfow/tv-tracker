from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class TVmazeRolloutContractTests(unittest.TestCase):
    def read(self, path): return (ROOT / path).read_text(encoding="utf-8")

    def test_timezone_has_automatic_only_mode(self):
        backend = self.read("tvtracker/notifications/backend.py")
        ui = self.read("static/js/notifications-runtime.js")
        self.assertIn("timezone_mode", backend)
        self.assertIn("timezoneMode", backend)
        # Automatic-only product decision: the browser syncs its own timezone
        # automatically, and the manual timezone select was removed.
        self.assertIn("syncAutomaticTimezone", ui)
        self.assertIn('body:{timezone,timezoneMode:"automatic"}', ui)
        self.assertNotIn('value="automatic"', ui)
        self.assertNotIn('value="manual"', ui)
        self.assertIn("visibilitychange", ui)

    def test_provider_prefetch_is_bounded_and_background_only(self):
        runtime = self.read("static/js/release-timing.js")
        self.assertIn("14 * 86400000", runtime)
        self.assertIn("366 * 86400000", runtime)
        self.assertNotIn("Release timing data by", runtime)
        self.assertFalse((ROOT / "static/css/release-timing.css").exists())

    def test_provider_database_errors_are_fallback_errors(self):
        resolver = self.read("tvtracker/release_timing/service.py")
        provider = self.read("tvtracker/integrations/tvmaze.py")
        self.assertIn("psycopg.Error", resolver)
        self.assertIn("Jsonb(raw)", provider)

if __name__ == "__main__": unittest.main()
