from __future__ import annotations

import json
import os
import threading
import time
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from psycopg.types.json import Jsonb


TVMAZE_API_BASE = "https://api.tvmaze.com"
TVMAZE_USER_AGENT = "TVTracker/2.0 (optional TVmaze release timing; github.com/vfow/tv-tracker)"
VALIDATOR_VERSION = 1
MAPPING_SUCCESS_TTL = timedelta(days=30)
MAPPING_NEGATIVE_TTL = timedelta(hours=12)
EPISODE_SUCCESS_TTL = timedelta(hours=6)
EPISODE_NEGATIVE_TTL = timedelta(hours=2)
MAX_RETRIES = 2
REQUEST_TIMEOUT_SECONDS = 4.0

_DEFAULT_PROVIDER: "TVmazeProvider | None" = None
_DEFAULT_PROVIDER_LOCK = threading.Lock()


def _date(value: Any) -> date | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    try:
        parsed = date.fromisoformat(clean)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == clean else None


def _aware_datetime(value: Any) -> datetime | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    if clean.endswith("Z"):
        clean = clean[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(clean)
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc)


def classify_episode_timing(show: dict[str, Any], episode: dict[str, Any]) -> dict[str, Any] | None:
    """Conservatively classify one already identity-validated TVmaze episode.

    Global web channels intentionally do not gain exact authority merely because
    TVmaze emits an airstamp. Exact authority requires a country-backed schedule,
    a declared airtime, a timezone-aware airstamp, and local-date consistency.
    """
    air_day = _date(episode.get("airdate"))
    if not air_day:
        return None
    stamp = _aware_datetime(episode.get("airstamp"))
    airtime = str(episode.get("airtime") or "").strip()
    network = show.get("network") if isinstance(show.get("network"), dict) else None
    web_channel = show.get("webChannel") if isinstance(show.get("webChannel"), dict) else None
    channel = network or web_channel or {}
    country = channel.get("country") if isinstance(channel.get("country"), dict) else None
    timezone_name = str((country or {}).get("timezone") or "").strip()
    is_global_web = bool(web_channel) and not country

    if stamp and airtime and timezone_name and not is_global_web:
        try:
            from zoneinfo import ZoneInfo
            local_day = stamp.astimezone(ZoneInfo(timezone_name)).date()
        except Exception:
            local_day = None
        if local_day == air_day:
            return {
                "precision": "exact",
                "release_at": stamp.isoformat(),
                "release_date": air_day.isoformat(),
                "trusted": True,
                "reason": "verified_scheduled_exact",
            }

    return {
        "precision": "date_only",
        "release_at": "",
        "release_date": air_day.isoformat(),
        "trusted": True,
        "reason": "global_web_date_only" if is_global_web else "unverified_time_date_only",
    }


