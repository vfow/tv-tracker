const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/search-state-bridge.js', 'utf8');
const typedAdapter = fs.readFileSync('frontend/src/search-discover/legacySearchState.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

assert(bridgeSource.includes('TVTrackerSearchStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(bridgeSource.includes('snapshot'));
assert(!bridgeSource.includes('document.'), 'Search state bridge must remain DOM-free');
assert(!bridgeSource.includes('fetch('), 'Search state bridge must remain network-free');
assert(!bridgeSource.includes('history.'), 'Search state bridge must not own navigation');
assert(!bridgeSource.includes('renderSearchResults'), 'Search state bridge must not own rendering');

const legacyState = {
    query:'dune',
    media:'movie',
    fadeWatched:true,
    hideWatched:false,
    hidePlan:true,
    hideFavorites:false
};
const context = {window:{searchRouteState:legacyState}};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerSearchStateBridge;
assert(bridge, 'bridge should be exposed on window');
assert.strictEqual(bridge.ownership, 'legacy-read-only');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['ownership','snapshot']);

const snapshot = bridge.snapshot();
assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot)), legacyState);
assert(Object.isFrozen(snapshot), 'Search snapshot must be immutable');
legacyState.query = 'changed-after-snapshot';
legacyState.hideWatched = true;
assert.strictEqual(snapshot.query, 'dune', 'snapshot must be detached from legacy state');
assert.strictEqual(snapshot.hideWatched, false, 'snapshot flags must be detached from legacy state');

context.window.searchRouteState = {query:'person search',media:'person'};
assert.deepStrictEqual(JSON.parse(JSON.stringify(bridge.snapshot())), {
    query:'person search',
    media:'person',
    fadeWatched:false,
    hideWatched:false,
    hidePlan:false,
    hideFavorites:false
});

context.window.searchRouteState = {query:'fallback',media:'unexpected'};
assert.strictEqual(bridge.snapshot().media, 'tv', 'invalid legacy media must normalize to the current TV default');

assert(typedAdapter.includes("import { normalizeSearchMediaType, type SearchRouteState } from './contracts';"));
assert(typedAdapter.includes('TVTrackerSearchStateBridge?: LegacySearchStateBridge'));
assert(typedAdapter.includes('export function hasLegacySearchStateBridge()'));
assert(typedAdapter.includes('export function readLegacySearchStateSnapshot(): SearchRouteState | null'));
assert(!typedAdapter.includes('document.'), 'typed Search bridge adapter must remain DOM-free');
assert(!typedAdapter.includes('fetch('), 'typed Search bridge adapter must remain network-free');
assert(!typedAdapter.includes('history.'), 'typed Search bridge adapter must not own navigation');
assert(!typedAdapter.includes('createApp('), 'typed Search bridge adapter must not mount Vue');
assert(!main.includes("./search-discover/legacySearchState"), 'read-only Search bridge must remain unmounted until renderer parity work');

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/search-state-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0, 'app.js must remain loaded');
assert(bridgeIndex > appIndex, 'Search state bridge must load after legacy Search state exists');
assert(routerIndex > bridgeIndex, 'Search state bridge must load before routing/startup can hand off future Search work');

console.log('Frontend modernization read-only Search state bridge parity checks passed.');
