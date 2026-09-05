const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname,'..');
const saveResultSource = fs.readFileSync(path.join(ROOT,'static/js/save-operation-result.js'),'utf8');
const behaviorSource = fs.readFileSync(path.join(ROOT,'static/js/show-tracking-behavior-fixes.js'),'utf8');
const template = fs.readFileSync(path.join(ROOT,'templates/index.html'),'utf8');

async function saveResultIsScopedToRequestedOperation(){
    const oldOperation = {id:'operation-old'};
    const context = {
        Promise,
        Set,
        Array,
        String,
        PENDING_SAVE_OPERATIONS:[oldOperation],
        saveData(){
            const requested = {id:'operation-requested'};
            context.PENDING_SAVE_OPERATIONS.push(requested);
            return Promise.resolve().then(()=>{
                // The requested save succeeded, but an older unrelated failure is
                // still pending, so the legacy queue-wide result is false.
                context.PENDING_SAVE_OPERATIONS = [oldOperation];
                return false;
            });
        }
    };
    context.window = context;
    vm.runInNewContext(saveResultSource,context,{filename:'save-operation-result.js'});

    const saved = await context.saveData({stateKeys:['movies']});
    assert.strictEqual(saved,true,'a successful requested operation must not inherit an unrelated queue failure');

    context.PENDING_SAVE_OPERATIONS = [oldOperation];
    context.saveData = function(){
        const requested = {id:'operation-failed'};
        context.PENDING_SAVE_OPERATIONS.push(requested);
        return Promise.resolve(false);
    };
    // Reload the wrapper around the new failing base implementation.
    vm.runInNewContext(saveResultSource,context,{filename:'save-operation-result.js'});
    const failed = await context.saveData({stateKeys:['movies']});
    assert.strictEqual(failed,false,'the requested operation must still report failure while it remains queued');
}

async function showDetailRemovalStaysOnTheSameShow(){
    const renders = [];
    let closeCalls = 0;
    const context = {
        Promise,
        Array,
        Object,
        String,
        JSON,
        DATA:{
            shows:{
                '123':{
                    tmdb_id:'123',
                    title:'Example Show',
                    status:'watching',
                    episodes_watched:{'1':[1,2]},
                    completed_at:'2026-01-01T00:00:00Z',
                    poster_path:'/poster.jpg'
                }
            }
        },
        activePage:'show-detail',
        selectedShowId:'123',
        selectedEpisodeContext:null,
        showDetailPreview:null,
        closeShowDetailsPage(){ closeCalls += 1; },
        async removeShow(id){
            context.closeShowDetailsPage();
            delete context.DATA.shows[String(id)];
            return true;
        },
        renderShowDetailsPagePreservingScroll(show){ renders.push(show); },
        updateShellTitle(){},
        async savePreparedShow(){ return true; },
        ensureSeasonLoaded(){},
        TVTrackerTrackerListsStateBridge:null
    };
    context.window = context;
    vm.runInNewContext(behaviorSource,context,{filename:'show-tracking-behavior-fixes.js'});

    const removed = await context.removeShow('123');
    assert.strictEqual(removed,true);
    assert.strictEqual(closeCalls,0,'removing the currently viewed show must not navigate away');
    assert.strictEqual(context.selectedShowId,'123');
    assert(context.showDetailPreview,'removed show must remain available as a detail preview');
    assert.strictEqual(context.showDetailPreview.status,'');
    assert.deepStrictEqual(Object.keys(context.showDetailPreview.episodes_watched),[],'removed preview must not retain watched progress');
    assert.strictEqual(context.showDetailPreview.completed_at,'');
    assert.strictEqual(renders.length,1);
    assert.strictEqual(renders[0]._preview_only,true);
}

async function addingToWatchingPreloadsSeasonOneWithoutWatchingIt(){
    const calls = [];
    const show = {
        tmdb_id:'77',
        title:'Fresh Show',
        episodes_watched:{},
        _episode_list:{}
    };
    const context = {
        Promise,
        Array,
        Object,
        String,
        JSON,
        DATA:{shows:{}},
        activePage:'show-detail',
        selectedShowId:'77',
        selectedEpisodeContext:null,
        showDetailPreview:null,
        removeShow(){},
        closeShowDetailsPage(){},
        async ensureSeasonLoaded(target,season,force,options){
            calls.push({kind:'load',season,force,options});
            target._episode_list['1'] = [{season_number:1,episode_number:1,episode:1,name:'Pilot',air_date:'2026-01-01'}];
        },
        async savePreparedShow(target,status){
            calls.push({kind:'save',status,first:target._episode_list['1'] && target._episode_list['1'][0]});
            return true;
        },
        TVTrackerTrackerListsStateBridge:null
    };
    context.window = context;
    vm.runInNewContext(behaviorSource,context,{filename:'show-tracking-behavior-fixes.js'});

    const saved = await context.savePreparedShow(show,'watching');
    assert.strictEqual(saved,true);
    assert.strictEqual(calls[0].kind,'load');
    assert.strictEqual(calls[0].season,1);
    assert.strictEqual(calls[0].force,false);
    assert.strictEqual(calls[0].options.skipSave,true);
    assert.strictEqual(calls[1].kind,'save');
    assert.strictEqual(calls[1].first.episode_number,1,'S01E01 must be available immediately as the next episode');
    assert.deepStrictEqual(Object.keys(show.episodes_watched),[],'preloading S01E01 must not mark it watched');
}

function droppedCopyUsesStoppedAt(){
    const originalItem = Object.freeze({episodeText:'Stopped after Season 1, Episode 2'});
    const context = {
        Promise,
        Array,
        Object,
        String,
        JSON,
        DATA:{shows:{}},
        removeShow(){},
        savePreparedShow(){},
        TVTrackerTrackerListsStateBridge:Object.freeze({
            snapshot(){ return {}; },
            viewModel(){
                return Object.freeze({items:Object.freeze([originalItem])});
            },
            ownership:'legacy-read-only'
        })
    };
    context.window = context;
    vm.runInNewContext(behaviorSource,context,{filename:'show-tracking-behavior-fixes.js'});

    const model = context.TVTrackerTrackerListsStateBridge.viewModel();
    assert.strictEqual(model.items[0].episodeText,'Stopped at Season 1, Episode 2');
}

(async()=>{
    const fallback = "filename='js/save-storage-fallback.js'";
    const saveResult = "filename='js/save-operation-result.js'";
    const app = "filename='js/app.js'";
    const trackerBridge = "filename='js/tracker-lists-state-bridge.js'";
    const behavior = "filename='js/show-tracking-behavior-fixes.js'";
    const showBridge = "filename='js/show-details-vue-bridge.js'";

    for(const marker of [fallback,saveResult,app,trackerBridge,behavior,showBridge]){
        assert(template.includes(marker),`missing ${marker}`);
    }
    assert(template.indexOf(fallback) < template.indexOf(saveResult));
    assert(template.indexOf(saveResult) < template.indexOf(app));
    assert(template.indexOf(trackerBridge) < template.indexOf(behavior));
    assert(template.indexOf(behavior) < template.indexOf(showBridge));

    await saveResultIsScopedToRequestedOperation();
    await showDetailRemovalStaysOnTheSameShow();
    await addingToWatchingPreloadsSeasonOneWithoutWatchingIt();
    droppedCopyUsesStoppedAt();

    console.log('Tracking behavior fix regressions passed.');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
