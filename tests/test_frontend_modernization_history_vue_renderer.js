const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/history-vue-bridge.js','utf8');
const activitySource = fs.readFileSync('static/js/history-activity.js','utf8');
const stateBridge = fs.readFileSync('static/js/history-state-bridge.js','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_HISTORY.md','utf8');

assert(bridgeSource.includes('const legacyRenderHistory = typeof global.renderHistory === "function"'));
assert(bridgeSource.includes('const stagingRoot = liveRoot.cloneNode(false)'));
assert(bridgeSource.includes('liveRoot.id = originalId + "-vue-owned"'));
assert(bridgeSource.includes('sharedVueBridge.renderShowListHTML(html)'));
assert(bridgeSource.includes('liveRoot.dataset.tvtrackerHistoryOwner = "vue-history"'));
assert(bridgeSource.includes('global.renderHistory = renderHistory'));
assert(activitySource.includes('function loadMoreHistory()'));
assert(activitySource.includes('return globalThis.renderHistory()'));
assert(activitySource.includes('moreButton.addEventListener("click",loadMoreHistory)'));
assert(!stateBridge.includes('document.'),'read-only History state bridge must remain DOM-free');

function makeButton(){
    const handlers = [];
    return {
        dataset:{},
        addEventListener(type,handler){
            assert.strictEqual(type,'click');
            handlers.push(handler);
        },
        async click(){
            for(const handler of handlers){
                await handler({stopPropagation(){}});
            }
        }
    };
}

function makeRoot(id=''){
    return {
        id,
        innerHTML:'',
        dataset:{},
        parentNode:null,
        querySelector(){ return null; },
        querySelectorAll(){ return []; },
        cloneNode(){
            const clone = makeRoot(this.id);
            clone.dataset = Object.assign({},this.dataset);
            return clone;
        },
        remove(){
            if(this.parentNode) this.parentNode.removeChild(this);
        }
    };
}

(async()=>{
    const liveRoot = makeRoot('show-list');
    liveRoot.innerHTML = '<p data-existing-vue-content>existing Vue History</p>';
    liveRoot.dataset.tvtrackerHistoryOwner = 'vue-history';
    const nodes = [liveRoot];
    const parent = {
        insertBefore(node,before){
            const index = nodes.indexOf(before);
            assert(index >= 0);
            node.parentNode = parent;
            nodes.splice(index,0,node);
        },
        removeChild(node){
            const index = nodes.indexOf(node);
            if(index >= 0) nodes.splice(index,1);
            node.parentNode = null;
        }
    };
    liveRoot.parentNode = parent;

    let legacyRenderCount = 0;
    let vueRenderCount = 0;
    let loadMoreCount = 0;
    let visibleButton = null;

    const document = {
        getElementById(id){ return nodes.find(node=>node.id === id) || null; }
    };

    liveRoot.querySelectorAll = selector=>{
        assert.strictEqual(selector,'.history-load-more');
        return visibleButton ? [visibleButton] : [];
    };

    const window = {
        document,
        renderHistory(){
            legacyRenderCount += 1;
            const target = document.getElementById('show-list');
            assert(target,'legacy History composer requires staging root');
            assert.notStrictEqual(target,liveRoot,'legacy History composer must not receive live Vue root');
            assert(liveRoot.innerHTML.includes('Vue History') || liveRoot.innerHTML.includes('history-group'),'legacy composition must preserve current live content');
            target.innerHTML = `<div class="history-group" data-pass="${legacyRenderCount}">History</div><button class="history-load-more">Load More</button>`;
        },
        loadMoreHistory(){
            loadMoreCount += 1;
            return this.renderHistory();
        },
        TVTrackerUpcomingNotificationsVueBridge:{
            async renderShowListHTML(html){
                vueRenderCount += 1;
                assert.strictEqual(liveRoot.id,'show-list','live root id must be restored before Vue renders');
                assert.strictEqual(nodes.length,1,'staging root must be removed before Vue renders');
                liveRoot.innerHTML = String(html);
                liveRoot.dataset.tvtrackerTrackerListsOwner = 'vue-watchlist';
                visibleButton = makeButton();
                return true;
            }
        }
    };

    const context = {window,console,Promise,Object,String,Number,Set,Map};
    vm.createContext(context);
    vm.runInContext(bridgeSource,context);

    const bridge = window.TVTrackerHistoryVueBridge;
    assert(bridge,'History Vue bridge should be exposed');
    assert.strictEqual(bridge.ownership,'vue-dom');

    const rendered = await window.renderHistory();
    assert.strictEqual(rendered,true);
    assert.strictEqual(legacyRenderCount,1);
    assert.strictEqual(vueRenderCount,1);
    assert.strictEqual(nodes.length,1);
    assert.strictEqual(liveRoot.id,'show-list');
    assert.strictEqual(liveRoot.dataset.tvtrackerHistoryOwner,'vue-history');
    assert.strictEqual(liveRoot.dataset.tvtrackerTrackerListsOwner,undefined);
    assert(liveRoot.innerHTML.includes('data-pass="1"'));
    assert(visibleButton,'Vue-rendered Load More button should be rebound');
    assert.strictEqual(visibleButton.dataset.vueBound,'1');

    await visibleButton.click();
    await Promise.resolve();
    assert.strictEqual(loadMoreCount,1,'Load More should keep legacy pagination action ownership');
    assert.strictEqual(legacyRenderCount,2,'Load More should recompose History once');
    assert.strictEqual(vueRenderCount,2,'Load More should rerender live History through Vue');
    assert.strictEqual(nodes.length,1,'Load More must not leak staging roots');
    assert(liveRoot.innerHTML.includes('data-pass="2"'));

    const activityIndex = template.indexOf("filename='js/history-activity.js'");
    const stateIndex = template.indexOf("filename='js/history-state-bridge.js'");
    const vueIndex = template.indexOf("filename='js/history-vue-bridge.js'");
    const routerIndex = template.indexOf("filename='js/app-router.js'");
    assert(activityIndex >= 0);
    assert(stateIndex > activityIndex);
    assert(vueIndex > stateIndex,'Vue renderer bridge must load after History state/legacy composition');
    assert(routerIndex > vueIndex,'History renderer must be installed before router/startup');

    assert(architecture.includes('Vue is the final live `#show-list` DOM writer for `/app/history`'));
    assert(architecture.includes('temporary staging `#show-list`'));
    assert(architecture.includes('`app-router.js` remains the sole browser History API owner'));
    assert(architecture.includes('Watched/episode tracking remains a separate later roadmap phase'));

    console.log('Frontend modernization History Vue renderer ownership checks passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
