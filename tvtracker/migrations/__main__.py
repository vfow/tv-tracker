from __future__ import annotations

import json

from tvtracker.database import connect_database
from tvtracker.migrations import MIGRATIONS, run_migrations


def main() -> int:
    applied = run_migrations(connect_database, MIGRATIONS)
    print(json.dumps({"ok": True, "applied": applied}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
