const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const panelSource = fs.readFileSync('static/js/movie-details-native-panels.js','utf8');
const bridgeSource = fs.readFileSync('static/js/movie-details-vue-bridge.js','utf8');
const template = fs.readFileSync('templates/index.html','utf8');

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

let legacyFragmentCalls = 0;
const baseNodeModel = Object.freeze({
    ownership:'typed-node-model',
    text(value){ return Object.freeze({kind:'text',text:String(value ?? '')}); },
    element(tag,attrs={},children=[]){
        return Object.freeze({kind:'element',tag:String(tag),attrs:Object.freeze({...attrs}),children:Object.freeze(children.slice())});
    },
    fragment(html){
        legacyFragmentCalls += 1;
        return Object.freeze([{kind:'legacy-fragment',html:String(html || '')}]);
    },
    freeze
});

function releaseRows(){
    return [
        {countryCode:'US',countryName:'United States',date:'2024-05-01',certification:'PG-13',note:'Opening',type:3,typeLabel:'Theatrical'},
        {countryCode:'GB',countryName:'United Kingdom',date:'2024-05-03',certification:'15',note:'',type:4,typeLabel:'Digital'}
    ];
}

const context = {
    window:{
        TVTrackerMediaDetailsNodeModel:baseNodeModel,
        activeMovieDetailsTab:'Info',
        trackerImageURL(path,size){ return `/image/${size}${path}`; },
        getMediaPosterPlaceholderLabel(item){ return item && item.title ? item.title : 'Untitled'; },
        getMediaPosterYear(item){ return String(item && item.release_date || '').slice(0,4); },
        getPersonDetailRoute(role,id,name,media){ return `/app/person/${media}/${role}/${id}-${String(name).toLowerCase()}`; },
        getCrewRouteRole(person,fallback){ return String(person && person.job || fallback || '').toLowerCase().replace(/\s+/g,'-'); },
        collectCrewJobGroups(source){
            return [{jobKey:'director',job:'Director',label:'Directors',people:Array.isArray(source) ? source : []}];
        },
        getRuntimeBrowseRoute(runtime,media){ return `/app/browse/${media}?runtime=${runtime}`; },
        getLanguageName(code){ return code === 'en' ? 'English' : String(code).toUpperCase(); },
        getCountryLabel(code){ return String(code).toUpperCase() === 'US' ? '🇺🇸 United States' : '🇬🇧 United Kingdom'; },
        getCountryName(code){ return String(code).toUpperCase() === 'US' ? 'United States' : 'United Kingdom'; },
        getDiscoveryFilterDetailRoute(type,value,label,media){ return `/app/discover/${media}/${type}/${value}-${String(label).toLowerCase()}`; },
        getMovieCertification(){ return 'PG-13'; },
        getCertificationDetailRoute(media,value){ return `/app/certification/${media}/${String(value).toLowerCase()}`; },
        getCompanyDetailRoute(id,name,media){ return `/app/company/${media}/${id}-${String(name).toLowerCase()}`; },
        getShowGenreRoute(genre,media){ return genre && genre.id ? `/app/genre/${media}/${genre.id}-${genre.name}` : '/app/list/watching'; },
        buildRouteKey(id,name){ return `${id}-${String(name).toLowerCase().replace(/\s+/g,'-')}`; },
        normalizeMovieThemeItems(){ return [{id:7,name:'Time Travel'}]; },
        collectMovieReleaseRows(){ return releaseRows(); },
        getMovieReleaseSortMode(){ return 'date'; },
        groupMovieReleasesByDate(rows){
            return [
                {date:'2024-05-01',releases:[rows[0]]},
                {date:'2024-05-03',releases:[rows[1]]}
            ];
        },
        groupMovieReleasesByCountry(rows){
            return [
                {countryCode:'GB',countryName:'United Kingdom',releases:[rows[1]]},
                {countryCode:'US',countryName:'United States',releases:[rows[0]]}
            ];
        },
        formatMovieReleaseDate(value){ return `DATE:${value}`; },
        getCountryFlag(code){ return String(code).toUpperCase() === 'US' ? '🇺🇸' : '🇬🇧'; },
        getMovieDetailRoute(id,title){ return `/app/movie/${id}-${String(title).toLowerCase()}`; }
    }
};
vm.createContext(context);
vm.runInContext(panelSource,context);

const owner = context.window.TVTrackerMovieDetailsNativePanels;
assert(owner,'native Movie panel owner must install');
assert.strictEqual(owner.ownership,'typed-node-panels');
assert.strictEqual(context.window.renderMovieActiveTabContentHTML,owner.build,'compatibility entry must point at typed builder');
assert.strictEqual(context.window.TVTrackerMediaDetailsNodeModel.ownership,'typed-node-model');

function flatten(value,result=[]){
    (Array.isArray(value) ? value : [value]).forEach(node=>{
        if(!node || typeof node !== 'object') return;
        if(node.kind) result.push(node);
        if(Array.isArray(node.children)) flatten(node.children,result);
    });
    return result;
}

function textOf(value){
    return flatten(value).filter(node=>node.kind === 'text').map(node=>node.text).join('');
}

function classes(value){
    return flatten(value)
        .filter(node=>node.kind === 'element')
        .flatMap(node=>String(node.attrs.class || '').split(/\s+/).filter(Boolean));
}

