from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if text.count(old) < count:
        raise RuntimeError(f"{path}: patch needle not found: {old[:120]!r}")
    target.write_text(text.replace(old, new, count), encoding="utf-8")


replace("notification_engine.py", "from typing import Any", "from typing import Any, Callable")
replace(
    "notification_engine.py",
    """    timezone_name: str,\n    last_checked_at: datetime | None = None,\n) -> list[dict[str, Any]]:""",
    """    timezone_name: str,\n    last_checked_at: datetime | None = None,\n    release_lookup: Callable[[int, int, str], datetime | None] | None = None,\n) -> list[dict[str, Any]]:""",
)
replace("notification_engine.py", "    yesterday = local_today - timedelta(days=1)\n", "")
replace(
    "notification_engine.py",
    """    if tracker_status == \"watching\":\n        last_checked_day = None\n        if isinstance(last_checked_at, datetime):\n            previous_check = last_checked_at\n            if previous_check.tzinfo is None:\n                previous_check = previous_check.replace(tzinfo=timezone.utc)\n            last_checked_day = previous_check.astimezone(zone).date()\n""",
    """    if tracker_status == \"watching\":\n        previous_check = None\n        last_checked_day = None\n        if isinstance(last_checked_at, datetime):\n            previous_check = last_checked_at\n            if previous_check.tzinfo is None:\n                previous_check = previous_check.replace(tzinfo=timezone.utc)\n            previous_check = previous_check.astimezone(timezone.utc)\n            last_checked_day = previous_check.astimezone(zone).date()\n""",
)
replace(
    "notification_engine.py",
    """            if air_day == yesterday:\n                candidates.append(\n                    _base_candidate(\n                        snapshot,\n                        family=\"new_episode\",\n                        kind=\"new_episode\",\n                        event_key=f\"new-episode:{show_id}:s{season_number}:e{episode_number}\",\n                        group_key=f\"new-episode:{show_id}:s{season_number}:e{episode_number}\",\n                        message=f\"{title} {code}{suffix} aired yesterday\",\n                        event_date=air_date,\n                        episode=episode,\n                        payload={\"season\": season_number, \"episode\": episode_number},\n                    )\n                )\n\n            available_day = air_day + timedelta(days=1)\n            reminder_day = available_day + timedelta(days=5)\n""",
    """            available_at = None\n            if callable(release_lookup):\n                try:\n                    available_at = release_lookup(season_number, episode_number, air_date)\n                except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError):\n                    available_at = None\n            if available_at is None:\n                available_at = datetime.combine(air_day, datetime.min.time(), tzinfo=zone)\n            elif available_at.tzinfo is None:\n                available_at = None\n\n            if available_at is None:\n                continue\n            available_at_utc = available_at.astimezone(timezone.utc)\n            if previous_check is not None and previous_check < available_at_utc <= now.astimezone(timezone.utc):\n                candidates.append(\n                    _base_candidate(\n                        snapshot,\n                        family=\"new_episode\",\n                        kind=\"new_episode\",\n                        event_key=f\"new-episode:{show_id}:s{season_number}:e{episode_number}\",\n                        group_key=f\"new-episode:{show_id}:s{season_number}:e{episode_number}\",\n                        message=f\"{title} {code}{suffix} is now available\",\n                        event_date=available_at_utc.astimezone(zone).date().isoformat(),\n                        episode=episode,\n                        payload={\"season\": season_number, \"episode\": episode_number},\n                    )\n                )\n\n            available_day = available_at_utc.astimezone(zone).date()\n            reminder_day = available_day + timedelta(days=5)\n""",
)
replace(
    "notification_engine.py",
    """                air_date = str(episode.get(\"air_date\") or \"\")\n                air_day = parse_calendar_date(air_date)\n                if air_day != tomorrow:\n                    continue\n""",
    """                air_date = str(episode.get(\"air_date\") or \"\")\n                air_day = parse_calendar_date(air_date)\n                if not air_day:\n                    continue\n                return_at = None\n                if callable(release_lookup):\n                    try:\n                        return_at = release_lookup(season_number, int(episode[\"episode_number\"]), air_date)\n                    except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError):\n                        return_at = None\n                return_day = return_at.astimezone(zone).date() if return_at and return_at.tzinfo else air_day\n                if return_day != tomorrow:\n                    continue\n""",
)

