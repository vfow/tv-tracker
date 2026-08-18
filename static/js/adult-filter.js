(function(global){
    "use strict";

    function profile(){
        if(!global.DATA || typeof global.DATA !== "object") return {};
        if(!global.DATA.profile || typeof global.DATA.profile !== "object") global.DATA.profile = {};
        return global.DATA.profile;
    }

    function enabled(){
        const value = profile().adult_filter;
        return value !== false;
    }

    function includeAdultParam(media){
        const clean = String(media || "").trim().toLowerCase();
        if(clean !== "movie" && clean !== "tv") return "false";
        return enabled() ? "false" : "true";
    }

    function isAdult(item){
        return !!(item && item.adult === true);
    }

    function visible(item){
        return !enabled() || !isAdult(item);
    }

    function filterItems(items){
        return (Array.isArray(items) ? items : []).filter(visible);
    }

    function filterPayload(payload){
        if(!enabled() || !payload || typeof payload !== "object") return payload;
        if(Array.isArray(payload.results)){
            return Object.assign({},payload,{results:filterItems(payload.results)});
        }
        return payload;
    }

    function clearAdultSensitiveCaches(){
        if(typeof global.sessionStorage !== "undefined"){
            try{
                const remove = [];
                for(let index=0;index<global.sessionStorage.length;index+=1){
                    const key = global.sessionStorage.key(index) || "";
                    if(key.startsWith("tv-tracker-tmdb-search:") || key.startsWith("tv-tracker-discover-hub:") || key.startsWith("tv-tracker-tmdb-collection-detail:")) remove.push(key);
                }
                remove.forEach(key=>global.sessionStorage.removeItem(key));
            }catch(error){}
        }
    }

    function refresh(){
        clearAdultSensitiveCaches();
        if(global.activePage === "shows" && typeof global.renderShowsPage === "function") global.renderShowsPage();
        else if((global.activePage === "discover" || global.activePage === "search") && typeof global.renderDiscoverHub === "function"){
            if(global.activePage === "discover") global.renderDiscoverHub();
        }else if(typeof global.renderAll === "function") global.renderAll();
    }

    // Central TMDB request policy for callers using the shared client. Individual
    // result surfaces still apply filterItems so stale browser caches cannot leak
    // adult-labelled titles after the preference is enabled.
    const originalTMDBFetch = global.tmdbFetchJSON;
    if(typeof originalTMDBFetch === "function" && !originalTMDBFetch._tvtrackerAdultPolicy){
        const wrapped = async function(path,params={},options={}){
            const cleanPath = String(path || "").replace(/^\/+/,"").toLowerCase();
            const nextParams = Object.assign({},params || {});
            if(/^search\/(movie|tv)$/.test(cleanPath) || /^discover\/(movie|tv)$/.test(cleanPath)){
                const media = cleanPath.endsWith("movie") ? "movie" : "tv";
                nextParams.include_adult = includeAdultParam(media);
            }
            const payload = await originalTMDBFetch.call(this,path,nextParams,options);
            return filterPayload(payload);
        };
        wrapped._tvtrackerAdultPolicy = true;
        wrapped._tvtrackerOriginal = originalTMDBFetch;
        global.tmdbFetchJSON = wrapped;
    }

    // Direct Discover helpers in app.js do not all use tmdbFetchJSON, so enforce
    // the same policy at their shared list/page boundary too.
    const originalDiscoverPage = global.tmdbGetDiscoverPage;
    if(typeof originalDiscoverPage === "function" && !originalDiscoverPage._tvtrackerAdultPolicy){
        const wrappedDiscover = async function(path,params={}){
            const cleanPath = String(path || "").toLowerCase();
            const nextParams = Object.assign({},params || {});
            if(/^(movie|tv)\//.test(cleanPath) || /^discover\/(movie|tv)/.test(cleanPath)){
                nextParams.include_adult = includeAdultParam(cleanPath.startsWith("movie") || cleanPath.includes("/movie") ? "movie" : "tv");
            }
            return filterPayload(await originalDiscoverPage.call(this,path,nextParams));
        };
        wrappedDiscover._tvtrackerAdultPolicy = true;
        wrappedDiscover._tvtrackerOriginal = originalDiscoverPage;
        global.tmdbGetDiscoverPage = wrappedDiscover;
    }

    const originalSearchMediaPage = global.tmdbSearchMediaPage;
    if(typeof originalSearchMediaPage === "function" && !originalSearchMediaPage._tvtrackerAdultPolicy){
        const wrappedSearch = async function(...args){
            return filterPayload(await originalSearchMediaPage.apply(this,args));
        };
        wrappedSearch._tvtrackerAdultPolicy = true;
        wrappedSearch._tvtrackerOriginal = originalSearchMediaPage;
        global.tmdbSearchMediaPage = wrappedSearch;
    }

    global.TVTrackerAdultPolicy = Object.freeze({
        enabled,
        includeAdultParam,
        isAdult,
        visible,
        filterItems,
        filterPayload,
        clearAdultSensitiveCaches,
        refresh
    });
})(window);
