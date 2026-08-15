from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    found = text.count(old)
    if found < count:
        raise RuntimeError(f"{path}: expected at least {count} occurrence(s), found {found}: {old[:100]!r}")
    target.write_text(text.replace(old, new, count), encoding="utf-8")


# Narrow Flask seam: provider schema is deliberately NOT added to ensure_schema().
replace("app.py", 'SCHEMA_VERSION = 4', 'SCHEMA_VERSION = 5')
replace(
    "app.py",
    """        timezone TEXT NOT NULL DEFAULT '',\n        new_season BOOLEAN NOT NULL DEFAULT TRUE,""",
    """        timezone TEXT NOT NULL DEFAULT '',\n        timezone_mode TEXT NOT NULL DEFAULT 'automatic',\n        new_season BOOLEAN NOT NULL DEFAULT TRUE,""",
)
replace(
    "app.py",
    """    CREATE TABLE IF NOT EXISTS tv_tracker_notification_baseline (""",
    """    ALTER TABLE tv_tracker_notification_settings\n    ADD COLUMN IF NOT EXISTS timezone_mode TEXT NOT NULL DEFAULT 'automatic';\n\n    CREATE TABLE IF NOT EXISTS tv_tracker_notification_baseline (""",
)
replace(
    "app.py",
    """app = create_app()\n""",
    """app = create_app()\n\n# Optional release-timing integration is installed after the core app exists so\n# deleting its modules can never prevent Flask from constructing TV Tracker.\ntry:\n    from release_timing_routes import install_release_timing_routes\n    install_release_timing_routes(\n        app,\n        login_required=login_required,\n        connection_factory=database_connection,\n        tmdb_fetcher=fetch_tmdb_notification_json,\n    )\nexcept (ImportError, OSError, RuntimeError):\n    app.logger.exception(\"Optional release timing integration unavailable; using core fallback\")\n""",
)

# Load the generic runtime timing cache before app.js; it owns no tracker state.
replace(
    "templates/index.html",
    """<script src=\"{{ url_for('static', filename='js/notifications.js') }}\"></script>\n<script src=\"{{ url_for('static', filename='js/app.js') }}\"></script>""",
    """<script src=\"{{ url_for('static', filename='js/notifications.js') }}\"></script>\n<script src=\"{{ url_for('static', filename='js/release-timing.js') }}\"></script>\n<script src=\"{{ url_for('static', filename='js/app.js') }}\"></script>""",
)

# Runtime lookup seam: exact/provider data never enters DATA.shows or History.
replace(
    "static/js/app.js",
    """function getEpisodeReleaseInfo(airDateString,episodeInfo=null,showInfo=null){\n\n    const baseDateString = getEpisodeCalendarDateString(\n        airDateString,\n        episodeInfo\n    );\n\n    if(!baseDateString){\n        return null;\n    }\n\n    const releaseDate = makeDateOnlyEpisodeReleaseDate(baseDateString);\n\n    if(!releaseDate){\n        return null;\n    }\n\n    return {\n        date:releaseDate,\n        hasTime:false,\n        source:\"date-only\"\n    };\n\n}""",
    """function getEpisodeReleaseInfo(airDateString,episodeInfo=null,showInfo=null){\n\n    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.getReleaseInfo === \"function\"){\n        const canonical = window.TVTrackerReleaseTiming.getReleaseInfo(airDateString,episodeInfo,showInfo);\n        if(canonical){\n            return canonical;\n        }\n    }\n\n    const baseDateString = getEpisodeCalendarDateString(airDateString,episodeInfo);\n    if(!baseDateString){ return null; }\n    const releaseDate = makeDateOnlyEpisodeReleaseDate(baseDateString);\n    if(!releaseDate){ return null; }\n    return {date:releaseDate,hasTime:false,precision:\"date_only\",source:\"date-only\"};\n\n}""",
)
replace(
    "static/js/app.js",
    """function getDayDiffFromToday(dateString,episodeInfo=null){\n\n    const date = makeLocalDate(\n        getEpisodeCalendarDateString(dateString,episodeInfo)\n    );""",
    """function getDayDiffFromToday(dateString,episodeInfo=null,showInfo=null){\n\n    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.getDayDiff === \"function\"){\n        const canonicalDiff = window.TVTrackerReleaseTiming.getDayDiff(dateString,episodeInfo,showInfo);\n        if(canonicalDiff !== null){ return canonicalDiff; }\n    }\n\n    const date = makeLocalDate(\n        getEpisodeCalendarDateString(dateString,episodeInfo)\n    );""",
)
replace(
    "static/js/app.js",
    """function getUpcomingGroup(airDateString,episodeInfo=null){\n\n    const diffDays = getDayDiffFromToday(airDateString,episodeInfo);""",
    """function getUpcomingGroup(airDateString,episodeInfo=null,showInfo=null){\n\n    const diffDays = getDayDiffFromToday(airDateString,episodeInfo,showInfo);""",
)
replace(
    "static/js/app.js",
    """const group = getUpcomingGroup(missedEpisode.air_date,missedEpisode);""",
    """const group = getUpcomingGroup(missedEpisode.air_date,missedEpisode,show);""",
)
replace(
    "static/js/app.js",
    """const group = getUpcomingGroup(ep.air_date,ep);""",
    """const group = getUpcomingGroup(ep.air_date,ep,show);""",
)
replace(
    "static/js/app.js",
    """    const diffDays = getDayDiffFromToday(airDateString,episodeInfo);\n\n    if(diffDays === null){\n        return \"\";\n    }\n\n    const releaseTime = getEpisodeReleaseTimeText(airDateString,episodeInfo,showInfo);""",
    """    const diffDays = getDayDiffFromToday(airDateString,episodeInfo,showInfo);\n\n    if(diffDays === null){\n        return \"\";\n    }\n\n    const releaseTime = getEpisodeReleaseTimeText(airDateString,episodeInfo,showInfo);""",
)

