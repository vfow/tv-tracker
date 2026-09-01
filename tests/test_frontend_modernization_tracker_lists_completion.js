const assert = require('assert');
const fs = require('fs');

const runtime = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
const stateBridge = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const vue = fs.readFileSync('frontend/src/tracker-lists/TrackerListsSurface.vue','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md','utf8');

assert(!runtime.includes('legacyRenderWatchlist'));
assert(!runtime.includes('function composeWatchlistHTML()'));
assert(!runtime.includes('attachWatchlistInteractions'));
assert(runtime.includes('stateBridge.viewModel()'));
assert(runtime.includes('attachVueOwner:attachTrackerListsVueOwner'));
assert(runtime.includes('actions:trackerListsActions'));
assert(runtime.includes('await global.markNextEpisode(id)'));
assert(runtime.includes('await global.updateShowStatus(id,"watching")'));
assert(stateBridge.includes('function viewModel()'));
assert(stateBridge.includes('getWatchlistShowsForCurrentView'));
assert(!stateBridge.includes('document.'));
assert(!stateBridge.includes('saveData('));
assert(!ui.includes('function createWatchlistCard('));
assert(!ui.includes('function getWatchlistActionConfig('));
assert(!ui.includes('function getWatchlistPosterFallback('));
assert(!ui.includes('function renderWatchlist('));
assert(!ui.includes('function refreshWatchlistShows('));
assert(ui.includes('function getWatchlistShowsForCurrentView()'));
assert(vue.includes('data-tvtracker-tracker-lists-owner="vue-watchlist"'));
assert(vue.includes('class="watchlist-card-link"'));
assert(vue.includes('watchlist-action--${item.action.kind}'));
assert(!vue.includes('v-html'));
assert(architecture.includes('Vue-native structured view model'));
assert(architecture.includes('legacy Watchlist HTML composer has been removed'));

console.log('Tracker Lists native composition ownership contract passed.');
