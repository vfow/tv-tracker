from __future__ import annotations

import json
import logging
import re
import secrets
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Any

from flask import jsonify, request


MAX_CLIENT_ERROR_BODY_BYTES = 4096
CLIENT_ERROR_WINDOW_SECONDS = 60.0
CLIENT_ERROR_LIMIT_PER_WINDOW = 30

_ALLOWED_CATEGORIES = frozenset(
    {
        "api",
        "promise",
        "provider",
        "runtime",
        "save",
        "session",
        "storage",
    }
)
_ALLOWED_SURFACES = frozenset(
    {
        "app",
        "detail",
        "discover",
        "history",
        "notifications",
        "search",
        "settings",
        "tracker",
        "upcoming",
    }
)
_SAFE_TOKEN_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")
_REQUEST_ID_RE = re.compile(r"^[0-9a-fA-F]{32}$")
_SAFE_CODE_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,64}$")


def _safe_token(value: Any) -> str:
    candidate = str(value or "").strip()
    return candidate if _SAFE_TOKEN_RE.fullmatch(candidate) else ""


def _safe_request_id(value: Any) -> str:
    candidate = str(value or "").strip()
    return candidate.lower() if _REQUEST_ID_RE.fullmatch(candidate) else ""


def _safe_code(value: Any) -> str:
    candidate = str(value or "").strip()
    return candidate if _SAFE_CODE_RE.fullmatch(candidate) else ""


def _safe_status(value: Any) -> int | None:
    try:
        status = int(value)
    except (TypeError, ValueError):
        return None
    return status if 100 <= status <= 599 else None


def _window_allows_event(state: dict[str, Any], now: float) -> bool:
    cutoff = now - CLIENT_ERROR_WINDOW_SECONDS
    lock = state["lock"]
    hits = state["hits"]
    with lock:
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= CLIENT_ERROR_LIMIT_PER_WINDOW:
            return False
        hits.append(now)
        return True


def install_client_error_reporting(
    app: Any,
    *,
    login_required: Callable[[Callable[..., Any]], Callable[..., Any]],
    check_csrf: Callable[[], None],
    release_sha: str | None = None,
    clock: Callable[[], float] = time.monotonic,
    event_id_factory: Callable[[], str] | None = None,
) -> None:
    """Install a privacy-safe browser diagnostic endpoint once.

    The endpoint deliberately accepts only coarse enums, numeric status, a bounded
    machine code, and correlation identifiers. Browser messages, stacks, URLs,
    request bodies, tracker records, account identifiers, cookies, and secrets are
    neither accepted into the event schema nor written to logs.
    """

    if app.extensions.get("client_error_reporting"):
        return

    id_factory = event_id_factory or (lambda: secrets.token_hex(8))
    state: dict[str, Any] = {
        "hits": deque(),
        "lock": threading.Lock(),
    }

    @app.post("/api/client-errors")
    @login_required
    def client_error_api():
        check_csrf()

        content_length = request.content_length
        if content_length is not None and content_length > MAX_CLIENT_ERROR_BODY_BYTES:
            return jsonify({"ok": False, "error": "Client diagnostic is too large."}), 413

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Invalid client diagnostic."}), 400

        if not _window_allows_event(state, clock()):
            return ("", 204)

        category = str(payload.get("category", "")).strip().lower()
        if category not in _ALLOWED_CATEGORIES:
            category = "runtime"

        surface = str(payload.get("surface", "")).strip().lower()
        if surface not in _ALLOWED_SURFACES:
            surface = "app"

        client_event_id = _safe_token(payload.get("clientEventId")) or id_factory()
        request_id = _safe_request_id(payload.get("requestId"))
        code = _safe_code(payload.get("code"))
        status = _safe_status(payload.get("status"))

        event: dict[str, Any] = {
            "event": "client_error",
            "clientEventId": client_event_id,
            "category": category,
            "surface": surface,
        }
        if request_id:
            event["requestId"] = request_id
        if code:
            event["code"] = code
        if status is not None:
            event["status"] = status
        if release_sha:
            event["releaseSha"] = release_sha

        app.logger.log(
            logging.ERROR,
            json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=True),
        )
        return jsonify({"ok": True, "eventId": client_event_id}), 202

    app.extensions["client_error_reporting"] = {
        "installed": True,
        "releaseSha": release_sha,
        "state": state,
    }
