from __future__ import annotations

import re
from typing import Any

from tvtracker.backup.primitives import (
    ALLOWED_PROFILE_IMAGE_PREFIXES,
    ALLOWED_STATE_KEYS,
    BASE64_RE,
    MAX_AVATAR_DATA_URL_CHARS,
    MAX_DELETES_PER_SYNC,
    MAX_HEADER_DATA_URL_CHARS,
    MAX_HISTORY_ORDER,
    MAX_HISTORY_PER_SYNC,
    MAX_SHOWS_PER_SYNC,
    STATE_KEY_RE,
    BackupValidationError,
    SyncValidationError,
    backup_int,
    json_clone,
    normalized_identifier,
    validate_calendar_date,
    validate_json_value,
    validate_timestamp,
)
from tvtracker.tracker.history import (
    clean_legacy_metadata,
    dedupe_history_by_episode,
    generated_history_id,
)


def validate_show_record(show_id: str, raw_show: Any) -> dict[str, Any]:
    show_id = normalized_identifier(show_id, "Show identifier", maximum=160)
    if not isinstance(raw_show, dict):
        raise BackupValidationError(f"Show {show_id} is malformed")

    validate_json_value(raw_show, f"Show {show_id}")
    show = clean_legacy_metadata(json_clone(raw_show))
    title = show.get("title")
    if not isinstance(title, str) or not title.strip() or len(title) > 500:
        raise BackupValidationError(f"Show {show_id} has an invalid title")
    show["title"] = title.strip()

    tmdb_id = show.get("tmdb_id", show_id)
    show["tmdb_id"] = normalized_identifier(
        tmdb_id, f"Show {show_id} TMDB identifier", maximum=160
    )

    if "status" in show:
        supported_statuses = {
            "watching", "paused", "finished", "completed", "plan", "dropped"
        }
        if not isinstance(show.get("status"), str) or show["status"] not in supported_statuses:
            raise BackupValidationError(f"Show {show_id} has an unsupported status")

    show.pop("date_only_episode_time_override", None)

    watched = show.get("episodes_watched", {})
    if watched is None:
        watched = {}
    if not isinstance(watched, dict) or len(watched) > 10000:
        raise BackupValidationError(f"Show {show_id} has invalid watched episodes")
    normalized_watched: dict[str, list[int]] = {}
    for season_key, episode_values in watched.items():
        season = backup_int(
            season_key, f"Show {show_id} season", minimum=0, maximum=10000
        )
        if not isinstance(episode_values, list) or len(episode_values) > 100000:
            raise BackupValidationError(
                f"Show {show_id}, season {season_key} has invalid watched episodes"
            )
        episodes: list[int] = []
        for episode_value in episode_values:
            episode = backup_int(
                episode_value,
                f"Show {show_id}, season {season_key} episode",
                minimum=0,
                maximum=100000,
            )
            if episode not in episodes:
                episodes.append(episode)
        normalized_watched[str(season)] = episodes
    show["episodes_watched"] = normalized_watched

    for object_field in ("season_details", "seasons", "episode_details"):
        if object_field in show and show[object_field] is not None:
            if not isinstance(show[object_field], dict):
                raise BackupValidationError(
                    f"Show {show_id} has invalid {object_field.replace('_', ' ')}"
                )

    return show


