from __future__ import annotations

import re
from typing import Any, Callable

from psycopg.types.json import Jsonb

from tvtracker.sync.change_log import (
    CHANGE_LOG_RETENTION_DAYS,
    CHANGE_LOG_RETENTION_REVISIONS,
    change_log_has_gap,
    deltas_conflict,
    fetch_change_rows,
    merge_history_order,
    normalize_delta,
    serialize_change_rows,
)

OPERATION_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")


def apply_state_patch(
    payload: Any,
    *,
    connection_factory: Callable[[], Any],
    validate_delta: Callable[..., Any],
    find_duplicate_history_ids: Callable[..., Any],
    validation_errors: tuple[type[Exception], ...],
) -> tuple[dict[str, Any], int]:
    """Run the PATCH /api/state transaction and return a Flask-ready
    ``(body, status_code)`` tuple. The route owns CSRF and JSON parsing; every
    dependency that used to be a module global in app.py is injected so tests
    can keep patching the legacy names.
    """

    if not isinstance(payload, dict):
        return {"ok": False, "error": "Invalid JSON body"}, 400

    operation_id = str(payload.get("operationId") or "")

    try:
        base_revision = int(payload.get("baseRevision"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "Invalid base revision"}, 400

    if base_revision < 0:
        return {"ok": False, "error": "Invalid base revision"}, 400
    if not OPERATION_ID_RE.fullmatch(operation_id):
        return {"ok": False, "error": "Invalid operation ID"}, 400

    try:
        (
            shows_upsert,
            shows_delete,
            history_upsert,
            history_delete,
            history_order,
            state_upsert,
        ) = validate_delta(payload)
    except validation_errors as error:
        return {
            "ok": False,
            "error": str(error),
            "code": "invalid_sync_record",
        }, 400

    incoming_delta = normalize_delta(
        shows_upsert,
        shows_delete,
        history_upsert,
        history_delete,
        history_order,
        state_upsert,
    )

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT revision FROM tv_tracker_meta "
                "WHERE singleton_id = 1 FOR UPDATE"
            )
            row = cursor.fetchone()
            revision_before = int(row[0] if row else 0)

            cursor.execute(
                "SELECT revision FROM tv_tracker_changes "
                "WHERE operation_id = %s",
                (operation_id,),
            )
            duplicate_row = cursor.fetchone()

            if duplicate_row:
                rows = (
                    []
                    if change_log_has_gap(cursor, base_revision, revision_before)
                    else fetch_change_rows(cursor, base_revision)
                )
                return {
                    "ok": True,
                    "revision": revision_before,
                    "operationRevision": int(duplicate_row[0]),
                    "duplicate": True,
                    "reset": not bool(rows) and base_revision < revision_before,
                    "changes": serialize_change_rows(rows),
                }, 200

            if base_revision > revision_before:
                return {
                    "ok": False,
                    "error": "Client revision is newer than the server",
                    "revision": revision_before,
                    "reset": True,
                }, 409

            if change_log_has_gap(cursor, base_revision, revision_before):
                return {
                    "ok": False,
                    "error": "Synchronization history is unavailable",
                    "revision": revision_before,
                    "reset": True,
                }, 409

            concurrent_rows = fetch_change_rows(cursor, base_revision)
            conflicting = any(
                deltas_conflict(incoming_delta, row_delta)
                for _, _, row_delta in concurrent_rows
            )

            if conflicting:
                return {
                    "ok": False,
                    "error": "The same tracker data changed on another device",
                    "revision": revision_before,
                    "reset": True,
                    "conflict": True,
                }, 409

            logical_history_delete: list[str] = []
            for entry_id, entry_data in history_upsert.items():
                for duplicate_id in find_duplicate_history_ids(
                    cursor, str(entry_id), entry_data
                ):
                    if (
                        duplicate_id not in logical_history_delete
                        and duplicate_id not in history_delete
                    ):
                        logical_history_delete.append(duplicate_id)

            effective_history_delete = list(history_delete) + logical_history_delete

            actual_history_order = merge_history_order(
                cursor, history_order, history_upsert, effective_history_delete
            )

            for show_id, show_data in shows_upsert.items():
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_shows (show_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (show_id) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    (str(show_id), Jsonb(show_data)),
                )

            if shows_delete:
                cursor.execute(
                    "DELETE FROM tv_tracker_shows WHERE show_id = ANY(%s)",
                    ([str(item) for item in shows_delete],),
                )

            for entry_id, entry_data in history_upsert.items():
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_history (entry_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (entry_id) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    (str(entry_id), Jsonb(entry_data)),
                )

            if effective_history_delete:
                cursor.execute(
                    "DELETE FROM tv_tracker_history WHERE entry_id = ANY(%s)",
                    ([str(item) for item in effective_history_delete],),
                )

            for key, value in state_upsert.items():
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_state (state_key, data, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (state_key) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    (str(key), Jsonb(value)),
                )

            if actual_history_order is not None:
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_state (state_key, data, updated_at)
                    VALUES ('history_order', %s, NOW())
                    ON CONFLICT (state_key) DO UPDATE
                    SET data = EXCLUDED.data, updated_at = NOW()
                    """,
                    (Jsonb(actual_history_order),),
                )

            revision = revision_before + 1
            actual_delta = normalize_delta(
                shows_upsert,
                shows_delete,
                history_upsert,
                effective_history_delete,
                actual_history_order,
                state_upsert,
            )

            cursor.execute(
                """
                UPDATE tv_tracker_meta
                SET revision = %s, updated_at = NOW()
                WHERE singleton_id = 1
                """,
                (revision,),
            )
            cursor.execute(
                """
                INSERT INTO tv_tracker_changes
                (revision, operation_id, delta, created_at)
                VALUES (%s, %s, %s, NOW())
                """,
                (revision, operation_id, Jsonb(actual_delta)),
            )
            cursor.execute(
                """
                DELETE FROM tv_tracker_changes
                WHERE revision < %s
                   OR created_at < NOW() - (%s * INTERVAL '1 day')
                """,
                (
                    max(0, revision - CHANGE_LOG_RETENTION_REVISIONS),
                    CHANGE_LOG_RETENTION_DAYS,
                ),
            )
        connection.commit()

    return {
        "ok": True,
        "revision": revision,
        "duplicate": False,
        "reset": False,
        "changes": serialize_change_rows(concurrent_rows),
        "appliedDelta": actual_delta,
    }, 200
