TV TRACKER ONLINE — UPDATE 1.1

Changes
- Restores SETTINGS as the bottom sidebar button.
- Moves LOG OUT into Settings > Danger Zone, next to Reset Data.
- Includes the profile-stat SVG icons and favicon.
- Fixes the online icon URLs so they load from /static/assets/.

Install with WinSCP
1. Open /home/broghgf7/www/tv-tracker/ on the server.
2. Upload the contents of this update folder into that directory.
3. Choose Overwrite when WinSCP asks.
4. Confirm these server files exist:
   templates/index.html
   static/js/ui.js
   static/css/style.css
   static/assets/EPISODES WATCHED.svg
   static/assets/WATCH TIME.svg
   static/assets/favicon.svg
5. In alwaysdata, go to Web > Sites and restart TV Tracker.
6. Hard refresh the browser with Ctrl+F5. On iPhone, close the tab and reopen it.

This update does not alter PostgreSQL data, environment variables, app.py, or wsgi.py.
