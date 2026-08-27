from __future__ import annotations

from typing import Any

import psycopg

CHANGE_LOG_RETENTION_REVISIONS = 5000
CHANGE_LOG_RETENTION_DAYS = 30


def current_revision(cursor: psycopg.Cursor[Any]) -> int:
    cursor.execute(
        "SELECT revision FROM tv_tracker_meta WHERE singleton_id = 1"
    )
    row = cursor.fetchone()
    return int(row[0] if row else 0)


def normalize_delta(
    shows_upsert: dict[str, Any],
    shows_delete: list[Any],
    history_upsert: dict[str, Any],
    history_delete: list[Any],
    history_order: list[Any] | None,
    state_upsert: dict[str, Any],
) -> dict[str, Any]:
    return {
        "showsUpsert": {str(key): value for key, value in shows_upsert.items()},
        "showsDelete": [str(item) for item in shows_delete],
        "historyUpsert": {str(key): value for key, value in history_upsert.items()},
        "historyDelete": [str(item) for item in history_delete],
        "historyOrder": (
            [str(item) for item in history_order]
            if history_order is not None
            else None
        ),
        "stateUpsert": {str(key): value for key, value in state_upsert.items()},
    }


def touched_entities(delta: dict[str, Any]) -> dict[str, set[str]]:
    return {
        "shows": set(map(str, (delta.get("showsUpsert") or {}).keys()))
        | set(map(str, delta.get("showsDelete") or [])),
        "history": set(map(str, (delta.get("historyUpsert") or {}).keys()))
        | set(map(str, delta.get("historyDelete") or [])),
        "state": set(map(str, (delta.get("stateUpsert") or {}).keys())),
    }


def deltas_conflict(incoming: dict[str, Any], previous: dict[str, Any]) -> bool:
    incoming_entities = touched_entities(incoming)
    previous_entities = touched_entities(previous)
    return any(
        incoming_entities[group] & previous_entities[group]
        for group in ("shows", "history", "state")
    )


def fetch_change_rows(
    cursor: psycopg.Cursor[Any],
    since_revision: int,
    limit: int | None = None,
) -> list[tuple[int, str, dict[str, Any]]]:
    if limit is None:
        cursor.execute(
            """
            SELECT revision, operation_id, delta
            FROM tv_tracker_changes
            WHERE revision > %s
            ORDER BY revision ASC
            """,
            (since_revision,),
        )
    else:
        cursor.execute(
            """
            SELECT revision, operation_id, delta
            FROM tv_tracker_changes
            WHERE revision > %s
            ORDER BY revision ASC
            LIMIT %s
            """,
            (since_revision, limit),
        )

    return [
        (int(row[0]), str(row[1]), row[2])
        for row in cursor.fetchall()
    ]


def serialize_change_rows(
    rows: list[tuple[int, str, dict[str, Any]]]
) -> list[dict[str, Any]]:
    return [
        {
            "revision": revision,
            "operationId": operation_id,
            "delta": delta,
        }
        for revision, operation_id, delta in rows
    ]


def change_log_has_gap(
    cursor: psycopg.Cursor[Any], since_revision: int, current: int
) -> bool:
    if since_revision >= current:
        return False

    cursor.execute("SELECT MIN(revision) FROM tv_tracker_changes")
    row = cursor.fetchone()
    oldest = int(row[0]) if row and row[0] is not None else None
    return oldest is None or oldest > since_revision + 1


def merge_history_order(
    cursor: psycopg.Cursor[Any],
    requested_order: list[Any] | None,
    history_upsert: dict[str, Any],
    history_delete: list[Any],
) -> list[str] | None:
    if requested_order is None:
        return None

    cursor.execute(
        "SELECT data FROM tv_tracker_state WHERE state_key = 'history_order'"
    )
    row = cursor.fetchone()
    current_order = row[0] if row and isinstance(row[0], list) else []
    deleted = {str(item) for item in history_delete}
    merged: list[str] = []
    seen: set[str] = set()

    def append_id(raw_id: Any) -> None:
        entry_id = str(raw_id)
        if entry_id in deleted or entry_id in seen:
            return
        seen.add(entry_id)
        merged.append(entry_id)

    for raw_id in requested_order:
        append_id(raw_id)
    for raw_id in current_order:
        append_id(raw_id)
    for raw_id in history_upsert:
        append_id(raw_id)

    return merged
