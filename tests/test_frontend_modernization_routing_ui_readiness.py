from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "templates" / "index.html"
UI = ROOT / "static" / "js" / "ui.js"


def _script_position(source: str, filename: str) -> int:
    marker = f"filename='js/{filename}'"
    position = source.find(marker)
    assert position >= 0, f"missing script tag for {filename}"
    return position


def test_ui_route_delegation_is_ready_before_startup_activation():
    """Lock the runtime prerequisite for removing ui.js's History API fallback.

    ui.js is intentionally parsed before app-router.js because the canonical router
    depends on legacy UI/app functions while the migration is in progress. User
    interactions and startup route activation happen only after app-router.js has
    installed TVTrackerRouter, so ui.js can safely delegate route writes at runtime.
    """
    index_source = INDEX.read_text(encoding="utf-8")
    ui_source = UI.read_text(encoding="utf-8")

    ui_position = _script_position(index_source, "ui.js")
    app_position = _script_position(index_source, "app.js")
    router_position = _script_position(index_source, "app-router.js")
    startup_position = _script_position(index_source, "startup.js")

    assert ui_position < app_position < router_position < startup_position
    assert "window.TVTrackerRouter" in ui_source
    assert "window.TVTrackerRouter.setPathRoute(route,true)" in ui_source


def test_ui_search_route_lock_prefers_canonical_router():
    ui_source = UI.read_text(encoding="utf-8")
    function_start = ui_source.index("function lockSearchRouteBeforeResultOpen")
    function_end = ui_source.index("\n}\n", function_start) + 2
    function_source = ui_source[function_start:function_end]

    canonical_call = function_source.index("window.TVTrackerRouter.setPathRoute(route,true)")
    legacy_fallback = function_source.index("window.history.replaceState")

    assert canonical_call < legacy_fallback
