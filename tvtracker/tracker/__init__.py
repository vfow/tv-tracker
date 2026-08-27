"""Tracker domain: history classification, legacy metadata cleanup, and tracker state assembly."""

from tvtracker.tracker.history import (
    clean_legacy_metadata,
    dedupe_history_by_episode,
    find_logical_duplicate_history_ids,
    generated_history_id,
    history_episode_identity,
    history_timestamp_value,
    is_legacy_metadata_key,
    legacy_metadata_marker,
)
from tvtracker.tracker.state import cleanup_stored_tracker_data, read_tracker_data

__all__ = [
    "clean_legacy_metadata",
    "cleanup_stored_tracker_data",
    "dedupe_history_by_episode",
    "find_logical_duplicate_history_ids",
    "generated_history_id",
    "history_episode_identity",
    "history_timestamp_value",
    "is_legacy_metadata_key",
    "legacy_metadata_marker",
    "read_tracker_data",
]
