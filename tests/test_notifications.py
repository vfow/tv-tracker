import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from notification_engine import (
    collect_metadata_notification_candidates,
    collect_time_notification_candidates,
)


def snapshot(*, seasons=None, episodes=None, status="Returning Series"):
    return {
        "show_id": "123",
        "title": "Example Show",
        "tmdb_status": status,
        "number_of_seasons": len(seasons or {}),
        "poster_path": "/poster.jpg",
        "backdrop_path": "/backdrop.jpg",
        "seasons": seasons or {},
        "episodes": episodes or [],
    }


def tracker_show(status="watching", watched=None):
    return {
        "tmdb_id": "123",
        "title": "Example Show",
        "status": status,
        "episodes_watched": watched or {},
    }


class NotificationRuleTests(unittest.TestCase):
    zone = ZoneInfo("Asia/Kuala_Lumpur")

    def test_episode_becomes_notification_eligible_next_local_day(self):
        current = snapshot(
            seasons={"1": {"season_number": 1, "air_date": "2026-08-01"}},
            episodes=[{
                "season_number": 1,
                "episode_number": 4,
                "name": "The Party",
                "air_date": "2026-08-17",
                "still_path": "/still.jpg",
            }],
        )
        before = datetime(2026, 8, 17, 23, 59, tzinfo=self.zone)
        after = datetime(2026, 8, 18, 0, 1, tzinfo=self.zone)

        self.assertFalse(any(
            item["family"] == "new_episode"
            for item in collect_time_notification_candidates(
                current, tracker_show(), before, "Asia/Kuala_Lumpur"
            )
        ))

        ready = [
            item
            for item in collect_time_notification_candidates(
                current, tracker_show(), after, "Asia/Kuala_Lumpur"
            )
            if item["family"] == "new_episode"
        ]
        self.assertEqual(len(ready), 1)
        self.assertEqual(
            ready[0]["message"],
            "Example Show S01E04 - The Party aired yesterday",
        )

    def test_logged_episode_does_not_notify(self):
        current = snapshot(episodes=[{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": "2026-08-17",
        }])
        now = datetime(2026, 8, 18, 0, 1, tzinfo=self.zone)
        items = collect_time_notification_candidates(
            current,
            tracker_show(watched={"1": [4]}),
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertFalse(any(item["family"] == "new_episode" for item in items))

    def test_new_episode_only_applies_to_watching(self):
        current = snapshot(episodes=[{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": "2026-08-17",
        }])
        now = datetime(2026, 8, 18, 0, 1, tzinfo=self.zone)
        for status in ("paused", "finished", "plan", "dropped"):
            with self.subTest(status=status):
                items = collect_time_notification_candidates(
                    current,
                    tracker_show(status=status),
                    now,
                    "Asia/Kuala_Lumpur",
                )
                self.assertFalse(any(
                    item["family"] == "new_episode" for item in items
                ))

    def test_return_tomorrow_requires_fourteen_day_gap_and_watching(self):
        current = snapshot(episodes=[
            {
                "season_number": 1,
                "episode_number": 5,
                "name": "Five",
                "air_date": "2026-08-03",
            },
            {
                "season_number": 1,
                "episode_number": 6,
                "name": "Six",
                "air_date": "2026-08-18",
            },
        ])
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)
        returns = [
            item
            for item in collect_time_notification_candidates(
                current, tracker_show(), now, "Asia/Kuala_Lumpur"
            )
            if item["family"] == "returns_tomorrow"
        ]
        self.assertEqual(len(returns), 1)
        self.assertIn("returns tomorrow", returns[0]["message"])

        paused = collect_time_notification_candidates(
            current,
            tracker_show(status="paused"),
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertFalse(any(
            item["family"] == "returns_tomorrow" for item in paused
        ))

    def test_new_season_excludes_specials_and_combines_tomorrow_copy(self):
        previous = snapshot(
            seasons={"1": {"season_number": 1, "air_date": "2025-01-01"}}
        )
        current = snapshot(seasons={
            "0": {"season_number": 0, "air_date": "2026-01-01"},
            "1": {"season_number": 1, "air_date": "2025-01-01"},
            "2": {"season_number": 2, "air_date": "2026-08-18"},
        })
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)
        items = collect_metadata_notification_candidates(
            previous,
            current,
            "finished",
            now,
            "Asia/Kuala_Lumpur",
        )
        new_seasons = [item for item in items if item["family"] == "new_season"]
        self.assertEqual(len(new_seasons), 1)
        self.assertEqual(new_seasons[0]["payload"]["season"], 2)
        self.assertEqual(
            new_seasons[0]["combined_message"],
            "Example Show Season 2 premieres tomorrow",
        )

    def test_dropped_show_does_not_get_new_season(self):
        previous = snapshot(
            seasons={"1": {"season_number": 1, "air_date": "2025-01-01"}}
        )
        current = snapshot(seasons={
            "1": {"season_number": 1, "air_date": "2025-01-01"},
            "2": {"season_number": 2, "air_date": "2027-01-01"},
        })
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)
        items = collect_metadata_notification_candidates(
            previous,
            current,
            "dropped",
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertFalse(any(item["family"] == "new_season" for item in items))

    def test_season_premiere_tomorrow_allowed_statuses(self):
        current = snapshot(
            seasons={"2": {"season_number": 2, "air_date": "2026-08-18"}}
        )
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)
        for status in ("watching", "paused", "finished", "plan"):
            with self.subTest(status=status):
                items = collect_time_notification_candidates(
                    current,
                    tracker_show(status=status),
                    now,
                    "Asia/Kuala_Lumpur",
                )
                self.assertTrue(any(
                    item["family"] == "season_premiere_tomorrow"
                    for item in items
                ))

        dropped = collect_time_notification_candidates(
            current,
            tracker_show(status="dropped"),
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertFalse(any(
            item["family"] == "season_premiere_tomorrow" for item in dropped
        ))

    def test_status_and_premiere_date_updates(self):
        previous = snapshot(
            seasons={"2": {"season_number": 2, "air_date": "2026-09-01"}},
            status="Returning Series",
        )
        current = snapshot(
            seasons={"2": {"season_number": 2, "air_date": "2026-09-15"}},
            status="Canceled",
        )
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)
        items = collect_metadata_notification_candidates(
            previous,
            current,
            "watching",
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertTrue(any(item["kind"] == "canceled" for item in items))
        delayed = [item for item in items if item["kind"] == "delayed"]
        self.assertEqual(len(delayed), 1)
        self.assertEqual(delayed[0]["group_key"], "premiere-date:123:s2")


if __name__ == "__main__":
    unittest.main()
