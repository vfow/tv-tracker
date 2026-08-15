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

notification_css = css.split("/* Notifications V1 */", 1)[1]
for forbidden in ("gradient", "tt-blue", "tt-gold", "#ff0000", "#00ff00"):
    assert forbidden not in notification_css.lower()

print("Notification integration contract test passed.")
