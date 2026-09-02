const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { compile } = require('@vue/compiler-dom');
const { parse } = require('@vue/compiler-sfc');
const Vue = require('vue');
const { renderToString } = require('@vue/server-renderer');

const bridgeSource = fs.readFileSync('static/js/history-vue-bridge.js','utf8');
const clientRuntimeSource = fs.readFileSync('static/js/client-runtime.js','utf8');
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
assert(!bridgeSource.includes('document.'),'History Vue bridge must not write History DOM');
assert(!bridgeSource.includes('innerHTML'),'History Vue bridge must not compose failure HTML');
assert(stateBridgeSource.includes('function viewModel('));
assert(stateBridgeSource.includes('groupHistoryByDate'));
assert(stateBridgeSource.includes('formatHistoryRelative'));
assert(!stateBridgeSource.includes('document.'),'read-only History state bridge must remain DOM-free');
assert(componentSource.includes('data-tvtracker-history-owner="vue-history"'));
assert(componentSource.includes('class="history-load-more"'));
assert(componentSource.includes('class="show history-entry-card"'));
assert(!componentSource.includes('watchlist-skeleton-row'),'History skeleton rows must keep History card layout on mobile and desktop');
assert(componentSource.includes("model.state === 'loading'"));
assert(componentSource.includes("model.state === 'error'"));
assert(componentSource.includes('data-tvtracker-history-model-projection-failed="true"'));
assert(!componentSource.includes('v-html'),'History renderer must remain structured Vue composition');
assert(mainSource.includes("import HistorySurface from './history/HistorySurface.vue'"));
assert(mainSource.includes('TVTrackerHistoryVueBridge?.attachVueOwner(historyOwner)'));

