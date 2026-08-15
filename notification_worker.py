from __future__ import annotations

import json

from app import run_notification_check


if __name__ == "__main__":
    print(json.dumps(run_notification_check(), sort_keys=True))
