const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const runtime = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
const stateBridge = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md','utf8');

assert(runtime.includes('function composeWatchlistHTML()'));
assert(runtime.includes('const stagingRoot = root.cloneNode(false)'));
assert(runtime.includes('root.id = originalId + "-vue-owned"'));
assert(runtime.includes('parent.insertBefore(stagingRoot,root)'));
assert(runtime.includes('return String(stagingRoot.innerHTML || "")'));
assert(runtime.includes('root.id = originalId'));
assert(runtime.includes('const html = composeWatchlistHTML()'));
assert(!stateBridge.includes('document.'));
assert(!stateBridge.includes('saveData('));

assert(architecture.includes('detached staging root'));
assert(architecture.includes('sole writer of Watchlist markup into the live `#show-list`'));
assert(architecture.includes('The Tracker Lists state bridge is read-only'));
assert(architecture.includes('History and watched/episode tracking remain separate later roadmap phases'));
assert(architecture.includes('the Tracker Lists phase is complete'));

function makeElement(id=''){
    return {
        id,
        innerHTML:'',
        dataset:{},
        parentNode:null,
        querySelectorAll(selector){
            assert.strictEqual(selector,'.watchlist-action');
            return [];
        },
        querySelector(){ return null; },
        cloneNode(){
            const clone = makeElement(this.id);
            clone.dataset = Object.assign({},this.dataset);
            return clone;
        },
        remove(){
            if(this.parentNode && typeof this.parentNode.removeChild === 'function'){
                this.parentNode.removeChild(this);
            }
        }
    };
}

function buildContext({throwDuringLegacy=false}={}){
    const root = makeElement('show-list');
    root.innerHTML = '<p data-existing-vue-content>existing Vue content</p>';
    root.dataset.tvtrackerTrackerListsOwner = 'vue-watchlist';

    const nodes = [root];
    const parent = {
        insertBefore(node,before){
            const index = nodes.indexOf(before);
            assert(index >= 0,'live Watchlist root must still be mounted');
            node.parentNode = parent;
            nodes.splice(index,0,node);
        },
        removeChild(node){
            const index = nodes.indexOf(node);
            if(index >= 0) nodes.splice(index,1);
            node.parentNode = null;
        }
    };
    root.parentNode = parent;

    let legacyRenderCount = 0;
    let vueRenderCount = 0;
    let vueModel = null;

    const document = {
        getElementById(id){
            return nodes.find(node=>node.id === id) || null;
        },
        querySelectorAll(){ return []; },
        querySelector(){ return null; }
    };

    const context = {
        console,
        URL,
        Promise,
        Object,
        String,
        Number,
        Math,
        Set,
        Map,
        window:{
            document,
            location:{pathname:'/app/list/watching',origin:'https://example.test'},
            renderWatchlist(){
                legacyRenderCount += 1;
                const target = document.getElementById('show-list');
                assert(target,'legacy composer should receive a staging #show-list');
                assert.notStrictEqual(target,root,'legacy composer must not receive the live Vue root');
                assert.strictEqual(root.innerHTML,'<p data-existing-vue-content>existing Vue content</p>','legacy composition must not mutate live Vue content');
                if(throwDuringLegacy) throw new Error('legacy composition failed');
                target.innerHTML = '<article class="watchlist-card" data-show-id="42"><button class="watchlist-action" data-watchlist-action="mark"></button></article>';
            },
            renderUpcoming(){},
            TVTrackerNotifications:null,
            setTimeout,
            PointerEvent:function PointerEvent(){}
        }
    };

    vm.createContext(context);
    vm.runInContext(runtime,context);

    if(!throwDuringLegacy){
        context.window.TVTrackerUpcomingNotificationsVueBridge.attachVueOwner({
            render(model){
                vueRenderCount += 1;
                vueModel = model;
                assert.strictEqual(root.id,'show-list','live root id must be restored before Vue renders');
                assert.strictEqual(nodes.length,1,'staging root must be removed before Vue renders');
                root.innerHTML = model.html;
            },
            unmount(){}
        });
    }

    return {
        context,
        root,
        nodes,
        get legacyRenderCount(){ return legacyRenderCount; },
        get vueRenderCount(){ return vueRenderCount; },
        get vueModel(){ return vueModel; }
    };
}

(async()=>{
    const success = buildContext();
    const rendered = await success.context.window.renderWatchlist();
    assert.strictEqual(rendered,true);
    assert.strictEqual(success.legacyRenderCount,1,'legacy markup composition should run exactly once');
    assert.strictEqual(success.vueRenderCount,1,'Vue should be the only live-root renderer');
    assert(success.vueModel && success.vueModel.html.includes('data-show-id="42"'));
    assert.strictEqual(success.root.id,'show-list');
    assert.strictEqual(success.nodes.length,1);
    assert.strictEqual(success.root.dataset.tvtrackerTrackerListsOwner,'vue-watchlist');

    await success.context.window.refreshWatchlistShows(['42']);
    assert.strictEqual(success.legacyRenderCount,2,'refresh should recompute markup once');
    assert.strictEqual(success.vueRenderCount,2,'refresh should render the live root once through Vue');
    assert.strictEqual(success.nodes.length,1,'refresh must not leak a staging root');

    const failure = buildContext({throwDuringLegacy:true});
    await assert.rejects(()=>failure.context.window.renderWatchlist(),/legacy composition failed/);
    assert.strictEqual(failure.root.id,'show-list','error path must restore the live root id');
    assert.strictEqual(failure.nodes.length,1,'error path must remove the staging root');
    assert.strictEqual(failure.root.innerHTML,'<p data-existing-vue-content>existing Vue content</p>','error path must preserve live Vue content');

    console.log('Tracker Lists completion ownership contract passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
