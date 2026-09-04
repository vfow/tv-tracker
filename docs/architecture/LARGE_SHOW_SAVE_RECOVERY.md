# Large Show Save Recovery

Tracked shows are persisted as atomic `showsUpsert` records. Status changes and watched-episode updates therefore resend the full tracked-show record.

For long-running shows, accumulated season/provider metadata can make a legitimate show record larger than the generic 2 MiB single-record client batching guard. Before this recovery, such an operation failed locally before `PATCH /api/state` was sent and stayed at the head of the pending-save queue. Because the queue is ordered, every later tracker mutation could then remain behind that unsendable operation. The UI had already applied the local mutation, so a refresh appeared to undo watched episodes and status changes across unrelated shows too.

`static/js/save-storage-fallback.js` keeps the existing 2 MiB guard as the default, but when that exact guard rejects the first atomic `showsUpsert` record it permits that show to travel alone up to 36 MiB. The Flask application accepts request bodies up to 40 MiB, so the larger show-only boundary still leaves a safety margin and does not relax the limit for history/state records.

The queue recovery also removes the global head-of-line failure mode. A record-specific failure now leaves that operation queued for retry while later queued operations are attempted during the same drain pass. Shared failures such as an offline request, expired/forbidden session, database outage, or server error still stop the pass and use the existing retry path. This means one malformed or oversized tracked show can no longer prevent status or episode changes for unrelated shows from reaching the server.

The same compatibility layer keeps pending saves in memory when browser storage is unavailable. Together, these fallbacks let older oversized operations drain when possible, preserve operations that still need attention, and prevent one failed operation from holding the rest of the tracker queue hostage.

`tests/test_large_show_save_persistence.js` continues to cover the normal large-show path above 2 MiB. `tests/test_global_save_queue_recovery.js` covers a tracked-show request above the previous 16 MiB ceiling and verifies that a record-specific failure at the front of the queue does not stop a later show save from reaching the API.
