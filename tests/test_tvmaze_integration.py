import io
import json
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock
from urllib.error import HTTPError

from tvmaze_integration import (
    EPISODE_NEGATIVE_TTL,
    EPISODE_NEAR_TERM_EXACT_TTL,
    EPISODE_SUCCESS_TTL,
    TVmazeProvider,
    _episode_ttl,
    classify_episode_timing,
)


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

    def test_announced_airtime_must_match_airstamp_wall_clock(self):
        show = {"network":{"country":{"timezone":"America/New_York"}},"webChannel":None}
        episode = {"airdate":"2026-08-16","airtime":"20:30","airstamp":"2026-08-17T01:00:00+00:00"}
        result = classify_episode_timing(show, episode)
        self.assertEqual(result["precision"], "date_only")
        self.assertEqual(result["reason"], "unverified_time_date_only")

    def test_malformed_announced_airtime_is_never_exact(self):
        show = {"network":{"country":{"timezone":"America/New_York"}},"webChannel":None}
        episode = {"airdate":"2026-08-16","airtime":"25:00","airstamp":"2026-08-17T01:00:00+00:00"}
        result = classify_episode_timing(show, episode)
        self.assertEqual(result["precision"], "date_only")

    def test_after_midnight_date_mismatch_is_conservatively_date_only(self):
        show = {"network":{"country":{"timezone":"America/New_York"}},"webChannel":None}
        episode = {"airdate":"2026-08-16","airtime":"01:00","airstamp":"2026-08-17T05:00:00+00:00"}
        result = classify_episode_timing(show, episode)
        self.assertEqual(result["precision"], "date_only")

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


class TVmazeCachePolicyTests(unittest.TestCase):
    def test_imminent_exact_release_refreshes_hourly(self):
        now = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)
        result = {
            "precision": "exact",
            "release_at": (now + timedelta(hours=2)).isoformat(),
            "release_date": "2026-08-16",
        }
        self.assertEqual(_episode_ttl(result, now), EPISODE_NEAR_TERM_EXACT_TTL)

    def test_far_exact_release_uses_six_hour_cache(self):
        now = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)
        result = {
            "precision": "exact",
            "release_at": (now + timedelta(days=3)).isoformat(),
            "release_date": "2026-08-19",
        }
        self.assertEqual(_episode_ttl(result, now), EPISODE_SUCCESS_TTL)

    def test_date_only_success_uses_six_hour_cache(self):
        result = {"precision": "date_only", "release_at": "", "release_date": "2026-08-16"}
        self.assertEqual(_episode_ttl(result), EPISODE_SUCCESS_TTL)

    def test_negative_result_is_temporarily_cached(self):
        self.assertEqual(_episode_ttl(None), EPISODE_NEGATIVE_TTL)


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
