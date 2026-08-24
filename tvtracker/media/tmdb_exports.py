from __future__ import annotations

import gzip
import json
import os
import re
import threading
import time
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request

from tvtracker.database.connection import required_env


def _urlopen(request_object, timeout):
    # Patch-compatible transport seam: the urllib entrypoint is resolved through
    # the legacy app module so patch.object(app, "urlopen", ...) keeps
    # intercepting upstream requests (see tests/test_cache_headers.py).
    # Remove once callers patch the tvtracker.media transport directly.
    from app import urlopen

    return urlopen(request_object, timeout)


TMDB_NETWORK_EXPORT_CACHE_TTL_SECONDS = 6 * 60 * 60
TMDB_NETWORK_EXPORT_LOOKBACK_DAYS = 4
TMDB_NETWORK_SEARCH_MAX_RESULTS = 20
TMDB_NETWORK_SEARCH_QUERY_MAX_CHARS = 80
TMDB_NETWORK_EXPORT_CACHE: dict[str, Any] = {
    "loaded_at": 0.0,
    "source_date": "",
    "records": [],
}
TMDB_NETWORK_EXPORT_LOCK = threading.Lock()
TMDB_COLLECTION_EXPORT_CACHE_TTL_SECONDS = 24 * 60 * 60
TMDB_COLLECTION_EXPORT_LOOKBACK_DAYS = 7
TMDB_COLLECTION_INDEX_BATCH_SIZE = 80
TMDB_COLLECTION_INDEX_VERSION = 1
TMDB_COLLECTION_INDEX_CACHE_FILE = "tmdb_collection_index.json"
TMDB_COLLECTION_INDEX_BUILD_STATE: dict[str, Any] = {
    "building": False,
    "started_at": 0.0,
    "last_error": "",
}
TMDB_COLLECTION_INDEX_LOCK = threading.Lock()


def normalize_tmdb_network_search_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).split())


def tmdb_network_export_candidate_dates(now: datetime | None = None) -> list[date]:
    current = now or datetime.utcnow()
    first_date = current.date()
    if current.hour < 8:
        first_date -= timedelta(days=1)
    return [first_date - timedelta(days=offset) for offset in range(TMDB_NETWORK_EXPORT_LOOKBACK_DAYS)]


def parse_tmdb_network_export_payload(compressed: bytes) -> list[dict[str, Any]]:
    payload = gzip.decompress(compressed).decode("utf-8", errors="replace")
    records: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except (TypeError, ValueError):
            continue
        if not isinstance(item, dict):
            continue
        try:
            network_id = int(item.get("id") or 0)
        except (TypeError, ValueError):
            continue
        name = str(item.get("name") or item.get("original_name") or "").strip()
        if network_id <= 0 or not name or network_id in seen_ids:
            continue
        search_key = normalize_tmdb_network_search_text(name)
        if not search_key:
            continue
        seen_ids.add(network_id)
        record: dict[str, Any] = {
            "id": network_id,
            "name": name,
            "search_key": search_key,
        }
        origin_country = str(item.get("origin_country") or "").strip().upper()
        if re.fullmatch(r"[A-Z]{2}", origin_country):
            record["origin_country"] = origin_country
        records.append(record)
    records.sort(key=lambda item: (str(item["name"]).casefold(), int(item["id"])))
    return records


def fetch_tmdb_network_export(export_date: date) -> list[dict[str, Any]]:
    filename = f"tv_network_ids_{export_date:%m_%d_%Y}.json.gz"
    target = f"https://files.tmdb.org/p/exports/{filename}"
    upstream_request = Request(
        target,
        headers={
            "Accept": "application/gzip, application/octet-stream",
            "User-Agent": "TVTracker/1.0",
        },
    )
    with _urlopen(upstream_request, timeout=20) as upstream:
        compressed = upstream.read()
    return parse_tmdb_network_export_payload(compressed)


