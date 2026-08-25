from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Any


SYNC_WINDOW_SECONDS = 60
SYNC_MAX_REQUESTS = 180
SYNC_REQUESTS: dict[str, deque[float]] = defaultdict(deque)
SYNC_LOCK = threading.Lock()
# TMDB export/index caches live in tvtracker.media.tmdb_exports.
# Backup validation primitives and limits live in tvtracker.backup.primitives.


def sync_request_is_limited(key: str) -> bool:
    now = time.monotonic()
    cutoff = now - SYNC_WINDOW_SECONDS

    with SYNC_LOCK:
        requests = SYNC_REQUESTS[key]
        while requests and requests[0] < cutoff:
            requests.popleft()
        if len(requests) >= SYNC_MAX_REQUESTS:
            return True
        requests.append(now)
        return False


