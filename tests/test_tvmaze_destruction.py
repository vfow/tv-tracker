import unittest

import psycopg

from release_timing import ReleaseTimingResolver


class RaisingProvider:
    def __init__(self, error):
        self.error = error
        self.called = 0

    def resolve_episode(self, **kwargs):
        self.called += 1
        raise self.error


class StaleExactProvider:
    def __init__(self):
        self.called = 0

    def resolve_episode(self, **kwargs):
        self.called += 1
        return {
            "precision": "exact",
            "release_at": "2026-08-16T01:00:00Z",
            "release_date": "2026-08-16",
            "trusted": True,
            "reason": "stale-provider-row",
        }


class TVmazeDestructionTests(unittest.TestCase):
    def resolve(self, resolver):
        return resolver.resolve(
            tmdb_id=123,
            season_number=2,
            episode_number=4,
            tmdb_air_date="2026-08-16",
            timezone_name="Asia/Kuala_Lumpur",
        )

    def test_provider_database_failure_falls_back_to_core(self):
        provider = RaisingProvider(psycopg.OperationalError("provider table unavailable"))
        result = self.resolve(ReleaseTimingResolver(provider=provider, provider_enabled=True, exact_enabled=True))
        self.assertEqual(provider.called, 1)
        self.assertFalse(result.provider_used)
        self.assertEqual(result.reason, "tmdb_date_fallback")

    def test_kill_switch_makes_stale_provider_candidate_ineligible(self):
        provider = StaleExactProvider()
        result = self.resolve(ReleaseTimingResolver(provider=provider, provider_enabled=False, exact_enabled=True))
        self.assertEqual(provider.called, 0)
        self.assertFalse(result.provider_used)
        self.assertEqual(result.release_date, "2026-08-16")

    def test_provider_timeout_falls_back_to_core(self):
        provider = RaisingProvider(TimeoutError("timeout"))
        result = self.resolve(ReleaseTimingResolver(provider=provider, provider_enabled=True, exact_enabled=True))
        self.assertFalse(result.provider_used)

    def test_provider_malformed_candidate_falls_back_to_core(self):
        class MalformedProvider:
            def resolve_episode(self, **kwargs):
                return {"precision": "exact", "release_at": "not-a-date", "trusted": True}
        result = self.resolve(ReleaseTimingResolver(provider=MalformedProvider(), provider_enabled=True, exact_enabled=True))
        self.assertFalse(result.provider_used)


if __name__ == "__main__":
    unittest.main()