def validate_history_record(
    raw_entry: Any,
    index: int,
    seen_ids: set[str],
    *,
    expected_id: str | None = None,
) -> tuple[str, dict[str, Any]]:
    if not isinstance(raw_entry, dict):
        raise BackupValidationError(f"History entry {index + 1} is malformed")

    validate_json_value(raw_entry, f"History entry {index + 1}")
    entry = clean_legacy_metadata(json_clone(raw_entry))
    is_movie = str(entry.get("media_type") or "").lower() == "movie" or bool(entry.get("movie_id"))

    if is_movie:
        movie_id = entry.get("movie_id", entry.get("tmdb_id"))
        entry["media_type"] = "movie"
        entry["movie_id"] = normalized_identifier(
            movie_id, f"History entry {index + 1} movie identifier", maximum=160
        )
        entry["tmdb_id"] = entry["movie_id"]
        for text_field, limit in {
            "title": 500,
            "poster_path": 500,
            "backdrop_path": 500,
            "release_date": 40,
            "year": 8,
            "action": 80,
        }.items():
            if text_field in entry and entry[text_field] is not None:
                if not isinstance(entry[text_field], (str, int, float)):
                    raise BackupValidationError(
                        f"History entry {index + 1} has invalid {text_field}"
                    )
                entry[text_field] = str(entry[text_field]).strip()[:limit]
    else:
        show_id = entry.get("tmdb_id", entry.get("show_id"))
        entry["tmdb_id"] = normalized_identifier(
            show_id, f"History entry {index + 1} show identifier", maximum=160
        )
        entry["season"] = backup_int(
            entry.get("season"),
            f"History entry {index + 1} season",
            minimum=0,
            maximum=10000,
        )
        entry["episode"] = backup_int(
            entry.get("episode"),
            f"History entry {index + 1} episode",
            minimum=0,
            maximum=100000,
        )
        for text_field in ("title", "episode_name", "episode_title"):
            if text_field in entry and entry[text_field] is not None:
                if not isinstance(entry[text_field], str) or len(entry[text_field]) > 500:
                    raise BackupValidationError(
                        f"History entry {index + 1} has invalid {text_field}"
                    )
        source_episode_id = entry.get("source_tvdb_episode_id")
        if source_episode_id not in (None, ""):
            if isinstance(source_episode_id, bool) or not isinstance(
                source_episode_id, (str, int)
            ):
                raise BackupValidationError(
                    f"History entry {index + 1} has invalid source episode identifier"
                )
            entry["source_tvdb_episode_id"] = normalized_identifier(
                source_episode_id,
                f"History entry {index + 1} source episode identifier",
                maximum=160,
            )

    if entry.get("date") is not None:
        if not isinstance(entry["date"], str):
            raise BackupValidationError(f"History entry {index + 1} has invalid date")
        validate_calendar_date(entry["date"], f"History entry {index + 1} date")
    if entry.get("watched_at") is not None:
        if not isinstance(entry["watched_at"], str):
            raise BackupValidationError(
                f"History entry {index + 1} has invalid watched_at"
            )
        validate_timestamp(
            entry["watched_at"], f"History entry {index + 1} watched_at"
        )
    if "special" in entry and not isinstance(entry["special"], bool):
        raise BackupValidationError(f"History entry {index + 1} has invalid special flag")

    explicit_id = str(entry.get("id") or "").strip()
    entry_id = expected_id or explicit_id or generated_history_id(entry, index)
    entry_id = normalized_identifier(
        entry_id, f"History entry {index + 1} ID", maximum=240
    )
    if expected_id and explicit_id and explicit_id != expected_id:
        raise BackupValidationError(
            f"History entry {index + 1} ID does not match its update key"
        )
    if entry_id in seen_ids:
        raise BackupValidationError(f"Duplicate History ID: {entry_id}")
    seen_ids.add(entry_id)
    entry["id"] = entry_id
    return entry_id, entry



def validate_profile_image_data_url(value: Any, field: str, maximum: int) -> str:
    if value in (None, ""):
        return ""
    if not isinstance(value, str) or len(value) > maximum:
        raise BackupValidationError(f"Profile field {field} is invalid")

    prefix, separator, payload = value.partition(",")
    if (
        separator != ","
        or prefix not in ALLOWED_PROFILE_IMAGE_PREFIXES
        or not payload
        or len(payload) % 4 != 0
        or BASE64_RE.fullmatch(payload) is None
    ):
        raise BackupValidationError(f"Profile field {field} is invalid")

    return value


