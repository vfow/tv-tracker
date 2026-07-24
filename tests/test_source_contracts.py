from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SourceContractTests(unittest.TestCase):
    def test_obsolete_backup_post_is_removed(self):
        app_js = (ROOT / "static/js/app.js").read_text(encoding="utf-8")
        self.assertNotIn('fetch("/api/backup",{\n            method:"POST"', app_js)
        self.assertNotIn("initializeAutomaticBackupTracking", app_js)

    def test_admin_creation_and_recovery_are_conflict_safe(self):
        app_py = (ROOT / "app.py").read_text(encoding="utf-8")
        reset_py = (ROOT / "tools/reset_admin.py").read_text(encoding="utf-8")
        self.assertIn("ON CONFLICT (singleton_id) DO NOTHING", app_py)
        self.assertIn('Type RECREATE to continue', reset_py)
        self.assertIn("ON CONFLICT (singleton_id) DO UPDATE", reset_py)

    def test_durable_queue_and_unsaved_indicator_are_present(self):
        db_js = (ROOT / "static/js/db.js").read_text(encoding="utf-8")
        self.assertIn("tv-tracker-pending-saves:v1", db_js)
        self.assertIn("replayPendingSaveOperations", db_js)
        self.assertIn("removePendingSaveOperation(operation.id)", db_js)
        self.assertIn("1 unsaved change — retrying", db_js)

    def test_reduced_motion_and_strict_dates_are_wired(self):
        ui_js = (ROOT / "static/js/ui.js").read_text(encoding="utf-8")
        app_js = (ROOT / "static/js/app.js").read_text(encoding="utf-8")
        self.assertIn("prefersReducedMotion", ui_js)
        self.assertIn("parseStrictLocalDate", app_js)
        self.assertIn("makeDateOnlyEpisodeReleaseDate", app_js)


if __name__ == "__main__":
    unittest.main()
