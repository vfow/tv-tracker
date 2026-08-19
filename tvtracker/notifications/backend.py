from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from psycopg.types.json import Jsonb

from tvtracker.release_timing.service import ReleaseTimingResolver, parse_aware_datetime, provider_flags
from tvtracker.notifications.engine import (
    NOTIFICATION_FAMILIES,
    build_stored_notification_snapshot,
    build_tmdb_notification_snapshot,
    collect_metadata_notification_candidates,
    collect_time_notification_candidates,
    notification_zone,
    season_detail_requests_for_today,
)


DEFAULT_NOTIFICATION_SETTINGS = {
    "enabled": True,
    "new_season": True,
    "season_premiere_tomorrow": True,
    "new_episode": True,
    "returns_tomorrow": True,
    "canceled_ended": True,
    "premiere_date_updates": True,
    "timezone": "",
    "timezone_mode": "automatic",
    "movie_released": True,
    "movie_release_updates": True,
}

SETTING_API_TO_DB = {
    "enabled": "enabled",
    "newSeason": "new_season",
    "seasonPremiereTomorrow": "season_premiere_tomorrow",
    "newEpisode": "new_episode",
    "returnsTomorrow": "returns_tomorrow",
    "canceledEnded": "canceled_ended",
    "premiereDateUpdates": "premiere_date_updates",
    "movieReleased": "movie_released",
    "movieReleaseUpdates": "movie_release_updates",
}

SETTINGS_COLUMNS = (
    "enabled",
    "timezone",
    "timezone_mode",
    "new_season",
    "season_premiere_tomorrow",
    "new_episode",
    "returns_tomorrow",
    "canceled_ended",
    "premiere_date_updates",
    "initialized_at",
    "last_checked_at",
    "movie_released",
    "movie_release_updates",
)