def validate_profile_record(raw_profile: Any) -> dict[str, Any]:
    if not isinstance(raw_profile, dict):
        raise BackupValidationError("Profile data is invalid")
    validate_json_value(raw_profile, "Profile")
    profile = json_clone(raw_profile)
    profile.pop("date_only_episode_time", None)

    allowed_fields = {
        "username", "favorite_shows", "favorite_movies", "avatar_type", "avatar_preset",
        "avatar_data", "header_type", "header_preset", "header_image", "streaming_region", "adult_filter",
    }
    unknown = set(profile) - allowed_fields
    if unknown:
        raise BackupValidationError("Profile contains unsupported fields")

    favorites = profile.get("favorite_shows", []) or []
    if not isinstance(favorites, list) or len(favorites) > 8:
        raise BackupValidationError("Profile favorites data is invalid")
    normalized_favorites: list[str] = []
    for favorite in favorites:
        favorite_id = normalized_identifier(
            favorite, "Profile favorite show identifier", maximum=160
        )
        if favorite_id not in normalized_favorites:
            normalized_favorites.append(favorite_id)
    profile["favorite_shows"] = normalized_favorites

    favorite_movies = profile.get("favorite_movies", []) or []
    if not isinstance(favorite_movies, list) or len(favorite_movies) > 8:
        raise BackupValidationError("Profile favorite movies data is invalid")
    normalized_movie_ids: set[str] = set()
    normalized_movies: list[dict[str, Any]] = []
    for raw_movie in favorite_movies:
        if not isinstance(raw_movie, dict):
            raise BackupValidationError("Profile favorite movie entry is invalid")
        movie_id = normalized_identifier(
            raw_movie.get("id") or raw_movie.get("tmdb_id"),
            "Profile favorite movie identifier",
            maximum=160,
        )
        if movie_id in normalized_movie_ids:
            continue
        normalized_movie_ids.add(movie_id)
        movie = {"id": movie_id, "tmdb_id": movie_id}
        for field, limit in {
            "title": 240,
            "poster_path": 240,
            "backdrop_path": 240,
            "release_date": 40,
            "year": 8,
        }.items():
            value = raw_movie.get(field, "")
            if value is None:
                value = ""
            if not isinstance(value, (str, int, float)):
                raise BackupValidationError("Profile favorite movie entry is invalid")
            movie[field] = str(value).strip()[:limit]
        normalized_movies.append(movie)
    profile["favorite_movies"] = normalized_movies

    limits = {
        "username": 160,
        "avatar_type": 40,
        "avatar_preset": 120,
        "header_type": 40,
        "header_preset": 120,
    }
    for field, limit in limits.items():
        if field in profile and profile[field] is not None:
            if not isinstance(profile[field], str) or len(profile[field]) > limit:
                raise BackupValidationError(f"Profile field {field} is invalid")

    streaming_region = profile.get("streaming_region", "")
    if streaming_region is None:
        streaming_region = ""
    if not isinstance(streaming_region, str):
        raise BackupValidationError("Profile field streaming_region is invalid")
    streaming_region = streaming_region.strip().upper()
    if streaming_region and re.fullmatch(r"[A-Z]{2}", streaming_region) is None:
        raise BackupValidationError("Profile field streaming_region is invalid")
    profile["streaming_region"] = streaming_region

    adult_filter = profile.get("adult_filter", True)
    if not isinstance(adult_filter, bool):
        raise BackupValidationError("Profile field adult_filter is invalid")
    profile["adult_filter"] = adult_filter

    if profile.get("avatar_type") not in (None, "", "initial", "preset", "upload"):
        raise BackupValidationError("Profile field avatar_type is invalid")
    if profile.get("header_type") not in (None, "", "preset", "upload"):
        raise BackupValidationError("Profile field header_type is invalid")

    profile["avatar_data"] = validate_profile_image_data_url(
        profile.get("avatar_data"),
        "avatar_data",
        MAX_AVATAR_DATA_URL_CHARS,
    )
    profile["header_image"] = validate_profile_image_data_url(
        profile.get("header_image"),
        "header_image",
        MAX_HEADER_DATA_URL_CHARS,
    )

    return profile


