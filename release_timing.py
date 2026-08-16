from __future__ import annotations

import importlib
import os

import psycopg
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any, Callable, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


PRECISION_EXACT = "exact"
PRECISION_DATE_ONLY = "date_only"
PRECISION_UNKNOWN = "unknown"


class ReleaseTimingProvider(Protocol):
    def resolve_episode(
        self,
        *,
        tmdb_id: int,
        season_number: int,
        episode_number: int,
        tmdb_air_date: str,
    ) -> dict[str, Any] | None: ...


def env_flag(name: str, *, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def provider_flags() -> dict[str, bool]:
    """Return the centralized, master-gated TVmaze rollout capabilities."""
    master_enabled = env_flag("TVMAZE_ENABLED")
    return {
        "master_enabled": master_enabled,
        "shadow_enabled": master_enabled and env_flag("TVMAZE_SHADOW_ENABLED"),
        "upcoming_enabled": master_enabled and env_flag("TVMAZE_UPCOMING_ENABLED"),
        "notifications_enabled": master_enabled and env_flag("TVMAZE_NOTIFICATIONS_ENABLED"),
    }


def parse_date(value: Any) -> date | None:
    clean = str(value or "").strip()
    if not clean:
        return None
    try:
        parsed = date.fromisoformat(clean)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == clean else None


def parse_aware_datetime(value: Any) -> datetime | None:
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


def valid_timezone(name: str) -> str:
    clean = str(name or "").strip()
    if not clean or len(clean) > 80:
        raise ValueError("A valid TV Tracker timezone is required")
    try:
        ZoneInfo(clean)
    except ZoneInfoNotFoundError as error:
        raise ValueError("A valid TV Tracker timezone is required") from error
    return clean


def start_of_date_utc(day: date, timezone_name: str) -> datetime:
    zone = ZoneInfo(valid_timezone(timezone_name))
    return datetime.combine(day, time.min, tzinfo=zone).astimezone(timezone.utc)


@dataclass(frozen=True)
class ReleaseTiming:
    release_date: str
    release_at: str
    eligible_at: str
    precision: str
    confidence: str
    provider_used: bool
    reason: str

    def to_api(self, timezone_name: str) -> dict[str, Any]:
        """Serialize the provider-neutral public contract.

        Provider internals deliberately stay private. API consumers see stable
        camelCase fields, `exact|date` precision, and `verified|fallback`
        confidence regardless of which optional provider supplied a candidate.
        """
        display_date = self.release_date
        instant = parse_aware_datetime(self.release_at or self.eligible_at)
        if instant:
            display_date = instant.astimezone(ZoneInfo(valid_timezone(timezone_name))).date().isoformat()
        return {
            "releaseAt": self.release_at or None,
            "releaseDate": self.release_date,
            "eligibleAt": self.eligible_at,
            "precision": "exact" if self.precision == PRECISION_EXACT else "date",
            "confidence": self.confidence,
            "providerUsed": self.provider_used,
            "reason": self.reason,
            "displayDate": display_date,
        }


class ReleaseTimingResolver:
    """TV Tracker-owned timing policy with an optional enrichment provider.

    Provider failures are contained here. Core fallback behavior never imports or
    persists provider-specific data. The `exact_enabled` and `date_only_enabled`
    arguments are internal authority gates supplied by the approved Upcoming or
    Notifications capability; they are not environment/configuration switches.
    """

    def __init__(
        self,
        *,
        provider: ReleaseTimingProvider | None = None,
        provider_enabled: bool | None = None,
        query_enabled: bool | None = None,
        exact_enabled: bool | None = None,
        date_only_enabled: bool | None = None,
    ) -> None:
        self.provider_enabled = env_flag("TVMAZE_ENABLED") if provider_enabled is None else bool(provider_enabled)
        self.query_enabled = True if query_enabled is None else bool(query_enabled)
        self.exact_enabled = False if exact_enabled is None else bool(exact_enabled)
        self.date_only_enabled = False if date_only_enabled is None else bool(date_only_enabled)
        self._provider = provider
        self._provider_load_attempted = provider is not None

    def _load_provider(self) -> ReleaseTimingProvider | None:
        if not self.provider_enabled or not self.query_enabled:
            return None
        if self._provider_load_attempted:
            return self._provider
        self._provider_load_attempted = True
        try:
            module = importlib.import_module("tvmaze_integration")
            factory = getattr(module, "get_default_provider", None)
            self._provider = factory() if callable(factory) else None
        except (ImportError, OSError, RuntimeError):
            self._provider = None
        return self._provider

    def resolve(
        self,
        *,
        tmdb_id: int,
        season_number: int,
        episode_number: int,
        tmdb_air_date: str,
        timezone_name: str,
    ) -> ReleaseTiming | None:
        zone_name = valid_timezone(timezone_name)
        fallback_day = parse_date(tmdb_air_date)
        candidate: dict[str, Any] | None = None
        provider = self._load_provider()
        if provider is not None:
            try:
                candidate = provider.resolve_episode(
                    tmdb_id=int(tmdb_id),
                    season_number=int(season_number),
                    episode_number=int(episode_number),
                    tmdb_air_date=str(tmdb_air_date or ""),
                )
            except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError, psycopg.Error):
                candidate = None

        if candidate:
            precision = str(candidate.get("precision") or "").lower()
            provider_day = parse_date(candidate.get("release_date"))
            provider_exact = parse_aware_datetime(candidate.get("release_at"))
            trusted = candidate.get("trusted") is True
            if precision == PRECISION_EXACT and trusted and provider_exact and self.exact_enabled:
                local_day = provider_exact.astimezone(ZoneInfo(zone_name)).date()
                return ReleaseTiming(
                    release_date=(provider_day or local_day).isoformat(),
                    release_at=provider_exact.isoformat(),
                    eligible_at=provider_exact.isoformat(),
                    precision=PRECISION_EXACT,
                    confidence="verified",
                    provider_used=True,
                    reason=str(candidate.get("reason") or "verified_exact"),
                )
            if precision == PRECISION_DATE_ONLY and trusted and provider_day and self.date_only_enabled:
                eligible = start_of_date_utc(provider_day, zone_name)
                return ReleaseTiming(
                    release_date=provider_day.isoformat(),
                    release_at="",
                    eligible_at=eligible.isoformat(),
                    precision=PRECISION_DATE_ONLY,
                    confidence="verified",
                    provider_used=True,
                    reason=str(candidate.get("reason") or "verified_date_only"),
                )

        if not fallback_day:
            return None
        eligible = start_of_date_utc(fallback_day, zone_name)
        return ReleaseTiming(
            release_date=fallback_day.isoformat(),
            release_at="",
            eligible_at=eligible.isoformat(),
            precision=PRECISION_DATE_ONLY,
            confidence="fallback",
            provider_used=False,
            reason="tmdb_date_fallback",
        )


def provider_capability() -> dict[str, Any]:
    flags = provider_flags()
    available = False
    should_load = any((
        flags["shadow_enabled"],
        flags["upcoming_enabled"],
        flags["notifications_enabled"],
    ))
    if should_load:
        try:
            module = importlib.import_module("tvmaze_integration")
            available = callable(getattr(module, "get_default_provider", None))
        except (ImportError, OSError, RuntimeError):
            available = False
    return {
        "enabled": flags["master_enabled"],
        "available": available,
        "shadowEnabled": flags["shadow_enabled"],
        "upcomingAuthority": available and flags["upcoming_enabled"],
        "notificationsAuthority": available and flags["notifications_enabled"],
        # Preserve the existing frontend capability keys; they describe
        # Upcoming/loggability authority rather than additional feature flags.
        "exactAuthority": available and flags["upcoming_enabled"],
        "dateOnlyAuthority": available and flags["upcoming_enabled"],
    }
