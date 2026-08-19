(function(global){
    "use strict";

    function signalDuplicateIntegrityReady(integrity){
        const duplicateIntegrity = global.TVTrackerDuplicateShowIntegrity;
        if(duplicateIntegrity && typeof duplicateIntegrity.signalDataIntegrityReady === "function"){
            duplicateIntegrity.signalDataIntegrityReady(integrity);
        }
    }

    if(global.TVTrackerDataIntegrity && global.TVTrackerDataIntegrity.installed === true){
        signalDuplicateIntegrityReady(global.TVTrackerDataIntegrity);
        return;
    }

    const FRONTEND_SCHEMA_VERSION = 5;

    function cleanString(value){
        return String(value === null || typeof value === "undefined" ? "" : value).trim();
    }

    function isMovieHistoryEntry(entry){
        if(!entry || typeof entry !== "object"){
            return false;
        }
        const mediaType = cleanString(entry.media_type || entry.type).toLowerCase();
        return mediaType === "movie" || !!cleanString(entry.movie_id);
    }

    function isSpecialHistoryEntry(entry){
        if(!entry || typeof entry !== "object" || isMovieHistoryEntry(entry)){
            return false;
        }
        return entry.special === true || Number(entry.season) === 0;
    }

    function regularEpisodeIdentity(showId,season,episode){
        const id = cleanString(showId);
        const seasonNumber = Number(season);
        const episodeNumber = Number(episode);
        if(!id || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)){
            return "";
        }
        return id + "::regular::" + String(seasonNumber) + "::" + String(episodeNumber);
    }

    function normalizeIdentityTitle(value){
        return cleanString(value)
        .toLowerCase()
        .replace(/&/g,"and")
        .replace(/[^a-z0-9]+/g,"-")
        .replace(/^-+|-+$/g,"");
    }

    function historyEpisodeIdentity(entry){
        if(!entry || typeof entry !== "object" || isMovieHistoryEntry(entry)){
            return "";
        }

        const showId = cleanString(entry.tmdb_id || entry.show_id);
        const season = Number(entry.season);
        const episode = Number(entry.episode);
        if(!showId || !Number.isFinite(season) || !Number.isFinite(episode)){
            return "";
        }

        if(isSpecialHistoryEntry(entry)){
            const sourceEpisodeId = cleanString(entry.source_tvdb_episode_id);
            if(sourceEpisodeId){
                return showId + "::special::tvdb::" + sourceEpisodeId;
            }
            return (
                showId + "::special::" + String(season) + "::" + String(episode) + "::" +
                normalizeIdentityTitle(entry.episode_title || entry.title || "special")
            );
        }

        return regularEpisodeIdentity(showId,season,episode);
    }

    function summarizeHistory(history){
        const entries = Array.isArray(history) ? history : [];
        let regularHistoryEntries = 0;
        let specialHistoryEntries = 0;
        let movieHistoryEntries = 0;
        let otherHistoryEntries = 0;

        entries.forEach(entry=>{
            if(isMovieHistoryEntry(entry)){
                movieHistoryEntries += 1;
                return;
            }
            if(isSpecialHistoryEntry(entry)){
                specialHistoryEntries += 1;
                return;
            }
            if(
                entry &&
                typeof entry === "object" &&
                cleanString(entry.tmdb_id || entry.show_id) &&
                Number.isFinite(Number(entry.season)) &&
                Number.isFinite(Number(entry.episode))
            ){
                regularHistoryEntries += 1;
                return;
            }
            otherHistoryEntries += 1;
        });

        return {
            historyEntries:entries.length,
            regularHistoryEntries,
            specialHistoryEntries,
            movieHistoryEntries,
            otherHistoryEntries
        };
    }

    function titleHint(value){
        const raw = cleanString(value);
        const yearMatch = raw.match(/\(((?:19|20)\d{2})\)\s*$/);
        const year = yearMatch ? yearMatch[1] : "";
        const title = raw.replace(/\s*\((?:19|20)\d{2}\)\s*$/,"").replace(/\s+/g," ").trim();
        return {title,year};
    }

    function comparableTitle(value){
        if(typeof global.normalizeComparableTitle === "function"){
            return global.normalizeComparableTitle(value);
        }
        return cleanString(value)
        .toLowerCase()
        .replace(/&/g,"and")
        .replace(/[^a-z0-9]+/g," ")
        .replace(/\s+/g," ")
        .trim();
    }

    function selectStrictTMDBCandidate(results,requestedTitle){
        const hint = titleHint(requestedTitle);
        const target = comparableTitle(hint.title);
        if(!target){
            return null;
        }

        const byId = new Map();
        (Array.isArray(results) ? results : []).forEach(item=>{
            if(!item || !item.id){
                return;
            }
            const nameMatches = [item.name,item.original_name]
            .filter(Boolean)
            .some(name=>comparableTitle(name) === target);
            if(!nameMatches){
                return;
            }
            if(hint.year){
                const itemYear = cleanString(item.first_air_date).slice(0,4);
                if(itemYear !== hint.year){
                    return;
                }
            }
            byId.set(String(item.id),item);
        });

        return byId.size === 1 ? Array.from(byId.values())[0] : null;
    }

    function scanCompatibleWatchedEpisodes(compatibleShow){
        const regular = new Map();
        const specials = [];
        const seasons = compatibleShow && Array.isArray(compatibleShow.seasons)
        ? compatibleShow.seasons
        : [];

        seasons.forEach(season=>{
            if(!season || typeof season !== "object"){
                return;
            }
            const seasonNumber = Number(season.number);
            if(!Number.isFinite(seasonNumber)){
                return;
            }
            const seasonIsSpecial = season.is_specials === true || seasonNumber === 0;
            const episodes = Array.isArray(season.episodes) ? season.episodes : [];

            episodes.forEach((episode,index)=>{
                if(!episode || typeof episode !== "object"){
                    return;
                }
                const episodeNumber = Number(episode.number || index + 1);
                if(!Number.isFinite(episodeNumber) || episodeNumber < 1){
                    return;
                }
                const watched = episode.is_watched === true || Number(episode.watched_count || 0) > 0;
                if(!watched){
                    return;
                }
                const special = seasonIsSpecial || episode.special === true;
                const sourceEpisodeId = episode.id && episode.id.tvdb ? cleanString(episode.id.tvdb) : "";
                const watchedAt = episode.watched_at ? cleanString(episode.watched_at) : "";
                const metadata = {
                    watched_at:watchedAt || null,
                    special,
                    name:cleanString(episode.name || ("Episode " + episodeNumber)),
                    source_tvdb_episode_id:sourceEpisodeId || null,
                    source_season:seasonNumber,
                    source_episode:episodeNumber
                };
                const coordinate = String(seasonNumber) + "-" + String(episodeNumber);
                if(special){
                    specials.push({coordinate,metadata});
                }else{
                    regular.set(coordinate,metadata);
                }
            });
        });

        return {regular,specials};
    }

    function removeSpecialOnlyProgress(show,scan){
        if(!show || !scan){
            return;
        }
        if(!show.episodes_watched || typeof show.episodes_watched !== "object"){
            show.episodes_watched = {};
        }

        const specialCoordinates = new Set(scan.specials.map(item=>item.coordinate));
        specialCoordinates.forEach(coordinate=>{
            if(scan.regular.has(coordinate)){
                return;
            }
            const parts = coordinate.split("-").map(Number);
            const season = parts[0];
            const episode = parts[1];
            const key = String(season);
            const watched = Array.isArray(show.episodes_watched[key]) ? show.episodes_watched[key] : [];
            const filtered = watched.filter(value=>Number(value) !== episode);
            if(filtered.length){
                show.episodes_watched[key] = filtered;
            }else{
                delete show.episodes_watched[key];
            }
        });

        if(!show._imported_progress || typeof show._imported_progress !== "object"){
            return;
        }

        const regularProgress = {};
        scan.regular.forEach((metadata,key)=>{
            regularProgress[key] = metadata;
        });
        const specialProgress = {};
        scan.specials.forEach((item,index)=>{
            const sourceId = cleanString(item.metadata.source_tvdb_episode_id);
            const key = sourceId
            ? "tvdb-" + sourceId
            : "source-" + item.coordinate + "-" + String(index);
            specialProgress[key] = Object.assign({watched:true},item.metadata);
        });
        show._imported_progress.watched = regularProgress;
        show._imported_progress.specials = specialProgress;
    }

    function remapQueueIds(sync,oldId,newId){
        if(!sync || typeof sync !== "object"){
            return;
        }
        if(Array.isArray(sync.pending)){
            sync.pending = sync.pending.map(value=>String(value) === oldId ? newId : value);
        }
        if(Array.isArray(sync.failed)){
            sync.failed = sync.failed.map(item=>{
                if(typeof item === "string"){
                    return item === oldId ? newId : item;
                }
                if(item && typeof item === "object" && String(item.showId || item.id || "") === oldId){
                    const copy = Object.assign({},item);
                    if(Object.prototype.hasOwnProperty.call(copy,"showId")) copy.showId = newId;
                    if(Object.prototype.hasOwnProperty.call(copy,"id")) copy.id = newId;
                    return copy;
                }
                return item;
            });
        }
    }

    function suspiciousHistoryReferences(data){
        const source = data && typeof data === "object" ? data : {};
        const shows = source.shows && typeof source.shows === "object" ? source.shows : {};
        const history = Array.isArray(source.history) ? source.history : [];
        const suspicious = [];

        history.forEach(entry=>{
            if(!entry || typeof entry !== "object" || isMovieHistoryEntry(entry) || isSpecialHistoryEntry(entry)){
                return;
            }
            const show = shows[String(entry.tmdb_id || entry.show_id || "")];
            if(!show){
                suspicious.push({id:cleanString(entry.id),reason:"missing_show"});
                return;
            }
            const season = Number(entry.season);
            const episode = Number(entry.episode);
            const knownSeasons = Number(show.number_of_seasons || 0);
            if(knownSeasons > 0 && season > knownSeasons){
                suspicious.push({id:cleanString(entry.id),reason:"season_out_of_range"});
                return;
            }
            const seasonCount = show._season_episodes && Number(show._season_episodes[String(season)] || 0);
            if(seasonCount > 0 && episode > seasonCount){
                suspicious.push({id:cleanString(entry.id),reason:"episode_out_of_range"});
            }
        });

        return suspicious;
    }

    // Install canonical episode identities before startup normalization is released
    // by tracker-integrity.js. Specials and regular episodes may share source
    // coordinates; they must never dedupe each other.
    global.getEpisodeIdentityKey = regularEpisodeIdentity;
    global.getHistoryEntryEpisodeKey = historyEpisodeIdentity;

    if(typeof global.getBackupSummary === "function"){
        global.getBackupSummary = function(){
            if(typeof global.ensureProfileData === "function"){
                global.ensureProfileData();
            }
            const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
            const profile = data.profile && typeof data.profile === "object" ? data.profile : {};
            const counts = summarizeHistory(data.history);
            return Object.assign({
                shows:Object.keys(data.shows || {}).length,
                favorites:Array.isArray(profile.favorite_shows) ? profile.favorite_shows.length : 0,
                favoriteMovies:Array.isArray(profile.favorite_movies) ? profile.favorite_movies.length : 0
            },counts);
        };
    }

    if(typeof global.getNativeBackupObject === "function"){
        const originalGetNativeBackupObject = global.getNativeBackupObject;
        global.getNativeBackupObject = function(...args){
            const backup = originalGetNativeBackupObject.apply(this,args);
            if(backup && typeof backup === "object"){
                backup.schemaVersion = FRONTEND_SCHEMA_VERSION;
                if(typeof global.getBackupSummary === "function"){
                    backup.summary = global.getBackupSummary();
                }
            }
            return backup;
        };
    }

    if(typeof global.commitTrackerDataTransactionally === "function"){
        const originalCommitTrackerDataTransactionally = global.commitTrackerDataTransactionally;
        global.commitTrackerDataTransactionally = function(data,backupTemplate=null){
            let template = backupTemplate;
            if(!template || typeof template !== "object"){
                template = {
                    app:"TV Tracker",
                    backupType:"native-app-backup",
                    backupVersion:2,
                    schemaVersion:FRONTEND_SCHEMA_VERSION,
                    exportedAt:new Date().toISOString(),
                    summary:null,
                    data:null
                };
            }
            return originalCommitTrackerDataTransactionally.call(this,data,template);
        };
    }

    if(typeof global.validateNativeBackupObject === "function"){
        const originalValidateNativeBackupObject = global.validateNativeBackupObject;
        global.validateNativeBackupObject = function(backup){
            const schemaVersion = Number(backup && backup.schemaVersion || 1);
            if(schemaVersion !== FRONTEND_SCHEMA_VERSION){
                return originalValidateNativeBackupObject.call(this,backup);
            }
            const compatibilityCopy = JSON.parse(JSON.stringify(backup || {}));
            compatibilityCopy.schemaVersion = FRONTEND_SCHEMA_VERSION - 1;
            const result = originalValidateNativeBackupObject.call(this,compatibilityCopy);
            if(result && result.valid === true && result.summary){
                result.summary.schemaVersion = FRONTEND_SCHEMA_VERSION;
            }
            return result;
        };
    }

    if(typeof global.findTMDBTVDetailsByTitle === "function"){
        global.findTMDBTVDetailsByTitle = async function(requestedTitle){
            const hint = titleHint(requestedTitle);
            if(!hint.title || hint.title.length < 2 || typeof global.tmdbSearchShows !== "function"){
                return null;
            }
            try{
                const results = await global.tmdbSearchShows(hint.title);
                const selected = selectStrictTMDBCandidate(results,requestedTitle);
                if(!selected || !selected.id || typeof global.tmdbGetShowDetails !== "function"){
                    return null;
                }
                return await global.tmdbGetShowDetails(selected.id);
            }catch(error){
                return null;
            }
        };
    }

    if(typeof global.moveShowStorageKey === "function"){
        const originalMoveShowStorageKey = global.moveShowStorageKey;
        global.moveShowStorageKey = function(oldId,newId,show){
            const oldKey = cleanString(oldId);
            const newKey = cleanString(newId);
            const result = originalMoveShowStorageKey.call(this,oldKey,newKey,show);
            const data = global.DATA && typeof global.DATA === "object" ? global.DATA : null;
            if(!data || !oldKey || !newKey || oldKey === newKey || !data.shows || data.shows[newKey] !== show){
                return result;
            }

            if(Array.isArray(data.history)){
                data.history.forEach(entry=>{
                    if(!entry || typeof entry !== "object"){
                        return;
                    }
                    if(String(entry.tmdb_id || "") === oldKey){
                        entry.tmdb_id = newKey;
                    }
                    if(String(entry.show_id || "") === oldKey){
                        entry.show_id = newKey;
                    }
                });
            }
            if(data.profile && Array.isArray(data.profile.favorite_shows)){
                data.profile.favorite_shows = data.profile.favorite_shows.map(value=>String(value) === oldKey ? newKey : value);
            }
            remapQueueIds(data.metadata_sync,oldKey,newKey);
            remapQueueIds(data.network_sync,oldKey,newKey);
            return result;
        };
    }

    if(typeof global.importCompatibleEpisodesIntoShow === "function"){
        const originalImportCompatibleEpisodesIntoShow = global.importCompatibleEpisodesIntoShow;
        global.importCompatibleEpisodesIntoShow = function(show,compatibleShow,targetData){
            const result = originalImportCompatibleEpisodesIntoShow.call(this,show,compatibleShow,targetData);
            removeSpecialOnlyProgress(show,scanCompatibleWatchedEpisodes(compatibleShow));
            return result;
        };
    }

    if(typeof global.reapplyImportedWatchedProgress === "function"){
        global.reapplyImportedWatchedProgress = function(show){
            if(!show || !show._imported_progress || !show._imported_progress.watched){
                return;
            }
            Object.entries(show._imported_progress.watched).forEach(([key,metadata])=>{
                if(metadata && metadata.special === true){
                    return;
                }
                const parts = String(key).split("-").map(Number);
                const season = parts[0];
                const episode = parts[1];
                if(!Number.isFinite(season) || season < 1 || !Number.isFinite(episode) || episode < 1){
                    return;
                }
                const seasonKey = String(season);
                if(!show.episodes_watched || typeof show.episodes_watched !== "object"){
                    show.episodes_watched = {};
                }
                if(!Array.isArray(show.episodes_watched[seasonKey])){
                    show.episodes_watched[seasonKey] = [];
                }
                if(!show.episodes_watched[seasonKey].includes(episode)){
                    show.episodes_watched[seasonKey].push(episode);
                }
                show.episodes_watched[seasonKey].sort((a,b)=>a-b);
            });
        };
    }

    if(typeof global.getHistoryIdsForSeason === "function"){
        global.getHistoryIdsForSeason = function(showId,seasonNumber){
            const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
            return (Array.isArray(data.history) ? data.history : [])
            .filter(entry=>{
                return (
                    entry &&
                    !isSpecialHistoryEntry(entry) &&
                    !isMovieHistoryEntry(entry) &&
                    String(entry.tmdb_id) === String(showId) &&
                    Number(entry.season) === Number(seasonNumber)
                );
            })
            .map(entry=>cleanString(entry.id))
            .filter(Boolean);
        };
    }

    if(typeof global.markSeasonWatched === "function"){
        const originalMarkSeasonWatched = global.markSeasonWatched;
        global.markSeasonWatched = async function(showId,seasonNumber){
            const id = String(showId);
            const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
            const show = data.shows && data.shows[id];
            if(!show || typeof global.getAiredEpisodeNumbersInSeason !== "function" || typeof global.isSeasonFullyWatched !== "function"){
                return originalMarkSeasonWatched.apply(this,arguments);
            }

            if(typeof global.ensureSeasonLoaded === "function"){
                await global.ensureSeasonLoaded(show,seasonNumber,false,{skipSave:true});
            }
            const aired = global.getAiredEpisodeNumbersInSeason(show,seasonNumber);
            if(!global.isSeasonFullyWatched(show,seasonNumber,aired)){
                return originalMarkSeasonWatched.apply(this,arguments);
            }

            const confirmed = typeof global.showAppConfirm === "function"
            ? await global.showAppConfirm({
                title:"Mark Season Unwatched",
                message:"Mark every watched regular episode in Season " + seasonNumber + " as unwatched? Imported specials are preserved.",
                confirmLabel:"Mark Unwatched",
                cancelLabel:"Cancel",
                danger:true
            })
            : false;
            if(!confirmed){
                return;
            }

            const deletedHistoryIds = typeof global.getHistoryIdsForSeason === "function"
            ? global.getHistoryIdsForSeason(id,seasonNumber)
            : [];
            if(show.episodes_watched && typeof show.episodes_watched === "object"){
                delete show.episodes_watched[String(seasonNumber)];
            }
            data.history = (Array.isArray(data.history) ? data.history : []).filter(entry=>{
                if(!entry || isSpecialHistoryEntry(entry) || isMovieHistoryEntry(entry)){
                    return true;
                }
                return !(
                    String(entry.tmdb_id) === id &&
                    Number(entry.season) === Number(seasonNumber)
                );
            });
            if(typeof global.updateShowLastWatchedFromHistory === "function") global.updateShowLastWatchedFromHistory(show);
            if(typeof global.reopenCompletedShowAfterUnwatch === "function") global.reopenCompletedShowAfterUnwatch(show,seasonNumber);
            if(typeof global.refreshAfterLocalShowChange === "function") global.refreshAfterLocalShowChange(id,true);
            if(typeof global.showToast === "function") global.showToast("Marked Season " + seasonNumber + " as unwatched");
            if(typeof global.waitForNextPaint === "function") await global.waitForNextPaint();
            if(typeof global.saveShowMutation === "function") await global.saveShowMutation(id,[],deletedHistoryIds);
        };
    }

    global.TVTrackerDataIntegrity = Object.freeze({
        installed:true,
        frontendSchemaVersion:FRONTEND_SCHEMA_VERSION,
        isMovieHistoryEntry,
        isSpecialHistoryEntry,
        regularEpisodeIdentity,
        historyEpisodeIdentity,
        summarizeHistory,
        titleHint,
        selectStrictTMDBCandidate,
        scanCompatibleWatchedEpisodes,
        suspiciousHistoryReferences
    });
    signalDuplicateIntegrityReady(global.TVTrackerDataIntegrity);
})(globalThis);
