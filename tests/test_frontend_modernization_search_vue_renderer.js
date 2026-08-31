const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/search-state-bridge.js', 'utf8');
const component = fs.readFileSync('frontend/src/search-discover/SearchResults.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/search-discover/searchViewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const tailwindConfig = fs.readFileSync('tailwind.config.js', 'utf8');

(async()=>{
    const calls = [];
    const context = {
        URL,
        window:{
            location:{pathname:'/app/list/watching',origin:'https://example.test'},
            activePage:'search',
            searchRouteState:{query:'dune',media:'movie',fadeWatched:true,hideWatched:false,hidePlan:true,hideFavorites:false},
            discoverSearchState:{query:'dune',media:'movie',page:1,totalPages:2,visibleLimit:21,loading:false,fadeWatched:true,hideWatched:false,hidePlan:true,hideFavorites:false},
            getEyeFilteredRenderItems(items){ return items.filter(item=>item && item.hidden !== true); },
            getMovieDetailRoute(id,name){ return `/app/movie/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getShowDetailRoute(id,name){ return `/app/show/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getPersonDetailRoute(role,id,name){ return `/app/person/${role}/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getCollectionDetailRoute(id,name){ return `/app/collection/${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
            getMediaPosterPlaceholderLabel(item){ return `placeholder:${item && (item.title || item.name) || 'item'}`; },
            getCollectionPosterSlotsForRender(collection){ return Array.isArray(collection.poster_slots) ? collection.poster_slots : []; },
            getCollectionPosterSlotTitle(slot){ return slot.title || 'Untitled Movie'; },
            getCollectionPosterSlotYear(slot){ return String(slot.release_date || '').slice(0,4); },
            getCollectionMovieCount(collection){ return Number(collection.movie_count || 0); },
            shouldKeepEyeFilterMenuOpen(){ return true; },
            ensureBrowseGlobalInteractionEvents(){ calls.push(['bind-eye-events']); },
            updateShellTitle(){ calls.push(['title']); },
            lockSearchRouteBeforeResultOpen(){ return '/app/search?q=dune&media=movie'; },
            setSearchMediaType(media){ calls.push(['set-media',media]); },
            loadMoreSearchResults(){ calls.push(['load-more']); },
            async openMoviePage(id,options){ calls.push(['movie',id,options]); },
            async openShowDetailsPage(id,options){ calls.push(['tv',id,options]); },
            async openPersonPage(role,id,options){ calls.push(['person',role,id,options]); },
            async openCollectionDetailPage(id,options){ calls.push(['collection',id,options]); }
        }
    };
    vm.createContext(context);
    vm.runInContext(bridgeSource, context);

    const bridge = context.window.TVTrackerSearchVueBridge;
    assert(bridge, 'Vue Search bridge should exist');
    assert.strictEqual(bridge.ownership, 'vue');
    assert.strictEqual(context.window.renderSearchResults, bridge.render);

    let rendered = null;
    bridge.attachVueOwner({
        render(model){ rendered = model; },
        unmount(){}
    });

    context.window.renderSearchResults([
        {id:10,media_type:'tv',name:'Wrong Media'},
        {id:11,media_type:'movie',title:'Dune',release_date:'2021-10-22',vote_average:8.1,poster_path:'/dune.jpg',adult:true,_eyeFaded:true,overview:'Arrakis'},
        {id:12,media_type:'movie',title:'Hidden Movie',hidden:true}
    ]);

    assert(rendered, 'Vue owner should receive the Search render model');
    assert.strictEqual(rendered.query, 'dune');
    assert.strictEqual(rendered.media, 'movie');
    assert.strictEqual(rendered.bodyState, 'results');
    assert.strictEqual(rendered.eyeMenuOpen, true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rendered.eyeState)), {
        fadeWatched:true,
        hideWatched:false,
        hidePlan:true,
        hideFavorites:false
    });
    assert.strictEqual(rendered.canLoadMore, true, 'next provider page should preserve VIEW MORE');
    assert.strictEqual(rendered.items.length, 1, 'eye-filtered/other-media items must not render');
    assert.strictEqual(rendered.items[0].kind, 'media');
    assert.strictEqual(rendered.items[0].media, 'movie');
    assert.strictEqual(rendered.items[0].route, '/app/movie/11-dune');
    assert.strictEqual(rendered.items[0].posterUrl, 'https://image.tmdb.org/t/p/w500/dune.jpg');
    assert.strictEqual(rendered.items[0].year, '2021');
    assert.strictEqual(rendered.items[0].ratingLabel, ' • 8.1');
    assert.strictEqual(rendered.items[0].adult, true);
    assert.strictEqual(rendered.items[0].eyeFaded, true);

    context.window.discoverSearchState = {query:'amy',media:'person',page:1,totalPages:1,visibleLimit:21,loading:false};
    context.window.renderSearchResults([
        {id:20,media_type:'person',name:'Amy Adams',profile_path:'/amy.jpg'},
        {id:21,media_type:'movie',title:'Arrival'}
    ]);
    assert.strictEqual(rendered.media, 'person');
    assert.strictEqual(rendered.items.length, 1);
    assert.strictEqual(rendered.items[0].kind, 'person');
    assert.strictEqual(rendered.items[0].route, '/app/person/person/20-amy-adams');
    assert.strictEqual(rendered.items[0].photoUrl, 'https://image.tmdb.org/t/p/h632/amy.jpg');

    context.window.discoverSearchState = {query:'matrix',media:'collection',page:1,totalPages:1,visibleLimit:21,loading:false};
    context.window.renderSearchResults([{
        id:30,
        media_type:'collection',
        name:'The Matrix Collection',
        movie_count:3,
        poster_slots:[
            {title:'The Matrix',release_date:'1999-03-31',poster_path:'/matrix.jpg'},
            {title:'Reloaded',release_date:'2003-05-15',poster_path:'/reloaded.jpg'}
        ]
    }]);
    assert.strictEqual(rendered.items[0].kind, 'collection');
    assert.strictEqual(rendered.items[0].route, '/app/collection/30-the-matrix-collection');
    assert.strictEqual(rendered.items[0].countLabel, '3 movies');
    assert.strictEqual(rendered.items[0].posterSlots.length, 2);
    assert.strictEqual(rendered.items[0].posterSlots[0].label, 'The Matrix (1999)');

    context.window.discoverSearchState = {query:'none',media:'tv',page:1,totalPages:1,visibleLimit:21,loading:false};
    context.window.renderSearchResults([]);
    assert.strictEqual(rendered.bodyState, 'empty');
    assert.strictEqual(rendered.emptyHeading, 'No TV Shows found');

    context.window.renderSearchResults([{id:40,media_type:'tv',name:'Filtered',hidden:true}]);
    assert.strictEqual(rendered.bodyState, 'empty');
    assert.strictEqual(rendered.emptyHeading, 'No results found', 'filtered-empty copy must match the legacy renderer');

    context.window.discoverSearchState = {query:'loading',media:'tv',page:1,totalPages:1,visibleLimit:21,loading:true};
    context.window.renderSearchResults([]);
    assert.strictEqual(rendered.bodyState, 'loading');

    context.window.discoverSearchState = {query:'',media:'tv',page:1,totalPages:1,visibleLimit:21,loading:false};
    context.window.renderSearchResults([]);
    assert.strictEqual(rendered.bodyState, 'prompt');

    bridge.actions.setMedia('person');
    bridge.actions.setMedia('unexpected');
    bridge.actions.loadMore();
    await bridge.actions.openMedia({id:50,media:'movie',name:'Movie'});
    await bridge.actions.openMedia({id:51,media:'tv',name:'Show'});
    await bridge.actions.openPerson({id:52,name:'Person'});
    await bridge.actions.openCollection({id:53,name:'Collection'});

    assert(calls.some(call=>call[0] === 'set-media' && call[1] === 'person'));
    assert(calls.some(call=>call[0] === 'set-media' && call[1] === 'tv'), 'invalid media action should preserve TV fallback');
    assert(calls.some(call=>call[0] === 'load-more'));
    assert(calls.some(call=>call[0] === 'movie' && call[1] === 50));
    assert(calls.some(call=>call[0] === 'tv' && call[1] === 51));
    assert(calls.some(call=>call[0] === 'person' && call[2] === 52));
    assert(calls.some(call=>call[0] === 'collection' && call[1] === 53));

    assert(viewModel.includes("export type SearchBodyState = 'prompt' | 'loading' | 'results' | 'empty';"));
    assert(viewModel.includes('SearchPosterItem'));
    assert(viewModel.includes('SearchPersonItem'));
    assert(viewModel.includes('SearchCollectionItem'));
    assert(component.includes('data-tvtracker-search-owner="vue"'));
    assert(component.includes("{ type: 'tv', label: 'TV Shows' }"));
    assert(component.includes("{ type: 'movie', label: 'Movies' }"));
    assert(component.includes("{ type: 'person', label: 'People' }"));
    assert(component.includes("{ type: 'collection', label: 'Collections' }"));
    assert(component.includes('data-eye-toggle'));
    assert(component.includes('search-result-poster-card'));
    assert(component.includes('search-person-card'));
    assert(component.includes('search-person-skeleton-card'));
    assert(tailwindConfig.includes("'search-person-skeleton-card'"), 'Vue-owned person skeleton styling must remain safelisted for Tailwind');
    assert(component.includes('collection-search-card'));
    assert(component.includes('search-load-more-button'));
    assert(component.includes('Start typing to search.'));
    assert(component.includes('Try another tab or another search.'));
    assert(!component.includes('fetch('), 'Vue Search renderer must not own network requests');
    assert(!component.includes('history.'), 'Vue Search renderer must not own browser History');
    assert(main.includes("FRONTEND_FOUNDATION_VERSION = 'phase5-shared-ui-feedback'"));
    assert(main.includes('createApp(SearchResults'));
    assert(main.includes('window.TVTrackerSearchVueBridge?.attachVueOwner(searchOwner);'));
    assert(!ui.includes('function renderSearchResults(resultsList)'), 'legacy Search renderer must stay deleted after Vue ownership transfer');
    assert(bridgeSource.includes('global.renderSearchResults = render'), 'runtime Search renderer ownership must move to Vue bridge');

    console.log('Frontend modernization Vue Search renderer parity checks passed.');
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
