from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pending_save_recovery_stays_silent_and_intact():
    startup = (ROOT / "static/js/startup.js").read_text(encoding="utf-8")
    db = (ROOT / "static/js/db.js").read_text(encoding="utf-8")

    assert "cannot protect unsaved changes" not in startup
    assert "Changes are waiting to sync" not in startup
    assert '"Saving changes…"' not in startup
    assert "PENDING_SAVE_FEEDBACK_KEY" not in startup
    assert "PENDING_SAVE_STORAGE_FEEDBACK_KEY" not in startup
    assert "installPendingSaveFeedback" not in startup
    assert "syncPendingSaveFeedback" not in startup
    assert "global.updateUnsavedStateIndicator = wrapped;" not in startup

    # The durable retry/storage machinery remains owned by db.js; this change only
    # removes the persistent user-facing diagnostic layer that wrapped it at startup.
    assert 'let PENDING_SAVE_OPERATIONS = [];' in db
    assert 'let PENDING_SAVE_FAILURES = 0;' in db
    assert 'let PENDING_SAVE_STORAGE_ERROR = null;' in db
    assert 'updateUnsavedStateIndicator();' in db
