from __future__ import annotations

import argparse
import json
from collections.abc import Sequence

from tvtracker.database import connect_database
from tvtracker.tracker.state import cleanup_stored_tracker_data


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tvtracker.maintenance",
        description="Explicit TV Tracker maintenance operations.",
    )
    parser.add_argument(
        "operation",
        choices=("cleanup-legacy",),
        help="Maintenance operation to run.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.operation == "cleanup-legacy":
        changed = cleanup_stored_tracker_data(
            connect_database,
            suppress_errors=False,
        )
        print(
            json.dumps(
                {"ok": True, "operation": args.operation, "rowsChanged": changed},
                separators=(",", ":"),
            )
        )
        return 0

    raise RuntimeError(f"Unsupported maintenance operation: {args.operation}")


if __name__ == "__main__":
    raise SystemExit(main())
