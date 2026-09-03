const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const vue = fs.readFileSync(path.join(ROOT, 'frontend/src/notifications/SettingsNotifications.vue'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'static/css/notifications-nav.css'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'static/js/notifications-runtime.js'), 'utf8');

assert(vue.includes('id="settings-v2-notification-list"'), 'Vue must preserve the canonical notification settings mount');
assert(vue.includes('await runtime.renderNotificationControls(list);'), 'Vue must keep delegating to the canonical notification settings renderer');
assert(css.includes('#settings-v2-notification-list > .notifications-loading'), 'Transient notification settings loading nodes must be visually suppressed');
assert(runtime.includes('Loading notification settings…'), 'The canonical renderer may keep its internal loading state as long as it is not visible');
assert(runtime.includes('Couldn’t load notification settings.'), 'Real notification settings load failures must remain visible');

console.log('notification settings no-loading-flash regression passed');
