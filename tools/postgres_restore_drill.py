from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlsplit

import psycopg
from psycopg import sql

from tvtracker.migrations import MIGRATIONS, verify_migrations_current


@dataclass(frozen=True)
class LocalDatabaseConfig:
    host: str
    port: int
    database: str
    user: str
    password: str


def parse_local_database_url(database_url: str) -> LocalDatabaseConfig:
    """Parse a loopback PostgreSQL URL for an isolated restore drill."""

    parsed = urlsplit(database_url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise RuntimeError("Restore drill requires a PostgreSQL URL")
    if parsed.query or parsed.fragment:
        raise RuntimeError("Restore drill URL must not contain query or fragment data")

    host = parsed.hostname or ""
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("Restore drill refuses a non-loopback database host")

    database = unquote(parsed.path.lstrip("/"))
    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    if not database or database in {"postgres", "template0", "template1"}:
        raise RuntimeError("Restore drill requires an isolated source database")
    if not user:
        raise RuntimeError("Restore drill database user is missing")

    try:
        port = int(parsed.port or 5432)
    except ValueError as error:
        raise RuntimeError("Restore drill database port is invalid") from error
    if not (1 <= port <= 65535):
        raise RuntimeError("Restore drill database port is invalid")

    return LocalDatabaseConfig(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
    )


def _connect(config: LocalDatabaseConfig, *, database: str | None = None):
    return psycopg.connect(
        host=config.host,
        port=config.port,
        dbname=database or config.database,
        user=config.user,
        password=config.password,
        connect_timeout=10,
    )


def _postgres_env(config: LocalDatabaseConfig, *, database: str) -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            "PGHOST": config.host,
            "PGPORT": str(config.port),
            "PGDATABASE": database,
            "PGUSER": config.user,
            "PGPASSWORD": config.password,
            "PGAPPNAME": "tvtracker-restore-drill",
        }
    )
    return environment


def _run_postgres_tool(
    command: list[str],
    *,
    environment: dict[str, str],
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> None:
    completed = runner(
        command,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode:
        tool = Path(command[0]).name
        raise RuntimeError(f"{tool} failed during isolated restore drill")


def _table_counts(connection_factory: Callable[[], Any]) -> dict[str, int]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename LIKE 'tv_tracker_%'
                ORDER BY tablename
                """
            )
            table_names = [
                str(row[0])
                for row in cursor.fetchall()
                if row and row[0] is not None
            ]
            counts: dict[str, int] = {}
            for table_name in table_names:
                cursor.execute(
                    sql.SQL("SELECT COUNT(*)::bigint FROM {}").format(
                        sql.Identifier(table_name)
                    )
                )
                row = cursor.fetchone()
                if not row:
                    raise RuntimeError("Restore drill row-count query returned no result")
                counts[table_name] = int(row[0])
    return counts


def _drop_database(admin_connection: Any, database_name: str) -> None:
    with admin_connection.cursor() as cursor:
        cursor.execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                sql.Identifier(database_name)
            )
        )


def run_restore_drill(
    database_url: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> dict[str, Any]:
    """Dump and restore an isolated loopback PostgreSQL database, then verify it."""

    config = parse_local_database_url(database_url)
    pg_dump = shutil.which("pg_dump")
    pg_restore = shutil.which("pg_restore")
    if not pg_dump or not pg_restore:
        raise RuntimeError("pg_dump and pg_restore are required for the restore drill")

    source_factory = lambda: _connect(config)
    verify_migrations_current(source_factory, MIGRATIONS)
    source_counts = _table_counts(source_factory)

    target_database = f"tvtracker_restore_drill_{secrets.token_hex(6)}"
    dump_file = tempfile.NamedTemporaryFile(
        prefix="tvtracker-restore-drill-",
        suffix=".dump",
        delete=False,
    )
    dump_path = Path(dump_file.name)
    dump_file.close()
    os.chmod(dump_path, 0o600)

    admin_connection = None

    try:
        admin_connection = _connect(config, database="postgres")
        admin_connection.autocommit = True
        _drop_database(admin_connection, target_database)
        with admin_connection.cursor() as cursor:
            cursor.execute(
                sql.SQL("CREATE DATABASE {}").format(
                    sql.Identifier(target_database)
                )
            )

        _run_postgres_tool(
            [
                pg_dump,
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                f"--file={dump_path}",
            ],
            environment=_postgres_env(config, database=config.database),
            runner=runner,
        )
        _run_postgres_tool(
            [
                pg_restore,
                f"--dbname={target_database}",
                "--clean",
                "--if-exists",
                "--exit-on-error",
                "--no-owner",
                "--no-privileges",
            ],
            environment=_postgres_env(config, database=target_database),
            runner=runner,
        )

        target_factory = lambda: _connect(config, database=target_database)
        verify_migrations_current(target_factory, MIGRATIONS)
        restored_counts = _table_counts(target_factory)
        if restored_counts != source_counts:
            raise RuntimeError("Restored database row counts do not match the source")

        return {
            "ok": True,
            "operation": "postgres-restore-drill",
            "schemaVerified": True,
            "rowCountsMatch": True,
            "tableCount": len(source_counts),
        }
    finally:
        try:
            if admin_connection is not None:
                _drop_database(admin_connection, target_database)
        finally:
            if admin_connection is not None:
                admin_connection.close()
            dump_path.unlink(missing_ok=True)


def main() -> int:
    database_url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("TEST_DATABASE_URL is required for the isolated restore drill")
    result = run_restore_drill(database_url)
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
