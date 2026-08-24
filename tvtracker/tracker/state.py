from __future__ import annotations

from typing import Any, Callable

from psycopg.types.json import Jsonb

from tvtracker.sync.change_log import current_revision
from tvtracker.tracker.history import clean_legacy_metadata


def read_tracker_data(connection_factory: Callable[[], Any]) -> tuple[dict[str, Any], int]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            cursor.execute("SELECT show_id, data FROM tv_tracker_shows")
            shows = {str(row[0]): row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT entry_id, data FROM tv_tracker_history")
            history_map = {str(row[0]): row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT state_key, data FROM tv_tracker_state")
            state = {str(row[0]): row[1] for row in cursor.fetchall()}

            revision = current_revision(cursor)

    order = state.pop("history_order", [])
    history: list[Any] = []
    seen: set[str] = set()

    if isinstance(order, list):
        for raw_id in order:
            entry_id = str(raw_id)
            if entry_id in history_map and entry_id not in seen:
                history.append(history_map[entry_id])
                seen.add(entry_id)

    for entry_id, entry in history_map.items():
        if entry_id not in seen:
            history.append(entry)

    data: dict[str, Any] = {
        "shows": shows,
        "history": history,
        "profile": state.pop(
            "profile",
            {
                "username": "Username",
                "favorite_shows": [],
                "favorite_movies": [],
                "avatar_type": "initial",
                "avatar_preset": "silhouette-1",
                "avatar_data": "",
                "adult_filter": True,
            },
        ),
    }
    data.update(state)
    return clean_legacy_metadata(data), revision


def cleanup_stored_tracker_data(connection_factory: Callable[[], Any]) -> None:
    try:
        with connection_factory() as connection:
            changed = False
            with connection.cursor() as cursor:
                cursor.execute("SELECT show_id, data FROM tv_tracker_shows")
                for show_id, raw_data in cursor.fetchall():
                    cleaned = clean_legacy_metadata(raw_data)
                    if cleaned != raw_data:
                        cursor.execute(
                            "UPDATE tv_tracker_shows SET data = %s, updated_at = NOW() WHERE show_id = %s",
                            (Jsonb(cleaned), show_id),
                        )
                        changed = True
                cursor.execute("SELECT state_key, data FROM tv_tracker_state")
                for state_key, raw_data in cursor.fetchall():
                    if state_key == "history_order":
                        continue
                    cleaned = clean_legacy_metadata(raw_data)
                    if cleaned != raw_data:
                        cursor.execute(
                            "UPDATE tv_tracker_state SET data = %s, updated_at = NOW() WHERE state_key = %s",
                            (Jsonb(cleaned), state_key),
                        )
                        changed = True
            if changed:
                connection.commit()
    except Exception:
        # Cleanup must never prevent the site from starting.
        return
