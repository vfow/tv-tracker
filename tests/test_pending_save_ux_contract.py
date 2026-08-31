from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pending_save_feedback_is_wired_into_startup():
    startup = (ROOT / "static/js/startup.js").read_text(encoding="utf-8")
    db = (ROOT / "static/js/db.js").read_text(encoding="utf-8")

    assert 'key:PENDING_SAVE_FEEDBACK_KEY' in startup
    assert 'key:PENDING_SAVE_STORAGE_FEEDBACK_KEY' in startup
    assert '"Saving changes…"' in startup
    assert '"Changes are waiting to sync.' in startup
    assert '"TV Tracker cannot protect unsaved changes in browser storage.' in startup
    assert 'global.updateUnsavedStateIndicator = wrapped;' in startup
    assert 'installPendingSaveFeedback();' in startup

    assert 'let PENDING_SAVE_OPERATIONS = [];' in db
    assert 'let PENDING_SAVE_FAILURES = 0;' in db
    assert 'let PENDING_SAVE_STORAGE_ERROR = null;' in db
    assert 'updateUnsavedStateIndicator();' in db
