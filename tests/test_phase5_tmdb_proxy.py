import io
import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.parse import parse_qsl, urlsplit

from tvtracker.infrastructure.static_assets import install_static_asset_versioning

try:
    import psycopg  # noqa: F401
except ModuleNotFoundError:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    psycopg_stub.Error = Exception
    types_stub = types.ModuleType("psycopg.types")
    json_stub = types.ModuleType("psycopg.types.json")

    class Jsonb:
        def __init__(self, value):
            self.value = value

    json_stub.Jsonb = Jsonb
    sys.modules["psycopg"] = psycopg_stub
    sys.modules["psycopg.types"] = types_stub
    sys.modules["psycopg.types.json"] = json_stub

try:
    import flask  # noqa: F401
except ModuleNotFoundError as error:
    raise unittest.SkipTest("Flask is not installed in this test environment") from error

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DB_HOST", "test-db")
os.environ.setdefault("DB_NAME", "test-db")
os.environ.setdefault("DB_USER", "test-user")
os.environ.setdefault("DB_PASSWORD", "test-password")


def model_fresh_database(cursor):
    applied = {}
    schema_meta_exists = False
    schema_version = None
    row = None
    rows = []

    def execute(sql, params=None):
        nonlocal schema_meta_exists, schema_version, row, rows
        statement = str(sql)
        row = None
        rows = []

        if "CREATE TABLE IF NOT EXISTS tv_tracker_schema_meta" in statement:
            schema_meta_exists = True
        if "INSERT INTO tv_tracker_schema_meta" in statement:
            schema_meta_exists = True
            schema_version = int(params[0]) if params else 6
        if "INSERT INTO tv_tracker_migrations" in statement:
            applied[str(params[0])] = str(params[1])

        if "to_regclass('tv_tracker_schema_meta')" in statement:
            row = ("tv_tracker_schema_meta" if schema_meta_exists else None,)
        elif "SELECT schema_version FROM tv_tracker_schema_meta" in statement:
            row = (schema_version,) if schema_version is not None else None
        elif "SELECT migration_id, checksum FROM tv_tracker_migrations" in statement:
            rows = sorted(applied.items())
        elif "SELECT 1 FROM tv_tracker_admin" in statement:
            row = (1,)

    cursor.execute.side_effect = execute
    cursor.fetchone.side_effect = lambda: row
    cursor.fetchall.side_effect = lambda: list(rows)


with patch("psycopg.connect") as mocked_connect:
    connection = MagicMock()
    cursor = MagicMock()
    mocked_connect.return_value.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor
    model_fresh_database(cursor)
    import app as tracker


class _UpstreamResponse:
    def __init__(self, payload=None, status=200):
        self.status = status
        self._payload = payload if payload is not None else {"id": 123}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


def _never_called(*args, **kwargs):
    raise AssertionError("urlopen must not be called for this request")


def query_params(full_url):
    return dict(parse_qsl(urlsplit(full_url).query))


