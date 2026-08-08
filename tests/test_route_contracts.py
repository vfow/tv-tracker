from pathlib import Path
import ast
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_route_helpers():
    source = (ROOT / "app.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    wanted_names = {
        "APP_ROUTE_ID_SLUG",
        "APP_EPISODE_ROUTE_ID_SLUG",
        "APP_SHOW_PATH_RE",
        "APP_EPISODE_PATH_RE",
        "APP_GENRE_PATH_RE",
        "APP_LEGACY_GENRE_PATH_RE",
        "APP_TV_GENRE_SLUGS",
        "APP_MOVIE_GENRE_SLUGS",
        "APP_LEGACY_MOVIE_ONLY_GENRE_SLUGS",
        "APP_PERSON_PATH_RE",
        "APP_NETWORK_PATH_RE",
        "APP_LANGUAGE_PATH_RE",
        "APP_COUNTRY_PATH_RE",
        "APP_THEME_PATH_RE",
        "APP_MOVIE_PATH_RE",
        "APP_COMPANY_PATH_RE",
        "APP_PROVIDER_PATH_RE",
        "APP_YEAR_PATH_RE",
        "APP_STATUS_PATH_RE",
        "APP_CERTIFICATION_PATH_RE",
        "APP_DISCOVER_CATEGORY_PATH_RE",
        "APP_LIST_PATH_RE",
        "APP_LEGACY_WATCHLIST_PATHS",
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
            "legacy_genre_redirect_path",
            "safe_next_url",
            "valid_app_path",
        }:
            selected.append(node)

    namespace = {"re": re, "parse_qsl": __import__("urllib.parse").parse.parse_qsl, "urlencode": __import__("urllib.parse").parse.urlencode}
    module = ast.Module(body=selected, type_ignores=[])
    exec(compile(module, str(ROOT / "app.py"), "exec"), namespace)
    return namespace["safe_next_url"], namespace["valid_app_path"]


safe_next_url, valid_app_path = load_route_helpers()