def _aware_utc(value: datetime | None = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def _settings_from_row(row: Any) -> dict[str, Any]:
    if not row:
        result = dict(DEFAULT_NOTIFICATION_SETTINGS)
        result.update({"initialized_at": None, "last_checked_at": None})
        return result
    values = list(row)
    result = dict(DEFAULT_NOTIFICATION_SETTINGS)
    for index, column in enumerate(SETTINGS_COLUMNS):
        if index < len(values):
            result[column] = values[index]
    for family in NOTIFICATION_FAMILIES:
        result[family] = bool(result.get(family, True))
    result["enabled"] = bool(result.get("enabled", True))
    result["timezone"] = str(result.get("timezone") or "")
    result["timezone_mode"] = "manual" if str(result.get("timezone_mode") or "automatic") == "manual" else "automatic"
    return result


def serialize_notification_settings(settings: dict[str, Any]) -> dict[str, Any]:
    return {
        "enabled": bool(settings.get("enabled", True)),
        "timezone": str(settings.get("timezone") or ""),
        "timezoneMode": str(settings.get("timezone_mode") or "automatic"),
        "newSeason": bool(settings.get("new_season", True)),
        "seasonPremiereTomorrow": bool(settings.get("season_premiere_tomorrow", True)),
        "newEpisode": bool(settings.get("new_episode", True)),
        "returnsTomorrow": bool(settings.get("returns_tomorrow", True)),
        "canceledEnded": bool(settings.get("canceled_ended", True)),
        "premiereDateUpdates": bool(settings.get("premiere_date_updates", True)),
        "movieReleased": bool(settings.get("movie_released", True)),
        "movieReleaseUpdates": bool(settings.get("movie_release_updates", True)),
    }


def _select_settings(cursor: Any, *, for_update: bool = False) -> dict[str, Any]:
    suffix = " FOR UPDATE" if for_update else ""
    cursor.execute(
        "SELECT " + ", ".join(SETTINGS_COLUMNS) +
        " FROM tv_tracker_notification_settings WHERE singleton_id = 1" + suffix
    )
    return _settings_from_row(cursor.fetchone())


def read_notification_settings(connection_factory: Callable[[], Any]) -> dict[str, Any]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            return _select_settings(cursor)


def update_notification_settings(
    connection_factory: Callable[[], Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Invalid notification settings")

    updates: dict[str, Any] = {}
    for api_key, db_key in SETTING_API_TO_DB.items():
        if api_key not in payload:
            continue
        value = payload[api_key]
        if not isinstance(value, bool):
            raise ValueError(f"{api_key} must be true or false")
        updates[db_key] = value

    timezone_value = None
    if "timezone" in payload:
        timezone_value = str(payload.get("timezone") or "").strip()
        notification_zone(timezone_value)

    timezone_mode = None
    if "timezoneMode" in payload:
        timezone_mode = str(payload.get("timezoneMode") or "").strip().lower()
        if timezone_mode not in {"automatic", "manual"}:
            raise ValueError("timezoneMode must be automatic or manual")
        updates["timezone_mode"] = timezone_mode

    timezone_if_unset = payload.get("timezoneIfUnset") is True

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            current = _select_settings(cursor, for_update=True)
            if timezone_value is not None and (not timezone_if_unset or not current.get("timezone")):
                updates["timezone"] = timezone_value

            if updates:
                assignments = [f"{column} = %s" for column in updates]
                values = list(updates.values())
                cursor.execute(
                    "UPDATE tv_tracker_notification_settings SET " +
                    ", ".join(assignments) +
                    ", updated_at = NOW() WHERE singleton_id = 1",
                    values,
                )
            connection.commit()
            settings = _select_settings(cursor)

    if settings.get("enabled") is False:
        with connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE tv_tracker_push_deliveries "
                    "SET status = 'suppressed', updated_at = NOW() "
                    "WHERE status IN ('pending', 'retry', 'sending')"
                )
            connection.commit()
    return settings


def notification_status(connection_factory: Callable[[], Any]) -> dict[str, Any]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            settings = _select_settings(cursor)
            cursor.execute(
                "SELECT EXISTS(SELECT 1 FROM tv_tracker_notifications WHERE is_read = FALSE)"
            )
            row = cursor.fetchone()
            unread = bool(row and row[0])
            cursor.execute(
                "SELECT notification_id, created_at FROM tv_tracker_notifications "
                "ORDER BY created_at DESC, notification_id DESC LIMIT 1"
            )
            latest = cursor.fetchone()
    return {
        "unread": unread,
        "timezone": str(settings.get("timezone") or ""),
        "timezoneMode": str(settings.get("timezone_mode") or "automatic"),
        "enabled": bool(settings.get("enabled", True)),
        "latestId": int(latest[0]) if latest else 0,
        "latestCreatedAt": latest[1].isoformat() if latest and latest[1] else "",
    }


def list_notifications(connection_factory: Callable[[], Any], limit: int = 200) -> list[dict[str, Any]]:
    safe_limit = min(200, max(1, int(limit or 200)))
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT notification_id, notification_type, show_id, title, message,
                       image_path, event_date, is_read, payload, created_at, updated_at,
                       media_type, event_key
                FROM tv_tracker_notifications
                ORDER BY created_at DESC, notification_id DESC
                LIMIT %s
                """,
                (safe_limit,),
            )
            rows = cursor.fetchall()

    result: list[dict[str, Any]] = []
    for row in rows:
        payload = row[8] if isinstance(row[8], dict) else {}
        media_id = str(row[2] or "")
        media_type = "movie" if str(row[11] or "tv") == "movie" or payload.get("mediaType") == "movie" else "tv"
        route = str(payload.get("route") or "").strip()
        if not route:
            route = f"/app/movie/{media_id}" if media_type == "movie" else (f"/app/show/{media_id}" if media_id else "/app/upcoming")
        result.append({
            "id": int(row[0]),
            "type": str(row[1] or ""),
            "showId": media_id if media_type == "tv" else "",
            "movieId": media_id if media_type == "movie" else "",
            "mediaType": media_type,
            "title": str(row[3] or ""),
            "message": str(row[4] or ""),
            "imagePath": str(row[5] or ""),
            "eventDate": row[6].isoformat() if row[6] else "",
            "read": bool(row[7]),
            "payload": payload,
            "route": route,
            "createdAt": row[9].isoformat() if row[9] else "",
            "updatedAt": row[10].isoformat() if row[10] else "",
            "eventKey": str(row[12] or ""),
        })
    return result


def mark_all_notifications_read(connection_factory: Callable[[], Any]) -> int:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE tv_tracker_notifications SET is_read = TRUE, updated_at = NOW() "
                "WHERE is_read = FALSE"
            )
            changed = int(cursor.rowcount or 0)
        connection.commit()
    return changed


def mark_notification_read(
    connection_factory: Callable[[], Any],
    notification_id: int,
) -> bool:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE tv_tracker_notifications SET is_read = TRUE, updated_at = NOW() "
                "WHERE notification_id = %s",
                (int(notification_id),),
            )
            changed = int(cursor.rowcount or 0) > 0
        connection.commit()
    return changed


def delete_notification(connection_factory: Callable[[], Any], notification_id: int) -> bool:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM tv_tracker_notifications WHERE notification_id = %s",
                (int(notification_id),),
            )
            deleted = int(cursor.rowcount or 0) > 0
        connection.commit()
    return deleted


def _tracked_show_rows(connection_factory: Callable[[], Any]) -> dict[str, dict[str, Any]]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT show_id, data FROM tv_tracker_shows")
            rows = cursor.fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        show = row[1] if isinstance(row[1], dict) else {}
        tmdb_id = str(show.get("tmdb_id") or row[0] or "").strip()
        if tmdb_id.isdigit() and int(tmdb_id) > 0:
            result[tmdb_id] = show
    return result


def _read_baselines(connection_factory: Callable[[], Any]) -> dict[str, dict[str, Any]]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT show_id, snapshot FROM tv_tracker_notification_baseline")
            rows = cursor.fetchall()
    return {
        str(row[0]): row[1]
        for row in rows
        if isinstance(row[1], dict)
    }


def _fetch_current_snapshot(
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    show_id: str,
    tracker_show: dict[str, Any],
    previous: dict[str, Any],
    now: datetime,
    timezone_name: str,
) -> dict[str, Any]:
    details = tmdb_fetcher(f"tv/{show_id}", {"language": "en-US"})
    season_payloads: dict[int, dict[str, Any]] = {}
    for season_number in season_detail_requests_for_today(
        details,
        now,
        timezone_name,
        str(tracker_show.get("status") or ""),
    ):
        try:
            season_payloads[season_number] = tmdb_fetcher(
                f"tv/{show_id}/season/{season_number}",
                {"language": "en-US"},
            )
        except Exception:
            # The show-level details are still useful. Keep the old episode list
            # if this optional season refresh fails.
            pass
    return build_tmdb_notification_snapshot(details, previous, season_payloads)


def _fetch_snapshots(
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    tracked: dict[str, dict[str, Any]],
    baselines: dict[str, dict[str, Any]],
    now: datetime,
    timezone_name: str,
) -> tuple[dict[str, dict[str, Any]], int]:
    snapshots: dict[str, dict[str, Any]] = {}
    failures = 0

    def load(show_id: str) -> tuple[str, dict[str, Any]]:
        fallback = baselines.get(show_id) or build_stored_notification_snapshot(tracked[show_id])
        return show_id, _fetch_current_snapshot(
            tmdb_fetcher,
            show_id,
            tracked[show_id],
            fallback,
            now,
            timezone_name,
        )

    with ThreadPoolExecutor(max_workers=min(6, max(1, len(tracked)))) as executor:
        futures = {executor.submit(load, show_id): show_id for show_id in tracked}
        for future in as_completed(futures):
            show_id = futures[future]
            try:
                loaded_id, snapshot = future.result()
                snapshots[loaded_id] = snapshot
            except Exception:
                failures += 1
                if show_id not in baselines:
                    snapshots[show_id] = build_stored_notification_snapshot(tracked[show_id])

    return snapshots, failures


def _claim_event(cursor: Any, candidate: dict[str, Any]) -> bool:
    cursor.execute(
        """
        INSERT INTO tv_tracker_notification_events
        (event_key, show_id, event_type, observed_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (event_key) DO NOTHING
        RETURNING event_key
        """,
        (
            candidate["event_key"],
            candidate.get("show_id") or "",
            candidate.get("kind") or candidate.get("family") or "notification",
        ),
    )
    return cursor.fetchone() is not None


def _claim_simple_event(cursor: Any, event_key: str, show_id: str, event_type: str) -> bool:
    cursor.execute(
        """
        INSERT INTO tv_tracker_notification_events
        (event_key, show_id, event_type, observed_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (event_key) DO NOTHING
        RETURNING event_key
        """,
        (event_key, show_id, event_type),
    )
    return cursor.fetchone() is not None


def _write_notification(cursor: Any, candidate: dict[str, Any]) -> None:
    event_date = str(candidate.get("event_date") or "").strip() or None
    family = str(candidate.get("family") or "")
    values = (
        str(candidate.get("group_key") or candidate["event_key"]),
        str(candidate["event_key"]),
        str(candidate.get("kind") or family),
        str(candidate.get("show_id") or ""),
        str(candidate.get("title") or ""),
        str(candidate.get("message") or ""),
        str(candidate.get("image_path") or ""),
        event_date,
        Jsonb(candidate.get("payload") or {}),
    )

    if family == "premiere_date_updates":
        cursor.execute(
            """
            INSERT INTO tv_tracker_notifications
            (group_key, event_key, notification_type, show_id, title, message,
             image_path, event_date, payload, is_read, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, NOW(), NOW())
            ON CONFLICT (group_key) DO UPDATE
            SET event_key = EXCLUDED.event_key,
                notification_type = EXCLUDED.notification_type,
                show_id = EXCLUDED.show_id,
                title = EXCLUDED.title,
                message = EXCLUDED.message,
                image_path = EXCLUDED.image_path,
                event_date = EXCLUDED.event_date,
                payload = EXCLUDED.payload,
                is_read = FALSE,
                created_at = NOW(),
                updated_at = NOW()
            """,
            values,
        )
        return

    cursor.execute(
        """
        INSERT INTO tv_tracker_notifications
        (group_key, event_key, notification_type, show_id, title, message,
         image_path, event_date, payload, is_read, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, NOW(), NOW())
        ON CONFLICT (group_key) DO NOTHING
        """,
        values,
    )


def _process_candidate(
    cursor: Any,
    candidate: dict[str, Any],
    settings: dict[str, Any],
) -> bool:
    if not _claim_event(cursor, candidate):
        return False

    master_enabled = bool(settings.get("enabled", True))
    family = str(candidate.get("family") or "")
    family_enabled = bool(settings.get(family, True))
    if not master_enabled or not family_enabled:
        return False

    if (
        candidate.get("kind") == "new_season"
        and candidate.get("combined_message")
        and candidate.get("premiere_event_key")
        and bool(settings.get("season_premiere_tomorrow", True))
    ):
        premiere_key = str(candidate["premiere_event_key"])
        if _claim_simple_event(
            cursor,
            premiere_key,
            str(candidate.get("show_id") or ""),
            "season_premiere_tomorrow",
        ):
            candidate = dict(candidate)
            candidate["message"] = str(candidate["combined_message"])

    _write_notification(cursor, candidate)
    return True


def _prune_notifications(cursor: Any) -> None:
    cursor.execute(
        "DELETE FROM tv_tracker_notifications WHERE created_at < NOW() - INTERVAL '90 days'"
    )
    cursor.execute(
        """
        DELETE FROM tv_tracker_notifications
        WHERE notification_id IN (
            SELECT notification_id
            FROM tv_tracker_notifications
            ORDER BY created_at DESC, notification_id DESC
            OFFSET 200
        )
        """
    )
    cursor.execute(
        "DELETE FROM tv_tracker_notification_events "
        "WHERE observed_at < NOW() - INTERVAL '730 days'"
    )


def run_notification_check(
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    current_time = _aware_utc(now)
    settings = read_notification_settings(connection_factory)
    timezone_name = str(settings.get("timezone") or "").strip()
    if not timezone_name:
        return {"ok": True, "status": "needs_timezone", "created": 0, "checked": 0}
    notification_zone(timezone_name)

    tracked = _tracked_show_rows(connection_factory)
    baselines = _read_baselines(connection_factory)
    snapshots, fetch_failures = _fetch_snapshots(
        tmdb_fetcher,
        tracked,
        baselines,
        current_time,
        timezone_name,
    )

    initialized = settings.get("initialized_at") is not None
    created = 0
    processed = 0
    flags = provider_flags()
    timing_resolver = ReleaseTimingResolver(
        provider_enabled=flags["master_enabled"],
        query_enabled=flags["shadow_enabled"] or flags["notifications_enabled"],
        exact_enabled=flags["notifications_enabled"],
        date_only_enabled=flags["notifications_enabled"],
    )

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            settings = _select_settings(cursor, for_update=True)

            if not initialized:
                for show_id, tracker_show in tracked.items():
                    snapshot = snapshots.get(show_id) or build_stored_notification_snapshot(tracker_show)
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_notification_baseline (show_id, snapshot, updated_at)
                        VALUES (%s, %s, NOW())
                        ON CONFLICT (show_id) DO UPDATE
                        SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
                        """,
                        (show_id, Jsonb(snapshot)),
                    )
                cursor.execute(
                    "UPDATE tv_tracker_notification_settings "
                    "SET initialized_at = NOW(), last_checked_at = NOW(), updated_at = NOW() "
                    "WHERE singleton_id = 1"
                )
                connection.commit()
                return {
                    "ok": True,
                    "status": "baseline_created",
                    "created": 0,
                    "checked": len(tracked),
                    "fetchFailures": fetch_failures,
                }

            active_ids = set(tracked)
            for show_id, tracker_show in tracked.items():
                previous = baselines.get(show_id)
                current = snapshots.get(show_id)
                if previous is None:
                    current = current or build_stored_notification_snapshot(tracker_show)
                    cursor.execute(
                        "INSERT INTO tv_tracker_notification_baseline (show_id, snapshot, updated_at) "
                        "VALUES (%s, %s, NOW()) ON CONFLICT (show_id) DO UPDATE "
                        "SET snapshot = EXCLUDED.snapshot, updated_at = NOW()",
                        (show_id, Jsonb(current)),
                    )
                    continue
                if current is None:
                    continue

                def release_lookup(season_number: int, episode_number: int, air_date: str) -> datetime | None:
                    timing = timing_resolver.resolve(
                        tmdb_id=int(show_id),
                        season_number=season_number,
                        episode_number=episode_number,
                        tmdb_air_date=air_date,
                        timezone_name=timezone_name,
                    )
                    if not timing:
                        return None
                    return parse_aware_datetime(timing.release_at or timing.eligible_at)

                metadata = collect_metadata_notification_candidates(
                    previous,
                    current,
                    str(tracker_show.get("status") or ""),
                    current_time,
                    timezone_name,
                    release_lookup=release_lookup,
                )
                timed = collect_time_notification_candidates(
                    current,
                    tracker_show,
                    current_time,
                    timezone_name,
                    last_checked_at=settings.get("last_checked_at"),
                    release_lookup=release_lookup,
                )
                for candidate in metadata + timed:
                    processed += 1
                    if _process_candidate(cursor, candidate, settings):
                        created += 1

                cursor.execute(
                    """
                    INSERT INTO tv_tracker_notification_baseline (show_id, snapshot, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (show_id) DO UPDATE
                    SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
                    """,
                    (show_id, Jsonb(current)),
                )

            if active_ids:
                cursor.execute(
                    "DELETE FROM tv_tracker_notification_baseline WHERE NOT (show_id = ANY(%s))",
                    (list(active_ids),),
                )
            else:
                cursor.execute("DELETE FROM tv_tracker_notification_baseline")

            _prune_notifications(cursor)
            cursor.execute(
                "UPDATE tv_tracker_notification_settings "
                "SET last_checked_at = NOW(), updated_at = NOW() WHERE singleton_id = 1"
            )
        connection.commit()

    return {
        "ok": True,
        "status": "checked",
        "created": created,
        "processed": processed,
        "checked": len(tracked),
        "fetchFailures": fetch_failures,
    }