(async()=>{
    let historyDomAccesses = 0;
    const limits = [];
    const renderedModels = [];
    const runtimeReports = [];
    const window = {
        document:{getElementById(){ historyDomAccesses += 1; throw new Error('History bridge accessed DOM'); }},
        location:{pathname:'/not-history',origin:'http://localhost'},
        TVTrackerClientRuntime:{report(details){ runtimeReports.push(details); }},
        TVTrackerHistoryStateBridge:{
            ownership:'legacy-read-only',
            viewModel(limit){
                limits.push(limit);
                return Object.freeze({
                    surface:'history',
                    state:'ready',
                    groups:Object.freeze([Object.freeze({
                        key:'today',
                        label:'Today',
                        entries:Object.freeze([Object.freeze({
                            key:'episode-1',kind:'episode',route:'/app/tv/1/season/1/episode/1',title:'Show',
                            detailLine:'S1E01 — Pilot',imageUrl:'',placeholder:'📺',relativeTime:'Now'
                        })])
                    })]),
                    emptyState:null,
                    hasMore:limit < 80,
                    failure:null
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
    assert.strictEqual(historyDomAccesses,0,'History bridge must leave DOM ownership to Vue');

    assert.strictEqual(await bridge.actions.loadMore(),true);
    assert.deepStrictEqual(limits,[40,80]);
    assert.strictEqual(renderedModels.length,2);
    assert.strictEqual(renderedModels[1].hasMore,false);

    window.TVTrackerHistoryStateBridge.viewModel = ()=>{ throw new Error('projection failed'); };
    assert.strictEqual(await window.renderHistory(),true,'Vue owner should render structured History failures');
    assert.strictEqual(renderedModels.length,3);
    assert.strictEqual(renderedModels[2].surface,'history');
    assert.strictEqual(renderedModels[2].state,'error');
    assert.strictEqual(renderedModels[2].groups.length,0);
    assert.strictEqual(renderedModels[2].hasMore,false);
    assert.strictEqual(renderedModels[2].failure,'model-projection');
    assert(runtimeReports.some(report=>report.code === 'history_model_projection_failed'));
    assert(!runtimeReports.some(report=>report.code === 'vue_history_asset_load_failed'));
    assert.strictEqual(historyDomAccesses,0,'failure rendering must not fall back to bridge DOM writes');

    function directLoadingModel(mobile){
        const directModels = [];
        const directWindow = {
            appDataReady:false,
            fetch(){ return new Promise(()=>{}); },
            location:{pathname:'/app/history',origin:'http://localhost'},
            matchMedia(query){
                assert.strictEqual(query,'(max-width: 767.98px)');
                return {matches:mobile};
            }
        };
        const directContext = {window:directWindow,console,Promise,Object,String,Number,Error,URL};
        vm.createContext(directContext);
        vm.runInContext(bridgeSource,directContext);
        directWindow.TVTrackerHistoryVueBridge.attachVueOwner({
            render(model){ directModels.push(model); },
            unmount(){}
        });
        assert.strictEqual(directModels.length,1,'direct History owner attachment must replace the generic template skeleton with Vue loading state');
        assert.strictEqual(directModels[0].state,'loading');
        assert.strictEqual(directModels[0].failure,null);
        return directModels[0];
    }

    const mobileLoadingModel = directLoadingModel(true);
    const desktopLoadingModel = directLoadingModel(false);
    assert.strictEqual(mobileLoadingModel.loadingRowCount,6);
    assert.strictEqual(desktopLoadingModel.loadingRowCount,8);

    function createNode(tagName){
        return {
            tagName:String(tagName || '').toUpperCase(),
            id:'',
            className:'',
            textContent:'',
            hidden:false,
            attributes:{},
            children:[],
            setAttribute(name,value){ this.attributes[name] = String(value); },
            append(...children){ this.children.push(...children); },
            appendChild(child){ this.children.push(child); return child; },
            replaceChildren(...children){ this.children = children; }
        };
    }

    const showList = createNode('div');
    showList.id = 'show-list';
    showList.children = [{className:'watchlist-initial-skeleton'}];
    const body = createNode('body');
    const telemetry = [];
    const document = {
        body,
        readyState:'complete',
        getElementById(id){ return id === 'show-list' ? showList : null; },
        createElement:createNode,
        querySelector(){ return null; }
    };
    const assetWindow = {
        document,
        location:{pathname:'/app/history',origin:'https://example.test'},
        localStorage:{setItem(){},removeItem(){}},
        sessionStorage:{setItem(){},removeItem(){}},
        crypto:{randomUUID(){ return '00000000-0000-4000-8000-000000000000'; }},
        fetch(input,init){
            if(String(input) === '/static/vue/manifest.json') return Promise.reject(new Error('manifest unavailable'));
            if(String(input) === '/api/client-errors'){
                telemetry.push(JSON.parse(init.body));
                return Promise.resolve({ok:true,json:()=>Promise.resolve({})});
            }
            return Promise.reject(new Error('unexpected request'));
        },
        addEventListener(){},
        setTimeout,
        clearTimeout
    };
    const assetContext = {
        window:assetWindow,console,Promise,Object,String,Number,Error,URL,Date,Math,JSON,setTimeout,clearTimeout
    };
    vm.createContext(assetContext);
    vm.runInContext(clientRuntimeSource,assetContext);
    vm.runInContext(bridgeSource,assetContext);
    assert.strictEqual(await assetWindow.TVTrackerHistoryVueBridge.renderHistory(),false);
    assert.strictEqual(showList.children.length,1,'asset failure must replace the perpetual generic skeleton');
    const assetFailure = showList.children[0];
    assert.strictEqual(assetFailure.attributes['data-tvtracker-history-vue-asset-load-failed'],'true');
    assert.strictEqual(assetFailure.attributes.role,'alert');
    assert.strictEqual(assetFailure.children[0].textContent,'History unavailable');
    assert(telemetry.some(event=>event.code === 'vue_history_asset_load_failed'));
    assert(!telemetry.some(event=>event.code === 'history_model_projection_failed'));

    const ownerlessFailures = [];
    const ownerlessReports = [];
    const ownerlessWindow = {
        fetch(){
            return Promise.resolve({
                ok:true,
                json:()=>Promise.resolve({
                    'frontend/src/main.ts':{file:'assets/main-ownerless.js'}
                })
            });
        },
        location:{pathname:'/app/history',origin:'https://example.test'},
        TVTrackerClientRuntime:{
            report(details){ ownerlessReports.push(details); },
            renderSurfaceFailure(details){ ownerlessFailures.push(details); }
        }
    };
    const ownerlessContext = {window:ownerlessWindow,console,Promise,Object,String,Number,Error,URL};
    vm.createContext(ownerlessContext);
    vm.runInContext(bridgeSource,ownerlessContext,{
        importModuleDynamically(){
            return import('data:text/javascript,export default true');
        }
    });
    assert.strictEqual(await ownerlessWindow.TVTrackerHistoryVueBridge.renderHistory(),false);
    assert.strictEqual(ownerlessFailures.length,1,'an evaluated bundle that does not attach its History owner must exit the skeleton');
    assert.strictEqual(ownerlessFailures[0].marker,'data-tvtracker-history-vue-asset-load-failed');
    assert(ownerlessReports.some(report=>report.code === 'vue_history_asset_load_failed'));
    assert(!ownerlessReports.some(report=>report.code === 'history_model_projection_failed'));

    const templateBlock = parse(componentSource,{filename:'HistorySurface.vue'}).descriptor.template;
    assert(templateBlock,'History Vue template should compile');
    const render = new Function('Vue',compile(templateBlock.content,{mode:'function',prefixIdentifiers:true}).code)(Vue);
    async function renderModelMarkup(model){
        const component = {
            render,
            data(){ return {model,loadingMore:false,ownerMarker:null}; },
            methods:{loadMore(){}}
        };
        return renderToString(Vue.createSSRApp(component));
    }
    const mobileMarkup = await renderModelMarkup(mobileLoadingModel);
    const desktopMarkup = await renderModelMarkup(desktopLoadingModel);
    const projectionFailureMarkup = await renderModelMarkup(renderedModels[2]);
    assert.strictEqual((mobileMarkup.match(/<article class="show history-entry-card"/g) || []).length,6);
    assert.strictEqual((desktopMarkup.match(/<article class="show history-entry-card"/g) || []).length,8);
    assert(!mobileMarkup.includes('watchlist-skeleton-row'));
    assert(!desktopMarkup.includes('watchlist-skeleton-row'));
    assert(mobileMarkup.includes('role="status"'));
    assert(mobileMarkup.includes('aria-live="polite"'));
    assert.strictEqual((mobileMarkup.match(/aria-hidden="true"/g) || []).length,6);
    assert(mobileMarkup.includes('Loading watch history'));
    assert(projectionFailureMarkup.includes('data-tvtracker-history-model-projection-failed="true"'));
    assert(projectionFailureMarkup.includes('role="alert"'));
    assert(!projectionFailureMarkup.includes('data-tvtracker-history-vue-asset-load-failed'));

    const appIndex = template.indexOf("filename='js/app.js'");
    const stateIndex = template.indexOf("filename='js/history-state-bridge.js'");
    const vueIndex = template.indexOf("filename='js/history-vue-bridge.js'");
    const routerIndex = template.indexOf("filename='js/app-router.js'");
    assert(!template.includes("filename='js/history-activity.js'"),'removed legacy History placeholder must not be loaded');
    assert(appIndex >= 0,'authoritative tracker state script must be loaded');
    assert(stateIndex > appIndex,'structured History state must load after its legacy data/helper dependencies');
    assert(vueIndex > stateIndex,'Vue renderer bridge must load after structured History state');
    assert(routerIndex > vueIndex,'History renderer must be installed before router/startup');

    assert(architecture.includes('`frontend/src/history/HistorySurface.vue` is the sole live History composition/DOM renderer'));
    assert(architecture.includes('No History runtime path stages or serializes legacy HTML'));
    assert(architecture.includes('`app-router.js` remains the sole browser History API owner'));
    assert(architecture.includes('`DATA.history` remains authoritative'));
    assert(architecture.includes('Skeleton/loading-state migration is explicitly part of this branch'));

    console.log('Frontend modernization History Vue renderer behavior checks passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
