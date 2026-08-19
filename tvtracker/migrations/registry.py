from __future__ import annotations

from .runner import SqlMigration

# Phase 13 introduces the migration ledger and runner before the next schema
# change. Future schema work is added here as ordered, additive migrations.
MIGRATIONS: tuple[SqlMigration, ...] = ()
