from __future__ import annotations

import base64
import json
import os
import shlex
import sys
from pathlib import Path
from typing import Iterable, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REQUIRED_DATABASE_ENV = (
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
)

ALWAYSDATA_SITE_API_ROOT = "https://api.alwaysdata.com/v1/site"
MAX_SITE_RESPONSE_BYTES = 1024 * 1024


class DeploymentEnvironmentError(RuntimeError):
    """Raised when provider-managed deployment environment data is unusable."""


def _required_value(environment: Mapping[str, str], name: str) -> str:
    value = str(environment.get(name, "")).strip()
    if not value:
        raise DeploymentEnvironmentError(f"Missing required deployment input: {name}")
    return value


def _validated_site_id(value: str) -> str:
    site_id = value.strip()
    if not site_id.isascii() or not site_id.isdigit():
        raise DeploymentEnvironmentError("ALWAYSDATA_SITE_ID must be numeric")
    return site_id


def parse_site_environment(
    serialized: str,
    required_names: Iterable[str] = REQUIRED_DATABASE_ENV,
) -> dict[str, str]:
    required = tuple(required_names)
    if not required:
        raise DeploymentEnvironmentError("No required environment variables were requested")
    if len(set(required)) != len(required):
        raise DeploymentEnvironmentError("Required environment variable names must be unique")
    if not isinstance(serialized, str) or not serialized.strip():
        raise DeploymentEnvironmentError("Alwaysdata site environment is empty")

    try:
        assignments = shlex.split(serialized, posix=True, comments=False)
    except ValueError as exc:
        raise DeploymentEnvironmentError("Alwaysdata site environment is malformed") from exc

    requested = set(required)
    found: dict[str, str] = {}
    for assignment in assignments:
        name, separator, value = assignment.partition("=")
        if not separator or name not in requested:
            continue
        if name in found:
            raise DeploymentEnvironmentError(
                f"Duplicate required variable in Alwaysdata site environment: {name}"
            )
        if not value:
            raise DeploymentEnvironmentError(
                f"Required variable is empty in Alwaysdata site environment: {name}"
            )
        if any(character in value for character in ("\x00", "\r", "\n")):
            raise DeploymentEnvironmentError(
                f"Required variable contains an unsupported control character: {name}"
            )
        found[name] = value

    missing = [name for name in required if name not in found]
    if missing:
        raise DeploymentEnvironmentError(
            "Missing required variable(s) in Alwaysdata site environment: "
            + ", ".join(missing)
        )
    return {name: found[name] for name in required}


def fetch_site_database_environment(
    *,
    api_key: str,
    account: str,
    site_id: str,
) -> dict[str, str]:
    credential = f"{api_key} account={account}:".encode("utf-8")
    authorization = base64.b64encode(credential).decode("ascii")
    request = Request(
        f"{ALWAYSDATA_SITE_API_ROOT}/{site_id}/",
        headers={
            "Accept": "application/json",
            "Authorization": f"Basic {authorization}",
            "User-Agent": "tv-tracker-deploy/1",
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=15) as response:
            raw = response.read(MAX_SITE_RESPONSE_BYTES + 1)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise DeploymentEnvironmentError(
            "Could not read the Alwaysdata site configuration"
        ) from exc

    if len(raw) > MAX_SITE_RESPONSE_BYTES:
        raise DeploymentEnvironmentError("Alwaysdata site configuration response is too large")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise DeploymentEnvironmentError(
            "Alwaysdata site configuration response is not valid JSON"
        ) from exc

    if not isinstance(payload, dict):
        raise DeploymentEnvironmentError("Alwaysdata site configuration is not an object")
    if str(payload.get("id", "")) != site_id:
        raise DeploymentEnvironmentError("Alwaysdata site configuration ID does not match")
    if payload.get("type") != "wsgi":
        raise DeploymentEnvironmentError("Alwaysdata deployment target is not a WSGI site")

    return parse_site_environment(payload.get("environment"))


def _github_command_escape(value: str) -> str:
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


def write_github_environment(path: str | os.PathLike[str], values: Mapping[str, str]) -> None:
    target = Path(path)
    try:
        with target.open("a", encoding="utf-8", newline="\n") as handle:
            for name in REQUIRED_DATABASE_ENV:
                value = values[name]
                print(f"::add-mask::{_github_command_escape(value)}")
                handle.write(f"{name}={value}\n")
    except OSError as exc:
        raise DeploymentEnvironmentError("Could not write GitHub deployment environment") from exc


def main() -> int:
    try:
        api_key = _required_value(os.environ, "ALWAYSDATA_API_KEY")
        account = _required_value(os.environ, "ALWAYSDATA_ACCOUNT")
        site_id = _validated_site_id(
            _required_value(os.environ, "ALWAYSDATA_SITE_ID")
        )
        github_env = _required_value(os.environ, "GITHUB_ENV")
        values = fetch_site_database_environment(
            api_key=api_key,
            account=account,
            site_id=site_id,
        )
        write_github_environment(github_env, values)
    except DeploymentEnvironmentError as exc:
        print(f"Deployment environment error: {exc}", file=sys.stderr)
        return 2

    print("Resolved production database environment from Alwaysdata site configuration.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
