const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/tracker-lists-state-bridge.js', 'utf8');
const contracts = fs.readFileSync('frontend/src/tracker-lists/contracts.ts', 'utf8');
const typedAdapter = fs.readFileSync('frontend/src/tracker-lists/legacyTrackerListsState.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md', 'utf8');

assert(bridgeSource.includes('TVTrackerTrackerListsStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(!bridgeSource.includes('document.'), 'Tracker Lists state bridge must remain DOM-free');
assert(!bridgeSource.includes('fetch('), 'Tracker Lists state bridge must remain network-free');
assert(!bridgeSource.includes('saveData('), 'Tracker Lists state bridge must not persist tracker data');
assert(!bridgeSource.includes('history.pushState'), 'Tracker Lists state bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Tracker Lists state bridge must not own browser History writes');

const shows = {
    '42':{
        tmdb_id:42,
        title:'Watching Show',
        status:'watching',
        poster_path:'/watching.jpg',
        first_air_date:'2025-05-06',
        vote_average:'8.4'
    },
    '84':{
        tmdb_id:'84',
        title:'Completed Show',
        status:'finished',
        poster_path:'/completed.jpg',
        first_air_date:'2020-01-02',
        vote_average:7.2
    }
};
const movies = {
    '101':{
        id:101,
        title:'Planned Movie',
        poster_path:'/movie.jpg',
        release_date:'2026-02-03',
        vote_average:'6.8',
        plan:true,
        watched:false,
        favorite:true
    }
};

const context = {
    window:{
        DATA:{
            shows,
            movies,
            profile:{
                favorite_shows:['42','42','999'],
                favorite_movies:[{id:'101',title:'Planned Movie'}]
            }
        },
        activeFilter:'finished',
        librarySearchQuery:'  example query  ',
        libraryGenreFilter:'Drama',
        libraryNetworkFilter:'HBO',
        libraryYearFilter:'2025',
        librarySortMode:'rating-desc'
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerTrackerListsStateBridge;
assert(bridge, 'read-only Tracker Lists bridge should be exposed on window');
assert.strictEqual(bridge.ownership, 'legacy-read-only');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['ownership','snapshot','viewModel']);
assert.strictEqual(typeof bridge.viewModel, 'function', 'native Watchlist composition must be exposed as a read-only structured view-model function');

const snapshot = bridge.snapshot();
assert.strictEqual(snapshot.page, 'shows');
assert.strictEqual(snapshot.tab, 'watchlist');
assert.strictEqual(snapshot.activeFilter, 'finished');
assert.strictEqual(snapshot.routeSlug, 'completed');
assert.strictEqual(snapshot.query, 'example query');
assert.strictEqual(snapshot.genre, 'Drama');
assert.strictEqual(snapshot.network, 'HBO');
assert.strictEqual(snapshot.year, '2025');
assert.strictEqual(snapshot.sort, 'rating-desc');
assert.strictEqual(snapshot.shows.length, 2);
assert.strictEqual(snapshot.movies.length, 1);
assert.strictEqual(snapshot.shows[0].id, '42');
assert.strictEqual(snapshot.shows[0].favorite, true);
assert.strictEqual(snapshot.shows[1].status, 'finished');
assert.strictEqual(snapshot.movies[0].id, '101');
assert.strictEqual(snapshot.movies[0].plan, true);
assert.strictEqual(snapshot.movies[0].watched, false);
assert.strictEqual(snapshot.movies[0].favorite, true);
assert.deepStrictEqual(Array.from(snapshot.favoriteShowIds), ['42']);
assert.deepStrictEqual(Array.from(snapshot.favoriteMovieIds), ['101']);
assert(Object.isFrozen(snapshot), 'Tracker Lists snapshot must be immutable');
assert(Object.isFrozen(snapshot.shows), 'show collection must be immutable');
assert(Object.isFrozen(snapshot.movies), 'movie collection must be immutable');
assert(Object.isFrozen(snapshot.shows[0]), 'show summaries must be immutable');
assert(Object.isFrozen(snapshot.movies[0]), 'movie summaries must be immutable');
assert(Object.isFrozen(snapshot.favoriteShowIds), 'favorite show IDs must be immutable');
assert(Object.isFrozen(snapshot.favoriteMovieIds), 'favorite movie IDs must be immutable');

shows['42'].title = 'Changed Show';
movies['101'].title = 'Changed Movie';
context.window.DATA.profile.favorite_shows = [];
context.window.activeFilter = 'unexpected';
context.window.librarySortMode = 'unexpected';
assert.strictEqual(snapshot.shows[0].title, 'Watching Show', 'show snapshot must be detached from legacy state');
assert.strictEqual(snapshot.movies[0].title, 'Planned Movie', 'movie snapshot must be detached from legacy state');
assert.deepStrictEqual(Array.from(snapshot.favoriteShowIds), ['42'], 'favorites snapshot must be detached');

const normalized = bridge.snapshot();
assert.strictEqual(normalized.activeFilter, 'watching', 'invalid status must normalize to watching');
assert.strictEqual(normalized.routeSlug, 'watching');
assert.strictEqual(normalized.sort, 'default', 'invalid sort must normalize to default');

context.window.activeFilter = 'plan';
assert.strictEqual(bridge.snapshot().routeSlug, 'plan-to-watch');
context.window.activeFilter = 'dropped';
assert.strictEqual(bridge.snapshot().routeSlug, 'dropped');

assert(contracts.includes('export type TrackerListFilter = "watching" | "paused" | "finished" | "plan" | "dropped"'));
assert(contracts.includes('export type TrackerListRouteSlug = "watching" | "paused" | "completed" | "plan-to-watch" | "dropped"'));
assert(contracts.includes('"recently-watched"'));
assert(contracts.includes('"rating-desc"'));
assert(contracts.includes('export interface TrackerListsState'));
assert(contracts.includes('readonly movies: readonly TrackerListMovieSummary[]'));

assert(typedAdapter.includes('TVTrackerTrackerListsStateBridge?: LegacyTrackerListsStateBridge'));
assert(typedAdapter.includes('export function hasLegacyTrackerListsStateBridge(): boolean'));
assert(typedAdapter.includes('export function readLegacyTrackerListsSnapshot(): TrackerListsState | null'));
assert(!typedAdapter.includes('document.'), 'typed Tracker Lists adapter must remain DOM-free');
assert(!typedAdapter.includes('fetch('), 'typed Tracker Lists adapter must remain network-free');
assert(!typedAdapter.includes('history.'), 'typed Tracker Lists adapter must not own navigation');
assert(!typedAdapter.includes('createApp('), 'typed Tracker Lists adapter must not mount Vue');
assert(!main.includes('./tracker-lists/legacyTrackerListsState'), 'Tracker Lists adapter remains inactive because the live owner consumes the structured runtime bridge directly');

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/tracker-lists-state-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0, 'app.js must remain loaded');
assert(bridgeIndex > appIndex, 'Tracker Lists bridge must load after authoritative legacy tracker state exists');
assert(routerIndex > bridgeIndex, 'Tracker Lists bridge must load before routing/startup consumes state');

assert(architecture.includes('`static/js/app.js` remains authoritative for `DATA.shows`, tracker mutations, durable save orchestration, list/filter state, and persistence semantics.'));
assert(architecture.includes('`app-router.js` remains the sole History API owner.'));
assert(architecture.includes('`static/js/tracker-lists-state-bridge.js` is a read-only boundary.'));
assert(architecture.includes('legacy Watchlist HTML composition is no longer part of the runtime path.'));

console.log('Frontend modernization Tracker Lists read-only state bridge checks passed.');
