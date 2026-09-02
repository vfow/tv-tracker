const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/movie-details-vue-bridge.js', 'utf8');
const stateBridgeSource = fs.readFileSync('static/js/media-details-state-bridge.js', 'utf8');
const nodeModelSource = fs.readFileSync('static/js/media-details-node-model.js', 'utf8');
const component = fs.readFileSync('frontend/src/media-details/MovieDetails.vue', 'utf8');
const nodeComponent = fs.readFileSync('frontend/src/media-details/DetailNode.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/media-details/movieViewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

function freeze(value){
    if(Array.isArray(value)){
        value.forEach(freeze);
        return Object.freeze(value);
    }
    if(value && typeof value === 'object' && !Object.isFrozen(value)){
        Object.keys(value).forEach(key=>freeze(value[key]));
        Object.freeze(value);
    }
    return value;
}

const fragmentCalls = [];
const nodeModel = {
    ownership:'typed-node-model',
    text(value){
        return Object.freeze({kind:'text',text:String(value === null || typeof value === 'undefined' ? '' : value)});
    },
    element(tag,attrs,children){
        return Object.freeze({kind:'element',tag,attrs:Object.freeze(attrs || {}),children:Object.freeze(children || [])});
    },
    fragment(html){
        fragmentCalls.push(String(html || ''));
        return Object.freeze([{kind:'text',text:String(html || '')}]);
    },
    freeze
};

const legacyChromeFunctions = [
    'renderPosterTitlePlaceholderHTML',
    'renderYearLinkHTML',
    'renderCertificationLinkHTML',
    'renderRuntimeDetailLinkHTML',
    'renderMovieDirectedByHTML',
    'renderMovieGenresHTML',
    'renderAdultMovieBadgeHTML',
    'renderMovieExternalLinksHTML',
    'renderMovieActionButtonsHTML',
    'renderMovieTabsHTML'
];
const legacyCalls = [];
const trackingStates = new Map();
const calls = [];
const movie = {
    id:101,
    title:'Example <Movie>',
    original_title:'Original Movie',
    poster_path:'/poster.png',
    backdrop_path:'/backdrop.png',
    year:'2024',
    runtime:125,
    vote_average:7.84,
    adult:true,
    release_date:'2024-04-05',
    release_dates:{results:[
        {iso_3166_1:'GB',release_dates:[{certification:'15'}]},
        {iso_3166_1:'us',release_dates:[{certification:' '},{certification:'PG-13'},{certification:'R'}]}
    ]},
    crew:[
        {id:9,name:'Director <One>',job:'director'},
        {id:9,name:'Duplicate ID',job:'Director'},
        {id:0,name:'No ID Director',job:'DIRECTOR'},
        {id:0,name:'No ID Director',job:'Director'},
        {id:10,name:'Writer',job:'Writer'}
    ],
    genres:[{id:18,name:'Drama & More'},'No Route',{id:0,name:'Fallback'}],
    external_ids:{imdb_id:'tt0101'},
    videos:{results:[
        {site:'Vimeo',type:'Trailer',key:'wrong-site'},
        {site:'YouTube',type:'Teaser',key:'wrong-type'},
        {site:'youtube',type:'Official Trailer',key:'trailer101'}
    ]},
    homepage:'https://movie.example/path'
};
const pageState = {movieId:'101',routeSlug:'example-movie',loading:false,error:'',movie};

const context = {
    URL,
    window:{
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        moviePageState:pageState,
        activeMovieDetailsTab:'Info',
        TVTrackerMediaDetailsNodeModel:nodeModel,
        trackerBackgroundImage(path,size){
            calls.push(['background',path,size]);
            return 'url("/image/backdrop.png")';
        },
        trackerImageURL(path,size){
            calls.push(['image',path,size]);
            return `/image/${size}${path}`;
        },
        getMediaPosterPlaceholderLabel(nextMovie,media){
            calls.push(['placeholder',nextMovie,media]);
            const year = String(nextMovie.release_date || '').slice(0,4);
            return year ? `${nextMovie.title} (${year})` : nextMovie.title;
        },
        getYearDetailRoute(year,media){ return `/app/year/${media}/${year}`; },
        getCertificationDetailRoute(media,rating){ return `/app/certification/${media}/${rating.toLowerCase()}`; },
        getRuntimeBrowseRoute(runtime,media){ return `/app/browse/${media}?runtime=${runtime}`; },
        getPersonDetailRoute(role,id,name,media){ return `/app/person/${media}/${role}/${id}-${String(name).toLowerCase()}`; },
        getShowGenreRoute(genre,media){
            return genre.id ? `/app/genre/${media}/${genre.id}-${genre.name.toLowerCase()}` : '/app/list/watching';
        },
        buildRouteKey(id,name){ return `${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
        safeExternalURL(value){
            const raw = String(value || '').trim();
            if(!raw) return '';
            try{
                const parsed = new URL(raw);
                return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
            }catch(error){
                return '';
            }
        },
        getMovieTrackingState(id){
            calls.push(['tracking-state',id]);
            return trackingStates.get(String(id)) || {watched:false,plan:false,favorite:false};
        },
        renderMovieActiveTabContentHTML(nextMovie){
            calls.push(['content',nextMovie]);
            return '<section>Synopsis panel</section>';
        },
        attachMovieDetailPageEvents(){ calls.push(['bind']); },
        updateShellTitle(){ calls.push(['title']); }
    }
};
legacyChromeFunctions.forEach(name=>{
    context.window[name] = function(){
        legacyCalls.push(name);
        throw new Error(`${name} must not be called`);
    };
});
vm.createContext(context);
vm.runInContext(bridgeSource,context);

const bridge = context.window.TVTrackerMovieDetailsVueBridge;
assert(bridge, 'Movie Details Vue bridge should exist');
assert.strictEqual(bridge.ownership,'vue-dom');
assert.strictEqual(context.window.renderMovieDetailPage,bridge.render);
assert.deepStrictEqual(Object.keys(bridge).sort(),['attachVueOwner','buildViewModel','ownership','render','renderLoadFailure']);

function flatten(value,result=[]){
    (Array.isArray(value) ? value : [value]).forEach(node=>{
        if(!node || typeof node !== 'object') return;
        if(node.kind) result.push(node);
        if(Array.isArray(node.children)) flatten(node.children,result);
    });
    return result;
}

function nodesWithClass(nodes,className){
    return flatten(nodes).filter(node=>
        node.kind === 'element' && String(node.attrs.class || '').split(/\s+/).includes(className)
    );
}

function textOf(value){
    return flatten(value).filter(node=>node.kind === 'text').map(node=>node.text).join('');
}

function topLevelGroups(meta){
    const groups = [[]];
    meta.forEach(node=>{
        if(node.kind === 'element' && node.attrs.class === 'modal-meta-separator') groups.push([]);
        else groups[groups.length - 1].push(node);
    });
    return groups.map(textOf);
}

function nodeByText(nodes,label){
    return flatten(nodes).find(node=>node.kind === 'element' && textOf(node) === label);
}

function runtimeElement(node){
    const listeners = {};
    const dataset = {};
    Object.entries(node.attrs || {}).forEach(([name,value])=>{
        if(!name.startsWith('data-')) return;
        dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())] = String(value);
    });
    return {
        dataset,
        disabled:node.attrs.disabled === true,
        isConnected:true,
        textContent:textOf(node),
        addEventListener(type,handler){
            if(!listeners[type]) listeners[type] = [];
            listeners[type].push(handler);
        },
        dispatch(type,overrides={}){
            const event = Object.assign({
                button:0,
                defaultPrevented:false,
                preventDefault(){ this.defaultPrevented = true; },
                stopPropagation(){ this.propagationStopped = true; }
            },overrides);
            const results = (listeners[type] || []).map(handler=>handler.call(this,event));
            return {event,results};
        },
        closest(){ return null; },
        querySelector(){ return null; },
        setAttribute(){}
    };
}

const model = bridge.buildViewModel(pageState);
assert.strictEqual(model.surface,'movie');
assert.strictEqual(model.state,'ready');
assert.strictEqual(model.title,'Example <Movie>','source text must not be pre-escaped');
assert(!Object.prototype.hasOwnProperty.call(model,'html'));
assert(Object.isFrozen(model) && Object.isFrozen(model.meta) && Object.isFrozen(model.actions));
assert.strictEqual(legacyCalls.length,0,'legacy Movie chrome composers must never run');
assert.strictEqual(fragmentCalls.length,1,'each ready model must parse exactly the retained active panel fragment');
assert.strictEqual(fragmentCalls[0],'<section>Synopsis panel</section>');
assert(!Object.isFrozen(movie),'the recursively frozen model must not include the source movie');
assert(!Object.isFrozen(movie.crew[0]),'nested crew records must remain mutable domain records');
assert(!Object.isFrozen(movie.genres[0]),'nested genre records must remain mutable domain records');
assert(!Object.isFrozen(movie.videos.results[0]),'nested video records must remain mutable domain records');

assert.strictEqual(model.poster.length,1);
assert.strictEqual(model.poster[0].tag,'img');
assert.strictEqual(model.poster[0].attrs.src,'/image/w500/poster.png');
assert.strictEqual(model.poster[0].attrs.alt,'Example <Movie> poster');
assert(calls.some(call=>call[0] === 'image' && call[1] === '/poster.png' && call[2] === 'w500'));
assert.strictEqual(model.backdropStyle,'linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), url("/image/backdrop.png")');
const noArtwork = {...movie,poster_path:'',backdrop_path:''};
const noArtworkModel = bridge.buildViewModel({...pageState,movie:noArtwork});
assert.strictEqual(noArtworkModel.poster[0].attrs.class,'poster-placeholder media-title-placeholder');
assert.strictEqual(noArtworkModel.poster[0].attrs.title,'Example <Movie> (2024)');
assert.strictEqual(textOf(noArtworkModel.poster),'Example <Movie> (2024)');
assert.strictEqual(noArtworkModel.backdropStyle,'linear-gradient(to top, #080808 0%, #141414 100%)');

assert.deepStrictEqual(topLevelGroups(model.meta),[
    '2024','PG-13','2h 5m','Directed by Director <One>, No ID Director','Drama & More•No Route•Fallback','ADULT','7.8/10'
]);
const yearLink = nodesWithClass(model.meta,'show-detail-year-link')[0];
assert.strictEqual(yearLink.attrs.href,'/app/year/movie/2024');
const certificationLink = nodesWithClass(model.meta,'show-detail-certification-link')[0];
assert.strictEqual(certificationLink.attrs.href,'/app/certification/movie/pg-13');
const runtimeLink = nodesWithClass(model.meta,'show-runtime-link')[0];
assert.strictEqual(runtimeLink.attrs.href,'/app/browse/movie?runtime=125');
assert.strictEqual(runtimeLink.attrs.title,'Browse titles by runtime');
const directorLinks = nodesWithClass(model.meta,'show-detail-person-link');
assert.strictEqual(directorLinks.length,1,'directors must deduplicate by ID or name and leave ID-less people as text');
assert.strictEqual(directorLinks[0].attrs.href,'/app/person/movie/director/9-director <one>');
assert.strictEqual(nodesWithClass(model.meta,'show-detail-comma-separator').length,1);
const genreLinks = nodesWithClass(model.meta,'show-genre-link');
assert.strictEqual(genreLinks.length,1);
assert.deepStrictEqual([
    genreLinks[0].attrs['data-genre-key'],
    genreLinks[0].attrs['data-genre-name'],
    genreLinks[0].attrs['data-genre-media'],
    genreLinks[0].attrs['data-genre-route']
],['18-drama-&-more','Drama & More','movie','/app/genre/movie/18-drama & more']);
assert.strictEqual(nodesWithClass(model.meta,'show-genre-link-disabled').length,2);
assert.strictEqual(nodesWithClass(model.meta,'adult-movie-badge').length,1);

const fallbackMovie = {
    id:102,
    title:'Fallback',
    year:'',
    runtime:0,
    vote_average:0,
    adult:false,
    release_dates:{results:[{iso_3166_1:'US',release_dates:[{certification:' '}]}]},
    crew:[{id:1,name:'Writer',job:'Writer'}],
    genres:[]
};
const fallbackModel = bridge.buildViewModel({...pageState,movie:fallbackMovie});
assert.deepStrictEqual(topLevelGroups(fallbackModel.meta),['Unknown','Unknown','Unknown','Unknown']);
assert.strictEqual(nodesWithClass(fallbackModel.meta,'adult-movie-badge').length,0);
assert(!textOf(fallbackModel.meta).includes('UnknownUnknownUnknownUnknownUnknown'),'empty genres must not add a standalone Unknown group');
const roundedRuntimeModel = bridge.buildViewModel({...pageState,movie:{...fallbackMovie,runtime:59.6}});
assert.strictEqual(topLevelGroups(roundedRuntimeModel.meta)[2],'1h');

const externalLinks = flatten(model.externalLinks).filter(node=>node.kind === 'element' && node.tag === 'a');
assert.deepStrictEqual(externalLinks.map(textOf),['Trailer','IMDb','TMDB','Official Site ↗']);
assert.deepStrictEqual(externalLinks.map(node=>node.attrs.href),[
    'https://www.youtube.com/watch?v=trailer101',
    'https://www.imdb.com/title/tt0101/',
    'https://www.themoviedb.org/movie/101',
    'https://movie.example/path'
]);
assert(externalLinks.every(node=>node.attrs.target === '_blank' && node.attrs.rel === 'noopener noreferrer'));
assert.strictEqual(nodesWithClass(model.externalLinks,'v2-play-icon')[0].attrs.src,'/static/assets/icons/ui-play.svg');
assert.strictEqual(nodesWithClass(model.externalLinks,'modal-meta-separator').length,3);
[
    'javascript:alert(1)',
    'data:text/html,unsafe',
    '//unsafe.example/path',
    '/\\unsafe.example/path',
    '\\/unsafe.example/path',
    '\\\\unsafe.example/path'
].forEach(homepage=>{
    const unsafe = bridge.buildViewModel({...pageState,movie:{...fallbackMovie,homepage}});
    assert(!textOf(unsafe.externalLinks).includes('Official Site'),`${homepage} must not produce an external link`);
});
const httpExternal = bridge.buildViewModel({...pageState,movie:{...fallbackMovie,homepage:'http://movie.example/'}});
assert.strictEqual(nodeByText(httpExternal.externalLinks,'Official Site ↗').attrs.href,'http://movie.example/');

for(let mask = 0; mask < 8; mask += 1){
    const state = {watched:!!(mask & 1),plan:!!(mask & 2),favorite:!!(mask & 4)};
    trackingStates.set('101',state);
    const actions = bridge.buildViewModel(pageState).actions;
    const buttons = flatten(actions).filter(node=>node.kind === 'element' && node.tag === 'button');
    const byAction = Object.fromEntries(buttons.map(button=>[button.attrs['data-movie-tracking-action'],button]));
    assert.deepStrictEqual(Object.keys(byAction),state.watched || state.plan || state.favorite
        ? ['watched','plan','favorite','remove']
        : ['watched','plan','favorite']);
    ['watched','plan'].forEach(action=>{
        assert.strictEqual(byAction[action].attrs['aria-pressed'],state[action] ? 'true' : 'false');
        assert.strictEqual(String(byAction[action].attrs.class).includes('active'),state[action]);
    });
    assert.strictEqual(byAction.favorite.attrs['aria-pressed'],state.favorite ? 'true' : 'false');
    assert.strictEqual(byAction.favorite.attrs['aria-label'],state.favorite ? 'Remove from favorites' : 'Add to favorites');
    assert.strictEqual(byAction.favorite.attrs.title,byAction.favorite.attrs['aria-label']);
    assert.strictEqual(String(byAction.favorite.attrs.class).includes('active'),state.favorite);
    const heartPath = flatten(byAction.favorite).find(node=>node.kind === 'element' && node.tag === 'path');
    assert.strictEqual(heartPath.attrs.d,'M12 20.4 4.35 13.2A5.25 5.25 0 0 1 11.7 5.7L12 6l.3-.3a5.25 5.25 0 0 1 7.35 7.5Z');
    assert.strictEqual(heartPath.attrs.fill,state.favorite ? 'currentColor' : 'none');
}
assert(calls.filter(call=>call[0] === 'tracking-state').every(call=>
    call.length === 2 && (call[1] === 101 || call[1] === 102)
),'tracking truth must be read with each source movie.id only');

context.window.activeMovieDetailsTab = 'Crew';
let tabsModel = bridge.buildViewModel(pageState);
let tabs = nodesWithClass(tabsModel.tabs,'show-detail-tab');
assert.deepStrictEqual(tabs.map(tab=>[tab.attrs['data-movie-detail-tab'],tab.attrs.role,tab.attrs['aria-selected']]),[
    ['Info','tab','false'],['Cast','tab','false'],['Crew','tab','true'],['Details','tab','false'],['Genres','tab','false'],['Releases','tab','false']
]);
assert.strictEqual(tabsModel.tabs[0].attrs.class,'show-detail-tabs movie-detail-tabs');
assert.strictEqual(tabsModel.tabs[0].attrs.role,'tablist');
assert.strictEqual(tabsModel.tabs[0].attrs['aria-label'],'Movie details sections');
context.window.activeMovieDetailsTab = 'Invalid';
tabs = nodesWithClass(bridge.buildViewModel(pageState).tabs,'show-detail-tab');
assert.strictEqual(tabs[0].attrs['aria-selected'],'true','invalid tab state must normalize to Info');
assert.strictEqual(tabs.filter(tab=>tab.attrs.class.includes('active')).length,1);

const loading = bridge.buildViewModel({loading:true,error:'',movie:null});
assert.strictEqual(loading.state,'loading');
assert.strictEqual(loading.message,'Getting details.');
const failed = bridge.buildViewModel({loading:false,error:'No movie',movie:null});
assert.strictEqual(failed.state,'error');
assert.strictEqual(failed.message,'No movie');

trackingStates.set('101',{watched:true,plan:false,favorite:true});
context.window.activeMovieDetailsTab = 'Info';
const interactionModel = bridge.buildViewModel(pageState);
const interactionTabs = nodesWithClass(interactionModel.tabs,'show-detail-tab').map(runtimeElement);
const interactionActions = flatten(interactionModel.actions)
    .filter(node=>node.kind === 'element' && node.tag === 'button')
    .map(runtimeElement);
const interactionCalls = [];
const attachSource = app.slice(
    app.indexOf('function attachMovieDetailPageEvents()'),
    app.indexOf('async function openMoviePage(movieId,options={})')
);
const interactionContext = {
    activeMovieDetailsTab:'Info',
    activeMovieReleaseSort:'date',
    moviePageState:pageState,
    renderActiveMoviePage(){ interactionCalls.push(['render']); },
    async updateMovieTracking(nextMovie,action){ interactionCalls.push(['tracking',nextMovie,action]); },
    document:{
        getElementById(){ return null; },
        querySelectorAll(selector){
            if(selector === '[data-movie-detail-tab]') return interactionTabs;
            if(selector === '[data-movie-tracking-action]') return interactionActions;
            return [];
        },
        addEventListener(){ interactionCalls.push(['document-bind']); }
    }
};
interactionContext.window = interactionContext;
vm.createContext(interactionContext);
vm.runInContext(attachSource,interactionContext);
interactionContext.attachMovieDetailPageEvents();
interactionTabs.find(tab=>tab.dataset.movieDetailTab === 'Genres').dispatch('click');
assert.strictEqual(interactionContext.activeMovieDetailsTab,'Genres','real event consumer must read typed tab data');
assert(interactionCalls.some(call=>call[0] === 'render'));
const favoriteRuntime = interactionActions.find(button=>button.dataset.movieTrackingAction === 'favorite');
Promise.all(favoriteRuntime.dispatch('click').results).then(()=>{
    assert(interactionCalls.some(call=>call[0] === 'tracking' && call[1] === movie && call[2] === 'favorite'));
    assert.strictEqual(favoriteRuntime.disabled,false);

    let rendered = null;
    const bindsBefore = calls.filter(call=>call[0] === 'bind').length;
    bridge.attachVueOwner({render(next){ rendered = next; },unmount(){}});
    context.window.renderMovieDetailPage(pageState);
    context.window.renderMovieDetailPage(pageState);
    assert(rendered && rendered.surface === 'movie');
    assert.strictEqual(calls.filter(call=>call[0] === 'bind').length,bindsBefore + 2,'interactions must rebind after every Vue render');
    assert(calls.some(call=>call[0] === 'title'));

    assert.strictEqual(legacyCalls.length,0);
    assert.strictEqual((bridgeSource.match(/fragment\("renderMovieActiveTabContentHTML",movie\)/g) || []).length,1);
    legacyChromeFunctions.forEach(name=>assert(!bridgeSource.includes(name),`${name} must not remain a bridge dependency`));
    assert.strictEqual((bridgeSource.match(/fragment\("render/g) || []).length,1,'only the active panel may remain a named fragment');
    assert(!bridgeSource.includes('callString('));

    assert(viewModel.includes("readonly surface: 'movie'"));
    assert(viewModel.includes("readonly state: 'ready' | 'loading' | 'error'"));
    assert(viewModel.includes('readonly tabContent: DetailNodeList'));
    assert(!viewModel.includes('readonly html: string'));
    assert(component.includes('data-tvtracker-movie-details-owner="vue"'));
    assert(component.includes("import DetailNode from './DetailNode.vue'"));
    assert(component.includes('movie-detail-page-inner'));
    assert(!component.includes('v-html'));
    assert(nodeComponent.includes('h(node.tag, node.attrs'));
    assert(!component.includes('fetch(') && !component.includes('history.'));
    assert(!bridgeSource.includes('renderMovieDetailPageHTML'));
    assert(!bridgeSource.includes('/api/'));
    assert(!bridgeSource.includes('history.pushState') && !bridgeSource.includes('history.replaceState'));
    assert(nodeModelSource.includes('ownership:"typed-node-model"'));
    assert(nodeModelSource.includes('if(/^[\\\\/]{2}/.test(raw)) return "";'),'typed URL boundary must reject slash/backslash authority forms');

    assert(!ui.includes('function renderMovieDetailPageHTML(state)'));
    assert(!ui.includes('function renderMovieDetailPage(state)'));
    assert(ui.includes('function renderMovieActiveTabContentHTML(movie)'),'the sole panel fragment remains until panel migration');
    assert(app.includes('function renderActiveMoviePage()'));
    assert(app.includes('renderMovieDetailPage(moviePageState);'));
    assert(app.includes('attachMovieDetailPageEvents();'),'proven duplicate interaction binding remains unchanged in this slice');
    assert(app.includes('async function openMoviePage(movieId,options={})'));
    assert(stateBridgeSource.includes('ownership:"legacy-read-only"'));

    assert(main.includes("import MovieDetails from './media-details/MovieDetails.vue';"));
    assert(main.includes('createApp(MovieDetails, { model })'));
    assert(main.includes('window.TVTrackerMovieDetailsVueBridge?.attachVueOwner(movieDetailsOwner);'));
    assert(main.includes("document.getElementById('show-detail-content')"));

    const stateBridgeIndex = template.indexOf("filename='js/media-details-state-bridge.js'");
    const nodeModelIndex = template.indexOf("filename='js/media-details-node-model.js'");
    const movieVueBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
    const routerIndex = template.indexOf("filename='js/app-router.js'");
    assert(stateBridgeIndex >= 0);
    assert(nodeModelIndex > stateBridgeIndex);
    assert(movieVueBridgeIndex > nodeModelIndex);
    assert(routerIndex > movieVueBridgeIndex);

    console.log('Vue-native Movie Details chrome composition checks passed.');
}).catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
