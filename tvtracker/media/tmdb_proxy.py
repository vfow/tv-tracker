from __future__ import annotations

import re
import threading
import time

TMDB_PROXY_CACHE_MAX_ENTRIES = 500
TMDB_PROXY_CACHE_TTL = 300
TMDB_PROXY_CACHE = {}
TMDB_PROXY_CACHE_LOCK = threading.Lock()
TMDB_PROXY_CACHE_BUSTER_PARAMS = frozenset({
    "_",
    "cb",
    "t",
    "bust",
    "cache_bust",
    "cache_buster",
    "no_cache",
})
TMDB_PROXY_ID_PATTERN = r"[1-9][0-9]{0,9}"
TMDB_PROXY_SEASON_PATTERN = r"[0-9]{1,5}"
TMDB_PROXY_EPISODE_PATTERN = r"[1-9][0-9]{0,5}"
TMDB_PROXY_FIND_ID_PATTERN = r"[A-Za-z0-9]{1,64}"
TMDB_PROXY_PATH_RULES = [
    (re.compile(r"^configuration$"), "none"),
    (re.compile(r"^configuration/(?:countries|languages)$"), "none"),
    (re.compile(r"^certification/movie/list$"), "none"),
    (re.compile(r"^genre/(?:tv|movie)/list$"), "none"),
    (re.compile(r"^watch/providers/(?:tv|movie)$"), "watch-providers"),
    (re.compile(rf"^find/{TMDB_PROXY_FIND_ID_PATTERN}$"), "find"),
    (re.compile(r"^search/(?:tv|movie|person|collection|keyword|company)$"), "search"),
    (re.compile(r"^discover/(?:tv|movie)$"), "browse"),
    (re.compile(r"^trending/(?:tv|movie)/(?:day|week)$"), "trending"),
    (re.compile(r"^tv/(?:popular|top_rated|airing_today|on_the_air)$"), "browse"),
    (re.compile(r"^movie/(?:popular|top_rated|now_playing|upcoming)$"), "browse"),
    (re.compile(rf"^tv/{TMDB_PROXY_ID_PATTERN}$"), "append"),
    (re.compile(rf"^tv/{TMDB_PROXY_ID_PATTERN}/external_ids$"), "none"),
    (re.compile(rf"^tv/{TMDB_PROXY_ID_PATTERN}/keywords$"), "none"),
    (re.compile(rf"^tv/{TMDB_PROXY_ID_PATTERN}/watch/providers$"), "none"),
    (re.compile(rf"^tv/{TMDB_PROXY_ID_PATTERN}/season/{TMDB_PROXY_SEASON_PATTERN}$"), "append"),
    (re.compile(rf"^tv/{TMDB_PROXY_ID_PATTERN}/season/{TMDB_PROXY_SEASON_PATTERN}/episode/{TMDB_PROXY_EPISODE_PATTERN}$"), "append"),
    (re.compile(rf"^movie/{TMDB_PROXY_ID_PATTERN}$"), "append"),
    (re.compile(rf"^movie/{TMDB_PROXY_ID_PATTERN}/watch/providers$"), "none"),
    (re.compile(rf"^person/{TMDB_PROXY_ID_PATTERN}$"), "append"),
    (re.compile(rf"^network/{TMDB_PROXY_ID_PATTERN}$"), "none"),
    (re.compile(rf"^keyword/{TMDB_PROXY_ID_PATTERN}$"), "none"),
    (re.compile(rf"^company/{TMDB_PROXY_ID_PATTERN}$"), "none"),
]
TMDB_PROXY_PATH_SHAPES = [
    (re.compile(r"^find/[^/]+$"), "find"),
    (re.compile(r"^tv/[^/]+(?:/(?:external_ids|keywords|watch/providers|season/[^/]+(?:/episode/[^/]+)?))?$"), "append"),
    (re.compile(r"^movie/[^/]+(?:/watch/providers)?$"), "append"),
    (re.compile(r"^person/[^/]+$"), "append"),
    (re.compile(r"^network/[^/]+$"), "none"),
    (re.compile(r"^keyword/[^/]+$"), "none"),
    (re.compile(r"^company/[^/]+$"), "none"),
]
TMDB_PROXY_SORTS = frozenset({
    "popularity.desc",
    "popularity.asc",
    "vote_average.desc",
    "vote_average.asc",
    "first_air_date.desc",
    "first_air_date.asc",
    "primary_release_date.desc",
    "primary_release_date.asc",
})
TMDB_PROXY_TV_STATUSES = frozenset({"returning-series", "in-production", "ended", "canceled"})
TMDB_PROXY_MONETIZATION_TYPES = frozenset({"flatrate"})
TMDB_PROXY_EXTERNAL_SOURCES = frozenset({"imdb_id", "tvdb_id"})
TMDB_PROXY_APPEND_FIELDS = frozenset({
    "external_ids",
    "videos",
    "content_ratings",
    "watch/providers",
    "similar",
    "aggregate_credits",
    "alternative_titles",
    "keywords",
    "credits",
    "release_dates",
    "combined_credits",
})


