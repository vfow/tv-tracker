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

    def test_durable_queue_runs_silently(self):
        db_js = (ROOT / "static/js/db.js").read_text(encoding="utf-8")
        self.assertIn("tv-tracker-pending-saves:v1", db_js)
        self.assertIn("replayPendingSaveOperations", db_js)
        self.assertIn("removePendingSaveOperation(operation.id)", db_js)
        pending_store_js = (ROOT / "static/js/pending-save-store.js").read_text(encoding="utf-8")
        foundation_css = (ROOT / "static/css/foundation.css").read_text(encoding="utf-8")
        self.assertNotIn("pendingSaveStatusText", pending_store_js)
        self.assertNotIn("tv-unsaved-status", foundation_css)
        self.assertNotIn("Changes are unsaved. Retrying automatically.", db_js)
        self.assertNotIn("Sync is temporarily unavailable. Retrying automatically.", db_js)
        self.assertNotIn('showToast("Sync restored")', db_js)
        self.assertIn('indicator.remove()', db_js)

    def test_reduced_motion_and_strict_dates_are_wired(self):
        ui_js = (ROOT / "static/js/ui.js").read_text(encoding="utf-8")
        app_js = (ROOT / "static/js/app.js").read_text(encoding="utf-8")
        self.assertIn("prefersReducedMotion", ui_js)
        self.assertIn("parseStrictLocalDate", app_js)
        self.assertIn("makeDateOnlyEpisodeReleaseDate", app_js)

    def test_watchlist_status_controls_match_original_style(self):
        ui_js = (ROOT / "static/js/ui.js").read_text(encoding="utf-8")
        foundation_css = (ROOT / "static/css/foundation.css").read_text(encoding="utf-8")
        index_html = (ROOT / "templates/index.html").read_text(encoding="utf-8")
        self.assertNotIn("getWatchlistActionIcon", ui_js)
        self.assertNotIn("watchlist-complete-mark", ui_js)
        self.assertNotIn("watchlist-complete-mark", foundation_css)
        self.assertIn('<span class="completed-label">✓ Completed</span>', ui_js)
        self.assertIn('action:"watching"', ui_js)
        self.assertIn("1.3.1-audit-watchlist-status", index_html)

    def test_schedule_calendar_date_cannot_shift_backward(self):
        app_js = (ROOT / "static/js/app.js").read_text(encoding="utf-8")
        index_html = (ROOT / "templates/index.html").read_text(encoding="utf-8")
        self.assertIn("chooseEpisodeCalendarDate", app_js)
        self.assertIn("isTimestampOnCalendarDate", app_js)
        self.assertIn("official episode air_date as the canonical calendar day", app_js)
        self.assertIn("1.3.1-audit-schedule-date", index_html)


if __name__ == "__main__":
    unittest.main()
