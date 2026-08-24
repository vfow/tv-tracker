#!/usr/bin/env python3
from __future__ import annotations

import getpass
import os
import re
import sys
from pathlib import Path
from typing import Mapping

import psycopg
from argon2 import PasswordHasher


PROJECT_DIR = Path(__file__).resolve().parents[1]
REQUIRED_DATABASE_VARIABLES = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
OPTIONAL_DATABASE_VARIABLES = ("DB_PORT",)
UWSGI_ENV_PATTERN = re.compile(
    r"^\s*env\s*=\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$",
    re.IGNORECASE,
)


class RecoveryConfigurationError(RuntimeError):
    """Raised when the recovery utility cannot safely locate its configuration."""


def _clean_config_value(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1]
    return cleaned


def _read_uwsgi_environment(config_path: Path) -> tuple[dict[str, str], str]:
    try:
        text = config_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}, ""

    environment: dict[str, str] = {}
    for raw_line in text.splitlines():
        match = UWSGI_ENV_PATTERN.match(raw_line)
        if not match:
            continue
        name, raw_value = match.groups()
        environment[name] = _clean_config_value(raw_value)
    return environment, text


def _candidate_uwsgi_configs(config_directory: Path) -> list[Path]:
    if not config_directory.is_dir():
        return []
    return sorted(config_directory.glob("*.conf"))


def _configuration_score(config_text: str, config_path: Path) -> int:
    score = 0
    project_path = str(PROJECT_DIR)
    if project_path in config_text:
        score += 100
    if "tv-tracker" in config_text.lower():
        score += 20
    if config_path.stem.isdigit():
        score += 1
    return score


def resolve_database_environment(
    shell_environment: Mapping[str, str] | None = None,
    config_directory: Path | None = None,
) -> dict[str, str]:
    """Resolve DB settings without printing or persisting any secret values.

    Values already present in the SSH shell take precedence. Missing values are
    loaded from the read-only alwaysdata uWSGI configuration belonging to this
    project.
    """

    source_environment = shell_environment if shell_environment is not None else os.environ
    resolved: dict[str, str] = {}
    for name in (*REQUIRED_DATABASE_VARIABLES, *OPTIONAL_DATABASE_VARIABLES):
        value = source_environment.get(name, "")
        if value != "":
            resolved[name] = value if name == "DB_PASSWORD" else value.strip()

    missing = [name for name in REQUIRED_DATABASE_VARIABLES if not resolved.get(name)]
    if not missing:
        resolved.setdefault("DB_PORT", "5432")
        return resolved

    directory = config_directory or (Path.home() / "admin" / "config" / "uwsgi")
    candidates: list[tuple[int, Path, dict[str, str]]] = []
    for config_path in _candidate_uwsgi_configs(directory):
        config_environment, config_text = _read_uwsgi_environment(config_path)
        combined = dict(config_environment)
        combined.update(resolved)
        if all(combined.get(name, "") != "" for name in REQUIRED_DATABASE_VARIABLES):
            candidates.append((_configuration_score(config_text, config_path), config_path, combined))

    if not candidates:
        missing_text = ", ".join(missing)
        raise RecoveryConfigurationError(
            "Could not locate the TV Tracker database configuration. "
            f"Missing: {missing_text}. The website's read-only uWSGI configuration "
            "was not found or did not contain the required values."
        )

    candidates.sort(key=lambda item: (item[0], item[1].stat().st_mtime), reverse=True)
    best_score = candidates[0][0]
    best_candidates = [candidate for candidate in candidates if candidate[0] == best_score]

    if len(best_candidates) > 1:
        fingerprints = {
            tuple(candidate[2].get(name, "") for name in REQUIRED_DATABASE_VARIABLES)
            for candidate in best_candidates
        }
        if len(fingerprints) > 1:
            raise RecoveryConfigurationError(
                "More than one alwaysdata site configuration matched this project, "
                "so the recovery utility stopped instead of choosing a database automatically."
            )

    selected = dict(best_candidates[0][2])
    selected.setdefault("DB_PORT", "5432")
    return selected


