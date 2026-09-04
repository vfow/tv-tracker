from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_routine_state_saves_do_not_flash_global_status_pill():
    css = (ROOT / "static/css/runtime-health.css").read_text(encoding="utf-8")

    assert '.tv-runtime-save-status[data-state="saving"],' in css
    assert '.tv-runtime-save-status[data-state="saved"] {' in css
    assert "display: none;" in css

    # Actionable states must still be available to the user.
    assert '.tv-runtime-save-status[data-state="warning"]' in css
    assert '.tv-runtime-save-status[data-state="error"]' in css


def test_tracker_rows_are_painted_during_scroll():
    css = (ROOT / "static/css/runtime-health.css").read_text(encoding="utf-8")
    template = (ROOT / "templates/index.html").read_text(encoding="utf-8")

    for selector in (
        "#show-list .watchlist-card",
        "#show-list .history-entry-card",
        "#show-list .upcoming-show",
        "#show-list .upcoming-row",
    ):
        assert selector in css

    assert "content-visibility: visible;" in css
    assert "contain-intrinsic-size: none;" in css

    # The stability override must win over tailwind.css, where the original
    # content-visibility:auto optimization is generated.
    tailwind = "filename='css/tailwind.css'"
    runtime = "filename='css/runtime-health.css'"
    assert tailwind in template
    assert runtime in template
    assert template.index(tailwind) < template.index(runtime)
