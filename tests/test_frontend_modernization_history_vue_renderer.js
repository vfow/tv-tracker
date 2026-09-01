const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/history-vue-bridge.js','utf8');
const activitySource = fs.readFileSync('static/js/history-activity.js','utf8');
const stateBridgeSource = fs.readFileSync('static/js/history-state-bridge.js','utf8');
const componentSource = fs.readFileSync('frontend/src/history/HistorySurface.vue','utf8');
const mainSource = fs.readFileSync('frontend/src/main.ts','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_HISTORY.md','utf8');

assert(bridgeSource.includes('const manifestUrl = "/static/vue/manifest.json"'));
assert(bridgeSource.includes('attachVueOwner(owner)'));
assert(bridgeSource.includes('global.getHistoryViewModel'));
assert(bridgeSource.includes('global.renderHistory = renderHistory'));
assert(!bridgeSource.includes('legacyRenderHistory'));
assert(!bridgeSource.includes('cloneNode(false)'));
assert(!bridgeSource.includes('renderShowListHTML'));
assert(activitySource.includes('function getHistoryViewModel()'));
assert(activitySource.includes('function loadMoreHistory()'));
assert(activitySource.includes('historyVisibleLimit += HISTORY_BATCH_SIZE'));
assert(activitySource.includes('return globalThis.renderHistory()'));
assert(!activitySource.includes('document.'),'History data shaping must not write DOM');
assert(!stateBridgeSource.includes('document.'),'read-only History state bridge must remain DOM-free');
assert(componentSource.includes('data-tvtracker-history-owner="vue-history"'));
assert(componentSource.includes('class="history-load-more"'));
assert(componentSource.includes('class="show history-entry-card"'));
assert(!componentSource.includes('v-html'),'History renderer must remain structured Vue composition');
assert(mainSource.includes("import HistorySurface from './history/HistorySurface.vue'"));
assert(mainSource.includes('TVTrackerHistoryVueBridge?.attachVueOwner(historyOwner)'));

(async()=>{
    const model = Object.freeze({
        surface:'history',
        groups:Object.freeze([
            Object.freeze({
                key:'today',
                label:'Today',
                entries:Object.freeze([
                    Object.freeze({
                        key:'episode-42-1-2',
                        kind:'episode',
                        route:'/app/show/example/42/season/1/episode/2',
                        title:'Example Show',
                        detailLine:'S1E02 — Second',
                        imageUrl:'https://image.tmdb.org/example.jpg',
                        placeholder:'📺',
                        relativeTime:'2h ago'
                    })
                ])
            })
        ]),
        emptyState:null,
        hasMore:true
    });
    let renderedModel = null;
    let loadMoreCount = 0;
    let reportCount = 0;

    const window = {
        getHistoryViewModel(){ return model; },
        async loadMoreHistory(){
            loadMoreCount += 1;
            return true;
        },
        TVTrackerClientRuntime:{
            report(){ reportCount += 1; }
        }
    };
    const context = {window,console,Promise,Object,String,Number,Error,URL};
    vm.createContext(context);
    vm.runInContext(bridgeSource,context);

    const bridge = window.TVTrackerHistoryVueBridge;
    assert(bridge,'History Vue bridge should be exposed');
    assert.strictEqual(bridge.ownership,'vue-dom');
    assert.deepStrictEqual(Object.keys(bridge).sort(),['actions','attachVueOwner','ownership','renderHistory']);

    bridge.attachVueOwner({
        render(value){ renderedModel = value; },
        unmount(){}
    });
    const rendered = await window.renderHistory();
    assert.strictEqual(rendered,true);
    assert.strictEqual(renderedModel,model,'Vue owner must receive structured History model unchanged');
    assert.strictEqual(reportCount,0);

    await bridge.actions.loadMore();
    assert.strictEqual(loadMoreCount,1,'Vue Load More action must delegate to authoritative pagination action once');

    const activityIndex = template.indexOf("filename='js/history-activity.js'");
    const stateIndex = template.indexOf("filename='js/history-state-bridge.js'");
    const vueIndex = template.indexOf("filename='js/history-vue-bridge.js'");
    const routerIndex = template.indexOf("filename='js/app-router.js'");
    assert(activityIndex >= 0);
    assert(stateIndex > activityIndex);
    assert(vueIndex > stateIndex,'Vue renderer bridge must load after History state/data shaping');
    assert(routerIndex > vueIndex,'History renderer must be installed before router/startup');

    assert(architecture.includes('`frontend/src/history/HistorySurface.vue` is the sole live History composition/DOM renderer'));
    assert(architecture.includes('No History runtime path stages or serializes legacy HTML'));
    assert(architecture.includes('`app-router.js` remains the sole browser History API owner'));
    assert(architecture.includes('Watched/episode tracking remains separate domain ownership'));

    console.log('Frontend modernization History Vue-native renderer ownership checks passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
