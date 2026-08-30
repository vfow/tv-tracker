const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/media-details-state-bridge.js', 'utf8');
const contracts = fs.readFileSync('frontend/src/media-details/contracts.ts', 'utf8');
const typedAdapter = fs.readFileSync('frontend/src/media-details/legacyMediaDetailsState.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_MEDIA_DETAILS.md', 'utf8');

assert(bridgeSource.includes('TVTrackerMediaDetailsStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(!bridgeSource.includes('document.'), 'Media Details state bridge must remain DOM-free');
assert(!bridgeSource.includes('fetch('), 'Media Details state bridge must remain network-free');
assert(!bridgeSource.includes('history.pushState'), 'Media Details state bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Media Details state bridge must not own browser History writes');

const trackedShow = {
    tmdb_id:42,
    title:'Example Show',
    original_name:'Original Example',
    overview:'Show summary',
    poster_path:'/show-poster.jpg',
    backdrop_path:'/show-backdrop.jpg',
    first_air_date:'2025-05-06',
    vote_average:8.4,
    adult:false
};
const movie = {
    id:84,
    title:'Example Movie',
    original_title:'Original Movie',
    overview:'Movie summary',
    poster_path:'/movie-poster.jpg',
    backdrop_path:'/movie-backdrop.jpg',
    release_date:'2026-02-03',
    vote_average:'7.2',
    adult:true
};

const context = {
    window:{
        activePage:'show-detail',
        DATA:{shows:{'42':trackedShow}},
        selectedShowId:'42',
        showDetailPreview:null,
        activeShowDetailsTabs:{'42':'Episodes'},
        activeShowInfoTabs:{'42':'Crew'},
        selectedMovieId:'84',
        moviePageState:{movieId:'84',routeSlug:'example-movie',loading:false,error:'',movie},
        activeMovieDetailsTab:'Releases',
        activeMovieReleaseSort:'country'
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerMediaDetailsStateBridge;
assert(bridge, 'read-only Media Details bridge should be exposed on window');
assert.strictEqual(bridge.ownership, 'legacy-read-only');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['ownership','snapshot']);

const showSnapshot = bridge.snapshot('show');
assert.strictEqual(showSnapshot.page, 'show-detail');
assert.strictEqual(showSnapshot.selectedId, '42');
assert.strictEqual(showSnapshot.preview, false);
assert.strictEqual(showSnapshot.activeDetailsTab, 'Episodes');
assert.strictEqual(showSnapshot.activeInfoTab, 'Crew');
assert.strictEqual(showSnapshot.entity.id, '42');
assert.strictEqual(showSnapshot.entity.media, 'show');
assert.strictEqual(showSnapshot.entity.title, 'Example Show');
assert.strictEqual(showSnapshot.entity.originalTitle, 'Original Example');
assert.strictEqual(showSnapshot.entity.releaseDate, '2025-05-06');
assert.strictEqual(showSnapshot.entity.voteAverage, 8.4);
assert.strictEqual(showSnapshot.entity.adult, false);
assert(Object.isFrozen(showSnapshot), 'show snapshot must be immutable');
assert(Object.isFrozen(showSnapshot.entity), 'show entity snapshot must be immutable');

trackedShow.title = 'Changed';
context.window.activeShowDetailsTabs['42'] = 'Info';
assert.strictEqual(showSnapshot.entity.title, 'Example Show', 'show snapshot must be detached from legacy state');
assert.strictEqual(showSnapshot.activeDetailsTab, 'Episodes', 'show tab snapshot must be detached');

context.window.DATA.shows = {};
context.window.showDetailPreview = {
    id:'99',
    name:'Preview Show',
    original_name:'Preview Original',
    first_air_date:'2024-01-01',
    vote_average:'9.1'
};
context.window.selectedShowId = '99';
context.window.activeShowDetailsTabs = {'99':'unexpected'};
context.window.activeShowInfoTabs = {'99':'unexpected'};
const previewSnapshot = bridge.snapshot('show');
assert.strictEqual(previewSnapshot.preview, true);
assert.strictEqual(previewSnapshot.entity.title, 'Preview Show');
assert.strictEqual(previewSnapshot.activeDetailsTab, 'Info', 'invalid show detail tab must normalize');
assert.strictEqual(previewSnapshot.activeInfoTab, 'Cast', 'invalid show info tab must normalize');

const movieSnapshot = bridge.snapshot('movie');
assert.strictEqual(movieSnapshot.page, 'movie-detail');
assert.strictEqual(movieSnapshot.selectedId, '84');
assert.strictEqual(movieSnapshot.routeSlug, 'example-movie');
assert.strictEqual(movieSnapshot.loading, false);
assert.strictEqual(movieSnapshot.error, '');
assert.strictEqual(movieSnapshot.activeDetailsTab, 'Releases');
assert.strictEqual(movieSnapshot.releaseSort, 'country');
assert.strictEqual(movieSnapshot.entity.id, '84');
assert.strictEqual(movieSnapshot.entity.media, 'movie');
assert.strictEqual(movieSnapshot.entity.title, 'Example Movie');
assert.strictEqual(movieSnapshot.entity.originalTitle, 'Original Movie');
assert.strictEqual(movieSnapshot.entity.releaseDate, '2026-02-03');
assert.strictEqual(movieSnapshot.entity.voteAverage, 7.2);
assert.strictEqual(movieSnapshot.entity.adult, true);
assert(Object.isFrozen(movieSnapshot), 'movie snapshot must be immutable');
assert(Object.isFrozen(movieSnapshot.entity), 'movie entity snapshot must be immutable');

context.window.moviePageState.error = 503;
context.window.activeMovieDetailsTab = 'unexpected';
context.window.activeMovieReleaseSort = 'unexpected';
const normalizedMovie = bridge.snapshot('movie');
assert.strictEqual(normalizedMovie.error, '503');
assert.strictEqual(normalizedMovie.activeDetailsTab, 'Info', 'invalid movie tab must normalize');
assert.strictEqual(normalizedMovie.releaseSort, 'date', 'invalid movie release sort must normalize');

context.window.activePage = 'movie-detail';
assert.strictEqual(bridge.snapshot().page, 'movie-detail', 'active-page snapshot should select movie details');
context.window.activePage = 'show-detail';
assert.strictEqual(bridge.snapshot().page, 'show-detail', 'active-page snapshot should select show details');

assert(contracts.includes('export type ShowDetailsTab = "Info" | "Episodes"'));
assert(contracts.includes('export type ShowInfoTab = "Cast" | "Crew" | "Details" | "Genres" | "Releases"'));
assert(contracts.includes('export type MovieDetailsTab = "Info" | "Cast" | "Crew" | "Details" | "Genres" | "Releases"'));
assert(contracts.includes('export type MovieReleaseSort = "date" | "country"'));
assert(contracts.includes('export type MediaDetailsState = ShowDetailsState | MovieDetailsState'));

assert(typedAdapter.includes('TVTrackerMediaDetailsStateBridge?: LegacyMediaDetailsStateBridge'));
assert(typedAdapter.includes('export function hasLegacyMediaDetailsStateBridge(): boolean'));
assert(typedAdapter.includes('export function readLegacyMediaDetailsSnapshot(kind?: "show" | "movie"): MediaDetailsState | null'));
assert(!typedAdapter.includes('document.'), 'typed Media Details adapter must remain DOM-free');
assert(!typedAdapter.includes('fetch('), 'typed Media Details adapter must remain network-free');
assert(!typedAdapter.includes('history.'), 'typed Media Details adapter must not own navigation');
assert(!typedAdapter.includes('createApp('), 'typed Media Details adapter must not mount Vue');
assert(!main.includes('./media-details/legacyMediaDetailsState'), 'Media Details adapter remains inactive before Vue DOM ownership');

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/media-details-state-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0, 'app.js must remain loaded');
assert(bridgeIndex > appIndex, 'Media Details bridge must load after legacy Media Details state exists');
assert(routerIndex > bridgeIndex, 'Media Details bridge must load before routing/startup can consume state');

assert(architecture.includes('Legacy `app.js` remains authoritative for Media Details state'));
assert(architecture.includes('`app-router.js` remains the sole History API owner'));
assert(architecture.includes('The Media Details state bridge is read-only'));

console.log('Frontend modernization Media Details read-only state bridge checks passed.');
