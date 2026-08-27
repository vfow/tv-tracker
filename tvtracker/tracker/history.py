from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any

import psycopg

from tvtracker.backup.primitives import BackupValidationError, backup_int


def generated_history_id(entry: dict[str, Any], index: int) -> str:
    if str(entry.get("media_type") or "").lower() == "movie" or entry.get("movie_id"):
        movie_id = str(entry.get("movie_id") or entry.get("tmdb_id") or "").strip()
        if movie_id:
            return f"movie-watched-{movie_id}"
    signature = "|".join([
        str(entry.get("tmdb_id") or entry.get("show_id") or ""),
        str(entry.get("season") or 0),
        str(entry.get("episode") or 0),
        str(entry.get("watched_at") or entry.get("date") or ""),
        str(index),
    ])
    digest = hashlib.sha256(signature.encode("utf-8")).hexdigest()[:28]
    return f"legacy-{digest}"


def legacy_metadata_marker() -> str:
    return "tv" + "maze"


def is_legacy_metadata_key(key: Any) -> bool:
    name = str(key or "").lower()
    marker = legacy_metadata_marker()
    return (
        marker in name
        or name in {
            "air_time", "air_timestamp", "airtime", "airstamp",
            "metadata_source", "artwork_source", "provider",
            "_artwork_tmdb_id", "date_only_episode_time_override",
        }
    )


def clean_legacy_metadata(value: Any) -> Any:
    if isinstance(value, list):
        return [clean_legacy_metadata(item) for item in value]
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for raw_key, raw_item in value.items():
            if is_legacy_metadata_key(raw_key):
                continue
            cleaned[str(raw_key)] = clean_legacy_metadata(raw_item)
        return cleaned
    return value


def history_episode_identity(entry: dict[str, Any]) -> tuple[Any, ...] | None:
    if str(entry.get("media_type") or "").lower() == "movie" or entry.get("movie_id"):
        return None

    raw_show_id = entry.get("tmdb_id") or entry.get("show_id")
    if isinstance(raw_show_id, (dict, list, bool)):
        return None
    show_id = str(raw_show_id or "").strip()
    if not show_id or len(show_id) > 160:
        return None

    try:
        season = backup_int(
            entry.get("season"), "History season", minimum=0, maximum=10000
        )
        episode = backup_int(
            entry.get("episode"), "History episode", minimum=0, maximum=100000
        )
    except BackupValidationError:
        return None

    special = entry.get("special")
    if "special" in entry and not isinstance(special, bool):
        return None
    if special is True or season == 0:
        source_episode_id = entry.get("source_tvdb_episode_id")
        if source_episode_id not in (None, ""):
            if isinstance(source_episode_id, bool) or not isinstance(
                source_episode_id, (str, int)
            ):
                return None
            source_id = str(source_episode_id).strip()
            if not source_id or len(source_id) > 160:
                return None
            return (show_id, "special", "tvdb", source_id)

        title = entry.get("episode_title") or entry.get("title") or "special"
        if not isinstance(title, str):
            return None
        normalized_title = re.sub(
            r"[^a-z0-9]+", "-", title.strip().lower().replace("&", "and")
        ).strip("-")
        return (show_id, "special", season, episode, normalized_title)

    return (show_id, season, episode)


def history_timestamp_value(entry: dict[str, Any]) -> float:
    value = entry.get("watched_at") or entry.get("date") or ""
    if not isinstance(value, str) or not value:
        return 0.0
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).timestamp()
    except ValueError:
        return 0.0


def dedupe_history_by_episode(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_episode: dict[tuple[Any, ...], dict[str, Any]] = {}
    passthrough: list[dict[str, Any]] = []

    for entry in history:
        identity = history_episode_identity(entry)
        if identity is None or not identity[0]:
            passthrough.append(entry)
            continue

        previous = by_episode.get(identity)
        if previous is None or history_timestamp_value(entry) >= history_timestamp_value(previous):
            by_episode[identity] = entry

    deduped = passthrough + list(by_episode.values())
    deduped.sort(key=history_timestamp_value, reverse=True)
    return deduped


def find_logical_duplicate_history_ids(
    cursor: psycopg.Cursor[Any],
    entry_id: str,
    entry: dict[str, Any],
) -> list[str]:
    identity = history_episode_identity(entry)
    if identity is None or not identity[0]:
        return []

    show_id = str(identity[0])
    cursor.execute(
        """
        SELECT entry_id, data
        FROM tv_tracker_history
        WHERE entry_id <> %s
          AND (
              data->>'tmdb_id' = %s
              OR data->>'show_id' = %s
          )
        """,
        (str(entry_id), show_id, show_id),
    )
    duplicate_ids: list[str] = []
    for row in cursor.fetchall():
        if len(row) < 2 or not isinstance(row[1], dict):
            continue
        if history_episode_identity(row[1]) == identity:
            duplicate_ids.append(str(row[0]))
    return duplicate_ids