def get_tmdb_network_export_records() -> tuple[list[dict[str, Any]], str]:
    now = time.time()
    cached_records = TMDB_NETWORK_EXPORT_CACHE.get("records")
    loaded_at = float(TMDB_NETWORK_EXPORT_CACHE.get("loaded_at") or 0.0)
    if isinstance(cached_records, list) and cached_records and now - loaded_at < TMDB_NETWORK_EXPORT_CACHE_TTL_SECONDS:
        return cached_records, str(TMDB_NETWORK_EXPORT_CACHE.get("source_date") or "")

    with TMDB_NETWORK_EXPORT_LOCK:
        now = time.time()
        cached_records = TMDB_NETWORK_EXPORT_CACHE.get("records")
        loaded_at = float(TMDB_NETWORK_EXPORT_CACHE.get("loaded_at") or 0.0)
        if isinstance(cached_records, list) and cached_records and now - loaded_at < TMDB_NETWORK_EXPORT_CACHE_TTL_SECONDS:
            return cached_records, str(TMDB_NETWORK_EXPORT_CACHE.get("source_date") or "")

        last_error: Exception | None = None
        for export_date in tmdb_network_export_candidate_dates():
            try:
                records = fetch_tmdb_network_export(export_date)
            except (HTTPError, URLError, TimeoutError, OSError, EOFError) as error:
                last_error = error
                continue
            if not records:
                continue
            TMDB_NETWORK_EXPORT_CACHE.update({
                "loaded_at": now,
                "source_date": export_date.isoformat(),
                "records": records,
            })
            return records, export_date.isoformat()

        if isinstance(cached_records, list) and cached_records:
            return cached_records, str(TMDB_NETWORK_EXPORT_CACHE.get("source_date") or "")
        raise RuntimeError("TMDB network export is unavailable") from last_error


def search_tmdb_network_export(query: str, *, limit: int = TMDB_NETWORK_SEARCH_MAX_RESULTS) -> tuple[list[dict[str, Any]], str]:
    clean_query = normalize_tmdb_network_search_text(query)
    if len(clean_query) < 2:
        return [], ""
    records, source_date = get_tmdb_network_export_records()
    query_tokens = clean_query.split()
    matches: list[tuple[tuple[int, int, str, int], dict[str, Any]]] = []
    for item in records:
        search_key = str(item.get("search_key") or "")
        if not search_key:
            continue
        if search_key == clean_query:
            rank = 0
        elif search_key.startswith(clean_query):
            rank = 1
        elif all(token in search_key.split() for token in query_tokens):
            rank = 2
        elif all(token in search_key for token in query_tokens):
            rank = 3
        elif clean_query in search_key:
            rank = 4
        else:
            continue
        public_item = {
            "id": int(item["id"]),
            "name": str(item["name"]),
        }
        if item.get("origin_country"):
            public_item["origin_country"] = str(item["origin_country"])
        matches.append(((rank, len(search_key), search_key, int(item["id"])), public_item))
    matches.sort(key=lambda item: item[0])
    safe_limit = max(1, min(int(limit or TMDB_NETWORK_SEARCH_MAX_RESULTS), TMDB_NETWORK_SEARCH_MAX_RESULTS))
    return [item for _, item in matches[:safe_limit]], source_date


