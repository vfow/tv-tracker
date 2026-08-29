const assert = require('assert');
const fs = require('fs');

const contract = fs.readFileSync('frontend/src/search-discover/contracts.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const router = fs.readFileSync('static/js/app-router.js', 'utf8');
const trending = fs.readFileSync('static/js/trending.js', 'utf8');

assert(contract.includes("export const SEARCH_MEDIA_TYPES = ['tv', 'movie', 'person', 'collection'] as const;"));
assert(contract.includes("export const DISCOVER_MEDIA_TYPES = ['tv', 'movie'] as const;"));
assert(contract.includes('visibleLimit: 21'));
assert(contract.includes('fadeWatched: false'));
assert(contract.includes('hideWatched: false'));
assert(contract.includes('hidePlan: false'));
assert(contract.includes('hideFavorites: false'));

assert(!contract.includes('document.'), 'typed Search/Discover contract must remain DOM-free');
assert(!contract.includes('window.'), 'typed Search/Discover contract must remain runtime-global-free');
assert(!contract.includes('history.'), 'typed Search/Discover contract must not own navigation');
assert(!contract.includes('fetch('), 'typed Search/Discover contract must not own network requests');
assert(!contract.includes('createApp('), 'typed Search/Discover contract must not mount Vue');
assert(!main.includes("./search-discover/contracts"), 'first Search/Discover slice must remain inactive in production runtime');

assert(app.includes('var searchRouteState = {query:"",media:"tv",fadeWatched:false,hideWatched:false,hidePlan:false,hideFavorites:false};'));
assert(app.includes('var discoverSearchState = {query:"",media:"tv",page:1,totalPages:1,visibleLimit:21,loading:false};'));
assert(app.includes('var discoverHubState = {'));
assert(app.includes('async function loadDiscoverHub(force=false)'));
assert(app.includes('function shouldShowDiscoverHub()'));

assert(ui.includes('function renderSearchResults(resultsList)'));
assert(ui.includes('function renderDiscoverHubContent()'));
assert(ui.includes('window.renderDiscoverHub = renderDiscoverHub'));
assert(trending.includes('global.TVTrackerTrending = Object.freeze({'));
assert(router.includes('openSearchPage(params.query || "",{fromRoute:true'));
assert(router.includes('openDiscoverHomePage({fromRoute:true})'));

console.log('Frontend modernization Search/Discover contract and ownership checks passed.');
