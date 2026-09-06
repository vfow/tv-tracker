# Collection detail loading regression

Production reproduction: open Discover → Collections → The Dark Knight
Collection (`/app/collection/263-the-dark-knight-collection`). The index displays
cached summaries, but the detail page displays “Collection could not load”.

The shared export transport in `tvtracker/media/tmdb_exports.py` forwarded its
timeout as urllib's second positional argument, which is request-body data.
This changes a bodyless GET into a POST with an integer body and raises
`TypeError: message_body should be a bytes-like object or an iterable`.
Fresh collection details, collection exports, and network exports all use this
helper. Cached index data can conceal the failure.

The fix forwards `timeout=timeout`. The existing application transport seam,
20-second timeout, API responses, and tracker storage behavior are preserved.

`tests/test_tmdb_export_transport.py` calls all three fetch functions through
real urllib HTTP handling against a loopback server. It checks bodyless GETs,
response decoding, and the explicit timeout. All three subcases reproduced the
TypeError before the fix and pass after it. External provider requests and
application/database startup are isolated from this transport test.

Release gate: exact-head CI, merge verification, deployment restart/SHA health,
then repeat the collection detail navigation on production.