def tmdb_collection_cache_path() -> Path:
    data_dir = Path(os.environ.get("TV_TRACKER_DATA_DIR") or (Path(__file__).resolve().parents[2] / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / TMDB_COLLECTION_INDEX_CACHE_FILE


def read_tmdb_collection_index_cache() -> dict[str, Any]:
    path = tmdb_collection_cache_path()
    if not path.exists():
        return {
            "version": TMDB_COLLECTION_INDEX_VERSION,
            "source_date": "",
            "export_checked_at": 0.0,
            "indexed_at": 0.0,
            "cursor": 0,
            "total_ids": 0,
            "collection_ids": [],
            "collections": [],
        }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {
            "version": TMDB_COLLECTION_INDEX_VERSION,
            "source_date": "",
            "export_checked_at": 0.0,
            "indexed_at": 0.0,
            "cursor": 0,
            "total_ids": 0,
            "collection_ids": [],
            "collections": [],
        }
    if not isinstance(payload, dict) or int(payload.get("version") or 0) != TMDB_COLLECTION_INDEX_VERSION:
        return {
            "version": TMDB_COLLECTION_INDEX_VERSION,
            "source_date": "",
            "export_checked_at": 0.0,
            "indexed_at": 0.0,
            "cursor": 0,
            "total_ids": 0,
            "collection_ids": [],
            "collections": [],
        }
    payload.setdefault("source_date", "")
    payload.setdefault("export_checked_at", 0.0)
    payload.setdefault("indexed_at", 0.0)
    payload.setdefault("cursor", 0)
    payload.setdefault("total_ids", 0)
    payload.setdefault("collection_ids", [])
    payload.setdefault("collections", [])
    if not isinstance(payload["collection_ids"], list):
        payload["collection_ids"] = []
    if not isinstance(payload["collections"], list):
        payload["collections"] = []
    return payload


def write_tmdb_collection_index_cache(payload: dict[str, Any]) -> None:
    path = tmdb_collection_cache_path()
    safe_payload = {
        "version": TMDB_COLLECTION_INDEX_VERSION,
        "source_date": str(payload.get("source_date") or ""),
        "export_checked_at": float(payload.get("export_checked_at") or 0.0),
        "indexed_at": float(payload.get("indexed_at") or 0.0),
        "cursor": max(0, int(payload.get("cursor") or 0)),
        "total_ids": max(0, int(payload.get("total_ids") or 0)),
        "collection_ids": [int(value) for value in payload.get("collection_ids") or [] if str(value).isdigit()],
        "collections": [item for item in payload.get("collections") or [] if isinstance(item, dict) and item.get("id")],
    }
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(safe_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp_path, path)


def tmdb_collection_export_candidate_dates(now: datetime | None = None) -> list[date]:
    current = now or datetime.utcnow()
    first_date = current.date()
    if current.hour < 8:
        first_date -= timedelta(days=1)
    return [first_date - timedelta(days=offset) for offset in range(TMDB_COLLECTION_EXPORT_LOOKBACK_DAYS)]


def normalize_tmdb_collection_name(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def parse_tmdb_collection_export_payload(compressed: bytes) -> list[dict[str, Any]]:
    payload = gzip.decompress(compressed).decode("utf-8", errors="replace")
    records: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except (TypeError, ValueError):
            continue
        if not isinstance(item, dict):
            continue
        try:
            collection_id = int(item.get("id") or 0)
        except (TypeError, ValueError):
            continue
        name = normalize_tmdb_collection_name(item.get("name") or item.get("original_name"))
        if collection_id <= 0 or collection_id in seen_ids:
            continue
        try:
            popularity = float(item.get("popularity") or 0.0)
        except (TypeError, ValueError):
            popularity = 0.0
        seen_ids.add(collection_id)
        records.append({
            "id": collection_id,
            "name": name,
            "popularity": popularity,
        })
    records.sort(key=lambda item: (-float(item.get("popularity") or 0.0), str(item.get("name") or "").casefold(), int(item["id"])))
    return records


def fetch_tmdb_collection_export(export_date: date) -> list[dict[str, Any]]:
    filename = f"collection_ids_{export_date:%m_%d_%Y}.json.gz"
    target = f"https://files.tmdb.org/p/exports/{filename}"
    upstream_request = Request(
        target,
        headers={
            "Accept": "application/gzip, application/octet-stream",
            "User-Agent": "TVTracker/1.0",
        },
    )
    with _urlopen(upstream_request, timeout=20) as upstream:
        compressed = upstream.read()
    return parse_tmdb_collection_export_payload(compressed)


def latest_tmdb_collection_export_records() -> tuple[list[dict[str, Any]], str]:
    last_error: Exception | None = None
    for export_date in tmdb_collection_export_candidate_dates():
        try:
            records = fetch_tmdb_collection_export(export_date)
        except (HTTPError, URLError, TimeoutError, OSError, EOFError) as error:
            last_error = error
            continue
        if records:
            return records, export_date.isoformat()
    raise RuntimeError("TMDB collection export is unavailable") from last_error


def slugify_tmdb_collection_label(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.casefold()).strip("-")
    return slug or "collection"


def tmdb_collection_detail_url(collection_id: int) -> str:
    return (
        "https://api.themoviedb.org/3/collection/"
        + str(int(collection_id))
        + "?"
        + urlencode({"api_key": required_env("TMDB_API_KEY")})
    )


def fetch_tmdb_collection_detail(collection_id: int) -> dict[str, Any]:
    upstream_request = Request(
        tmdb_collection_detail_url(collection_id),
        headers={
            "Accept": "application/json",
            "User-Agent": "TVTracker/1.0",
        },
    )
    with _urlopen(upstream_request, timeout=20) as upstream:
        return json.loads(upstream.read().decode("utf-8", errors="replace"))


def normalize_collection_genre_ids(value: Any) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for raw in value if isinstance(value, list) else []:
        try:
            genre_id = int(raw)
        except (TypeError, ValueError):
            continue
        if genre_id <= 0 or genre_id in seen:
            continue
        seen.add(genre_id)
        ids.append(genre_id)
    return ids


def normalize_tmdb_collection_movie_part(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    try:
        movie_id = int(raw.get("id") or 0)
    except (TypeError, ValueError):
        return None
    title = normalize_tmdb_collection_name(raw.get("title") or raw.get("name") or raw.get("original_title"))
    if movie_id <= 0 or not title:
        return None
    return {
        "id": movie_id,
        "title": title,
        "name": title,
        "media_type": "movie",
        "poster_path": str(raw.get("poster_path") or ""),
        "backdrop_path": str(raw.get("backdrop_path") or ""),
        "overview": str(raw.get("overview") or ""),
        "release_date": str(raw.get("release_date") or ""),
        "date": str(raw.get("release_date") or ""),
        "genre_ids": normalize_collection_genre_ids(raw.get("genre_ids")),
        "original_language": str(raw.get("original_language") or "").strip().lower(),
        "vote_average": float(raw.get("vote_average") or 0.0),
        "popularity": float(raw.get("popularity") or 0.0),
        "adult": raw.get("adult") is True,
    }


def collection_part_release_year(movie: dict[str, Any]) -> int:
    release_date = str(movie.get("release_date") or movie.get("date") or "")
    match = re.match(r"^((?:18|19|20|21)[0-9]{2})", release_date)
    return int(match.group(1)) if match else 0


def compute_tmdb_collection_metadata(parts: list[dict[str, Any]]) -> dict[str, Any]:
    genre_ids: list[int] = []
    seen_genres: set[int] = set()
    decades: list[int] = []
    seen_decades: set[int] = set()
    release_years: list[int] = []
    popularity_total = 0.0
    popularity_count = 0
    rating_total = 0.0
    rating_count = 0
    for movie in parts:
        for genre_id in normalize_collection_genre_ids(movie.get("genre_ids")):
            if genre_id not in seen_genres:
                seen_genres.add(genre_id)
                genre_ids.append(genre_id)
        year = collection_part_release_year(movie)
        if year:
            release_years.append(year)
            decade = (year // 10) * 10
            if decade not in seen_decades:
                seen_decades.add(decade)
                decades.append(decade)
        popularity = float(movie.get("popularity") or 0.0)
        if popularity > 0:
            popularity_total += popularity
            popularity_count += 1
        rating = float(movie.get("vote_average") or 0.0)
        if rating > 0:
            rating_total += rating
            rating_count += 1
    return {
        "genre_ids": sorted(genre_ids),
        "decades": sorted(decades, reverse=True),
        "average_popularity": popularity_total / popularity_count if popularity_count else 0.0,
        "average_rating": rating_total / rating_count if rating_count else 0.0,
        "newest_release_year": max(release_years) if release_years else 0,
        "oldest_release_year": min(release_years) if release_years else 0,
    }


def normalize_tmdb_collection_detail(raw: Any, *, include_parts: bool = False) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    try:
        collection_id = int(raw.get("id") or 0)
    except (TypeError, ValueError):
        return None
    name = normalize_tmdb_collection_name(raw.get("name"))
    if collection_id <= 0 or not name:
        return None
    seen_movies: set[int] = set()
    parts: list[dict[str, Any]] = []
    for raw_part in raw.get("parts") if isinstance(raw.get("parts"), list) else []:
        part = normalize_tmdb_collection_movie_part(raw_part)
        if not part or int(part["id"]) in seen_movies:
            continue
        seen_movies.add(int(part["id"]))
        parts.append(part)
    if not parts:
        return None
    poster_paths = [str(movie.get("poster_path") or "") for movie in parts if movie.get("poster_path")][:3]
    if not poster_paths and raw.get("poster_path"):
        poster_paths.append(str(raw.get("poster_path")))
    poster_slots = [
        {
            "id": int(movie.get("id") or 0),
            "title": str(movie.get("title") or movie.get("name") or ""),
            "name": str(movie.get("title") or movie.get("name") or ""),
            "poster_path": str(movie.get("poster_path") or ""),
            "release_date": str(movie.get("release_date") or movie.get("date") or ""),
            "date": str(movie.get("release_date") or movie.get("date") or ""),
        }
        for movie in parts[:3]
    ]
    metadata = compute_tmdb_collection_metadata(parts)
    summary: dict[str, Any] = {
        "id": collection_id,
        "name": name,
        "title": name,
        "overview": str(raw.get("overview") or ""),
        "poster_path": str(raw.get("poster_path") or ""),
        "backdrop_path": str(raw.get("backdrop_path") or ""),
        "poster_paths": poster_paths,
        "poster_slots": poster_slots,
        "movie_count": len(parts),
        "route": f"/app/collection/{collection_id}-{slugify_tmdb_collection_label(name)}",
        **metadata,
    }
    if include_parts:
        summary["parts"] = parts
    return summary


def tmdb_collection_cache_is_stale(cache: dict[str, Any]) -> bool:
    export_checked_at = float(cache.get("export_checked_at") or 0.0)
    return not export_checked_at or time.time() - export_checked_at >= TMDB_COLLECTION_EXPORT_CACHE_TTL_SECONDS


def update_collection_cache_from_export(cache: dict[str, Any]) -> dict[str, Any]:
    if cache.get("collection_ids") and not tmdb_collection_cache_is_stale(cache):
        return cache
    records, source_date = latest_tmdb_collection_export_records()
    export_ids = [int(item["id"]) for item in records]
    current_collections = [item for item in cache.get("collections") or [] if isinstance(item, dict) and item.get("id")]
    valid_ids = set(export_ids)
    kept_collections = [item for item in current_collections if int(item.get("id") or 0) in valid_ids]
    cache.update({
        "version": TMDB_COLLECTION_INDEX_VERSION,
        "source_date": source_date,
        "export_checked_at": time.time(),
        "indexed_at": float(cache.get("indexed_at") or 0.0),
        "cursor": 0,
        "total_ids": len(export_ids),
        "collection_ids": export_ids,
        "collections": kept_collections,
    })
    write_tmdb_collection_index_cache(cache)
    return cache


def tmdb_collection_summary_has_poster_slots(summary: dict[str, Any]) -> bool:
    if not isinstance(summary, dict):
        return False
    slots = summary.get("poster_slots")
    if not isinstance(slots, list) or not slots:
        return False
    try:
        movie_count = int(summary.get("movie_count") or 0)
    except (TypeError, ValueError):
        movie_count = 0
    target_count = min(3, max(movie_count, 1))
    usable_slots = [
        slot for slot in slots[:target_count]
        if isinstance(slot, dict) and (str(slot.get("poster_path") or "").strip() or str(slot.get("title") or slot.get("name") or "").strip())
    ]
    return len(usable_slots) >= target_count


def build_tmdb_collection_index_batch() -> None:
    try:
        cache = update_collection_cache_from_export(read_tmdb_collection_index_cache())
        collection_ids = [int(value) for value in cache.get("collection_ids") or [] if str(value).isdigit()]
        if not collection_ids:
            return
        collection_map: dict[int, dict[str, Any]] = {}
        for item in cache.get("collections") or []:
            try:
                collection_map[int(item.get("id") or 0)] = item
            except (TypeError, ValueError):
                continue
        cursor = max(0, min(int(cache.get("cursor") or 0), len(collection_ids)))
        processed = 0
        while cursor < len(collection_ids) and processed < TMDB_COLLECTION_INDEX_BATCH_SIZE:
            collection_id = int(collection_ids[cursor])
            cursor += 1
            if collection_id in collection_map and tmdb_collection_summary_has_poster_slots(collection_map[collection_id]):
                continue
            try:
                raw_detail = fetch_tmdb_collection_detail(collection_id)
                summary = normalize_tmdb_collection_detail(raw_detail, include_parts=False)
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, RuntimeError):
                summary = None
            if summary:
                collection_map[collection_id] = summary
            processed += 1
        collections = sorted(collection_map.values(), key=lambda item: str(item.get("name") or "").casefold())
        cache.update({
            "indexed_at": time.time(),
            "cursor": cursor,
            "total_ids": len(collection_ids),
            "collections": collections,
        })
        write_tmdb_collection_index_cache(cache)
    except Exception as error:
        with TMDB_COLLECTION_INDEX_LOCK:
            TMDB_COLLECTION_INDEX_BUILD_STATE["last_error"] = str(error)
        raise


def start_tmdb_collection_index_build() -> bool:
    with TMDB_COLLECTION_INDEX_LOCK:
        if TMDB_COLLECTION_INDEX_BUILD_STATE.get("building"):
            return False
        TMDB_COLLECTION_INDEX_BUILD_STATE.update({
            "building": True,
            "started_at": time.time(),
            "last_error": "",
        })

    def runner() -> None:
        try:
            build_tmdb_collection_index_batch()
        except Exception:
            pass
        finally:
            with TMDB_COLLECTION_INDEX_LOCK:
                TMDB_COLLECTION_INDEX_BUILD_STATE["building"] = False

    thread = threading.Thread(target=runner, name="tmdb-collection-index", daemon=True)
    thread.start()
    return True


def collection_index_building() -> bool:
    with TMDB_COLLECTION_INDEX_LOCK:
        return bool(TMDB_COLLECTION_INDEX_BUILD_STATE.get("building"))


def get_tmdb_collection_index_response() -> dict[str, Any]:
    cache = read_tmdb_collection_index_cache()
    total_ids = int(cache.get("total_ids") or 0)
    cursor = int(cache.get("cursor") or 0)
    collections = [item for item in cache.get("collections") or [] if isinstance(item, dict) and item.get("id")]
    needs_poster_slot_backfill = any(
        not tmdb_collection_summary_has_poster_slots(item)
        for item in collections
        if isinstance(item, dict) and int(item.get("movie_count") or 0) >= 2
    )
    should_build = (not collections) or tmdb_collection_cache_is_stale(cache) or needs_poster_slot_backfill or (total_ids and cursor < total_ids)
    if needs_poster_slot_backfill and not collection_index_building():
        cache["cursor"] = 0
        cache["updated_at"] = time.time()
        write_tmdb_collection_index_cache(cache)
    if should_build:
        start_tmdb_collection_index_build()
    return {
        "ok": True,
        "collections": collections,
        "building": collection_index_building(),
        "source_date": str(cache.get("source_date") or ""),
        "indexed_count": len(collections),
        "total_ids": total_ids,
        "cursor": cursor,
    }


def get_cached_tmdb_collection_summary(collection_id: int) -> dict[str, Any] | None:
    cache = read_tmdb_collection_index_cache()
    for item in cache.get("collections") or []:
        try:
            if int(item.get("id") or 0) == int(collection_id):
                return item
        except (TypeError, ValueError):
            continue
    return None
