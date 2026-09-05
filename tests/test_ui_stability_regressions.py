from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_global_save_status_pill_is_internal_only():
    css = (ROOT / "static/css/runtime-health.css").read_text(encoding="utf-8")

    save_block = css.split(".tv-runtime-save-status {", 1)[1].split("}", 1)[0]
    assert "display: none;" in save_block

    # Actionable session/storage warnings still have their own visible surface.
    warning_block = css.split(".tv-runtime-warning {", 1)[1].split("}", 1)[0]
    assert "display: none;" not in warning_block


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
