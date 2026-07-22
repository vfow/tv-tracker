TV Tracker 1.2.2 — Watchlist Rows
==================================

This update improves the Watchlist while preserving the original TV Tracker visual style and the 1.2.1 application shell.

Changes
-------
- Clearer show-title, episode, and episode-title hierarchy.
- Thin per-show progress bar with watched/total episode counts.
- Useful icons inside the circular quick-action control.
- Watching: mark the next available episode as watched.
- Paused: move the show back to Watching.
- Plan To Watch: start the show by moving it to Watching.
- Dropped: restore the show to Watching.
- Completed: display a non-interactive completion mark.
- Future episodes display their trusted release date/countdown and a disabled clock control.
- Better long-title handling and a text fallback when a poster is missing.
- Improved keyboard labels, focus behavior, poster alt text, and lazy-loaded posters.
- Responsive row sizing for desktop and phones.

Unchanged
---------
- PostgreSQL data and schema.
- Login and environment variables.
- TMDB/TVMaze metadata logic.
- The global trusted episode-date correction.
- Import/export and history behavior.
- Desktop sidebar, mobile bottom navigation, tabs, search, and filters.
