from __future__ import annotations

import json
import logging
import os

import app as app_module
from tvtracker.notifications import runtime as notification_runtime


def _configure_worker_logging() -> None:
    configured = os.environ.get("TVTRACKER_LOG_LEVEL", "INFO").strip().upper()
    level = getattr(logging, configured, logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")
    logging.getLogger("tvtracker.notification_worker").setLevel(level)


if __name__ == "__main__":
    _configure_worker_logging()
    scheduled_runner = getattr(
        notification_runtime,
        "run_scheduled_notification_worker",
        None,
    )
    if scheduled_runner is None:
        # Rollback compatibility for older runtime packages and hermetic tooling.
        result = notification_runtime.run_final_notification_worker_hardened(
            app_module.database_connection,
            app_module.fetch_tmdb_notification_json,
            app_module.run_notification_check,
        )
    else:
        result = scheduled_runner(
            app_module.database_connection,
            app_module.fetch_tmdb_notification_json,
            app_module.run_notification_check,
            release_sha=getattr(app_module, "RELEASE_SHA", None),
        )
    print(json.dumps(result, sort_keys=True))
