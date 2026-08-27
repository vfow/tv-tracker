from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from tvtracker.database.connection import required_env
from tvtracker.media.tmdb_proxy import tmdb_proxy_path_group


def fetch_tmdb_notification_json(
    tmdb_path: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fetch an internal TMDB endpoint used by notification processing.

    Notification callers share the same path allowlist as the browser-facing
    proxy. This keeps server-side jobs from accidentally turning a future path
    value into an arbitrary upstream request.
    """
    if tmdb_proxy_path_group(str(tmdb_path or "")) is None:
        raise RuntimeError("Invalid TMDB notification path")

    query_items: list[tuple[str, str]] = []
    for key, value in (params or {}).items():
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            query_items.extend((str(key), str(item)) for item in value)
        else:
            query_items.append((str(key), str(value)))
    query_items.append(("api_key", required_env("TMDB_API_KEY")))

    target = (
        "https://api.themoviedb.org/3/"
        + tmdb_path
        + "?"
        + urlencode(query_items)
    )
    upstream_request = Request(
        target,
        headers={
            "Accept": "application/json",
            "User-Agent": "TVTracker/1.0",
        },
    )
    try:
        with urlopen(upstream_request, timeout=20) as upstream:
            payload = json.loads(upstream.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("TMDB notification request failed") from error
    if not isinstance(payload, dict):
        raise RuntimeError("TMDB notification response was invalid")
    return payload
