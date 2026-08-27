from __future__ import annotations

import hashlib
import importlib.util
import json
import logging
import os
import re
import threading
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Response, jsonify, request, session
from psycopg.types.json import Jsonb

from tvtracker.notifications.backend import list_notifications, read_notification_settings
from tvtracker.notifications.push_validation import (
    missing_configuration_code,
    validate_vapid_configuration,
    validation_code,
)
from tvtracker.migrations import MIGRATIONS, run_migrations

LOGGER = logging.getLogger(__name__)
MEANINGFUL_MOVIE_RELEASE_TYPES = {2, 3, 4, 6}
DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")
CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{8,160}$")
MAX_PUSH_ATTEMPTS = 5
MAX_PUSHES_PER_BATCH = 3
PUSH_REQUEST_TIMEOUT_SECONDS = 10
PUSH_ACTIVE_WINDOW_SECONDS = 75
PUSH_DELIVERY_RETENTION_DAYS = 30
PUSH_PRESENCE_RETENTION_DAYS = 1
PUSH_DEVICE_COOKIE = "tv_tracker_push_device"
_SCHEMA_PREPARE_LOCK = threading.Lock()
_SCHEMA_PREPARED = False


def _utc_now(value: datetime | None = None) -> datetime:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def ensure_final_schema(connection_factory: Callable[[], Any]) -> None:
    global _SCHEMA_PREPARED
    if _SCHEMA_PREPARED:
        return
    with _SCHEMA_PREPARE_LOCK:
        if _SCHEMA_PREPARED:
            return
        run_migrations(connection_factory, MIGRATIONS)
        _SCHEMA_PREPARED = True


def schema_is_prepared() -> bool:
    return _SCHEMA_PREPARED


def _read_tracker_movies_and_region(
    connection_factory: Callable[[], Any],
) -> tuple[dict[str, dict[str, Any]], str]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT state_key, data FROM tv_tracker_state "
                "WHERE state_key IN ('movies', 'profile')"
            )
            rows = cursor.fetchall()
    state = {str(row[0]): row[1] for row in rows}
    raw_movies = state.get("movies") if isinstance(state.get("movies"), dict) else {}
    profile = state.get("profile") if isinstance(state.get("profile"), dict) else {}
    region = str(profile.get("streaming_region") or "").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", region):
        region = ""

    movies: dict[str, dict[str, Any]] = {}
    for raw_id, raw in raw_movies.items():
        if not isinstance(raw, dict) or raw.get("plan") is not True or raw.get("watched") is True:
            continue
        movie_id = str(raw.get("tmdb_id") or raw.get("id") or raw_id or "").strip()
        if not movie_id.isdigit() or int(movie_id) <= 0:
            continue
        movies[movie_id] = raw
    return movies, region


def _parse_release_date(value: Any) -> str:
    raw = str(value or "").strip()
    if len(raw) < 10:
        return ""
    candidate = raw[:10]
    try:
        date.fromisoformat(candidate)
    except ValueError:
        return ""
    return candidate


def _meaningful_release_date(payload: dict[str, Any], region: str) -> str:
    release_dates = payload.get("release_dates")
    results = release_dates.get("results") if isinstance(release_dates, dict) else []
    candidates: list[str] = []
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict) or str(item.get("iso_3166_1") or "").upper() != region:
            continue
        releases = item.get("release_dates") if isinstance(item.get("release_dates"), list) else []
        for release in releases:
            if not isinstance(release, dict):
                continue
            try:
                release_type = int(release.get("type") or 0)
            except (TypeError, ValueError):
                continue
            if release_type not in MEANINGFUL_MOVIE_RELEASE_TYPES:
                continue
            clean_date = _parse_release_date(release.get("release_date"))
            if clean_date:
                candidates.append(clean_date)
    return min(candidates) if candidates else ""


def _movie_snapshot(payload: dict[str, Any], tracker_movie: dict[str, Any], region: str) -> dict[str, Any]:
    title = str(payload.get("title") or tracker_movie.get("title") or "Movie").strip() or "Movie"
    poster = str(payload.get("poster_path") or tracker_movie.get("poster_path") or "").strip()
    return {
        "title": title,
        "poster_path": poster,
        "release_date": _meaningful_release_date(payload, region),
        "region": region,
    }


def _read_movie_baselines(connection_factory: Callable[[], Any]) -> dict[str, dict[str, Any]]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT movie_id, region, snapshot FROM tv_tracker_movie_notification_baseline")
            rows = cursor.fetchall()
    result: dict[str, dict[str, Any]] = {}
    for movie_id, region, snapshot in rows:
        data = snapshot if isinstance(snapshot, dict) else {}
        result[str(movie_id)] = {"region": str(region or ""), "snapshot": data}
    return result


def _claim_event(cursor: Any, event_key: str, media_id: str, event_type: str) -> bool:
    cursor.execute(
        """
        INSERT INTO tv_tracker_notification_events (event_key, show_id, event_type, observed_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (event_key) DO NOTHING
        RETURNING event_key
        """,
        (event_key, media_id, event_type),
    )
    return cursor.fetchone() is not None


