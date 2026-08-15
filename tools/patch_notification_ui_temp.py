from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


js_path = Path("static/js/notifications.js")
js = js_path.read_text()

options_start = js.index("    const SETTINGS_LABELS = [")
options_end = js.index("    ];", options_start) + len("    ];")
new_options = '''    const SETTINGS_OPTIONS = [
        ["newSeason","New Season","When a new season is added to a show."],
        ["seasonPremiereTomorrow","Season Premiere Tomorrow","When a show's new season begins tomorrow."],
        ["newEpisode","New Episode","When a new episode show becomes available."],
        ["returnsTomorrow","Returns Tomorrow","When a Watching show returns."],
        ["canceledEnded","Canceled / Ended","When a show is canceled or ended."],
        ["premiereDateUpdates","Premiere Date Updates","When a season premiere date is announced, changed, or delayed."]
    ];'''
js = js[:options_start] + new_options + js[options_end:]

notifications_header = '''                <header class="notifications-header">
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
js, count = re.subn(
    r'(?ms)^                <header class="notifications-header">\n.*?^                </header>',
    notifications_header,
    js,
    count=1,
)
if count != 1:
    raise SystemExit(f"notifications header: expected one match, found {count}")

switch_start = js.index("    function switchMarkup(")
switch_end = js.index("\n    async function saveSetting", switch_start)
new_switch = '''    function switchMarkup(key,label,checked,disabled=false,description=""){
        return `
            <label class="notification-setting-row" data-setting-row="${key}">
                <span class="notification-setting-copy">
                    <strong>${label}</strong>
                    ${description ? '<span class="notification-setting-description">' + description + '</span>' : ""}
                </span>
                <span class="notification-switch">
                    <input type="checkbox" data-notification-setting="${key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                    <span class="notification-switch-track" aria-hidden="true"><span class="notification-switch-thumb"></span></span>
                </span>
            </label>
        `;
    }
'''
js = js[:switch_start] + new_switch + js[switch_end:]

family_start = js.index("            const familyRows = SETTINGS_LABELS.map")
family_end = js.index("            root.innerHTML = `", family_start)
new_family = '''            const familyRows = SETTINGS_OPTIONS.map(([key,label,description])=>{
                return switchMarkup(key,label,settings[key] !== false,settings.enabled === false,description);
            }).join("");
'''
js = js[:family_start] + new_family + js[family_end:]

settings_header = '''                    <header class="notifications-header notification-settings-header">
                        <div class="notifications-heading">
                            <div class="notifications-title-row">
                                <a class="notifications-back-link" href="/app/notifications" aria-label="Back to Notifications"><span aria-hidden="true">←</span></a>
                                <h1>Notification Settings</h1>
                            </div>
                            <p class="notifications-subtitle">Choose which updates you want to receive.</p>
                        </div>
                    </header>'''
js, count = re.subn(
    r'(?ms)^                    <header class="notifications-header notification-settings-header">\n.*?^                    </header>',
    settings_header,
    js,
    count=1,
)
if count != 1:
    raise SystemExit(f"settings header: expected one match, found {count}")
js_path.write_text(js)

header_old = ".notifications-header{display:flex;min-height:54px;align-items:center;justify-content:space-between;gap:16px;padding:0 16px;border-bottom:1px solid #1d1d1d}"
header_new = ".notifications-header{display:flex;min-height:72px;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-bottom:1px solid #1d1d1d}"
h1_line = ".notifications-header h1{margin:0;color:#fff;font-size:28px;font-weight:700;line-height:1.2}"
heading_css = '''.notifications-heading{min-width:0;flex:1 1 auto}
.notifications-title-row{display:flex;min-width:0;align-items:center;gap:10px}
.notifications-back-link{display:inline-flex;width:32px;height:32px;flex:0 0 32px;align-items:center;justify-content:center;border-radius:9999px;color:#ddd;text-decoration:none;transition:background-color .16s ease,color .16s ease}
.notifications-back-link:hover{background:#1b1b1b;color:#fff}
.notifications-back-link span{display:block;font-size:24px;line-height:1;transform:translateY(-1px)}
.notifications-subtitle{margin:4px 0 0 42px;color:#777;font-size:13px;line-height:1.35}'''
row_old = ".notification-setting-row{display:flex;min-height:68px;align-items:center;justify-content:space-between;gap:24px;padding:14px 16px;border-bottom:1px solid #1d1d1d;cursor:pointer;transition:background-color .16s ease,opacity .16s ease}"
row_new = ".notification-setting-row{display:flex;min-height:76px;align-items:center;justify-content:space-between;gap:24px;padding:14px 16px;border-bottom:1px solid #1d1d1d;cursor:pointer;transition:background-color .16s ease,opacity .16s ease}"
copy_old = ".notification-setting-copy{min-width:0}"
copy_new = ".notification-setting-copy{display:flex;min-width:0;flex-direction:column;gap:4px}"
strong_line = ".notification-setting-copy strong{color:#ddd;font-size:16px;font-weight:500}"
description_line = ".notification-setting-description{color:#777;font-size:13px;line-height:1.35}"
mobile_old = "  .notifications-header{min-height:58px;padding:0 6px}\n  .notifications-header h1{font-size:25px}"
mobile_new = "  .notifications-header{min-height:68px;padding:8px 6px}\n  .notifications-header h1{font-size:25px}\n  .notifications-subtitle{font-size:12px}"

for css_name in ("static/css/tailwind-input.css", "static/css/tailwind.css"):
    css_path = Path(css_name)
    css = css_path.read_text()
    css = replace_once(css, header_old, header_new, f"{css_name} header")
    css = replace_once(css, h1_line, h1_line + "\n" + heading_css, f"{css_name} heading styles")
    css = replace_once(css, row_old, row_new, f"{css_name} row")
    css = replace_once(css, copy_old, copy_new, f"{css_name} copy")
    css = replace_once(css, strong_line, strong_line + "\n" + description_line, f"{css_name} description")
    css = replace_once(css, mobile_old, mobile_new, f"{css_name} mobile")
    css_path.write_text(css)

test_path = Path("tests/test_notification_contract.py")
test = test_path.read_text()
marker = 'notification_css = css.split("/* Notifications V1 */", 1)[1]\n'
assertions = '''expected_notification_copy = (
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
assert "Updates from the shows you follow." in frontend
assert "Choose which updates you want to receive." in frontend
assert ".notifications-back-link" in css
assert ".notification-setting-description" in css

settings_options = frontend.split("const SETTINGS_OPTIONS = [", 1)[1].split("];", 1)[0].lower()
for internal_wording in ("tracked", "loggable", "14 days"):
    assert internal_wording not in settings_options

notification_css = css.split("/* Notifications V1 */", 1)[1]
'''
test = replace_once(test, marker, assertions, "notification contract assertions")
test_path.write_text(test)
