from __future__ import annotations

import os
from typing import Any

import psycopg


def required_env(name: str, *, strip: bool = True) -> str:
    value = os.environ.get(name, "")
    if strip:
        value = value.strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def required_database_env(name: str, *, strip: bool = True) -> str:
    return required_env(name, strip=strip)


def connect_database() -> psycopg.Connection[Any]:
    """Open the canonical PostgreSQL connection used by migration tooling.

    The legacy application keeps its existing connection helper until the Phase 18
    backend extraction. Keeping this small adapter independent from ``app.py`` lets
    migrations run before Flask imports or worker startup side effects.
    """

    return psycopg.connect(
        host=required_database_env("DB_HOST"),
        port=int(os.environ.get("DB_PORT", "5432")),
        dbname=required_database_env("DB_NAME"),
        user=required_database_env("DB_USER"),
        password=required_database_env("DB_PASSWORD", strip=False),
        connect_timeout=10,
    )
