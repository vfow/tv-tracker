from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from . import push_and_movies as final


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


def runtime_is_prepared() -> bool:
    return final.schema_is_prepared()