(function(global){
    "use strict";

    const SEARCH_MEDIA_TYPES = new Set(["tv","movie","person","collection"]);
    const SEARCH_RESULT_BATCH_SIZE = 21;
    const manifestUrl = "/static/vue/manifest.json";
    let vueOwner = null;
    let loadPromise = null;
    let lastModel = null;

    function normalizeMedia(value){
        const media = String(value || "").trim().toLowerCase();
        return SEARCH_MEDIA_TYPES.has(media) ? media : "tv";
    }

    function snapshot(){
        const state = global.searchRouteState && typeof global.searchRouteState === "object"
            ? global.searchRouteState
            : {};

        return Object.freeze({
            query:String(state.query || ""),
            media:normalizeMedia(state.media),
            fadeWatched:state.fadeWatched === true,
            hideWatched:state.hideWatched === true,
            hidePlan:state.hidePlan === true,
            hideFavorites:state.hideFavorites === true
        });
    }

    global.TVTrackerSearchStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });

    function imageURL(path,size){
        const value = String(path || "").trim();
        if(!value){ return ""; }
        if(/^https?:\/\//i.test(value)){ return value; }
        if(typeof global.trackerImageURL === "function"){
            return global.trackerImageURL(value,size);
        }
        return "https://image.tmdb.org/t/p/" + String(size || "w500") + value;
    }

    function eyeStateFrom(source){
        const state = source && typeof source === "object" ? source : {};
        return Object.freeze({
            fadeWatched:state.fadeWatched === true,
            hideWatched:state.hideWatched === true,
            hidePlan:state.hidePlan === true,
            hideFavorites:state.hideFavorites === true
        });
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

    function buildMediaItem(item,media){
        const title = item && (item.title || item.name) ? String(item.title || item.name) : "Untitled";
        const date = item && (item.date || item.first_air_date || item.release_date)
            ? String(item.date || item.first_air_date || item.release_date)
            : "";
        const year = date ? date.slice(0,4) : "Unknown";
        const rating = Number(item && item.vote_average || 0);
        return Object.freeze({
            kind:"media",
            id:Number(item && item.id || 0),
            media:media === "movie" ? "movie" : "tv",
            name:title,
            route:mediaRoute(item,media,title),
            posterUrl:imageURL(item && item.poster_path,"w500"),
            placeholderLabel:mediaPlaceholderLabel(item,media,title,year),
            year,
            ratingLabel:rating > 0 ? " • " + rating.toFixed(1) : "",
            adult:media === "movie" && !!(item && item.adult === true),
            eyeFaded:!!(item && item._eyeFaded),
            posterPath:String(item && item.poster_path || ""),
            overview:String(item && item.overview || ""),
            firstAirDate:String(item && item.first_air_date || ""),
            releaseDate:String(item && item.release_date || "")
        });
    }

    function buildPersonItem(item){
        const name = item && item.name ? String(item.name) : "Unknown Person";
        return Object.freeze({
            kind:"person",
            id:Number(item && item.id || 0),
            name,
            route:typeof global.getPersonDetailRoute === "function"
                ? String(global.getPersonDetailRoute("person",item && item.id,name) || "")
                : "",
            photoUrl:imageURL(item && (item.profile_path || item.poster_path),"h632")
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
            kind:"collection",
            id,
            name,
            route:typeof global.getCollectionDetailRoute === "function"
                ? String(global.getCollectionDetailRoute(id,name) || "")
                : "",
            countLabel,
            posterSlots:collectionPosterSlots(collection)
        });
    }

    function buildViewModel(resultsList){
        const state = global.discoverSearchState && typeof global.discoverSearchState === "object"
            ? global.discoverSearchState
            : {query:"",media:"tv",page:1,totalPages:1,visibleLimit:SEARCH_RESULT_BATCH_SIZE,loading:false};
        const query = String(state.query || "").trim();
        const media = normalizeMedia(state.media || "tv");
        const allItems = Array.isArray(resultsList) ? resultsList : [];
        const mediaItems = allItems.filter(item=>String(item && item.media_type || "tv") === media);
        const visibleLimit = Math.max(SEARCH_RESULT_BATCH_SIZE,Number(state.visibleLimit || SEARCH_RESULT_BATCH_SIZE));
        const filteredItems = media === "person" || media === "collection"
            ? mediaItems
            : typeof global.getEyeFilteredRenderItems === "function"
                ? global.getEyeFilteredRenderItems(mediaItems,media,state)
                : mediaItems;
        const cleanFilteredItems = Array.isArray(filteredItems) ? filteredItems : [];
        const visibleItems = cleanFilteredItems.slice(0,visibleLimit);
        const labels = {tv:"TV Shows",movie:"Movies",person:"People",collection:"Collections"};
        const bodyState = !query
            ? "prompt"
            : state.loading && !visibleItems.length
                ? "loading"
                : visibleItems.length
                    ? "results"
                    : "empty";
        const items = visibleItems.map(item=>{
            if(media === "person"){
                return buildPersonItem(item);
            }
            if(media === "collection"){
                return buildCollectionItem(item);
            }
            return buildMediaItem(item,media);
        });
        const canLoadMore = !!query && (
            visibleItems.length < cleanFilteredItems.length ||
            Number(state.page || 1) < Number(state.totalPages || 1)
        );
        const emptyHeading = mediaItems.length
            ? "No results found"
            : "No " + (labels[media] || "results") + " found";

        return Object.freeze({
            query,
            media,
            loading:state.loading === true,
            page:Number(state.page || 1),
            totalPages:Number(state.totalPages || 1),
            visibleLimit,
            eyeState:eyeStateFrom(state),
            eyeMenuOpen:typeof global.shouldKeepEyeFilterMenuOpen === "function" && global.shouldKeepEyeFilterMenuOpen() === true,
            liveDiscover:global.activePage === "discover",
            bodyState,
            emptyHeading,
            canLoadMore,
            items:Object.freeze(items)
        });
    }

    function searchRoot(){
        return global.document && typeof global.document.getElementById === "function"
            ? global.document.getElementById("search-results")
            : null;
    }

    function renderLoading(){
        const root = searchRoot();
        if(!root){ return; }
        const skeletons = Array.from({length:12}).map(()=>'<div class="tt-skeleton-poster-card" aria-hidden="true"><div class="tt-skeleton-poster"></div><div class="tt-skeleton-line tt-skeleton-line-title"></div><div class="tt-skeleton-line tt-skeleton-line-meta"></div></div>').join("");
        root.innerHTML = '<div class="search-page-shell" data-tvtracker-search-vue-loading="true" role="status" aria-label="Loading search"><div class="search-results-body"><div class="genre-tight-grid genre-tight-grid-loading search-tight-grid">' + skeletons + '</div></div></div>';
    }

    function renderLoadFailure(){
        if(vueOwner){ return; }
        const root = searchRoot();
        if(!root){ return; }
        root.innerHTML = '<div class="search-page-shell" data-tvtracker-search-vue-load-failed="true" role="alert"><div class="search-results-body"><div class="empty-state search-empty-state"><h2>Search unavailable</h2><p>Reload the page to try again.</p></div></div></div>';
    }

    function reportLoadFailure(){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"search",code:"vue_search_load_failed"});
        }
    }

    function loadVueSearch(){
        if(vueOwner){ return Promise.resolve(true); }
        if(loadPromise){ return loadPromise; }
        if(typeof global.fetch !== "function"){
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
            return import(new URL("/static/vue/" + file,base).href).then(()=>true);
        })
        .catch(()=>{
            reportLoadFailure();
            renderLoadFailure();
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function updateSearchShellAfterRender(){
        if(typeof global.ensureBrowseGlobalInteractionEvents === "function"){
            global.ensureBrowseGlobalInteractionEvents();
        }
        if(typeof global.updateShellTitle === "function"){
            global.updateShellTitle();
        }
    }

    function render(resultsList){
        lastModel = buildViewModel(resultsList);
        if(vueOwner){
            vueOwner.render(lastModel);
            updateSearchShellAfterRender();
            return;
        }
        renderLoading();
        updateSearchShellAfterRender();
        void loadVueSearch();
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Search owner");
        }
        vueOwner = owner;
        if(lastModel){
            vueOwner.render(lastModel);
            updateSearchShellAfterRender();
        }
    }

    function searchBackRoute(){
        return typeof global.lockSearchRouteBeforeResultOpen === "function"
            ? String(global.lockSearchRouteBeforeResultOpen() || "")
            : "";
    }

    const actions = Object.freeze({
        setMedia(media){
            if(typeof global.setSearchMediaType === "function"){
                global.setSearchMediaType(normalizeMedia(media));
            }
        },
        loadMore(){
            if(typeof global.loadMoreSearchResults === "function"){
                global.loadMoreSearchResults();
            }
        },
        async openMedia(item){
            const id = Number(item && item.id || 0);
            if(!id){ return; }
            const backRoute = searchBackRoute();
            if(item && item.media === "movie" && typeof global.openMoviePage === "function"){
                await global.openMoviePage(id,{movieName:String(item.name || ""),navigationContext:"discover",backRoute});
                return;
            }
            if(typeof global.openShowDetailsPage === "function"){
                await global.openShowDetailsPage(id,{showName:String(item && item.name || ""),navigationContext:"discover",backRoute});
            }
        },
        async openPerson(item){
            const id = Number(item && item.id || 0);
            if(!id || typeof global.openPersonPage !== "function"){
                return;
            }
            const backRoute = searchBackRoute();
            await global.openPersonPage("person",id,{personName:String(item.name || ""),navigationContext:"discover",backRoute});
        },
        async openCollection(item){
            const id = Number(item && item.id || 0);
            if(!id || typeof global.openCollectionDetailPage !== "function"){
                return;
            }
            const backRoute = searchBackRoute();
            await global.openCollectionDetailPage(id,{collectionName:String(item.name || ""),navigationContext:"discover",backRoute});
        }
    });

    global.TVTrackerSearchVueBridge = Object.freeze({
        attachVueOwner,
        render,
        renderLoadFailure,
        actions,
        buildViewModel,
        ownership:"vue"
    });
    global.renderSearchResults = render;

    const currentPath = String(global.location && global.location.pathname || "");
    if(/^\/app\/(?:search|discover)(?:\/|$)/.test(currentPath)){
        void loadVueSearch();
    }
})(window);
