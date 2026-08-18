from __future__ import annotations

import json
from typing import Any

from flask import Flask, request


def is_movie_history_entry(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    media_type = str(entry.get("media_type") or entry.get("type") or "").strip().lower()
    return media_type == "movie" or bool(str(entry.get("movie_id") or "").strip())


def is_special_history_entry(entry: Any) -> bool:
    if not isinstance(entry, dict) or is_movie_history_entry(entry):
        return False
    if entry.get("special") is True:
        return True
    try:
        return int(entry.get("season")) == 0
    except (TypeError, ValueError):
        return False


def summarize_history(history: Any) -> dict[str, int]:
    entries = history if isinstance(history, list) else []
    regular = 0
    special = 0
    movies = 0
    other = 0

    for entry in entries:
        if is_movie_history_entry(entry):
            movies += 1
            continue
        if is_special_history_entry(entry):
            special += 1
            continue
        if isinstance(entry, dict) and (entry.get("tmdb_id") or entry.get("show_id")):
            try:
                int(entry.get("season"))
                int(entry.get("episode"))
            except (TypeError, ValueError):
                other += 1
            else:
                regular += 1
            continue
        other += 1

    return {
        "historyEntries": len(entries),
        "regularHistoryEntries": regular,
        "specialHistoryEntries": special,
        "movieHistoryEntries": movies,
        "otherHistoryEntries": other,
    }


def install_backup_summary_hardening(app: Flask) -> None:
    """Correct backup summary classification at the production WSGI boundary.

    app.py still owns the legacy route during the staged extraction.  This
    response hardener keeps the deployed contract accurate without mutating
    tracker data.  The logic should move into the canonical backup service when
    app.py is split later in the architecture batch.
    """

    if app.extensions.get("tvtracker_data_integrity"):
        return
    app.extensions["tvtracker_data_integrity"] = True

    @app.after_request
    def _correct_backup_summary(response):
        if (
            request.method != "GET"
            or request.path.rstrip("/") != "/api/backup"
            or response.status_code != 200
            or not response.is_json
        ):
            return response

        payload = response.get_json(silent=True)
        if not isinstance(payload, dict):
            return response
        data = payload.get("data")
        if not isinstance(data, dict):
            return response

        summary = payload.get("summary")
        if not isinstance(summary, dict):
            summary = {}
            payload["summary"] = summary
        summary.update(summarize_history(data.get("history")))

        response.set_data(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        )
        response.mimetype = "application/json"
        return response
