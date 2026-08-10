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
        "APP_TV_GENRE_SLUGS",
        "APP_MOVIE_GENRE_SLUGS",
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
        "APP_LIBRARY_SORT_MODES",
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
        self.assertEqual(
            safe_next_url("/app/list/completed?sort=rating-desc&year=2024&network=HBO Max&genre=Drama&q=dark&x=1"),
            "/app/list/completed?q=dark&genre=Drama&network=HBO+Max&year=2024&sort=rating-desc",
        )
        self.assertEqual(
            safe_next_url("/app/list/paused?genre=all&network=all&year=nope&sort=unknown"),
            "/app/list/paused",
        )

    def test_show_episode_genre_and_people_paths_are_allowed(self):
        self.assertTrue(valid_app_path("/app/show/1399"))
        self.assertTrue(valid_app_path("/app/show/1399-game-of-thrones"))
        self.assertTrue(valid_app_path("/app/show/1399-game-of-thrones/season/0/episode/1"))
        self.assertTrue(valid_app_path("/app/show/1399/season/0/episode/1"))
        self.assertFalse(valid_app_path("/app/genre/action-adventure"))
        self.assertEqual(safe_next_url("/app/genre/action-adventure"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/genre/horror"), "/app/list/watching")
        self.assertTrue(valid_app_path("/app/genre/tv/action-adventure"))
        self.assertTrue(valid_app_path("/app/genre/movie/horror"))
        self.assertFalse(valid_app_path("/app/actor/123"))
        self.assertTrue(valid_app_path("/app/person/525"))
        self.assertTrue(valid_app_path("/app/person/525-christopher-nolan"))
        self.assertFalse(valid_app_path("/app/actor/123-leonardo-dicaprio"))
        self.assertFalse(valid_app_path("/app/cinematographer/456-roger-deakins"))
        self.assertEqual(safe_next_url("/app/person/525-christopher-nolan"), "/app/person/525-christopher-nolan")
        self.assertEqual(
            safe_next_url("/app/person/525-christopher-nolan?x=1&media=movie"),
            "/app/person/525-christopher-nolan?media=movie",
        )
        self.assertEqual(
            safe_next_url("/app/person/525-christopher-nolan?media=tv"),
            "/app/person/525-christopher-nolan",
        )
        self.assertEqual(safe_next_url("/app/actor/123-leonardo-dicaprio"), "/app/list/watching")

    def test_id_only_routes_are_allowed_for_client_canonicalization(self):
        for path in (
            "/app/show/1399",
            "/app/person/525",
            "/app/network/213",
            "/app/language/tv/ja",
            "/app/language/movie/ja",
            "/app/country/tv/jp",
            "/app/country/movie/jp",
            "/app/theme/tv/1234",
            "/app/theme/movie/1234",
            "/app/movie/603",
            "/app/company/tv/49",
            "/app/company/movie/49",
            "/app/provider/tv/8",
            "/app/provider/movie/8",
        ):
            self.assertTrue(valid_app_path(path), path)
            self.assertEqual(safe_next_url(path), path)

    def test_discovery_paths_are_allowed(self):
        for path in (
            "/app/network/213-netflix",
            "/app/language/tv/ja-japanese",
            "/app/language/movie/ja-japanese",
            "/app/country/tv/jp-japan",
            "/app/country/movie/jp-japan",
            "/app/theme/tv/1234-war",
            "/app/theme/movie/1234-war",
            "/app/movie/603-the-matrix",
            "/app/company/tv/49-hbo",
            "/app/company/movie/49-hbo",
            "/app/provider/tv/8-netflix",
            "/app/provider/movie/8-netflix",
            "/app/discover/tv/popular",
            "/app/discover/tv/top-rated",
            "/app/discover/tv/airing-today",
            "/app/discover/tv/on-the-air",
            "/app/discover/movie/popular",
            "/app/discover/movie/top-rated",
            "/app/discover/movie/now-playing",
            "/app/discover/movie/upcoming",
            "/app/year/tv/2024",
            "/app/year/movie/2024",
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
            "/app/actor/123",
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
            "/app/person/525-",
            "/app/network/213-",
            "/app/language/tv/ja-",
            "/app/language/movie/ja-",
            "/app/country/tv/jp-",
            "/app/country/movie/jp-",
            "/app/theme/tv/1234-",
            "/app/theme/movie/1234-",
            "/app/movie/603-",
            "/app/company/tv/49-",
            "/app/company/movie/49-",
            "/app/provider/tv/8-",
            "/app/provider/movie/8-",
            "/app/year/tv/1899",
            "/app/year/movie/2200",
            "/app/language/ja-japanese",
            "/app/country/jp-japan",
            "/app/theme/1234-war",
            "/app/company/49-hbo",
            "/app/provider/8-netflix",
            "/app/year/2024",
            "/app/status/pilot",
            "/app/certification/music/pg",
            "/app/certification/movie/",
            "/app/actor/",
            "/app/person/",
            "/app/actor/not-a-number",
            "/app/person/not-a-number",
            "/app/actor/0",
            "/app/unknownrole/123",
            "/app/network/",
            "/app/network/0",
            "/app/network/not-a-number",
            "/app/language/",
            "/app/language/tv/",
            "/app/language/person/ja",
            "/app/language/tv/japanese",
            "/app/country/",
            "/app/country/tv/",
            "/app/country/person/jp",
            "/app/country/tv/jpn",
            "/app/theme/",
            "/app/theme/tv/0",
            "/app/theme/person/1234",
            "/app/theme/tv/not-a-number",
        ):
            self.assertEqual(safe_next_url(value), "/app/list/watching")

    def test_irrelevant_query_is_removed_from_detail_route(self):
        self.assertEqual(safe_next_url("/app/show/1399?status=watching"), "/app/show/1399")

    def test_app_root_normalizes_to_watchlist(self):
        self.assertEqual(safe_next_url("/app"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/"), "/app/list/watching")

    def test_trailing_app_destinations_normalize(self):
        self.assertEqual(safe_next_url("/app/watchlist/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/list/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/list/dropped/"), "/app/list/dropped")
        self.assertEqual(safe_next_url("/app/search/"), "/app/search")
        self.assertEqual(safe_next_url("/app/show/1399/"), "/app/show/1399")
        self.assertEqual(safe_next_url("/app/show/1399-game-of-thrones/"), "/app/show/1399-game-of-thrones")
        self.assertEqual(
            safe_next_url("/app/show/1399-game-of-thrones/season/1/episode/3/"),
            "/app/show/1399-game-of-thrones/season/1/episode/3",
        )
        self.assertEqual(safe_next_url("/app/genre/action-adventure/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/genre/movie/horror/"), "/app/genre/movie/horror")
        self.assertEqual(safe_next_url("/app/person/525-christopher-nolan/"), "/app/person/525-christopher-nolan")
        self.assertEqual(safe_next_url("/app/actor/123-leonardo-dicaprio/"), "/app/list/watching")
        self.assertEqual(safe_next_url("/app/network/213-netflix/"), "/app/network/213-netflix")
        self.assertEqual(safe_next_url("/app/movie/603-the-matrix/"), "/app/movie/603-the-matrix")
        self.assertEqual(safe_next_url("/app/company/tv/49-hbo/"), "/app/company/tv/49-hbo")
        self.assertEqual(safe_next_url("/app/provider/movie/8-netflix/"), "/app/provider/movie/8-netflix")
        self.assertEqual(safe_next_url("/app/discover/movie/upcoming/"), "/app/discover/movie/upcoming")
        self.assertEqual(safe_next_url("/app/year/tv/2024/"), "/app/year/tv/2024")
        self.assertEqual(safe_next_url("/app/status/returning-series/"), "/app/status/returning-series")
        self.assertEqual(safe_next_url("/app/certification/movie/pg-13/"), "/app/certification/movie/pg-13")


if __name__ == "__main__":
    unittest.main()
