import unittest
from datetime import datetime, timezone

from tvtracker.notifications.engine import collect_metadata_notification_candidates


def snapshot(status: str) -> dict:
    return {
        "show_id": "123",
        "title": "Example Show",
        "tmdb_status": status,
        "number_of_seasons": 0,
        "poster_path": "",
        "backdrop_path": "",
        "seasons": {},
        "episodes": [],
    }


class EndedNotificationSuppressionTests(unittest.TestCase):
    def test_ended_status_is_suppressed_but_cancellation_remains(self):
        now = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
        previous = snapshot("Returning Series")

        ended = collect_metadata_notification_candidates(
            previous,
            snapshot("Ended"),
            "watching",
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertFalse(any(item.get("kind") == "ended" for item in ended))

        canceled = collect_metadata_notification_candidates(
            previous,
            snapshot("Canceled"),
            "watching",
            now,
            "Asia/Kuala_Lumpur",
        )
        self.assertTrue(any(item.get("kind") == "canceled" for item in canceled))


if __name__ == "__main__":
    unittest.main()
