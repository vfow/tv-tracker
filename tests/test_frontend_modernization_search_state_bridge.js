const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/search-state-bridge.js', 'utf8');
const typedAdapter = fs.readFileSync('frontend/src/search-discover/legacySearchState.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

assert(bridgeSource.includes('TVTrackerSearchStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(bridgeSource.includes('TVTrackerSearchVueBridge'));
assert(bridgeSource.includes('ownership:"vue"'));
assert(bridgeSource.includes('global.renderSearchResults = render'));
assert(!bridgeSource.includes('history.pushState'), 'Search bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Search bridge must not own browser History writes');

const legacyState = {
    query:'dune',
    media:'movie',
    fadeWatched:true,
    hideWatched:false,
    hidePlan:true,
    hideFavorites:false
};
const context = {
    window:{
        searchRouteState:legacyState,
        location:{pathname:'/app/list/watching',origin:'https://example.test'}
    },
    URL
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const stateBridge = context.window.TVTrackerSearchStateBridge;
assert(stateBridge, 'read-only state bridge should remain exposed on window');
assert.strictEqual(stateBridge.ownership, 'legacy-read-only');
assert.deepStrictEqual(Object.keys(stateBridge).sort(), ['ownership','snapshot']);

const snapshot = stateBridge.snapshot();
assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot)), legacyState);
assert(Object.isFrozen(snapshot), 'Search snapshot must remain immutable');
legacyState.query = 'changed-after-snapshot';
legacyState.hideWatched = true;
assert.strictEqual(snapshot.query, 'dune', 'snapshot must remain detached from legacy state');
assert.strictEqual(snapshot.hideWatched, false, 'snapshot flags must remain detached from legacy state');

context.window.searchRouteState = {query:'person search',media:'person'};
assert.deepStrictEqual(JSON.parse(JSON.stringify(stateBridge.snapshot())), {
    query:'person search',
    media:'person',
    fadeWatched:false,
    hideWatched:false,
    hidePlan:false,
    hideFavorites:false
});

context.window.searchRouteState = {query:'fallback',media:'unexpected'};
assert.strictEqual(stateBridge.snapshot().media, 'tv', 'invalid legacy media must normalize to the current TV default');

const vueBridge = context.window.TVTrackerSearchVueBridge;
assert(vueBridge, 'Vue Search bridge should be exposed on window');
assert.strictEqual(vueBridge.ownership, 'vue');
assert.strictEqual(context.window.renderSearchResults, vueBridge.render, 'Vue bridge must be the runtime Search renderer entry point');
assert.deepStrictEqual(Object.keys(vueBridge.actions).sort(), ['loadMore','openCollection','openMedia','openPerson','setMedia']);

assert(typedAdapter.includes("import { normalizeSearchMediaType, type SearchRouteState } from './contracts';"));
assert(typedAdapter.includes('TVTrackerSearchStateBridge?: LegacySearchStateBridge'));
assert(typedAdapter.includes('export function hasLegacySearchStateBridge()'));
assert(typedAdapter.includes('export function readLegacySearchStateSnapshot(): SearchRouteState | null'));
assert(!typedAdapter.includes('document.'), 'typed legacy Search state adapter must remain DOM-free');
assert(!typedAdapter.includes('fetch('), 'typed legacy Search state adapter must remain network-free');
assert(!typedAdapter.includes('history.'), 'typed legacy Search state adapter must not own navigation');
assert(!typedAdapter.includes('createApp('), 'typed legacy Search state adapter must not mount Vue');
assert(!main.includes("./search-discover/legacySearchState"), 'legacy state adapter remains a read-only characterization boundary');
assert(main.includes("import SearchResults from './search-discover/SearchResults.vue';"));
assert(main.includes('window.TVTrackerSearchVueBridge?.attachVueOwner(searchOwner);'));

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/search-state-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0, 'app.js must remain loaded');
assert(bridgeIndex > appIndex, 'Search bridge must load after legacy Search state/orchestration exists');
assert(routerIndex > bridgeIndex, 'Search bridge must load before routing/startup can invoke Search rendering');

console.log('Frontend modernization Search state + Vue owner bridge checks passed.');
