import unittest
from unittest import mock

import release_timing
from release_timing import ReleaseTimingResolver


class StubProvider:
    def __init__(self, value=None, error=None):
        self.value = value
        self.error = error
        self.calls = 0

    def resolve_episode(self, **kwargs):
        self.calls += 1
        if self.error:
            raise self.error
        return self.value


class ReleaseTimingTests(unittest.TestCase):
    def test_tmdb_fallback_uses_same_calendar_date_not_plus_one(self):
        resolver = ReleaseTimingResolver(provider_enabled=False)
        result = resolver.resolve(
            tmdb_id=1, season_number=1, episode_number=2,
            tmdb_air_date="2026-08-16", timezone_name="Asia/Kuala_Lumpur",
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.release_date, "2026-08-16")
        self.assertEqual(result.precision, "date_only")
        self.assertFalse(result.provider_used)
        self.assertTrue(result.eligible_at.startswith("2026-08-15T16:00:00+00:00"))

    def test_public_api_contract_is_canonical(self):
        fallback = ReleaseTimingResolver(provider_enabled=False).resolve(
            tmdb_id=1, season_number=1, episode_number=1,
            tmdb_air_date="2026-08-16", timezone_name="Asia/Kuala_Lumpur",
        )
        payload = fallback.to_api("Asia/Kuala_Lumpur")
        self.assertIsNone(payload["releaseAt"])
        self.assertEqual(payload["releaseDate"], "2026-08-16")
        self.assertEqual(payload["precision"], "date")
        self.assertEqual(payload["confidence"], "fallback")
        self.assertFalse(payload["providerUsed"])
        self.assertIn("eligibleAt", payload)
        self.assertIn("displayDate", payload)
        self.assertNotIn("release_at", payload)
        self.assertNotIn("release_date", payload)

        provider = StubProvider({
            "precision": "exact",
            "release_at": "2026-08-16T03:30:00+02:00",
            "release_date": "2026-08-16",
            "trusted": True,
        })
        exact = ReleaseTimingResolver(
            provider=provider,
            provider_enabled=True,
            exact_enabled=True,
        ).resolve(
            tmdb_id=1, season_number=1, episode_number=1,
            tmdb_air_date="2026-08-16", timezone_name="UTC",
        )
        exact_payload = exact.to_api("UTC")
        self.assertEqual(exact_payload["precision"], "exact")
        self.assertEqual(exact_payload["confidence"], "verified")
        self.assertEqual(exact_payload["releaseAt"], "2026-08-16T01:30:00+00:00")
        self.assertTrue(exact_payload["providerUsed"])

    def test_provider_disabled_is_never_called(self):
        provider = StubProvider({"precision":"exact","release_at":"2026-08-16T00:00:00Z","release_date":"2026-08-16","trusted":True})
        resolver = ReleaseTimingResolver(provider=provider, provider_enabled=False, exact_enabled=True)
        result = resolver.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertEqual(provider.calls, 0)
        self.assertFalse(result.provider_used)

    def test_query_gate_prevents_provider_call(self):
        provider = StubProvider({"precision":"exact","release_at":"2026-08-16T00:00:00Z","release_date":"2026-08-16","trusted":True})
        resolver = ReleaseTimingResolver(
            provider=provider, provider_enabled=True, query_enabled=False, exact_enabled=True
        )
        result = resolver.resolve(
            tmdb_id=1, season_number=1, episode_number=1,
            tmdb_air_date="2026-08-16", timezone_name="UTC",
        )
        self.assertEqual(provider.calls, 0)
        self.assertFalse(result.provider_used)

    def test_master_disabled_capability_does_not_import_provider(self):
        with mock.patch.dict(release_timing.os.environ, {
            "TVMAZE_ENABLED": "false",
            "TVMAZE_SHADOW_ENABLED": "true",
            "TVMAZE_UPCOMING_ENABLED": "true",
            "TVMAZE_NOTIFICATIONS_ENABLED": "true",
        }, clear=False):
            with mock.patch.object(release_timing.importlib, "import_module") as importer:
                capability = release_timing.provider_capability()
        importer.assert_not_called()
        self.assertFalse(capability["enabled"])
        self.assertFalse(capability["upcomingAuthority"])
        self.assertFalse(capability["notificationsAuthority"])

    def test_child_capabilities_are_independent(self):
        with mock.patch.dict(release_timing.os.environ, {
            "TVMAZE_ENABLED": "true",
            "TVMAZE_SHADOW_ENABLED": "false",
            "TVMAZE_UPCOMING_ENABLED": "true",
            "TVMAZE_NOTIFICATIONS_ENABLED": "false",
        }, clear=False):
            flags = release_timing.provider_flags()
        self.assertTrue(flags["master_enabled"])
        self.assertTrue(flags["upcoming_enabled"])
        self.assertFalse(flags["notifications_enabled"])

    def test_legacy_environment_flags_cannot_grant_authority(self):
        provider = StubProvider({
            "precision": "exact",
            "release_at": "2026-08-16T00:00:00Z",
            "release_date": "2026-08-16",
            "trusted": True,
        })
        with mock.patch.dict(release_timing.os.environ, {
            "TVMAZE_ENABLED": "true",
            "TVMAZE_EXACT_ENABLED": "true",
            "TVMAZE_DATE_ONLY_ENABLED": "true",
        }, clear=False):
            resolver = ReleaseTimingResolver(provider=provider, provider_enabled=True)
            result = resolver.resolve(
                tmdb_id=1, season_number=1, episode_number=1,
                tmdb_air_date="2026-08-16", timezone_name="UTC",
            )
        self.assertEqual(provider.calls, 1)
        self.assertFalse(result.provider_used)
        self.assertEqual(result.reason, "tmdb_date_fallback")

    def test_provider_exception_falls_back(self):
        provider = StubProvider(error=RuntimeError("down"))
        resolver = ReleaseTimingResolver(provider=provider, provider_enabled=True, exact_enabled=True)
        result = resolver.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertEqual(result.reason, "tmdb_date_fallback")

    def test_exact_requires_explicit_authority(self):
        candidate = {"precision":"exact","release_at":"2026-08-16T03:30:00+02:00","release_date":"2026-08-16","trusted":True}
        provider = StubProvider(candidate)
        off = ReleaseTimingResolver(provider=provider, provider_enabled=True, exact_enabled=False)
        fallback = off.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertFalse(fallback.provider_used)
        on = ReleaseTimingResolver(provider=provider, provider_enabled=True, exact_enabled=True)
        exact = on.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertTrue(exact.provider_used)
        self.assertEqual(exact.precision, "exact")
        self.assertEqual(exact.release_at, "2026-08-16T01:30:00+00:00")
        self.assertEqual(exact.confidence, "verified")

    def test_timezone_less_timestamp_is_not_exact(self):
        candidate = {"precision":"exact","release_at":"2026-08-16T03:30:00","release_date":"2026-08-16","trusted":True}
        provider = StubProvider(candidate)
        resolver = ReleaseTimingResolver(provider=provider, provider_enabled=True, exact_enabled=True)
        result = resolver.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertFalse(result.provider_used)

    def test_date_only_authority_is_independent(self):
        candidate = {"precision":"date_only","release_at":"","release_date":"2026-08-17","trusted":True}
        provider = StubProvider(candidate)
        resolver = ReleaseTimingResolver(provider=provider, provider_enabled=True, date_only_enabled=True)
        result = resolver.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertTrue(result.provider_used)
        self.assertEqual(result.release_date, "2026-08-17")
        self.assertEqual(result.confidence, "verified")

    def test_missing_optional_module_does_not_break_fallback(self):
        resolver = ReleaseTimingResolver(provider_enabled=True, exact_enabled=True)
        with mock.patch.object(release_timing.importlib, "import_module", side_effect=ImportError("missing")):
            result = resolver.resolve(tmdb_id=1, season_number=1, episode_number=1, tmdb_air_date="2026-08-16", timezone_name="UTC")
        self.assertEqual(result.reason, "tmdb_date_fallback")


if __name__ == "__main__":
    unittest.main()
