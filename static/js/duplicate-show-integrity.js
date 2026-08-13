(function(global){
    "use strict";

    const state = global.TVTrackerDuplicateShowIntegrity || {};
    state.loadCount = Number(state.loadCount || 0) + 1;

    if(!state.cleanupReadyPromise){
        state.cleanupReadyPromise = new Promise(resolve=>{
            state.resolveCleanupReady = resolve;
        });
    }

    function collectDuplicateProgress(data){
        const groups = new Map();

        if(!data || !data.shows || typeof data.shows !== "object" || Array.isArray(data.shows)){
            return groups;
        }

        Object.entries(data.shows).forEach(([key,show])=>{
            if(!show || typeof show !== "object"){
                return;
            }

            const id = String(show.tmdb_id || show.id || key || "").trim();
            if(!id){
                return;
            }

            if(!groups.has(id)){
                groups.set(id,{count:0,progress:{}});
            }

            const group = groups.get(id);
            group.count += 1;
            const watched = show.episodes_watched && typeof show.episodes_watched === "object"
            ? show.episodes_watched
            : {};

            Object.entries(watched).forEach(([seasonKey,values])=>{
                const season = Number(seasonKey);
                if(!Number.isFinite(season) || !Array.isArray(values)){
                    return;
                }

                const canonicalSeason = String(season);
                if(!group.progress[canonicalSeason]){
                    group.progress[canonicalSeason] = [];
                }
                group.progress[canonicalSeason].push(...values);
            });
        });

        return groups;
    }

    function restoreMergedProgress(data,groups){
        if(!data || !data.shows || typeof data.shows !== "object"){
            return data;
        }

        groups.forEach((group,id)=>{
            if(group.count < 2){
                return;
            }

            const preferred = data.shows[id];
            if(!preferred || typeof preferred !== "object"){
                return;
            }

            preferred.episodes_watched = Object.fromEntries(
                Object.entries(group.progress).map(([seasonKey,values])=>[
                    seasonKey,
                    values.slice()
                ])
            );
        });

        return data;
    }

    state.collectDuplicateProgress = collectDuplicateProgress;
    state.restoreMergedProgress = restoreMergedProgress;

    if(typeof global.getStoredData === "function" && !state.storedDataWrapped){
        const originalGetStoredData = global.getStoredData;
        global.getStoredData = async function(...args){
            const data = await originalGetStoredData.apply(this,args);
            await state.cleanupReadyPromise;
            return data;
        };
        state.storedDataWrapped = true;
    }

    if(typeof global.cleanupDuplicateShows === "function" && !state.cleanupWrapped){
        const originalCleanupDuplicateShows = global.cleanupDuplicateShows;
        const wrappedCleanupDuplicateShows = function(data,summary=null){
            const groups = collectDuplicateProgress(data);
            const result = originalCleanupDuplicateShows.call(this,data,summary);
            restoreMergedProgress(data,groups);
            return result;
        };
        wrappedCleanupDuplicateShows.__tvTrackerDuplicateShowIntegrityWrapped = true;
        global.cleanupDuplicateShows = wrappedCleanupDuplicateShows;
        state.cleanupWrapped = true;
    }

    if(state.loadCount >= 2 && typeof state.resolveCleanupReady === "function"){
        state.resolveCleanupReady();
        state.resolveCleanupReady = null;
    }

    global.TVTrackerDuplicateShowIntegrity = state;
})(globalThis);
