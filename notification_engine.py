from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


NOTIFICATION_FAMILIES = (
    "new_season",
    "season_premiere_tomorrow",
    "new_episode",
    "returns_tomorrow",
    "canceled_ended",
    "premiere_date_updates",
)

SEASON_PREMIERE_STATUSES = {"watching", "paused", "finished", "plan"}
MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


def notification_zone(timezone_name: str) -> ZoneInfo:
    clean = str(timezone_name or "").strip()
    if not clean or len(clean) > 80:
        raise ValueError("A valid notification timezone is required")
    try:
        return ZoneInfo(clean)
    except ZoneInfoNotFoundError as error:
        raise ValueError("A valid notification timezone is required") from error


def parse_calendar_date(value: Any) -> date | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    try:
        parsed = date.fromisoformat(clean)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == clean else None


def format_calendar_date(value: Any) -> str:
    parsed = parse_calendar_date(value)
    if not parsed:
        return ""
    return f"{MONTH_NAMES[parsed.month - 1]} {parsed.day}, {parsed.year}"


def normalize_tracker_status(value: Any) -> str:
    clean = str(value or "").strip().lower()
    if clean == "completed":
        return "finished"
    return clean


def normalize_tmdb_status(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "-")


def normalize_episode(raw: Any, season_number: int | None = None) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    season = int(raw.get("season_number") or season_number or 0)
    episode = int(raw.get("episode_number") or raw.get("episode") or 0)
    if season < 1 or episode < 1:
        return None
    return {
        "season_number": season,
        "episode_number": episode,
        "name": str(raw.get("name") or "").strip(),
        "air_date": str(raw.get("air_date") or "").strip(),
        "still_path": str(raw.get("still_path") or "").strip(),
    }


def _episode_identity(episode: dict[str, Any]) -> tuple[int, int]:
    return int(episode["season_number"]), int(episode["episode_number"])


def _episode_map(snapshot: dict[str, Any]) -> dict[tuple[int, int], dict[str, Any]]:
    result: dict[tuple[int, int], dict[str, Any]] = {}
    for raw in snapshot.get("episodes") or []:
        episode = normalize_episode(raw)
        if episode:
            result[_episode_identity(episode)] = episode
    return result


def _clean_season_number(value: Any) -> int:
    try:
        season = int(value)
    except (TypeError, ValueError):
        return 0
    return season if season >= 1 else 0


def build_stored_notification_snapshot(show: dict[str, Any]) -> dict[str, Any]:
    show = show if isinstance(show, dict) else {}
    show_id = str(show.get("tmdb_id") or show.get("id") or "").strip()
    seasons: dict[str, dict[str, Any]] = {}

    raw_seasons = show.get("_season_details")
    if isinstance(raw_seasons, dict):
        for raw_number, raw_season in raw_seasons.items():
            season_number = _clean_season_number(raw_number)
            if not season_number or not isinstance(raw_season, dict):
                continue
            seasons[str(season_number)] = {
                "season_number": season_number,
                "air_date": str(raw_season.get("air_date") or "").strip(),
                "poster_path": str(raw_season.get("poster_path") or "").strip(),
            }

    total_seasons = max(0, int(show.get("number_of_seasons") or 0))
    for season_number in range(1, total_seasons + 1):
        seasons.setdefault(
            str(season_number),
            {"season_number": season_number, "air_date": "", "poster_path": ""},
        )

    episodes: dict[tuple[int, int], dict[str, Any]] = {}
    raw_episode_lists = show.get("_episode_list")
    if isinstance(raw_episode_lists, dict):
        for raw_number, raw_list in raw_episode_lists.items():
            season_number = _clean_season_number(raw_number)
            if not season_number or not isinstance(raw_list, list):
                continue
            for raw_episode in raw_list:
                episode = normalize_episode(raw_episode, season_number)
                if episode:
                    episodes[_episode_identity(episode)] = episode

    for key in ("last_episode_to_air", "next_episode_to_air"):
        episode = normalize_episode(show.get(key))
        if episode:
            episodes[_episode_identity(episode)] = episode
            season_key = str(episode["season_number"])
            if season_key not in seasons:
                seasons[season_key] = {
                    "season_number": episode["season_number"],
                    "air_date": episode["air_date"] if episode["episode_number"] == 1 else "",
                    "poster_path": "",
                }

    return {
        "show_id": show_id,
        "title": str(show.get("title") or show.get("name") or "Untitled").strip() or "Untitled",
        "tmdb_status": str(show.get("tmdb_status") or "").strip(),
        "number_of_seasons": max(total_seasons, *(list(map(int, seasons.keys())) or [0])),
        "poster_path": str(show.get("poster_path") or "").strip(),
        "backdrop_path": str(show.get("backdrop_path") or "").strip(),
        "seasons": seasons,
        "episodes": sorted(episodes.values(), key=lambda item: _episode_identity(item)),
    }


