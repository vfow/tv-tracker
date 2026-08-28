from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "static" / "js" / "ui.js"


def _search_navigation_owner(source: str) -> str:
    start_marker = "// --TVT-search-navigation-owner-begin--"
    end_marker = "// --TVT-search-navigation-owner-end--"
    start = source.index(start_marker)
    end = source.index(end_marker, start) + len(end_marker)
    return source[start:end]


def test_ui_history_fallback_is_single_and_scoped_to_search_navigation_owner():
    """Keep ui.js's final History API debt isolated until its removal slice lands."""
    ui_source = UI.read_text(encoding="utf-8")
    owner_source = _search_navigation_owner(ui_source)

    assert ui_source.count("window.history.replaceState") == 1
    assert "window.history.replaceState" in owner_source
    assert "window.history.pushState" not in ui_source


def test_ui_history_fallback_remains_secondary_to_canonical_router():
    """The known temporary fallback must never outrank the canonical router."""
    owner_source = _search_navigation_owner(UI.read_text(encoding="utf-8"))

    canonical = owner_source.index("window.TVTrackerRouter.setPathRoute(route,true)")
    fallback = owner_source.index("window.history.replaceState")

    assert canonical < fallback
    assert "else if(window.history" in owner_source
