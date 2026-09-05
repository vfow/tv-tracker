(function(global){
    "use strict";

    const legacyShowToast = typeof global.showToast === "function" ? global.showToast : null;
    const BACKGROUND_SAVE_MESSAGES = Object.freeze([
        /^Could not save changes\. Try again\.?$/i,
        /^Could not save changes\. Try again shortly\.?$/i,
        /^Could not save changes\. Check your connection\.?$/i,
        /^Updated from another tab or device\.?$/i
    ]);

    function isBackgroundSaveMessage(message){
        const text = String(message || "").trim();
        return !!text && BACKGROUND_SAVE_MESSAGES.some(pattern=>pattern.test(text));
    }

    function notify(message,options={}){
        if(!legacyShowToast){ return null; }
        return legacyShowToast(message,options);
    }

    if(legacyShowToast){
        global.showToast = function(message,options={}){
            if(isBackgroundSaveMessage(message)){
                return null;
            }
            return legacyShowToast(message,options);
        };
    }

    function waitForPaint(){
        return typeof global.waitForNextPaint === "function"
            ? global.waitForNextPaint()
            : Promise.resolve();
    }

    function renderMovieSurface(){
        if(typeof global.renderActiveMoviePage === "function"){
            global.renderActiveMoviePage();
        }else if(typeof global.renderAll === "function"){
            global.renderAll();
        }
    }

    async function saveUserMutation(saveOperation,failureMessage){
        try{
            const saved = await saveOperation();
            if(saved === false){
                notify(failureMessage,{severity:"error"});
                return false;
            }
            return true;
        }catch(error){
            if(global.console && typeof global.console.error === "function"){
                global.console.error("[TV Tracker] user mutation save failed");
            }
            notify(failureMessage,{severity:"error"});
            return false;
        }
    }

    if(typeof global.setMovieFavoriteState === "function"){
        global.setMovieFavoriteState = async function(movie,shouldFavorite,options={}){
            if(typeof global.ensureProfileData === "function"){
                global.ensureProfileData();
            }
            if(typeof global.ensureMovieTrackingData === "function"){
                global.ensureMovieTrackingData();
            }

            const record = typeof global.normalizeFavoriteMovieRecord === "function"
                ? global.normalizeFavoriteMovieRecord(movie)
                : null;
            if(!record){
                return {success:false,changed:false};
            }

            const id = record.id;
            const favorite = shouldFavorite === true;
            const alreadyFavorite = typeof global.isMovieFavorite === "function"
                ? global.isMovieFavorite(id)
                : false;
            const favorites = global.DATA && global.DATA.profile && Array.isArray(global.DATA.profile.favorite_movies)
                ? global.DATA.profile.favorite_movies
                : [];

            if(favorite && !alreadyFavorite && favorites.length >= 8){
                notify("You can only choose 8 favorite movies");
                return {success:false,changed:false,limit:true};
            }

            if(favorite){
                if(!alreadyFavorite){
                    global.DATA.profile.favorite_movies.push(record);
                }else{
                    global.DATA.profile.favorite_movies = global.DATA.profile.favorite_movies.map(item=>{
                        return String(item && (item.id || item.tmdb_id)) === id ? record : item;
                    });
                }
                if(typeof global.upsertMovieTrackingRecord === "function"){
                    global.upsertMovieTrackingRecord(record,{favorite:true,updated_at:new Date().toISOString()});
                }
            }else{
                global.DATA.profile.favorite_movies = global.DATA.profile.favorite_movies.filter(item=>{
                    return String(item && (item.id || item.tmdb_id)) !== id;
                });
                const tracked = typeof global.getMovieTrackingRecord === "function"
                    ? global.getMovieTrackingRecord(id)
                    : null;
                if(tracked && typeof global.upsertMovieTrackingRecord === "function"){
                    global.upsertMovieTrackingRecord(tracked,{favorite:false,updated_at:new Date().toISOString()});
                }
            }

            if(typeof global.renderAll === "function"){
                global.renderAll();
            }
            if(options.renderPopup !== false && typeof global.renderFavoritesPopup === "function"){
                const popup = global.document && typeof global.document.getElementById === "function"
                    ? global.document.getElementById("favorites-popup")
                    : null;
                if(popup && popup.getAttribute && popup.getAttribute("aria-hidden") === "false"){
                    global.renderFavoritesPopup("movie");
                }
            }

            await waitForPaint();
            const failureMessage = favorite
                ? "Couldn’t add " + record.title + " to Favorites. Try again."
                : "Couldn’t remove " + record.title + " from Favorites. Try again.";
            const saved = await saveUserMutation(
                ()=>global.saveData({stateKeys:["profile","movies"]}),
                failureMessage
            );

            if(saved && options.showMessage === true){
                notify(favorite
                    ? record.title + " added to Favorites"
                    : record.title + " removed from Favorites");
            }

            return {
                success:saved,
                changed:alreadyFavorite !== favorite,
                pending:!saved
            };
        };
    }

    if(typeof global.updateMovieTracking === "function"){
        global.updateMovieTracking = async function(movie,action){
            const base = typeof global.getMovieRecordFromDetails === "function"
                ? global.getMovieRecordFromDetails(movie)
                : null;
            if(!base){
                notify("Movie details are not loaded yet");
                return;
            }

            const current = (
                typeof global.getMovieTrackingRecord === "function" && global.getMovieTrackingRecord(base.id)
            ) || (
                typeof global.upsertMovieTrackingRecord === "function" &&
                global.upsertMovieTrackingRecord(base,{updated_at:new Date().toISOString()})
            ) || {
                id:base.id,
                watched:false,
                plan:false,
                favorite:false
            };
            const currentState = typeof global.getMovieTrackingState === "function"
                ? global.getMovieTrackingState(base.id)
                : {favorite:false};
            const now = new Date().toISOString();
            let historyResult = {entry:null,deletedIds:[]};
            let historyDeleteIds = [];
            let successMessage = base.title + " updated";
            let failureMessage = "Couldn’t save changes for " + base.title + ". Try again.";

            if(action === "watched"){
                if(current.watched){
                    const confirmed = await global.showAppConfirm({
                        title:"Remove Watched Movie",
                        message:"Remove " + base.title + " from Watched? This will delete its movie History entry.",
                        confirmLabel:"Remove Watched",
                        cancelLabel:"Cancel",
                        danger:true
                    });
                    if(!confirmed){ return; }
                    historyDeleteIds = global.removeMovieHistoryEntries(base.id);
                    global.upsertMovieTrackingRecord(base,{watched:false,watched_at:"",updated_at:now});
                    successMessage = base.title + " removed from Watched";
                }else{
                    historyResult = global.addMovieHistoryEntry(base,now);
                    global.upsertMovieTrackingRecord(base,{watched:true,plan:false,watched_at:now,updated_at:now});
                    successMessage = current.plan
                        ? base.title + " moved to Watched"
                        : base.title + " added to Watched";
                }
            }else if(action === "plan"){
                if(current.plan){
                    global.upsertMovieTrackingRecord(base,{plan:false,updated_at:now});
                    successMessage = base.title + " removed from Plan to Watch";
                }else if(current.watched){
                    const confirmed = await global.showAppConfirm({
                        title:"Move to Plan to Watch",
                        message:"Move " + base.title + " from Watched to Plan to Watch? This will delete its movie History entry.",
                        confirmLabel:"Move to Plan",
                        cancelLabel:"Cancel",
                        danger:true
                    });
                    if(!confirmed){ return; }
                    historyDeleteIds = global.removeMovieHistoryEntries(base.id);
                    global.upsertMovieTrackingRecord(base,{watched:false,plan:true,watched_at:"",updated_at:now});
                    successMessage = base.title + " moved to Plan to Watch";
                }else{
                    global.upsertMovieTrackingRecord(base,{plan:true,updated_at:now});
                    successMessage = base.title + " added to Plan to Watch";
                }
            }else if(action === "favorite"){
                return global.setMovieFavoriteState(base,!currentState.favorite,{showMessage:true});
            }else if(action === "remove"){
                const confirmed = await global.showAppConfirm({
                    title:"Remove Movie",
                    message:"Clear Watched, Plan to Watch, Favorite, and movie History for " + base.title + "?",
                    confirmLabel:"Remove",
                    cancelLabel:"Cancel",
                    danger:true
                });
                if(!confirmed){ return; }
                historyDeleteIds = global.removeMovieHistoryEntries(base.id);
                if(typeof global.ensureProfileData === "function"){
                    global.ensureProfileData();
                }
                global.DATA.profile.favorite_movies = global.DATA.profile.favorite_movies.filter(item=>{
                    return String(item && (item.id || item.tmdb_id)) !== base.id;
                });
                delete global.DATA.movies[base.id];
                successMessage = base.title + " is removed";
                failureMessage = "Couldn’t remove " + base.title + ". Try again.";
            }else{
                return;
            }

            renderMovieSurface();
            await waitForPaint();

            const deletedIds = typeof global.combineHistoryDeleteIds === "function"
                ? global.combineHistoryDeleteIds(historyResult.deletedIds,historyDeleteIds)
                : Array.from(new Set([...(historyResult.deletedIds || []),...(historyDeleteIds || [])]));
            const saved = await saveUserMutation(
                ()=>global.saveMovieTrackingMutation(
                    base.id,
                    historyResult.entry ? [historyResult.entry.id] : [],
                    deletedIds,
                    action === "remove" ? ["movies","profile"] : ["movies"]
                ),
                failureMessage
            );

            if(saved){
                notify(successMessage);
            }
            return saved;
        };
    }

    if(typeof global.toggleFavoriteShow === "function"){
        global.toggleFavoriteShow = async function(showId){
            if(typeof global.ensureProfileData === "function"){
                global.ensureProfileData();
            }
            const id = String(showId || "");
            const show = global.DATA && global.DATA.shows ? global.DATA.shows[id] : null;
            if(!id || !show){
                return;
            }

            const title = String(show.title || show.name || "Show").trim() || "Show";
            const alreadyFavorite = typeof global.isShowFavorite === "function"
                ? global.isShowFavorite(id)
                : false;

            if(alreadyFavorite){
                global.DATA.profile.favorite_shows = global.DATA.profile.favorite_shows.filter(item=>String(item) !== id);
            }else{
                if(global.DATA.profile.favorite_shows.length >= 8){
                    notify("You can only choose 8 favorite shows");
                    return;
                }
                global.DATA.profile.favorite_shows.push(id);
            }

            if(typeof global.renderAll === "function"){
                global.renderAll();
            }
            if(typeof global.renderFavoritesPopup === "function"){
                global.renderFavoritesPopup("show");
            }
            await waitForPaint();

            const saved = await saveUserMutation(
                ()=>global.saveData({stateKeys:["profile"]}),
                alreadyFavorite
                    ? "Couldn’t remove " + title + " from Favorites. Try again."
                    : "Couldn’t add " + title + " to Favorites. Try again."
            );
            if(saved){
                notify(alreadyFavorite
                    ? title + " removed from Favorites"
                    : title + " added to Favorites");
            }
            return saved;
        };
    }

    global.TVTrackerMutationFeedback = Object.freeze({
        isBackgroundSaveMessage
    });
})(window);