class TVmazeProvider:
    def __init__(
        self,
        *,
        connection_factory: Callable[[], Any],
        tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
        opener: Callable[..., Any] = urlopen,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.connection_factory = connection_factory
        self.tmdb_fetcher = tmdb_fetcher
        self.opener = opener
        self.sleep = sleep
        self._schema_lock = threading.Lock()
        self._schema_ready = False
        self._request_lock = threading.Lock()
        self._inflight: dict[str, threading.Event] = {}
        self._recent_requests: dict[str, tuple[float, dict[str, Any] | None, Exception | None]] = {}
        self.diagnostics = {
            "requests": 0,
            "cache_hits": 0,
            "mapping_conflicts": 0,
            "episode_mismatches": 0,
            "rate_limited": 0,
            "failures": 0,
        }

    def ensure_provider_schema(self) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if self._schema_ready:
                return
            statements = """
            CREATE TABLE IF NOT EXISTS tv_tracker_tvmaze_mapping (
                tmdb_id BIGINT PRIMARY KEY,
                tvmaze_id BIGINT,
                imdb_id TEXT NOT NULL DEFAULT '',
                tvdb_id BIGINT,
                status TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                validator_version INTEGER NOT NULL,
                checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tv_tracker_tvmaze_episode_cache (
                tvmaze_id BIGINT NOT NULL,
                season_number INTEGER NOT NULL,
                episode_number INTEGER NOT NULL,
                payload JSONB NOT NULL,
                precision TEXT NOT NULL DEFAULT '',
                release_at TIMESTAMPTZ,
                release_date DATE,
                reason TEXT NOT NULL DEFAULT '',
                validator_version INTEGER NOT NULL,
                checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                PRIMARY KEY (tvmaze_id, season_number, episode_number)
            );
            CREATE INDEX IF NOT EXISTS tv_tracker_tvmaze_episode_expiry_idx
            ON tv_tracker_tvmaze_episode_cache (expires_at);
            """
            with self.connection_factory() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(statements)
                connection.commit()
            self._schema_ready = True

    @staticmethod
    def _retry_delay(error: HTTPError, attempt: int) -> float:
        retry_after = str(error.headers.get("Retry-After") or "").strip() if error.headers else ""
        if retry_after:
            try:
                return max(0.5, min(float(retry_after), 4.0))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return max(0.5, min((retry_at - datetime.now(timezone.utc)).total_seconds(), 4.0))
                except Exception:
                    pass
        return min(0.75 * (2 ** attempt), 3.0)

    def _request_json_uncached(self, url: str) -> dict[str, Any] | None:
        request = Request(url, headers={"Accept": "application/json", "User-Agent": TVMAZE_USER_AGENT})
        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                self.diagnostics["requests"] += 1
                with self.opener(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                return payload if isinstance(payload, dict) else None
            except HTTPError as error:
                if error.code == 404:
                    return None
                if error.code == 429 and attempt < MAX_RETRIES:
                    self.diagnostics["rate_limited"] += 1
                    self.sleep(self._retry_delay(error, attempt))
                    continue
                last_error = error
                break
            except (URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
                last_error = error
                break
        self.diagnostics["failures"] += 1
        if last_error:
            raise RuntimeError("TVmaze request failed") from last_error
        return None

    def _request_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        query = urlencode({key: value for key, value in (params or {}).items() if value is not None})
        url = TVMAZE_API_BASE + path + (("?" + query) if query else "")
        now = time.monotonic()
        leader = False
        with self._request_lock:
            recent = self._recent_requests.get(url)
            if recent and now - recent[0] <= 2.0:
                _, payload, error = recent
                if error is not None:
                    raise RuntimeError("TVmaze request failed") from error
                return payload
            event = self._inflight.get(url)
            if event is None:
                event = threading.Event()
                self._inflight[url] = event
                leader = True

        if not leader:
            event.wait(timeout=(REQUEST_TIMEOUT_SECONDS * (MAX_RETRIES + 1)) + 8.0)
            with self._request_lock:
                recent = self._recent_requests.get(url)
            if recent:
                _, payload, error = recent
                if error is not None:
                    raise RuntimeError("TVmaze request failed") from error
                return payload
            raise RuntimeError("TVmaze request deduplication wait expired")

        payload: dict[str, Any] | None = None
        stored_error: Exception | None = None
        try:
            payload = self._request_json_uncached(url)
            return payload
        except RuntimeError as error:
            stored_error = error
            raise
        finally:
            with self._request_lock:
                self._recent_requests[url] = (time.monotonic(), payload, stored_error)
                finished = self._inflight.pop(url, None)
                if finished is not None:
                    finished.set()

    def _lookup_external(self, *, imdb_id: str, tvdb_id: int | None) -> tuple[int | None, str]:
        matches: set[int] = set()
        if tvdb_id:
            payload = self._request_json("/lookup/shows", {"thetvdb": int(tvdb_id)})
            if payload and int(payload.get("id") or 0) > 0:
                matches.add(int(payload["id"]))
        if imdb_id:
            payload = self._request_json("/lookup/shows", {"imdb": imdb_id})
            if payload and int(payload.get("id") or 0) > 0:
                matches.add(int(payload["id"]))
        if len(matches) > 1:
            self.diagnostics["mapping_conflicts"] += 1
            return None, "external_id_conflict"
        if not matches:
            return None, "not_mapped"
        return next(iter(matches)), "verified_external_id"

    def _cached_mapping(self, tmdb_id: int) -> tuple[int | None, str] | None:
        self.ensure_provider_schema()
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT tvmaze_id, status, reason FROM tv_tracker_tvmaze_mapping "
                    "WHERE tmdb_id = %s AND validator_version = %s AND expires_at > NOW()",
                    (int(tmdb_id), VALIDATOR_VERSION),
                )
                row = cursor.fetchone()
        if not row:
            return None
        self.diagnostics["cache_hits"] += 1
        return (int(row[0]) if row[0] else None, str(row[2] or row[1] or ""))

    def _store_mapping(
        self,
        tmdb_id: int,
        tvmaze_id: int | None,
        imdb_id: str,
        tvdb_id: int | None,
        status: str,
        reason: str,
    ) -> None:
        ttl = MAPPING_SUCCESS_TTL if tvmaze_id else MAPPING_NEGATIVE_TTL
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_tvmaze_mapping
                    (tmdb_id, tvmaze_id, imdb_id, tvdb_id, status, reason, validator_version, checked_at, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW() + %s::interval)
                    ON CONFLICT (tmdb_id) DO UPDATE SET
                        tvmaze_id = EXCLUDED.tvmaze_id, imdb_id = EXCLUDED.imdb_id,
                        tvdb_id = EXCLUDED.tvdb_id, status = EXCLUDED.status,
                        reason = EXCLUDED.reason, validator_version = EXCLUDED.validator_version,
                        checked_at = NOW(), expires_at = EXCLUDED.expires_at
                    """,
                    (int(tmdb_id), tvmaze_id, imdb_id, tvdb_id, status, reason, VALIDATOR_VERSION, str(ttl)),
                )
            connection.commit()

    def _mapping(self, tmdb_id: int) -> tuple[int | None, str]:
        cached = self._cached_mapping(tmdb_id)
        if cached is not None:
            return cached
        external = self.tmdb_fetcher(f"tv/{int(tmdb_id)}/external_ids", None)
        imdb_id = str(external.get("imdb_id") or "").strip()
        raw_tvdb = external.get("tvdb_id")
        try:
            tvdb_id = int(raw_tvdb) if raw_tvdb else None
        except (TypeError, ValueError):
            tvdb_id = None
        tvmaze_id, reason = self._lookup_external(imdb_id=imdb_id, tvdb_id=tvdb_id)
        status = "verified" if tvmaze_id else ("conflict" if reason == "external_id_conflict" else "missing")
        self._store_mapping(tmdb_id, tvmaze_id, imdb_id, tvdb_id, status, reason)
        return tvmaze_id, reason

    def _cached_episode(self, tvmaze_id: int, season: int, episode: int) -> dict[str, Any] | None | object:
        self.ensure_provider_schema()
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT payload, precision, release_at, release_date, reason FROM tv_tracker_tvmaze_episode_cache "
                    "WHERE tvmaze_id = %s AND season_number = %s AND episode_number = %s "
                    "AND validator_version = %s AND expires_at > NOW()",
                    (tvmaze_id, season, episode, VALIDATOR_VERSION),
                )
                row = cursor.fetchone()
        if not row:
            return _CACHE_MISS
        self.diagnostics["cache_hits"] += 1
        if not row[1]:
            return None
        return {
            "precision": str(row[1]),
            "release_at": row[2].isoformat() if row[2] else "",
            "release_date": row[3].isoformat() if row[3] else "",
            "trusted": True,
            "reason": str(row[4] or "cached"),
        }

    def _store_episode(self, tvmaze_id: int, season: int, episode: int, raw: dict[str, Any], result: dict[str, Any] | None, reason: str) -> None:
        ttl = EPISODE_SUCCESS_TTL if result else EPISODE_NEGATIVE_TTL
        release_at = _aware_datetime((result or {}).get("release_at"))
        release_date = _date((result or {}).get("release_date"))
        with self.connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO tv_tracker_tvmaze_episode_cache
                    (tvmaze_id, season_number, episode_number, payload, precision, release_at, release_date, reason,
                     validator_version, checked_at, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW() + %s::interval)
                    ON CONFLICT (tvmaze_id, season_number, episode_number) DO UPDATE SET
                        payload = EXCLUDED.payload, precision = EXCLUDED.precision,
                        release_at = EXCLUDED.release_at, release_date = EXCLUDED.release_date,
                        reason = EXCLUDED.reason, validator_version = EXCLUDED.validator_version,
                        checked_at = NOW(), expires_at = EXCLUDED.expires_at
                    """,
                    (tvmaze_id, season, episode, Jsonb(raw), str((result or {}).get("precision") or ""),
                     release_at, release_date, reason, VALIDATOR_VERSION, str(ttl)),
                )
            connection.commit()

    def resolve_episode(
        self,
        *,
        tmdb_id: int,
        season_number: int,
        episode_number: int,
        tmdb_air_date: str,
    ) -> dict[str, Any] | None:
        if int(tmdb_id) <= 0 or int(season_number) <= 0 or int(episode_number) <= 0:
            return None
        tvmaze_id, _ = self._mapping(int(tmdb_id))
        if not tvmaze_id:
            return None
        cached = self._cached_episode(tvmaze_id, int(season_number), int(episode_number))
        if cached is not _CACHE_MISS:
            return cached  # type: ignore[return-value]

        episode = self._request_json(
            f"/shows/{tvmaze_id}/episodebynumber",
            {"season": int(season_number), "number": int(episode_number)},
        )
        if not episode:
            self._store_episode(tvmaze_id, int(season_number), int(episode_number), {}, None, "episode_missing")
            return None
        if int(episode.get("season") or -1) != int(season_number) or int(episode.get("number") or -1) != int(episode_number):
            self.diagnostics["episode_mismatches"] += 1
            self._store_episode(tvmaze_id, int(season_number), int(episode_number), episode, None, "episode_identity_mismatch")
            return None

        show = self._request_json(f"/shows/{tvmaze_id}") or {}
        result = classify_episode_timing(show, episode)
        if result and tmdb_air_date and result.get("release_date"):
            # Date disagreements are valid shadow/audit evidence. Do not silently
            # upgrade to exact authority when identities agree but dates do not.
            if str(tmdb_air_date) != str(result["release_date"]) and result.get("precision") == "exact":
                result = dict(result)
                result["precision"] = "date_only"
                result["release_at"] = ""
                result["reason"] = "provider_date_disagreement"
        self._store_episode(tvmaze_id, int(season_number), int(episode_number), episode, result, str((result or {}).get("reason") or "unusable"))
        return result


_CACHE_MISS = object()


def configure_default_provider(
    *,
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
) -> TVmazeProvider:
    global _DEFAULT_PROVIDER
    with _DEFAULT_PROVIDER_LOCK:
        _DEFAULT_PROVIDER = TVmazeProvider(connection_factory=connection_factory, tmdb_fetcher=tmdb_fetcher)
        return _DEFAULT_PROVIDER


def get_default_provider() -> TVmazeProvider | None:
    return _DEFAULT_PROVIDER


def provider_diagnostics() -> dict[str, Any]:
    provider = get_default_provider()
    return dict(provider.diagnostics) if provider else {}
