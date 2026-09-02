const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/history-state-bridge.js','utf8');
const contracts = fs.readFileSync('frontend/src/history/contracts.ts','utf8');
const typedAdapter = fs.readFileSync('frontend/src/history/legacyHistoryState.ts','utf8');
const main = fs.readFileSync('frontend/src/main.ts','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_HISTORY.md','utf8');

assert(bridgeSource.includes('TVTrackerHistoryStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(bridgeSource.includes('function viewModel('));
assert(!bridgeSource.includes('document.'), 'History state bridge must remain DOM-free');
assert(!bridgeSource.includes('fetch('), 'History state bridge must remain network-free');
assert(!bridgeSource.includes('saveData('), 'History state bridge must not persist tracker data');
assert(!bridgeSource.includes('history.pushState'), 'History state bridge must not own navigation');
assert(!bridgeSource.includes('history.replaceState'), 'History state bridge must not own navigation');

const history = [
    {tmdb_id:42,title:'Older Show',season:1,episode:2,episode_title:'Second',watched_at:'2026-08-29T10:00:00Z',air_date:'2026-08-20',episode_still_path:'/episode.jpg'},
    {media_type:'movie',movie_id:'101',title:'Movie',watched_at:'2026-08-30T12:00:00Z',release_date:'2025-05-06',backdrop_path:'/movie.jpg'},
    {tmdb_id:'42',title:'Newest Show',season:2,episode:3,episode_title:'Third',watched_at:'2026-08-31T08:00:00Z',air_date:'2026-08-30'},
    {tmdb_id:'42',title:'Future Show',season:9,episode:9,episode_title:'Future',watched_at:'2026-08-31T09:00:00Z',air_date:'2026-09-10'}
];
const originalHistory = JSON.stringify(history);
const context = {
    window:{
        DATA:{history,shows:{'42':{title:'Example Show'}}},
        isMovieHistoryEntry(entry){ return String(entry && entry.media_type || '').toLowerCase() === 'movie' || Boolean(entry && entry.movie_id); },
        isEpisodeAired(airDate){ return airDate <= '2026-08-31'; },
        groupHistoryByDate(entries){ return [{label:'Recent',entries}]; },
        formatHistoryRelative(){ return 'Now'; },
        trackerImageURL(path){ return path ? 'https://images.example' + path : ''; },
        getMovieTrackingRecord(){ return {}; },
        getMovieDetailRoute(id){ return '/app/movie/' + id; },
        getEpisodeData(){ return {}; },
        getEpisodeDetailRoute(showId,season,episode){ return `/app/tv/${showId}/season/${season}/episode/${episode}`; }
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource,context);

const bridge = context.window.TVTrackerHistoryStateBridge;
assert(bridge,'read-only History bridge should be exposed on window');
assert.strictEqual(bridge.ownership,'legacy-read-only');
assert.deepStrictEqual(Object.keys(bridge).sort(),['ownership','snapshot','viewModel']);

const snapshot = bridge.snapshot();
assert.strictEqual(snapshot.page,'shows');
assert.strictEqual(snapshot.tab,'history');
assert.strictEqual(snapshot.entries.length,3,'future unaired episode should be suppressed');
assert.strictEqual(snapshot.entries[0].kind,'episode');
assert.strictEqual(snapshot.entries[0].showId,'42');
assert.strictEqual(snapshot.entries[0].season,2);
assert.strictEqual(snapshot.entries[0].episode,3);
assert.strictEqual(snapshot.entries[1].kind,'movie');
assert.strictEqual(snapshot.entries[1].movieId,'101');
assert.strictEqual(snapshot.entries[1].year,'2025');
assert.strictEqual(snapshot.entries[2].episodeTitle,'Second');
assert(Object.isFrozen(snapshot));
assert(Object.isFrozen(snapshot.entries));
assert(Object.isFrozen(snapshot.entries[0]));
assert.strictEqual(JSON.stringify(history),originalHistory,'snapshot must not mutate authoritative history');

const model = bridge.viewModel(2);
assert.strictEqual(model.surface,'history');
assert.strictEqual(model.state,'ready');
assert.strictEqual(model.groups.length,1);
assert.strictEqual(model.groups[0].entries.length,2);
assert.strictEqual(model.hasMore,true);
assert.strictEqual(model.groups[0].entries[0].kind,'episode');
assert.strictEqual(model.groups[0].entries[1].kind,'movie');
assert.strictEqual(model.failure,null);
assert(Object.isFrozen(model));
assert(Object.isFrozen(model.groups));
assert(Object.isFrozen(model.groups[0]));
assert(Object.isFrozen(model.groups[0].entries));
assert.strictEqual(JSON.stringify(history),originalHistory,'view model must not mutate authoritative history');

history[0].title = 'Changed after snapshot';
assert.strictEqual(snapshot.entries[2].title,'Older Show','History snapshot must be detached from authoritative state');

assert(contracts.includes('export type HistoryEntry = HistoryEpisodeEntry | HistoryMovieEntry'));
assert(contracts.includes('export interface HistoryState'));
assert(contracts.includes('export interface HistoryViewModel'));
assert(contracts.includes('export type HistorySurfaceState = "loading" | "ready" | "empty" | "error"'));
assert(contracts.includes('export interface HistoryVueBridge'));
assert(typedAdapter.includes('TVTrackerHistoryStateBridge?: LegacyHistoryStateBridge'));
assert(typedAdapter.includes('export function readLegacyHistorySnapshot(): HistoryState | null'));
assert(!typedAdapter.includes('document.'));
assert(!typedAdapter.includes('fetch('));
assert(!typedAdapter.includes('createApp('));
assert(!main.includes('./history/legacyHistoryState'),'read-only adapter stays separate from live renderer');

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/history-state-bridge.js'");
const vueIndex = template.indexOf("filename='js/history-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(!template.includes("filename='js/history-activity.js'"),'removed legacy History placeholder must not be loaded');
assert(appIndex >= 0,'authoritative tracker state script must be loaded');
assert(bridgeIndex > appIndex,'structured History state must load after its legacy data/helper dependencies');
assert(vueIndex > bridgeIndex);
assert(routerIndex > vueIndex);

assert(architecture.includes('`DATA.history` remains authoritative'));
assert(architecture.includes('`static/js/history-state-bridge.js` owns the read-only structured History snapshot and view-model projection'));
assert(architecture.includes('`app-router.js` remains the sole browser History API owner'));
assert(architecture.includes('Watched/episode tracking remains separate domain ownership'));

console.log('Frontend modernization History read-only state/view-model checks passed.');
