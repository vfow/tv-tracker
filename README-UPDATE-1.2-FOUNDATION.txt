TV Tracker 1.2 Foundation
=========================

Purpose
-------
This is the first step of the full website improvement. It upgrades the shared
application shell without changing the database, imported data, login system,
TMDB/TVMaze logic, or the 1.1.1 trusted-date correction.

What changed
------------
- Added Bootstrap 5.3.8 as the responsive component foundation.
- Added a responsive application shell:
  - permanent sidebar on desktop
  - narrower sidebar on laptops
  - slide-out navigation and compact header on phones/tablets
- Added centralized design tokens for colors, spacing, borders, radii, shadows,
  responsive gutters, and motion.
- Replaced the hard-coded 350px tab spacing with a responsive tab bar.
- Made filters horizontally usable and changed library search to full width on
  small screens.
- Increased mobile touch targets.
- Improved base list rows, upcoming/history rows, dialogs, safe-area handling,
  focus states, and reduced-motion support.
- Renamed the app toast class to avoid colliding with Bootstrap's toast class.
- Added a local navigation fallback so the mobile menu remains usable if the
  Bootstrap CDN is temporarily unavailable.
- Updated the Content Security Policy to permit the pinned jsDelivr Bootstrap
  files used by the template.

Changed files
-------------
app.py
static/css/foundation.css                 (new)
static/js/app.js
static/js/shell.js                        (new)
static/js/ui.js
templates/index.html
README-UPDATE-1.2-FOUNDATION.txt          (new)

Safety
------
- No database schema changes.
- No environment-variable changes.
- No user-data migration.
- No changes to passwords, API keys, or secrets.
- The 1.1.1 global episode-date fix remains included.

Deployment
----------
1. Upload the patch contents to the root of the private GitHub repository.
2. Commit directly to main with:
   Add responsive TV Tracker 1.2 foundation
3. On alwaysdata:
   cd ~/www/tv-tracker
   git pull --ff-only origin main
4. Restart the site in alwaysdata: Web > Sites > Restart.
5. Hard-refresh the browser once.

Test checklist
--------------
Desktop:
- Sidebar remains visible.
- Shows, Discover, Profile, and Settings still open.
- Watchlist, Upcoming, and History still open.

Phone/tablet:
- A compact top bar appears.
- The menu button opens the side navigation.
- Choosing a page closes the side navigation.
- Watchlist search is easy to reach.
- Filters and tabs remain usable without horizontal page overflow.
- Show details open in a phone-sized full-height panel.

Next phase
----------
After this foundation is approved, redesign the Shows/Watchlist page and its
information hierarchy, then Upcoming/History, show details, Discover, Profile,
Settings, and Login.
