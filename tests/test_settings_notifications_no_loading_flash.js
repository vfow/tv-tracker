const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const vue = fs.readFileSync(path.join(ROOT, 'frontend/src/notifications/SettingsNotifications.vue'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'static/css/notifications-nav.css'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'static/js/notifications-runtime.js'), 'utf8');

assert(!vue.includes('Loading notification settings…'), 'Settings → Notifications must not render a visible loading placeholder');
assert(css.includes('#settings-v2-notification-list > .notifications-loading'), 'Runtime-owned notification settings loading node must be visually suppressed');
assert(runtime.includes('async function renderNotificationControls'), 'Canonical notification settings renderer must remain intact');
assert(runtime.includes("Couldn't load notification settings."), 'Real notification settings load failures must remain visible');

console.log('notification settings no-loading-flash regression passed');
