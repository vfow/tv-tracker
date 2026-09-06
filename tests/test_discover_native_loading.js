const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('static/js/discover-vue-bridge.js', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');

function environment() {
    const rendered = [];
    const failures = [];
    const win = {
        location: { pathname: '/app/list/watching' },
        activePage: 'discover',
        shouldShowDiscoverHub: () => true,
        discoverHubState: { loaded: true, loading: false, sections: [], genres: {}, collections: [] },
        TVTrackerClientRuntime: {
            report() {},
            renderSurfaceFailure(details) { failures.push(details); }
        },
        document: { getElementById() { throw new Error('bridge must not compose DOM'); } }
    };
    const context = { window: win, URL, setTimeout, clearTimeout };
    vm.createContext(context);
    vm.runInContext(source, context);
    const owner = { render(model) { rendered.push(model); }, unmount() {} };
    return { win, bridge: win.TVTrackerDiscoverVueBridge, owner, rendered, failures };
}

{
    const env = environment();
    env.bridge.renderLoading();
    env.bridge.attachVueOwner(env.owner);
    assert.strictEqual(env.rendered[0].bodyState, 'loading', 'late assets must preserve a pending stability gate');
    assert(Object.isFrozen(env.rendered[0]));
    env.bridge.render();
    assert.strictEqual(env.rendered.at(-1).bodyState, 'ready');
}

{
    const env = environment();
    env.bridge.render();
    env.win.activePage = 'search';
    env.bridge.attachVueOwner(env.owner);
    assert.strictEqual(env.rendered.length, 0, 'late assets must not replace Search with stale Discover');
    env.bridge.render();
    env.bridge.renderLoading();
    assert.strictEqual(env.rendered.length, 0, 'late render calls must not replace another route');
}

{
    const env = environment();
    env.bridge.renderLoadFailure();
    assert.strictEqual(env.failures.length, 1);
    assert.strictEqual(env.failures[0].rootId, 'search-results');
    env.win.activePage = 'search';
    env.bridge.renderLoadFailure();
    assert.strictEqual(env.failures.length, 1, 'late asset failure must not overwrite another route');
}

for (const name of ['renderDiscoverHubContent', 'renderDiscoverHubSkeleton', 'renderDiscoverSectionGroup',
    'renderDiscoverHubSection', 'renderDiscoverCollectionsSection', 'renderDiscoverGenreCards',
    'renderDiscoverGenreSection', 'renderDiscoverHubCard', 'attachDiscoverHubEvents']) {
    assert(!ui.includes(`function ${name}(`), `${name} must not remain a duplicate renderer`);
}
assert(!source.includes('.innerHTML'), 'Discover bridge must not stage HTML');
assert(!source.includes('discoverGateSkeletonHTML'), 'stability gate must use the existing Vue loading model');
console.log('Discover native loading and route-race checks passed.');