def _tmdb_proxy_validate_query(value: str) -> str | None:
    return value if value and len(value) <= 300 else None


def _tmdb_proxy_validate_bool(value: str) -> str | None:
    return value if value in {"true", "false"} else None


def _tmdb_proxy_validate_page(value: str) -> str | None:
    if re.fullmatch(r"[0-9]{1,3}", value):
        return value if 1 <= int(value) <= 500 else None
    return None


def _tmdb_proxy_validate_language(value: str) -> str | None:
    return value if re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", value) else None


def _tmdb_proxy_validate_original_language(value: str) -> str | None:
    return value if re.fullmatch(r"[a-z]{2,3}", value) else None


def _tmdb_proxy_validate_region(value: str) -> str | None:
    return value if re.fullmatch(r"[A-Z]{2}", value) else None


def _tmdb_proxy_validate_date(value: str) -> str | None:
    return value if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value) else None


def _tmdb_proxy_validate_year(value: str) -> str | None:
    return value if re.fullmatch(r"(?:18|19|20|21)[0-9]{2}", value) else None


def _tmdb_proxy_validate_int(value: str, maximum: int) -> str | None:
    if re.fullmatch(r"[0-9]{1,7}", value):
        return value if int(value) <= maximum else None
    return None


def _tmdb_proxy_validate_sort(value: str) -> str | None:
    return value if value in TMDB_PROXY_SORTS else None


def _tmdb_proxy_validate_certification(value: str) -> str | None:
    return value if re.fullmatch(r"[A-Z0-9-]{1,10}", value) else None


def _tmdb_proxy_validate_id_list(value: str) -> str | None:
    tokens = [token for token in re.split(r"[|,]", value) if token]
    if not tokens or any(
        not re.fullmatch(r"[1-9][0-9]{0,9}", token) for token in tokens
    ):
        return None
    return value


def _tmdb_proxy_validate_choice_list(value: str, choices: frozenset) -> str | None:
    tokens = [token for token in re.split(r"[|,]", value) if token]
    if not tokens or any(token not in choices for token in tokens):
        return None
    return value


def _tmdb_proxy_validate_append(value: str) -> str | None:
    fields = [token for token in value.split(",") if token]
    if not fields or any(token not in TMDB_PROXY_APPEND_FIELDS for token in fields):
        return None
    return ",".join(fields)


def _tmdb_proxy_validate_external_source(value: str) -> str | None:
    return value if value in TMDB_PROXY_EXTERNAL_SOURCES else None


