from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


js_path = Path("static/js/notifications.js")
js = js_path.read_text()

old_notifications_header = '''                <header class="notifications-header">
                    <div class="notifications-heading">
                        <div class="notifications-title-row">
                            <a class="notifications-back-link" href="/app/upcoming" aria-label="Back to Upcoming"><span aria-hidden="true">←</span></a>
                            <h1>Notifications</h1>
                        </div>
                        <p class="notifications-subtitle">Updates from the shows you follow.</p>
                    </div>
                    <a class="notifications-settings-link" href="/app/notifications/settings" aria-label="Notification settings">
                        <img src="${SETTINGS_ICON}" alt="" aria-hidden="true" class="notification-icon notification-icon--light">
                    </a>
                </header>'''
new_notifications_header = '''                <header class="notifications-header">
                    <div class="notifications-title-row">
                        <a class="show-page-back-button notifications-back-button" href="/app/upcoming" aria-label="Back to Upcoming">
                            <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                        </a>
                        <h1 class="tw-font-league">Notifications</h1>
                    </div>
                    <a class="notifications-settings-link" href="/app/notifications/settings" aria-label="Notification settings">
                        <img src="${SETTINGS_ICON}" alt="" aria-hidden="true" class="notification-icon notification-icon--light">
                    </a>
                </header>'''
js = replace_once(js, old_notifications_header, new_notifications_header, "notifications header")

old_settings_header = '''                    <header class="notifications-header notification-settings-header">
                        <div class="notifications-heading">
                            <div class="notifications-title-row">
                                <a class="notifications-back-link" href="/app/notifications" aria-label="Back to Notifications"><span aria-hidden="true">←</span></a>
                                <h1>Notification Settings</h1>
                            </div>
                            <p class="notifications-subtitle">Choose which updates you want to receive.</p>
                        </div>
                    </header>'''
new_settings_header = '''                    <header class="notifications-header notification-settings-header">
                        <div class="notifications-title-row">
                            <a class="show-page-back-button notifications-back-button" href="/app/notifications" aria-label="Back to Notifications">
                                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                            </a>
                            <h1 class="tw-font-league">Notification Settings</h1>
                        </div>
                    </header>'''
js = replace_once(js, old_settings_header, new_settings_header, "notification settings header")
js_path.write_text(js)

old_css = '''.notifications-header{display:flex;min-height:72px;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-bottom:1px solid #1d1d1d}
.notifications-header h1{margin:0;color:#fff;font-size:28px;font-weight:700;line-height:1.2}
.notifications-heading{min-width:0;flex:1 1 auto}
.notifications-title-row{display:flex;min-width:0;align-items:center;gap:10px}
.notifications-back-link{display:inline-flex;width:32px;height:32px;flex:0 0 32px;align-items:center;justify-content:center;border-radius:9999px;color:#ddd;text-decoration:none;transition:background-color .16s ease,color .16s ease}
.notifications-back-link:hover{background:#1b1b1b;color:#fff}
.notifications-back-link span{display:block;font-size:24px;line-height:1;transform:translateY(-1px)}
.notifications-subtitle{margin:4px 0 0 42px;color:#777;font-size:13px;line-height:1.35}'''
new_css = '''.notifications-header{display:flex;min-height:72px;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-bottom:1px solid #1d1d1d}
.notifications-header h1{margin:0;color:#fff;font-size:64px;font-weight:400;line-height:1;letter-spacing:1px}
.notifications-title-row{display:flex;min-width:0;align-items:center;gap:10px}
.notifications-back-button.show-page-back-button{position:static;top:auto;margin:0;flex:0 0 46px;text-decoration:none}'''

old_mobile = '''  .notifications-header{min-height:68px;padding:8px 6px}
  .notifications-header h1{font-size:25px}
  .notifications-subtitle{font-size:12px}'''
new_mobile = '''  .notifications-header{min-height:68px;padding:8px 6px}
  .notifications-header h1{font-size:48px}'''

for css_name in ("static/css/tailwind-input.css", "static/css/tailwind.css"):
    css_path = Path(css_name)
    css = css_path.read_text()
    css = replace_once(css, old_css, new_css, f"{css_name} notification header styles")
    css = replace_once(css, old_mobile, new_mobile, f"{css_name} notification mobile styles")
    css_path.write_text(css)

test_path = Path("tests/test_notification_contract.py")
test = test_path.read_text()
old_test = '''assert 'href="/app/upcoming" aria-label="Back to Upcoming"' in frontend
assert 'href="/app/notifications" aria-label="Back to Notifications"' in frontend
assert "Updates from the shows you follow." in frontend
assert "Choose which updates you want to receive." in frontend
assert ".notifications-back-link" in css
assert ".notification-setting-description" in css'''
new_test = '''assert 'href="/app/upcoming" aria-label="Back to Upcoming"' in frontend
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
assert ".notification-setting-description" in css'''
test = replace_once(test, old_test, new_test, "notification UI contract assertions")
test_path.write_text(test)
