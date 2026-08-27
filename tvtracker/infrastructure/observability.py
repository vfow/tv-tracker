from __future__ import annotations

import json
import logging
import os
import secrets
import time
from collections.abc import Callable
from typing import Any

from flask import g, request


REQUEST_ID_HEADER = "X-Request-ID"
_LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


def configured_log_level() -> int:
    return _LOG_LEVELS.get(
        os.environ.get("TVTRACKER_LOG_LEVEL", "INFO").strip().upper(),
        logging.INFO,
    )


def _emit_json(logger: Any, level: int, payload: dict[str, Any]) -> None:
    logger.log(
        level,
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True),
    )


def install_request_observability(
    app: Any,
    *,
    release_sha: str | None = None,
    clock: Callable[[], float] = time.perf_counter,
    request_id_factory: Callable[[], str] | None = None,
) -> None:
    """Install privacy-safe request timing and correlation telemetry once.

    Logs intentionally exclude request bodies, query strings, cookies, headers,
    client IPs, and authenticated identity. Matched Flask route templates are
    logged instead of concrete paths so media IDs and user-controlled path text
    do not become operational log data.
    """

    if app.extensions.get("request_observability"):
        return

    id_factory = request_id_factory or (lambda: secrets.token_hex(16))
    app.logger.setLevel(configured_log_level())

    @app.before_request
    def _start_request_observation() -> None:
        g.tvtracker_request_started = clock()
        g.tvtracker_request_id = id_factory()

    @app.after_request
    def _finish_request_observation(response: Any) -> Any:
        request_id = str(getattr(g, "tvtracker_request_id", "") or id_factory())
        response.headers[REQUEST_ID_HEADER] = request_id

        endpoint = request.endpoint or ""
        successful_health_probe = request.path == "/healthz" and response.status_code < 500
        if endpoint == "static" or successful_health_probe:
            return response

        started = getattr(g, "tvtracker_request_started", None)
        elapsed_ms = 0.0
        if isinstance(started, (int, float)):
            elapsed_ms = max(0.0, (clock() - float(started)) * 1000.0)

        url_rule = request.url_rule
        route = url_rule.rule if url_rule is not None else "<unmatched>"
        payload: dict[str, Any] = {
            "event": "http_request",
            "requestId": request_id,
            "method": request.method,
            "route": route,
            "status": int(response.status_code),
            "durationMs": round(elapsed_ms, 2),
        }
        if release_sha:
            payload["releaseSha"] = release_sha

        level = logging.ERROR if response.status_code >= 500 else logging.INFO
        _emit_json(app.logger, level, payload)
        return response

    app.extensions["request_observability"] = {
        "installed": True,
        "releaseSha": release_sha,
    }
