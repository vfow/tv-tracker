const assert=require('assert'),fs=require('fs'),vm=require('vm');
function environment(){
 const renders=[],routes=[],opens=[],requests=[];
 const win={console,URL,URLSearchParams,setTimeout,clearTimeout,location:{origin:'https://test.invalid'},document:{addEventListener(){},getElementById(){return null;}},sessionStorage:{getItem(){return null;},setItem(){}}};win.window=win;vm.createContext(win);
 for(const file of ['app.js','ui.js','discover-browse.js','discover-vue-bridge.js'])vm.runInContext(fs.readFileSync('static/js/'+file,'utf8'),win,{filename:file});
 win.activePage='browse-detail';win.updateShellTitle=()=>{};win.ensureBrowseReferenceData=async()=>{};win.getCurrentAppRoute=()=>routes.at(-1)||'/app/browse/movie';
 win.getMovieTrackingState=id=>({watched:id==='1',plan:false,favorite:false});
 win.browseOptionState.genres={movie:[{id:28,name:'Action'},{id:35,name:'Comedy'}],tv:[{id:10759,name:'Action & Adventure'},{id:35,name:'Comedy'}]};
 win.browseOptionState.countries=[{code:'gb',name:'United Kingdom'}];win.browseOptionState.languages=[{code:'en',name:'English'}];win.browseOptionState.providers={movie:[{id:8,name:'Netflix',logo_path:'/logo.png'}],tv:[]};win.browseOptionState.movieCertifications=['PG-13'];
 const shows=[{id:1,media_type:'movie',title:'Synthetic adult movie',adult:true,vote_average:8.51,release_date:'2008-01-01'},{id:2,media_type:'movie',title:'Synthetic other movie',release_date:'2005-01-01'}];
 win.browsePageState={media:'movie',filters:win.createBrowseFilterState('movie'),labels:win.createBrowseLabelState(),shows,page:1,totalPages:3};
 win.navigateToBrowseState=async(state,labels)=>{win.activePage='browse-detail';win.browsePageState.filters=state;win.browsePageState.media=state.media;win.browsePageState.labels=labels;routes.push(win.getBrowseRoute(state));win.renderActiveBrowsePage();};
 win.openMoviePage=async(id,options)=>opens.push({id,options,media:'movie'});win.openShowDetailsPage=async(id,options)=>opens.push({id,options,media:'tv'});win.openDiscoverShowModal=async(item)=>opens.push({item,media:'preview'});
 win.navigateBackOrRouteFallback=route=>routes.push(route);win.loadBrowsePageResults=async(options)=>requests.push(options);
 const bridge=win.TVTrackerDiscoverVueBridge;bridge.attachListingOwner({render:model=>renders.push(model),unmount(){}});
 return {win,bridge,renders,routes,opens,requests,shows,actions:bridge.listingActions};
}
(async()=>{
 const e=environment(),{win,bridge,actions}=e,original=JSON.stringify(win.DATA),showsBefore=JSON.stringify(e.shows);
 let model=e.renders.at(-1);assert.strictEqual(model.title,'Browse Movies');assert.strictEqual(model.items.length,2);assert.strictEqual(model.items[0].rating,'8.5');assert.strictEqual(model.items[0].adult,true);assert.strictEqual(model.hasMore,true);
 assert(model.controls.menus.find(x=>x.key==='country').choices[1].search.includes('uk great britain britain'));
 for(const choice of [
 {key:'genres',value:'28',label:'Action',multi:true},{key:'country',value:'gb',label:'United Kingdom'},{key:'language',value:'en',label:'English'},
 {key:'providers',value:'8',label:'Netflix',multi:true},{key:'themes',value:'7',label:'Time Travel',multi:true},{key:'companies',value:'9',label:'Studio',multi:true},
 {key:'runtime',value:'150-179',label:'150–179 minutes'},{key:'decade',value:'2000',label:'2000s'},{key:'year',value:'2008',label:'2008'},{key:'certification',value:'pg-13',label:'PG-13'},{key:'sort',value:'date-asc',label:'Oldest'}])await actions.choose(choice);
 model=e.renders.at(-1);assert.strictEqual(model.controls.year,'2008');assert.strictEqual(model.controls.selectedDecade,2000);assert(model.controls.chips.some(x=>x.key==='providers'&&x.label==='Netflix'));assert(e.routes.at(-1).includes('runtime=150-179'));assert(e.routes.at(-1).includes('sort=date-asc'));
 await actions.toggleEye('hideWatched');assert.deepStrictEqual(Array.from(e.renders.at(-1).items,x=>x.id),[2]);
 await actions.openMedia(e.renders.at(-1).items[0]);assert.strictEqual(e.opens.at(-1).options.backRoute,e.routes.at(-1));
 await actions.remove({key:'genres',value:'28'});assert.strictEqual(e.renders.at(-1).controls.chips.some(x=>x.key==='genres'),false);
 await actions.viewMore();assert.strictEqual(e.requests.at(-1).append,true);
 win.browsePageState.loading=true;await actions.viewMore();assert.strictEqual(e.requests.length,1);win.browsePageState.loading=false;
 await actions.clear();assert.strictEqual(e.renders.at(-1).controls.chips.length,0);assert.strictEqual(win.browsePageState.filters.sort,'popularity-desc');
 win.genrePageState={genreId:28,name:'Action',media:'movie',shows:e.shows,browse:win.createBrowseFilterState('movie'),browseLabels:{}};win.activePage='genre-detail';win.renderActiveGenrePage();model=e.renders.at(-1);
 assert.strictEqual(model.kind,'genre');assert(model.controls.chips.some(x=>x.key==='genres'&&x.value==='28'));await actions.openMedia({...model.items[0],media:'tv'});assert.strictEqual(e.opens.at(-1).media,'preview');
 win.discoveryPageState={type:'company',value:'9',name:'Studio',media:'movie',shows:e.shows,browse:win.createBrowseFilterState('movie'),browseLabels:{companies:{9:'Studio'}}};win.activePage='discovery-detail';win.renderActiveDiscoveryFilterPage();model=e.renders.at(-1);assert.strictEqual(model.title,'Studio');assert(model.controls.chips.some(x=>x.key==='companies'&&x.value==='9'));
 win.discoveryPageState.type='discover-category';win.discoveryPageState.value='movie-popular';win.getDiscoverCategoryConfig=()=>({media:'movie',category:'popular'});model=bridge.buildListingModel('discovery',win.discoveryPageState);assert.strictEqual(model.showMedia,false);assert.strictEqual(model.controls.menus.some(x=>x.key==='sort'),false);
 win.discoveryPageState.type='certification';win.discoveryPageState.value='tv/tv-ma';win.discoveryPageState.media='tv';model=bridge.buildListingModel('discovery',win.discoveryPageState);assert.strictEqual(model.controls,null);
 win.activePage='browse-detail';win.browsePageState.media='movie';win.browsePageState.filters=win.createBrowseFilterState('movie');
 for(const [state,expected] of [[{shows:[],loading:true},'loading'],[{shows:[],error:'Provider failed'},'error'],[{shows:[]},'empty'],[{shows:e.shows,loading:true},'ready']]){model=bridge.buildListingModel('browse',{media:'movie',filters:{},...state});assert.strictEqual(model.bodyState,expected);}
 win.searchBrowsePicker=async()=>[{id:1,name:'Same',origin_country:'GB',logo_path:'/one.png'},{id:2,name:'Same',origin_country:'US'}];const matches=await actions.searchPicker('company','Same');assert(matches[0].country);assert.notStrictEqual(matches[0].label,matches[1].label);assert(matches[0].logo.endsWith('/one.png'));
 let resolve;win.searchBrowsePicker=()=>new Promise(r=>resolve=r);const pending=actions.searchPicker('company','later');win.activePage='shows';resolve([{id:3,name:'Late'}]);assert.strictEqual((await pending).length,0);
 const before=e.renders.length;win.renderActiveBrowsePage();await actions.choose({key:'year',value:'2010'});assert.strictEqual(e.renders.length,before,'inactive listing actions do not navigate');
 assert.strictEqual(JSON.stringify(win.DATA),original);assert.strictEqual(JSON.stringify(e.shows),showsBefore);assert(Object.isFrozen(model)&&Object.isFrozen(model.items));
 for(const name of ['renderBrowseDetailPage','renderGenreDetailPage','renderDiscoveryFilterDetailPage','renderBrowseControlsHTML','renderGenrePosterGridCard'])assert(!fs.readFileSync('static/js/ui.js','utf8').includes('function '+name));
 console.log('Native Browse/Genre/discovery filters, models, paging, actions, routes, stale pickers and tracker integrity passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
