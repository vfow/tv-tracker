#!/usr/bin/env python3
"""Fail on high/critical npm advisories, except one time-boxed dev-tool advisory.

Temporary exception:
  braces@3.0.3 / GHSA-vfj7-8cjw-p6xm (CVE-2026-93687)
  Expiry: 2026-12-01

As of 2026-10-21, the upstream advisory lists no patched version. The
exception only applies when the lockfile contains braces 3.0.3 as a
development dependency and npm reports that exact advisory as the sole
high-severity finding. All other high/critical findings fail the check.
Remove this exception as soon as a patched release is available.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

ADVISORY_URL = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm"
EXCEPTION_PACKAGE = "braces"
EXCEPTION_VERSION = "3.0.3"
EXPIRES_ON = date(2026, 12, 1)


def exact_braces_exception(
    name: str, vulnerability: dict[str, Any], packages: dict[str, Any]
) -> bool:
    if name != EXCEPTION_PACKAGE or vulnerability.get("severity") != "high":
        return False
    if date.today() >= EXPIRES_ON:
        return False

    via = vulnerability.get("via", [])
    if not isinstance(via, list) or len(via) != 1:
        return False
    advisory = via[0]
    if not isinstance(advisory, dict) or advisory.get("url") != ADVISORY_URL:
        return False

    nodes = vulnerability.get("nodes", [])
    if not isinstance(nodes, list) or not nodes:
        return False
    for node in nodes:
        entry = packages.get(node)
        if not isinstance(entry, dict):
            return False
        if entry.get("version") != EXCEPTION_VERSION or entry.get("dev") is not True:
            return False
    return True


def main() -> int:
    lock_path = Path("package-lock.json")
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        packages = lock["packages"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"Cannot validate npm audit against package-lock.json: {error}", file=sys.stderr)
        return 2

    result = subprocess.run(
        ["npm", "audit", "--audit-level=high", "--json"],
        capture_output=True,
        text=True,
        check=False,
    )
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("npm audit did not return valid JSON.", file=sys.stderr)
        if result.stdout:
            print(result.stdout[-4000:], file=sys.stderr)
        if result.stderr:
            print(result.stderr[-4000:], file=sys.stderr)
        return result.returncode or 2

    vulnerabilities = report.get("vulnerabilities", {})
    if not isinstance(vulnerabilities, dict):
        print("npm audit JSON did not contain a valid vulnerabilities object.", file=sys.stderr)
        return 2

    high_or_critical = {
        name: vulnerability
        for name, vulnerability in vulnerabilities.items()
        if isinstance(vulnerability, dict)
        and vulnerability.get("severity") in {"high", "critical"}
    }
    allowed = [
        (name, vulnerability)
        for name, vulnerability in high_or_critical.items()
        if exact_braces_exception(name, vulnerability, packages)
    ]
    blockers = {
        name: vulnerability
        for name, vulnerability in high_or_critical.items()
        if (name, vulnerability) not in allowed
    }

    counts = report.get("metadata", {}).get("vulnerabilities", {})
    print(
        "npm audit summary: "
        f"{counts.get('low', 0)} low, "
        f"{counts.get('moderate', 0)} moderate, "
        f"{counts.get('high', 0)} high, "
        f"{counts.get('critical', 0)} critical."
    )

    if blockers:
        print("Unapproved high/critical npm advisories remain:", file=sys.stderr)
        print(json.dumps(blockers, indent=2, sort_keys=True), file=sys.stderr)
        if result.stderr:
            print(result.stderr[-2000:], file=sys.stderr)
        return 1

    if allowed:
        print(
            "Temporary exception applied to braces@3.0.3 / "
            "GHSA-vfj7-8cjw-p6xm only; expiry 2026-12-01. "
            "The exception is development-only and has no published patched release."
        )
        print("Keep the raw advisory visible above; remove this exception once upstream fixes it.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