def build_tmdb_notification_snapshot(
    details: dict[str, Any],
    previous: dict[str, Any] | None = None,
    season_payloads: dict[int, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    details = details if isinstance(details, dict) else {}
    previous = previous if isinstance(previous, dict) else {}
    show_id = str(details.get("id") or previous.get("show_id") or "").strip()

    seasons: dict[str, dict[str, Any]] = {}
    for raw_season in details.get("seasons") or []:
        if not isinstance(raw_season, dict):
            continue
        season_number = _clean_season_number(raw_season.get("season_number"))
        if not season_number:
            continue
        seasons[str(season_number)] = {
            "season_number": season_number,
            "air_date": str(raw_season.get("air_date") or "").strip(),
            "poster_path": str(raw_season.get("poster_path") or "").strip(),
        }

    episodes = _episode_map(previous)

    for key in ("last_episode_to_air", "next_episode_to_air"):
        episode = normalize_episode(details.get(key))
        if episode:
            episodes[_episode_identity(episode)] = episode

    for raw_number, payload in (season_payloads or {}).items():
        season_number = _clean_season_number(raw_number)
        if not season_number or not isinstance(payload, dict):
            continue
        seasons.setdefault(
            str(season_number),
            {
                "season_number": season_number,
                "air_date": str(payload.get("air_date") or "").strip(),
                "poster_path": str(payload.get("poster_path") or "").strip(),
            },
        )
        for key in [key for key in episodes if key[0] == season_number]:
            episodes.pop(key, None)
        for raw_episode in payload.get("episodes") or []:
            episode = normalize_episode(raw_episode, season_number)
            if episode:
                episodes[_episode_identity(episode)] = episode

    return {
        "show_id": show_id,
        "title": str(details.get("name") or previous.get("title") or "Untitled").strip() or "Untitled",
        "tmdb_status": str(details.get("status") or previous.get("tmdb_status") or "").strip(),
        "number_of_seasons": max(
            int(details.get("number_of_seasons") or 0),
            *(list(map(int, seasons.keys())) or [0]),
        ),
        "poster_path": str(details.get("poster_path") or previous.get("poster_path") or "").strip(),
        "backdrop_path": str(details.get("backdrop_path") or previous.get("backdrop_path") or "").strip(),
        "seasons": seasons,
        "episodes": sorted(episodes.values(), key=lambda item: _episode_identity(item)),
    }


def season_detail_requests_for_today(
    details: dict[str, Any],
    now: datetime,
    timezone_name: str,
    tracker_status: str,
) -> set[int]:
    if normalize_tracker_status(tracker_status) != "watching":
        return set()
    local_today = now.astimezone(notification_zone(timezone_name)).date()
    yesterday = local_today - timedelta(days=1)
    last_episode = normalize_episode(details.get("last_episode_to_air"))
    if last_episode and parse_calendar_date(last_episode.get("air_date")) == yesterday:
        return {int(last_episode["season_number"])}
    return set()


def _image_for(snapshot: dict[str, Any], episode: dict[str, Any] | None = None) -> str:
    if episode and episode.get("still_path"):
        return str(episode["still_path"])
    return str(snapshot.get("backdrop_path") or snapshot.get("poster_path") or "")


def _base_candidate(
    snapshot: dict[str, Any],
    *,
    family: str,
    kind: str,
    event_key: str,
    group_key: str,
    message: str,
    event_date: str = "",
    episode: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "family": family,
        "kind": kind,
        "event_key": event_key,
        "group_key": group_key,
        "show_id": str(snapshot.get("show_id") or ""),
        "title": str(snapshot.get("title") or "Untitled"),
        "message": message,
        "image_path": _image_for(snapshot, episode),
        "event_date": event_date,
        "payload": payload or {},
    }


def premiere_tomorrow_event_key(show_id: str, season_number: int, air_date: str = "") -> str:
    return f"season-premiere-tomorrow:{show_id}:s{season_number}"


def _episode_air_date(
    snapshot: dict[str, Any],
    season_number: int,
    episode_number: int,
) -> str:
    for raw in snapshot.get("episodes") or []:
        episode = normalize_episode(raw)
        if not episode:
            continue
        if (
            int(episode["season_number"]) == int(season_number)
            and int(episode["episode_number"]) == int(episode_number)
        ):
            air_date = str(episode.get("air_date") or "").strip()
            return air_date if parse_calendar_date(air_date) else ""
    return ""


def _season_premiere_air_date(
    snapshot: dict[str, Any],
    season_number: int,
    season: dict[str, Any],
) -> str:
    episode_air_date = _episode_air_date(snapshot, season_number, 1)
    if episode_air_date:
        return episode_air_date
    return str(season.get("air_date") or "").strip()


def _resolved_available_at(
    release_lookup: Callable[[int, int, str], datetime | None] | None,
    season_number: int,
    episode_number: int,
    air_date: str,
    zone: ZoneInfo,
) -> datetime | None:
    air_day = parse_calendar_date(air_date)
    available_at = None
    if callable(release_lookup):
        try:
            available_at = release_lookup(season_number, episode_number, air_date)
        except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError):
            available_at = None

    if available_at is not None:
        if available_at.tzinfo is None:
            return None
        return available_at
    if not air_day:
        return None
    return datetime.combine(air_day, datetime.min.time(), tzinfo=zone)


def collect_metadata_notification_candidates(
    previous: dict[str, Any],
    current: dict[str, Any],
    tracker_status: str,
    now: datetime,
    timezone_name: str,
    release_lookup: Callable[[int, int, str], datetime | None] | None = None,
) -> list[dict[str, Any]]:
    tracker_status = normalize_tracker_status(tracker_status)
    zone = notification_zone(timezone_name)
    local_today = now.astimezone(zone).date()
    tomorrow = local_today + timedelta(days=1)
    show_id = str(current.get("show_id") or previous.get("show_id") or "")
    title = str(current.get("title") or previous.get("title") or "Untitled")
    candidates: list[dict[str, Any]] = []

    old_seasons = previous.get("seasons") if isinstance(previous.get("seasons"), dict) else {}
    new_seasons = current.get("seasons") if isinstance(current.get("seasons"), dict) else {}
    old_numbers = {_clean_season_number(key) for key in old_seasons}
    new_numbers = {_clean_season_number(key) for key in new_seasons}
    old_numbers.discard(0)
    new_numbers.discard(0)

    added_seasons = sorted(new_numbers - old_numbers)
    if tracker_status != "dropped":
        for season_number in added_seasons:
            season = new_seasons.get(str(season_number)) or {}
            season_air_date = str(season.get("air_date") or "")
            premiere_air_date = _season_premiere_air_date(current, season_number, season)
            premiere_at = _resolved_available_at(
                release_lookup,
                season_number,
                1,
                premiere_air_date,
                zone,
            )
            premiere_day = premiere_at.astimezone(zone).date() if premiere_at else None
            message = f"{title} Season {season_number} has been added"
            candidate = _base_candidate(
                current,
                family="new_season",
                kind="new_season",
                event_key=f"new-season:{show_id}:s{season_number}",
                group_key=f"new-season:{show_id}:s{season_number}",
                message=message,
                event_date=season_air_date,
                payload={"season": season_number},
            )
            if premiere_day == tomorrow:
                canonical_date = premiere_day.isoformat()
                candidate["combined_message"] = f"{title} Season {season_number} premieres tomorrow"
                candidate["event_date"] = canonical_date
                candidate["premiere_event_key"] = premiere_tomorrow_event_key(
                    show_id, season_number, canonical_date
                )
            candidates.append(candidate)

    old_status = normalize_tmdb_status(previous.get("tmdb_status"))
    new_status = normalize_tmdb_status(current.get("tmdb_status"))
    if new_status in {"canceled", "ended"} and new_status != old_status:
        kind = "canceled" if new_status == "canceled" else "ended"
        wording = "has been canceled" if kind == "canceled" else "is now marked ended"
        candidates.append(
            _base_candidate(
                current,
                family="canceled_ended",
                kind=kind,
                event_key=f"status:{show_id}:{kind}",
                group_key=f"status:{show_id}:{kind}",
                message=f"{title} {wording}",
                payload={"status": new_status},
            )
        )

    for season_number in sorted(old_numbers & new_numbers):
        old_season = old_seasons.get(str(season_number)) or {}
        new_season = new_seasons.get(str(season_number)) or {}
        old_date = str(old_season.get("air_date") or "")
        new_date = str(new_season.get("air_date") or "")
        if old_date == new_date:
            continue
        old_day = parse_calendar_date(old_date)
        new_day = parse_calendar_date(new_date)
        if old_day and old_day < local_today and (not new_day or new_day < local_today):
            continue

        if not old_day and new_day:
            kind = "premiere_date_announced"
            message = f"{title} Season {season_number} premieres {format_calendar_date(new_date)}"
        elif old_day and not new_day:
            kind = "premiere_date_removed"
            message = f"{title} Season {season_number} no longer has a premiere date"
        elif old_day and new_day:
            kind = "delayed" if new_day > old_day else "date_changed"
            verb = "has been delayed" if kind == "delayed" else "has moved"
            message = (
                f"{title} Season {season_number} {verb} from "
                f"{format_calendar_date(old_date)} to {format_calendar_date(new_date)}"
            )
        else:
            continue

        event_key = (
            f"premiere-date:{show_id}:s{season_number}:"
            f"{old_date or 'none'}->{new_date or 'none'}"
        )
        candidates.append(
            _base_candidate(
                current,
                family="premiere_date_updates",
                kind=kind,
                event_key=event_key,
                group_key=f"premiere-date:{show_id}:s{season_number}",
                message=message,
                event_date=new_date or old_date,
                payload={
                    "season": season_number,
                    "old_date": old_date,
                    "new_date": new_date,
                },
            )
        )

    return candidates


def _watched_episode(tracker_show: dict[str, Any], season: int, episode: int) -> bool:
    watched = tracker_show.get("episodes_watched")
    if not isinstance(watched, dict):
        return False
    raw = watched.get(str(season)) or []
    return episode in {int(value) for value in raw if str(value).isdigit()}


def collect_time_notification_candidates(
    snapshot: dict[str, Any],
    tracker_show: dict[str, Any],
    now: datetime,
    timezone_name: str,
    last_checked_at: datetime | None = None,
    release_lookup: Callable[[int, int, str], datetime | None] | None = None,
) -> list[dict[str, Any]]:
    zone = notification_zone(timezone_name)
    local_today = now.astimezone(zone).date()
    tomorrow = local_today + timedelta(days=1)
    yesterday = local_today - timedelta(days=1)
    tracker_status = normalize_tracker_status(tracker_show.get("status"))
    show_id = str(snapshot.get("show_id") or tracker_show.get("tmdb_id") or "")
    title = str(snapshot.get("title") or tracker_show.get("title") or "Untitled")
    candidates: list[dict[str, Any]] = []

    seasons = snapshot.get("seasons") if isinstance(snapshot.get("seasons"), dict) else {}
    if tracker_status in SEASON_PREMIERE_STATUSES:
        for raw_number, season in seasons.items():
            season_number = _clean_season_number(raw_number)
            if not season_number or not isinstance(season, dict):
                continue
            air_date = _season_premiere_air_date(snapshot, season_number, season)
            premiere_at = _resolved_available_at(
                release_lookup,
                season_number,
                1,
                air_date,
                zone,
            )
            premiere_day = premiere_at.astimezone(zone).date() if premiere_at else None
            if premiere_day != tomorrow:
                continue
            canonical_date = premiere_day.isoformat()
            candidates.append(
                _base_candidate(
                    snapshot,
                    family="season_premiere_tomorrow",
                    kind="season_premiere_tomorrow",
                    event_key=premiere_tomorrow_event_key(show_id, season_number, canonical_date),
                    group_key=f"season-premiere:{show_id}:s{season_number}",
                    message=f"{title} Season {season_number} premieres tomorrow",
                    event_date=canonical_date,
                    payload={"season": season_number},
                )
            )

    episodes = [episode for episode in (normalize_episode(raw) for raw in snapshot.get("episodes") or []) if episode]
    by_season: dict[int, list[dict[str, Any]]] = {}
    for episode in episodes:
        by_season.setdefault(int(episode["season_number"]), []).append(episode)
    for season_episodes in by_season.values():
        season_episodes.sort(key=lambda item: int(item["episode_number"]))

    if tracker_status == "watching":
        previous_check = None
        last_checked_day = None
        if isinstance(last_checked_at, datetime):
            previous_check = last_checked_at
            if previous_check.tzinfo is None:
                previous_check = previous_check.replace(tzinfo=timezone.utc)
            previous_check = previous_check.astimezone(timezone.utc)
            last_checked_day = previous_check.astimezone(zone).date()

        for episode in episodes:
            season_number = int(episode["season_number"])
            episode_number = int(episode["episode_number"])
            air_date = str(episode.get("air_date") or "")
            if _watched_episode(tracker_show, season_number, episode_number):
                continue

            code = f"S{season_number:02d}E{episode_number:02d}"
            name = str(episode.get("name") or "").strip()
            suffix = f" - {name}" if name else ""

            available_at = _resolved_available_at(
                release_lookup,
                season_number,
                episode_number,
                air_date,
                zone,
            )
            if available_at is None:
                continue
            available_at_utc = available_at.astimezone(timezone.utc)
            if previous_check is not None and previous_check < available_at_utc <= now.astimezone(timezone.utc):
                candidates.append(
                    _base_candidate(
                        snapshot,
                        family="new_episode",
                        kind="new_episode",
                        event_key=f"new-episode:{show_id}:s{season_number}:e{episode_number}",
                        group_key=f"new-episode:{show_id}:s{season_number}:e{episode_number}",
                        message=f"{title} {code}{suffix} is now available",
                        event_date=available_at_utc.astimezone(zone).date().isoformat(),
                        episode=episode,
                        payload={"season": season_number, "episode": episode_number},
                    )
                )

            available_day = available_at_utc.astimezone(zone).date()
            reminder_day = available_day + timedelta(days=5)
            reminder_due = (
                reminder_day == local_today
                or (
                    last_checked_day is not None
                    and last_checked_day < reminder_day <= local_today
                )
            )
            if reminder_due:
                reminder_key = (
                    f"unwatched-episode-reminder:{show_id}:"
                    f"s{season_number}:e{episode_number}:5d"
                )
                candidates.append(
                    _base_candidate(
                        snapshot,
                        family="new_episode",
                        kind="unwatched_episode_reminder",
                        event_key=reminder_key,
                        group_key=reminder_key,
                        message=f"You still haven't watched {title} {code}",
                        event_date=reminder_day.isoformat(),
                        episode=episode,
                        payload={
                            "season": season_number,
                            "episode": episode_number,
                            "air_date": air_date,
                            "available_date": available_day.isoformat(),
                            "reminder_days": 5,
                        },
                    )
                )

        for season_number, season_episodes in by_season.items():
            for index, episode in enumerate(season_episodes):
                episode_number = int(episode["episode_number"])
                if index == 0 or episode_number <= 1:
                    continue
                air_date = str(episode.get("air_date") or "")
                return_at = _resolved_available_at(
                    release_lookup,
                    season_number,
                    episode_number,
                    air_date,
                    zone,
                )
                if not return_at:
                    continue
                return_day = return_at.astimezone(zone).date()
                if return_day != tomorrow:
                    continue

                previous = season_episodes[index - 1]
                previous_number = int(previous["episode_number"])
                previous_air_date = str(previous.get("air_date") or "")
                previous_at = _resolved_available_at(
                    release_lookup,
                    season_number,
                    previous_number,
                    previous_air_date,
                    zone,
                )
                if not previous_at:
                    continue
                previous_day = previous_at.astimezone(zone).date()
                if (return_day - previous_day).days < 14:
                    continue

                code = f"S{season_number:02d}E{episode_number:02d}"
                name = str(episode.get("name") or "").strip()
                suffix = f" - {name}" if name else ""
                candidates.append(
                    _base_candidate(
                        snapshot,
                        family="returns_tomorrow",
                        kind="returns_tomorrow",
                        event_key=(
                            f"returns-tomorrow:{show_id}:s{season_number}:"
                            f"e{episode_number}"
                        ),
                        group_key=(
                            f"returns-tomorrow:{show_id}:s{season_number}:"
                            f"e{episode_number}"
                        ),
                        message=f"{title} returns tomorrow with {code}{suffix}",
                        event_date=return_day.isoformat(),
                        episode=episode,
                        payload={"season": season_number, "episode": episode_number},
                    )
                )

    return candidates
