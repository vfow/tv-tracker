const assert=require('assert'),fs=require('fs'),vm=require('vm');

function environment(){
    const renders=[],routes=[],restores=[];
    const win={console,URL,URLSearchParams,setTimeout,clearTimeout,
        location:{pathname:'/app/collections',search:'',origin:'https://test.invalid'},
        document:{addEventListener(){},getElementById(){return null;}},
        sessionStorage:{getItem(){return null;},setItem(){}}
    };
    win.window=win;vm.createContext(win);
    for(const file of ['app.js','ui.js','discover-vue-bridge.js'])vm.runInContext(fs.readFileSync('static/js/'+file,'utf8'),win);
    win.activePage='collections-index';
    win.setAppHashRoute=(route,replace)=>routes.push({route,replace});
    win.ensureBrowseGlobalInteractionEvents=()=>{};
    win.restoreCollectionReturnPositionSoon=route=>restores.push(route);
    win.hydrateVisibleCollectionsForIndex=async()=>{};
    win.maybeRunCollectionsLiveSearch=()=>{};
    win.navigateBackOrRouteFallback=route=>routes.push({route});
    const collections=Array.from({length:70},(_,index)=>win.normalizeTMDBCollectionSummary({
        id:100+index,name:'Series '+String(index).padStart(2,'0'),movie_count:2,
        poster_slots:[{title:'First poster',release_date:'2005-01-01',poster_path:'/first.jpg'},{title:'Missing poster',release_date:'2006-01-01'}],
        genre_ids:[index%2?28:80],decades:[index%2?'2000':'2010'],average_popularity:index+1,average_rating:(index%10)+1
    }));
    win.collectionsPageState={collections,loaded:true,...win.buildCollectionsIndexState(collections,{})};
    const bridge=win.TVTrackerDiscoverVueBridge;
    bridge.attachIndexOwner({render:model=>renders.push(model),unmount(){}});
    return {win,bridge,renders,routes,restores,actions:bridge.indexActions};
}

const e=environment(),{win,bridge,actions}=e,original=JSON.stringify(win.DATA);
win.renderActiveCollectionsPage();
assert.strictEqual(e.renders.at(-1).items.length,64);
assert.strictEqual(e.renders.at(-1).items[0].name,'Series 69');
assert.strictEqual(e.renders.at(-1).hasMore,true);
assert.strictEqual(e.restores.at(-1),'/app/collections');
actions.viewMore();
assert.strictEqual(e.renders.at(-1).items.length,70);
assert.strictEqual(e.renders.at(-1).hasMore,false);
assert(e.routes.at(-1).route.includes('page=2'));
actions.setFilter('genre','28');
assert.strictEqual(e.renders.at(-1).items.length,35);
assert.strictEqual(win.collectionsPageState.page,1);
actions.setFilter('decade','2010');
assert.strictEqual(e.renders.at(-1).bodyState,'empty');
actions.clearFilter('all');actions.setFilter('sort','name.asc');
assert.strictEqual(e.renders.at(-1).items[0].name,'Series 00');
assert.strictEqual(e.renders.at(-1).chips[0].label,'Sort: Collection Name');
actions.searchDraft('Series 01');
assert.strictEqual(win.collectionsPageState.searchDraft,'Series 01');
assert.strictEqual(win.collectionsPageState.query,'','typing is draft until debounce/Enter submits');
actions.search('Series 01');
assert.strictEqual(e.renders.at(-1).items.length,1);
assert.strictEqual(e.routes.at(-1).replace,true);
assert(e.routes.at(-1).route.includes('q=Series%2001'));
actions.clearFilter('all');
assert.strictEqual(win.collectionsPageState.query,'Series 01','CLEAR ALL preserves search as before');
assert.strictEqual(e.renders.at(-1).items[0].route,'/app/collection/101-series-01');
assert(e.renders.at(-1).items[0].posterSlots.some(slot=>!slot.imageUrl&&slot.label==='Missing poster (2006)'));
actions.search('No matching series');
assert.strictEqual(e.renders.at(-1).emptyTitle,'No matching collections found.');
assert.strictEqual(e.renders.at(-1).bodyState,'empty');
assert.strictEqual(bridge.buildIndexModel({building:true}).bodyState,'loading');
assert.strictEqual(bridge.buildIndexModel({liveSearchLoading:true}).bodyState,'loading');
assert.strictEqual(bridge.buildIndexModel({error:'Provider unavailable'}).bodyState,'error');
assert.strictEqual(bridge.buildIndexModel({}).emptyTitle,'No collections found');
actions.back();assert.strictEqual(e.routes.at(-1).route,'/app/discover');
assert.strictEqual(JSON.stringify(win.DATA),original);
const count=e.renders.length,routeCount=e.routes.length,state=JSON.stringify(win.collectionsPageState);
win.activePage='collection-detail';
actions.search('Late debounce');actions.searchDraft('Late draft');actions.viewMore();actions.setFilter('sort','name.asc');actions.clearFilter('all');
bridge.renderIndex({loading:true});
assert.strictEqual(e.renders.length,count);assert.strictEqual(e.routes.length,routeCount);
assert.strictEqual(JSON.stringify(win.collectionsPageState),state,'departed index cannot accept old control timers');
const ui=fs.readFileSync('static/js/ui.js','utf8'),app=fs.readFileSync('static/js/app.js','utf8');
for(const name of ['renderCollectionsIndexPage','renderCollectionIndex','renderCollectionCard','renderCollectionPosterStackHTML'])assert(!ui.includes('function '+name));
assert(!app.includes('attachCollectionsPageEvents'));assert(!app.includes('collectionSearchTimer'));
console.log('Collections index native paging, filters, search, artwork, routes, and inactive-page guards passed.');