class TMDBProxyTests(unittest.TestCase):
    def setUp(self):
        tracker.TMDB_PROXY_CACHE.clear()
        self.schema_patch = patch.object(tracker, "ensure_schema", return_value=None)
        self.cleanup_patch = patch.object(
            tracker, "cleanup_stored_tracker_data", return_value=None
        )
        self.schema_patch.start()
        self.cleanup_patch.start()
        self.app = tracker.create_app()
        install_static_asset_versioning(self.app)
        self.app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)
        self.client = self.app.test_client()
        self.account = {
            "username": "admin",
            "password_hash": "unused",
            "session_version": 1,
            "updated_at": None,
        }

    def tearDown(self):
        tracker.TMDB_PROXY_CACHE.clear()
        self.cleanup_patch.stop()
        self.schema_patch.stop()

    def _login(self):
        with self.client.session_transaction() as session:
            session["authenticated"] = True
            session["session_version"] = 1
            session["csrf_token"] = "csrf-test-token"

    def _get(self, path, **patches):
        self._login()
        active = [
            patch.dict(os.environ, {"TMDB_API_KEY": "tmdb-test-key"}),
            patch.object(tracker, "read_admin_account", return_value=self.account),
        ]
        active.extend(
            patch.object(tracker, name, value) for name, value in patches.items()
        )
        for context in active:
            context.start()
        try:
            return self.client.get(path)
        finally:
            for context in reversed(active):
                context.stop()

    def test_allowed_search_path_injects_server_api_key_and_drops_client_key(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"results": []})

        response = self._get(
            "/api/tmdb/search/tv?query=breaking+bad&page=2&include_adult=false"
            "&api_key=evil&hacked=1",
            urlopen=opener,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("Cache-Control"), "private, max-age=300")
        self.assertEqual(len(requests), 1)
        params = query_params(requests[0].full_url)
        self.assertEqual(params.get("api_key"), "tmdb-test-key")
        self.assertEqual(params.get("query"), "breaking bad")
        self.assertEqual(params.get("page"), "2")
        self.assertEqual(params.get("include_adult"), "false")
        self.assertNotIn("hacked", params)

    def test_blocked_paths_return_403_without_upstream_call(self):
        for path in (
            "/api/tmdb/account",
            "/api/tmdb/foo/bar/baz",
            "/api/tmdb/authentication/token/new",
            "/api/tmdb/trending/all/day",
        ):
            response = self._get(path, urlopen=_never_called)
            self.assertEqual(response.status_code, 403, path)
            self.assertEqual(response.get_json()["code"], "tmdb_endpoint_not_allowed", path)

    def test_non_numeric_ids_return_400_without_upstream_call(self):
        for path in (
            "/api/tmdb/tv/abc",
            "/api/tmdb/tv/0",
            "/api/tmdb/tv/123/season/x",
            "/api/tmdb/movie/nope",
            "/api/tmdb/person/12x",
            "/api/tmdb/network/abc",
        ):
            response = self._get(path, urlopen=_never_called)
            self.assertEqual(response.status_code, 400, path)
            self.assertEqual(response.get_json()["code"], "tmdb_invalid_id", path)

    def test_include_adult_invalid_value_is_stripped(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"results": []})

        response = self._get(
            "/api/tmdb/search/tv?query=x&include_adult=banana&page=1",
            urlopen=opener,
        )
        self.assertEqual(response.status_code, 200)
        params = query_params(requests[0].full_url)
        self.assertNotIn("include_adult", params)

    def test_include_adult_is_ignored_outside_supported_endpoints(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"id": 123})

        response = self._get("/api/tmdb/tv/123?include_adult=true", urlopen=opener)
        self.assertEqual(response.status_code, 200)
        params = query_params(requests[0].full_url)
        self.assertNotIn("include_adult", params)
        self.assertEqual(params.get("api_key"), "tmdb-test-key")

    def test_legitimate_include_adult_true_is_forwarded_for_movie_search(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"results": []})

        response = self._get(
            "/api/tmdb/search/movie?query=x&include_adult=true&page=1",
            urlopen=opener,
        )
        self.assertEqual(response.status_code, 200)
        params = query_params(requests[0].full_url)
        self.assertEqual(params.get("include_adult"), "true")

    def test_unknown_and_invalid_query_params_are_stripped(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"results": []})

        response = self._get(
            "/api/tmdb/discover/tv?page=1&sort_by=popularity.desc&with_genres=18|28"
            "&watch_region=ZZZ&evil=1&vote_average.gte=9",
            urlopen=opener,
        )
        self.assertEqual(response.status_code, 200)
        params = query_params(requests[0].full_url)
        self.assertEqual(params.get("page"), "1")
        self.assertEqual(params.get("sort_by"), "popularity.desc")
        self.assertEqual(params.get("with_genres"), "18|28")
        self.assertNotIn("watch_region", params)
        self.assertNotIn("evil", params)
        self.assertNotIn("vote_average.gte", params)

    def test_cache_hit_serves_without_second_upstream_call(self):
        calls = []

        def opener(request_object, timeout):
            calls.append(request_object)
            return _UpstreamResponse({"id": 123, "hits": len(calls)})

        first = self._get("/api/tmdb/tv/123", urlopen=opener)
        second = self._get("/api/tmdb/tv/123", urlopen=opener)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.get_json(), first.get_json())
        self.assertEqual(len(calls), 1)

    def test_cache_key_isolates_different_query_params(self):
        calls = []

        def opener(request_object, timeout):
            calls.append(request_object)
            return _UpstreamResponse({"id": 123})

        self._get("/api/tmdb/search/tv?query=alpha&page=1", urlopen=opener)
        self._get("/api/tmdb/search/tv?query=beta&page=1", urlopen=opener)

        self.assertEqual(len(calls), 2)

    def test_cache_ttl_expiry_refetches_upstream(self):
        calls = []

        def opener(request_object, timeout):
            calls.append(request_object)
            return _UpstreamResponse({"id": 123, "hits": len(calls)})

        self._get("/api/tmdb/tv/123", urlopen=opener)
        with tracker.TMDB_PROXY_CACHE_LOCK:
            for entry in tracker.TMDB_PROXY_CACHE.values():
                entry["saved_at"] -= tracker.TMDB_PROXY_CACHE_TTL + 1
        response = self._get("/api/tmdb/tv/123", urlopen=opener)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(calls), 2)

    def test_cache_buster_param_bypasses_cache(self):
        calls = []

        def opener(request_object, timeout):
            calls.append(request_object)
            return _UpstreamResponse({"images": {}})

        first = self._get("/api/tmdb/configuration?_=1", urlopen=opener)
        second = self._get("/api/tmdb/configuration?_=2", urlopen=opener)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(calls), 2)
        params = query_params(calls[0].full_url)
        self.assertNotIn("_", params)
        self.assertEqual(params.get("api_key"), "tmdb-test-key")

    def test_429_relays_status_body_and_retry_after(self):
        body = b'{"status_message":"Too many requests"}'

        def opener(request_object, timeout):
            raise HTTPError(
                request_object.full_url,
                429,
                "Too Many Requests",
                {"Retry-After": "30"},
                io.BytesIO(body),
            )

        response = self._get("/api/tmdb/tv/123", urlopen=opener)

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.mimetype, "application/json")
        self.assertEqual(response.get_json(), {"status_message": "Too many requests"})
        self.assertEqual(response.headers.get("Retry-After"), "30")
        self.assertEqual(tracker.TMDB_PROXY_CACHE, {})

    def test_upstream_404_relays_status_without_retry_after(self):
        def opener(request_object, timeout):
            raise HTTPError(
                request_object.full_url,
                404,
                "Not Found",
                {},
                io.BytesIO(b'{"status_message":"The resource you requested could not be found."}'),
            )

        response = self._get("/api/tmdb/tv/999999999", urlopen=opener)

        self.assertEqual(response.status_code, 404)
        self.assertIsNone(response.headers.get("Retry-After"))

    def test_network_error_returns_502_json(self):
        from urllib.error import URLError

        def opener(request_object, timeout):
            raise URLError("down")

        response = self._get("/api/tmdb/tv/123", urlopen=opener)

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["code"], "tmdb_unavailable")

    def test_proxy_requires_authentication(self):
        with patch.dict(os.environ, {"TMDB_API_KEY": "tmdb-test-key"}), patch.object(
            tracker, "read_admin_account", return_value=self.account
        ), patch.object(tracker, "urlopen", _never_called):
            response = self.client.get("/api/tmdb/tv/123")

        self.assertEqual(response.status_code, 401)

    def test_season_episode_and_provider_paths_are_allowed(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"id": 123})

        for path in (
            "/api/tmdb/tv/123/season/1?append_to_response=external_ids",
            "/api/tmdb/tv/123/season/0/episode/1?append_to_response=external_ids,credits",
            "/api/tmdb/movie/42/watch/providers",
            "/api/tmdb/tv/123/external_ids",
            "/api/tmdb/tv/123/keywords",
            "/api/tmdb/watch/providers/tv?language=en-US&watch_region=US",
            "/api/tmdb/genre/movie/list",
            "/api/tmdb/certification/movie/list",
            "/api/tmdb/find/tt1234567?external_source=imdb_id",
            "/api/tmdb/trending/movie/week?language=en-US",
            "/api/tmdb/tv/popular?page=1",
            "/api/tmdb/network/213",
            "/api/tmdb/keyword/1234",
            "/api/tmdb/company/1",
            "/api/tmdb/person/287?append_to_response=combined_credits,external_ids",
        ):
            response = self._get(path, urlopen=opener)
            self.assertEqual(response.status_code, 200, path)

        self.assertEqual(len(requests), 15)

    def test_append_to_response_unknown_fields_are_stripped(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"id": 123})

        response = self._get(
            "/api/tmdb/tv/123?append_to_response=external_ids,hax",
            urlopen=opener,
        )
        self.assertEqual(response.status_code, 200)
        params = query_params(requests[0].full_url)
        self.assertNotIn("append_to_response", params)

    def test_invalid_external_source_is_stripped(self):
        requests = []

        def opener(request_object, timeout):
            requests.append(request_object)
            return _UpstreamResponse({"tv_results": []})

        response = self._get(
            "/api/tmdb/find/tt1234567?external_source=hax",
            urlopen=opener,
        )
        self.assertEqual(response.status_code, 200)
        params = query_params(requests[0].full_url)
        self.assertNotIn("external_source", params)


if __name__ == "__main__":
    unittest.main()
