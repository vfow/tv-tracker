import types
import unittest
from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

from tvtracker.notifications import backend as backend
import release_timing


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


class FakeCursor:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        pass


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor()
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.commits += 1


class EventCursor:
    def __init__(self):
        self.claimed = set()
        self.notifications = []
        self._row = None

    def execute(self, query, params=None):
        if "INSERT INTO tv_tracker_notification_events" in query:
            key = str(params[0])
            if key in self.claimed:
                self._row = None
            else:
                self.claimed.add(key)
                self._row = (key,)
            return
        if "INSERT INTO tv_tracker_notifications" in query:
            self.notifications.append(params)
            self._row = None

    def fetchone(self):
        return self._row


def notification_snapshot(air_date="2026-08-17"):
    return {
        "show_id": "123",
        "title": "Example Show",
        "tmdb_status": "Returning Series",
        "number_of_seasons": 1,
        "poster_path": "/poster.jpg",
        "backdrop_path": "/backdrop.jpg",
        "seasons": {},
        "episodes": [{
            "season_number": 1,
            "episode_number": 4,
            "name": "The Party",
            "air_date": air_date,
            "still_path": "/still.jpg",
        }],
    }


def tracker_show():
    return {
        "tmdb_id": "123",
        "title": "Example Show",
        "status": "watching",
        "episodes_watched": {},
    }