def _movie_release_event_key(movie_id: str, region: str) -> str:
    return f"movie:{movie_id}:{region}:released"


def _movie_baseline_action(current_date: str, today: str) -> str:
    if current_date and current_date <= today:
        return "silent_release_claim"
    return "baseline_only"


def _write_movie_notification(
    cursor: Any,
    *,
    movie_id: str,
    event_key: str,
    group_key: str,
    notification_type: str,
    title: str,
    message: str,
    image_path: str,
    event_date: str | None,
    payload: dict[str, Any],
    replace_group: bool = False,
) -> None:
    values = (
        group_key,
        event_key,
        notification_type,
        movie_id,
        title,
        message,
        image_path,
        event_date or None,
        Jsonb(payload),
    )
    if replace_group:
        cursor.execute(
            """
            INSERT INTO tv_tracker_notifications
            (group_key, event_key, notification_type, show_id, title, message,
             image_path, event_date, payload, media_type, is_read, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'movie', FALSE, NOW(), NOW())
            ON CONFLICT (group_key) DO UPDATE
            SET event_key = EXCLUDED.event_key,
                notification_type = EXCLUDED.notification_type,
                show_id = EXCLUDED.show_id,
                title = EXCLUDED.title,
                message = EXCLUDED.message,
                image_path = EXCLUDED.image_path,
                event_date = EXCLUDED.event_date,
                payload = EXCLUDED.payload,
                media_type = 'movie',
                is_read = FALSE,
                created_at = NOW(),
                updated_at = NOW()
            """,
            values,
        )
    else:
        cursor.execute(
            """
            INSERT INTO tv_tracker_notifications
            (group_key, event_key, notification_type, show_id, title, message,
             image_path, event_date, payload, media_type, is_read, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'movie', FALSE, NOW(), NOW())
            ON CONFLICT (group_key) DO NOTHING
            """,
            values,
        )


def _movie_update_message(title: str, previous_date: str, current_date: str) -> tuple[str, str]:
    if not previous_date and current_date:
        return "movie_release_announced", f"{title} release date announced for {current_date}."
    if previous_date and not current_date:
        return "movie_release_removed", f"{title} no longer has a confirmed release date in your region."
    if current_date < previous_date:
        return "movie_release_earlier", f"{title} moved earlier from {previous_date} to {current_date}."
    return "movie_release_delayed", f"{title} was delayed from {previous_date} to {current_date}."


