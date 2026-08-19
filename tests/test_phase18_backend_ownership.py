from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class T(unittest.TestCase):
 def test_package_owners(self):
  a=(ROOT/"app.py").read_text();w=(ROOT/"wsgi.py").read_text();r=(ROOT/"tvtracker/release_timing/service.py").read_text();self.assertIn("from tvtracker.notifications.backend import (",a);self.assertIn("from tvtracker.release_timing.routes import install_release_timing_routes",a);self.assertIn('importlib.import_module("tvtracker.integrations.tvmaze")',r);self.assertIn("from tvtracker.infrastructure.static_assets import install_static_asset_versioning",w)
