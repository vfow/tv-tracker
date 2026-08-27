from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable

MIGRATION_ID_RE = re.compile(r"^[0-9]{4}_[a-z0-9_]+$")
RELATION_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
MIGRATION_LOCK_KEY = 847_202_613


@dataclass(frozen=True)
class SchemaContract:
    schema_version: int
    managed_relations: tuple[str, ...]
    validation_sql: str
    legacy_schema_versions: tuple[int, ...] = ()
    adoption_seed_sql: str | None = None

    def __post_init__(self) -> None:
        if self.schema_version < 0:
            raise ValueError("Schema versions must not be negative")
        if not self.managed_relations:
            raise ValueError("Schema contracts must identify managed relations")
        if len(self.managed_relations) != len(set(self.managed_relations)):
            raise ValueError("Managed relation names must be unique")
        if any(
            RELATION_NAME_RE.fullmatch(relation_name) is None
            for relation_name in self.managed_relations
        ):
            raise ValueError("Managed relation names must be unqualified SQL names")
        if not self.validation_sql.strip():
            raise ValueError("Schema validation SQL must not be empty")
        if (
            self.adoption_seed_sql is not None
            and not self.adoption_seed_sql.strip()
        ):
            raise ValueError("Schema adoption seed SQL must not be empty")
        if len(self.legacy_schema_versions) != len(
            set(self.legacy_schema_versions)
        ):
            raise ValueError("Legacy schema versions must be unique")
        if any(
            version <= 0 or version >= self.schema_version
            for version in self.legacy_schema_versions
        ):
            raise ValueError(
                "Legacy schema versions must be positive and behind the current version"
            )


@dataclass(frozen=True)
class SqlMigration:
    migration_id: str
    sql: str
    schema_contract: SchemaContract | None = None

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
    if len(ids) != len(set(ids)):
        raise RuntimeError("Migration IDs must be unique")
    if ids != sorted(ids):
        raise RuntimeError("Migrations must be registered in ascending ID order")
    contract_positions = [
        index
        for index, migration in enumerate(ordered)
        if migration.schema_contract is not None
    ]
    if len(contract_positions) > 1:
        raise RuntimeError("Only the latest migration may define a schema contract")
    if contract_positions and contract_positions[0] != len(ordered) - 1:
        raise RuntimeError("The schema contract must belong to the latest migration")
    return ordered


def _read_database_schema_version(cursor: Any) -> int | None:
    cursor.execute("SELECT to_regclass('tv_tracker_schema_meta')")
    relation = cursor.fetchone()
    if not relation or relation[0] is None:
        return None

    cursor.execute(
        "SELECT schema_version FROM tv_tracker_schema_meta WHERE singleton_id = 1"
    )
    row = cursor.fetchone()
    if not row:
        return None
    try:
        version = int(row[0])
    except (TypeError, ValueError) as error:
        raise RuntimeError("Database schema version is invalid") from error
    if version < 0:
        raise RuntimeError("Database schema version is invalid")
    return version


