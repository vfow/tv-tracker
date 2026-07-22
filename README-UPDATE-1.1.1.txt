TV TRACKER ONLINE — UPDATE 1.1.1

Purpose
- Corrects one-day release-date conflicts between TMDB and TVmaze.
- Fixes Sugar and Cape Fear episodes appearing on Thursday when their trusted TVmaze schedule says Friday.

Date rules
- Calendar display and schedule grouping use a trusted TVmaze airdate when available.
- TMDB air_date remains the fallback.
- Existing TVmaze safety checks still reject large date disagreements.
- The exact timestamp continues to determine the displayed release time.

Changed files
- static/js/app.js
- static/js/ui.js
- templates/index.html

This update does not change PostgreSQL data, environment variables, app.py, wsgi.py, or login settings.

GitHub deployment
1. Upload the three changed files to the matching paths in the private GitHub repository.
2. Commit with: Fix trusted episode calendar dates
3. SSH into alwaysdata.
4. Run:
   cd ~/www/tv-tracker
   git pull --ff-only origin main
5. Restart the site in alwaysdata: Web > Sites > Restart.
6. Reopen the site and check Sugar S2E6 and Cape Fear S1E9.
