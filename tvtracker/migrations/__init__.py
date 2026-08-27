"""Explicit additive migration runner for TV Tracker."""

from .registry import MIGRATIONS
from .runner import SqlMigration, run_migrations
from .verification import verify_migrations_current
from .versions import DATABASE_SCHEMA_VERSION

__all__ = [
    "DATABASE_SCHEMA_VERSION",
    "MIGRATIONS",
    "SqlMigration",
    "run_migrations",
    "verify_migrations_current",
]