def validate_sync_metadata_state(key: str, raw_value: Any) -> dict[str, Any]:
    if not isinstance(raw_value, dict):
        raise BackupValidationError(f"State {key} must be an object")
    validate_json_value(raw_value, f"State {key}")
    value = json_clone(raw_value)
    allowed = {
        "pending", "failed", "total", "completed", "paused", "active",
        "current", "lastRun", "lastError", "startedAt", "completedAt",
    }
    if set(value) - allowed:
        raise BackupValidationError(f"State {key} contains unsupported fields")
    pending = value.get("pending", []) or []
    if not isinstance(pending, list) or len(pending) > 10000:
        raise BackupValidationError(f"State {key}.pending is invalid")
    value["pending"] = [
        normalized_identifier(item, f"State {key}.pending item", maximum=160)
        for item in pending
    ]

    failed = value.get("failed", []) or []
    if not isinstance(failed, list) or len(failed) > 10000:
        raise BackupValidationError(f"State {key}.failed is invalid")
    normalized_failed: list[dict[str, str]] = []
    for index, item in enumerate(failed):
        # Older synchronization state stored failed show identifiers as scalars.
        # Accept and normalize those records so a strict validation rollout does
        # not make an otherwise recoverable legacy backup impossible to import.
        if not isinstance(item, dict):
            normalized_failed.append({
                "showId": normalized_identifier(
                    item, f"State {key}.failed item {index + 1}", maximum=160
                ),
                "title": "",
                "error": "",
            })
            continue
        if set(item) - {"showId", "id", "title", "error"}:
            raise BackupValidationError(f"State {key}.failed item {index + 1} is invalid")
        show_id = normalized_identifier(
            item.get("showId", item.get("id")),
            f"State {key}.failed show ID",
            maximum=160,
        )
        title = item.get("title", "")
        error_text = item.get("error", "")
        if not isinstance(title, str) or len(title) > 500:
            raise BackupValidationError(f"State {key}.failed title is invalid")
        if not isinstance(error_text, str) or len(error_text) > 2000:
            raise BackupValidationError(f"State {key}.failed error is invalid")
        normalized_failed.append({
            "showId": show_id,
            "title": title,
            "error": error_text,
        })
    value["failed"] = normalized_failed
    for field in ("total", "completed"):
        if field in value:
            value[field] = backup_int(
                value[field], f"State {key}.{field}", minimum=0, maximum=10000000
            )
    for field in ("paused", "active"):
        if field in value and not isinstance(value[field], bool):
            raise BackupValidationError(f"State {key}.{field} is invalid")
    for field in ("current", "lastRun", "lastError", "startedAt", "completedAt"):
        if field in value:
            if not isinstance(value[field], str) or len(value[field]) > 2000:
                raise BackupValidationError(f"State {key}.{field} is invalid")
    return value


