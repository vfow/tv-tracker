(function(global){
    "use strict";

    const state = global.TVTrackerDuplicateShowIntegrity || {};
    if(state.scriptInstalled === true){
        global.TVTrackerDuplicateShowIntegrity = state;
        return;
    }

    const DEFAULT_READINESS_TIMEOUT_MS = 5000;
    const configuredReadinessTimeoutMs = Number(state.readinessTimeoutMs);
    const readinessTimeoutMs = (
        Number.isFinite(configuredReadinessTimeoutMs) &&
        configuredReadinessTimeoutMs >= 1 &&
        configuredReadinessTimeoutMs < DEFAULT_READINESS_TIMEOUT_MS
    ) ? configuredReadinessTimeoutMs : DEFAULT_READINESS_TIMEOUT_MS;
    state.readinessTimeoutMs = readinessTimeoutMs;

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

    function installDuplicateNormalization(){
        const cleanupDuplicateShows = global.cleanupDuplicateShows;
        if(typeof cleanupDuplicateShows !== "function"){
            return false;
        }

        if(cleanupDuplicateShows.__tvTrackerDuplicateShowIntegrityWrapped){
            state.cleanupWrapped = true;
            return true;
        }

        const wrappedCleanupDuplicateShows = function(data,summary=null){
            const groups = collectDuplicateProgress(data);
            const result = cleanupDuplicateShows.call(this,data,summary);
            restoreMergedProgress(data,groups);
            return result;
        };
        wrappedCleanupDuplicateShows.__tvTrackerDuplicateShowIntegrityWrapped = true;
        global.cleanupDuplicateShows = wrappedCleanupDuplicateShows;
        state.cleanupWrapped = true;
        return true;
    }

    function identitiesAreInstalled(){
        const integrity = state.dataIntegrity;
        return !!(
            integrity &&
            integrity === global.TVTrackerDataIntegrity &&
            integrity.installed === true &&
            global.getEpisodeIdentityKey === integrity.regularEpisodeIdentity &&
            global.getHistoryEntryEpisodeKey === integrity.historyEpisodeIdentity
        );
    }

    function resolveReadinessIfPossible(){
        if(state.readinessFailed || state.storedDataWrapped !== true || !identitiesAreInstalled()){
            return false;
        }
        if(!installDuplicateNormalization()){
            return false;
        }
        if(!global.cleanupDuplicateShows.__tvTrackerDuplicateShowIntegrityWrapped){
            return false;
        }

        state.ready = true;
        if(state.readinessTimeoutId !== null && typeof global.clearTimeout === "function"){
            global.clearTimeout(state.readinessTimeoutId);
            state.readinessTimeoutId = null;
        }
        if(typeof state.resolveReadiness === "function"){
            state.resolveReadiness();
            state.resolveReadiness = null;
            state.rejectReadiness = null;
        }
        return true;
    }

    function failReadiness(){
        if(state.ready || state.readinessFailed){
            return;
        }
        const error = new Error(
            "TV Tracker data integrity startup timed out after " + readinessTimeoutMs +
            "ms waiting for app cleanup, episode identities, and duplicate cleanup wrapping"
        );
        state.readinessFailed = true;
        state.readinessError = error;
        state.readinessTimeoutId = null;
        if(typeof state.rejectReadiness === "function"){
            state.rejectReadiness(error);
            state.resolveReadiness = null;
            state.rejectReadiness = null;
        }
    }

    function waitForReadiness(){
        if(resolveReadinessIfPossible()){
            return Promise.resolve();
        }
        if(state.readinessFailed){
            return Promise.reject(state.readinessError);
        }
        if(state.readinessPromise){
            return state.readinessPromise;
        }
        if(typeof global.setTimeout !== "function"){
            failReadiness();
            return Promise.reject(state.readinessError);
        }

        state.readinessPromise = new Promise((resolve,reject)=>{
            state.resolveReadiness = resolve;
            state.rejectReadiness = reject;
            state.readinessTimeoutId = global.setTimeout(
                failReadiness,
                readinessTimeoutMs
            );
        });
        return state.readinessPromise;
    }

    state.collectDuplicateProgress = collectDuplicateProgress;
    state.restoreMergedProgress = restoreMergedProgress;
    state.installDuplicateNormalization = installDuplicateNormalization;
    state.signalDataIntegrityReady = function(integrity){
        state.dataIntegrity = integrity;
        return resolveReadinessIfPossible();
    };
    state.waitForReadiness = waitForReadiness;
    state.ready = false;
    state.readinessFailed = false;
    state.readinessError = null;
    state.readinessTimeoutId = null;

    if(typeof global.getStoredData === "function" && !state.storedDataWrapped){
        const originalGetStoredData = global.getStoredData;
        global.getStoredData = async function(...args){
            const [data] = await Promise.all([
                originalGetStoredData.apply(this,args),
                waitForReadiness()
            ]);
            return data;
        };
        state.storedDataWrapped = true;
    }

    state.scriptInstalled = true;
    global.TVTrackerDuplicateShowIntegrity = state;
})(globalThis);
