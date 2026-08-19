import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from tvtracker.notifications.engine import (
    collect_metadata_notification_candidates,
    collect_time_notification_candidates,
    season_detail_requests_for_today,
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

    def test_watching_show_requests_yesterdays_season_detail_without_crashing(self):
        details = {
            "last_episode_to_air": {
                "season_number": 2,
                "episode_number": 4,
                "air_date": "2026-08-16",
            }
        }
        now = datetime(2026, 8, 17, 10, 0, tzinfo=self.zone)
        self.assertEqual(
            season_detail_requests_for_today(details, now, "Asia/Kuala_Lumpur", "watching"),
            {2},
        )
        self.assertEqual(
            season_detail_requests_for_today(details, now, "Asia/Kuala_Lumpur", "paused"),
            set(),
        )

    def test_episode_notifies_when_canonical_release_boundary_is_crossed(self):
        current = snapshot(episodes=[{
            "season_number": 1, "episode_number": 4, "name": "The Party",
            "air_date": "2026-08-17", "still_path": "/still.jpg",
        }])
        release_at = datetime(2026, 8, 17, 21, 0, tzinfo=self.zone)
        before = datetime(2026, 8, 17, 20, 59, tzinfo=self.zone)
        after = datetime(2026, 8, 17, 21, 1, tzinfo=self.zone)
        lookup = lambda *_: release_at

        self.assertFalse(any(item["kind"] == "new_episode" for item in
            collect_time_notification_candidates(current, tracker_show(), before, "Asia/Kuala_Lumpur",
                last_checked_at=datetime(2026, 8, 17, 20, 0, tzinfo=self.zone), release_lookup=lookup)))
        ready = [item for item in collect_time_notification_candidates(
            current, tracker_show(), after, "Asia/Kuala_Lumpur",
            last_checked_at=datetime(2026, 8, 17, 20, 0, tzinfo=self.zone), release_lookup=lookup
        ) if item["kind"] == "new_episode"]
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0]["message"], "Example Show S01E04 - The Party is now available")
        self.assertEqual(ready[0]["event_key"], "new-episode:123:s1:e4")

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

    def test_unwatched_episode_reminder_fires_five_days_after_loggable_day(self):
        current = snapshot(episodes=[{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": "2026-08-17",
            "still_path": "/still.jpg",
        }])
        now = datetime(2026, 8, 22, 0, 5, tzinfo=self.zone)
        last_checked = datetime(2026, 8, 21, 23, 5, tzinfo=self.zone)
        reminders = [
            item
            for item in collect_time_notification_candidates(
                current,
                tracker_show(),
                now,
                "Asia/Kuala_Lumpur",
                last_checked_at=last_checked,
            )
            if item["kind"] == "unwatched_episode_reminder"
        ]
        self.assertEqual(len(reminders), 1)
        self.assertEqual(reminders[0]["family"], "new_episode")
        self.assertEqual(
            reminders[0]["message"],
            "You still haven't watched Example Show S01E04",
        )
        self.assertEqual(
            reminders[0]["event_key"],
            "unwatched-episode-reminder:123:s1:e4:5d",
        )

        too_early = collect_time_notification_candidates(
            current,
            tracker_show(),
            datetime(2026, 8, 20, 12, 0, tzinfo=self.zone),
            "Asia/Kuala_Lumpur",
            last_checked_at=datetime(2026, 8, 21, 12, 0, tzinfo=self.zone),
        )
        self.assertFalse(any(
            item["kind"] == "unwatched_episode_reminder" for item in too_early
        ))

    def test_unwatched_episode_reminder_skips_watched_and_non_watching(self):
        current = snapshot(episodes=[{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": "2026-08-17",
        }])
        now = datetime(2026, 8, 22, 12, 0, tzinfo=self.zone)
        last_checked = datetime(2026, 8, 21, 12, 0, tzinfo=self.zone)

        watched = collect_time_notification_candidates(
            current,
            tracker_show(watched={"1": [4]}),
            now,
            "Asia/Kuala_Lumpur",
            last_checked_at=last_checked,
        )
        self.assertFalse(any(
            item["kind"] == "unwatched_episode_reminder" for item in watched
        ))

        paused = collect_time_notification_candidates(
            current,
            tracker_show(status="paused"),
            now,
            "Asia/Kuala_Lumpur",
            last_checked_at=last_checked,
        )
        self.assertFalse(any(
            item["kind"] == "unwatched_episode_reminder" for item in paused
        ))

    def test_unwatched_reminder_catches_worker_delay_without_historical_backfill(self):
        current = snapshot(episodes=[{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": "2026-08-17",
        }])
        now = datetime(2026, 8, 23, 9, 0, tzinfo=self.zone)

        delayed = collect_time_notification_candidates(
            current,
            tracker_show(),
            now,
            "Asia/Kuala_Lumpur",
            last_checked_at=datetime(2026, 8, 21, 20, 0, tzinfo=self.zone),
        )
        self.assertTrue(any(
            item["kind"] == "unwatched_episode_reminder" for item in delayed
        ))

        already_checked_after_due = collect_time_notification_candidates(
            current,
            tracker_show(),
            now,
            "Asia/Kuala_Lumpur",
            last_checked_at=datetime(2026, 8, 22, 20, 0, tzinfo=self.zone),
        )
        self.assertFalse(any(
            item["kind"] == "unwatched_episode_reminder"
            for item in already_checked_after_due
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

    def test_return_tomorrow_uses_canonical_gap_for_both_episodes(self):
        current = snapshot(episodes=[
            {
                "season_number": 1,
                "episode_number": 5,
                "name": "Five",
                "air_date": "2026-08-05",
            },
            {
                "season_number": 1,
                "episode_number": 6,
                "name": "Six",
                "air_date": "2026-08-18",
            },
        ])
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)

        def canonical_lookup(season, episode, air_date):
            if episode == 5:
                return datetime(2026, 8, 3, 21, 0, tzinfo=self.zone)
            return datetime(2026, 8, 18, 21, 0, tzinfo=self.zone)

        returns = [
            item for item in collect_time_notification_candidates(
                current,
                tracker_show(),
                now,
                "Asia/Kuala_Lumpur",
                release_lookup=canonical_lookup,
            )
            if item["family"] == "returns_tomorrow"
        ]
        self.assertEqual(len(returns), 1)
        self.assertEqual(returns[0]["event_date"], "2026-08-18")

        def shortened_gap_lookup(season, episode, air_date):
            if episode == 5:
                return datetime(2026, 8, 5, 21, 0, tzinfo=self.zone)
            return datetime(2026, 8, 18, 21, 0, tzinfo=self.zone)

        blocked = collect_time_notification_candidates(
            snapshot(episodes=[
                {"season_number": 1, "episode_number": 5, "name": "Five", "air_date": "2026-08-03"},
                {"season_number": 1, "episode_number": 6, "name": "Six", "air_date": "2026-08-18"},
            ]),
            tracker_show(),
            now,
            "Asia/Kuala_Lumpur",
            release_lookup=shortened_gap_lookup,
        )
        self.assertFalse(any(item["family"] == "returns_tomorrow" for item in blocked))

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

    def test_new_season_combined_copy_uses_canonical_premiere_day(self):
        previous = snapshot(
            seasons={"1": {"season_number": 1, "air_date": "2025-01-01"}}
        )
        current = snapshot(seasons={
            "1": {"season_number": 1, "air_date": "2025-01-01"},
            "2": {"season_number": 2, "air_date": "2026-08-18"},
        })
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)

        shifted = collect_metadata_notification_candidates(
            previous,
            current,
            "finished",
            now,
            "Asia/Kuala_Lumpur",
            release_lookup=lambda *_: datetime(2026, 8, 19, 21, 0, tzinfo=self.zone),
        )
        candidate = next(item for item in shifted if item["family"] == "new_season")
        self.assertNotIn("combined_message", candidate)

        canonical_tomorrow = collect_metadata_notification_candidates(
            previous,
            snapshot(seasons={
                "1": {"season_number": 1, "air_date": "2025-01-01"},
                "2": {"season_number": 2, "air_date": "2026-08-19"},
            }),
            "finished",
            now,
            "Asia/Kuala_Lumpur",
            release_lookup=lambda *_: datetime(2026, 8, 18, 21, 0, tzinfo=self.zone),
        )
        candidate = next(item for item in canonical_tomorrow if item["family"] == "new_season")
        self.assertEqual(candidate["combined_message"], "Example Show Season 2 premieres tomorrow")
        self.assertEqual(candidate["event_date"], "2026-08-18")

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

    def test_season_premiere_tomorrow_uses_canonical_episode_one_day(self):
        now = datetime(2026, 8, 17, 12, 0, tzinfo=self.zone)
        raw_tomorrow = snapshot(
            seasons={"2": {"season_number": 2, "air_date": "2026-08-18"}}
        )
        shifted = collect_time_notification_candidates(
            raw_tomorrow,
            tracker_show(status="finished"),
            now,
            "Asia/Kuala_Lumpur",
            release_lookup=lambda season, episode, air_date: datetime(2026, 8, 19, 1, 0, tzinfo=self.zone),
        )
        self.assertFalse(any(item["family"] == "season_premiere_tomorrow" for item in shifted))

        raw_day_after = snapshot(
            seasons={"2": {"season_number": 2, "air_date": "2026-08-19"}}
        )
        canonical = collect_time_notification_candidates(
            raw_day_after,
            tracker_show(status="finished"),
            now,
            "Asia/Kuala_Lumpur",
            release_lookup=lambda season, episode, air_date: datetime(2026, 8, 18, 21, 0, tzinfo=self.zone),
        )
        premiere = [item for item in canonical if item["family"] == "season_premiere_tomorrow"]
        self.assertEqual(len(premiere), 1)
        self.assertEqual(premiere[0]["event_date"], "2026-08-18")

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
