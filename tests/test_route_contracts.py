from pathlib import Path
import ast
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_route_helpers():
    source = (ROOT / "app.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    wanted_names = {
        "APP_SHOW_PATH_RE",
        "APP_EPISODE_PATH_RE",
        "APP_GENRE_PATH_RE",
        "APP_SECTION_PATHS",
    }
    selected = []

    for node in tree.body:
        if isinstance(node, ast.Assign):
            names = {
                target.id
                for target in node.targets
                if isinstance(target, ast.Name)
            }
            if names & wanted_names:
                selected.append(node)
        elif isinstance(node, ast.FunctionDef) and node.name in {
            "safe_next_url",
            "valid_app_path",
        }:
            selected.append(node)

    namespace = {"re": re}
    module = ast.Module(body=selected, type_ignores=[])
    exec(compile(module, str(ROOT / "app.py"), "exec"), namespace)
    return namespace["safe_next_url"], namespace["valid_app_path"]


safe_next_url, valid_app_path = load_route_helpers()


class ProtectedRouteContractTests(unittest.TestCase):
    def test_sections_are_allowed(self):
        for path in (
            "/app/watchlist",
            "/app/upcoming",
            "/app/history",
            "/app/discover",
            "/app/profile",
            "/app/settings",
        ):
            self.assertTrue(valid_app_path(path))
            self.assertEqual(safe_next_url(path), path)

    def test_show_episode_and_genre_paths_are_allowed(self):
        self.assertTrue(valid_app_path("/app/show/1399"))
        self.assertTrue(valid_app_path("/app/show/1399/season/0/episode/1"))
        self.assertTrue(valid_app_path("/app/genre/action-adventure"))
        self.assertEqual(
            safe_next_url("/app/show/1399/season/1/episode/3"),
            "/app/show/1399/season/1/episode/3",
        )
        self.assertEqual(
            safe_next_url("/app/genre/action-adventure"),
            "/app/genre/action-adventure",
        )

    def test_sensitive_or_external_destinations_are_rejected(self):
        for value in (
            "https://example.com/app/watchlist",
            "//example.com/app/watchlist",
            "/api/state",
            "/app/private/notes",
            "/app/show/not-a-number",
            "/app/genre/",
            "/app/genre/action--adventure",
            "/app/show/1399?status=watching",
        ):
            expected = (
                "/app/show/1399"
                if value == "/app/show/1399?status=watching"
                else "/app/watchlist"
            )
            self.assertEqual(safe_next_url(value), expected)

    def test_app_root_normalizes_to_watchlist(self):
        self.assertEqual(safe_next_url("/app"), "/app/watchlist")
        self.assertEqual(safe_next_url("/app/"), "/app/watchlist")

    def test_trailing_app_destinations_normalize(self):
        self.assertEqual(safe_next_url("/app/watchlist/"), "/app/watchlist")
        self.assertEqual(safe_next_url("/app/show/1399/"), "/app/show/1399")
        self.assertEqual(
            safe_next_url("/app/show/1399/season/1/episode/3/"),
            "/app/show/1399/season/1/episode/3",
        )
        self.assertEqual(safe_next_url("/app/genre/action-adventure/"), "/app/genre/action-adventure")


if __name__ == "__main__":
    unittest.main()
