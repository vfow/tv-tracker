from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "static" / "js" / "ui.js"


def _search_navigation_owner(source: str) -> str:
    start_marker = "// --TVT-search-navigation-owner-begin--"
    end_marker = "// --TVT-search-navigation-owner-end--"
    start = source.index(start_marker)
    end = source.index(end_marker, start) + len(end_marker)
    return source[start:end]


class RoutingUiFallbackScopeTests(unittest.TestCase):
    def test_ui_search_navigation_delegates_only_to_canonical_router(self):
        ui_source = UI.read_text(encoding="utf-8")
        owner_source = _search_navigation_owner(ui_source)

        self.assertIn("window.TVTrackerRouter.setPathRoute(route,true)", owner_source)
        self.assertNotIn("window.history.replaceState", ui_source)
        self.assertNotIn("window.history.pushState", ui_source)

    def test_ui_search_navigation_has_no_legacy_history_fallback(self):
        owner_source = _search_navigation_owner(UI.read_text(encoding="utf-8"))

        self.assertNotIn("else if(window.history", owner_source)
        self.assertNotIn("history.replaceState", owner_source)
        self.assertNotIn("history.pushState", owner_source)


if __name__ == "__main__":
    unittest.main()