TMDB_PROXY_PARAM_SPECS = {
    "none": {},
    "find": {"external_source": _tmdb_proxy_validate_external_source},
    "search": {
        "query": _tmdb_proxy_validate_query,
        "include_adult": _tmdb_proxy_validate_bool,
        "page": _tmdb_proxy_validate_page,
    },
    "trending": {"language": _tmdb_proxy_validate_language},
    "watch-providers": {
        "language": _tmdb_proxy_validate_language,
        "watch_region": _tmdb_proxy_validate_region,
    },
    "append": {"append_to_response": _tmdb_proxy_validate_append},
    "browse": {
        "page": _tmdb_proxy_validate_page,
        "sort_by": _tmdb_proxy_validate_sort,
        "include_adult": _tmdb_proxy_validate_bool,
        "include_null_first_air_dates": _tmdb_proxy_validate_bool,
        "include_video": _tmdb_proxy_validate_bool,
        "with_genres": _tmdb_proxy_validate_id_list,
        "with_keywords": _tmdb_proxy_validate_id_list,
        "with_companies": _tmdb_proxy_validate_id_list,
        "with_networks": _tmdb_proxy_validate_id_list,
        "with_watch_providers": _tmdb_proxy_validate_id_list,
        "watch_region": _tmdb_proxy_validate_region,
        "with_watch_monetization_types": lambda value: _tmdb_proxy_validate_choice_list(value, TMDB_PROXY_MONETIZATION_TYPES),
        "with_runtime.gte": lambda value: _tmdb_proxy_validate_int(value, 100000),
        "with_runtime.lte": lambda value: _tmdb_proxy_validate_int(value, 100000),
        "with_origin_country": _tmdb_proxy_validate_region,
        "with_original_language": _tmdb_proxy_validate_original_language,
        "first_air_date.gte": _tmdb_proxy_validate_date,
        "first_air_date.lte": _tmdb_proxy_validate_date,
        "primary_release_date.gte": _tmdb_proxy_validate_date,
        "primary_release_date.lte": _tmdb_proxy_validate_date,
        "air_date.gte": _tmdb_proxy_validate_date,
        "air_date.lte": _tmdb_proxy_validate_date,
        "release_date.gte": _tmdb_proxy_validate_date,
        "release_date.lte": _tmdb_proxy_validate_date,
        "first_air_date_year": _tmdb_proxy_validate_year,
        "primary_release_year": _tmdb_proxy_validate_year,
        "with_status": lambda value: _tmdb_proxy_validate_choice_list(value, TMDB_PROXY_TV_STATUSES),
        "certification_country": _tmdb_proxy_validate_region,
        "certification": _tmdb_proxy_validate_certification,
        "vote_count.gte": lambda value: _tmdb_proxy_validate_int(value, 1000000),
        "with_release_type": _tmdb_proxy_validate_id_list,
        "without_genres": _tmdb_proxy_validate_id_list,
    },
}


def tmdb_proxy_path_group(tmdb_path: str) -> str | None:
    for regex, group in TMDB_PROXY_PATH_RULES:
        if regex.fullmatch(tmdb_path):
            return group
    return None


def tmdb_proxy_validated_params(group: str, request_args) -> list[tuple[str, str]]:
    spec = TMDB_PROXY_PARAM_SPECS[group]
    validated: list[tuple[str, str]] = []
    for key in request_args:
        validate = spec.get(key)
        if validate is None:
            continue
        for raw_value in request_args.getlist(key):
            value = validate(raw_value)
            if value is not None:
                validated.append((key, value))
    return validated


def tmdb_proxy_cached_body(cache_key: str) -> bytes | None:
    with TMDB_PROXY_CACHE_LOCK:
        entry = TMDB_PROXY_CACHE.get(cache_key)
        if entry is None:
            return None
        if time.monotonic() - entry["saved_at"] > TMDB_PROXY_CACHE_TTL:
            TMDB_PROXY_CACHE.pop(cache_key, None)
            return None
        return entry["body"]


def tmdb_proxy_store_cached_body(cache_key: str, body: bytes) -> None:
    with TMDB_PROXY_CACHE_LOCK:
        TMDB_PROXY_CACHE[cache_key] = {"saved_at": time.monotonic(), "body": body}
        while len(TMDB_PROXY_CACHE) > TMDB_PROXY_CACHE_MAX_ENTRIES:
            TMDB_PROXY_CACHE.pop(next(iter(TMDB_PROXY_CACHE)), None)
