(function(global){
    "use strict";

    const DISCOVER_MEDIA_TYPES = new Set(["tv","movie"]);
    const manifestUrl = "/static/vue/manifest.json";
    const GENRE_TONES = Object.freeze({
        "action & adventure":"discover-genre-tone-action-adventure",
        "animation":"discover-genre-tone-animation",
        "comedy":"discover-genre-tone-comedy",
        "crime":"discover-genre-tone-crime",
        "documentary":"discover-genre-tone-documentary",
        "drama":"discover-genre-tone-drama",
        "family":"discover-genre-tone-family",
        "kids":"discover-genre-tone-kids",
        "mystery":"discover-genre-tone-mystery",
        "news":"discover-genre-tone-news",
        "reality":"discover-genre-tone-reality",
        "sci-fi & fantasy":"discover-genre-tone-sci-fi-fantasy",
        "soap":"discover-genre-tone-soap",
        "talk":"discover-genre-tone-talk",
        "war & politics":"discover-genre-tone-war-politics",
        "western":"discover-genre-tone-western",
        "action":"discover-genre-tone-action",
        "adventure":"discover-genre-tone-adventure",
        "fantasy":"discover-genre-tone-fantasy",
        "history":"discover-genre-tone-history",
        "horror":"discover-genre-tone-horror",
        "music":"discover-genre-tone-music",
        "romance":"discover-genre-tone-romance",
        "science fiction":"discover-genre-tone-science-fiction",
        "tv movie":"discover-genre-tone-tv-movie",
        "thriller":"discover-genre-tone-thriller",
        "war":"discover-genre-tone-war"
    });

    let vueOwner = null;
    let loadPromise = null;
    let lastModel = null;

    function normalizeMedia(value){
        const media = String(value || "").trim().toLowerCase();
        return DISCOVER_MEDIA_TYPES.has(media) ? media : "tv";
    }

    function imageURL(path,size){
        const value = String(path || "").trim();
        if(!value){ return ""; }
        if(/^https?:\/\//i.test(value)){ return value; }
        if(typeof global.trackerImageURL === "function"){
            return global.trackerImageURL(value,size);
        }
        return "https://image.tmdb.org/t/p/" + String(size || "w500") + value;
    }

    function stateSnapshot(){
        const bridge = global.TVTrackerDiscoverStateBridge;
        if(bridge && typeof bridge.snapshot === "function"){
            return bridge.snapshot();
        }
        return global.discoverHubState && typeof global.discoverHubState === "object"
            ? global.discoverHubState
            : {loaded:false,loading:false,error:"",sections:[],genres:{tv:[],movie:[]},collections:[]};
    }

    function mediaRoute(item,media,title){
        if(media === "movie"){
            return typeof global.getMovieDetailRoute === "function"
                ? String(global.getMovieDetailRoute(item && item.id,title) || "")
                : "";
        }
        return typeof global.getShowDetailRoute === "function"
            ? String(global.getShowDetailRoute(item && item.id,title) || "")
            : "";
    }

    function mediaPlaceholderLabel(item,media,title,year){
        if(typeof global.getMediaPosterPlaceholderLabel === "function"){
            return String(global.getMediaPosterPlaceholderLabel(item,media) || title);
        }
        return year && year !== "Unknown" ? title + " (" + year + ")" : title;
    }

    function buildMediaItem(item,fallbackMedia){
        const media = normalizeMedia(item && item.media_type || fallbackMedia);
        const title = item && (item.title || item.name) ? String(item.title || item.name) : "Untitled";
        const date = item && (item.date || item.release_date || item.first_air_date)
            ? String(item.date || item.release_date || item.first_air_date)
            : "";
        const year = date ? date.slice(0,4) : "Unknown";
        return Object.freeze({
            id:Number(item && item.id || 0),
            media,
            name:title,
            route:mediaRoute(item,media,title),
            posterUrl:imageURL(item && item.poster_path,"w500"),
            placeholderLabel:mediaPlaceholderLabel(item,media,title,year),
            year,
            adult:media === "movie" && !!(item && item.adult === true),
            posterPath:String(item && item.poster_path || ""),
            overview:String(item && item.overview || ""),
            firstAirDate:String(item && item.first_air_date || ""),
            releaseDate:String(item && item.release_date || "")
        });
    }

    function buildRow(section){
        const media = normalizeMedia(section && section.media);
        const source = Array.isArray(section && section.items) && section.items.length
            ? section.items
            : Array.isArray(section && section.shows) ? section.shows : [];
        const items = source
        .filter(item=>item && Number(item.id || 0) > 0)
        .map(item=>buildMediaItem(item,media));
        return Object.freeze({
            key:String(section && (section.key || section.title) || "row"),
            title:String(section && section.title || "Browse"),
            route:String(section && section.route || "").trim(),
            media,
            items:Object.freeze(items)
        });
    }

    function collectionPosterSlots(collection){
        const source = typeof global.getCollectionPosterSlotsForRender === "function"
            ? global.getCollectionPosterSlotsForRender(collection)
            : [];
        return Object.freeze((Array.isArray(source) ? source : []).slice(0,3).map(slot=>{
            const title = typeof global.getCollectionPosterSlotTitle === "function"
                ? String(global.getCollectionPosterSlotTitle(slot,collection) || "Untitled Movie")
                : String(slot && (slot.title || slot.name) || collection && (collection.name || collection.title) || "Collection");
            const year = typeof global.getCollectionPosterSlotYear === "function"
                ? String(global.getCollectionPosterSlotYear(slot) || "")
                : String(slot && (slot.release_date || slot.date || "") || "").slice(0,4);
            return Object.freeze({
                imageUrl:imageURL(slot && slot.poster_path,"w500"),
                label:year ? title + " (" + year + ")" : title
            });
        }));
    }

    function isPromotableCollection(collection){
        if(typeof global.isPromotableCollection === "function"){
            return global.isPromotableCollection(collection) === true;
        }
        return !!(collection && collection.id && (collection.name || collection.title));
    }

    function buildCollectionItem(collection){
        const id = Number(collection && collection.id || 0);
        const name = String(collection && (collection.name || collection.title) || "Collection").trim() || "Collection";
        const count = typeof global.getCollectionMovieCount === "function"
            ? Number(global.getCollectionMovieCount(collection) || 0)
            : Number(collection && collection.movie_count || (Array.isArray(collection && collection.parts) ? collection.parts.length : 0));
        const countLabel = collection && collection.live_search_summary === true && !count
            ? "Loading details…"
            : count === 1 ? "1 movie" : String(count || 0) + " movies";
        return Object.freeze({
            id,
            name,
            route:typeof global.getCollectionDetailRoute === "function"
                ? String(global.getCollectionDetailRoute(id,name) || "")
                : "",
            countLabel,
            posterSlots:collectionPosterSlots(collection)
        });
    }

    function genreTone(name){
        return GENRE_TONES[String(name || "").trim().toLowerCase()] || "";
    }

    function buildGenreItems(source,media){
        const cleanMedia = normalizeMedia(media);
        return Object.freeze((Array.isArray(source) ? source : [])
        .map(genre=>{
            const id = Number(genre && genre.id || 0);
            const name = String(genre && genre.name || "").trim();
            if(!id || !name || (cleanMedia === "tv" && name.toLowerCase() === "soap")){
                return null;
            }
            const route = typeof global.getGenreDetailRoute === "function"
                ? String(global.getGenreDetailRoute(id,name,cleanMedia) || "")
                : "";
            if(!route || route === "/app/list/watching"){
                return null;
            }
            return Object.freeze({id,name,route,toneClass:genreTone(name)});
        })
        .filter(Boolean));
    }

    function buildViewModel(){
        const state = stateSnapshot();
        const sections = (Array.isArray(state && state.sections) ? state.sections : [])
        .map(buildRow)
        .filter(row=>row.items.length > 0);
        const tvRows = sections.filter(row=>row.media === "tv");
        const movieRows = sections.filter(row=>row.media === "movie");
        const collections = (Array.isArray(state && state.collections) ? state.collections : [])
        .filter(isPromotableCollection)
        .slice(0,12)
        .map(buildCollectionItem);
        const genres = state && state.genres && typeof state.genres === "object" ? state.genres : {};
        const hasSections = sections.length > 0;
        const bodyState = state && state.loading === true && !hasSections
            ? "loading"
            : state && state.error && !hasSections
                ? "error"
                : "ready";
        const activeGenreMedia = typeof global.normalizeGenreMediaType === "function"
            ? normalizeMedia(global.normalizeGenreMediaType(global.discoverGenreMedia || "tv"))
            : normalizeMedia(global.discoverGenreMedia || "tv");

        return Object.freeze({
            bodyState,
            error:String(state && state.error || ""),
            tvRows:Object.freeze(tvRows),
            movieRows:Object.freeze(movieRows),
            collections:Object.freeze(collections),
            genres:Object.freeze({
                tv:buildGenreItems(genres.tv,"tv"),
                movie:buildGenreItems(genres.movie,"movie")
            }),
            activeGenreMedia
        });
    }

    function isHubVisible(){
        if(typeof global.activePage === "string"){
            return global.activePage === "discover"
                && (typeof global.shouldShowDiscoverHub !== "function" || global.shouldShowDiscoverHub());
        }
        return /^\/app\/discover\/?$/.test(String(global.location && global.location.pathname || ""));
    }

    function renderLoading(){
        if(!isHubVisible()){ return; }
        lastModel = Object.freeze({...buildViewModel(),bodyState:"loading"});
        if(vueOwner){
            vueOwner.render(lastModel);
            return;
        }
        void loadVueDiscover();
    }

    function renderLoadFailure(){
        if(vueOwner || !isHubVisible()){ return; }
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.renderSurfaceFailure === "function"){
            runtime.renderSurfaceFailure({
                rootId:"search-results",
                marker:"data-tvtracker-discover-vue-load-failed",
                title:"Discover unavailable",
                message:"Reload the page to try again."
            });
        }
    }

    function reportLoadFailure(){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"discover",code:"vue_discover_load_failed"});
        }
    }

    function loadVueDiscover(){
        if(vueOwner){ return Promise.resolve(true); }
        if(loadPromise){ return loadPromise; }
        if(typeof global.fetch !== "function"){
            reportLoadFailure();
            renderLoadFailure();
            return Promise.resolve(false);
        }
        loadPromise = global.fetch(manifestUrl,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}})
        .then(response=>{
            if(!response.ok){ throw new Error("manifest request failed"); }
            return response.json();
        })
        .then(manifest=>{
            const entry = manifest && manifest["frontend/src/main.ts"];
            const file = entry && typeof entry.file === "string" ? entry.file : "";
            if(!/^assets\/[A-Za-z0-9_-]+\.js$/.test(file)){
                throw new Error("invalid Vue manifest entry");
            }
            const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
            return import(new URL("/static/vue/" + file,base).href).then(()=>{
                if(!vueOwner){ throw new Error("Discover Vue owner unavailable"); }
                return true;
            });
        })
        .catch(()=>{
            reportLoadFailure();
            renderLoadFailure();
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function updateDiscoverShellAfterRender(){
        if(typeof global.ensureBrowseGlobalInteractionEvents === "function"){
            global.ensureBrowseGlobalInteractionEvents();
        }
        if(typeof global.restoreCollectionReturnPositionSoon === "function"){
            global.restoreCollectionReturnPositionSoon("/app/discover");
        }
        if(typeof global.updateShellTitle === "function"){
            global.updateShellTitle();
        }
    }

    function render(){
        if(!isHubVisible()){ return; }
        lastModel = buildViewModel();
        if(vueOwner){
            vueOwner.render(lastModel);
            updateDiscoverShellAfterRender();
            return;
        }
        updateDiscoverShellAfterRender();
        void loadVueDiscover();
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Discover owner");
        }
        vueOwner = owner;
        if(lastModel && isHubVisible()){
            vueOwner.render(lastModel);
            updateDiscoverShellAfterRender();
        }
    }

    const actions = Object.freeze({
        setGenreMedia(media){
            const cleanMedia = normalizeMedia(media);
            global.discoverGenreMedia = cleanMedia;
            if(typeof global.renderDiscoverHub === "function"){
                global.renderDiscoverHub();
                return;
            }
            render();
        },
        async openMedia(item){
            const id = Number(item && item.id || 0);
            if(!id){ return; }
            const backRoute = typeof global.lockSearchRouteBeforeResultOpen === "function"
                ? String(global.lockSearchRouteBeforeResultOpen() || "")
                : "";
            if(item && item.media === "movie" && typeof global.openMoviePage === "function"){
                await global.openMoviePage(id,{movieName:String(item.name || ""),navigationContext:"discover",backRoute});
                return;
            }
            if(typeof global.openShowDetailsPage === "function"){
                await global.openShowDetailsPage(id,{showName:String(item && item.name || ""),navigationContext:"discover",backRoute});
            }
        }
    });

    global.TVTrackerDiscoverVueBridge = Object.freeze({
        attachVueOwner,
        render,
        renderLoadFailure,
        renderLoading,
        actions,
        buildViewModel,
        ownership:"vue-content"
    });
    global.renderDiscoverHubContent = render;


// --TVT-discover-gate-owner-begin--
const DISCOVER_GATE_MAX_MS = 12000;
let discoverGateActive = false;
let discoverGateStableReady = false;
let discoverGateTrendingSettled = false;
let discoverGateTrendingPromise = null;
let discoverGateTimer = null;
let discoverGateCycleId = 0;
let discoverGateExpired = false;

function discoverGateIsHubVisible(){
    if(window.activePage !== "discover"){
        return false;
    }
    if(typeof window.shouldShowDiscoverHub === "function"){
        return !!window.shouldShowDiscoverHub();
    }
    return true;
}

function discoverGateBaseSettled(){
    const state = window.discoverHubState && typeof window.discoverHubState === "object"
    ? window.discoverHubState
    : {};
    return state.loading !== true && (state.loaded === true || !!state.error);
}

function discoverGateRenderSkeleton(){
    const bridge = window.TVTrackerDiscoverVueBridge;
    if(bridge && typeof bridge.renderLoading === "function"){
        bridge.renderLoading();
    }
}

function discoverGateClearTimer(){
    if(discoverGateTimer){
        clearTimeout(discoverGateTimer);
        discoverGateTimer = null;
    }
}

function discoverGateRelease(force=false){
    if(!discoverGateActive || !discoverGateIsHubVisible()){
        return false;
    }
    if(!force && (!discoverGateBaseSettled() || !discoverGateTrendingSettled)){
        discoverGateRenderSkeleton();
        return false;
    }
    discoverGateActive = false;
    discoverGateStableReady = true;
    discoverGateClearTimer();
    window.renderDiscoverHubContent();
    return true;
}

function discoverGateEnsureTrending(){
    if(discoverGateTrendingPromise){
        return discoverGateTrendingPromise;
    }
    const api = window.TVTrackerTrending;
    if(!api || typeof api.loadHubRows !== "function"){
        discoverGateTrendingSettled = true;
        discoverGateRelease(false);
        return Promise.resolve([]);
    }

    discoverGateTrendingSettled = false;
    discoverGateTrendingPromise = Promise.resolve()
    .then(()=>api.loadHubRows(false))
    .catch(()=>[])
    .finally(()=>{
        // A refresh can reuse a request started before the previous gate timed out.
        // Its completion settles the shared request for the current gate as well.
        discoverGateTrendingSettled = true;
        discoverGateTrendingPromise = null;
        discoverGateRelease(false);
    });
    return discoverGateTrendingPromise;
}

function discoverGateBegin(){
    if(!discoverGateIsHubVisible()){
        return false;
    }
    if(!discoverGateActive){
        discoverGateActive = true;
        discoverGateStableReady = false;
        discoverGateExpired = false;
        discoverGateTrendingSettled = false;
        discoverGateCycleId += 1;
        discoverGateClearTimer();
        const cycle = discoverGateCycleId;
        discoverGateTimer = setTimeout(()=>{
            if(cycle === discoverGateCycleId){
                discoverGateExpired = true;
                discoverGateTrendingSettled = true;
                discoverGateRelease(true);
            }
        },DISCOVER_GATE_MAX_MS);
        discoverGateRenderSkeleton();
        discoverGateEnsureTrending();
        return true;
    }
    discoverGateRenderSkeleton();
    return true;
}

function renderDiscoverHub(){
    if(!discoverGateIsHubVisible()){
        return;
    }

    const state = window.discoverHubState && typeof window.discoverHubState === "object"
    ? window.discoverHubState
    : {loaded:false,loading:false,error:"",sections:[],genres:[]};

    if(state.loading === true){
        discoverGateStableReady = false;
    }

    if(discoverGateStableReady && state.loading !== true){
        return window.renderDiscoverHubContent();
    }

    discoverGateBegin();
    if(discoverGateExpired || (discoverGateBaseSettled() && discoverGateTrendingSettled)){
        discoverGateRelease(discoverGateExpired);
    }
    return undefined;
}

window.TVTrackerDiscoverStability = Object.freeze({
    available:true,
    begin:discoverGateBegin,
    release:discoverGateRelease,
    isGateActive:()=>discoverGateActive,
    isStableReady:()=>discoverGateStableReady,
    baseSettled:discoverGateBaseSettled,
    MAX_GATE_MS:DISCOVER_GATE_MAX_MS
});
window.renderDiscoverHub = renderDiscoverHub;
// --TVT-discover-gate-owner-end--

    const currentPath = String(global.location && global.location.pathname || "");
    if(/^\/app\/discover(?:\/|$)/.test(currentPath)){
        void loadVueDiscover();
    }
})(window);
