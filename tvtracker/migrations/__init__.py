"""Explicit additive migration runner for TV Tracker."""

from .registry import MIGRATIONS
from .runner import SqlMigration, run_migrations

__all__ = ["MIGRATIONS", "SqlMigration", "run_migrations"]
