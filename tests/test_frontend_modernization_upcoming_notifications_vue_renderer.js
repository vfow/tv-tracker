const assert = require('assert');
const fs = require('fs');

const bridge = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js', 'utf8');
const component = fs.readFileSync('frontend/src/upcoming-notifications/UpcomingNotificationsSurface.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/upcoming-notifications/viewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const notifications = fs.readFileSync('static/js/notifications-runtime.js', 'utf8');
const router = fs.readFileSync('static/js/app-router.js', 'utf8');

assert(component.includes('data-tvtracker-upcoming-notifications-owner'));
assert(component.includes('v-html="model.html"'));
assert(viewModel.includes("'upcoming' | 'notifications'"));
assert(viewModel.includes("ownership: 'vue-dom'"));

assert(main.includes("import UpcomingNotificationsSurface from './upcoming-notifications/UpcomingNotificationsSurface.vue'"));
assert(main.includes('TVTrackerUpcomingNotificationsVueBridge?: UpcomingNotificationsVueBridge'));
assert(main.includes('upcomingNotificationsOwner'));
assert(main.includes('window.TVTrackerUpcomingNotificationsVueBridge?.attachVueOwner(upcomingNotificationsOwner)'));
assert(main.includes("model.surface === 'upcoming' ? 'show-list' : 'notifications-content'"));

assert(bridge.includes('const legacyRenderUpcoming = typeof global.renderUpcoming === "function" ? global.renderUpcoming : null'));
assert(bridge.includes('const legacyNotifications = global.TVTrackerNotifications || null'));
assert(bridge.includes('global.renderUpcoming = renderUpcoming'));
assert(bridge.includes('global.TVTrackerNotifications = Object.assign({},legacyNotifications'));
assert(bridge.includes('ownership:"vue-dom"'));
assert(bridge.includes('vueOwner.render(model)'));
assert(bridge.includes('attachUpcomingInteractions()'));
assert(bridge.includes('attachNotificationInteractions()'));
assert(bridge.includes('/api/notifications/status'));
assert(bridge.includes('/api/notifications/'));
assert(!bridge.includes('history.pushState'));
assert(!bridge.includes('history.replaceState'));
assert(!bridge.includes('addEventListener("popstate"'));

// The bounded handoff keeps legacy composition/orchestration available while Vue
// becomes the final runtime DOM owner. Physical cleanup is a later roadmap phase.
assert(ui.includes('async function renderUpcoming(startBackgroundRefresh=true)'));
assert(notifications.includes('async function renderNotificationsPage()'));
assert(ui.includes('window.TVTrackerNotifications.mountUpcomingBell'));
assert(router.includes('if(path === "/app/upcoming")'));
assert(router.includes('if(path === "/app/notifications")'));

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/upcoming-notifications-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0 && bridgeIndex > appIndex, 'bridge must load after app.js establishes legacy owners');
assert(routerIndex > bridgeIndex, 'bridge must be installed before startup routing applies the initial page');

console.log('Upcoming + Notifications Vue renderer ownership contract passed.');
