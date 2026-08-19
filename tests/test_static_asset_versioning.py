import hashlib
import tempfile
import unittest
from pathlib import Path

from tvtracker.infrastructure.static_assets import static_asset_version


class StaticAssetVersionTests(unittest.TestCase):
    def test_version_is_sha256_of_file_contents_and_changes_with_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asset = root / "asset.js"
            asset.write_bytes(b"first")
            first = static_asset_version(str(root), "asset.js")
            self.assertEqual(first, hashlib.sha256(b"first").hexdigest()[:12])

            # Change both content and size so the stat-backed cache invalidates.
            asset.write_bytes(b"second-content")
            second = static_asset_version(str(root), "asset.js")
            self.assertEqual(second, hashlib.sha256(b"second-content").hexdigest()[:12])
            self.assertNotEqual(first, second)

    def test_version_rejects_paths_outside_static_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "static"
            root.mkdir()
            outside = Path(directory) / "outside.js"
            outside.write_text("nope", encoding="utf-8")
            with self.assertRaises(ValueError):
                static_asset_version(str(root), "../outside.js")


if __name__ == "__main__":
    unittest.main()