function elements(value,tag){
    return flatten(value).filter(node=>node.kind === 'element' && (!tag || node.tag === tag));
}

const movie = {
    id:101,
    title:'Example Movie',
    original_title:'Original Movie',
    tagline:'A typed future',
    overview:'Overview text',
    runtime:125,
    status:'Released',
    release_date:'2024-05-01',
    original_language:'en',
    spoken_languages:[{iso_639_1:'en',english_name:'English'},{iso_639_1:'fr',english_name:'French'}],
    production_countries:[{iso_3166_1:'US',name:'United States'}],
    production_companies:[{id:3,name:'Studio',logo_path:'/studio.png'}],
    cast:[{id:1,name:'Actor',character:'Hero',profile_path:'/actor.png'}],
    crew:[{id:2,name:'Director',job:'Director',profile_path:'/director.png'}],
    genres:[{id:18,name:'Drama'}],
    similar:[{id:202,title:'Similar',poster_path:'/similar.png',release_date:'2023-01-01',vote_average:8.2,adult:true}]
};

for(const tab of ['Info','Cast','Crew','Details','Genres','Releases']){
    context.window.activeMovieDetailsTab = tab;
    const nodes = owner.build(movie);
    assert(Array.isArray(nodes) && Object.isFrozen(nodes),`${tab} panel must return frozen typed nodes`);
    assert(nodes.length > 0,`${tab} panel must render content`);
    assert(flatten(nodes).every(node=>node.kind === 'text' || node.kind === 'element'),`${tab} panel must contain typed nodes only`);
    const throughBridgeBoundary = context.window.TVTrackerMediaDetailsNodeModel.fragment(nodes);
    assert(Array.isArray(throughBridgeBoundary) && throughBridgeBoundary.length === nodes.length,`${tab} typed nodes must pass through without HTML parsing`);
    assert(flatten(throughBridgeBoundary).every(node=>node.kind === 'text' || node.kind === 'element'),`${tab} bridge boundary must preserve typed nodes`);
}
assert.strictEqual(legacyFragmentCalls,0,'Movie panel runtime must not invoke the legacy HTML fragment parser');

context.window.activeMovieDetailsTab = 'Info';
const info = owner.build(movie);
assert(classes(info).includes('movie-info-tab-stack'));
assert(classes(info).includes('v2-more-like-section'));
assert(textOf(info).includes('Synopsis'));
assert(textOf(info).includes('A typed future'));
assert(textOf(info).includes('Similar'));
assert(elements(info,'a').some(node=>node.attrs['data-movie-similar-open'] === 202));
assert(classes(info).includes('adult-movie-badge'));

context.window.activeMovieDetailsTab = 'Cast';
const cast = owner.build(movie);
assert(classes(cast).includes('show-info-actor-list'));
assert(elements(cast,'a').some(node=>node.attrs['data-person-role'] === 'acting' && node.attrs['data-person-media'] === 'movie'));
assert(textOf(cast).includes('Hero'));

context.window.activeMovieDetailsTab = 'Crew';
const crew = owner.build(movie);
assert(classes(crew).includes('crew-job-group-list'));
assert(textOf(crew).includes('Directors'));

context.window.activeMovieDetailsTab = 'Details';
const details = owner.build(movie);
assert(classes(details).includes('show-detail-fact-list'));
assert(textOf(details).includes('Original Title'));
assert(textOf(details).includes('English/French'));
assert(textOf(details).includes('Production Companies'));
assert(elements(details,'a').some(node=>node.attrs.href === '/app/browse/movie?runtime=125'));

context.window.activeMovieDetailsTab = 'Genres';
const genres = owner.build(movie);
assert(classes(genres).includes('show-detail-genre-chips'));
assert(classes(genres).includes('show-detail-theme-list-expanded'));
assert(elements(genres,'a').some(node=>node.attrs['data-genre-media'] === 'movie'));
assert(elements(genres,'a').some(node=>node.attrs['data-discovery-type'] === 'theme'));

context.window.activeMovieDetailsTab = 'Releases';
let releases = owner.build(movie);
assert(classes(releases).includes('movie-release-date-list'));
assert(elements(releases,'button').some(node=>Object.prototype.hasOwnProperty.call(node.attrs,'data-movie-release-sort-toggle')));
assert(elements(releases,'button').filter(node=>node.attrs['data-movie-release-sort-option']).length === 2);
assert(textOf(releases).includes('Theatrical'));

context.window.getMovieReleaseSortMode = ()=> 'country';
releases = owner.build(movie);
assert(classes(releases).includes('movie-release-country-list'));
assert(textOf(releases).includes('United States'));

assert(!panelSource.includes('.innerHTML'),'native Movie panel owner must not compose HTML strings into the DOM');
assert(!panelSource.includes('document.'),'native Movie panel owner must remain DOM-free');
assert(bridgeSource.includes('fragment("renderMovieActiveTabContentHTML",movie)'),'existing bridge compatibility boundary remains until the physical cleanup slice');

const nodeModelIndex = template.indexOf("filename='js/media-details-node-model.js'");
const nativePanelsIndex = template.indexOf("filename='js/movie-details-native-panels.js'");
const movieBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
assert(nodeModelIndex >= 0 && nativePanelsIndex > nodeModelIndex && movieBridgeIndex > nativePanelsIndex,'typed Movie panels must load after the node model and before the Movie Vue bridge');

console.log('Movie Details native panel ownership contract passed.');