replace(
    "notifications_backend.py",
    """from psycopg.types.json import Jsonb\n\nfrom notification_engine import (""",
    """from psycopg.types.json import Jsonb\n\nfrom release_timing import ReleaseTimingResolver, parse_aware_datetime\nfrom notification_engine import (""",
)
replace(
    "notifications_backend.py",
    """    initialized = settings.get(\"initialized_at\") is not None\n    created = 0\n    processed = 0\n""",
    """    initialized = settings.get(\"initialized_at\") is not None\n    created = 0\n    processed = 0\n    timing_resolver = ReleaseTimingResolver()\n""",
)
replace(
    "notifications_backend.py",
    """                timed = collect_time_notification_candidates(\n                    current,\n                    tracker_show,\n                    current_time,\n                    timezone_name,\n                    last_checked_at=settings.get(\"last_checked_at\"),\n                )""",
    """                def release_lookup(season_number: int, episode_number: int, air_date: str) -> datetime | None:\n                    timing = timing_resolver.resolve(\n                        tmdb_id=int(show_id),\n                        season_number=season_number,\n                        episode_number=episode_number,\n                        tmdb_air_date=air_date,\n                        timezone_name=timezone_name,\n                    )\n                    if not timing:\n                        return None\n                    return parse_aware_datetime(timing.release_at or timing.eligible_at)\n\n                timed = collect_time_notification_candidates(\n                    current,\n                    tracker_show,\n                    current_time,\n                    timezone_name,\n                    last_checked_at=settings.get(\"last_checked_at\"),\n                    release_lookup=release_lookup,\n                )""",
)

# Replace the two old +1-day notification tests with canonical boundary tests.
test_path = ROOT / "tests/test_notifications.py"
test_text = test_path.read_text(encoding="utf-8")
start = test_text.index("    def test_episode_becomes_notification_eligible_next_local_day")
end = test_text.index("    def test_logged_episode_does_not_notify", start)
replacement = '''    def test_episode_notifies_when_canonical_release_boundary_is_crossed(self):\n        current = snapshot(episodes=[{\n            "season_number": 1, "episode_number": 4, "name": "The Party",\n            "air_date": "2026-08-17", "still_path": "/still.jpg",\n        }])\n        release_at = datetime(2026, 8, 17, 21, 0, tzinfo=self.zone)\n        before = datetime(2026, 8, 17, 20, 59, tzinfo=self.zone)\n        after = datetime(2026, 8, 17, 21, 1, tzinfo=self.zone)\n        lookup = lambda *_: release_at\n\n        self.assertFalse(any(item["kind"] == "new_episode" for item in\n            collect_time_notification_candidates(current, tracker_show(), before, "Asia/Kuala_Lumpur",\n                last_checked_at=datetime(2026, 8, 17, 20, 0, tzinfo=self.zone), release_lookup=lookup)))\n        ready = [item for item in collect_time_notification_candidates(\n            current, tracker_show(), after, "Asia/Kuala_Lumpur",\n            last_checked_at=datetime(2026, 8, 17, 20, 0, tzinfo=self.zone), release_lookup=lookup\n        ) if item["kind"] == "new_episode"]\n        self.assertEqual(len(ready), 1)\n        self.assertEqual(ready[0]["message"], "Example Show S01E04 - The Party is now available")\n        self.assertEqual(ready[0]["event_key"], "new-episode:123:s1:e4")\n\n'''
test_text = test_text[:start] + replacement + test_text[end:]
# Canonical date-only availability is the air date, so the 5-day reminder is Aug 22 rather than Aug 23.
test_text = test_text.replace("now = datetime(2026, 8, 23, 0, 5, tzinfo=self.zone)", "now = datetime(2026, 8, 22, 0, 5, tzinfo=self.zone)")
test_text = test_text.replace("last_checked = datetime(2026, 8, 22, 23, 5, tzinfo=self.zone)", "last_checked = datetime(2026, 8, 21, 23, 5, tzinfo=self.zone)")
test_text = test_text.replace("datetime(2026, 8, 22, 12, 0, tzinfo=self.zone)", "datetime(2026, 8, 21, 12, 0, tzinfo=self.zone)", 1)
test_text = test_text.replace("datetime(2026, 8, 21, 12, 0, tzinfo=self.zone)", "datetime(2026, 8, 20, 12, 0, tzinfo=self.zone)", 1)
test_text = test_text.replace("now = datetime(2026, 8, 23, 12, 0, tzinfo=self.zone)", "now = datetime(2026, 8, 22, 12, 0, tzinfo=self.zone)")
test_text = test_text.replace("last_checked = datetime(2026, 8, 22, 12, 0, tzinfo=self.zone)", "last_checked = datetime(2026, 8, 21, 12, 0, tzinfo=self.zone)")
test_text = test_text.replace("now = datetime(2026, 8, 24, 9, 0, tzinfo=self.zone)", "now = datetime(2026, 8, 23, 9, 0, tzinfo=self.zone)")
test_text = test_text.replace("datetime(2026, 8, 22, 20, 0, tzinfo=self.zone)", "datetime(2026, 8, 21, 20, 0, tzinfo=self.zone)")
test_text = test_text.replace("datetime(2026, 8, 23, 20, 0, tzinfo=self.zone)", "datetime(2026, 8, 22, 20, 0, tzinfo=self.zone)")
test_path.write_text(test_text, encoding="utf-8")

print("Canonical notification timing patches applied.")
