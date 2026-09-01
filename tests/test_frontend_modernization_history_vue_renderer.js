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
assert(bridgeSource.includes('stateBridge.viewModel(visibleLimit)'));
assert(bridgeSource.includes('visibleLimit += HISTORY_BATCH_SIZE'));
assert(bridgeSource.includes('global.renderHistory = renderHistory'));
assert(bridgeSource.includes('global.loadMoreHistory = loadMoreHistory'));
assert(!bridgeSource.includes('legacyRenderHistory'));
assert(!bridgeSource.includes('cloneNode(false)'));
assert(!bridgeSource.includes('renderShowListHTML'));
assert(!/function\s+renderHistory\s*\(/.test(activitySource),'legacy History activity file must not own renderHistory');
assert(!/function\s+loadMoreHistory\s*\(/.test(activitySource),'legacy History activity file must not own pagination');
assert(!activitySource.includes('innerHTML'),'legacy History activity file must not compose DOM');
assert(stateBridgeSource.includes('function viewModel('));
assert(stateBridgeSource.includes('groupHistoryByDate'));
assert(stateBridgeSource.includes('formatHistoryRelative'));
assert(!stateBridgeSource.includes('document.'),'read-only History state bridge must remain DOM-free');
assert(componentSource.includes('data-tvtracker-history-owner="vue-history"'));
assert(componentSource.includes('class="history-load-more"'));
assert(componentSource.includes('class="show history-entry-card"'));
assert(!componentSource.includes('v-html'),'History renderer must remain structured Vue composition');
assert(mainSource.includes("import HistorySurface from './history/HistorySurface.vue'"));
assert(mainSource.includes('TVTrackerHistoryVueBridge?.attachVueOwner(historyOwner)'));

(async()=>{
    const root = {dataset:{tvtrackerTrackerListsOwner:'vue-watchlist'},innerHTML:''};
    const limits = [];
    const renderedModels = [];
    const window = {
        document:{getElementById(id){ return id === 'show-list' ? root : null; }},
        location:{pathname:'/not-history',origin:'http://localhost'},
        TVTrackerHistoryStateBridge:{
            ownership:'legacy-read-only',
            viewModel(limit){
                limits.push(limit);
                return Object.freeze({
                    surface:'history',
                    groups:Object.freeze([Object.freeze({
                        key:'today',
                        label:'Today',
                        entries:Object.freeze([Object.freeze({
                            key:'episode-1',kind:'episode',route:'/app/tv/1/season/1/episode/1',title:'Show',
                            detailLine:'S1E01 — Pilot',imageUrl:'',placeholder:'📺',relativeTime:'Now'
                        })])
                    })]),
                    emptyState:null,
                    hasMore:limit < 80
                });
            }
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
        render(model){ renderedModels.push(model); },
        unmount(){}
    });

    assert.strictEqual(await window.renderHistory(),true);
    assert.deepStrictEqual(limits,[40]);
    assert.strictEqual(renderedModels.length,1);
    assert.strictEqual(renderedModels[0].groups[0].entries[0].title,'Show');
    assert.strictEqual(root.dataset.tvtrackerHistoryOwner,'vue-history');
    assert.strictEqual(root.dataset.tvtrackerTrackerListsOwner,undefined);

    assert.strictEqual(await bridge.actions.loadMore(),true);
    assert.deepStrictEqual(limits,[40,80]);
    assert.strictEqual(renderedModels.length,2);
    assert.strictEqual(renderedModels[1].hasMore,false);

    const activityIndex = template.indexOf("filename='js/history-activity.js'");
    const stateIndex = template.indexOf("filename='js/history-state-bridge.js'");
    const vueIndex = template.indexOf("filename='js/history-vue-bridge.js'");
    const routerIndex = template.indexOf("filename='js/app-router.js'");
    assert(activityIndex >= 0,'compatibility placeholder stays until the final file-removal sweep');
    assert(stateIndex > activityIndex);
    assert(vueIndex > stateIndex,'Vue renderer bridge must load after structured History state');
    assert(routerIndex > vueIndex,'History renderer must be installed before router/startup');

    assert(architecture.includes('`frontend/src/history/HistorySurface.vue` is the sole live History composition/DOM renderer'));
    assert(architecture.includes('No History runtime path stages or serializes legacy HTML'));
    assert(architecture.includes('`app-router.js` remains the sole browser History API owner'));
    assert(architecture.includes('`DATA.history` remains authoritative'));

    console.log('Frontend modernization History Vue-native renderer ownership checks passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