def run_movie_notification_check(
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    ensure_final_schema(connection_factory)
    current = _utc_now(now)
    movies, region = _read_tracker_movies_and_region(connection_factory)
    if not region:
        with connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM tv_tracker_movie_notification_baseline")
            connection.commit()
        return {"ok": True, "status": "needs_region", "checked": 0, "created": 0, "fetchFailures": 0}

    settings = read_notification_settings(connection_factory)
    baselines = _read_movie_baselines(connection_factory)
    snapshots: dict[str, dict[str, Any]] = {}
    fetch_failures = 0

    for movie_id, tracker_movie in movies.items():
        try:
            details = tmdb_fetcher(
                f"movie/{movie_id}",
                {"language": "en-US", "append_to_response": "release_dates"},
            )
            snapshots[movie_id] = _movie_snapshot(details, tracker_movie, region)
        except Exception:
            fetch_failures += 1

    created = 0
    timezone_name = str(settings.get("timezone") or "").strip()
    try:
        local_now = current.astimezone(ZoneInfo(timezone_name)) if timezone_name else current
    except ZoneInfoNotFoundError:
        local_now = current
    today = local_now.date().isoformat()

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            active_ids = set(movies)
            for movie_id, tracker_movie in movies.items():
                snapshot = snapshots.get(movie_id)
                if snapshot is None:
                    continue
                previous_record = baselines.get(movie_id)
                current_date = _parse_release_date(snapshot.get("release_date"))
                release_key = _movie_release_event_key(movie_id, region)

                if previous_record is None or previous_record.get("region") != region:
                    if _movie_baseline_action(current_date, today) == "silent_release_claim":
                        _claim_event(cursor, release_key, movie_id, "movie_released")
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_movie_notification_baseline (movie_id, region, snapshot, updated_at)
                        VALUES (%s, %s, %s, NOW())
                        ON CONFLICT (movie_id) DO UPDATE
                        SET region = EXCLUDED.region, snapshot = EXCLUDED.snapshot, updated_at = NOW()
                        """,
                        (movie_id, region, Jsonb(snapshot)),
                    )
                    continue

                previous = previous_record.get("snapshot") if isinstance(previous_record.get("snapshot"), dict) else {}
                previous_date = _parse_release_date(previous.get("release_date"))
                title = str(snapshot.get("title") or tracker_movie.get("title") or "Movie")
                poster = str(snapshot.get("poster_path") or "")
                release_due = bool(current_date and current_date <= today)

                if release_due:
                    claimed = _claim_event(cursor, release_key, movie_id, "movie_released")
                    if claimed and bool(settings.get("enabled", True)) and settings["movie_released"]:
                        _write_movie_notification(
                            cursor,
                            movie_id=movie_id,
                            event_key=release_key,
                            group_key=release_key,
                            notification_type="movie_released",
                            title=title,
                            message=f"{title} is out today." if current_date == today else f"{title} is now available in your region.",
                            image_path=poster,
                            event_date=current_date,
                            payload={
                                "mediaType": "movie",
                                "movieId": movie_id,
                                "region": region,
                                "route": f"/app/movie/{movie_id}",
                            },
                        )
                        created += 1
                elif previous_date != current_date:
                    kind, message = _movie_update_message(title, previous_date, current_date)
                    event_key = f"movie:{movie_id}:{region}:{kind}:{previous_date or 'none'}:{current_date or 'none'}"
                    claimed = _claim_event(cursor, event_key, movie_id, kind)
                    if claimed and bool(settings.get("enabled", True)) and settings["movie_release_updates"]:
                        _write_movie_notification(
                            cursor,
                            movie_id=movie_id,
                            event_key=event_key,
                            group_key=f"movie:{movie_id}:{region}:release-update",
                            notification_type=kind,
                            title=title,
                            message=message,
                            image_path=poster,
                            event_date=current_date or previous_date or None,
                            payload={
                                "mediaType": "movie",
                                "movieId": movie_id,
                                "region": region,
                                "previousDate": previous_date,
                                "currentDate": current_date,
                                "route": f"/app/movie/{movie_id}",
                            },
                            replace_group=True,
                        )
                        created += 1

                cursor.execute(
                    """
                    INSERT INTO tv_tracker_movie_notification_baseline (movie_id, region, snapshot, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (movie_id) DO UPDATE
                    SET region = EXCLUDED.region, snapshot = EXCLUDED.snapshot, updated_at = NOW()
                    """,
                    (movie_id, region, Jsonb(snapshot)),
                )

            if active_ids:
                cursor.execute(
                    "DELETE FROM tv_tracker_movie_notification_baseline WHERE NOT (movie_id = ANY(%s))",
                    (list(active_ids),),
                )
            else:
                cursor.execute("DELETE FROM tv_tracker_movie_notification_baseline")
        connection.commit()

    return {
        "ok": True,
        "status": "checked",
        "checked": len(movies),
        "created": created,
        "fetchFailures": fetch_failures,
        "region": region,
    }


def _notification_versions(connection_factory: Callable[[], Any]) -> dict[int, str]:
    ensure_final_schema(connection_factory)
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT notification_id, event_key FROM tv_tracker_notifications")
            rows = cursor.fetchall()
    return {int(row[0]): str(row[1] or "") for row in rows}


def _changed_notifications(
    connection_factory: Callable[[], Any],
    before: dict[int, str],
) -> list[dict[str, Any]]:
    items = list_notifications(connection_factory, 200)
    changed = [
        item for item in items
        if int(item["id"]) not in before or before[int(item["id"])] != str(item.get("eventKey") or "")
    ]
    changed.sort(key=lambda item: (str(item.get("createdAt") or ""), int(item.get("id") or 0)))
    return changed


def _pywebpush_available() -> bool:
    try:
        return importlib.util.find_spec("pywebpush") is not None
    except (ImportError, ValueError):
        return False


def push_config() -> dict[str, Any]:
    public_key = str(os.environ.get("VAPID_PUBLIC_KEY") or "").strip()
    private_key = str(os.environ.get("VAPID_PRIVATE_KEY") or "").strip()
    subject = str(os.environ.get("VAPID_SUBJECT") or "").strip()
    dependency_available = _pywebpush_available()
    keys_configured = bool(public_key and private_key and subject)
    config = {
        "configured": bool(keys_configured and dependency_available),
        "keysConfigured": keys_configured,
        "dependencyAvailable": dependency_available,
        "publicKey": public_key,
        "privateKey": private_key,
        "subject": subject,
        # Diagnostics remain available to server logging/admin inspection only.
        # They are deliberately stripped from the browser Push configuration API.
        "validationError": "",
        "validationCode": "",
    }

    if not config["keysConfigured"]:
        config["configured"] = False
        config["validationCode"] = missing_configuration_code(config)
        return config

    valid, error = validate_vapid_configuration(
        config["publicKey"],
        config["privateKey"],
        config["subject"],
    )
    config["validationError"] = error
    config["validationCode"] = validation_code(error)
    config["configured"] = bool(valid and config["dependencyAvailable"])

    if valid and not config["dependencyAvailable"]:
        config["validationCode"] = "dependency_unavailable"

    if not valid:
        # Never expose or attempt to use malformed key material downstream.
        config["publicKey"] = ""
        config["privateKey"] = ""

    return config


def _current_session_version_cursor(cursor: Any) -> int:
    cursor.execute("SELECT session_version FROM tv_tracker_admin WHERE singleton_id = 1")
    row = cursor.fetchone()
    return int(row[0]) if row else 0


def subscribe_device(
    connection_factory: Callable[[], Any],
    device_id: str,
    subscription: dict[str, Any],
    user_agent: str = "",
) -> None:
    ensure_final_schema(connection_factory)
    device = str(device_id or "").strip()
    if not DEVICE_ID_RE.fullmatch(device):
        raise ValueError("Invalid device identifier")
    endpoint = str(subscription.get("endpoint") or "").strip()
    keys = subscription.get("keys") if isinstance(subscription.get("keys"), dict) else {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not endpoint.startswith("https://") or len(endpoint) > 4096:
        raise ValueError("Invalid push endpoint")
    if not p256dh or not auth or len(p256dh) > 1024 or len(auth) > 1024:
        raise ValueError("Invalid push subscription keys")

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            session_version = _current_session_version_cursor(cursor)
            if session_version <= 0:
                raise RuntimeError("Admin session version is unavailable")
            cursor.execute(
                "DELETE FROM tv_tracker_push_subscriptions WHERE device_id = %s AND endpoint <> %s",
                (device, endpoint),
            )
            cursor.execute(
                """
                INSERT INTO tv_tracker_push_subscriptions
                (device_id, endpoint, p256dh, auth, user_agent, session_version, updated_at, failure_count)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), 0)
                ON CONFLICT (endpoint) DO UPDATE
                SET device_id = EXCLUDED.device_id,
                    p256dh = EXCLUDED.p256dh,
                    auth = EXCLUDED.auth,
                    user_agent = EXCLUDED.user_agent,
                    session_version = EXCLUDED.session_version,
                    updated_at = NOW(),
                    failure_count = 0
                """,
                (device, endpoint, p256dh, auth, str(user_agent or "")[:500], session_version),
            )
        connection.commit()


def unsubscribe_device(connection_factory: Callable[[], Any], device_id: str) -> int:
    ensure_final_schema(connection_factory)
    device = str(device_id or "").strip()
    if not DEVICE_ID_RE.fullmatch(device):
        return 0
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM tv_tracker_push_subscriptions WHERE device_id = %s", (device,))
            deleted = int(cursor.rowcount or 0)
            cursor.execute("DELETE FROM tv_tracker_push_presence WHERE device_id = %s", (device,))
        connection.commit()
    return deleted


def unsubscribe_all_devices(connection_factory: Callable[[], Any]) -> int:
    ensure_final_schema(connection_factory)
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM tv_tracker_push_subscriptions")
            deleted = int(cursor.rowcount or 0)
            cursor.execute("DELETE FROM tv_tracker_push_presence")
        connection.commit()
    return deleted


def device_subscription_status(connection_factory: Callable[[], Any], device_id: str) -> dict[str, Any]:
    ensure_final_schema(connection_factory)
    device = str(device_id or "").strip()
    if not DEVICE_ID_RE.fullmatch(device):
        return {"subscribed": False}
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT s.subscription_id, s.updated_at
                FROM tv_tracker_push_subscriptions s
                JOIN tv_tracker_admin a ON a.singleton_id = 1
                WHERE s.device_id = %s AND s.session_version = a.session_version
                """,
                (device,),
            )
            row = cursor.fetchone()
    return {
        "subscribed": bool(row),
        "updatedAt": row[1].isoformat() if row and row[1] else "",
    }


