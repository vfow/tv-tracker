from __future__ import annotations

from typing import Any, Callable, Iterable

from .runner import MIGRATION_LOCK_KEY, SqlMigration


def verify_migrations_current(
    connection_factory: Callable[[], Any],
    migrations: Iterable[SqlMigration],
) -> None:
    """Verify the database is fully migrated without changing schema state.

    Web workers use this fail-closed check at startup. Schema changes remain the
    responsibility of the explicit migration command used by deployment and
    operators, so starting or scaling the application cannot unexpectedly run
    DDL or adopt an old schema.
    """
    registry = tuple(migrations)
    registry_ids = [migration.migration_id for migration in registry]
    if len(registry_ids) != len(set(registry_ids)):
        raise RuntimeError("Migration IDs must be unique")
    if registry_ids != sorted(registry_ids):
        raise RuntimeError("Migrations must be registered in ascending ID order")

    contract_positions = [
        index
        for index, migration in enumerate(registry)
        if migration.schema_contract is not None
    ]
    if len(contract_positions) > 1:
        raise RuntimeError("Only the latest migration may define a schema contract")
    if contract_positions and contract_positions[0] != len(registry) - 1:
        raise RuntimeError("The schema contract must belong to the latest migration")
    contract = registry[-1].schema_contract if registry else None

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_KEY,))

            cursor.execute("SELECT to_regclass('tv_tracker_migrations')")
            ledger_relation = cursor.fetchone()
            if not ledger_relation or ledger_relation[0] is None:
                raise RuntimeError(
                    "Database migrations have not been initialized. "
                    "Run `python -m tvtracker.migrations` before starting the app."
                )

            cursor.execute(
                "SELECT migration_id, checksum FROM tv_tracker_migrations "
                "ORDER BY migration_id"
            )
            rows = cursor.fetchall()
            if any(
                not row or len(row) < 2 or row[0] is None or row[1] is None
                for row in rows
            ):
                raise RuntimeError("Migration ledger contains an invalid row")

            existing_ids = [str(row[0]) for row in rows]
            if existing_ids != registry_ids:
                unknown = sorted(set(existing_ids) - set(registry_ids))
                if unknown:
                    raise RuntimeError(
                        "Database has unknown applied migrations: " + ", ".join(unknown)
                    )
                pending = registry_ids[len(existing_ids) :]
                raise RuntimeError(
                    "Database has pending migrations: "
                    + ", ".join(pending or registry_ids)
                    + ". Run `python -m tvtracker.migrations` before starting the app."
                )

            existing_checksums = {
                str(row[0]): str(row[1])
                for row in rows
            }
            for migration in registry:
                if existing_checksums.get(migration.migration_id) != migration.checksum:
                    raise RuntimeError(
                        "Applied migration checksum changed: " + migration.migration_id
                    )

            if contract is None:
                return

            cursor.execute("SELECT to_regclass('tv_tracker_schema_meta')")
            schema_relation = cursor.fetchone()
            if not schema_relation or schema_relation[0] is None:
                raise RuntimeError("Database schema version metadata is missing")

            cursor.execute(
                "SELECT schema_version FROM tv_tracker_schema_meta "
                "WHERE singleton_id = 1"
            )
            row = cursor.fetchone()
            try:
                schema_version = int(row[0]) if row else None
            except (TypeError, ValueError) as error:
                raise RuntimeError("Database schema version is invalid") from error
            if schema_version != contract.schema_version:
                raise RuntimeError(
                    "Database schema version does not match this application: "
                    f"{schema_version!r} != {contract.schema_version}. "
                    "Run `python -m tvtracker.migrations` before starting the app."
                )

            cursor.execute(contract.validation_sql)
            issues = [
                str(row[0])
                for row in cursor.fetchall()
                if row and row[0] is not None and str(row[0]).strip()
            ]
            if issues:
                displayed = issues[:20]
                if len(issues) > len(displayed):
                    displayed.append(
                        f"{len(issues) - len(displayed)} additional issue(s)"
                    )
                raise RuntimeError(
                    "Database schema drift detected: " + "; ".join(displayed)
                )
