const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const runtime = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js', 'utf8');
const stateBridge = fs.readFileSync('static/js/tracker-lists-state-bridge.js', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const router = fs.readFileSync('static/js/app-router.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md', 'utf8');

assert(runtime.includes('const legacyRenderWatchlist = typeof global.renderWatchlist === "function" ? global.renderWatchlist : null'));
assert(runtime.includes('async function renderWatchlist()'));
assert(runtime.includes('async function refreshWatchlistShows()'));
assert(runtime.includes('async function renderShowListHTML(html)'));
assert(runtime.includes('global.TVTrackerTrackerListsVueBridge = trackerListsBridge'));
assert(runtime.includes('global.renderWatchlist = renderWatchlist'));
assert(runtime.includes('global.refreshWatchlistShows = refreshWatchlistShows'));
assert(runtime.includes('root.dataset.tvtrackerTrackerListsOwner = "vue-watchlist"'));
assert(runtime.includes('data-tvtracker-tracker-lists-owner'));
assert(runtime.includes('root.querySelectorAll(".watchlist-action")'));
assert(runtime.includes('await global.markNextEpisode(showId)'));
assert(runtime.includes('await global.updateShowStatus(showId,"watching")'));

const watchlistStart = runtime.indexOf('function attachWatchlistInteractions()');
const watchlistEnd = runtime.indexOf('async function renderUpcoming(', watchlistStart);
assert(watchlistStart >= 0 && watchlistEnd > watchlistStart, 'Watchlist bridge slice must be present');
const watchlistSlice = runtime.slice(watchlistStart, watchlistEnd);
assert(!watchlistSlice.includes('saveData('), 'Watchlist DOM handoff must not own durable persistence');
assert(!watchlistSlice.includes('history.pushState'), 'Watchlist DOM handoff must not own History writes');
assert(!watchlistSlice.includes('history.replaceState'), 'Watchlist DOM handoff must not own History writes');
assert(!watchlistSlice.includes('addEventListener("popstate"'), 'Watchlist DOM handoff must not own Back/Forward');
assert(!watchlistSlice.includes('/api/'), 'Watchlist DOM handoff must not introduce an API path');

assert(stateBridge.includes('ownership:"legacy-read-only"'));
assert(!stateBridge.includes('saveData('));
assert(!stateBridge.includes('document.'));

// Legacy owners still compose established markup/state in this bounded slice.
assert(ui.includes('function createWatchlistCard(show,options={})'));
assert(ui.includes('function getWatchlistShowsForCurrentView()'));
assert(ui.includes('function renderWatchlist()'));
assert(ui.includes('function refreshWatchlistShows(showIds)'));
assert(ui.includes('data-watchlist-action="${escapeHTML(action.action)}"'));
assert(router.includes('"finished":"completed"') || router.includes('finished:"completed"') || router.includes('completed'));

// The already-loaded generic Vue HTML shell is reused; no new bundle entry or
// extra script is needed for this bounded final-DOM handoff.
const appIndex = template.indexOf("filename='js/app.js'");
const stateIndex = template.indexOf("filename='js/tracker-lists-state-bridge.js'");
const sharedVueBridgeIndex = template.indexOf("filename='js/upcoming-notifications-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0 && stateIndex > appIndex, 'tracker state bridge must load after app.js');
assert(sharedVueBridgeIndex > stateIndex, 'shared Vue bridge must load after tracker state characterization');
assert(routerIndex > sharedVueBridgeIndex, 'Watchlist Vue ownership must be installed before startup routing');
assert(!template.includes("filename='js/tracker-lists-vue-bridge.js'"), 'no redundant standalone Watchlist runtime should be loaded');

assert(architecture.includes('Vue is therefore the final runtime DOM owner for Watchlist after the handoff'));
assert(architecture.includes('Legacy `app.js` remains authoritative for tracker data'));
assert(architecture.includes('`app-router.js` remains the sole History API owner'));
assert(architecture.includes('History and watched/episode tracking remain separate later roadmap phases'));

// Execute the bounded handoff with a fake root. The legacy renderer composes
// markup first; the attached Vue owner receives that exact markup afterward.
let legacyRenderCount = 0;
let vueModel = null;
const root = {
    innerHTML:'',
    dataset:{},
    querySelectorAll(selector){
        assert.strictEqual(selector,'.watchlist-action');
        return [];
    },
    querySelector(){ return null; }
};
const context = {
    console,
    URL,
    Promise,
    Object,
    String,
    Number,
    Math,
    Set,
    Map,
    window:{
        document:{
            getElementById(id){ return id === 'show-list' ? root : null; },
            querySelectorAll(){ return []; },
            querySelector(){ return null; }
        },
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        renderWatchlist(){
            legacyRenderCount += 1;
            root.innerHTML = '<article class="watchlist-card" data-show-id="42"><button class="watchlist-action" data-watchlist-action="mark"></button></article>';
        },
        renderUpcoming(){},
        TVTrackerNotifications:null,
        setTimeout,
        PointerEvent:function PointerEvent(){}
    }
};
vm.createContext(context);
vm.runInContext(runtime,context);

const sharedBridge = context.window.TVTrackerUpcomingNotificationsVueBridge;
const trackerBridge = context.window.TVTrackerTrackerListsVueBridge;
assert(sharedBridge && trackerBridge, 'both shared Vue and Tracker Lists bridges must be exposed');
assert.strictEqual(trackerBridge.ownership,'vue-dom');
sharedBridge.attachVueOwner({
    render(model){
        vueModel = model;
        root.innerHTML = model.html;
    },
    unmount(){}
});

(async()=>{
    const rendered = await context.window.renderWatchlist();
    assert.strictEqual(rendered,true);
    assert.strictEqual(legacyRenderCount,1,'legacy Watchlist composition should run exactly once');
    assert(vueModel,'Vue owner should receive a Watchlist model');
    assert.strictEqual(vueModel.surface,'upcoming','generic shared HTML shell remains the bounded mount vehicle');
    assert(vueModel.html.includes('data-show-id="42"'));
    assert.strictEqual(root.dataset.tvtrackerTrackerListsOwner,'vue-watchlist');

    await context.window.refreshWatchlistShows(['42']);
    assert.strictEqual(legacyRenderCount,2,'partial refresh should intentionally become a full bounded rerender');

    console.log('Tracker Lists Watchlist Vue renderer ownership contract passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
