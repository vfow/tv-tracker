const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/discover-state-bridge.js', 'utf8');
const typedAdapter = fs.readFileSync('frontend/src/search-discover/legacyDiscoverState.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

assert(bridgeSource.includes('TVTrackerDiscoverStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(!bridgeSource.includes('document.'), 'Discover state bridge must remain DOM-free');
assert(!bridgeSource.includes('fetch('), 'Discover state bridge must remain network-free');
assert(!bridgeSource.includes('history.pushState'), 'Discover state bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Discover state bridge must not own browser History writes');

const legacyState = {
    loaded:true,
    loading:false,
    error:'',
    sections:[{
        key:'tv/popular',
        media:'tv',
        category:'popular',
        title:'Popular',
        section:'TV Shows',
        route:'/app/discover/tv/popular',
        items:[{
            id:10,
            media_type:'tv',
            name:'Example',
            title:'',
            poster_path:'/poster.jpg',
            backdrop_path:'/backdrop.jpg',
            overview:'Summary',
            first_air_date:'2026-01-02',
            release_date:'',
            date:'2026-01-02',
            vote_average:8.5,
            popularity:99,
            adult:false
        }],
        shows:[],
        hasMore:true,
        loadingMore:false
    }],
    genres:{
        tv:[{id:18,name:'Drama'}],
        movie:[{id:28,name:'Action'}]
    },
    collections:[{
        id:100,
        name:'Example Collection',
        parts:[{id:101,title:'Part One'}]
    }]
};
const context = {window:{discoverHubState:legacyState}};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerDiscoverStateBridge;
assert(bridge, 'read-only Discover state bridge should be exposed on window');
assert.strictEqual(bridge.ownership, 'legacy-read-only');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['ownership','snapshot']);

const snapshot = bridge.snapshot();
assert.strictEqual(snapshot.loaded, true);
assert.strictEqual(snapshot.sections[0].items[0].name, 'Example');
assert.strictEqual(snapshot.genres.movie[0].name, 'Action');
assert.strictEqual(snapshot.collections[0].parts[0].title, 'Part One');
assert(Object.isFrozen(snapshot), 'Discover hub snapshot must be immutable');
assert(Object.isFrozen(snapshot.sections), 'Discover sections array must be immutable');
assert(Object.isFrozen(snapshot.sections[0]), 'Discover section snapshot must be immutable');
assert(Object.isFrozen(snapshot.sections[0].items), 'Discover section items must be immutable');
assert(Object.isFrozen(snapshot.sections[0].items[0]), 'Discover media items must be immutable');
assert(Object.isFrozen(snapshot.genres), 'Discover genres snapshot must be immutable');
assert(Object.isFrozen(snapshot.genres.tv), 'Discover genre lists must be immutable');
assert(Object.isFrozen(snapshot.collections), 'Discover collections snapshot must be immutable');
assert(Object.isFrozen(snapshot.collections[0]), 'Discover collection snapshot must be immutable');
assert(Object.isFrozen(snapshot.collections[0].parts), 'nested Discover collection arrays must be immutable');
assert(Object.isFrozen(snapshot.collections[0].parts[0]), 'nested Discover collection records must be immutable');

legacyState.loaded = false;
legacyState.sections[0].title = 'Changed';
legacyState.sections[0].items[0].name = 'Changed';
legacyState.genres.tv[0].name = 'Changed';
legacyState.collections[0].parts[0].title = 'Changed';
assert.strictEqual(snapshot.loaded, true, 'snapshot must remain detached from legacy state');
assert.strictEqual(snapshot.sections[0].title, 'Popular', 'section snapshot must remain detached');
assert.strictEqual(snapshot.sections[0].items[0].name, 'Example', 'media item snapshot must remain detached');
assert.strictEqual(snapshot.genres.tv[0].name, 'Drama', 'genre snapshot must remain detached');
assert.strictEqual(snapshot.collections[0].parts[0].title, 'Part One', 'collection snapshot must remain deeply detached');

context.window.discoverHubState = {
    loaded:false,
    loading:true,
    error:7,
    sections:[{media:'unexpected',items:[{id:'12',media_type:'unexpected'}]}],
    genres:{tv:[{id:'18',name:null}]},
    collections:null
};
const normalized = bridge.snapshot();
assert.strictEqual(normalized.error, '7');
assert.strictEqual(normalized.sections[0].media, 'tv', 'invalid Discover media must normalize to TV');
assert.strictEqual(normalized.sections[0].items[0].id, 12);
assert.strictEqual(normalized.sections[0].items[0].media_type, 'tv');
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized.genres.movie)), []);
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalized.collections)), []);

assert(typedAdapter.includes('normalizeDiscoverMediaType'));
assert(typedAdapter.includes('TVTrackerDiscoverStateBridge?: LegacyDiscoverStateBridge'));
assert(typedAdapter.includes('export function hasLegacyDiscoverStateBridge()'));
assert(typedAdapter.includes('export function readLegacyDiscoverHubSnapshot(): DiscoverHubState | null'));
assert(!typedAdapter.includes('document.'), 'typed legacy Discover adapter must remain DOM-free');
assert(!typedAdapter.includes('fetch('), 'typed legacy Discover adapter must remain network-free');
assert(!typedAdapter.includes('history.'), 'typed legacy Discover adapter must not own navigation');
assert(!typedAdapter.includes('createApp('), 'typed legacy Discover adapter must not mount Vue');
assert(!main.includes("./search-discover/legacyDiscoverState"), 'Discover adapter remains read-only and inactive before Vue DOM ownership');

const appIndex = template.indexOf("filename='js/app.js'");
const bridgeIndex = template.indexOf("filename='js/discover-state-bridge.js'");
const searchBridgeIndex = template.indexOf("filename='js/search-state-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0, 'app.js must remain loaded');
assert(bridgeIndex > appIndex, 'Discover bridge must load after legacy Discover state exists');
assert(searchBridgeIndex > appIndex, 'Search bridge must remain after app.js');
assert(routerIndex > bridgeIndex, 'Discover bridge must load before routing/startup can consume state');
assert(routerIndex > searchBridgeIndex, 'Search bridge must remain before routing/startup');

console.log('Frontend modernization Discover read-only state bridge checks passed.');
