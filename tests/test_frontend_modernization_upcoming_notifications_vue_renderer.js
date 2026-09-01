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

assert(component.includes('data-tvtracker-upcoming-notifications-owner="vue-upcoming"'));
assert(component.includes('data-tvtracker-upcoming-notifications-owner="vue-notifications"'));
assert(!component.includes('v-html'));
assert(component.includes('v-for="group in model.groups"'));
assert(component.includes('class="show upcoming-entry-card"'));
assert(component.includes('class="notification-row"'));
assert(viewModel.includes("surface: 'upcoming'"));
assert(viewModel.includes("surface: 'notifications'"));
assert(viewModel.includes('UpcomingEpisodeViewModel'));
assert(viewModel.includes('NotificationItemViewModel'));

assert(main.includes("import UpcomingNotificationsSurface from './upcoming-notifications/UpcomingNotificationsSurface.vue'"));
assert(main.includes('TVTrackerUpcomingNotificationsVueBridge?: UpcomingNotificationsVueBridge'));
assert(main.includes('upcomingNotificationsOwner'));
assert(main.includes('window.TVTrackerUpcomingNotificationsVueBridge?.attachVueOwner(upcomingNotificationsOwner)'));
assert(main.includes("model.surface === 'upcoming' ? 'show-list' : 'notifications-content'"));

assert(!bridge.includes('legacyRenderUpcoming'));
assert(!bridge.includes('rememberModel'));
assert(!bridge.includes('innerHTML || ""'));
assert(bridge.includes('function buildUpcomingModel(startBackgroundRefresh=true)'));
assert(bridge.includes('global.getUpcomingShows()'));
assert(bridge.includes('global.prepareUpcomingDisplayItems(groupItems)'));
assert(bridge.includes('global.isEpisodeLoggable(episode,show,episode.season_number)'));
assert(bridge.includes('global.refreshUpcomingDataInBackground()'));
assert(bridge.includes('renderWithVue("upcoming",model)'));
assert(bridge.includes('renderWithVue("notifications",buildNotificationsModel'));
assert(bridge.includes('/api/notifications/read-all'));
assert(bridge.includes('/api/notifications/status'));
assert(bridge.includes('/api/notifications/'));
assert(bridge.includes('attachUpcomingInteractions()'));
assert(bridge.includes('attachNotificationInteractions()'));
assert(bridge.includes('ownership:"vue-dom"'));
assert(!bridge.includes('history.pushState'));
assert(!bridge.includes('history.replaceState'));
assert(!bridge.includes('addEventListener("popstate"'));

assert(!ui.includes('async function renderUpcoming(startBackgroundRefresh=true)'));
assert(!ui.includes('function renderUpcomingBatchEpisodesHTML(show,episodes)'));
assert(!ui.includes('function renderUpcomingSkeletonHTML()'));
assert(notifications.includes('async function renderNotificationsPage()'));
assert(notifications.includes('mountUpcomingBell'));
assert(router.includes('if(path === "/app/upcoming")'));
assert(router.includes('if(path === "/app/notifications")'));
assert(!router.includes('list.innerHTML = renderUpcomingSkeletonHTML()'));

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/upcoming-notifications-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0 && bridgeIndex > appIndex, 'bridge must load after app.js establishes schedule truth helpers');
assert(routerIndex > bridgeIndex, 'bridge must be installed before startup routing applies the initial page');

console.log('Upcoming + Notifications Vue-native composition contract passed.');
