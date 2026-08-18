(function(global){
    "use strict";

    const WRAPPER_MARK = "_tvtrackerAdultPolicy";
    const CLASSIFICATION_CONCURRENCY = 3;
    let classificationPromise = null;
    let classificationTimer = null;

    function profile(){
        if(!global.DATA || typeof global.DATA !== "object") return {};
        if(!global.DATA.profile || typeof global.DATA.profile !== "object") global.DATA.profile = {};
        return global.DATA.profile;
    }

    function enabled(){
        return profile().adult_filter !== false;
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

    function mediaId(item){
        return String(item && (item.tmdb_id || item.id || item.movie_id || item.show_id) || "").trim();
    }

    function trackedRecord(kind,id){
        const cleanId = String(id || "").trim();
        if(!cleanId || !global.DATA || typeof global.DATA !== "object") return null;
        const store = kind === "movie" ? global.DATA.movies : global.DATA.shows;
        return store && typeof store === "object" ? (store[cleanId] || null) : null;
    }

    function visibleTrackedItem(item,kind=""){
        if(!enabled()) return true;
        if(!item || typeof item !== "object") return true;
        if(isAdult(item)) return false;
        if(item.show && isAdult(item.show)) return false;
        if(item.movie && isAdult(item.movie)) return false;

        const cleanKind = String(kind || item.media_type || "").toLowerCase();
        if(cleanKind === "movie"){
            const record = trackedRecord("movie",mediaId(item));
            return !isAdult(record);
        }
        if(cleanKind === "tv" || cleanKind === "show"){
            const record = trackedRecord("tv",mediaId(item));
            return !isAdult(record);
        }
        return true;
    }

    function filterTrackedItems(items,kind=""){
        return (Array.isArray(items) ? items : []).filter(item=>visibleTrackedItem(item,kind));
    }

    function isMovieHistory(entry){
        if(!entry || typeof entry !== "object") return false;
        if(typeof global.isMovieHistoryEntry === "function"){
            try{ return !!global.isMovieHistoryEntry(entry); }catch(error){}
        }
        return String(entry.media_type || "").toLowerCase() === "movie" || !!entry.movie_id;
    }

    function isHistoryEntryVisible(entry){
        if(!enabled() || !entry || typeof entry !== "object") return true;
        if(isAdult(entry)) return false;
        const movie = isMovieHistory(entry);
        const id = movie
            ? String(entry.movie_id || entry.tmdb_id || "").trim()
            : String(entry.tmdb_id || entry.show_id || "").trim();
        return !isAdult(trackedRecord(movie ? "movie" : "tv",id));
    }

    function copyAdultClassification(target,source){
        if(target && typeof target === "object" && source && typeof source.adult === "boolean"){
            target.adult = source.adult;
        }
        return target;
    }

    function wrapRecordBuilder(name,sourceIndex=0){
        const original = global[name];
        if(typeof original !== "function" || original[WRAPPER_MARK]) return false;
        const wrapped = function(...args){
            return copyAdultClassification(original.apply(this,args),args[sourceIndex]);
        };
        wrapped[WRAPPER_MARK] = true;
        wrapped._tvtrackerOriginal = original;
        global[name] = wrapped;
        return true;
    }

    function wrapArrayResult(name,filter){
        const original = global[name];
        if(typeof original !== "function" || original[WRAPPER_MARK]) return false;
        const wrapped = function(...args){
            const result = original.apply(this,args);
            return Array.isArray(result) ? filter(result,args) : result;
        };
        wrapped[WRAPPER_MARK] = true;
        wrapped._tvtrackerOriginal = original;
        global[name] = wrapped;
        return true;
    }

    function wrapFilterShow(){
        const original = global.filterShow;
        if(typeof original !== "function" || original[WRAPPER_MARK]) return false;
        const wrapped = function(show,...args){
            if(!visibleTrackedItem(show,"tv")) return false;
            return original.call(this,show,...args);
        };
        wrapped[WRAPPER_MARK] = true;
        wrapped._tvtrackerOriginal = original;
        global.filterShow = wrapped;
        return true;
    }

    function wrapUpcomingScheduleItems(){
        const original = global.getUpcomingScheduleItems;
        if(typeof original !== "function" || original[WRAPPER_MARK]) return false;
        const wrapped = function(show,...args){
            if(!visibleTrackedItem(show,"tv")) return [];
            return original.call(this,show,...args);
        };
        wrapped[WRAPPER_MARK] = true;
        wrapped._tvtrackerOriginal = original;
        global.getUpcomingScheduleItems = wrapped;
        return true;
    }

    function installRuntimeWrappers(){
        // Persist TMDB's own classification whenever a title becomes tracker data.
        // No maturity/rating inference is performed here: only an explicit boolean
        // `adult` value supplied by TMDB is copied into tracker metadata.
        wrapRecordBuilder("createShowObject",0);
        wrapRecordBuilder("getMovieRecordFromDetails",0);
        wrapRecordBuilder("normalizeMovieTrackingRecord",0);
        wrapRecordBuilder("normalizeFavoriteMovieRecord",0);

        // Read-time visibility boundaries hide records without deleting or
        // rewriting the underlying tracker state.
        wrapFilterShow();
        wrapArrayResult("getWatchlistShowsForCurrentView",items=>filterTrackedItems(items,"tv"));
        wrapArrayResult("getLibraryBaseStatusShows",items=>filterTrackedItems(items,"tv"));
        wrapArrayResult("getFavoriteShows",items=>filterTrackedItems(items,"tv"));
        wrapArrayResult("getFavoriteMovies",items=>filterTrackedItems(items,"movie"));
        wrapArrayResult("getUpcomingShows",items=>items.filter(item=>visibleTrackedItem(item && item.show ? item.show : item,"tv")));
        wrapUpcomingScheduleItems();
        wrapArrayResult("getActivityHistoryEntries",items=>items.filter(isHistoryEntryVisible));
    }

    function classificationCandidates(){
        const candidates = new Map();
        const add = (kind,record,stateKey)=>{
            if(!record || typeof record !== "object" || typeof record.adult === "boolean") return;
            const id = mediaId(record);
            const query = String(record.title || record.name || "").trim();
            if(!id || !query) return;
            const key = kind + ":" + id;
            if(!candidates.has(key)) candidates.set(key,{kind,id,query,targets:[],stateKeys:new Set()});
            const candidate = candidates.get(key);
            candidate.targets.push(record);
            candidate.stateKeys.add(stateKey);
        };

        if(global.DATA && global.DATA.shows && typeof global.DATA.shows === "object"){
            Object.values(global.DATA.shows).forEach(record=>add("tv",record,"shows"));
        }
        if(global.DATA && global.DATA.movies && typeof global.DATA.movies === "object"){
            Object.values(global.DATA.movies).forEach(record=>add("movie",record,"movies"));
        }
        const favorites = profile().favorite_movies;
        if(Array.isArray(favorites)){
            favorites.forEach(record=>add("movie",record,"profile"));
        }
        return Array.from(candidates.values());
    }

    async function fetchClassification(candidate){
        if(!candidate || typeof global.tmdbFetchJSON !== "function") return null;
        try{
            // Search TV/Movie is the classification boundary because those TMDB
            // response contracts expose `adult`. Never infer from ratings and never
            // accept a same-title result unless its TMDB id is the tracked id.
            const payload = await global.tmdbFetchJSON(
                "search/" + candidate.kind,
                {query:candidate.query,include_adult:"true",page:1},
                {adultPolicyClassification:true}
            );
            const results = payload && Array.isArray(payload.results) ? payload.results : [];
            const exact = results.find(item=>String(item && item.id || "") === candidate.id);
            return exact && typeof exact.adult === "boolean" ? exact.adult : null;
        }catch(error){
            return null;
        }
    }

    async function classifyTrackedMedia(){
        installRuntimeWrappers();
        if(!enabled() || typeof global.tmdbFetchJSON !== "function") return {checked:0,changed:0};
        if(classificationPromise) return classificationPromise;

        classificationPromise = (async()=>{
            const candidates = classificationCandidates();
            const changedKeys = new Set();
            let cursor = 0;
            let changed = 0;

            async function worker(){
                while(cursor < candidates.length){
                    const candidate = candidates[cursor++];
                    const adult = await fetchClassification(candidate);
                    if(typeof adult !== "boolean") continue;
                    candidate.targets.forEach(target=>{ target.adult = adult; });
                    candidate.stateKeys.forEach(key=>changedKeys.add(key));
                    changed += 1;
                }
            }

            const workerCount = Math.min(CLASSIFICATION_CONCURRENCY,candidates.length);
            await Promise.all(Array.from({length:workerCount},()=>worker()));

            if(changedKeys.size && typeof global.saveData === "function"){
                try{
                    await global.saveData({stateKeys:Array.from(changedKeys)});
                }catch(error){
                    // Classification enrichment is optional metadata. Keep the
                    // in-memory visibility policy useful and retry persistence on
                    // a later normal save rather than surfacing technical errors.
                }
            }

            if(changed && typeof global.renderAll === "function"){
                try{ global.renderAll(); }catch(error){}
            }
            return {checked:candidates.length,changed};
        })();

        try{
            return await classificationPromise;
        }finally{
            classificationPromise = null;
        }
    }

    function scheduleClassification(delay=0){
        if(!enabled() || typeof global.setTimeout !== "function") return;
        if(classificationTimer !== null && typeof global.clearTimeout === "function"){
            global.clearTimeout(classificationTimer);
        }
        classificationTimer = global.setTimeout(()=>{
            classificationTimer = null;
            if(global.appDataReady === false){
                scheduleClassification(1000);
                return;
            }
            classifyTrackedMedia().catch(()=>{});
        },Math.max(0,Number(delay) || 0));
    }

    function clearAdultSensitiveCaches(){
        if(typeof global.sessionStorage !== "undefined"){
            try{
                const remove = [];
                for(let index=0;index<global.sessionStorage.length;index+=1){
                    const key = global.sessionStorage.key(index) || "";
                    if(
                        key.startsWith("tv-tracker-tmdb-search:") ||
                        key.startsWith("tv-tracker-discover-hub:") ||
                        key.startsWith("tv-tracker-tmdb-collection-detail:")
                    ) remove.push(key);
                }
                remove.forEach(key=>global.sessionStorage.removeItem(key));
            }catch(error){}
        }
    }

    function refresh(){
        installRuntimeWrappers();
        clearAdultSensitiveCaches();
        scheduleClassification(0);
        if(global.activePage === "shows" && typeof global.renderShowsPage === "function") global.renderShowsPage();
        else if((global.activePage === "discover" || global.activePage === "search") && typeof global.renderDiscoverHub === "function"){
            if(global.activePage === "discover") global.renderDiscoverHub();
        }else if(typeof global.renderAll === "function") global.renderAll();
    }

    // Central TMDB request policy. Search/discover requests opt out of adult
    // results while the preference is enabled, and result arrays are filtered a
    // second time so stale browser caches cannot leak TMDB-labelled adult titles.
    // Internal classification requests are the sole exception: they request the
    // complete search set, then accept only the exact tracked TMDB id.
    const originalTMDBFetch = global.tmdbFetchJSON;
    if(typeof originalTMDBFetch === "function" && !originalTMDBFetch[WRAPPER_MARK]){
        const wrapped = async function(path,params={},options={}){
            const cleanPath = String(path || "").replace(/^\/+/,"").toLowerCase();
            const nextParams = Object.assign({},params || {});
            const classificationRequest = !!(options && options.adultPolicyClassification === true);
            if(/^search\/(movie|tv)$/.test(cleanPath) || /^discover\/(movie|tv)$/.test(cleanPath)){
                const media = cleanPath.endsWith("movie") ? "movie" : "tv";
                nextParams.include_adult = classificationRequest ? "true" : includeAdultParam(media);
            }
            const payload = await originalTMDBFetch.call(this,path,nextParams,options);
            return classificationRequest ? payload : filterPayload(payload);
        };
        wrapped[WRAPPER_MARK] = true;
        wrapped._tvtrackerOriginal = originalTMDBFetch;
        global.tmdbFetchJSON = wrapped;
    }

    const originalDiscoverPage = global.tmdbGetDiscoverPage;
    if(typeof originalDiscoverPage === "function" && !originalDiscoverPage[WRAPPER_MARK]){
        const wrappedDiscover = async function(path,params={}){
            const cleanPath = String(path || "").toLowerCase();
            const nextParams = Object.assign({},params || {});
            if(/^(movie|tv)\//.test(cleanPath) || /^discover\/(movie|tv)/.test(cleanPath)){
                nextParams.include_adult = includeAdultParam(cleanPath.startsWith("movie") || cleanPath.includes("/movie") ? "movie" : "tv");
            }
            return filterPayload(await originalDiscoverPage.call(this,path,nextParams));
        };
        wrappedDiscover[WRAPPER_MARK] = true;
        wrappedDiscover._tvtrackerOriginal = originalDiscoverPage;
        global.tmdbGetDiscoverPage = wrappedDiscover;
    }

    const originalSearchMediaPage = global.tmdbSearchMediaPage;
    if(typeof originalSearchMediaPage === "function" && !originalSearchMediaPage[WRAPPER_MARK]){
        const wrappedSearch = async function(...args){
            return filterPayload(await originalSearchMediaPage.apply(this,args));
        };
        wrappedSearch[WRAPPER_MARK] = true;
        wrappedSearch._tvtrackerOriginal = originalSearchMediaPage;
        global.tmdbSearchMediaPage = wrappedSearch;
    }

    installRuntimeWrappers();
    if(global.document && global.document.readyState === "loading" && typeof global.document.addEventListener === "function"){
        global.document.addEventListener("DOMContentLoaded",()=>{
            installRuntimeWrappers();
            scheduleClassification(1000);
        },{once:true});
    }else{
        scheduleClassification(1000);
    }

    global.TVTrackerAdultPolicy = Object.freeze({
        enabled,
        includeAdultParam,
        isAdult,
        visible,
        visibleTrackedItem,
        isHistoryEntryVisible,
        filterItems,
        filterTrackedItems,
        filterPayload,
        copyAdultClassification,
        installRuntimeWrappers,
        classifyTrackedMedia,
        clearAdultSensitiveCaches,
        refresh
    });
})(window);
