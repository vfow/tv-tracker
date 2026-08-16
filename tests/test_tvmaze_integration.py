import io
import json
import threading
import time
import unittest
from unittest import mock
from urllib.error import HTTPError

from tvmaze_integration import TVmazeProvider, classify_episode_timing


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self): return json.dumps(self.payload).encode("utf-8")


class TVmazeClassificationTests(unittest.TestCase):
    def test_network_episode_can_be_exact(self):
        show = {"network":{"country":{"timezone":"America/New_York"}},"webChannel":None}
        episode = {"airdate":"2026-08-16","airtime":"21:00","airstamp":"2026-08-17T01:00:00+00:00"}
        result = classify_episode_timing(show, episode)
        self.assertEqual(result["precision"], "exact")
        self.assertTrue(result["trusted"])

    def test_global_web_channel_stays_date_only(self):
        show = {"network":None,"webChannel":{"name":"Netflix","country":None}}
        episode = {"airdate":"2026-08-16","airtime":"03:00","airstamp":"2026-08-16T03:00:00+00:00"}
        result = classify_episode_timing(show, episode)
        self.assertEqual(result["precision"], "date_only")
        self.assertEqual(result["reason"], "global_web_date_only")

    def test_timezone_less_stamp_stays_date_only(self):
        show = {"network":{"country":{"timezone":"Europe/London"}}}
        episode = {"airdate":"2026-08-16","airtime":"21:00","airstamp":"2026-08-16T21:00:00"}
        result = classify_episode_timing(show, episode)
        self.assertEqual(result["precision"], "date_only")

    def test_missing_airdate_is_unusable(self):
        self.assertIsNone(classify_episode_timing({}, {"airstamp":"2026-08-16T21:00:00Z"}))


class TVmazeHttpTests(unittest.TestCase):
    def provider(self, opener, sleep=lambda _: None):
        return TVmazeProvider(connection_factory=lambda: None, tmdb_fetcher=lambda *_: {}, opener=opener, sleep=sleep)

    def test_404_is_negative_not_exception(self):
        def opener(*args, **kwargs):
            raise HTTPError("https://api.tvmaze.com/x",404,"missing",{},None)
        provider = self.provider(opener)
        self.assertIsNone(provider._request_json("/lookup/shows",{"imdb":"tt1"}))

    def test_429_retries_then_succeeds(self):
        calls = []
        def opener(*args, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                raise HTTPError("https://api.tvmaze.com/x",429,"slow",{"Retry-After":"0.5"},None)
            return FakeResponse({"id":123})
        provider = self.provider(opener)
        result = provider._request_json("/lookup/shows",{"imdb":"tt1"})
        self.assertEqual(result["id"],123)
        self.assertEqual(len(calls),2)

    def test_bad_json_is_contained_as_runtime_provider_failure(self):
        class BadResponse(FakeResponse):
            def read(self): return b"not-json"
        provider = self.provider(lambda *args,**kwargs: BadResponse({}))
        with self.assertRaises(RuntimeError):
            provider._request_json("/shows/1")

    def test_mapping_cache_is_checked_against_current_tmdb_external_ids(self):
        tmdb_fetcher = mock.Mock(return_value={"imdb_id": "tt-new", "tvdb_id": 456})
        provider = TVmazeProvider(
            connection_factory=lambda: None,
            tmdb_fetcher=tmdb_fetcher,
            opener=lambda *args, **kwargs: FakeResponse({}),
        )
        provider._cached_mapping = mock.Mock(return_value=(77, "verified_external_id"))
        provider._lookup_external = mock.Mock()
        self.assertEqual(provider._mapping(123), (77, "verified_external_id"))
        provider._cached_mapping.assert_called_once_with(123, "tt-new", 456)
        provider._lookup_external.assert_not_called()

    def test_external_id_fetch_is_bounded_per_show(self):
        tmdb_fetcher = mock.Mock(return_value={"imdb_id": "tt1", "tvdb_id": 123})
        provider = TVmazeProvider(
            connection_factory=lambda: None,
            tmdb_fetcher=tmdb_fetcher,
            opener=lambda *args, **kwargs: FakeResponse({}),
        )
        self.assertEqual(provider._tmdb_external_ids(42), ("tt1", 123))
        self.assertEqual(provider._tmdb_external_ids(42), ("tt1", 123))
        self.assertEqual(tmdb_fetcher.call_count, 1)

    def test_external_id_conflict_is_rejected(self):
        provider = self.provider(lambda *args,**kwargs: FakeResponse({}))
        provider._request_json = mock.Mock(side_effect=[{"id":10},{"id":11}])
        tvmaze_id, reason = provider._lookup_external(imdb_id="tt1",tvdb_id=123)
        self.assertIsNone(tvmaze_id)
        self.assertEqual(reason,"external_id_conflict")

    def test_identical_concurrent_requests_are_deduplicated(self):
        calls = []
        started = threading.Event()
        def opener(*args, **kwargs):
            calls.append(1)
            started.set()
            time.sleep(0.08)
            return FakeResponse({"id": 77})
        provider = self.provider(opener)
        results = []
        def run():
            results.append(provider._request_json("/shows/77"))
        first = threading.Thread(target=run)
        second = threading.Thread(target=run)
        first.start()
        started.wait(timeout=1)
        second.start()
        first.join(timeout=2)
        second.join(timeout=2)
        self.assertEqual(results, [{"id":77},{"id":77}])
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