class ProtectedRouteContractTests(unittest.TestCase):
    def test_sections_are_allowed(self):
        for path in (
            "/app/upcoming",
            "/app/history",
            "/app/discover",
            "/app/search",
            "/app/profile",
            "/app/settings",
        ):
            self.assertTrue(valid_app_path(path))
            self.assertEqual(safe_next_url(path), path)
        self.assertEqual(safe_next_url("/app/search?q=batman"), "/app/search?q=batman&type=tv")
        self.assertEqual(safe_next_url("/app/search?x=1&q=the matrix&type=movie"), "/app/search?q=the+matrix&type=movie")
        self.assertTrue(valid_app_path("/app/list/watching"))
        self.assertTrue(valid_app_path("/app/list/completed"))
        self.assertEqual(safe_next_url("/app/list"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/list/watching?q=dark"), "/app/list/watching?q=dark")
        self.assertEqual(safe_next_url("/app/list/plan-to-watch?x=1&q=the matrix"), "/app/list/plan-to-watch?q=the+matrix")

    def test_show_episode_genre_and_people_paths_are_allowed(self):
        self.assertFalse(valid_app_path("/app/show/1399"))
        self.assertTrue(valid_app_path("/app/show/1399-game-of-thrones"))
        self.assertTrue(valid_app_path("/app/show/1399-game-of-thrones/season/0/episode/1"))
        self.assertTrue(valid_app_path("/app/show/1399/season/0/episode/1"))
        self.assertFalse(valid_app_path("/app/genre/action-adventure"))
        self.assertEqual(safe_next_url("/app/genre/action-adventure"), "/app/genre/tv/action-adventure")
        self.assertEqual(safe_next_url("/app/genre/horror"), "/app/genre/movie/horror")
        self.assertTrue(valid_app_path("/app/genre/tv/action-adventure"))
        self.assertTrue(valid_app_path("/app/genre/movie/horror"))
        self.assertFalse(valid_app_path("/app/actor/123"))
        self.assertTrue(valid_app_path("/app/actor/123-leonardo-dicaprio"))
        self.assertTrue(valid_app_path("/app/cinematographer/456-roger-deakins"))
        self.assertEqual(safe_next_url("/app/actor/123-leonardo-dicaprio"), "/app/actor/123-leonardo-dicaprio")

    def test_discovery_paths_are_allowed(self):
        for path in (
            "/app/network/213-netflix",
            "/app/language/ja-japanese",
            "/app/country/jp-japan",
            "/app/theme/1234-war",
            "/app/movie/603-the-matrix",
            "/app/company/49-hbo",
            "/app/provider/8-netflix",
            "/app/discover/tv/popular",
            "/app/discover/tv/top-rated",
            "/app/discover/tv/airing-today",
            "/app/discover/tv/on-the-air",
            "/app/discover/movie/popular",
            "/app/discover/movie/top-rated",
            "/app/discover/movie/now-playing",
            "/app/discover/movie/upcoming",
            "/app/year/2024",
            "/app/status/returning-series",
            "/app/status/ended",
            "/app/status/canceled",
            "/app/status/in-production",
            "/app/certification/tv/tv-ma",
            "/app/certification/movie/pg-13",
        ):
            self.assertTrue(valid_app_path(path), path)
            self.assertEqual(safe_next_url(path), path)

    def test_sensitive_or_external_destinations_are_rejected(self):
        for value in (
            "https://example.com/app/watchlist",
            "//example.com/app/watchlist",
            "/api/state",
            "/app/private/notes",
            "/app/show/not-a-number",
            "/app/show/1399",
            "/app/actor/123",
            "/app/network/213",
            "/app/language/ja",
            "/app/country/jp",
            "/app/theme/1234",
            "/app/movie/603",
            "/app/company/49",
            "/app/provider/8",
            "/app/discover/tv/trending",
            "/app/discover/person/popular",
            "/app/discover/movie/airing-today",
            "/app/genre/",
            "/app/genre/action--adventure",
            "/app/genre/tv/",
            "/app/genre/person/drama",
            "/app/genre/movie/action--adventure",
            "/app/show/1399-",
            "/app/actor/123-",
            "/app/network/213-",
            "/app/language/ja-",
            "/app/country/jp-",
            "/app/theme/1234-",
            "/app/movie/603-",
            "/app/company/49-",
            "/app/provider/8-",
            "/app/year/1899",
            "/app/status/pilot",
            "/app/certification/music/pg",
            "/app/certification/movie/",
            "/app/actor/",
            "/app/actor/not-a-number",
            "/app/actor/0",
            "/app/unknownrole/123",
            "/app/network/",
            "/app/network/0",
            "/app/network/not-a-number",
            "/app/language/",
            "/app/language/japanese",
            "/app/country/",
            "/app/country/jpn",
            "/app/theme/",
            "/app/theme/0",
            "/app/theme/not-a-number",
            "/app/show/1399?status=watching",
        ):
            self.assertEqual(safe_next_url(value), "/app/list/watching")

    def test_app_root_normalizes_to_watchlist(self):
        self.assertEqual(safe_next_url("/app"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/"), "/app/list/watching")

    def test_trailing_app_destinations_normalize(self):
        self.assertEqual(safe_next_url("/app/watchlist/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/list/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/list/dropped/"), "/app/list/dropped")
        self.assertEqual(safe_next_url("/app/search/"), "/app/search")
        self.assertEqual(safe_next_url("/app/show/1399/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/show/1399-game-of-thrones/"), "/app/show/1399-game-of-thrones")
        self.assertEqual(
            safe_next_url("/app/show/1399-game-of-thrones/season/1/episode/3/"),
            "/app/show/1399-game-of-thrones/season/1/episode/3",
        )
        self.assertEqual(safe_next_url("/app/genre/action-adventure/"), "/app/genre/tv/action-adventure")
        self.assertEqual(safe_next_url("/app/genre/movie/horror/"), "/app/genre/movie/horror")
        self.assertEqual(safe_next_url("/app/actor/123-leonardo-dicaprio/"), "/app/actor/123-leonardo-dicaprio")
        self.assertEqual(safe_next_url("/app/network/213-netflix/"), "/app/network/213-netflix")
        self.assertEqual(safe_next_url("/app/movie/603-the-matrix/"), "/app/movie/603-the-matrix")
        self.assertEqual(safe_next_url("/app/company/49-hbo/"), "/app/company/49-hbo")
        self.assertEqual(safe_next_url("/app/provider/8-netflix/"), "/app/provider/8-netflix")
        self.assertEqual(safe_next_url("/app/discover/movie/upcoming/"), "/app/discover/movie/upcoming")
        self.assertEqual(safe_next_url("/app/year/2024/"), "/app/year/2024")
        self.assertEqual(safe_next_url("/app/status/returning-series/"), "/app/status/returning-series")
        self.assertEqual(safe_next_url("/app/certification/movie/pg-13/"), "/app/certification/movie/pg-13")


if __name__ == "__main__":
    unittest.main()
