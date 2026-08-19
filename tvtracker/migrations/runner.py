from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable


MIGRATION_ID_RE = re.compile(r"^[0-9]{4}_[a-z0-9_]+$")
MIGRATION_LOCK_KEY = 847_202_613


@dataclass(frozen=True)
class SqlMigration:
    migration_id: str
    sql: str

    def __post_init__(self) -> None:
        if not MIGRATION_ID_RE.fullmatch(self.migration_id):
            raise ValueError(
                "Migration IDs must look like '0001_descriptive_name'"
            )
        if not self.sql.strip():
            raise ValueError("Migration SQL must not be empty")

    @property
    def checksum(self) -> str:
        normalized = self.sql.replace("\r\n", "\n").strip() + "\n"
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _validated_registry(migrations: Iterable[SqlMigration]) -> tuple[SqlMigration, ...]:
    ordered = tuple(migrations)
    ids = [migration.migration_id for migration in ordered]
    if ids != sorted(ids):
        raise RuntimeError("Migrations must be registered in ascending ID order")
    if len(ids) != len(set(ids)):
        raise RuntimeError("Migration IDs must be unique")
    return ordered


def run_migrations(
    connection_factory: Callable[[], Any],
    migrations: Iterable[SqlMigration],
) -> list[str]:
    """Apply pending migrations transactionally and return applied migration IDs.

    The ledger is additive, the PostgreSQL advisory transaction lock prevents two
    startup processes from racing, and a checksum mismatch fails closed instead of
    silently reinterpreting an already-applied migration.
    """

    registry = _validated_registry(migrations)
    applied_now: list[str] = []

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS tv_tracker_migrations (
                    migration_id TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_KEY,))
            cursor.execute(
                "SELECT migration_id, checksum FROM tv_tracker_migrations "
                "ORDER BY migration_id"
            )
            existing = {
                str(row[0]): str(row[1])
                for row in cursor.fetchall()
                if row and len(row) >= 2
            }

            for migration in registry:
                current_checksum = existing.get(migration.migration_id)
                if current_checksum is not None:
                    if current_checksum != migration.checksum:
                        raise RuntimeError(
                            "Applied migration checksum changed: "
                            f"{migration.migration_id}"
                        )
                    continue

                cursor.execute(migration.sql)
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_migrations
                    (migration_id, checksum, applied_at)
                    VALUES (%s, %s, NOW())
                    """,
                    (migration.migration_id, migration.checksum),
                )
                existing[migration.migration_id] = migration.checksum
                applied_now.append(migration.migration_id)

        connection.commit()

    return applied_now