# Prefetch before Upcoming computes its synchronous cards/loggability.
replace(
    "static/js/app.js",
    """    await autoUpdateStatuses(forceRefresh);\n\n    await saveData();""",
    """    await autoUpdateStatuses(forceRefresh);\n\n    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.prefetchShows === \"function\"){\n        await window.TVTrackerReleaseTiming.prefetchShows(DATA.shows);\n    }\n\n    await saveData();""",
)

# User history is immutable truth once logged. Do not re-filter it through a later schedule correction.
old_history = """    return DATA.history\n    .filter(entry=>!isMovieHistoryEntry(entry))\n    .filter(entry=>{\n\n        if(!entry.air_date){\n            return true;\n        }\n\n        return isEpisodeAired(\n            entry.air_date,\n            entry,\n            DATA.shows[String(entry.tmdb_id)] || null\n        );\n\n    })\n    .slice()"""
new_history = """    return DATA.history\n    .filter(entry=>!isMovieHistoryEntry(entry))\n    .slice()"""
replace("static/js/app.js", old_history, new_history)
replace(
    "static/js/app.js",
    """            air_date:episodeData.air_date || \"\",\n            air_time:episodeData.air_time || \"\",\n            air_timestamp:episodeData.air_timestamp || \"\",\n            watched_at:watchedAt,""",
    """            air_date:episodeData.air_date || \"\",\n            watched_at:watchedAt,""",
)

# Initial runtime bootstrap is non-blocking; Upcoming's own preparation awaits the cache.
replace(
    "static/js/app.js",
    """    setupEvents();\n    renderAll();\n    appDataReady = true;""",
    """    setupEvents();\n    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.initialize === \"function\"){\n        window.TVTrackerReleaseTiming.initialize({\n            onRefresh:()=>{\n                if(activePage === \"shows\" && activeShowsTab === \"upcoming\"){ renderUpcoming(false); }\n            }\n        }).then(()=>window.TVTrackerReleaseTiming.prefetchShows(DATA.shows)).catch(()=>{});\n    }\n    renderAll();\n    appDataReady = true;""",
)

# Notification timezone becomes the single effective tracker timezone.
replace(
    "notifications_backend.py",
    '    "timezone": "",\n}',
    '    "timezone": "",\n    "timezone_mode": "automatic",\n}',
)
replace(
    "notifications_backend.py",
    '    "timezone",\n    "new_season",',
    '    "timezone",\n    "timezone_mode",\n    "new_season",',
)
replace(
    "notifications_backend.py",
    '        "timezone": str(settings.get("timezone") or ""),\n        "newSeason":',
    '        "timezone": str(settings.get("timezone") or ""),\n        "timezoneMode": str(settings.get("timezone_mode") or "automatic"),\n        "newSeason":',
)
replace(
    "notifications_backend.py",
    '    result["timezone"] = str(result.get("timezone") or "")\n    return result',
    '    result["timezone"] = str(result.get("timezone") or "")\n    result["timezone_mode"] = "manual" if str(result.get("timezone_mode") or "automatic") == "manual" else "automatic"\n    return result',
)
replace(
    "notifications_backend.py",
    """    timezone_if_unset = payload.get(\"timezoneIfUnset\") is True\n\n    with connection_factory() as connection:""",
    """    timezone_mode = None\n    if \"timezoneMode\" in payload:\n        timezone_mode = str(payload.get(\"timezoneMode\") or \"\").strip().lower()\n        if timezone_mode not in {\"automatic\", \"manual\"}:\n            raise ValueError(\"timezoneMode must be automatic or manual\")\n        updates[\"timezone_mode\"] = timezone_mode\n\n    timezone_if_unset = payload.get(\"timezoneIfUnset\") is True\n\n    with connection_factory() as connection:""",
)
replace(
    "notifications_backend.py",
    '        "timezone": str(settings.get("timezone") or ""),\n        "enabled": bool(settings.get("enabled", True)),',
    '        "timezone": str(settings.get("timezone") or ""),\n        "timezoneMode": str(settings.get("timezone_mode") or "automatic"),\n        "enabled": bool(settings.get("enabled", True)),',
)

# Stable notification identities: dates are mutable schedule metadata, not event identity.
replace(
    "notification_engine.py",
    'def premiere_tomorrow_event_key(show_id: str, season_number: int, air_date: str) -> str:\n    return f"season-premiere-tomorrow:{show_id}:s{season_number}:{air_date}"',
    'def premiere_tomorrow_event_key(show_id: str, season_number: int, air_date: str = "") -> str:\n    return f"season-premiere-tomorrow:{show_id}:s{season_number}"',
)
replace(
    "notification_engine.py",
    'event_key=f"new-episode:{show_id}:s{season_number}:e{episode_number}:{air_date}",\n                        group_key=f"new-episode:{show_id}:s{season_number}:e{episode_number}:{air_date}",',
    'event_key=f"new-episode:{show_id}:s{season_number}:e{episode_number}",\n                        group_key=f"new-episode:{show_id}:s{season_number}:e{episode_number}",',
)
replace(
    "notification_engine.py",
    'f"returns-tomorrow:{show_id}:s{season_number}:"\n                            f"e{int(episode[\'episode_number\'])}:{air_date}"',
    'f"returns-tomorrow:{show_id}:s{season_number}:"\n                            f"e{int(episode[\'episode_number\'])}"',
    count=2,
)

print("TVmaze rollout integration patches applied.")
