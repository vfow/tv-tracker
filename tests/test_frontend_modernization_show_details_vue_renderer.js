const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/show-details-vue-bridge.js', 'utf8');
const nodeModelSource = fs.readFileSync('static/js/media-details-node-model.js', 'utf8');
const component = fs.readFileSync('frontend/src/media-details/ShowDetails.vue', 'utf8');
const nodeComponent = fs.readFileSync('frontend/src/media-details/DetailNode.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/media-details/showViewModel.ts', 'utf8');
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

let fragmentCalls = 0;
const nodeModel = {
    ownership:'typed-node-model',
    text(value){ return Object.freeze({kind:'text',text:String(value === null || typeof value === 'undefined' ? '' : value)}); },
    element(tag,attrs,children){
        return Object.freeze({kind:'element',tag,attrs:Object.freeze(attrs || {}),children:Object.freeze(children || [])});
    },
    fragment(){ fragmentCalls += 1; throw new Error('legacy fragment parser called'); },
    freeze
};

const calls = [];
let activePrimaryTab = 'Info';
const show = {
    tmdb_id:202,
    title:'Example <Show>',
    overview:'A raw & unescaped synopsis.',
    first_air_date:'2024-01-01',
    tmdb_status:'Returning Series',
    content_rating:'TV-14',
    episode_run_time:[62],
    genre_items:[{id:18,name:'Drama'}],
    genres:['Drama'],
    networks:[{id:7,name:'Example Network',logo_path:'/network.png'},{id:0,name:'Text Network'}],
    origin_country:['US','GB','US'],
    original_language:'en',
    spoken_languages:[{iso_639_1:'en',english_name:'English'},{iso_639_1:'fr',english_name:'French'}],
    created_by_people:[{id:9,name:'Creator'}],
    _tmdb_cast:[{id:11,name:'Actor',character:'Lead',profile_path:'/actor.png'}],
    _tmdb_crew:[
        {id:12,name:'Director',job:'Director',episode_count:8},
        {id:13,name:'Writer',job:'Writer'}
    ],
    _tmdb_keywords:[{id:40,name:'Found family'},{id:0,name:'Slow burn'}],
    _tmdb_production_companies:[
        {id:30,name:'Logo Co',logo_path:'/company.png'},
        {id:31,name:'Name Co'}
    ],
    _tmdb_alternative_titles:[
        {iso_3166_1:'US',title:'US Title'},
        {iso_3166_1:'GB',title:'Hidden Country'},
        {iso_3166_1:'CA',title:'Hidden Name'},
        {iso_3166_1:'US',title:'US Title'},
        {title:'Other Title'}
    ],
    _tmdb_external_ids:{imdb_id:'tt202'},
    _tmdb_videos:[{type:'Trailer',key:'trailer202'}],
    _tmdb_similar:[{id:303,name:'Similar Show'}],
    homepage:'https://show.example/',
    tmdb_rating:8.4,
    number_of_seasons:3,
    _season_episodes:{'1':3,'2':2,'3':0},
    _episode_list:{
        '1':[
            {episode_number:1,name:'Aired',loggable:true},
            {episode_number:2,name:'Future',air_date:'2099-01-01',loggable:false},
            {episode_number:3,name:'Watched Future',air_date:'2099-01-02',loggable:false}
        ],
        '3':[]
    },
    episodes_watched:{'1':[1,3],'2':[],'3':[]}
};