def update_device_presence(
    connection_factory: Callable[[], Any],
    device_id: str,
    client_id: str,
    visible: bool,
) -> bool:
    ensure_final_schema(connection_factory)
    device = str(device_id or "").strip()
    client = str(client_id or "").strip()
    if not DEVICE_ID_RE.fullmatch(device) or not CLIENT_ID_RE.fullmatch(client):
        raise ValueError("Invalid push presence identifier")
    if not isinstance(visible, bool):
        raise ValueError("visible must be true or false")

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM tv_tracker_push_subscriptions s
                JOIN tv_tracker_admin a ON a.singleton_id = 1
                WHERE s.device_id = %s AND s.session_version = a.session_version
                """,
                (device,),
            )
            if cursor.fetchone() is None:
                cursor.execute("DELETE FROM tv_tracker_push_presence WHERE device_id = %s", (device,))
                connection.commit()
                return False
            cursor.execute(
                """
                INSERT INTO tv_tracker_push_presence (device_id, client_id, visible, last_seen_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (device_id, client_id) DO UPDATE
                SET visible = EXCLUDED.visible, last_seen_at = NOW()
                """,
                (device, client, visible),
            )
        connection.commit()
    return True


def _notification_push_payload(item: dict[str, Any]) -> dict[str, Any]:
    image = str(item.get("imagePath") or "").strip()
    image_url = ""
    if image:
        image_url = image if image.startswith("http") else "https://image.tmdb.org/t/p/w500" + (image if image.startswith("/") else "/" + image)
    return {
        "kind": "notification",
        "notificationId": int(item["id"]),
        "title": str(item.get("title") or "TV Tracker"),
        "body": str(item.get("message") or "New notification"),
        "route": str(item.get("route") or "/app/notifications"),
        "imageUrl": image_url,
        "tag": f"tv-tracker-{int(item['id'])}-{str(item.get('eventKey') or '')[:48]}",
    }


def enqueue_push_deliveries(
    connection_factory: Callable[[], Any],
    notifications: list[dict[str, Any]],
) -> int:
    ensure_final_schema(connection_factory)
    if not notifications:
        return 0
    if not bool(read_notification_settings(connection_factory).get("enabled", True)):
        return 0

    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT s.subscription_id,
                       EXISTS (
                           SELECT 1 FROM tv_tracker_push_presence p
                           WHERE p.device_id = s.device_id
                             AND p.visible = TRUE
                             AND p.last_seen_at > NOW() - INTERVAL '{PUSH_ACTIVE_WINDOW_SECONDS} seconds'
                       ) AS active
                FROM tv_tracker_push_subscriptions s
                JOIN tv_tracker_admin a ON a.singleton_id = 1
                WHERE s.session_version = a.session_version
                ORDER BY s.subscription_id
                """
            )
            subscriptions = [(int(row[0]), bool(row[1])) for row in cursor.fetchall()]
            queued = 0
            for subscription_id, active in subscriptions:
                if active:
                    continue
                individual = notifications[:MAX_PUSHES_PER_BATCH]
                extras = notifications[MAX_PUSHES_PER_BATCH:]
                for item in individual:
                    event_key = str(item.get("eventKey") or "")
                    key_material = f"individual:{subscription_id}:{int(item['id'])}:{event_key}"
                    delivery_key = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_push_deliveries
                        (delivery_key, subscription_id, notification_id, payload, status, attempts, next_attempt_at)
                        VALUES (%s, %s, %s, %s, 'pending', 0, NOW())
                        ON CONFLICT (delivery_key) DO NOTHING
                        """,
                        (delivery_key, subscription_id, int(item["id"]), Jsonb(_notification_push_payload(item))),
                    )
                    queued += int(cursor.rowcount or 0)
                if extras:
                    identifiers = ",".join(
                        f"{int(item['id'])}:{str(item.get('eventKey') or '')}" for item in extras
                    )
                    key_material = f"summary:{subscription_id}:{identifiers}"
                    delivery_key = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
                    payload = {
                        "kind": "summary",
                        "title": "TV Tracker",
                        "body": f"{len(extras)} more notification{'s' if len(extras) != 1 else ''}",
                        "route": "/app/notifications",
                        "tag": "tv-tracker-summary-" + hashlib.sha256(identifiers.encode("utf-8")).hexdigest()[:20],
                    }
                    cursor.execute(
                        """
                        INSERT INTO tv_tracker_push_deliveries
                        (delivery_key, subscription_id, notification_id, payload, status, attempts, next_attempt_at)
                        VALUES (%s, %s, NULL, %s, 'pending', 0, NOW())
                        ON CONFLICT (delivery_key) DO NOTHING
                        """,
                        (delivery_key, subscription_id, Jsonb(payload)),
                    )
                    queued += int(cursor.rowcount or 0)
        connection.commit()
    return queued


def _retry_delay(attempt: int) -> timedelta:
    minutes = min(60, 2 ** max(0, attempt - 1))
    return timedelta(minutes=minutes)


def _claim_push_batch(connection_factory: Callable[[], Any], current: datetime) -> list[tuple[Any, ...]]:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE tv_tracker_push_deliveries
                SET status = 'retry', updated_at = NOW()
                WHERE status = 'sending'
                  AND updated_at < NOW() - INTERVAL '10 minutes'
                  AND attempts < %s
                """,
                (MAX_PUSH_ATTEMPTS,),
            )
            cursor.execute(
                """
                WITH picked AS (
                    SELECT d.delivery_key, s.endpoint, s.p256dh, s.auth
                    FROM tv_tracker_push_deliveries d
                    JOIN tv_tracker_push_subscriptions s ON s.subscription_id = d.subscription_id
                    JOIN tv_tracker_admin a ON a.singleton_id = 1
                    WHERE d.status IN ('pending', 'retry')
                      AND d.next_attempt_at <= %s
                      AND d.attempts < %s
                      AND s.session_version = a.session_version
                    ORDER BY d.created_at, d.delivery_key
                    LIMIT 100
                    FOR UPDATE OF d SKIP LOCKED
                )
                UPDATE tv_tracker_push_deliveries d
                SET status = 'sending', attempts = d.attempts + 1, updated_at = NOW()
                FROM picked
                WHERE d.delivery_key = picked.delivery_key
                RETURNING d.delivery_key, d.subscription_id, d.notification_id, d.payload,
                          d.attempts, picked.endpoint, picked.p256dh, picked.auth
                """,
                (current, MAX_PUSH_ATTEMPTS),
            )
            rows = cursor.fetchall()
        connection.commit()
    return rows


