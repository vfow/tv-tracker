from __future__ import annotations

from typing import Any, Callable

from psycopg.types.json import Jsonb

from tvtracker.tracker.history import clean_legacy_metadata


def replace_tracker_data_transactionally(
    data: dict[str, Any],
    connection_factory: Callable[[], Any],
) -> int:
    data = clean_legacy_metadata(data)
    shows = data.get("shows") or {}
    history = data.get("history") or []
    state = {
        str(key): value
        for key, value in data.items()
        if key not in {"shows", "history", "history_order"}
    }
    history_order = [str(entry["id"]) for entry in history]

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT revision FROM tv_tracker_meta "
                "WHERE singleton_id = 1 FOR UPDATE"
            )
            row = cursor.fetchone()
            revision = int(row[0] if row else 0) + 1

            cursor.execute("DELETE FROM tv_tracker_changes")
            cursor.execute("DELETE FROM tv_tracker_shows")
            cursor.execute("DELETE FROM tv_tracker_history")
            cursor.execute("DELETE FROM tv_tracker_state")

            if shows:
                cursor.executemany(
                    """
                    INSERT INTO tv_tracker_shows (show_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    [
                        (str(show_id), Jsonb(show_data))
                        for show_id, show_data in shows.items()
                    ],
                )

            if history:
                cursor.executemany(
                    """
                    INSERT INTO tv_tracker_history (entry_id, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    [
                        (str(entry["id"]), Jsonb(entry))
                        for entry in history
                    ],
                )

            if state:
                cursor.executemany(
                    """
                    INSERT INTO tv_tracker_state (state_key, data, updated_at)
                    VALUES (%s, %s, NOW())
                    """,
                    [
                        (state_key, Jsonb(state_data))
                        for state_key, state_data in state.items()
                    ],
                )

            cursor.execute(
                """
                INSERT INTO tv_tracker_state (state_key, data, updated_at)
                VALUES ('history_order', %s, NOW())
                """,
                (Jsonb(history_order),),
            )
            cursor.execute(
                """
                UPDATE tv_tracker_meta
                SET revision = %s, updated_at = NOW()
                WHERE singleton_id = 1
                """,
                (revision,),
            )
        connection.commit()

    return revision
