from __future__ import annotations

import json
import sys
from typing import Any, TextIO


def merged_main_pull_request(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, list):
        raise ValueError("GitHub commit pull-request response must be a list")

    for item in payload:
        if not isinstance(item, dict):
            continue
        base = item.get("base")
        if (
            item.get("state") == "closed"
            and item.get("merged_at")
            and isinstance(base, dict)
            and base.get("ref") == "main"
        ):
            return item
    return None


def main(stdin: TextIO | None = None, stdout: TextIO | None = None) -> int:
    source = stdin or sys.stdin
    target = stdout or sys.stdout
    payload = json.load(source)
    pull_request = merged_main_pull_request(payload)
    if pull_request is None:
        raise SystemExit(
            "Release SHA is not associated with a merged pull request targeting main"
        )

    number = pull_request.get("number")
    target.write(json.dumps({"ok": True, "pullRequest": number}, separators=(",", ":")))
    target.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
