"""Synchronization domain: revision bookkeeping, change log, conflict detection, and the state-patch transaction."""

from tvtracker.sync.change_log import (
    CHANGE_LOG_RETENTION_DAYS,
    CHANGE_LOG_RETENTION_REVISIONS,
    change_log_has_gap,
    current_revision,
    deltas_conflict,
    fetch_change_rows,
    merge_history_order,
    normalize_delta,
    serialize_change_rows,
    touched_entities,
)
from tvtracker.sync.state_patch import OPERATION_ID_RE, apply_state_patch
from tvtracker.sync.throttle import (
    SYNC_LOCK,
    SYNC_MAX_REQUESTS,
    SYNC_REQUESTS,
    SYNC_WINDOW_SECONDS,
    sync_request_is_limited,
)

__all__ = [
    "CHANGE_LOG_RETENTION_DAYS",
    "CHANGE_LOG_RETENTION_REVISIONS",
    "OPERATION_ID_RE",
    "SYNC_LOCK",
    "SYNC_MAX_REQUESTS",
    "SYNC_REQUESTS",
    "SYNC_WINDOW_SECONDS",
    "apply_state_patch",
    "change_log_has_gap",
    "current_revision",
    "deltas_conflict",
    "fetch_change_rows",
    "merge_history_order",
    "normalize_delta",
    "serialize_change_rows",
    "sync_request_is_limited",
    "touched_entities",
]
