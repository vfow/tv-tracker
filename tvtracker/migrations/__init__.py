"""Explicit additive migration runner for TV Tracker."""

from .registry_v7 import DATABASE_SCHEMA_VERSION, MIGRATIONS
from .runner import SqlMigration, run_migrations
from .verification import verify_migrations_current

__all__ = [
    "DATABASE_SCHEMA_VERSION",
    "MIGRATIONS",
    "SqlMigration",
    "run_migrations",
    "verify_migrations_current",
]
