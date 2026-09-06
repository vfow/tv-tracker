const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function environment() {
    const renders=[], routes=[], opens=[];
    const win={console,URL,URLSearchParams,setTimeout,clearTimeout,
        location:{pathname:'/app/collection/263-synthetic',search:'',origin:'https://test.invalid'},
        document:{addEventListener(){},getElementById(){return null;}},
        sessionStorage:{getItem(){return null;},setItem(){}}
    };
    win.window=win;
    vm.createContext(win);
    for(const file of ['app.js','ui.js','discover-vue-bridge.js']) vm.runInContext(fs.readFileSync('static/js/'+file,'utf8'),win,{filename:file});
    win.activePage='collection-detail';win.selectedCollectionId='263';
    win.setAppHashRoute=(route)=>routes.push(route);
    win.getDiscoveryNavContext=()=> 'discover';
    win.rememberRouteNavContext=()=>{};
    win.updateShellTitle=()=>{};
    win.showCollectionDetailPageShell=()=>{win.activePage='collection-detail';};
    win.ensureBrowseReferenceData=async()=>{};
    win.ensureBrowseGlobalInteractionEvents=()=>{};
    win.openMoviePage=async(id,options)=>opens.push({id,options});
    win.navigateBackOrRouteFallback=route=>routes.push(route);
    win.renderAppRouteNotFoundPage=()=>renders.push({notFound:true});
    const bridge=win.TVTrackerDiscoverVueBridge;
    bridge.attachCollectionOwner({render:model=>renders.push(model),unmount(){}});
    const raw={id:263,name:'Synthetic Collection',parts:[
        {id:3,title:'Z Movie',release_date:'2012-01-01',genre_ids:[28],original_language:'en',vote_average:8.54,adult:true},
        {id:2,title:'A Movie',release_date:'2008-01-01',genre_ids:[80],original_language:'fr',vote_average:5,poster_path:'/poster.jpg'},
        {id:1,title:'B Movie',release_date:'2005-01-01',genre_ids:[28,80],original_language:'en',vote_average:7}
    ]};
    const collection=win.normalizeTMDBCollectionDetails(raw);
    win.getMovieTrackingState=id=>({watched:id==='1',plan:id==='2',favorite:id==='3'});
    win.collectionDetailPageState={collectionId:'263',collection,movies:collection.parts,...win.buildCollectionDetailState(collection,collection.parts,{})};
    return {win,bridge,renders,routes,opens,collection,actions:bridge.collectionActions};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

(async()=>{
    const e=environment(), {win,bridge,actions}=e;
    const original=JSON.stringify(win.DATA);
    win.renderActiveCollectionDetailPage();
    let model=e.renders.at(-1);
    assert.deepStrictEqual(Array.from(model.items,x=>x.id),[3,2,1]);
    assert.strictEqual(model.items[0].rating,'8.5');
    assert.strictEqual(model.items[0].adult,true);
    assert.strictEqual(model.items[0].placeholderLabel,'Z Movie (2012)');
    actions.setFilter('sort','date-asc');
    assert.deepStrictEqual(Array.from(e.renders.at(-1).items,x=>x.id),[1,2,3]);
    actions.setFilter('decade','2000');
    assert.strictEqual(e.renders.at(-1).visibleDecade,2000);
    assert.strictEqual(e.renders.at(-1).years.length,10);
    actions.setFilter('year','2008');
    assert.deepStrictEqual(Array.from(e.renders.at(-1).items,x=>x.id),[2]);
    assert.strictEqual(e.renders.at(-1).filters.decade,'');
    assert(e.routes.at(-1).includes('year=2008'));
    actions.removeFilter('year','2008');
    actions.setFilter('genre','28');actions.setFilter('genre','80');
    assert.deepStrictEqual(Array.from(e.renders.at(-1).items,x=>x.id),[1]);
    actions.removeFilter('genres','28');
    actions.setFilter('language','fr');
    assert.deepStrictEqual(Array.from(e.renders.at(-1).items,x=>x.id),[2]);
    actions.toggleEye('hidePlan');
    assert.strictEqual(e.renders.at(-1).bodyState,'empty');
    assert(e.renders.at(-1).emptyMessage.includes('eye filters'));
    actions.clearFilters();actions.toggleEye('fadeWatched');
    assert.strictEqual(e.renders.at(-1).items.find(x=>x.id===1).faded,true);
    assert.strictEqual(e.renders.at(-1).chips.length,0,'eye-only state does not create CLEAR ALL row');
    actions.toggleEye('hideWatched');actions.toggleEye('hideFavorites');
    assert.deepStrictEqual(Array.from(e.renders.at(-1).items,x=>x.id),[2]);
    model=e.renders.at(-1);
    await actions.openMedia(model.items[0],model.route);
    assert.strictEqual(e.opens[0].options.backRoute,model.route);
    assert.strictEqual(e.opens[0].id,2);
    actions.back();assert.strictEqual(e.routes.at(-1),'/app/collections');
    assert.strictEqual(JSON.stringify(win.DATA),original,'view/filter actions must not mutate tracker truth');
    assert(Object.isFrozen(model)&&Object.isFrozen(model.items)&&Object.isFrozen(model.filters.genres));
    assert.strictEqual(bridge.buildCollectionModel({collectionId:'263',loading:true}).bodyState,'loading');
    assert.strictEqual(bridge.buildCollectionModel({collectionId:'263',error:'Provider unavailable'}).bodyState,'error');

    for(const outcome of ['success','error','not-found']){
        const e=environment(),d=deferred();e.win.tmdbGetCollectionDetails=()=>d.promise;
        const pending=e.win.openCollectionDetailPage('263');
        e.win.activePage='shows';const count=e.renders.length,routeCount=e.routes.length;
        if(outcome==='success')d.resolve(e.collection);else d.reject(Object.assign(new Error('Provider'),{status:outcome==='not-found'?404:502}));
        await pending;
        assert.strictEqual(e.renders.length,count,'late '+outcome+' must not overwrite another page');
        assert.strictEqual(e.routes.length,routeCount);
    }
    const race=environment(),first=deferred(),second=deferred();let calls=0;
    race.win.tmdbGetCollectionDetails=()=>++calls===1?first.promise:second.promise;
    const older=race.win.openCollectionDetailPage('263',{filters:{year:'2005'}});
    const newer=race.win.openCollectionDetailPage('263',{filters:{year:'2008'}});
    second.resolve(race.collection);await newer;first.reject(new Error('Old request failed'));await older;
    assert.strictEqual(race.renders.at(-1).filters.year,'2008');
    assert.strictEqual(race.renders.at(-1).bodyState,'ready');
    const references=environment(),ref=deferred();references.win.tmdbGetCollectionDetails=async()=>references.collection;
    references.win.ensureBrowseReferenceData=()=>ref.promise;
    const waiting=references.win.openCollectionDetailPage('263');await Promise.resolve();
    references.win.activePage='search';const count=references.renders.length;ref.resolve();await waiting;
    assert.strictEqual(references.renders.length,count,'navigation during reference loading stays authoritative');

    const ui=fs.readFileSync('static/js/ui.js','utf8'),app=fs.readFileSync('static/js/app.js','utf8');
    assert(!ui.includes('function renderCollectionDetail'));
    assert(!app.includes('attachCollectionDetailPageEvents'));
    assert(!fs.readFileSync('frontend/src/search-discover/CollectionDetails.vue','utf8').includes('v-html'));
    console.log('Collection native models, actual filters, routes, tracker integrity, and request races passed.');
})().catch(error=>{console.error(error);process.exit(1);});
