from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "templates" / "index.html"
UI = ROOT / "static" / "js" / "ui.js"


def _script_position(source: str, filename: str) -> int:
    marker = f"filename='js/{filename}'"
    position = source.find(marker)
    if position < 0:
        raise AssertionError(f"missing script tag for {filename}")
    return position


class RoutingUiReadinessTests(unittest.TestCase):
    def test_ui_route_delegation_is_ready_before_startup_activation(self):
        index_source = INDEX.read_text(encoding="utf-8")
        ui_source = UI.read_text(encoding="utf-8")

        ui_position = _script_position(index_source, "ui.js")
        app_position = _script_position(index_source, "app.js")
        router_position = _script_position(index_source, "app-router.js")
        startup_position = _script_position(index_source, "startup.js")

        self.assertLess(ui_position, app_position)
        self.assertLess(app_position, router_position)
        self.assertLess(router_position, startup_position)
        self.assertIn("window.TVTrackerRouter.setPathRoute(route,true)", ui_source)

    def test_ui_search_route_lock_uses_only_canonical_router(self):
        ui_source = UI.read_text(encoding="utf-8")
        function_start = ui_source.index("function lockSearchRouteBeforeResultOpen")
        function_end = ui_source.index("\n}\n", function_start) + 2
        function_source = ui_source[function_start:function_end]

        self.assertIn("window.TVTrackerRouter.setPathRoute(route,true)", function_source)
        self.assertNotIn("history.replaceState", function_source)
        self.assertNotIn("history.pushState", function_source)


if __name__ == "__main__":
    unittest.main()
