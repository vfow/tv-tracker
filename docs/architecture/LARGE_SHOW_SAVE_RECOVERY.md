# Large Show Save Recovery

Tracked shows are persisted as atomic `showsUpsert` records. Status changes and watched-episode updates therefore resend the full tracked-show record.

For long-running shows, accumulated season/provider metadata can make a legitimate show record larger than the generic 2 MiB single-record client batching guard. Before this recovery, such an operation failed locally before `PATCH /api/state` was sent and stayed at the head of the pending-save queue. Because the queue is ordered, every later tracker mutation could then remain behind that unsendable operation. The UI had already applied the local mutation, so a refresh appeared to undo watched episodes and status changes.

`static/js/save-storage-fallback.js` now keeps the existing 2 MiB guard as the default, but when that exact guard rejects the first atomic `showsUpsert` record it permits that show to travel alone up to 16 MiB. This stays well below the Flask application's 40 MiB request ceiling and does not relax the limit for history/state records.

The same compatibility layer already keeps pending saves in memory when browser storage is unavailable. Together, the two fallbacks allow an older oversized show operation to drain on the next load instead of permanently blocking later saves.

`tests/test_large_show_save_persistence.js` exercises a show payload above 2 MiB through the real pending-save queue and `saveData()` path, with browser storage unavailable, and verifies that the API request is sent, the server revision advances, and the queue drains.
