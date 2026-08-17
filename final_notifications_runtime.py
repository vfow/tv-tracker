from __future__ import annotations

import threading
from datetime import datetime
from typing import Any, Callable

import final_notifications as final


_PREPARE_LOCK = threading.Lock()
_PREPARED = False
_ORIGINAL_ENSURE_FINAL_SCHEMA = final.ensure_final_schema
_ORIGINAL_RUN_MOVIE_NOTIFICATION_CHECK = final.run_movie_notification_check
_ORIGINAL_CLAIM_PUSH_BATCH = final._claim_push_batch


def _schema_already_prepared(_connection_factory: Callable[[], Any]) -> None:
    """Request-time code must never rerun final notification DDL."""
    return None


def _clear_movie_baselines(connection_factory: Callable[[], Any]) -> None:
    with connection_factory() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM tv_tracker_movie_notification_baseline")
        connection.commit()


def run_movie_notification_check_hardened(
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Clear region-scoped baselines when no region exists, then use canonical movie rules."""
    movies, region = final._read_tracker_movies_and_region(connection_factory)
    if not region:
        _clear_movie_baselines(connection_factory)
        return {
            "ok": True,
            "status": "needs_region",
            "checked": 0,
            "created": 0,
            "fetchFailures": 0,
        }
    return _ORIGINAL_RUN_MOVIE_NOTIFICATION_CHECK(connection_factory, tmdb_fetcher, now)


def _prepare_push_outbox_state(connection_factory: Callable[[], Any]) -> None:
    """Resolve stale security/session state before the normal SKIP LOCKED claim."""
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

            # If the app became visible after a push was queued (including a retry),
            # permanently suppress that OS delivery. The in-app row remains the source of truth.
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
                        AND p.last_seen_at > NOW() - INTERVAL '{final.PUSH_ACTIVE_WINDOW_SECONDS} seconds'
                  )
                """
            )

            # A worker can die after claiming a row. If that stale row belongs to a now-active
            # device, suppress it instead of resurrecting an OS notification later.
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
                        AND p.last_seen_at > NOW() - INTERVAL '{final.PUSH_ACTIVE_WINDOW_SECONDS} seconds'
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
                (final.MAX_PUSH_ATTEMPTS,),
            )
        connection.commit()


def claim_push_batch_hardened(
    connection_factory: Callable[[], Any],
    current: datetime,
) -> list[tuple[Any, ...]]:
    _prepare_push_outbox_state(connection_factory)
    return _ORIGINAL_CLAIM_PUSH_BATCH(connection_factory, current)


def prepare_final_notification_runtime(connection_factory: Callable[[], Any]) -> None:
    """Run final schema DDL once at process startup and install runtime safeguards.

    The WSGI process and the scheduled notification worker call this before serving requests
    or processing notifications. After the schema is prepared, request-time helpers see a
    no-op schema function so polling/list/settings routes cannot acquire DDL locks.
    """
    global _PREPARED
    if _PREPARED:
        return
    with _PREPARE_LOCK:
        if _PREPARED:
            return
        _ORIGINAL_ENSURE_FINAL_SCHEMA(connection_factory)
        final.ensure_final_schema = _schema_already_prepared
        final.run_movie_notification_check = run_movie_notification_check_hardened
        final._claim_push_batch = claim_push_batch_hardened
        _PREPARED = True


def runtime_is_prepared() -> bool:
    return _PREPARED