def prune_push_state(connection_factory: Callable[[], Any]) -> None:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                DELETE FROM tv_tracker_push_deliveries
                WHERE status IN ('delivered', 'suppressed', 'failed')
                  AND updated_at < NOW() - INTERVAL '{PUSH_DELIVERY_RETENTION_DAYS} days'
                """
            )
            cursor.execute(
                f"""
                DELETE FROM tv_tracker_push_presence
                WHERE last_seen_at < NOW() - INTERVAL '{PUSH_PRESENCE_RETENTION_DAYS} day'
                """
            )
        connection.commit()


def deliver_push_outbox(connection_factory: Callable[[], Any], now: datetime | None = None) -> dict[str, Any]:
    ensure_final_schema(connection_factory)
    config = push_config()
    if not config["configured"]:
        return {"configured": False, "delivered": 0, "failed": 0, "dead": 0}
    if not bool(read_notification_settings(connection_factory).get("enabled", True)):
        return {"configured": True, "delivered": 0, "failed": 0, "dead": 0, "suppressed": True}

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return {"configured": False, "delivered": 0, "failed": 0, "dead": 0, "error": "pywebpush unavailable"}

    current = _utc_now(now)
    rows = _claim_push_batch(connection_factory, current)
    delivered = failed = dead = 0

    for row in rows:
        delivery_key = str(row[0])
        subscription_id = int(row[1])
        payload = row[3] if isinstance(row[3], dict) else {}
        attempts = int(row[4] or 0)
        subscription_info = {
            "endpoint": str(row[5] or ""),
            "keys": {"p256dh": str(row[6] or ""), "auth": str(row[7] or "")},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload, separators=(",", ":")),
                vapid_private_key=config["privateKey"],
                vapid_claims={"sub": config["subject"]},
                ttl=86400,
                timeout=PUSH_REQUEST_TIMEOUT_SECONDS,
            )
        except WebPushException as error:
            status_code = getattr(getattr(error, "response", None), "status_code", None)
            message = str(error)[:1000]
            if status_code in {404, 410}:
                with connection_factory() as connection:
                    with connection.cursor() as cursor:
                        cursor.execute("DELETE FROM tv_tracker_push_subscriptions WHERE subscription_id = %s", (subscription_id,))
                    connection.commit()
                dead += 1
                continue
            retry = attempts < MAX_PUSH_ATTEMPTS
            next_attempt = current + _retry_delay(attempts)
            with connection_factory() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE tv_tracker_push_deliveries
                        SET status = %s, next_attempt_at = %s,
                            last_error = %s, updated_at = NOW()
                        WHERE delivery_key = %s
                        """,
                        ("retry" if retry else "failed", next_attempt, message, delivery_key),
                    )
                    cursor.execute(
                        "UPDATE tv_tracker_push_subscriptions SET failure_count = failure_count + 1, updated_at = NOW() "
                        "WHERE subscription_id = %s",
                        (subscription_id,),
                    )
                connection.commit()
            failed += 1
        except Exception as error:
            retry = attempts < MAX_PUSH_ATTEMPTS
            next_attempt = current + _retry_delay(attempts)
            with connection_factory() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE tv_tracker_push_deliveries
                        SET status = %s, next_attempt_at = %s,
                            last_error = %s, updated_at = NOW()
                        WHERE delivery_key = %s
                        """,
                        ("retry" if retry else "failed", next_attempt, str(error)[:1000], delivery_key),
                    )
                connection.commit()
            failed += 1
        else:
            with connection_factory() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE tv_tracker_push_deliveries
                        SET status = 'delivered', last_error = '', updated_at = NOW()
                        WHERE delivery_key = %s
                        """,
                        (delivery_key,),
                    )
                    cursor.execute(
                        """
                        UPDATE tv_tracker_push_subscriptions
                        SET last_success_at = NOW(), failure_count = 0, updated_at = NOW()
                        WHERE subscription_id = %s
                        """,
                        (subscription_id,),
                    )
                connection.commit()
            delivered += 1

    prune_push_state(connection_factory)
    return {"configured": True, "delivered": delivered, "failed": failed, "dead": dead}


