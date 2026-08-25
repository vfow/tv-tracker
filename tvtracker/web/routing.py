from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode


APP_ROUTE_ID_SLUG = r"[1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?"
APP_EPISODE_ROUTE_ID_SLUG = APP_ROUTE_ID_SLUG
APP_SHOW_PATH_RE = re.compile(rf"^/app/show/({APP_ROUTE_ID_SLUG})$")
APP_EPISODE_PATH_RE = re.compile(
    rf"^/app/show/({APP_EPISODE_ROUTE_ID_SLUG})/season/([0-9]{{1,5}})/episode/([1-9][0-9]{{0,5}})$"
)
APP_GENRE_PATH_RE = re.compile(rf"^/app/genre/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_NETWORK_PATH_RE = re.compile(rf"^/app/network/({APP_ROUTE_ID_SLUG})$")
APP_LANGUAGE_PATH_RE = re.compile(r"^/app/language/(tv|movie)/[a-z]{2,3}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$")
APP_COUNTRY_PATH_RE = re.compile(r"^/app/country/(tv|movie)/[a-z]{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$")
APP_THEME_PATH_RE = re.compile(rf"^/app/theme/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_MOVIE_PATH_RE = re.compile(rf"^/app/movie/({APP_ROUTE_ID_SLUG})$")
APP_COMPANY_PATH_RE = re.compile(rf"^/app/company/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_PROVIDER_PATH_RE = re.compile(rf"^/app/provider/(tv|movie)/({APP_ROUTE_ID_SLUG})$")
APP_YEAR_PATH_RE = re.compile(r"^/app/year/(tv|movie)/((?:18|19|20|21)[0-9]{2})$")
APP_STATUS_PATH_RE = re.compile(r"^/app/status/(returning-series|ended|canceled|in-production)$")
APP_CERTIFICATION_PATH_RE = re.compile(r"^/app/certification/movie/[a-z0-9]+(?:-[a-z0-9]+)*$")
APP_COLLECTIONS_PATH_RE = re.compile(r"^/app/collections$")
APP_COLLECTION_PATH_RE = re.compile(rf"^/app/collection/({APP_ROUTE_ID_SLUG})$")
APP_BROWSE_PATH_RE = re.compile(r"^/app/browse/(tv|movie)$")
APP_BROWSE_SORT_MODES = {
    "popularity-desc",
    "popularity-asc",
    "rating-desc",
    "rating-asc",
    "date-desc",
    "date-asc",
}
APP_COLLECTION_SORT_MODES = {
    "name.asc",
    "size.desc",
    "date.desc",
    "date.asc",
    "rating.desc",
    "rating.asc",
    "popularity.desc",
    "popularity.asc",
}
APP_BROWSE_STATUS_VALUES = {"returning-series", "in-production", "ended", "canceled"}
APP_BROWSE_RUNTIME_VALUES = {
    "tv": {"under-30", "30-44", "45-59", "60-89", "90-plus"},
    "movie": {"under-90", "90-119", "120-149", "150-179", "180-plus"},
}
APP_DISCOVER_CATEGORY_PATH_RE = re.compile(
    r"^/app/discover/(?:(?:tv)/(?:popular|top-rated|airing-today|on-the-air)|(?:movie)/(?:popular|top-rated|now-playing|upcoming))$"
)
APP_LIST_PATH_RE = re.compile(r"^/app/list/(watching|paused|completed|plan-to-watch|dropped)$")
APP_LIBRARY_SORT_MODES = {
    "default",
    "title-az",
    "title-za",
    "recently-added",
    "recently-watched",
    "rating-desc",
    "year-newest",
    "year-oldest",
}
APP_PERSON_PATH_RE = re.compile(rf"^/app/person/({APP_ROUTE_ID_SLUG})$")
APP_SECTION_PATHS = {
    "/app/upcoming",
    "/app/history",
    "/app/discover",
    "/app/search",
    "/app/profile",
    "/app/settings",
    "/app/notifications",
}

SETTINGS_SECTION_PATHS = {
    "/app/settings/auth",
    "/app/settings/danger-zone",
    "/app/settings/data",
    "/app/settings/notifications",
    "/app/settings/profile",
    "/app/settings/streaming",
}
ERROR_PAGE_MESSAGES = {
    404: ("Are you lost?", ""),
    500: ("Houston, we have a problem", "Something went wrong. Try again in a moment."),
}
APP_EYE_QUERY_FLAGS = ("fadeWatched", "hideWatched", "hidePlan", "hideFavorites")


def canonical_eye_query_params(raw_values: dict[str, str]) -> dict[str, str]:
    """Return supported tracked visibility flags as canonical URL params."""
    return {key: "1" for key in APP_EYE_QUERY_FLAGS if raw_values.get(key) == "1"}


def canonical_browse_query(raw_query: str, media_type: str) -> str:
    """Return a small canonical query string for Discover browse state."""
    media = "movie" if str(media_type or "").strip().lower() == "movie" else "tv"
    raw_values: dict[str, str] = {}
    for key, value in parse_qsl(str(raw_query or ""), keep_blank_values=False):
        if key not in raw_values:
            raw_values[key] = value.strip()

    def clean_id_list(key: str) -> str:
        values: list[str] = []
        seen: set[str] = set()
        for item in raw_values.get(key, "").split(","):
            clean = item.strip()
            if not re.fullmatch(r"[1-9][0-9]{0,11}", clean) or clean in seen:
                continue
            seen.add(clean)
            values.append(clean)
            if len(values) >= 12:
                break
        return ",".join(values)

    params: dict[str, str] = {}
    for key in ("genre", "theme", "company"):
        clean = clean_id_list(key)
        if clean:
            params[key] = clean

    if media == "tv":
        network = raw_values.get("network", "")
        if re.fullmatch(r"[1-9][0-9]{0,11}", network):
            params["network"] = network

    provider = clean_id_list("provider")
    if provider:
        params["provider"] = provider

    runtime = raw_values.get("runtime", "").lower()
    if runtime in APP_BROWSE_RUNTIME_VALUES[media]:
        params["runtime"] = runtime

    country = raw_values.get("country", "").lower()
    if re.fullmatch(r"[a-z]{2}", country):
        params["country"] = country

    language = raw_values.get("language", "").lower()
    if re.fullmatch(r"[a-z]{2,3}", language):
        params["language"] = language

    if raw_values.get("upcoming") == "1":
        params["upcoming"] = "1"
    else:
        year = raw_values.get("year", "")
        decade = raw_values.get("decade", "")
        if re.fullmatch(r"(?:18|19|20|21)[0-9]{2}", year):
            params["year"] = year
        elif re.fullmatch(r"(?:18|19|20|21)[0-9]0", decade):
            decade_value = int(decade)
            if 1870 <= decade_value <= 2190:
                params["decade"] = decade

    if media == "tv":
        statuses: list[str] = []
        seen_statuses: set[str] = set()
        for item in raw_values.get("status", "").split(","):
            clean = item.strip().lower()
            if clean in APP_BROWSE_STATUS_VALUES and clean not in seen_statuses:
                seen_statuses.add(clean)
                statuses.append(clean)
        if statuses:
            params["status"] = ",".join(statuses)
    else:
        certification = raw_values.get("certification", "").lower()
        if re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", certification):
            params["certification"] = certification

    sort_mode = raw_values.get("sort", "").lower()
    if sort_mode in APP_BROWSE_SORT_MODES and sort_mode != "popularity-desc":
        params["sort"] = sort_mode

    params.update(canonical_eye_query_params(raw_values))

    return urlencode(params, safe=",") if params else ""


def app_browse_media_for_path(candidate: str) -> str | None:
    match = APP_BROWSE_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    if APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(candidate):
        parts = candidate.split("/")
        return parts[3] if len(parts) > 3 and parts[3] in {"tv", "movie"} else None
    match = APP_GENRE_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_LANGUAGE_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_COUNTRY_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_THEME_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_COMPANY_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_PROVIDER_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    match = APP_YEAR_PATH_RE.fullmatch(candidate)
    if match:
        return match.group(1)
    if APP_CERTIFICATION_PATH_RE.fullmatch(candidate):
        return "movie"
    if APP_NETWORK_PATH_RE.fullmatch(candidate) or APP_STATUS_PATH_RE.fullmatch(candidate):
        return "tv"
    return None


def safe_next_url(value: str | None) -> str:
    """Return a validated internal application route for post-login use."""
    raw_value = str(value or "").strip().split("#", 1)[0]
    raw_path, separator, raw_query = raw_value.partition("?")
    candidate = raw_path
    if candidate.startswith("/app/") and candidate != "/app/":
        candidate = candidate.rstrip("/")

    if candidate in {"/app", "/app/"}:
        return "/app/list/watching"
    if candidate == "/app/search":
        query = ""
        media_type = "tv"
        raw_values: dict[str, str] = {}
        if separator:
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                clean_value = value.strip()
                if key not in raw_values:
                    raw_values[key] = clean_value
                if key == "q" and clean_value and not query:
                    query = clean_value[:120]
                elif key == "type" and clean_value.lower() in {"tv", "movie", "person", "collection"}:
                    media_type = clean_value.lower()
        params = {"q": query, "type": media_type} if query else {}
        if query and media_type not in {"person", "collection"}:
            params.update(canonical_eye_query_params(raw_values))
        return "/app/search" + (("?" + urlencode(params)) if params else "")
    if APP_LIST_PATH_RE.fullmatch(candidate):
        query = ""
        genre = ""
        network = ""
        year = ""
        sort_mode = "default"
        if separator:
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                clean_value = value.strip()
                if key == "q" and clean_value and not query:
                    query = clean_value[:120]
                elif key == "genre" and clean_value and clean_value.lower() != "all" and not genre:
                    genre = clean_value[:120]
                elif key == "network" and clean_value and clean_value.lower() != "all" and not network:
                    network = clean_value[:120]
                elif key == "year" and re.fullmatch(r"\d{4}", clean_value) and not year:
                    year = clean_value
                elif key == "sort" and clean_value.lower() in APP_LIBRARY_SORT_MODES:
                    sort_mode = clean_value.lower()

        params = {}
        if query:
            params["q"] = query
        if genre:
            params["genre"] = genre
        if network:
            params["network"] = network
        if year:
            params["year"] = year
        if sort_mode != "default":
            params["sort"] = sort_mode
        return candidate + (("?" + urlencode(params)) if params else "")
    browse_media = app_browse_media_for_path(candidate)
    if browse_media:
        browse_query = canonical_browse_query(raw_query if separator else "", browse_media)
        return candidate + (("?" + browse_query) if browse_query else "")
    if candidate in APP_SECTION_PATHS:
        return candidate
    if candidate in SETTINGS_SECTION_PATHS:
        return candidate
    if APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_SHOW_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_EPISODE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_GENRE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_PERSON_PATH_RE.fullmatch(candidate):
        media_type = "tv"
        role = ""
        raw_values: dict[str, str] = {}
        if separator:
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                raw_clean_value = value.strip()
                clean_value = raw_clean_value.lower()
                if key not in raw_values:
                    raw_values[key] = raw_clean_value
                if key == "media" and clean_value in {"tv", "movie"}:
                    media_type = clean_value
                elif key == "role" and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", clean_value):
                    role = clean_value
        params = {}
        if media_type == "movie":
            params["media"] = "movie"
        if role:
            params["role"] = role
        params.update(canonical_eye_query_params(raw_values))
        return candidate + (("?" + urlencode(params)) if params else "")
    if APP_NETWORK_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_LANGUAGE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_COUNTRY_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_THEME_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_MOVIE_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_COMPANY_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_PROVIDER_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_YEAR_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_STATUS_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_CERTIFICATION_PATH_RE.fullmatch(candidate):
        return candidate
    if APP_COLLECTIONS_PATH_RE.fullmatch(candidate):
        query = ""
        genre = ""
        decade = ""
        sort_mode = "popularity.desc"
        page_number = ""
        if separator:
            current_decade = 2100
            for key, value in parse_qsl(raw_query, keep_blank_values=False):
                clean_value = value.strip()
                if key == "q" and clean_value and not query:
                    query = clean_value[:120]
                elif key == "genre" and re.fullmatch(r"[1-9][0-9]{0,11}", clean_value) and not genre:
                    genre = clean_value
                elif key == "decade" and re.fullmatch(r"(?:18|19|20|21)[0-9]0", clean_value):
                    decade_value = int(clean_value)
                    if 1870 <= decade_value <= current_decade and not decade:
                        decade = clean_value
                elif key == "sort" and clean_value.lower() in APP_COLLECTION_SORT_MODES:
                    sort_mode = clean_value.lower()
                elif key == "page" and re.fullmatch(r"[1-9][0-9]{0,5}", clean_value) and not page_number:
                    page_number = clean_value
        params = {}
        if query:
            params["q"] = query
        if genre:
            params["genre"] = genre
        if decade:
            params["decade"] = decade
        if sort_mode != "popularity.desc":
            params["sort"] = sort_mode
        if page_number and page_number != "1":
            params["page"] = page_number
        return candidate + (("?" + urlencode(params)) if params else "")
    if APP_COLLECTION_PATH_RE.fullmatch(candidate):
        return candidate
    return "/app/list/watching"


def valid_app_path(value: str | None) -> bool:
    candidate = str(value or "").strip()
    return (
        candidate in APP_SECTION_PATHS
        or APP_LIST_PATH_RE.fullmatch(candidate) is not None
        or APP_BROWSE_PATH_RE.fullmatch(candidate) is not None
        or APP_SHOW_PATH_RE.fullmatch(candidate) is not None
        or APP_EPISODE_PATH_RE.fullmatch(candidate) is not None
        or APP_GENRE_PATH_RE.fullmatch(candidate) is not None
        or APP_PERSON_PATH_RE.fullmatch(candidate) is not None
        or APP_NETWORK_PATH_RE.fullmatch(candidate) is not None
        or APP_LANGUAGE_PATH_RE.fullmatch(candidate) is not None
        or APP_COUNTRY_PATH_RE.fullmatch(candidate) is not None
        or APP_THEME_PATH_RE.fullmatch(candidate) is not None
        or APP_MOVIE_PATH_RE.fullmatch(candidate) is not None
        or APP_COMPANY_PATH_RE.fullmatch(candidate) is not None
        or APP_PROVIDER_PATH_RE.fullmatch(candidate) is not None
        or APP_YEAR_PATH_RE.fullmatch(candidate) is not None
        or APP_STATUS_PATH_RE.fullmatch(candidate) is not None
        or APP_CERTIFICATION_PATH_RE.fullmatch(candidate) is not None
        or APP_COLLECTIONS_PATH_RE.fullmatch(candidate) is not None
        or APP_COLLECTION_PATH_RE.fullmatch(candidate) is not None
        or APP_DISCOVER_CATEGORY_PATH_RE.fullmatch(candidate) is not None
    )