def validate_movie_tracking_state(raw_value: Any) -> dict[str, Any]:
    if raw_value is None:
        return {}
    if not isinstance(raw_value, dict) or len(raw_value) > 50000:
        raise BackupValidationError("State movies is invalid")
    validate_json_value(raw_value, "State movies")
    normalized: dict[str, Any] = {}
    allowed_fields = {
        "id", "tmdb_id", "movie_id", "title", "poster_path", "backdrop_path",
        "release_date", "year", "watched", "plan", "plan_to_watch", "favorite",
        "watched_at", "updated_at", "status",
    }
    for raw_movie_id, raw_record in raw_value.items():
        movie_id = normalized_identifier(raw_movie_id, "Movie tracking identifier", maximum=160)
        if not isinstance(raw_record, dict):
            raise BackupValidationError("Movie tracking record is invalid")
        if set(raw_record) - allowed_fields:
            raise BackupValidationError("Movie tracking record contains unsupported fields")
        record_id = normalized_identifier(
            raw_record.get("id") or raw_record.get("tmdb_id") or raw_record.get("movie_id") or movie_id,
            "Movie tracking record identifier",
            maximum=160,
        )
        watched = raw_record.get("watched") is True or raw_record.get("status") == "watched"
        plan = (not watched) and (
            raw_record.get("plan") is True
            or raw_record.get("plan_to_watch") is True
            or raw_record.get("status") == "plan"
        )
        favorite = raw_record.get("favorite") is True
        if not watched and not plan and not favorite:
            continue
        record: dict[str, Any] = {
            "id": record_id,
            "tmdb_id": record_id,
            "title": "Untitled",
            "poster_path": "",
            "backdrop_path": "",
            "release_date": "",
            "year": "",
            "watched": watched,
            "plan": plan,
            "favorite": favorite,
            "watched_at": "",
            "updated_at": "",
        }
        for field, limit in {
            "title": 240,
            "poster_path": 500,
            "backdrop_path": 500,
            "release_date": 40,
            "year": 8,
        }.items():
            value = raw_record.get(field, record[field])
            if value is None:
                value = ""
            if not isinstance(value, (str, int, float)):
                raise BackupValidationError("Movie tracking record is invalid")
            record[field] = str(value).strip()[:limit] or ("Untitled" if field == "title" else "")
        for timestamp_field in ("watched_at", "updated_at"):
            value = raw_record.get(timestamp_field, "")
            if value is None:
                value = ""
            if not isinstance(value, str):
                raise BackupValidationError("Movie tracking timestamp is invalid")
            if value:
                validate_timestamp(value, f"Movie tracking {timestamp_field}")
            record[timestamp_field] = value
        if not record["watched"]:
            record["watched_at"] = ""
        normalized[record_id] = record
    return normalized


def validate_import_info_state(raw_value: Any) -> dict[str, Any]:
    """Accept app-owned compatible-import metadata in native backups.

    Older exports may include a top-level `import_info` state object that records
    where imported data originally came from. This is not episode/date authority
    data and must not block an exact native backup restore.
    """
    if raw_value is None:
        return {}
    if not isinstance(raw_value, dict) or len(raw_value) > 200:
        raise BackupValidationError("State import_info is invalid")
    validate_json_value(raw_value, "State import_info")
    return json_clone(raw_value)


def validate_provider_metadata_state(raw_value: Any) -> dict[str, Any]:
    if raw_value is None:
        return {}
    if not isinstance(raw_value, dict) or len(raw_value) > 100000:
        raise BackupValidationError("State provider_metadata is invalid")
    validate_json_value(raw_value, "State provider_metadata")

    normalized: dict[str, Any] = {}
    key_re = re.compile(r"^(tv|movie):([1-9][0-9]{0,15}):([A-Z]{2})$")
    for raw_key, raw_entry in raw_value.items():
        if not isinstance(raw_key, str):
            raise BackupValidationError("State provider_metadata contains an invalid key")
        match = key_re.fullmatch(raw_key)
        if match is None or not isinstance(raw_entry, dict):
            raise BackupValidationError("State provider_metadata contains an invalid entry")

        clean_media, clean_id, clean_region = match.groups()
        allowed_fields = {"media", "id", "region", "refreshed_at", "providers"}
        if set(raw_entry) - allowed_fields:
            raise BackupValidationError("State provider_metadata contains unsupported fields")

        entry_media = str(raw_entry.get("media") or "").strip().lower()
        entry_id = normalized_identifier(
            raw_entry.get("id"), "Provider metadata title identifier", maximum=160
        )
        entry_region = str(raw_entry.get("region") or "").strip().upper()
        refreshed_at = raw_entry.get("refreshed_at")
        providers = raw_entry.get("providers")

        if entry_media != clean_media or entry_id != clean_id or entry_region != clean_region:
            raise BackupValidationError("State provider_metadata key does not match its entry")
        if not isinstance(refreshed_at, str) or not refreshed_at:
            raise BackupValidationError("State provider_metadata refreshed_at is invalid")
        validate_timestamp(refreshed_at, "Provider metadata refreshed_at")
        if not isinstance(providers, dict):
            raise BackupValidationError("State provider_metadata providers are invalid")
        provider_results = providers.get("results")
        if not isinstance(provider_results, dict):
            raise BackupValidationError("State provider_metadata providers are invalid")
        if set(provider_results) - {clean_region}:
            raise BackupValidationError("State provider_metadata contains another region")
        provider_id = providers.get("id", 0)
        if isinstance(provider_id, bool) or not isinstance(provider_id, (int, str)):
            raise BackupValidationError("State provider_metadata provider id is invalid")
        if str(provider_id).strip() and not str(provider_id).strip().isdigit():
            raise BackupValidationError("State provider_metadata provider id is invalid")

        normalized[raw_key] = {
            "media": clean_media,
            "id": clean_id,
            "region": clean_region,
            "refreshed_at": refreshed_at,
            "providers": json_clone(providers),
        }

    return normalized


