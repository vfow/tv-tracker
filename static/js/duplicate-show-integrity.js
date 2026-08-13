(function(global){
    "use strict";

    const state = global.TVTrackerDuplicateShowIntegrity || {};

    function mergeDuplicateShowProgress(data){
        if(!data || !data.shows || typeof data.shows !== "object" || Array.isArray(data.shows)){
            return data;
        }

        const groups = new Map();

        Object.entries(data.shows).forEach(([key,show])=>{
            if(!show || typeof show !== "object"){
                return;
            }

            const id = String(show.tmdb_id || show.id || key || "").trim();
            if(!id){
                return;
            }

            if(!groups.has(id)){
                groups.set(id,[]);
            }
            groups.get(id).push(show);
        });

        groups.forEach(shows=>{
            if(shows.length < 2){
                return;
            }

            const merged = {};

            shows.forEach(show=>{
                const watched = show.episodes_watched && typeof show.episodes_watched === "object"
                ? show.episodes_watched
                : {};

                Object.entries(watched).forEach(([seasonKey,values])=>{
                    const season = Number(seasonKey);
                    if(!Number.isFinite(season) || !Array.isArray(values)){
                        return;
                    }

                    const key = String(season);
                    if(!merged[key]){
                        merged[key] = [];
                    }
                    merged[key].push(...values);
                });
            });

            shows.forEach(show=>{
                show.episodes_watched = Object.fromEntries(
                    Object.entries(merged).map(([seasonKey,values])=>[
                        seasonKey,
                        values.slice()
                    ])
                );
            });
        });

        return data;
    }

    state.mergeDuplicateShowProgress = mergeDuplicateShowProgress;

    if(typeof global.getStoredData === "function" && !state.storedDataWrapped){
        const originalGetStoredData = global.getStoredData;
        global.getStoredData = async function(...args){
            const data = await originalGetStoredData.apply(this,args);
            return mergeDuplicateShowProgress(data);
        };
        state.storedDataWrapped = true;
    }

    if(typeof global.cleanupDuplicateShows === "function" && !state.cleanupWrapped){
        const originalCleanupDuplicateShows = global.cleanupDuplicateShows;
        const wrappedCleanupDuplicateShows = function(data,summary=null){
            mergeDuplicateShowProgress(data);
            return originalCleanupDuplicateShows.call(this,data,summary);
        };
        wrappedCleanupDuplicateShows.__tvTrackerDuplicateShowIntegrityWrapped = true;
        global.cleanupDuplicateShows = wrappedCleanupDuplicateShows;
        state.cleanupWrapped = true;
    }

    global.TVTrackerDuplicateShowIntegrity = state;
})(globalThis);
