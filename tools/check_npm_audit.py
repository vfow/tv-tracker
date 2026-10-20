#!/usr/bin/env python3
"""Fail on high/critical npm advisories except one time-boxed dev-tool chain.

Temporary exception:
  braces@3.0.3 / GHSA-vfj7-8cjw-p6xm (CVE-2026-93687)
  Expiry: 2026-12-01

As of 2026-10-21, the upstream advisory lists no patched version. npm audit
also marks the exact known Tailwind 3 development dependency chain as high:
braces -> micromatch/ chokidar -> fast-glob -> tailwindcss. The exception only
accepts those exact high-severity entries at their known locked versions,
only when all are development dependencies, and only when the finding traces
to the exact braces advisory. Any added/changed high or critical finding fails.
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
EXPIRES_ON = date(2026, 12, 1)

# This exact transitive chain is caused by the one unpatched braces advisory.
# Version pins deliberately fail closed if the dependency tree changes.
EXPECTED_VERSIONS = {
    "braces": "3.0.3",
    "chokidar": "3.6.0",
    "fast-glob": "3.3.3",
    "micromatch": "4.0.8",
    "tailwindcss": "3.4.19",
}
EXPECTED_VIA = {
    "chokidar": {"braces"},
    "fast-glob": {"micromatch"},
    "micromatch": {"braces"},
}
EXPECTED_TAILWIND_HIGH_VIA = {"chokidar", "fast-glob", "micromatch"}
KNOWN_TAILWIND_MODERATE_VIA = {"postcss-nested", "postcss-selector-parser"}


def exact_braces_chain_exception(
    high_or_critical: dict[str, dict[str, Any]],
    vulnerabilities: dict[str, Any],
    packages: dict[str, Any],
) -> bool:
    if date.today() >= EXPIRES_ON:
        return False
    if set(high_or_critical) != set(EXPECTED_VERSIONS):
        return False
    if any(v.get("severity") != "high" for v in high_or_critical.values()):
        return False

    for name, expected_version in EXPECTED_VERSIONS.items():
        vulnerability = high_or_critical[name]
        nodes = vulnerability.get("nodes", [])
        if not isinstance(nodes, list) or not nodes:
            return False
        for node in nodes:
            entry = packages.get(node)
            if not isinstance(entry, dict):
                return False
            if entry.get("version") != expected_version or entry.get("dev") is not True:
                return False

        via = vulnerability.get("via", [])
        if not isinstance(via, list):
            return False

        if name == "braces":
            if len(via) != 1:
                return False
            advisory = via[0]
            if not isinstance(advisory, dict) or advisory.get("url") != ADVISORY_URL:
                return False
        elif name == "tailwindcss":
            if any(not isinstance(item, str) for item in via):
                return False
            via_names = set(via)
            if not EXPECTED_TAILWIND_HIGH_VIA.issubset(via_names):
                return False
            extra_names = via_names - EXPECTED_TAILWIND_HIGH_VIA
            if not extra_names.issubset(KNOWN_TAILWIND_MODERATE_VIA):
                return False
            if any(
                not isinstance(vulnerabilities.get(dependency), dict)
                or vulnerabilities[dependency].get("severity") in {"high", "critical"}
                for dependency in extra_names
            ):
                return False
        else:
            if any(not isinstance(item, str) for item in via):
                return False
            if set(via) != EXPECTED_VIA[name]:
                return False

    return True


def main() -> int:
    try:
        lock = json.loads(Path("package-lock.json").read_text(encoding="utf-8"))
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
    counts = report.get("metadata", {}).get("vulnerabilities", {})
    if not isinstance(vulnerabilities, dict):
        print("npm audit JSON did not contain a valid vulnerabilities object.", file=sys.stderr)
        return 2

    high_or_critical = {
        name: vulnerability
        for name, vulnerability in vulnerabilities.items()
        if isinstance(vulnerability, dict)
        and vulnerability.get("severity") in {"high", "critical"}
    }

    print(
        "npm audit summary: "
        f"{counts.get('low', 0)} low, "
        f"{counts.get('moderate', 0)} moderate, "
        f"{counts.get('high', 0)} high, "
        f"{counts.get('critical', 0)} critical."
    )

    if not high_or_critical:
        return 0

    if exact_braces_chain_exception(high_or_critical, vulnerabilities, packages):
        print(
            "Temporary exception applied only to the known Tailwind 3 development "
            "dependency chain caused by braces@3.0.3 / GHSA-vfj7-8cjw-p6xm. "
            "Expiry: 2026-12-01. No published patched release was available when reviewed."
        )
        print("Raw npm audit findings remain visible; remove this exception when upstream fixes braces.")
        return 0

    print("Unapproved high/critical npm advisories remain:", file=sys.stderr)
    print(json.dumps(high_or_critical, indent=2, sort_keys=True), file=sys.stderr)
    if result.stderr:
        print(result.stderr[-2000:], file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