class NotificationTVmazeAuthorityTests(unittest.TestCase):
    zone = ZoneInfo("Asia/Kuala_Lumpur")

    def run_check(self, *, now, last_checked, flags, provider, air_date="2026-08-17"):
        settings = dict(backend.DEFAULT_NOTIFICATION_SETTINGS)
        settings.update({
            "timezone": "Asia/Kuala_Lumpur",
            "timezone_mode": "manual",
            "initialized_at": datetime(2026, 8, 1, tzinfo=self.zone),
            "last_checked_at": last_checked,
        })
        tracked = {"123": tracker_show()}
        current = notification_snapshot(air_date)
        previous = notification_snapshot(air_date)
        captured = []
        connection = FakeConnection()
        provider_module = types.SimpleNamespace(get_default_provider=lambda: provider)

        with (
            mock.patch.object(backend, "read_notification_settings", return_value=settings),
            mock.patch.object(backend, "_select_settings", return_value=settings),
            mock.patch.object(backend, "_tracked_show_rows", return_value=tracked),
            mock.patch.object(backend, "_read_baselines", return_value={"123": previous}),
            mock.patch.object(backend, "_fetch_snapshots", return_value=({"123": current}, 0)),
            mock.patch.object(backend, "provider_flags", return_value=flags),
            mock.patch.object(backend, "_process_candidate", side_effect=lambda cursor, candidate, current_settings: captured.append(candidate) or True),
            mock.patch.object(release_timing.importlib, "import_module", return_value=provider_module) as importer,
        ):
            result = backend.run_notification_check(
                lambda: connection,
                lambda path, params=None: {},
                now=now,
            )
        return result, captured, importer

    def test_notifications_flag_off_keeps_tmdb_only_and_does_not_query_provider(self):
        provider = StubProvider({
            "precision": "exact",
            "release_at": "2026-08-17T04:30:00Z",
            "release_date": "2026-08-17",
            "trusted": True,
        })
        result, captured, importer = self.run_check(
            now=datetime(2026, 8, 17, 12, 35, tzinfo=self.zone),
            last_checked=datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            flags={
                "master_enabled": True,
                "shadow_enabled": False,
                "upcoming_enabled": True,
                "notifications_enabled": False,
            },
            provider=provider,
        )
        self.assertTrue(result["ok"])
        self.assertFalse(any(item["kind"] == "new_episode" for item in captured))
        self.assertEqual(provider.calls, 0)
        importer.assert_not_called()

    def test_notifications_flag_on_uses_exact_provider_release_boundary(self):
        provider = StubProvider({
            "precision": "exact",
            "release_at": "2026-08-17T04:30:00Z",
            "release_date": "2026-08-17",
            "trusted": True,
        })
        before_result, before, _ = self.run_check(
            now=datetime(2026, 8, 17, 12, 25, tzinfo=self.zone),
            last_checked=datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            flags={
                "master_enabled": True,
                "shadow_enabled": False,
                "upcoming_enabled": True,
                "notifications_enabled": True,
            },
            provider=provider,
        )
        self.assertTrue(before_result["ok"])
        self.assertFalse(any(item["kind"] == "new_episode" for item in before))

        provider.calls = 0
        after_result, after, _ = self.run_check(
            now=datetime(2026, 8, 17, 12, 35, tzinfo=self.zone),
            last_checked=datetime(2026, 8, 17, 12, 0, tzinfo=self.zone),
            flags={
                "master_enabled": True,
                "shadow_enabled": False,
                "upcoming_enabled": True,
                "notifications_enabled": True,
            },
            provider=provider,
        )
        ready = [item for item in after if item["kind"] == "new_episode"]
        self.assertTrue(after_result["ok"])
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0]["event_key"], "new-episode:123:s1:e4")
        self.assertGreater(provider.calls, 0)

    def test_provider_failure_falls_back_to_tmdb_date_boundary(self):
        provider = StubProvider(error=TimeoutError("provider unavailable"))
        result, captured, _ = self.run_check(
            now=datetime(2026, 8, 17, 0, 5, tzinfo=self.zone),
            last_checked=datetime(2026, 8, 16, 23, 55, tzinfo=self.zone),
            flags={
                "master_enabled": True,
                "shadow_enabled": False,
                "upcoming_enabled": True,
                "notifications_enabled": True,
            },
            provider=provider,
        )
        ready = [item for item in captured if item["kind"] == "new_episode"]
        self.assertTrue(result["ok"])
        self.assertEqual(len(ready), 1)
        self.assertGreater(provider.calls, 0)

    def test_rejected_provider_candidate_falls_back_to_tmdb(self):
        provider = StubProvider(None)
        result, captured, _ = self.run_check(
            now=datetime(2026, 8, 17, 0, 5, tzinfo=self.zone),
            last_checked=datetime(2026, 8, 16, 23, 55, tzinfo=self.zone),
            flags={
                "master_enabled": True,
                "shadow_enabled": False,
                "upcoming_enabled": True,
                "notifications_enabled": True,
            },
            provider=provider,
        )
        self.assertTrue(result["ok"])
        self.assertEqual(len([item for item in captured if item["kind"] == "new_episode"]), 1)

    def test_date_only_provider_authority_uses_provider_calendar_day(self):
        provider = StubProvider({
            "precision": "date_only",
            "release_at": "",
            "release_date": "2026-08-18",
            "trusted": True,
        })
        result, captured, _ = self.run_check(
            now=datetime(2026, 8, 18, 0, 5, tzinfo=self.zone),
            last_checked=datetime(2026, 8, 17, 23, 55, tzinfo=self.zone),
            flags={
                "master_enabled": True,
                "shadow_enabled": False,
                "upcoming_enabled": True,
                "notifications_enabled": True,
            },
            provider=provider,
            air_date="2026-08-17",
        )
        ready = [item for item in captured if item["kind"] == "new_episode"]
        self.assertTrue(result["ok"])
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0]["event_date"], "2026-08-18")

    def test_same_episode_event_is_written_once(self):
        cursor = EventCursor()
        settings = dict(backend.DEFAULT_NOTIFICATION_SETTINGS)
        candidate = {
            "family": "new_episode",
            "kind": "new_episode",
            "event_key": "new-episode:123:s1:e4",
            "group_key": "new-episode:123:s1:e4",
            "show_id": "123",
            "title": "Example Show",
            "message": "Example Show S01E04 is now available",
            "image_path": "",
            "event_date": "2026-08-17",
            "payload": {"season": 1, "episode": 4},
        }
        self.assertTrue(backend._process_candidate(cursor, candidate, settings))
        self.assertFalse(backend._process_candidate(cursor, candidate, settings))
        self.assertEqual(len(cursor.notifications), 1)


if __name__ == "__main__":
    unittest.main()
