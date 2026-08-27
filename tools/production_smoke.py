from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections.abc import Callable
from typing import Any
from urllib.request import Request, urlopen


SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REQUEST_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def required_value(value: str | None, name: str) -> str:
    clean = str(value or "").strip()
    if not clean:
        raise RuntimeError(f"missing required value: {name}")
    return clean


def validate_release_sha(value: str) -> str:
    clean = required_value(value, "EXPECTED_RELEASE_SHA").lower()
    if SHA_RE.fullmatch(clean) is None:
        raise RuntimeError("EXPECTED_RELEASE_SHA must be a full 40-character Git SHA")
    return clean


def _response_snapshot(response: Any) -> tuple[int, dict[str, str], bytes]:
    status = int(getattr(response, "status", response.getcode()))
    headers = {str(key).lower(): str(value) for key, value in response.headers.items()}
    return status, headers, response.read()


def _fetch(
    request: Request,
    *,
    opener: Callable[..., Any],
    timeout_seconds: float,
) -> tuple[int, dict[str, str], bytes]:
    with opener(request, timeout=timeout_seconds) as response:
        return _response_snapshot(response)


def _validate_health(body: bytes, expected_release_sha: str) -> dict[str, Any]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("health endpoint returned invalid JSON") from error
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        raise RuntimeError("production health endpoint is unhealthy")
    release_sha = str(payload.get("releaseSha") or "").lower()
    if release_sha != expected_release_sha:
        raise RuntimeError("production release SHA does not match the expected SHA")
    return payload


def _validate_login(status: int, headers: dict[str, str]) -> None:
    if status != 200:
        raise RuntimeError(f"login smoke returned HTTP {status}")

    cache_control = headers.get("cache-control", "").lower()
    if "no-store" not in cache_control:
        raise RuntimeError("login smoke is missing Cache-Control: no-store")

    if headers.get("x-content-type-options", "").lower() != "nosniff":
        raise RuntimeError("login smoke is missing X-Content-Type-Options: nosniff")

    csp = headers.get("content-security-policy", "")
    if "default-src 'self'" not in csp or "frame-ancestors 'none'" not in csp:
        raise RuntimeError("login smoke is missing the expected Content-Security-Policy")

    request_id = headers.get("x-request-id", "").lower()
    if REQUEST_ID_RE.fullmatch(request_id) is None:
        raise RuntimeError("login smoke is missing a valid request correlation ID")


def check_production(
    *,
    base_url: str,
    health_token: str,
    expected_release_sha: str,
    opener: Callable[..., Any] = urlopen,
    timeout_seconds: float = 15.0,
) -> dict[str, Any]:
    base = required_value(base_url, "ALWAYSDATA_HEALTH_URL").rstrip("/")
    token = required_value(health_token, "HEALTHZ_SECRET")
    expected = validate_release_sha(expected_release_sha)

    health_request = Request(
        f"{base}/healthz",
        headers={"X-Healthcheck-Token": token},
        method="GET",
    )
    health_status, _health_headers, health_body = _fetch(
        health_request,
        opener=opener,
        timeout_seconds=timeout_seconds,
    )
    if health_status != 200:
        raise RuntimeError(f"health smoke returned HTTP {health_status}")
    health_payload = _validate_health(health_body, expected)

    login_request = Request(f"{base}/login", method="GET")
    login_status, login_headers, _login_body = _fetch(
        login_request,
        opener=opener,
        timeout_seconds=timeout_seconds,
    )
    _validate_login(login_status, login_headers)

    return {
        "ok": True,
        "releaseSha": str(health_payload["releaseSha"]).lower(),
        "checks": ["health", "release", "login", "securityHeaders", "requestId"],
    }


def check_with_retries(
    *,
    base_url: str,
    health_token: str,
    expected_release_sha: str,
    attempts: int,
    delay_seconds: float,
    opener: Callable[..., Any] = urlopen,
    sleeper: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    if attempts < 1:
        raise RuntimeError("attempts must be at least 1")
    if delay_seconds < 0:
        raise RuntimeError("delay must be non-negative")

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return check_production(
                base_url=base_url,
                health_token=health_token,
                expected_release_sha=expected_release_sha,
                opener=opener,
            )
        except Exception as error:
            last_error = error
            if attempt < attempts:
                sleeper(delay_seconds)

    raise RuntimeError(
        f"production smoke failed after {attempts} attempts: {last_error}"
    ) from last_error


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the live TV Tracker release.")
    parser.add_argument("--attempts", type=int, default=8)
    parser.add_argument("--delay-seconds", type=float, default=15.0)
    args = parser.parse_args()

    result = check_with_retries(
        base_url=os.environ.get("ALWAYSDATA_HEALTH_URL", ""),
        health_token=os.environ.get("HEALTHZ_SECRET", ""),
        expected_release_sha=os.environ.get("EXPECTED_RELEASE_SHA", ""),
        attempts=args.attempts,
        delay_seconds=args.delay_seconds,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
