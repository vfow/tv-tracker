const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const bridgeSource = fs.readFileSync('static/js/discover-vue-bridge.js', 'utf8');
const trendingSource = fs.readFileSync('static/js/trending.js', 'utf8');
const component = fs.readFileSync('frontend/src/search-discover/TrendingPage.vue', 'utf8');

function environment() {
    const calls = [], renders = [], failures = [];
    const win = {
        location: {pathname:'/app/list/watching',search:'',origin:'https://example.test'},
        activePage:'discovery-detail',
        getShowDetailRoute:(id)=>`/app/show/${id}-show`,
        getMovieDetailRoute:(id)=>`/app/movie/${id}-movie`,
        getMediaPosterPlaceholderLabel:()=> 'Synthetic placeholder',
        trackerImageURL:(path)=>`https://image.test${path}`,
        navigateBackOrRouteFallback:route=>calls.push(['back',route]),
        openShowDetailsPage:async(id,options)=>calls.push(['tv',id,options]),
        openMoviePage:async(id,options)=>calls.push(['movie',id,options]),
        TVTrackerClientRuntime:{report(){},renderSurfaceFailure:model=>failures.push(model)},
        TVTrackerRouter:{
            setPathRoute(route){const url=new URL(route,'https://example.test');win.location.pathname=url.pathname;win.location.search=url.search;},
            registerRouteHandler(){}
        }
    };
    const context = {window:win,URL,URLSearchParams,setTimeout,clearTimeout,console};
    vm.createContext(context);
    vm.runInContext(bridgeSource,context);
    vm.runInContext(trendingSource,context);
    const bridge = win.TVTrackerDiscoverVueBridge;
    const owner = {render:model=>renders.push(model),unmount(){}};
    return {win,bridge,owner,renders,calls,failures,route:key=>win.TVTrackerRouter.setPathRoute(win.TVTrackerTrending.routeFor(key))};
}

(async()=>{
    const env=environment();
    for(const key of ['tv-day','tv-week','movie-day','movie-week']){
        const config=env.win.TVTrackerTrending.CONFIGS[key];
        env.route(key);
        const model=env.bridge.buildTrendingModel(config,[
            {id:20,media_type:config.media,title:'<script>synthetic</script>',vote_average:8.54,adult:true,_eyeFaded:true,release_date:'2026-01-02'},
            {id:10,media_type:config.media,name:'Second',poster_path:'/second.jpg',vote_average:0}
        ],false,'');
        assert.deepStrictEqual(Array.from(model.items,item=>item.id),[20,10], 'TMDB ranking stays intact');
        assert.strictEqual(model.items[0].rating,'8.5');
        assert.strictEqual(model.items[0].adult,config.media==='movie');
        assert.strictEqual(model.items[0].faded,true);
        assert.strictEqual(model.items[0].name,'<script>synthetic</script>', 'text stays data for Vue escaping');
        assert.strictEqual(model.items[0].placeholderLabel,'Synthetic placeholder');
        assert.strictEqual(model.items[1].posterUrl,'https://image.test/second.jpg');
        assert.strictEqual(model.items[1].rating,'');
        assert(Object.isFrozen(model)&&Object.isFrozen(model.items)&&Object.isFrozen(model.items[0]));
        await env.bridge.trendingActions.openMedia(model.items[0],key);
        assert.strictEqual(env.calls.at(-1)[0],config.media);
        assert.strictEqual(env.calls.at(-1)[2].backRoute,env.win.TVTrackerTrending.routeFor(key));
    }
    const config=env.win.TVTrackerTrending.CONFIGS['movie-week'];
    assert.strictEqual(env.bridge.buildTrendingModel(config,[],true,'').bodyState,'loading');
    assert.strictEqual(env.bridge.buildTrendingModel(config,[],false,'').bodyState,'empty');
    assert.strictEqual(env.bridge.buildTrendingModel(config,[{id:1}],true,'failure').bodyState,'error');
    env.bridge.renderTrending(config,[],true,'');
    env.bridge.attachTrendingOwner(env.owner);
    assert.strictEqual(env.renders.at(-1).bodyState,'loading','late assets preserve loading model');
    env.win.activePage='search';
    env.bridge.renderTrending(config,[{id:3}],false,'');
    assert.strictEqual(env.renders.length,1,'late requests cannot render over another route');
    env.bridge.trendingActions.back();
    assert.deepStrictEqual(env.calls.at(-1),['back','/app/discover']);

    const late=environment();
    late.route('tv-day');
    late.bridge.renderTrending(late.win.TVTrackerTrending.CONFIGS['tv-day'],[],true,'');
    assert.strictEqual(late.failures[0].rootId,'genre-detail-content','missing assets use shared failure surface');
    late.route('movie-day');
    late.bridge.attachTrendingOwner(late.owner);
    assert.strictEqual(late.renders.length,0,'assets from an old Trending key cannot replace the new one');
    late.bridge.renderLoadFailure();
    assert.strictEqual(late.failures.length,1,'stale failures cannot replace another Trending key');

    const request=environment();
    let finish;
    request.win.tmdbFetchJSON=()=>new Promise(resolve=>{finish=resolve;});
    request.bridge.attachTrendingOwner(request.owner);
    const pending=request.win.TVTrackerTrending.openPage('tv-day');
    assert.strictEqual(request.renders.at(-1).bodyState,'loading');
    request.route('movie-day');
    finish({results:[{id:44,name:'Late result'}]});
    await pending;
    assert.strictEqual(request.renders.length,1,'late feed response cannot overwrite another route');

    assert(!trendingSource.includes('.innerHTML'), 'Trending service no longer composes HTML');
    assert(!trendingSource.includes('attachFullPageEvents'), 'replaced card/back binders are removed');
    assert(!trendingSource.includes('renderGenrePosterGridCard'), 'no legacy card composition dependency');
    assert(!component.includes('v-html')&&!component.includes('fetch('));
    for(const key of ['metaKey','ctrlKey','shiftKey','altKey','defaultPrevented']) assert(component.includes(key));
    console.log('Trending native composition, parity, actions, and route-race tests passed.');
})().catch(error=>{console.error(error);process.exit(1);});
