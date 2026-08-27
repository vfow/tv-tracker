from __future__ import annotations

import json
import logging
import secrets
import time
from datetime import datetime
from typing import Any, Callable

from . import push_and_movies as final


LOGGER = logging.getLogger("tvtracker.notification_worker")
NOTIFICATION_WORKER_LOCK_KEY = 6077137459442043730


def prepare_final_notification_runtime(connection_factory: Callable[[], Any]) -> None:
    """Run final schema DDL once per process, before requests or worker work begin.

    The canonical owner guards schema preparation itself, so this is a thin
    startup delegate rather than a patching wrapper.
    """
    final.ensure_final_schema(connection_factory)


def run_final_notification_worker_hardened(
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    core_runner: Callable[[datetime | None], dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Explicit final worker orchestration with second-audit safeguards."""
    return final.run_final_notification_worker(
        connection_factory,
        tmdb_fetcher,
        core_runner,
        now,
    )


def _worker_event(
    event: str,
    *,
    run_id: str,
    release_sha: str | None,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    payload: dict[str, Any] = {
        "event": event,
        "runId": run_id,
        **fields,
    }
    if release_sha:
        payload["releaseSha"] = release_sha
    LOGGER.log(
        level,
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True),
    )


def _worker_summary(result: dict[str, Any]) -> dict[str, Any]:
    push = result.get("push")
    push_result = push if isinstance(push, dict) else {}
    return {
        "changedNotifications": int(result.get("changedNotifications") or 0),
        "pushDelivered": int(push_result.get("delivered") or 0),
        "pushFailed": int(push_result.get("failed") or 0),
        "pushDead": int(push_result.get("dead") or 0),
    }


def run_scheduled_notification_worker(
    connection_factory: Callable[[], Any],
    tmdb_fetcher: Callable[[str, dict[str, Any] | None], dict[str, Any]],
    core_runner: Callable[[datetime | None], dict[str, Any]],
    now: datetime | None = None,
    *,
    release_sha: str | None = None,
    clock: Callable[[], float] = time.perf_counter,
) -> dict[str, Any]:
    """Run one worker pass while holding a process-independent PostgreSQL lock.

    The session-level advisory lock prevents overlapping scheduler invocations
    from generating duplicate work. A lock miss is a successful no-op so a
    scheduler does not retry and amplify an already-running worker.
    """

    run_id = secrets.token_hex(8)
    started = clock()

    with connection_factory() as lock_connection:
        with lock_connection.cursor() as cursor:
            cursor.execute(
                "SELECT pg_try_advisory_lock(%s)",
                (NOTIFICATION_WORKER_LOCK_KEY,),
            )
            row = cursor.fetchone()
        lock_connection.commit()

        if not (
            isinstance(row, tuple)
            and len(row) == 1
            and isinstance(row[0], bool)
        ):
            raise RuntimeError("notification worker lock query returned invalid result")

        if row[0] is not True:
            _worker_event(
                "notification_worker_skipped",
                run_id=run_id,
                release_sha=release_sha,
                reason="overlap",
                durationMs=round(max(0.0, (clock() - started) * 1000.0), 2),
            )
            return {
                "ok": True,
                "status": "skipped_overlap",
                "skipped": True,
            }

        try:
            _worker_event(
                "notification_worker_started",
                run_id=run_id,
                release_sha=release_sha,
            )
            result = run_final_notification_worker_hardened(
                connection_factory,
                tmdb_fetcher,
                core_runner,
                now,
            )
            _worker_event(
                "notification_worker_completed",
                run_id=run_id,
                release_sha=release_sha,
                durationMs=round(max(0.0, (clock() - started) * 1000.0), 2),
                **_worker_summary(result),
            )
            return result
        except Exception as error:
            _worker_event(
                "notification_worker_failed",
                run_id=run_id,
                release_sha=release_sha,
                level=logging.ERROR,
                durationMs=round(max(0.0, (clock() - started) * 1000.0), 2),
                errorType=type(error).__name__,
            )
            raise
        finally:
            try:
                with lock_connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT pg_advisory_unlock(%s)",
                        (NOTIFICATION_WORKER_LOCK_KEY,),
                    )
                    cursor.fetchone()
                lock_connection.commit()
            except Exception:
                # Closing the dedicated PostgreSQL session releases a session lock.
                # Keep the worker result authoritative while still surfacing cleanup.
                LOGGER.exception("notification worker advisory lock cleanup failed")


def runtime_is_prepared() -> bool:
    return final.schema_is_prepared()
