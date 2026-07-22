TV Tracker 1.2.1 — Original Layout Feel + Mobile Bottom Navigation

This update keeps Bootstrap as the responsive foundation while restoring the TV Tracker interface's original custom visual language.

Changes:
- Removed the temporary "Private library / TV TRACKER" brand block.
- Removed the mobile hamburger/header.
- Replaced mobile sidebar/off-canvas navigation with a fixed bottom navigation bar.
- Bottom navigation contains Shows, Discover, Profile, and Settings.
- Restored the original flat desktop sidebar treatment and 160px width.
- Restored flat Watchlist / Upcoming / History tabs with no Bootstrap-like active underline.
- Distributed the three top tabs across the available width.
- Restored compact rectangular status filters instead of rounded pills.
- Kept Watching, Paused, Completed, Plan To Watch, and Dropped in one horizontal row.
- On phones, the status row scrolls horizontally rather than wrapping onto a second line.
- Kept the mobile search box above the single-row status filters.
- Preserved all tracking, database, date-fix, login, import/export, and TMDB/TVMaze behavior.

Files changed:
- templates/index.html
- static/css/foundation.css
- static/js/app.js
- static/js/ui.js

No Python dependencies changed.
