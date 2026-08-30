const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/discover-vue-bridge.js', 'utf8');
const component = fs.readFileSync('frontend/src/search-discover/DiscoverHub.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/search-discover/discoverViewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

(async()=>{
    const calls = [];
    let legacyState = {
        loaded:true,
        loading:false,
        error:'',
        sections:[
            {
                key:'tv/popular',
                media:'tv',
                title:'Popular',
                route:'/app/discover/tv/popular',
                items:[
                    {id:10,media_type:'tv',name:'Example Show',first_air_date:'2026-01-02',poster_path:'/show.jpg'},
                    {id:0,media_type:'tv',name:'Invalid'}
                ]
            },
            {
                key:'movie/popular',
                media:'movie',
                title:'Popular',
                route:'/app/discover/movie/popular',
                items:[
                    {id:20,media_type:'movie',title:'Example Movie',release_date:'2025-03-04',poster_path:'/movie.jpg',adult:true}
                ]
            }
        ],
        genres:{
            tv:[{id:18,name:'Drama'},{id:10766,name:'Soap'}],
            movie:[{id:28,name:'Action'}]
        },
        collections:[
            {id:30,name:'Example Collection',movie_count:2,poster_slots:[{title:'Part One',release_date:'2020-01-01',poster_path:'/part.jpg'}]},
            {id:31,name:'Hidden Collection',hidden:true}
        ]
    };

    const context = {
        URL,
        window:{
            location:{pathname:'/app/list/watching',origin:'https://example.test'},
            discoverGenreMedia:'tv',
            TVTrackerDiscoverStateBridge:{
                ownership:'legacy-read-only',
                snapshot(){ return legacyState; }
            },
            trackerImageURL(path,size){ return `https://image.test/${size}${path}`; },
            getMediaPosterPlaceholderLabel(item){ return `placeholder:${item && (item.title || item.name) || 'item'}`; },
            getMovieDetailRoute(id,name){ return `/app/movie/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getShowDetailRoute(id,name){ return `/app/show/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getCollectionDetailRoute(id,name){ return `/app/collection/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getCollectionMovieCount(collection){ return Number(collection.movie_count || 0); },
            getCollectionPosterSlotsForRender(collection){ return Array.isArray(collection.poster_slots) ? collection.poster_slots : []; },
            getCollectionPosterSlotTitle(slot){ return slot.title || 'Untitled Movie'; },
            getCollectionPosterSlotYear(slot){ return String(slot.release_date || '').slice(0,4); },
            isPromotableCollection(collection){ return !!collection && collection.hidden !== true; },
            getGenreDetailRoute(id,name,media){ return `/app/genre/${media}/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            normalizeGenreMediaType(media){ return media === 'movie' ? 'movie' : 'tv'; },
            lockSearchRouteBeforeResultOpen(){ return '/app/discover'; },
            async openMoviePage(id,options){ calls.push(['movie',id,options]); },
            async openShowDetailsPage(id,options){ calls.push(['tv',id,options]); },
            ensureBrowseGlobalInteractionEvents(){ calls.push(['bind']); },
            restoreCollectionReturnPositionSoon(route){ calls.push(['restore',route]); },
            updateShellTitle(){ calls.push(['title']); },
            renderDiscoverHub(){ calls.push(['rerender']); }
        }
    };

    vm.createContext(context);
    vm.runInContext(bridgeSource, context);

    const bridge = context.window.TVTrackerDiscoverVueBridge;
    assert(bridge, 'Vue Discover bridge should exist');
    assert.strictEqual(bridge.ownership, 'vue-content');
    assert.strictEqual(context.window.renderDiscoverHubContent, bridge.render, 'stable Discover content target must move to Vue bridge');
    assert.deepStrictEqual(Object.keys(bridge.actions).sort(), ['openMedia','setGenreMedia']);

    let rendered = null;
    bridge.attachVueOwner({
        render(model){ rendered = model; },
        unmount(){}
    });

    context.window.renderDiscoverHubContent();
    assert(rendered, 'Vue owner should receive the Discover render model');
    assert.strictEqual(rendered.bodyState, 'ready');
    assert.strictEqual(rendered.tvRows.length, 1);
    assert.strictEqual(rendered.movieRows.length, 1);
    assert.strictEqual(rendered.tvRows[0].items.length, 1, 'invalid Discover items must stay filtered');
    assert.strictEqual(rendered.tvRows[0].items[0].route, '/app/show/10-example-show');
    assert.strictEqual(rendered.tvRows[0].items[0].posterUrl, 'https://image.test/w500/show.jpg');
    assert.strictEqual(rendered.tvRows[0].items[0].year, '2026');
    assert.strictEqual(rendered.movieRows[0].items[0].route, '/app/movie/20-example-movie');
    assert.strictEqual(rendered.movieRows[0].items[0].adult, true);
    assert.strictEqual(rendered.collections.length, 1, 'collection promotion filtering must remain upstream-compatible');
    assert.strictEqual(rendered.collections[0].route, '/app/collection/30-example-collection');
    assert.strictEqual(rendered.collections[0].countLabel, '2 movies');
    assert.strictEqual(rendered.collections[0].posterSlots[0].label, 'Part One (2020)');
    assert.strictEqual(rendered.genres.tv.length, 1, 'legacy TV Soap omission must be preserved');
    assert.strictEqual(rendered.genres.tv[0].name, 'Drama');
    assert.strictEqual(rendered.genres.tv[0].toneClass, 'discover-genre-tone-drama');
    assert.strictEqual(rendered.genres.movie[0].route, '/app/genre/movie/28-action');
    assert.strictEqual(rendered.activeGenreMedia, 'tv');
    assert(calls.some(call=>call[0] === 'restore' && call[1] === '/app/discover'), 'collection return position restore must remain wired');

    bridge.actions.setGenreMedia('movie');
    assert.strictEqual(context.window.discoverGenreMedia, 'movie');
    assert(calls.some(call=>call[0] === 'rerender'));

    await bridge.actions.openMedia({id:40,media:'movie',name:'Movie'});
    await bridge.actions.openMedia({id:41,media:'tv',name:'Show'});
    assert(calls.some(call=>call[0] === 'movie' && call[1] === 40 && call[2].navigationContext === 'discover'));
    assert(calls.some(call=>call[0] === 'tv' && call[1] === 41 && call[2].backRoute === '/app/discover'));

    legacyState = {loaded:false,loading:true,error:'',sections:[],genres:{tv:[],movie:[]},collections:[]};
    context.window.renderDiscoverHubContent();
    assert.strictEqual(rendered.bodyState, 'loading');

    legacyState = {loaded:false,loading:false,error:'boom',sections:[],genres:{tv:[],movie:[]},collections:[]};
    context.window.renderDiscoverHubContent();
    assert.strictEqual(rendered.bodyState, 'error');

    assert(viewModel.includes("export type DiscoverBodyState = 'loading' | 'error' | 'ready';"));
    assert(viewModel.includes('DiscoverPosterItem'));
    assert(viewModel.includes('DiscoverCollectionItem'));
    assert(viewModel.includes('DiscoverGenreItem'));
    assert(component.includes('data-tvtracker-discover-owner="vue"'));
    assert(component.includes('discover-hub-card'));
    assert(component.includes('discover-collection-row'));
    assert(component.includes('data-discover-genre-media="tv"'));
    assert(component.includes('data-discover-genre-media="movie"'));
    assert(component.includes('Discover failed to load'));
    assert(!component.includes('fetch('), 'Vue Discover component must not own network requests');
    assert(!component.includes('history.'), 'Vue Discover component must not own browser History');
    assert(!bridgeSource.includes('/api/'), 'Discover Vue bridge must not make provider/API requests');
    assert(!bridgeSource.includes('history.pushState'), 'Discover Vue bridge must not own browser History writes');
    assert(!bridgeSource.includes('history.replaceState'), 'Discover Vue bridge must not own browser History writes');
    assert(main.includes("import DiscoverHub from './search-discover/DiscoverHub.vue';"));
    assert(main.includes('createApp(DiscoverHub'));
    assert(main.includes('window.TVTrackerDiscoverVueBridge?.attachVueOwner(discoverOwner);'));
    assert(main.includes('unmountDiscover();'), 'Search/Discover owners must coordinate their shared root');
    assert(main.includes('unmountSearch();'), 'Discover/Search owners must coordinate their shared root');
    assert(ui.includes('function renderDiscoverHub()'), 'Discover stability gate must remain legacy-owned in this bounded slice');
    assert(ui.includes('function renderDiscoverHubContent()'), 'legacy Discover content renderer may remain physically while runtime ownership moves');
    assert(ui.includes('window.renderDiscoverHub = renderDiscoverHub'), 'stability gate entry point must remain unchanged');
    assert(bridgeSource.includes('global.renderDiscoverHubContent = render'), 'runtime stable Discover content ownership must move to Vue bridge');

    const stateBridgeIndex = template.indexOf("filename='js/discover-state-bridge.js'");
    const vueBridgeIndex = template.indexOf("filename='js/discover-vue-bridge.js'");
    const routerIndex = template.indexOf("filename='js/app-router.js'");
    assert(stateBridgeIndex >= 0, 'Discover state bridge must remain loaded');
    assert(vueBridgeIndex > stateBridgeIndex, 'Vue Discover bridge must load after the read-only state bridge');
    assert(routerIndex > vueBridgeIndex, 'Vue Discover bridge must load before routing/startup invokes Discover rendering');

    console.log('Frontend modernization Vue Discover renderer parity checks passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
