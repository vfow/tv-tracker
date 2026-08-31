const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const router = fs.readFileSync('static/js/app-router.js','utf8');
const runtime = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
const stateBridgeSource = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md','utf8');

const statusCases = [
    {filter:'watching',slug:'watching'},
    {filter:'paused',slug:'paused'},
    {filter:'finished',slug:'completed'},
    {filter:'plan',slug:'plan-to-watch'},
    {filter:'dropped',slug:'dropped'}
];

const compactRouter = router.replace(/\s+/g,'');
for(const item of statusCases){
    assert(
        compactRouter.includes(`"${item.slug}":"${item.filter}"`),
        `router must preserve ${item.slug} -> ${item.filter}`
    );
    assert(
        compactRouter.includes(`${item.filter}:"${item.slug}"`) || compactRouter.includes(`"${item.filter}":"${item.slug}"`),
        `router must preserve ${item.filter} -> ${item.slug}`
    );
}
assert(router.includes('/^\\/app\\/list\\/(watching|paused|completed|plan-to-watch|dropped)$/'));
assert(router.includes('const query = String(params.get("q") || "").trim()'));
assert(router.includes('const genre = String(params.get("genre") || "").trim()'));
assert(router.includes('const network = String(params.get("network") || "").trim()'));
assert(router.includes('const rawYear = String(params.get("year") || "").trim()'));
assert(router.includes('const rawSort = String(params.get("sort") || "").trim().toLowerCase()'));

assert(ui.includes('function getWatchlistShowsForCurrentView()'));
assert(ui.includes('.filter(show=>filterShow(show))'));
assert(ui.includes('.filter(show=>libraryShowMatchesAdvancedFilters(show))'));
assert(ui.includes('librarySortMode'));
assert(ui.includes('function renderWatchlist()'));
assert(ui.includes('function refreshWatchlistShows(showIds)'));

// The read-only bridge must normalize every canonical list status to the same
// route vocabulary used by the router without gaining mutation ownership.
const stateContext = {
    window:{
        DATA:{shows:{},movies:{},profile:{favorite_shows:[],favorite_movies:[]}},
        activeFilter:'watching',
        librarySearchQuery:'needle',
        libraryGenreFilter:'Drama',
        libraryNetworkFilter:'HBO',
        libraryYearFilter:'2025',
        librarySortMode:'recently-watched'
    }
};
vm.createContext(stateContext);
vm.runInContext(stateBridgeSource,stateContext);
const stateBridge = stateContext.window.TVTrackerTrackerListsStateBridge;
for(const item of statusCases){
    stateContext.window.activeFilter = item.filter;
    const snapshot = stateBridge.snapshot();
    assert.strictEqual(snapshot.activeFilter,item.filter);
    assert.strictEqual(snapshot.routeSlug,item.slug);
    assert.strictEqual(snapshot.query,'needle');
    assert.strictEqual(snapshot.genre,'Drama');
    assert.strictEqual(snapshot.network,'HBO');
    assert.strictEqual(snapshot.year,'2025');
    assert.strictEqual(snapshot.sort,'recently-watched');
}
assert.strictEqual(stateBridge.ownership,'legacy-read-only');
assert(!stateBridgeSource.includes('saveData('));
assert(!stateBridgeSource.includes('history.pushState'));
assert(!stateBridgeSource.includes('history.replaceState'));
assert(!stateBridgeSource.includes('document.'));

// Exercise the real Watchlist Vue handoff for every tracker status. The legacy
// renderer is still the composition owner, so Vue must receive its exact HTML
// for each active list without changing status/query/filter/sort state.
let vueModel = null;
let renderCount = 0;
const root = {
    innerHTML:'',
    dataset:{},
    querySelectorAll(selector){
        assert.strictEqual(selector,'.watchlist-action');
        return [];
    },
    querySelector(){ return null; }
};
const runtimeContext = {
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
        activeFilter:'watching',
        librarySearchQuery:'needle',
        libraryGenreFilter:'Drama',
        libraryNetworkFilter:'HBO',
        libraryYearFilter:'2025',
        librarySortMode:'recently-watched',
        document:{
            getElementById(id){ return id === 'show-list' ? root : null; },
            querySelectorAll(){ return []; },
            querySelector(){ return null; }
        },
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        renderWatchlist(){
            renderCount += 1;
            root.innerHTML = [
                '<section class="watchlist-parity"',
                ` data-filter="${this.activeFilter}"`,
                ` data-query="${this.librarySearchQuery}"`,
                ` data-genre="${this.libraryGenreFilter}"`,
                ` data-network="${this.libraryNetworkFilter}"`,
                ` data-year="${this.libraryYearFilter}"`,
                ` data-sort="${this.librarySortMode}"></section>`
            ].join('');
        },
        renderUpcoming(){},
        TVTrackerNotifications:null,
        setTimeout,
        PointerEvent:function PointerEvent(){}
    }
};
vm.createContext(runtimeContext);
vm.runInContext(runtime,runtimeContext);
const sharedBridge = runtimeContext.window.TVTrackerUpcomingNotificationsVueBridge;
const trackerBridge = runtimeContext.window.TVTrackerTrackerListsVueBridge;
sharedBridge.attachVueOwner({
    render(model){
        vueModel = model;
        root.innerHTML = model.html;
    },
    unmount(){}
});

(async()=>{
    for(const item of statusCases){
        runtimeContext.window.activeFilter = item.filter;
        runtimeContext.window.location.pathname = `/app/list/${item.slug}`;
        const before = renderCount;
        const rendered = await runtimeContext.window.renderWatchlist();
        assert.strictEqual(rendered,true,`${item.slug} should hand off to Vue`);
        assert.strictEqual(renderCount,before + 1,`${item.slug} legacy composition should run once`);
        assert(vueModel,`${item.slug} should produce a Vue model`);
        assert.strictEqual(vueModel.surface,'upcoming','shared generic show-list owner remains the mount vehicle');
        assert(vueModel.html.includes(`data-filter="${item.filter}"`));
        assert(vueModel.html.includes('data-query="needle"'));
        assert(vueModel.html.includes('data-genre="Drama"'));
        assert(vueModel.html.includes('data-network="HBO"'));
        assert(vueModel.html.includes('data-year="2025"'));
        assert(vueModel.html.includes('data-sort="recently-watched"'));
        assert.strictEqual(root.dataset.tvtrackerTrackerListsOwner,'vue-watchlist');
    }

    const beforeRefresh = renderCount;
    await runtimeContext.window.refreshWatchlistShows(['42']);
    assert.strictEqual(renderCount,beforeRefresh + 1,'partial legacy refresh remains a full Vue-owned rerender');

    assert.strictEqual(trackerBridge.ownership,'vue-dom');
    assert(!runtime.includes('global.history.pushState'));
    assert(!runtime.includes('global.history.replaceState'));

    assert(architecture.includes('Watching, Paused, Completed, Plan To Watch, and Dropped'));
    assert(architecture.includes('The Tracker Lists state bridge is read-only'));
    assert(architecture.includes('History and watched/episode tracking remain separate later roadmap phases'));

    console.log('Tracker Lists five-status Vue parity contract passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
