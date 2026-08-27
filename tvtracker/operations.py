from __future__ import annotations

import time
from typing import Any, Callable

from tvtracker.migrations import (
    DATABASE_SCHEMA_VERSION,
    MIGRATIONS,
    verify_migrations_current,
)


def _elapsed_ms(started: float, clock: Callable[[], float]) -> float:
    return round(max(0.0, (clock() - started) * 1000.0), 2)


def collect_operational_baseline(
    connection_factory: Callable[[], Any],
    *,
    clock: Callable[[], float] = time.perf_counter,
) -> dict[str, Any]:
    """Collect privacy-safe, read-only PostgreSQL operational signals."""

    schema_started = clock()
    verify_migrations_current(connection_factory, MIGRATIONS)
    schema_check_ms = _elapsed_ms(schema_started, clock)

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            ping_started = clock()
            cursor.execute("SELECT 1")
            ping_row = cursor.fetchone()
            database_ping_ms = _elapsed_ms(ping_started, clock)
            if ping_row != (1,):
                raise RuntimeError("Database ping returned an invalid result")

            cursor.execute(
                """
                SELECT
                    pg_database_size(current_database())::bigint,
                    (
                        SELECT COUNT(*)::bigint
                        FROM pg_stat_activity
                        WHERE datname = current_database()
                    ),
                    current_setting('max_connections')::integer
                """
            )
            capacity_row = cursor.fetchone()
            if not capacity_row or len(capacity_row) != 3:
                raise RuntimeError("Database capacity query returned an invalid result")

            database_size_bytes = int(capacity_row[0])
            active_connections = int(capacity_row[1])
            max_connections = int(capacity_row[2])
            if (
                database_size_bytes < 0
                or active_connections < 0
                or max_connections <= 0
            ):
                raise RuntimeError("Database capacity metrics are invalid")

            cursor.execute(
                """
                SELECT
                    relname,
                    n_live_tup::bigint,
                    n_dead_tup::bigint
                FROM pg_stat_user_tables
                WHERE schemaname = 'public'
                  AND relname LIKE 'tv_tracker_%'
                ORDER BY relname
                """
            )
            table_rows = cursor.fetchall()

    tables: list[dict[str, Any]] = []
    for row in table_rows:
        if not row or len(row) != 3:
            raise RuntimeError("Database table statistics returned an invalid row")
        table_name = str(row[0])
        live_rows = max(0, int(row[1]))
        dead_rows = max(0, int(row[2]))
        total_rows = live_rows + dead_rows
        tables.append(
            {
                "table": table_name,
                "liveRowsEstimate": live_rows,
                "deadRowsEstimate": dead_rows,
                "deadRowPct": (
                    round((dead_rows / total_rows) * 100.0, 2)
                    if total_rows
                    else 0.0
                ),
            }
        )

    return {
        "ok": True,
        "operation": "operational-check",
        "schemaVersion": DATABASE_SCHEMA_VERSION,
        "migrationCount": len(MIGRATIONS),
        "schemaCheckMs": schema_check_ms,
        "databasePingMs": database_ping_ms,
        "databaseSizeBytes": database_size_bytes,
        "activeConnections": active_connections,
        "maxConnections": max_connections,
        "connectionUtilizationPct": round(
            (active_connections / max_connections) * 100.0,
            2,
        ),
        "tables": tables,
    }
