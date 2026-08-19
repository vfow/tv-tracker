from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class T(unittest.TestCase):
 def test_removed(self):
  for p in ["final_notifications.py","final_notifications_runtime.py","notification_polish_runtime.py","notification_engine.py","notifications_backend.py","release_timing.py","release_timing_routes.py","tvmaze_integration.py","static_asset_versioning.py","static/js/notifications-final.js","static/js/notifications-polish.js","static/js/discover-stability.js","static/js/search-navigation-fix.js","static/js/duplicate-show-integrity.js","static/js/show-removal-integrity.js"]:self.assertFalse((ROOT/p).exists(),p)