def validate_state_record(key: Any, raw_value: Any) -> tuple[str, Any]:
    state_key = normalized_identifier(key, "State key", maximum=80)
    if not STATE_KEY_RE.fullmatch(state_key) or state_key not in ALLOWED_STATE_KEYS:
        raise BackupValidationError(f"Unsupported state key: {state_key}")
    if state_key == "profile":
        return state_key, validate_profile_record(raw_value)
    if state_key == "movies":
        return state_key, validate_movie_tracking_state(raw_value)
    if state_key == "import_info":
        return state_key, validate_import_info_state(raw_value)
    if state_key == "provider_metadata":
        return state_key, validate_provider_metadata_state(raw_value)
    return state_key, validate_sync_metadata_state(state_key, raw_value)


def validate_tracker_data(raw_data: Any) -> dict[str, Any]:
    if not isinstance(raw_data, dict):
        raise BackupValidationError("Tracker data is invalid")
    allowed_top_level = {"shows", "history", "profile", *ALLOWED_STATE_KEYS}
    unknown = set(raw_data) - allowed_top_level
    if unknown:
        raise BackupValidationError("Tracker data contains unsupported state keys")

    raw_shows = raw_data.get("shows")
    raw_history = raw_data.get("history", [])
    if not isinstance(raw_shows, dict) or len(raw_shows) > 10000:
        raise BackupValidationError("Tracker shows data is invalid")
    if not isinstance(raw_history, list) or len(raw_history) > 500000:
        raise BackupValidationError("Tracker History data is invalid")

    shows: dict[str, Any] = {}
    for raw_show_id, raw_show in raw_shows.items():
        show_id = normalized_identifier(raw_show_id, "Show identifier", maximum=160)
        shows[show_id] = validate_show_record(show_id, raw_show)

    history: list[dict[str, Any]] = []
    seen_history_ids: set[str] = set()
    for index, raw_entry in enumerate(raw_history):
        _, entry = validate_history_record(raw_entry, index, seen_history_ids)
        history.append(entry)

    history = dedupe_history_by_episode(history)

    result: dict[str, Any] = {
        "shows": shows,
        "history": history,
        "profile": validate_profile_record(raw_data.get("profile", {})),
    }
    for state_key in (
        "movies",
        "metadata_sync",
        "network_sync",
        "import_info",
        "provider_metadata",
    ):
        if state_key in raw_data:
            _, state_value = validate_state_record(state_key, raw_data[state_key])
            result[state_key] = state_value
    return result


def validate_and_normalize_backup(
    backup: Any,
    *,
    backup_app_name: str,
    max_schema_version: int,
    supported_backup_versions: set[int],
) -> tuple[dict[str, Any], dict[str, int]]:
    if not isinstance(backup, dict):
        raise BackupValidationError("Invalid app backup file")
    if backup.get("app") != backup_app_name or backup.get("backupType") != "native-app-backup":
        raise BackupValidationError("This is not a TV Tracker app backup")

    version = backup_int(backup.get("backupVersion", 1), "Backup version", minimum=1)
    if version not in supported_backup_versions:
        raise BackupValidationError("This backup version is not supported")
    schema_version = backup_int(
        backup.get("schemaVersion", 1), "Schema version", minimum=1
    )
    if schema_version > max_schema_version:
        raise BackupValidationError("This backup was created by a newer TV Tracker version")

    data = validate_tracker_data(clean_legacy_metadata(backup.get("data")))
    summary = {
        "shows": len(data["shows"]),
        "historyEntries": len(data["history"]),
        "favorites": len(data["profile"].get("favorite_shows") or []),
        "backupVersion": version,
        "schemaVersion": schema_version,
    }
    return data, summary