def _prepare_push_outbox_state(connection_factory: Callable[[], Any]) -> None:
    """Resolve stale security/session and active-device state before actual delivery."""
    ensure_final_schema(connection_factory)
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            # Credential changes invalidate old subscriptions even when best-effort cleanup failed.
            cursor.execute(
                """
                DELETE FROM tv_tracker_push_subscriptions s
                USING tv_tracker_admin a
                WHERE a.singleton_id = 1
                  AND s.session_version <> a.session_version
                """
            )
            cursor.execute(
                """
                DELETE FROM tv_tracker_push_presence p
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM tv_tracker_push_subscriptions s
                    JOIN tv_tracker_admin a ON a.singleton_id = 1
                    WHERE s.device_id = p.device_id
                      AND s.session_version = a.session_version
                )
                """
            )

            # A queued or retrying push can become obsolete when that same device opens TV Tracker.
            cursor.execute(
                f"""
                UPDATE tv_tracker_push_deliveries d
                SET status = 'suppressed',
                    last_error = 'device active before delivery',
                    updated_at = NOW()
                FROM tv_tracker_push_subscriptions s
                JOIN tv_tracker_admin a ON a.singleton_id = 1
                WHERE d.subscription_id = s.subscription_id
                  AND s.session_version = a.session_version
                  AND d.status IN ('pending', 'retry')
                  AND EXISTS (
                      SELECT 1
                      FROM tv_tracker_push_presence p
                      WHERE p.device_id = s.device_id
                        AND p.visible = TRUE
                        AND p.last_seen_at > NOW() - INTERVAL '{PUSH_ACTIVE_WINDOW_SECONDS} seconds'
                  )
                """
            )

            # A worker can die after claiming a row. If the device is now active, suppress the
            # stale send rather than resurrecting an OS notification on recovery.
            cursor.execute(
                f"""
                UPDATE tv_tracker_push_deliveries d
                SET status = 'suppressed',
                    last_error = 'device active before stale delivery recovery',
                    updated_at = NOW()
                FROM tv_tracker_push_subscriptions s
                JOIN tv_tracker_admin a ON a.singleton_id = 1
                WHERE d.subscription_id = s.subscription_id
                  AND s.session_version = a.session_version
                  AND d.status = 'sending'
                  AND d.updated_at < NOW() - INTERVAL '10 minutes'
                  AND EXISTS (
                      SELECT 1
                      FROM tv_tracker_push_presence p
                      WHERE p.device_id = s.device_id
                        AND p.visible = TRUE
                        AND p.last_seen_at > NOW() - INTERVAL '{PUSH_ACTIVE_WINDOW_SECONDS} seconds'
                  )
                """
            )

            # Exhausted stale sends must terminate instead of remaining `sending` forever.
            cursor.execute(
                """
                UPDATE tv_tracker_push_deliveries
                SET status = 'failed',
                    last_error = CASE
                        WHEN last_error = '' THEN 'delivery worker stopped after final attempt'
                        ELSE last_error
                    END,
                    updated_at = NOW()
                WHERE status = 'sending'
                  AND updated_at < NOW() - INTERVAL '10 minutes'
                  AND attempts >= %s
                """,
                (MAX_PUSH_ATTEMPTS,),
            )
        connection.commit()


