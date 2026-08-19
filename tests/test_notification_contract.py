from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tvtracker.migrations import MIGRATIONS  # noqa: E402


def read_source(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


app = read_source("app.py")
backend = read_source("tvtracker/notifications/backend.py")
engine = read_source("tvtracker/notifications/engine.py")
frontend = read_source("static/js/notifications-runtime.js")
upcoming_owner = read_source("static/js/upcoming-schedule-repair.js")
router = read_source("static/js/app-router.js")
ui = read_source("static/js/ui.js")
template = read_source("templates/index.html")
css = read_source("static/css/tailwind-input.css")
migration_sql = "\n".join(migration.sql for migration in MIGRATIONS)

for table in (
    "tv_tracker_notifications",
    "tv_tracker_notification_settings",
    "tv_tracker_notification_baseline",
    "tv_tracker_notification_events",
):
    assert f"CREATE TABLE IF NOT EXISTS {table}" in migration_sql

assert "tv_tracker_tvmaze_" not in migration_sql

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
for tracker_dependency in (
    "DATA",
    "saveData",
    "refreshShowForSchedule",
    "getUpcomingScheduleItems",
    "refreshUpcomingDataInBackground",
    "renderUpcoming",
):
    assert tracker_dependency not in frontend
    assert tracker_dependency in upcoming_owner
notification_runtime_export = frontend.split(
    "global.TVTrackerNotificationsRuntime = Object.freeze({", 1
)[1]
assert "repair" not in notification_runtime_export.lower()
assert "tv_tracker_state" not in backend
assert "tvmaze" not in (backend + engine + frontend).lower()
assert "filename='assets/icons/notification-bell.svg'" in template
assert "filename='assets/icons/notification-settings.svg'" in template
assert "filename='js/notifications-runtime.js'" in template
assert template.count("filename='js/upcoming-schedule-repair.js'") == 1
assert template.index("filename='js/release-timing.js'") < template.index("filename='js/app.js'")
assert template.index("filename='js/app.js'") < template.index("filename='js/upcoming-schedule-repair.js'")
assert "filename='js/notifications.js'" not in template
assert 'id="notifications-page"' in template
assert 'id="notification-settings-page"' not in template
assert '/app/settings/notifications' in router
assert "mountUpcomingBell" in ui
assert "mountUpcomingBellFallback" in ui
assert 'path === "/app/notifications"' in router
assert 'path === "/app/notifications/settings"' in router
assert "/* Notifications V1 */" in css

expected_notification_copy = (
    "When a new season is added to a show.",
    "When a show's new season begins tomorrow.",
    "When a new episode becomes available.",
    "When a Watching show returns.",
    "When a show is canceled or ended.",
    "When a season premiere date is announced, changed, or delayed.",
)
for copy in expected_notification_copy:
    assert copy in frontend

assert 'href="/app/upcoming" aria-label="Back to Upcoming"' in frontend
assert 'href="/app/notifications" aria-label="Back to Notifications"' not in frontend
assert frontend.count('/static/assets/icons/arrow-narrow-left.svg') == 1
assert frontend.count('class="show-page-back-button notifications-back-button"') == 1
assert frontend.count('<h1 class="tw-font-league">') == 1
assert "Updates from the shows you follow." not in frontend
assert "Choose which updates you want to receive." not in frontend
assert "←" not in frontend
assert ".notifications-back-link" not in css
assert ".notifications-subtitle" not in css
assert ".notifications-back-button.show-page-back-button" in css
assert ".notification-setting-description" in css
assert "mark_notification_read" in backend
assert '"latestId"' in backend and '"latestCreatedAt"' in backend
assert "unwatched_episode_reminder" in engine
assert "You still haven't watched" in engine
assert "reminder_day = available_day + timedelta(days=5)" in engine
assert 'last_checked_at=settings.get("last_checked_at")' in backend
assert "LIVE_NOTIFICATION_POLL_MS = 30 * 1000" in frontend
assert "LIVE_NOTIFICATION_TOAST_MS = 10 * 1000" in frontend
assert "MAX_VISIBLE_NOTIFICATION_TOASTS = 3" in frontend
assert 'document.addEventListener("visibilitychange"' in frontend
assert 'toast.addEventListener("mouseenter",pauseTimer)' in frontend
assert 'close.textContent = "×"' in frontend
assert 'swipeLabel.textContent = "DELETE"' not in frontend
assert "notification-swipe-delete-reveal" in frontend
assert "notification-live-toast-stack" in css
assert "notification-swipe-delete-reveal" in css
assert ".notification-row-delete{position:absolute;z-index:2" in css
assert "🗑" not in frontend and "🗑" not in css
assert "background:#780028" in css
assert ".notification-settings-list{margin-top:18px;overflow:hidden;border:1px solid #1d1d1d;border-radius:12px;background:#050505}" in css
assert ".notification-setting-row:last-child{border-bottom:0}" in css
assert '<div class="notification-settings-divider"></div>' not in frontend

settings_options = frontend.split("const BASE_SETTING_OPTIONS = [", 1)[1].split("];", 1)[0].lower()
for internal_wording in ("tracked", "loggable", "14 days"):
    assert internal_wording not in settings_options

notification_css = css.split("/* Notifications V1 */", 1)[1]
for forbidden in ("tt-blue", "tt-gold", "#ff0000", "#00ff00"):
    assert forbidden not in notification_css.lower()

print("Notification integration contract test passed.")
