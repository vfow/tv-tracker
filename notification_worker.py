from __future__ import annotations

import json

from app import database_connection, fetch_tmdb_notification_json, run_notification_check
import final_notifications as final_notifications_module
from final_notifications_runtime import prepare_final_notification_runtime


if __name__ == "__main__":
    prepare_final_notification_runtime(database_connection)
    result = final_notifications_module.run_final_notification_worker(
        database_connection,
        fetch_tmdb_notification_json,
        run_notification_check,
    )
    print(json.dumps(result, sort_keys=True))
