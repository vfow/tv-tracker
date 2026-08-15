from pathlib import Path

app = Path("app.py").read_text()
backend = Path("notifications_backend.py").read_text()
engine = Path("notification_engine.py").read_text()
frontend = Path("static/js/notifications.js").read_text()
router = Path("static/js/app-router.js").read_text()
ui = Path("static/js/ui.js").read_text()
template = Path("templates/index.html").read_text()
css = Path("static/css/tailwind-input.css").read_text()

for table in (
    "tv_tracker_notifications",
    "tv_tracker_notification_settings",
    "tv_tracker_notification_baseline",
    "tv_tracker_notification_events",
):
    assert f"CREATE TABLE IF NOT EXISTS {table}" in app

for route in (
    "/api/notifications/status",
    "/api/notifications",
    "/api/notifications/read-all",
    "/api/notifications/<int:notification_id>/read",
    "/api/notifications/settings",
    "/app/notifications",
    "/app/notifications/settings",
):
    assert route in app or route in router

assert "/api/state" not in frontend
assert "/api/state" not in backend
assert "saveData(" not in frontend
assert "tv_tracker_state" not in backend
assert "tvmaze" not in (backend + engine + frontend).lower()
assert "filename='assets/icons/notification-bell.svg'" in template
assert "filename='assets/icons/notification-settings.svg'" in template
assert "filename='js/notifications.js'" in template
assert 'id="notifications-page"' in template
assert 'id="notification-settings-page"' in template
assert "mountUpcomingBell" in ui
assert "mountUpcomingBellFallback" in ui
assert 'path === "/app/notifications"' in router
assert 'path === "/app/notifications/settings"' in router
assert "/* Notifications V1 */" in css

expected_notification_copy = (
    "When a new season is added to a show.",
    "When a show's new season begins tomorrow.",
    "When a new episode show becomes available.",
    "When a Watching show returns.",
    "When a show is canceled or ended.",
    "When a season premiere date is announced, changed, or delayed.",
)
for copy in expected_notification_copy:
    assert copy in frontend

assert 'href="/app/upcoming" aria-label="Back to Upcoming"' in frontend
assert 'href="/app/notifications" aria-label="Back to Notifications"' in frontend
assert frontend.count('/static/assets/icons/arrow-narrow-left.svg') == 2
assert frontend.count('class="show-page-back-button notifications-back-button"') == 2
assert frontend.count('<h1 class="tw-font-league">') == 2
assert "Updates from the shows you follow." not in frontend
assert "Choose which updates you want to receive." not in frontend
assert "←" not in frontend
assert ".notifications-back-link" not in css
assert ".notifications-subtitle" not in css
assert ".notifications-back-button.show-page-back-button" in css
assert ".notification-setting-description" in css
assert "mark_notification_read" in backend
assert '"latestId"' in backend and '"latestCreatedAt"' in backend
assert "LIVE_NOTIFICATION_POLL_MS = 30 * 1000" in frontend
assert "LIVE_NOTIFICATION_TOAST_MS = 5 * 1000" in frontend
assert "MAX_VISIBLE_NOTIFICATION_TOASTS = 3" in frontend
assert 'document.addEventListener("visibilitychange"' in frontend
assert 'toast.addEventListener("mouseenter",pauseTimer)' in frontend
assert 'close.textContent = "×"' in frontend
assert 'swipeLabel.textContent = "DELETE"' in frontend
assert "notification-swipe-delete-reveal" in frontend
assert "notification-live-toast-stack" in css
assert "notification-swipe-delete-reveal" in css
assert ".notification-row-delete{position:absolute;z-index:2" in css
assert "🗑" not in frontend and "🗑" not in css
assert "radial-gradient(circle at 10% 20%, rgba(120,0,40,.45), transparent 35%),linear-gradient(135deg,#111 0%,#080808 60%,#000 100%)" in css

settings_options = frontend.split("const SETTINGS_OPTIONS = [", 1)[1].split("];", 1)[0].lower()
for internal_wording in ("tracked", "loggable", "14 days"):
    assert internal_wording not in settings_options

notification_css = css.split("/* Notifications V1 */", 1)[1]
for forbidden in ("tt-blue", "tt-gold", "#ff0000", "#00ff00"):
    assert forbidden not in notification_css.lower()

print("Notification integration contract test passed.")
