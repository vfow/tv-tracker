from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_unnamed_product_does_not_expose_placeholder_branding():
    index = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    login = (ROOT / "templates/login.html").read_text(encoding="utf-8")
    error = (ROOT / "templates/error.html").read_text(encoding="utf-8")
    ui = (ROOT / "static/js/ui.js").read_text(encoding="utf-8")
    auth_settings = (ROOT / "frontend/src/settings/SettingsAuth.vue").read_text(encoding="utf-8")

    assert "<title>TV Tracker</title>" not in index
    assert "TV Tracker — Access" not in login
    assert ">TV TRACKER</h1>" not in login
    assert " - TV Tracker</title>" not in error
    assert " — TV Tracker`" not in ui
    assert 'label || "TV Tracker"' not in ui
    assert "Sign out of this TV Tracker session." not in auth_settings

    assert "<title>Library</title>" in index
    assert "<title>Sign in</title>" in login
    assert ">WELCOME</h1>" in login
    assert 'document.title = label || "Library";' in ui
    assert "Sign out of this session." in auth_settings