def resolve_site_environment(
    shell_environment: Mapping[str, str] | None = None,
    config_directory: Path | None = None,
) -> dict[str, str]:
    """Resolve database settings plus optional site configuration (e.g. TMDB key).

    Read-only: never prints or persists any secret value.
    """

    resolved = resolve_database_environment(shell_environment, config_directory)
    source_environment = shell_environment if shell_environment is not None else os.environ
    directory = config_directory or (Path.home() / "admin" / "config" / "uwsgi")
    merged: dict[str, str] = {}
    for config_path in _candidate_uwsgi_configs(directory):
        config_environment, _text = _read_uwsgi_environment(config_path)
        merged.update(config_environment)
    for name in ("TMDB_API_KEY",):
        value = source_environment.get(name, "") or merged.get(name, "")
        if value:
            resolved[name] = value
    return resolved


def database_connection(database_environment: Mapping[str, str]) -> psycopg.Connection:
    try:
        port = int(database_environment.get("DB_PORT", "5432"))
    except (TypeError, ValueError) as error:
        raise RecoveryConfigurationError("The configured database port is invalid.") from error

    return psycopg.connect(
        host=database_environment["DB_HOST"],
        port=port,
        dbname=database_environment["DB_NAME"],
        user=database_environment["DB_USER"],
        password=database_environment["DB_PASSWORD"],
        connect_timeout=10,
    )


def admin_account_exists(database_environment: Mapping[str, str]) -> bool:
    try:
        with database_connection(database_environment) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT singleton_id FROM tv_tracker_admin WHERE singleton_id = 1"
                )
                return cursor.fetchone() is not None
    except psycopg.errors.UndefinedTable as error:
        raise RecoveryConfigurationError(
            "The admin table does not exist. Start the website once to create its schema."
        ) from error
    except psycopg.Error as error:
        raise RecoveryConfigurationError(
            "Could not connect to the TV Tracker database. No account changes were made."
        ) from error


def upsert_admin_account(
    database_environment: Mapping[str, str], username: str, password_hash: str
) -> bool:
    """Reset the singleton account, or recreate it when explicitly authorized."""
    try:
        with database_connection(database_environment) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT singleton_id FROM tv_tracker_admin WHERE singleton_id = 1"
                )
                existed = cursor.fetchone() is not None
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_admin
                    (singleton_id, username, password_hash, session_version, updated_at)
                    VALUES (1, %s, %s, 1, NOW())
                    ON CONFLICT (singleton_id) DO UPDATE
                    SET username = EXCLUDED.username,
                        password_hash = EXCLUDED.password_hash,
                        session_version = tv_tracker_admin.session_version + 1,
                        updated_at = NOW()
                    """,
                    (username, password_hash),
                )
            connection.commit()
        return existed
    except psycopg.Error as error:
        raise RecoveryConfigurationError(
            "The database rejected the account recovery. No partial change was kept."
        ) from error

def main() -> int:
    print("Checking TV Tracker database access...")
    try:
        database_environment = resolve_database_environment()
        account_exists = admin_account_exists(database_environment)
    except RecoveryConfigurationError as error:
        print(f"Recovery unavailable: {error}", file=sys.stderr)
        return 1

    print("Database connection confirmed.")

    if not account_exists:
        print(
            "WARNING: the singleton administrator row is missing. "
            "This recovery will recreate it."
        )
        confirmation = input('Type RECREATE to continue: ').strip()
        if confirmation != "RECREATE":
            print("Recovery cancelled. No database changes were made.", file=sys.stderr)
            return 2

    username = input("New admin username: ").strip()
    if not username:
        print("Username cannot be blank.", file=sys.stderr)
        return 2
    if len(username) > 80:
        print("Username is too long.", file=sys.stderr)
        return 2

    password = getpass.getpass("New admin password: ")
    confirmation = getpass.getpass("Repeat new password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 2
    if len(password) < 16:
        print("Password must contain at least 16 characters.", file=sys.stderr)
        return 2

    password_hash = PasswordHasher().hash(password)

    try:
        existed = upsert_admin_account(database_environment, username, password_hash)
    except RecoveryConfigurationError as error:
        print(f"Recovery failed: {error}", file=sys.stderr)
        return 1

    if existed:
        print("Admin account reset. Every existing browser session is now invalid.")
    else:
        print("Missing admin account recreated. Sign in with the new credentials.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