def validate_identifier_list(
    raw_values: Any,
    field: str,
    *,
    maximum_items: int,
    maximum_chars: int,
) -> list[str]:
    if not isinstance(raw_values, list) or len(raw_values) > maximum_items:
        raise SyncValidationError(f"{field} is invalid")
    result: list[str] = []
    for raw_value in raw_values:
        identifier = normalized_identifier(raw_value, field, maximum=maximum_chars)
        if identifier not in result:
            result.append(identifier)
    return result


def validate_sync_delta_payload(payload: dict[str, Any]) -> tuple[
    dict[str, Any], list[str], dict[str, Any], list[str], list[str] | None, dict[str, Any]
]:
    shows_upsert_raw = payload.get("showsUpsert", {})
    shows_delete_raw = payload.get("showsDelete", [])
    history_upsert_raw = payload.get("historyUpsert", {})
    history_delete_raw = payload.get("historyDelete", [])
    history_order_raw = payload.get("historyOrder")
    state_upsert_raw = payload.get("stateUpsert", {})

    if not isinstance(shows_upsert_raw, dict) or len(shows_upsert_raw) > MAX_SHOWS_PER_SYNC:
        raise SyncValidationError("Invalid shows update")
    if not isinstance(history_upsert_raw, dict) or len(history_upsert_raw) > MAX_HISTORY_PER_SYNC:
        raise SyncValidationError("Invalid history update")
    if not isinstance(state_upsert_raw, dict) or len(state_upsert_raw) > len(ALLOWED_STATE_KEYS):
        raise SyncValidationError("Invalid state update")

    shows_upsert: dict[str, Any] = {}
    for raw_show_id, raw_show in shows_upsert_raw.items():
        show_id = normalized_identifier(raw_show_id, "Show identifier", maximum=160)
        shows_upsert[show_id] = validate_show_record(show_id, raw_show)

    shows_delete = validate_identifier_list(
        shows_delete_raw,
        "Shows delete list",
        maximum_items=MAX_DELETES_PER_SYNC,
        maximum_chars=160,
    )

    history_upsert: dict[str, Any] = {}
    seen_history_ids: set[str] = set()
    for index, (raw_entry_id, raw_entry) in enumerate(history_upsert_raw.items()):
        entry_id = normalized_identifier(
            raw_entry_id, "History update identifier", maximum=240
        )
        _, entry = validate_history_record(
            raw_entry, index, seen_history_ids, expected_id=entry_id
        )
        history_upsert[entry_id] = entry

    history_delete = validate_identifier_list(
        history_delete_raw,
        "History delete list",
        maximum_items=MAX_DELETES_PER_SYNC,
        maximum_chars=240,
    )

    history_order = None
    if history_order_raw is not None:
        history_order = validate_identifier_list(
            history_order_raw,
            "History order",
            maximum_items=MAX_HISTORY_ORDER,
            maximum_chars=240,
        )

    state_upsert: dict[str, Any] = {}
    for raw_key, raw_value in state_upsert_raw.items():
        key, value = validate_state_record(raw_key, raw_value)
        state_upsert[key] = value

    if set(shows_upsert) & set(shows_delete):
        raise SyncValidationError("A show cannot be updated and deleted together")
    if set(history_upsert) & set(history_delete):
        raise SyncValidationError("A History entry cannot be updated and deleted together")

    return (
        shows_upsert,
        shows_delete,
        history_upsert,
        history_delete,
        history_order,
        state_upsert,
    )

