import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from notification_engine import (
    collect_metadata_notification_candidates,
    collect_time_notification_candidates,
)


def snapshot(*, seasons=None, episodes=None):
    return {
        "show_id": "123",
        "title": "Example Show",
        "tmdb_status": "Returning Series",
        "number_of_seasons": len(seasons or {}),
        "poster_path": "/poster.jpg",
        "backdrop_path": "/backdrop.jpg",
        "seasons": seasons or {},
        "episodes": episodes or [],
    }


def tracker_show(status="watching"):
    return {
        "tmdb_id": "123",
        "title": "Example Show",
        "status": status,
        "episodes_watched": {},
    }


class MissingTmdbDateNotificationTests(unittest.TestCase):
    zone = ZoneInfo("Asia/Kuala_Lumpur")

    def test_new_episode_can_use_canonical_timing_without_tmdb_air_date(self):
        current = snapshot(episodes=[{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": "",
        }])
        seen = []

        def release_lookup(season, episode, air_date):
            seen.append((season, episode, air_date))
            return datetime(2026, 8, 17, 12, 30, tzinfo=self.zone)

        items = collect_time_notification_candidates(
            current,
            tracker_show(),
            datetime(2026, 8, 17, 12, 35, tzinfo=self.zone),
            "Asia/Kuala_Lumpur",
            last_checked_at=datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            release_lookup=release_lookup,
        )
        ready = [item for item in items if item["kind"] == "new_episode"]
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0]["event_date"], "2026-08-17")
        self.assertIn((1, 4, ""), seen)

    def test_season_premiere_prefers_episode_one_tmdb_air_date(self):
        current = snapshot(
            seasons={"2": {"season_number": 2, "air_date": "2026-08-19"}},
            episodes=[{
                "season_number": 2,
                "episode_number": 1,
                "name": "Premiere",
                "air_date": "2026-08-18",
            }],
        )
        seen = []

        def release_lookup(season, episode, air_date):
            seen.append((season, episode, air_date))
            if air_date == "2026-08-18":
                return datetime(2026, 8, 18, 21, 0, tzinfo=self.zone)
            return datetime(2026, 8, 19, 21, 0, tzinfo=self.zone)

        items = collect_time_notification_candidates(
            current,
            tracker_show(status="finished"),
            datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            "Asia/Kuala_Lumpur",
            release_lookup=release_lookup,
        )
        premiere = [item for item in items if item["family"] == "season_premiere_tomorrow"]
        self.assertEqual(len(premiere), 1)
        self.assertEqual(premiere[0]["event_date"], "2026-08-18")
        self.assertEqual(seen, [(2, 1, "2026-08-18")])

    def test_missing_tmdb_date_and_missing_provider_does_not_invent_timing(self):
        current = snapshot(
            seasons={"2": {"season_number": 2, "air_date": ""}},
            episodes=[{
                "season_number": 2,
                "episode_number": 1,
                "name": "Premiere",
                "air_date": "",
            }],
        )
        seen = []

        def release_lookup(season, episode, air_date):
            seen.append((season, episode, air_date))
            return None

        items = collect_time_notification_candidates(
            current,
            tracker_show(status="watching"),
            datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            "Asia/Kuala_Lumpur",
            last_checked_at=datetime(2026, 8, 17, 11, 0, tzinfo=self.zone),
            release_lookup=release_lookup,
        )
        self.assertFalse(any(item["family"] == "season_premiere_tomorrow" for item in items))
        self.assertFalse(any(item["kind"] == "new_episode" for item in items))
        self.assertTrue(any(air_date == "" for _, _, air_date in seen))

    def test_new_season_combined_copy_uses_episode_one_date(self):
        previous = snapshot(seasons={"1": {"season_number": 1, "air_date": "2025-01-01"}})
        current = snapshot(
            seasons={
                "1": {"season_number": 1, "air_date": "2025-01-01"},
                "2": {"season_number": 2, "air_date": "2026-08-19"},
            },
            episodes=[{
                "season_number": 2,
                "episode_number": 1,
                "name": "Premiere",
                "air_date": "2026-08-18",
            }],
        )
        seen = []

        def release_lookup(season, episode, air_date):
            seen.append((season, episode, air_date))
            return datetime(2026, 8, 18, 21, 0, tzinfo=self.zone)

        items = collect_metadata_notification_candidates(
            previous,
            current,
            "finished",
            datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            "Asia/Kuala_Lumpur",
            release_lookup=release_lookup,
        )
        candidate = next(item for item in items if item["family"] == "new_season")
        self.assertEqual(candidate["combined_message"], "Example Show Season 2 premieres tomorrow")
        self.assertEqual(candidate["event_date"], "2026-08-18")
        self.assertEqual(seen, [(2, 1, "2026-08-18")])


if __name__ == "__main__":
    unittest.main()
