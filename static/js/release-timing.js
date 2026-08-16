(function(root,factory){
    const api = factory(root);
    if(typeof module !== "undefined" && module.exports){ module.exports = api; }
    root.TVTrackerReleaseTiming = api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(root){
    "use strict";

    const cache = new Map();
    let status = {timezone:"UTC",timezoneMode:"automatic",capability:{}};
    let initialized = false;
    let boundaryTimer = null;
    let refreshCallback = null;
    let prefetchBusy = false;
    let lastPrefetchShows = null;

    function key(showId,season,episode){
        const show = Number(showId); const s = Number(season); const e = Number(episode);
        return Number.isFinite(show) && Number.isFinite(s) && Number.isFinite(e) && show > 0 && s > 0 && e > 0
            ? `${show}:${s}:${e}` : "";
    }

    function detectedTimezone(){
        try{ return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim(); }
        catch(error){ return ""; }
    }

    function csrfToken(){
        if(typeof document === "undefined"){ return ""; }
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    async function requestJSON(path,options={}){
        const method = String(options.method || "GET").toUpperCase();
        const headers = Object.assign({"Accept":"application/json"},options.headers || {});
        if(method !== "GET" && method !== "HEAD"){ headers["X-CSRF-Token"] = csrfToken(); }
        let body = options.body;
        if(body && typeof body !== "string"){
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(body);
        }
        const response = await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers,body});
        let payload = {};
        try{ payload = await response.json(); }catch(error){ payload = {}; }
        if(!response.ok){ throw new Error(payload.error || "Release timing request failed"); }
        return payload;
    }

    function fallbackDate(dateString){
        if(root.TVTrackerAuditUtils && typeof root.TVTrackerAuditUtils.makeDateOnlyEpisodeReleaseDate === "function"){
            return root.TVTrackerAuditUtils.makeDateOnlyEpisodeReleaseDate(dateString);
        }
        return null;
    }

    function episodeIdentity(episodeInfo,showInfo){
        if(!episodeInfo || !showInfo){ return ""; }
        return key(
            showInfo.tmdb_id || showInfo.id,
            episodeInfo.season_number !== undefined ? episodeInfo.season_number : episodeInfo.season,
            episodeInfo.episode_number !== undefined ? episodeInfo.episode_number : episodeInfo.episode
        );
    }

    function getCached(episodeInfo,showInfo){
        const identity = episodeIdentity(episodeInfo,showInfo);
        return identity ? (cache.get(identity) || null) : null;
    }

    function timingMatchesTMDBDate(item,airDateString){
        const tmdbDay = dayNumber(String(airDateString || ""));
        const providerDay = dayNumber(String(item && item.releaseDate || ""));
        if(tmdbDay === null || providerDay === null){ return true; }
        return Math.abs(providerDay - tmdbDay) <= 1;
    }

    function getReleaseInfo(airDateString,episodeInfo=null,showInfo=null){
        const item = getCached(episodeInfo,showInfo);
        if(item && timingMatchesTMDBDate(item,airDateString)){
            const raw = item.precision === "exact" ? item.releaseAt : item.eligibleAt;
            const parsed = raw ? new Date(raw) : null;
            if(parsed && Number.isFinite(parsed.getTime())){
                return {
                    date:parsed,
                    hasTime:item.precision === "exact",
                    precision:item.precision,
                    releaseDate:item.releaseDate || "",
                    displayDate:item.displayDate || item.releaseDate || "",
                    source:"canonical"
                };
            }
        }
        const fallback = fallbackDate(String(airDateString || ""));
        return fallback ? {date:fallback,hasTime:false,precision:"date",releaseDate:String(airDateString || ""),displayDate:String(airDateString || ""),source:"fallback"} : null;
    }

    function calendarDate(airDateString,episodeInfo=null,showInfo=null){
        const item = getCached(episodeInfo,showInfo);
        if(item && timingMatchesTMDBDate(item,airDateString) && item.displayDate){ return String(item.displayDate); }
        return String(airDateString || "");
    }

    function datePartsInZone(value,timezoneName){
        const date = value instanceof Date ? value : new Date(value);
        if(!Number.isFinite(date.getTime())){ return null; }
        try{
            const parts = new Intl.DateTimeFormat("en-CA",{timeZone:timezoneName,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
            const values = {};
            parts.forEach(part=>{ if(part.type !== "literal"){ values[part.type] = part.value; } });
            return `${values.year}-${values.month}-${values.day}`;
        }catch(error){ return null; }
    }

    function dayNumber(dateString){
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ""));
        if(!match){ return null; }
        return Math.floor(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])) / 86400000);
    }

    function getDayDiff(airDateString,episodeInfo=null,showInfo=null,now=new Date()){
        const episodeDate = calendarDate(airDateString,episodeInfo,showInfo);
        const today = datePartsInZone(now,status.timezone || detectedTimezone() || "UTC");
        const episodeDay = dayNumber(episodeDate); const todayDay = dayNumber(today);
        if(episodeDay === null || todayDay === null){ return null; }
        return todayDay - episodeDay;
    }

    function collectEpisodes(shows){
        const output = []; const seen = new Set();
        const today = new Date(); today.setHours(0,0,0,0);
        const minTime = today.getTime() - (14 * 86400000);
        const maxTime = today.getTime() + (366 * 86400000);
        Object.values(shows || {}).forEach(show=>{
            const showId = Number(show && (show.tmdb_id || show.id));
            if(!showId){ return; }
            function add(raw,seasonHint){
                if(!raw || typeof raw !== "object"){ return; }
                const season = Number(raw.season_number !== undefined ? raw.season_number : seasonHint);
                const episode = Number(raw.episode_number !== undefined ? raw.episode_number : raw.episode);
                const identity = key(showId,season,episode);
                if(!identity || seen.has(identity)){ return; }
                const airDate = String(raw.air_date || "");
                const day = Date.parse(airDate + "T00:00:00Z");
                if(!airDate || !Number.isFinite(day) || day < minTime || day > maxTime){ return; }
                seen.add(identity);
                output.push({tmdbId:showId,season,episode,airDate});
            }
            const lists = show._episode_list && typeof show._episode_list === "object" ? show._episode_list : {};
            Object.keys(lists).forEach(season=>{
                const entries = Array.isArray(lists[season]) ? lists[season] : [];
                entries.forEach(item=>add(item,Number(season)));
            });
            add(show.next_episode_to_air,null);
            add(show.last_episode_to_air,null);
        });
        return output;
    }

    function scheduleBoundary(){
        if(boundaryTimer){ clearTimeout(boundaryTimer); boundaryTimer = null; }
        const now = Date.now(); let next = Infinity;
        cache.forEach(item=>{
            const raw = item.precision === "exact" ? item.releaseAt : item.eligibleAt;
            const value = Date.parse(raw || "");
            if(Number.isFinite(value) && value > now){ next = Math.min(next,value); }
        });
        if(!Number.isFinite(next)){ return; }
        const delay = Math.max(50,Math.min(next - now + 100,2147480000));
        boundaryTimer = setTimeout(()=>{
            boundaryTimer = null;
            if(typeof refreshCallback === "function"){ refreshCallback("boundary"); }
            scheduleBoundary();
        },delay);
    }

    async function syncAutomaticTimezone(){
        if(String(status.timezoneMode || "automatic") !== "automatic"){ return false; }
        const detected = detectedTimezone();
        if(!detected || detected === status.timezone){ return false; }
        try{
            const payload = await requestJSON("/api/notifications/settings",{method:"PATCH",body:{timezoneMode:"automatic",timezone:detected}});
            const settings = payload.settings || {};
            status.timezone = String(settings.timezone || detected);
            status.timezoneMode = String(settings.timezoneMode || "automatic");
            cache.clear();
            if(lastPrefetchShows){ await prefetchShows(lastPrefetchShows); }
            if(typeof refreshCallback === "function"){ refreshCallback("timezone"); }
            return true;
        }catch(error){ return false; }
    }


    async function prefetchShows(shows){
        lastPrefetchShows = shows || lastPrefetchShows;
        if(prefetchBusy || !lastPrefetchShows){ return; }
        prefetchBusy = true;
        let cacheUpdated = false;
        try{
            await syncAutomaticTimezone();
            const episodes = collectEpisodes(lastPrefetchShows);
            for(let offset=0; offset<episodes.length; offset+=100){
                const payload = await requestJSON("/api/release-timing/batch",{method:"POST",body:{episodes:episodes.slice(offset,offset+100)}});
                status.timezone = String(payload.timezone || status.timezone || "UTC");
                status.timezoneMode = String(payload.timezoneMode || status.timezoneMode || "automatic");
                Object.entries(payload.results || {}).forEach(([identity,item])=>{
                    cache.set(identity,item);
                    cacheUpdated = true;
                });
            }
            scheduleBoundary();
            if(cacheUpdated && typeof refreshCallback === "function"){
                refreshCallback("timing");
            }
        }catch(error){
            // Optional enrichment failures intentionally preserve core fallback.
        }finally{ prefetchBusy = false; }
    }


    async function initialize(options={}){
        if(typeof options.onRefresh === "function"){ refreshCallback = options.onRefresh; }
        try{
            const payload = await requestJSON("/api/release-timing/status");
            status = Object.assign(status,payload || {});
            if(!status.capability || status.capability.enabled !== true){ cache.clear(); }
        }catch(error){ /* core fallback remains available */ }
        initialized = true;
        await syncAutomaticTimezone();
        if(typeof document !== "undefined"){
            document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ syncAutomaticTimezone(); } });
            root.addEventListener && root.addEventListener("focus",()=>syncAutomaticTimezone());
        }
        return status;
    }

    return {
        initialize,prefetchShows,getReleaseInfo,calendarDate,getDayDiff,syncAutomaticTimezone,
        getStatus:()=>Object.assign({},status),
        isInitialized:()=>initialized,
        _cache:cache,
        _collectEpisodes:collectEpisodes,
        _key:key
    };
});
