from __future__ import annotations

import hashlib
import hmac
from pathlib import Path
from typing import Any


_VERSION_CACHE: dict[str, tuple[int, int, str]] = {}


def static_asset_version(static_folder: str | None, filename: str) -> str:
    if not static_folder:
        raise RuntimeError("Static folder is unavailable.")

    root = Path(static_folder).resolve()
    path = (root / str(filename)).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError("Static asset path must stay inside the static folder.") from error

    stat = path.stat()
    cache_key = str(path)
    cached = _VERSION_CACHE.get(cache_key)
    if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
        return cached[2]

    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    _VERSION_CACHE[cache_key] = (stat.st_mtime_ns, stat.st_size, digest)
    return digest


def install_static_asset_versioning(app: Any) -> None:
    if app.extensions.get("static_asset_versioning"):
        return

    from flask import request, url_for

    def versioned_url_for(endpoint: str, **values: Any) -> str:
        if endpoint == "static" and values.get("filename"):
            values["v"] = static_asset_version(
                app.static_folder,
                str(values["filename"]),
            )
        return url_for(endpoint, **values)

    app.jinja_env.globals["url_for"] = versioned_url_for

    def enforce_static_cache_policy(response: Any) -> Any:
        if not request.path.startswith("/static/"):
            return response

        requested_version = str(request.args.get("v") or "")
        filename = ""
        if request.endpoint == "static" and isinstance(request.view_args, dict):
            filename = str(request.view_args.get("filename") or "")

        version_matches = False
        if requested_version and filename:
            try:
                expected = static_asset_version(app.static_folder, filename)
                version_matches = hmac.compare_digest(requested_version, expected)
            except (OSError, RuntimeError, ValueError):
                version_matches = False

        response.headers["Cache-Control"] = (
            "public, max-age=31536000, immutable"
            if version_matches
            else "public, max-age=0, must-revalidate"
        )
        return response

    # Flask runs after_request handlers in reverse registration order. Insert
    # this first so it runs last and can refine the app's generic static policy.
    app.after_request_funcs.setdefault(None, []).insert(0, enforce_static_cache_policy)
    app.extensions["static_asset_versioning"] = {"installed": True}
