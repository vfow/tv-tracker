from datetime import date
import unittest

from release_timing import ReleaseTimingResolver, start_of_date_utc, valid_timezone


class StubProvider:
    def __init__(self, value):
        self.value = value

    def resolve_episode(self, **kwargs):
        return self.value


class Phase6TimezonePolicyTests(unittest.TestCase):
    def test_date_only_boundary_is_start_of_canonical_day_in_effective_timezone(self):
        self.assertEqual(
            start_of_date_utc(date(2026, 8, 16), "Asia/Kuala_Lumpur").isoformat(),
            "2026-08-15T16:00:00+00:00",
        )
        self.assertEqual(
            start_of_date_utc(date(2026, 8, 16), "America/New_York").isoformat(),
            "2026-08-16T04:00:00+00:00",
        )

    def test_exact_release_keeps_absolute_instant_and_converts_display_date(self):
        provider = StubProvider({
            "precision": "exact",
            "release_at": "2026-08-16T23:30:00Z",
            "release_date": "2026-08-16",
            "trusted": True,
        })
        result = ReleaseTimingResolver(
            provider=provider,
            provider_enabled=True,
            exact_enabled=True,
        ).resolve(
            tmdb_id=10,
            season_number=1,
            episode_number=1,
            tmdb_air_date="2026-08-16",
            timezone_name="Asia/Kuala_Lumpur",
        )
        self.assertIsNotNone(result)
        payload = result.to_api("Asia/Kuala_Lumpur")
        self.assertEqual(payload["releaseAt"], "2026-08-16T23:30:00+00:00")
        self.assertEqual(payload["displayDate"], "2026-08-17")
        self.assertEqual(payload["precision"], "exact")
        self.assertTrue(payload["providerUsed"])

    def test_date_only_release_never_invents_confirmed_midnight_time(self):
        provider = StubProvider({
            "precision": "date_only",
            "release_at": "",
            "release_date": "2026-08-17",
            "trusted": True,
        })
        result = ReleaseTimingResolver(
            provider=provider,
            provider_enabled=True,
            date_only_enabled=True,
        ).resolve(
            tmdb_id=10,
            season_number=1,
            episode_number=2,
            tmdb_air_date="2026-08-16",
            timezone_name="America/New_York",
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.release_at, "")
        payload = result.to_api("America/New_York")
        self.assertIsNone(payload["releaseAt"])
        self.assertEqual(payload["releaseDate"], "2026-08-17")
        self.assertEqual(payload["displayDate"], "2026-08-17")
        self.assertEqual(payload["precision"], "date")
        self.assertEqual(payload["eligibleAt"], "2026-08-17T04:00:00+00:00")

    def test_invalid_timezone_is_rejected_instead_of_silently_guessing(self):
        with self.assertRaises(ValueError):
            valid_timezone("Not/A_Timezone")


if __name__ == "__main__":
    unittest.main()
