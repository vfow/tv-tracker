from __future__ import annotations

from typing import Any, Callable

from flask import abort, jsonify, request

from release_timing import ReleaseTimingResolver, provider_capability, provider_flags, valid_timezone


MAX_BATCH_EPISODES = 200


def _effective_timezone(connection_factory: Callable[[], Any]) -> tuple[str, str]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            try:
                cursor.execute(
                    "SELECT timezone, timezone_mode FROM tv_tracker_notification_settings WHERE singleton_id = 1"
                )
                row = cursor.fetchone()
                if row:
                    return valid_timezone(str(row[0] or "UTC")), str(row[1] or "automatic")
            except Exception:
                connection.rollback()
                cursor.execute(
                    "SELECT timezone FROM tv_tracker_notification_settings WHERE singleton_id = 1"
                )
                row = cursor.fetchone()
                if row and str(row[0] or "").strip():
                    return valid_timezone(str(row[0])), "automatic"
    return "UTC", "automatic"


def install_release_timing_routes(
    app: Any,
    *,
    login_required: Callable[[Callable[..., Any]], Callable[..., Any]],
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
) -> None:
    flags = provider_flags()
    if flags["master_enabled"] and any((
        flags["shadow_enabled"],
        flags["upcoming_enabled"],
        flags["notifications_enabled"],
    )):
        try:
            from tvmaze_integration import configure_default_provider
            configure_default_provider(connection_factory=connection_factory, tmdb_fetcher=tmdb_fetcher)
        except (ImportError, OSError, RuntimeError):
            # Optional integration must never prevent TV Tracker from booting.
            pass

    @app.get("/api/release-timing/status")
    @login_required
    def release_timing_status():
        timezone_name, timezone_mode = _effective_timezone(connection_factory)
        return jsonify({
            "capability": provider_capability(),
            "timezone": timezone_name,
            "timezoneMode": timezone_mode,
        })

    @app.post("/api/release-timing/batch")
    @login_required
    def release_timing_batch():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            abort(400)
        raw_episodes = payload.get("episodes")
        if not isinstance(raw_episodes, list) or len(raw_episodes) > MAX_BATCH_EPISODES:
            abort(400)
        timezone_name, timezone_mode = _effective_timezone(connection_factory)
        flags = provider_flags()
        resolver = ReleaseTimingResolver(
            provider_enabled=flags["master_enabled"],
            query_enabled=flags["shadow_enabled"] or flags["upcoming_enabled"],
            exact_enabled=flags["upcoming_enabled"],
            date_only_enabled=flags["upcoming_enabled"],
        )
        results: dict[str, Any] = {}
        for raw in raw_episodes:
            if not isinstance(raw, dict):
                continue
            try:
                tmdb_id = int(raw.get("tmdbId") or 0)
                season = int(raw.get("season") or 0)
                episode = int(raw.get("episode") or 0)
            except (TypeError, ValueError):
                continue
            if tmdb_id <= 0 or season <= 0 or episode <= 0:
                continue
            key = f"{tmdb_id}:{season}:{episode}"
            timing = resolver.resolve(
                tmdb_id=tmdb_id,
                season_number=season,
                episode_number=episode,
                tmdb_air_date=str(raw.get("airDate") or ""),
                timezone_name=timezone_name,
            )
            if timing:
                serialized = timing.to_api(timezone_name)
                results[key] = serialized
        return jsonify({
            "results": results,
            "timezone": timezone_name,
            "timezoneMode": timezone_mode,
        })
