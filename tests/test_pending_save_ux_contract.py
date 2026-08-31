from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pending_save_recovery_stays_silent_and_intact():
    startup = (ROOT / "static/js/startup.js").read_text(encoding="utf-8")
    db = (ROOT / "static/js/db.js").read_text(encoding="utf-8")
    fallback = (ROOT / "static/js/save-storage-fallback.js").read_text(encoding="utf-8")
    runtime = "\n".join((startup, db, fallback))

    forbidden_notices = (
        "TV Tracker cannot protect unsaved changes in browser storage. Keep this tab open until saving succeeds.",
        "Changes are waiting to sync. TV Tracker will retry automatically; keep this tab open.",
    )
    for notice in forbidden_notices:
        assert notice not in runtime

    assert '"Saving changes…"' not in startup
    assert "PENDING_SAVE_FEEDBACK_KEY" not in startup
    assert "PENDING_SAVE_STORAGE_FEEDBACK_KEY" not in startup
    assert "installPendingSaveFeedback" not in startup
    assert "syncPendingSaveFeedback" not in startup
    assert "global.updateUnsavedStateIndicator = wrapped;" not in startup

    # A stale/cached legacy status node is removed at startup without changing the
    # durable queue/retry behavior that remains owned by db.js.
    assert 'getElementById("tv-unsaved-status")' in startup
    assert "indicator.remove();" in startup
    assert 'return "Could not reach the server. Check your connection.";' in startup

    # The durable retry/storage machinery remains owned by db.js; this change only
    # removes the persistent user-facing diagnostic layer around it.
    assert 'let PENDING_SAVE_OPERATIONS = [];' in db
    assert 'let PENDING_SAVE_FAILURES = 0;' in db
    assert 'let PENDING_SAVE_STORAGE_ERROR = null;' in db
    assert 'updateUnsavedStateIndicator();' in db
    assert "processPendingSaveQueue();" in fallback or "persistPendingSaveQueue" in fallback