const context = {
    URL,
    window:{
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        DATA:{shows:{'202':show}},
        activeShowDetailsTabs:{},
        activeShowInfoTabs:{'202':'Cast'},
        expandedSeasons:{'202':{}},
        TVTrackerMediaDetailsNodeModel:nodeModel,
        getShowDetailActiveTab(){ return activePrimaryTab; },
        getMediaPosterPlaceholderLabel(){ return 'Example Show (2024)'; },
        trackerBackgroundImage(){ return 'url("/backdrop.jpg")'; },
        trackerImageURL(path){ return path ? `/image${path}` : ''; },
        getYearDetailRoute(){ return '/app/year/tv/2024'; },
        getShowGenreRoute(genre){ return genre && genre.id ? `/app/genre/tv/${genre.id}-drama` : '/app/list/watching'; },
        buildRouteKey(id,name){ return `${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
        getShowNetworkItems(nextShow){ return nextShow.networks || []; },
        getDiscoveryFilterDetailRoute(type,id,label,media='tv'){ return `/app/${type}/${media}/${id}-${String(label).toLowerCase().replace(/\s+/g,'-')}`; },
        getPersonDetailRoute(role,id,name,media='tv'){ return `/app/person/${media}/${role}/${id}-${String(name).toLowerCase()}`; },
        getShowDetailRoute(){ return '/app/show/303-similar-show'; },
        getStatusDetailRoute(){ return '/app/status/returning-series'; },
        getRuntimeBrowseRoute(){ return '/app/browse/tv?runtime=60-89'; },
        getCompanyDetailRoute(id){ return `/app/company/tv/${id}`; },
        getProviderDetailRoute(id){ return id === 1 ? '/app/provider/tv/1' : ''; },
        getEpisodeDetailRoute(id,season,episode){ return `/app/show/${id}/season/${season}/episode/${episode}`; },
        getShowLanguageItems(nextShow){
            return nextShow.original_language || (nextShow.spoken_languages || []).length
                ? [{code:'en',label:'English'},{code:'fr',label:'French'}]
                : [];
        },
        getLanguageName(code){ return code === 'en' ? 'English' : 'French'; },
        getCountryName(code){ return ({us:'United States',gb:'United Kingdom',ca:'Canada'})[String(code).toLowerCase()] || code; },
        getCountryLabel(code){ return ({us:'US United States',gb:'GB United Kingdom',ca:'CA Canada'})[String(code).toLowerCase()] || 'Other'; },
        getShowDetailFilters(){ return {hiddenAlternativeTitleCountries:['gb'],hiddenAlternativeTitleNames:['hidden name']}; },
        alternativeTitleCountryMatchesFilter(item,hidden){ return hidden.includes(String(item.iso_3166_1 || '').toLowerCase()); },
        normalizeThemeItems(nextShow){ return nextShow._tmdb_keywords || []; },
        collectCrewJobGroups(source){
            if(!source.length) return [];
            return [
                {jobKey:'director',job:'Director',label:'Directors',people:[source[0]]},
                {jobKey:'writer',job:'Writer',label:'Writers',people:[source[1]]}
            ];
        },
        getCrewRouteRole(person){ return String(person.job || '').toLowerCase(); },
        getSeasonWatchedCount(nextShow,season){ return (nextShow.episodes_watched[String(season)] || []).length; },
        getAiredEpisodeNumbersInSeason(nextShow,season){
            return ((nextShow._episode_list || {})[String(season)] || []).filter(ep=>ep.loggable).map(ep=>ep.episode_number);
        },
        isSeasonFullyWatched(nextShow,season,aired){
            const watched = nextShow.episodes_watched[String(season)] || [];
            return aired.length > 0 && aired.every(number=>watched.includes(number));
        },
        isEpisodeLoggable(episode){ return episode.loggable === true; },
        safeExternalURL(value){ return /^https:\/\//.test(String(value || '')) ? value : ''; },
        isShowFavorite(){ return true; },
        isStatusAllowedForShow(){ return true; },
        renderShowDetailTabContentHTML(){ throw new Error('legacy Show tab composer called'); },
        attachShowDetailsPageEvents(nextShow,tracked){ calls.push(['bind-page',nextShow,tracked]); },
        attachV2ShowModalEvents(nextShow){ calls.push(['bind-v2',nextShow]); }
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource,context);

const bridge = context.window.TVTrackerShowDetailsVueBridge;
assert(bridge, 'Show Details Vue bridge should exist');
assert.strictEqual(bridge.ownership,'vue-dom');
assert.strictEqual(context.window.renderShowDetailsPage,bridge.render);
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
    return flatten(nodes).filter(node=>node.kind === 'element' && String(node.attrs.class || '').split(/\s+/).includes(className));
}

function textOf(value){
    return flatten(value).filter(node=>node.kind === 'text').map(node=>node.text).join('');
}

function runtimeElement(node){
    const listeners = {};
    const dataset = {};
    Object.entries(node.attrs || {}).forEach(([name,value])=>{
        if(!name.startsWith('data-')) return;
        const key = name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
        dataset[key] = String(value);
    });
    return {
        dataset,
        disabled:node.attrs.disabled === true,
        isConnected:true,
        textContent:textOf(node),
        classList:{contains(className){ return String(node.attrs.class || '').split(/\s+/).includes(className); }},
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
            (listeners[type] || []).forEach(handler=>handler.call(this,event));
            return event;
        },
        querySelector(){ return null; },
        getAttribute(name){ return Object.prototype.hasOwnProperty.call(node.attrs,name) ? node.attrs[name] : null; }
    };
}

function jsonForInfoTab(tab,nextShow=show){
    context.window.activeShowInfoTabs[String(nextShow.tmdb_id)] = tab;
    return JSON.stringify(bridge.buildViewModel(nextShow,{preview:false}).tabContent);
}

const model = bridge.buildViewModel(show,{preview:true});
assert.strictEqual(model.surface,'show');
assert.strictEqual(model.showId,'202');
assert.strictEqual(model.title,'Example <Show>');
assert(Array.isArray(model.tabContent));
assert(!Object.prototype.hasOwnProperty.call(model,'html'));
assert(Object.isFrozen(model) && Object.isFrozen(model.tabContent));
assert.strictEqual(fragmentCalls,0,'Show Details must not invoke fragment parsing');
assert(!Object.isFrozen(show), 'mutable domain objects must not be included in the recursively frozen model');
assert(!Object.isFrozen(show._tmdb_cast[0]), 'cast domain records must remain outside the frozen node model');
assert(textOf(model.tabContent).includes('A raw & unescaped synopsis.'), 'text must be passed raw for Vue escaping');
const primaryTabs = nodesWithClass(model.tabs,'show-detail-tab');
assert.deepStrictEqual(primaryTabs.map(node=>[node.attrs['data-show-detail-tab'],node.attrs.role,node.attrs['aria-selected']]),[
    ['Info','tab','true'],['Episodes','tab','false']
]);
const infoSubtabs = nodesWithClass(model.tabContent,'show-info-subtab');
assert.deepStrictEqual(infoSubtabs.map(node=>[node.attrs['data-show-info-tab'],node.attrs.role,node.attrs['aria-selected']]),[
    ['Cast','tab','true'],['Crew','tab','false'],['Details','tab','false'],['Genres','tab','false'],['Releases','tab','false']
]);
assert(Object.isFrozen(infoSubtabs[0]) && Object.isFrozen(infoSubtabs[0].attrs) && Object.isFrozen(infoSubtabs[0].children));

const castJSON = jsonForInfoTab('Cast');
assert(castJSON.includes('show-info-actor-list'));
assert(castJSON.includes('/app/person/tv/acting/11-actor'));
assert(castJSON.includes('data-person-role":"acting'));
assert(castJSON.includes('data-person-media":"tv'));
assert(castJSON.includes('data-person-id":11'));
assert(castJSON.includes('loading":"lazy') && castJSON.includes('decoding":"async'));
const emptyCast = {...show,tmdb_id:206,_tmdb_cast:[]};
assert(textOf(bridge.buildViewModel((context.window.activeShowInfoTabs['206'] = 'Cast',emptyCast),{}).tabContent).includes('No cast details available yet.'));
const unknownCast = {...show,tmdb_id:207,_tmdb_cast:[{id:0,character:''}]};
assert(textOf(bridge.buildViewModel((context.window.activeShowInfoTabs['207'] = 'Cast',unknownCast),{}).tabContent).includes('Unknown ActorUnknown Role'));

const crewJSON = jsonForInfoTab('Crew');
assert(crewJSON.includes('crew-job-group-list'));
assert(crewJSON.includes('Directors'));
assert(crewJSON.includes('Director • 8 episodes'));
assert(crewJSON.includes('data-person-role":"director'));
const emptyCrew = {...show,tmdb_id:208,_tmdb_crew:[]};
assert(textOf(bridge.buildViewModel((context.window.activeShowInfoTabs['208'] = 'Crew',emptyCrew),{}).tabContent).includes('No crew details available yet.'));

const detailsModel = bridge.buildViewModel((context.window.activeShowInfoTabs['202'] = 'Details',show),{});
const detailRows = nodesWithClass(detailsModel.tabContent,'show-detail-fact-row');
assert.deepStrictEqual(detailRows.map(row=>textOf(row.children[0])),[
    'Status','Runtime','Networks','Language','Country','Certification','Production Companies','Alternative Titles'
]);
const detailsJSON = JSON.stringify(detailsModel.tabContent);
assert(detailsJSON.includes('/app/status/returning-series'));
assert(detailsJSON.includes('/app/browse/tv?runtime=60-89'));
assert(detailsJSON.includes('data-discovery-type":"language'));
assert(detailsJSON.includes('data-discovery-type":"country'));
assert(detailsJSON.includes('/app/company/tv/30'));
assert(detailsJSON.includes('movie-company-logo-link-name'));
assert(detailsJSON.includes('US Title') && detailsJSON.includes('Other Title'));
assert(!detailsJSON.includes('Hidden Country') && !detailsJSON.includes('Hidden Name'));
const unknownDetails = {
    ...show,
    tmdb_id:209,
    tmdb_status:'   ',
    status:'',
    episode_run_time:[],
    networks:[],
    spoken_languages:[],
    original_language:'',
    origin_country:[],
    content_rating:'',
    _tmdb_production_companies:[],
    _tmdb_alternative_titles:[]
};
context.window.activeShowInfoTabs['209'] = 'Details';
const unknownDetailRows = nodesWithClass(bridge.buildViewModel(unknownDetails,{}).tabContent,'show-detail-fact-row');
assert.deepStrictEqual(unknownDetailRows.map(row=>textOf(row.children[0])),[
    'Status','Networks','Language','Country','Certification','Production Companies','Alternative Titles'
]);
assert.deepStrictEqual(unknownDetailRows.map(row=>textOf(row.children[1])),Array(7).fill('Unknown'));
const manyTitles = {...show,tmdb_id:210,_tmdb_alternative_titles:Array.from({length:13},(_,index)=>({iso_3166_1:'US',title:`Title ${index}`}))};
context.window.activeShowInfoTabs['210'] = 'Details';
assert(!textOf(bridge.buildViewModel(manyTitles,{}).tabContent).includes('Title 12'),'alternative titles must retain the legacy 12-record limit');

const genresJSON = jsonForInfoTab('Genres');
assert(genresJSON.includes('show-detail-genre-chip show-genre-link'));
assert(genresJSON.includes('data-genre-route'));
assert(genresJSON.includes('show-detail-theme-list-expanded'));
assert(genresJSON.includes('data-discovery-type":"theme'));
const emptyGenres = {...show,tmdb_id:204,genre_items:[],genres:[],_tmdb_keywords:[]};
assert(jsonForInfoTab('Genres',emptyGenres).includes('No genres available.'));

context.window.activeShowInfoTabs['202'] = 'Releases';
assert(textOf(bridge.buildViewModel(show,{}).tabContent).includes('Choose a streaming region in Settings.'));
let streamingRegion = '';
context.window.TVTrackerStreamingRegion = {
    getStreamingRegion(){ return streamingRegion; },
    REGION_REQUIRED_MESSAGE:'REGION REQUIRED',
    NO_PROVIDER_MESSAGE:'NO PROVIDERS'
};
assert(textOf(bridge.buildViewModel(show,{}).tabContent).includes('REGION REQUIRED'), 'region service must be resolved after bridge load');
streamingRegion = 'US';
assert(textOf(bridge.buildViewModel(show,{}).tabContent).includes('NO PROVIDERS'));
const emptyProviderShow = {...show,_tmdb_watch_providers:{results:{US:{}}}};
assert(textOf(bridge.buildViewModel(emptyProviderShow,{}).tabContent).includes('No watch provider data available for the selected region yet.'));
const externalProviders = Array.from({length:11},(_,index)=>({provider_id:index + 2,provider_name:`External ${index}`,link:`https://watch.example/${index}`}));
const providerShow = {...show,_tmdb_watch_providers:{results:{US:{
    flatrate:[{provider_id:1,provider_name:'Internal',link:'https://external-should-lose.example/'}],
    rent:externalProviders,
    buy:[{provider_name:'Muted'}]
}}}};
const providerModel = bridge.buildViewModel(providerShow,{});
const providerJSON = JSON.stringify(providerModel.tabContent);
assert(providerJSON.includes('Streaming') && providerJSON.includes('Rent') && providerJSON.includes('Buy'));
assert(providerJSON.includes('/app/provider/tv/1'));
assert(!providerJSON.includes('external-should-lose.example'));
assert.strictEqual(textOf(providerModel.tabContent).includes('External 10'),false,'provider groups must be limited to 10');
assert(providerJSON.includes('v2-provider-pill-muted'));
const providerLinks = nodesWithClass(providerModel.tabContent,'v2-provider-pill-link');
assert.strictEqual(providerLinks[0].attrs.title,'Browse Internal');
assert(providerLinks.some(node=>node.attrs.target === '_blank' && node.attrs.rel === 'noopener noreferrer'));

const productionWindow = Object.assign({},context.window,{
    location:{pathname:'/app/list/watching',origin:'https://example.test'},
    activeShowDetailsTabs:{'202':'Info'},
    activeShowInfoTabs:{'202':'Releases'},
    expandedSeasons:{'202':{}},
    getShowDetailActiveTab(){ return 'Info'; },
    safeExternalURL(value){ return String(value || ''); },
    TVTrackerStreamingRegion:{
        getStreamingRegion(){ return 'US'; },
        REGION_REQUIRED_MESSAGE:'REGION REQUIRED',
        NO_PROVIDER_MESSAGE:'NO PROVIDERS'
    }
});
const productionContext = {URL,window:productionWindow};
vm.createContext(productionContext);
vm.runInContext(nodeModelSource,productionContext);
vm.runInContext(bridgeSource,productionContext);
const unsafeProviderShow = {...show,_tmdb_watch_providers:{results:{US:{flatrate:[
    {provider_id:1,provider_name:'Internal Safe',link:'https://external-should-not-win.example/'},
    {provider_name:'JavaScript Unsafe',link:'javascript:alert(1)'},
    {provider_name:'Data Unsafe',link:'data:text/html,unsafe'},
    {provider_name:'Protocol Relative Unsafe',link:'//unsafe.example/watch'},
    {provider_name:'Slash Backslash Unsafe',link:'/\\unsafe.example/watch'},
    {provider_name:'Backslash Slash Unsafe',link:'\\/unsafe.example/watch'},
    {provider_name:'Double Backslash Unsafe',link:'\\\\unsafe.example/watch'},
    {provider_name:'Root Safe',link:'/app/providers/root'},
    {provider_name:'External Safe',link:'https://watch.example/valid'}
]}}}};
const productionProviderModel = productionWindow.TVTrackerShowDetailsVueBridge.buildViewModel(unsafeProviderShow,{});
const productionProviderLinks = nodesWithClass(productionProviderModel.tabContent,'v2-provider-pill-link');
function productionProvider(label){
    return productionProviderLinks.find(node=>textOf(node) === label);
}
assert.strictEqual(productionProvider('Internal Safe').attrs.href,'/app/provider/tv/1','internal provider routes must beat external links');
assert.strictEqual(productionProvider('Root Safe').attrs.href,'/app/providers/root','ordinary single-slash app routes must remain valid');
assert.strictEqual(productionProvider('External Safe').attrs.href,'https://watch.example/valid');
['JavaScript Unsafe','Data Unsafe','Protocol Relative Unsafe','Slash Backslash Unsafe','Backslash Slash Unsafe','Double Backslash Unsafe'].forEach(label=>{
    assert(!Object.prototype.hasOwnProperty.call(productionProvider(label).attrs,'href'),`${label} must be removed by the production node boundary`);
});

activePrimaryTab = 'Episodes';
context.window.expandedSeasons['202'] = {};
let episodeModel = bridge.buildViewModel(show,{});
assert.strictEqual(nodesWithClass(episodeModel.tabContent,'season-box').length,3);
assert.strictEqual(nodesWithClass(episodeModel.tabContent,'season-episodes').length,0,'collapsed seasons must not build episode children');
assert(nodesWithClass(episodeModel.tabContent,'season-toggle-area').every(node=>node.attrs['aria-expanded'] === 'false'));

context.window.expandedSeasons['202'] = {'1':true,'2':true,'3':true};
episodeModel = bridge.buildViewModel(show,{});
assert.strictEqual(nodesWithClass(episodeModel.tabContent,'season-episodes').length,3);
assert(textOf(episodeModel.tabContent).includes('Loading episode list...'));
assert(textOf(episodeModel.tabContent).includes('Episode list not announced yet.'));
assert(nodesWithClass(episodeModel.tabContent,'season-toggle-area').every(node=>node.attrs['aria-expanded'] === 'true'));
const rows = nodesWithClass(episodeModel.tabContent,'episode-row');
assert.strictEqual(rows.length,3);
assert.strictEqual(rows[0].attrs['data-season'],1);
assert.strictEqual(rows[0].attrs['data-episode'],1);
assert.strictEqual(rows[0].attrs.class,'episode-row watched');
assert.strictEqual(rows[1].attrs.class,'episode-row future');
assert.strictEqual(rows[2].attrs.class,'episode-row watched');
const routeLinks = nodesWithClass(episodeModel.tabContent,'app-route-card-link');
assert.strictEqual(routeLinks[0].attrs.href,'/app/show/202/season/1/episode/1');
assert.strictEqual(routeLinks[0].attrs['aria-label'],'Open Example <Show> episode');
const checks = nodesWithClass(episodeModel.tabContent,'episode-check-button');
assert.strictEqual(checks[0].attrs['data-watched'],'true');
assert.strictEqual(checks[0].attrs.disabled,false);
assert.strictEqual(checks[1].attrs.disabled,true,'unwatched future episodes must stay disabled');
assert.strictEqual(checks[2].attrs.disabled,false,'watched future episodes must remain removable');
assert(nodesWithClass(episodeModel.tabContent,'season-all-button')[0].attrs.class.includes('checked'));
assert.strictEqual(nodesWithClass(episodeModel.tabContent,'season-all-button')[0].attrs.title,'Mark season as unwatched');

context.window.DATA.shows = {};
const previewEpisodes = bridge.buildViewModel(show,{preview:true});
assert(nodesWithClass(previewEpisodes.tabContent,'season-all-button').every(node=>node.attrs.disabled === true));
assert(nodesWithClass(previewEpisodes.tabContent,'episode-check-button').every(node=>node.attrs.disabled === true));
context.window.DATA.shows = {'202':show};
const oneSeason = {...show,tmdb_id:205,number_of_seasons:0,_episode_list:{},_season_episodes:{},episodes_watched:{}};
context.window.expandedSeasons['205'] = {};
assert.strictEqual(nodesWithClass(bridge.buildViewModel(oneSeason,{}).tabContent,'season-box').length,1);

activePrimaryTab = 'Info';
context.window.activeShowInfoTabs['202'] = 'Cast';
const interactionInfoModel = bridge.buildViewModel(show,{});
activePrimaryTab = 'Episodes';
context.window.expandedSeasons['202'] = {};
const interactionEpisodeModel = bridge.buildViewModel(show,{});
const interactionTabs = nodesWithClass(interactionInfoModel.tabs,'show-detail-tab').map(runtimeElement);
const interactionInfoTabs = nodesWithClass(interactionInfoModel.tabContent,'show-info-subtab').map(runtimeElement);
const interactionSeasonToggles = nodesWithClass(interactionEpisodeModel.tabContent,'season-toggle-area').map(runtimeElement);
const interactionCalls = [];
const interactionSource = ui.slice(
    ui.indexOf('function stopNestedSeasonAction'),
    ui.indexOf('function getEpisodeCountForNavigation')
);
const toggleSeasonSource = app.slice(
    app.indexOf('async function toggleSeason(showId,seasonNumber)'),
    app.indexOf('async function updateShowStatus(showId,status)')
);
const interactionContext = {
    DATA:{shows:{'202':show}},
    activeShowDetailsTabs:{'202':'Info'},
    activeShowInfoTabs:{'202':'Cast'},
    expandedSeasons:{'202':{}},
    document:{
        getElementById(){ return null; },
        querySelector(){ return null; },
        querySelectorAll(selector){
            if(selector === '.show-detail-tab') return interactionTabs;
            if(selector === '.show-info-subtab') return interactionInfoTabs;
            if(selector === '.season-toggle-area[data-season]') return interactionSeasonToggles;
            return [];
        }
    },
    getShowForDetailPage(id){ return id === '202' ? show : null; },
    renderShowDetailsPagePreservingScroll(nextShow){ interactionCalls.push(['render',nextShow]); },
    seasonDataAlreadyLoaded(nextShow,season){ interactionCalls.push(['loaded-check',nextShow,season]); return false; },
    ensureSeasonLoaded(nextShow,season,force,options){ interactionCalls.push(['lazy-load',nextShow,season,force,options]); },
    saveData(options){ interactionCalls.push(['save',options]); }
};
vm.createContext(interactionContext);
vm.runInContext(toggleSeasonSource + '\n' + interactionSource,interactionContext);
interactionContext.attachShowDetailsPageEvents(show,true);
interactionTabs.find(tab=>tab.dataset.showDetailTab === 'Episodes').dispatch('click');
assert.strictEqual(interactionContext.activeShowDetailsTabs['202'],'Episodes','real tab consumer must read the typed data-show-detail-tab attribute');
interactionInfoTabs.find(tab=>tab.dataset.showInfoTab === 'Releases').dispatch('click');
assert.strictEqual(interactionContext.activeShowInfoTabs['202'],'Releases','real Info-tab consumer must read the typed data-show-info-tab attribute');
const seasonEvent = interactionSeasonToggles.find(toggle=>toggle.dataset.season === '2').dispatch('click');
assert.strictEqual(interactionContext.expandedSeasons['202']['2'],true,'real season consumer must expand the selected typed season');
assert.strictEqual(seasonEvent.defaultPrevented,true);
assert.strictEqual(seasonEvent.propagationStopped,true);
assert(interactionCalls.some(call=>call[0] === 'loaded-check' && call[2] === 2));
assert(interactionCalls.some(call=>call[0] === 'lazy-load' && call[2] === 2 && call[3] === false && call[4].skipSave === true));

let rendered = null;
bridge.attachVueOwner({render(next){ rendered = next; },unmount(){}});
context.window.renderShowDetailsPage(show,{preview:false});
assert(rendered && rendered.surface === 'show');
assert(calls.some(call=>call[0] === 'bind-page' && call[1] === show && call[2] === true));
assert(calls.some(call=>call[0] === 'bind-v2' && call[1] === show));

assert(viewModel.includes("readonly surface: 'show'"));
assert(viewModel.includes('readonly tabContent: DetailNodeList'));
assert(!viewModel.includes('readonly html: string'));
assert(component.includes('data-tvtracker-show-details-owner="vue"'));
assert(component.includes("import DetailNode from './DetailNode.vue'"));
assert(!component.includes('v-html'));
assert(nodeComponent.includes('h(node.tag, node.attrs'));
assert(!component.includes('fetch(') && !component.includes('history.'));
assert(!bridgeSource.includes('function fragment('));
assert(!bridgeSource.includes('renderShowDetailTabContentHTML'));
assert(!bridgeSource.includes('.fragment('));
assert(!bridgeSource.includes('/api/'));
assert(!bridgeSource.includes('history.pushState') && !bridgeSource.includes('history.replaceState'));
assert(nodeModelSource.includes('fragment,'), 'Movie Details still requires global fragment support');
assert(nodeModelSource.includes('lower.startsWith("on")'));

assert(!ui.includes('function renderShowDetailsPageHTML(show,options={})'));
assert(!ui.includes('function renderShowDetailsPage(show,options={})'));
assert(ui.includes('function attachShowDetailsPageEvents(show,isTracked)'));
assert(ui.includes('document.querySelectorAll(".season-toggle-area[data-season]")'));
assert(ui.includes('toggleSeason(show.tmdb_id,Number(this.dataset.season));'));
assert(ui.includes('if(!isPlainAppLinkClick(event)){ return; }'));
assert(ui.includes('function renderShowDetailTabContentHTML(show)'), 'physical legacy Show composer deletion is deferred to an audited cleanup');
assert(app.includes('function renderActiveShowDetailPage()'));
assert(app.includes('renderShowDetailsPage(show,{preview:!(DATA.shows && DATA.shows[String(show.tmdb_id)])});'));
assert(app.includes('async function openShowDetailsPage(showId,options={})'));
assert(main.includes("import ShowDetails from './media-details/ShowDetails.vue';"));
assert(main.includes('createApp(ShowDetails, { model })'));
assert(main.includes('window.TVTrackerShowDetailsVueBridge?.attachVueOwner(showDetailsOwner);'));

const stateBridgeIndex = template.indexOf("filename='js/media-details-state-bridge.js'");
const nodeModelIndex = template.indexOf("filename='js/media-details-node-model.js'");
const movieVueBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
const showVueBridgeIndex = template.indexOf("filename='js/show-details-vue-bridge.js'");
const streamingRegionIndex = template.indexOf("filename='js/streaming-region.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(nodeModelIndex > stateBridgeIndex);
assert(movieVueBridgeIndex > nodeModelIndex);
assert(showVueBridgeIndex > movieVueBridgeIndex);
assert(streamingRegionIndex > showVueBridgeIndex, 'late streaming-region load is part of the dynamic lookup contract');
assert(routerIndex > showVueBridgeIndex);

console.log('Vue-native Show Details composition checks passed.');