def _create_migration_ledger(cursor: Any) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tv_tracker_migrations (
            migration_id TEXT PRIMARY KEY,
            checksum TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _read_and_validate_ledger(
    cursor: Any,
    registry: tuple[SqlMigration, ...],
) -> tuple[list[str], dict[str, str]]:
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
    if len(existing_ids) != len(set(existing_ids)):
        raise RuntimeError("Migration ledger contains duplicate IDs")

    registry_ids = [migration.migration_id for migration in registry]
    unknown_ids = sorted(set(existing_ids) - set(registry_ids))
    if unknown_ids:
        raise RuntimeError(
            "Database has unknown applied migrations: " + ", ".join(unknown_ids)
        )
    if existing_ids != registry_ids[: len(existing_ids)]:
        raise RuntimeError("Applied migrations are not an ordered prefix of the registry")

    existing = {str(row[0]): str(row[1]) for row in rows}
    for migration in registry:
        current_checksum = existing.get(migration.migration_id)
        if current_checksum is not None and current_checksum != migration.checksum:
            raise RuntimeError(
                "Applied migration checksum changed: "
                f"{migration.migration_id}"
            )
    return existing_ids, existing


def _find_managed_relations(cursor: Any, contract: SchemaContract) -> list[str]:
    cursor.execute(
        """
        SELECT relation.relname
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname = ANY(%s)
        ORDER BY relation.relname
        """,
        (list(contract.managed_relations),),
    )
    return [str(row[0]) for row in cursor.fetchall() if row and row[0] is not None]


def _validate_schema_contract(cursor: Any, contract: SchemaContract) -> None:
    cursor.execute(contract.validation_sql)
    issues = [
        str(row[0])
        for row in cursor.fetchall()
        if row and row[0] is not None and str(row[0]).strip()
    ]
    if not issues:
        return

    displayed = issues[:20]
    if len(issues) > len(displayed):
        displayed.append(f"{len(issues) - len(displayed)} additional issue(s)")
    raise RuntimeError(
        "Database schema does not match the canonical migration schema. "
        "No schema state was certified; repair the reported drift before retrying: "
        + "; ".join(displayed)
    )


def _record_database_schema_version(cursor: Any, schema_version: int) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tv_tracker_schema_meta (
            singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
            schema_version INTEGER NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cursor.execute(
        """
        INSERT INTO tv_tracker_schema_meta
        (singleton_id, schema_version, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (singleton_id) DO UPDATE
        SET schema_version = EXCLUDED.schema_version,
            updated_at = NOW()
        WHERE tv_tracker_schema_meta.schema_version < EXCLUDED.schema_version
        """,
        (schema_version,),
    )


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
    contract = registry[-1].schema_contract if registry else None
    applied_now: list[str] = []

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_KEY,))

            current_schema_version = (
                _read_database_schema_version(cursor) if contract is not None else None
            )
            if contract is not None and (
                current_schema_version is not None
                and current_schema_version > contract.schema_version
            ):
                raise RuntimeError(
                    "Database schema version is newer than this application: "
                    f"{current_schema_version} > {contract.schema_version}"
                )

            _create_migration_ledger(cursor)
            existing_ids, existing = _read_and_validate_ledger(cursor, registry)

            adoption_versions = (
                set(contract.legacy_schema_versions) | {contract.schema_version}
                if contract is not None
                else set()
            )
            adopting_certified_schema = bool(
                contract is not None
                and not existing_ids
                and current_schema_version in adoption_versions
            )
            if adopting_certified_schema:
                _validate_schema_contract(cursor, contract)
                if contract.adoption_seed_sql is not None:
                    cursor.execute(contract.adoption_seed_sql)
            elif contract is not None and not existing_ids:
                if current_schema_version is not None:
                    raise RuntimeError(
                        "Cannot adopt unsupported unledgered database schema version "
                        f"{current_schema_version}; supported adoption versions are: "
                        + ", ".join(str(version) for version in sorted(adoption_versions))
                    )
                managed_relations = _find_managed_relations(cursor, contract)
                if managed_relations:
                    raise RuntimeError(
                        "Cannot initialize migrations over an unversioned existing "
                        "schema. Restore its schema version or migration ledger before "
                        "retrying; managed relations found: "
                        + ", ".join(managed_relations)
                    )

            if (
                contract is not None
                and existing_ids
                and current_schema_version is None
            ):
                # A checksum-valid prefix proves migrations initialized this schema.
                # The final contract check rejects any other drift.
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS tv_tracker_schema_meta (
                        singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
                        schema_version INTEGER NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )

            for migration in registry:
                current_checksum = existing.get(migration.migration_id)
                if current_checksum is not None:
                    continue

                if not adopting_certified_schema:
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

            if contract is not None:
                recorded_schema_version = _read_database_schema_version(cursor)
                if (
                    recorded_schema_version is not None
                    and recorded_schema_version > contract.schema_version
                ):
                    raise RuntimeError(
                        "Database schema version is newer than this application: "
                        f"{recorded_schema_version} > {contract.schema_version}"
                    )
                if recorded_schema_version != contract.schema_version:
                    _record_database_schema_version(cursor, contract.schema_version)

                final_ids, _final_existing = _read_and_validate_ledger(
                    cursor, registry
                )
                registry_ids = [migration.migration_id for migration in registry]
                if final_ids != registry_ids:
                    raise RuntimeError(
                        "Migration ledger is not complete after applying migrations"
                    )

                final_schema_version = _read_database_schema_version(cursor)
                if final_schema_version != contract.schema_version:
                    raise RuntimeError(
                        "Database schema version was not recorded correctly: "
                        f"{final_schema_version!r} != {contract.schema_version}"
                    )
                if not adopting_certified_schema:
                    _validate_schema_contract(cursor, contract)

        connection.commit()

    return applied_now