def run_final_notification_worker(
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    core_runner: Callable[[datetime | None], dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    ensure_final_schema(connection_factory)
    before = _notification_versions(connection_factory)
    core_result = core_runner(now)
    movie_result = run_movie_notification_check(connection_factory, tmdb_fetcher, now)
    changed = _changed_notifications(connection_factory, before)
    queued = enqueue_push_deliveries(connection_factory, changed)
    _prepare_push_outbox_state(connection_factory)
    push_result = deliver_push_outbox(connection_factory, now)
    return {
        "ok": True,
        "core": core_result,
        "movies": movie_result,
        "push": {"queued": queued, **push_result},
        "changedNotifications": len(changed),
    }


def _manifest_payload() -> dict[str, Any]:
    return {
        "name": "TV Tracker",
        "short_name": "TV Tracker",
        "id": "/app/",
        "start_url": "/app/list/watching",
        "scope": "/",
        "display": "standalone",
        "background_color": "#000000",
        "theme_color": "#000000",
        "icons": [
            {"src": "/static/assets/icons/app-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/static/assets/icons/app-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
            {"src": "/static/assets/icons/app-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable"},
        ],
    }


def _service_worker_source() -> str:
    return r'''"use strict";
const DB_NAME = "tv-tracker-push-clicks";
const STORE_NAME = "pending";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function openPendingDb(){
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = ()=>{
      const db = request.result;
      if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME,{keyPath:"id"});
    };
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  });
}

async function storePendingClick(notificationId,route){
  if(!notificationId) return;
  const db = await openPendingDb();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).put({id:Number(notificationId),route:String(route || "/app/notifications"),at:Date.now()});
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
  db.close();
}

async function readPendingClicks(){
  const db = await openPendingDb();
  const items = await new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE_NAME,"readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    let valid = [];
    request.onsuccess = ()=>{
      const now = Date.now();
      valid = (request.result || []).filter(item=>{
        const id = Number(item && item.id || 0);
        const fresh = id > 0 && now - Number(item && item.at || 0) <= MAX_AGE_MS;
        if(!fresh && id > 0) store.delete(id);
        return fresh;
      });
    };
    request.onerror = ()=>reject(request.error);
    tx.oncomplete = ()=>resolve(valid);
    tx.onerror = ()=>reject(tx.error);
  });
  db.close();
  return items;
}

async function acknowledgePendingClicks(ids){
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map(value=>Number(value || 0))
    .filter(value=>Number.isInteger(value) && value > 0)));
  if(!clean.length) return;
  const db = await openPendingDb();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE_NAME,"readwrite");
    const store = tx.objectStore(STORE_NAME);
    clean.forEach(id=>store.delete(id));
    tx.oncomplete = resolve;
    tx.onerror = ()=>reject(tx.error);
  });
  db.close();
}

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }
    const options = {
      body: String(payload.body || "New TV Tracker notification"),
      icon: "/static/assets/icons/app-icon-192.png",
      badge: "/static/assets/icons/app-icon-192.png",
      tag: String(payload.tag || "tv-tracker-notification"),
      renotify: true,
      data: {
        route: String(payload.route || "/app/notifications"),
        notificationId: Number(payload.notificationId || 0)
      }
    };
    if (payload.imageUrl) options.image = String(payload.imageUrl);
    await self.registration.showNotification(String(payload.title || "TV Tracker"), options);
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    const route = String(data.route || "/app/notifications");
    const notificationId = Number(data.notificationId || 0);
    if(notificationId) await storePendingClick(notificationId,route);
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if("navigate" in client){
        await client.navigate(route);
        return client.focus();
      }
    }
    return self.clients.openWindow(route);
  })());
});

self.addEventListener("message", event => {
  if(!event.data) return;
  if(event.data.type === "tvtracker-consume-push-clicks"){
    event.waitUntil((async ()=>{
      const items = await readPendingClicks();
      if(event.source && "postMessage" in event.source){
        event.source.postMessage({type:"tvtracker-push-clicks",items});
      }
    })());
    return;
  }
  if(event.data.type === "tvtracker-ack-push-clicks"){
    event.waitUntil(acknowledgePendingClicks(event.data.ids));
  }
});
'''


def _best_effort(action: Callable[[], Any], label: str) -> None:
    try:
        action()
    except Exception:
        LOGGER.exception("TV Tracker %s failed", label)


def install_final_notifications(
    app: Any,
    *,
    login_required: Callable[[Callable[..., Any]], Callable[..., Any]],
    check_csrf: Callable[[], None],
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
) -> None:
    if app.extensions.get("final_notifications"):
        return
    ensure_final_schema(connection_factory)

    @app.get("/manifest.webmanifest")
    def final_manifest():
        response = jsonify(_manifest_payload())
        response.mimetype = "application/manifest+json"
        response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    @app.get("/service-worker.js")
    def final_service_worker():
        response = Response(_service_worker_source(), mimetype="application/javascript")
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Service-Worker-Allowed"] = "/"
        return response

    @app.get("/api/push/config")
    @login_required
    def push_config_api():
        config = push_config()
        return jsonify({
            "ok": True,
            "configured": config["configured"],
            "publicKey": config["publicKey"] if config["configured"] else "",
            "dependencyAvailable": config["dependencyAvailable"],
        })

    @app.get("/api/push/device")
    @login_required
    def push_device_api():
        device_id = str(request.args.get("deviceId") or "")
        return jsonify({"ok": True, **device_subscription_status(connection_factory, device_id)})

    @app.post("/api/push/subscribe")
    @login_required
    def push_subscribe_api():
        check_csrf()
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Invalid push request"}), 400
        device_id = str(payload.get("deviceId") or "")
        subscription = payload.get("subscription") if isinstance(payload.get("subscription"), dict) else {}
        try:
            subscribe_device(connection_factory, device_id, subscription, request.headers.get("User-Agent", ""))
        except (ValueError, RuntimeError) as error:
            return jsonify({"ok": False, "error": str(error)}), 400
        response = jsonify({"ok": True, "subscribed": True})
        response.set_cookie(
            PUSH_DEVICE_COOKIE,
            device_id,
            max_age=365 * 24 * 60 * 60,
            httponly=True,
            secure=request.is_secure,
            samesite="Lax",
            path="/",
        )
        return response

    @app.post("/api/push/unsubscribe")
    @login_required
    def push_unsubscribe_api():
        check_csrf()
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Invalid push request"}), 400
        device_id = str(payload.get("deviceId") or "")
        deleted = unsubscribe_device(connection_factory, device_id)
        response = jsonify({"ok": True, "subscribed": False, "deleted": deleted})
        response.delete_cookie(PUSH_DEVICE_COOKIE, path="/")
        return response

    @app.post("/api/push/presence")
    @login_required
    def push_presence_api():
        check_csrf()
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"ok": False, "error": "Invalid push presence"}), 400
        try:
            active = update_device_presence(
                connection_factory,
                str(payload.get("deviceId") or ""),
                str(payload.get("clientId") or ""),
                payload.get("visible"),
            )
        except ValueError as error:
            return jsonify({"ok": False, "error": str(error)}), 400
        return jsonify({"ok": True, "active": active})

    original_logout = app.view_functions.get("logout")
    if original_logout:
        def logout_with_push_cleanup(*args: Any, **kwargs: Any):
            device_id = str(request.cookies.get(PUSH_DEVICE_COOKIE) or "")
            response = app.make_response(original_logout(*args, **kwargs))
            if response.status_code < 400 and device_id:
                _best_effort(lambda: unsubscribe_device(connection_factory, device_id), "logout push cleanup")
            response.delete_cookie(PUSH_DEVICE_COOKIE, path="/")
            return response
        app.view_functions["logout"] = logout_with_push_cleanup

    original_account_update = app.view_functions.get("update_admin_account")
    if original_account_update:
        def account_update_with_push_cleanup(*args: Any, **kwargs: Any):
            response = app.make_response(original_account_update(*args, **kwargs))
            if response.status_code < 400:
                _best_effort(lambda: unsubscribe_all_devices(connection_factory), "credential-change push cleanup")
            return response
        app.view_functions["update_admin_account"] = account_update_with_push_cleanup


    app.extensions["final_notifications"] = {
        "installed": True,
        "tmdb_fetcher": tmdb_fetcher,
    }
