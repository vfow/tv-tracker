(function(global){
    "use strict";

    const TTL = 1000 * 60 * 60 * 24 * 3;
    const LOCAL_PREFIX = "tv-tracker-provider-availability:v1:";
    const STATE_KEY = "provider_metadata";
    const MAX_LOCAL_AGE = 1000 * 60 * 60 * 24 * 30;
    const STARTUP_CONCURRENCY = 2;
    const STARTUP_DELAY = 150;
    const NO_PROVIDER_APPEND = {
        tv:"external_ids,videos,content_ratings,similar,aggregate_credits,alternative_titles,keywords",
        movie:"external_ids,videos,release_dates,credits,similar,keywords"
    };
    const inflight = new Map();
    let startupPoll = null;
    let startupStarted = false;
    let saveTimer = null;
    let saveDirty = false;
    let savePromise = null;
    let saveBatchDepth = 0;

    const media = value=>String(value || "").toLowerCase() === "movie" ? "movie" : "tv";
    const id = value=>/^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "";
    const clone = value=>{
        try{ return JSON.parse(JSON.stringify(value)); }
        catch(error){ return value; }
    };
    const region = ()=>{
        const api = global.TVTrackerStreamingRegion;
        if(api && typeof api.getStreamingRegion === "function"){
            return String(api.getStreamingRegion() || "").trim().toUpperCase();
        }
        return typeof global.v2GetWatchRegion === "function"
        ? String(global.v2GetWatchRegion() || "").trim().toUpperCase()
        : "";
    };
    const key = (type,titleId,watchRegion)=>media(type)+":"+id(titleId)+":"+String(watchRegion || "").toUpperCase();
    const validProviders = value=>!!(value && value.results && typeof value.results === "object" && !Array.isArray(value.results));
    const fresh = entry=>{
        const time = Date.parse(String(entry && entry.refreshed_at || ""));
        return Number.isFinite(time) && Date.now() - time <= TTL;
    };
    const tracked = (type,titleId)=>{
        const cleanId = id(titleId);
        if(!cleanId || !global.DATA){ return false; }
        return media(type) === "movie"
        ? !!(global.DATA.movies && global.DATA.movies[cleanId])
        : !!(global.DATA.shows && global.DATA.shows[cleanId]);
    };
    const state = ()=>{
        if(!global.DATA){ return null; }
        if(!global.DATA[STATE_KEY] || typeof global.DATA[STATE_KEY] !== "object" || Array.isArray(global.DATA[STATE_KEY])){
            global.DATA[STATE_KEY] = {};
        }
        return global.DATA[STATE_KEY];
    };
    const snapshot = (payload,watchRegion)=>{
        const result = {id:Number(payload && payload.id || 0),results:{}};
        if(payload && payload.results && payload.results[watchRegion]){
            result.results[watchRegion] = clone(payload.results[watchRegion]);
        }
        return result;
    };
    const storage = ()=>{
        try{ return global.localStorage || null; }
        catch(error){ return null; }
    };

    function localRead(type,titleId,watchRegion){
        const store = storage();
        if(!store){ return null; }
        const cacheKey = LOCAL_PREFIX + key(type,titleId,watchRegion);
        try{
            const entry = JSON.parse(store.getItem(cacheKey) || "null");
            if(!entry || !validProviders(entry.providers)){ return null; }
            const time = Date.parse(String(entry.refreshed_at || ""));
            if(!Number.isFinite(time) || Date.now() - time > MAX_LOCAL_AGE){
                store.removeItem(cacheKey);
                return null;
            }
            return entry;
        }catch(error){ return null; }
    }

    function localWrite(type,titleId,watchRegion,entry){
        const store = storage();
        if(!store || !entry){ return; }
        try{ store.setItem(LOCAL_PREFIX + key(type,titleId,watchRegion),JSON.stringify(entry)); }
        catch(error){}
    }

    function clearScheduledSave(){
        if(saveTimer !== null && typeof global.clearTimeout === "function"){
            global.clearTimeout(saveTimer);
        }
        saveTimer = null;
    }

    function scheduleSave(){
        saveDirty = true;
        if(
            saveBatchDepth > 0 ||
            saveTimer !== null ||
            savePromise ||
            typeof global.setTimeout !== "function"
        ){
            return;
        }
        saveTimer = global.setTimeout(()=>{
            saveTimer = null;
            flushSave();
        },500);
    }

    async function flushSave(){
        if(saveBatchDepth > 0){ return false; }
        clearScheduledSave();

        if(savePromise){
            const current = await savePromise;
            if(saveDirty && saveBatchDepth === 0){
                const followUp = await flushSave();
                return current && followUp;
            }
            return current;
        }

        if(!saveDirty){ return false; }
        saveDirty = false;
        if(typeof global.saveData !== "function"){ return false; }

        let request;
        try{
            request = Promise.resolve(global.saveData({stateKeys:[STATE_KEY],silent:true}))
            .then(value=>value !== false)
            .catch(()=>false);
        }catch(error){
            return false;
        }

        savePromise = request;
        const result = await request;
        if(savePromise === request){ savePromise = null; }

        if(saveDirty && saveBatchDepth === 0){
            const followUp = await flushSave();
            return result && followUp;
        }
        return result;
    }

    function beginSaveBatch(){
        saveBatchDepth += 1;
        if(saveBatchDepth === 1){ clearScheduledSave(); }
    }

    async function endSaveBatch(){
        if(saveBatchDepth > 0){ saveBatchDepth -= 1; }
        if(saveBatchDepth === 0 && saveDirty){
            return flushSave();
        }
        return false;
    }

    function read(type,titleId,watchRegion){
        if(tracked(type,titleId)){
            const bucket = state();
            const entry = bucket && bucket[key(type,titleId,watchRegion)];
            if(entry && validProviders(entry.providers)){ return entry; }
            const local = localRead(type,titleId,watchRegion);
            if(local && bucket){
                bucket[key(type,titleId,watchRegion)] = local;
                scheduleSave();
            }
            return local;
        }
        return localRead(type,titleId,watchRegion);
    }

    function write(type,titleId,watchRegion,providers,refreshedAt=new Date().toISOString()){
        if(!id(titleId) || !watchRegion || !validProviders(providers)){ return null; }
        const entry = {
            media:media(type),id:id(titleId),region:watchRegion,
            refreshed_at:String(refreshedAt),providers:clone(providers)
        };
        if(tracked(type,titleId)){
            const bucket = state();
            if(bucket){
                bucket[key(type,titleId,watchRegion)] = entry;
                scheduleSave();
            }
        }else{
            localWrite(type,titleId,watchRegion,entry);
        }
        return entry;
    }

    function objectId(object){
        return id(object && (object.tmdb_id || object.id || object.movie_id || object.show_id));
    }

    function apply(type,object,providers){
        if(!object || !validProviders(providers)){ return; }
        if(media(type) === "movie"){
            object.watch_providers = clone(providers);
            object["watch/providers"] = clone(providers);
        }else{
            object._tmdb_watch_providers = clone(providers);
            object["watch/providers"] = clone(providers);
        }
    }

    function hydrate(type,titleId,watchRegion=region()){
        if(!watchRegion){ return null; }
        const entry = read(type,titleId,watchRegion);
        if(!entry){ return null; }
        const cleanId = id(titleId);
        if(media(type) === "tv"){
            if(global.DATA && global.DATA.shows && global.DATA.shows[cleanId]){
                apply("tv",global.DATA.shows[cleanId],entry.providers);
            }
            if(objectId(global.showDetailPreview) === cleanId){ apply("tv",global.showDetailPreview,entry.providers); }
            if(objectId(global.discoverPreviewShow) === cleanId){ apply("tv",global.discoverPreviewShow,entry.providers); }
        }else if(global.moviePageState && objectId(global.moviePageState.movie) === cleanId){
            apply("movie",global.moviePageState.movie,entry.providers);
        }
        return entry;
    }

    function rerender(type,titleId){
        const cleanId = id(titleId);
        if(media(type) === "tv"){
            if(global.activePage === "show-detail" && id(global.selectedShowId) === cleanId && typeof global.renderActiveShowDetailPage === "function"){
                global.renderActiveShowDetailPage();
            }
        }else if(
            global.activePage === "movie-detail" &&
            id(global.selectedMovieId || (global.moviePageState && global.moviePageState.movieId)) === cleanId &&
            typeof global.renderActiveMoviePage === "function"
        ){
            global.renderActiveMoviePage();
        }
    }

    function capture(type,titleId,watchRegion,details){
        const raw = details && (details["watch/providers"] || details.watch_providers || details._tmdb_watch_providers);
        if(!validProviders(raw)){ return null; }
        const providers = snapshot(raw,watchRegion);
        const entry = write(type,titleId,watchRegion,providers);
        if(entry){
            details["watch/providers"] = clone(providers);
            hydrate(type,titleId,watchRegion);
        }
        return entry;
    }

    async function refresh(type,titleId,options={}){
        const cleanType = media(type);
        const cleanId = id(titleId);
        const watchRegion = String(options.region || region()).toUpperCase();
        if(!cleanId || !watchRegion || watchRegion !== region() || typeof global.tmdbFetchJSON !== "function"){ return null; }
        const old = hydrate(cleanType,cleanId,watchRegion);
        if(!options.force && fresh(old)){ return old.providers; }

        const requestKey = key(cleanType,cleanId,watchRegion);
        if(inflight.has(requestKey)){ return inflight.get(requestKey); }

        const request = (async()=>{
            try{
                const payload = await global.tmdbFetchJSON(cleanType+"/"+encodeURIComponent(cleanId)+"/watch/providers");
                if(region() !== watchRegion){ return old && old.providers || null; }
                const entry = write(cleanType,cleanId,watchRegion,snapshot(payload,watchRegion));
                if(entry){
                    hydrate(cleanType,cleanId,watchRegion);
                    rerender(cleanType,cleanId);
                    return entry.providers;
                }
                return null;
            }catch(error){
                return old && old.providers || null;
            }finally{
                inflight.delete(requestKey);
            }
        })();
        inflight.set(requestKey,request);
        return request;
    }

    async function detailsWithoutProviders(type,titleId,options={}){
        const cleanType = media(type);
        return global.tmdbFetchJSON(
            cleanType+"/"+encodeURIComponent(id(titleId)),
            {append_to_response:NO_PROVIDER_APPEND[cleanType]},
            options
        );
    }

    function installDetailWrappers(){
        [["tv","tmdbGetShowDetails"],["movie","tmdbGetMovieDetails"]].forEach(([type,name])=>{
            const original = global[name];
            if(typeof original !== "function" || original.__providerFreshness){ return; }
            const wrapped = async function(titleId,options={}){
                const cleanId = id(titleId);
                const watchRegion = region();
                if(!cleanId || !watchRegion){ return original.apply(this,arguments); }

                const cached = hydrate(type,cleanId,watchRegion);
                if(fresh(cached)){
                    const details = await detailsWithoutProviders(type,cleanId,options);
                    details["watch/providers"] = clone(cached.providers);
                    return details;
                }

                const requestKey = key(type,cleanId,watchRegion);
                if(inflight.has(requestKey)){
                    const details = await detailsWithoutProviders(type,cleanId,options);
                    if(cached && cached.providers){
                        details["watch/providers"] = clone(cached.providers);
                    }
                    return details;
                }

                const details = await original.apply(this,arguments);
                if(!capture(type,cleanId,watchRegion,details)){
                    if(cached){ details["watch/providers"] = clone(cached.providers); }
                    refresh(type,cleanId,{region:watchRegion});
                }
                return details;
            };
            wrapped.__providerFreshness = true;
            if(original.__streamingRegionGuard){ wrapped.__streamingRegionGuard = true; }
            global[name] = wrapped;
        });
    }

    function handleOpen(type,titleId){
        const cleanId = id(titleId);
        const watchRegion = region();
        if(!cleanId || !watchRegion){ return; }
        const entry = hydrate(type,cleanId,watchRegion);
        if(entry){ rerender(type,cleanId); }
        if(!fresh(read(type,cleanId,watchRegion))){
            refresh(type,cleanId,{region:watchRegion});
        }
    }

    function installOpenWrappers(){
        [["tv","openShowDetailsPage"],["movie","openMoviePage"]].forEach(([type,name])=>{
            const original = global[name];
            if(typeof original !== "function" || original.__providerFreshness){ return; }
            const wrapped = async function(titleId){
                const result = await original.apply(this,arguments);
                handleOpen(type,titleId);
                return result;
            };
            wrapped.__providerFreshness = true;
            global[name] = wrapped;
        });
    }

    function prune(){
        const bucket = state();
        if(!bucket){ return false; }
        let changed = false;
        Object.keys(bucket).forEach(entryKey=>{
            const entry = bucket[entryKey];
            if(!entry || !tracked(entry.media,entry.id)){
                if(entry && entry.region && validProviders(entry.providers)){
                    localWrite(entry.media,entry.id,entry.region,entry);
                }
                delete bucket[entryKey];
                changed = true;
            }
        });
        if(changed){ scheduleSave(); }
        return changed;
    }

    const wait = ms=>new Promise(resolve=>global.setTimeout ? global.setTimeout(resolve,ms) : resolve());

    async function refreshTracked(){
        const watchRegion = region();
        if(!watchRegion || !global.DATA){ return []; }
        beginSaveBatch();
        try{
            prune();

            const tasks = [];
            const add = (type,items)=>Object.keys(items || {}).forEach(titleId=>{
                const entry = hydrate(type,titleId,watchRegion);
                if(!fresh(entry)){ tasks.push({type,id:id(titleId)}); }
            });
            add("tv",global.DATA.shows);
            add("movie",global.DATA.movies);

            let cursor = 0;
            const results = [];
            async function worker(){
                while(cursor < tasks.length && region() === watchRegion){
                    const task = tasks[cursor++];
                    results.push({media:task.type,id:task.id,providers:await refresh(task.type,task.id,{region:watchRegion})});
                    if(cursor < tasks.length){ await wait(STARTUP_DELAY); }
                }
            }
            await Promise.all(Array.from({length:Math.min(STARTUP_CONCURRENCY,tasks.length)},worker));
            return results;
        }finally{
            await endSaveBatch();
        }
    }

    function cleanupStreamingCopy(){
        if(!global.document || typeof global.document.getElementById !== "function"){ return false; }
        const section = global.document.getElementById("streaming-region-setting");
        if(!section || typeof section.querySelector !== "function"){ return false; }
        const header = section.querySelector(".settings-section-header p");
        const help = section.querySelector(".streaming-region-help");
        const input = global.document.getElementById("streaming-region-input");
        if(header && header.remove){ header.remove(); }
        if(help && help.remove){ help.remove(); }
        if(input && input.removeAttribute){ input.removeAttribute("aria-describedby"); }
        return !!(header || help);
    }

    function installSettingsCleanup(){
        const original = global.renderSettings;
        if(typeof original !== "function"){ cleanupStreamingCopy(); return; }
        const wrapped = function(){
            const result = original.apply(this,arguments);
            cleanupStreamingCopy();
            return result;
        };
        if(original.__streamingRegionGuard){ wrapped.__streamingRegionGuard = true; }
        wrapped.__providerCopyCleanup = true;
        global.renderSettings = wrapped;
        cleanupStreamingCopy();
    }

    function installRegionRefresh(){
        const original = global.saveProfileSettings;
        if(typeof original !== "function" || original.__providerFreshness){ return; }
        const wrapped = async function(){
            const before = region();
            const result = await original.apply(this,arguments);
            const after = region();
            if(before !== after && after){ refreshTracked(); }
            return result;
        };
        wrapped.__providerFreshness = true;
        global.saveProfileSettings = wrapped;
    }

    function start(){
        if(startupStarted){ return; }
        if(global.appDataReady === true && global.DATA){
            startupStarted = true;
            if(startupPoll && global.clearInterval){ global.clearInterval(startupPoll); }
            startupPoll = null;
            refreshTracked();
        }else if(!startupPoll && global.setInterval){
            startupPoll = global.setInterval(start,250);
        }
    }

    installDetailWrappers();
    installOpenWrappers();
    installRegionRefresh();
    installSettingsCleanup();
    start();

    global.TVTrackerProviderFreshness = Object.freeze({
        PROVIDER_TTL_MS:TTL,
        getStreamingRegion:region,
        entryIsFresh:fresh,
        providerSnapshot:snapshot,
        readProviderEntry:read,
        refreshProviderAvailability:refresh,
        refreshTrackedProviders:refreshTracked,
        hydrateProviderAvailability:hydrate,
        captureProviderPayload:capture,
        pruneTrackedState:prune,
        flushTrackedSave:flushSave,
        cleanupStreamingSettingsCopy:cleanupStreamingCopy,
        _inflight:inflight
    });
})(window);