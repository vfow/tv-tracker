from __future__ import annotations

import json

from app import database_connection, fetch_tmdb_notification_json, run_notification_check
from final_notifications import run_final_notification_worker


if __name__ == "__main__":
    result = run_final_notification_worker(
        database_connection,
        fetch_tmdb_notification_json,
        run_notification_check,
    )
    print(json.dumps(result, sort_keys=True))
