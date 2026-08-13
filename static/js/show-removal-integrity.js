async function removeShow(showId){

    const show = DATA.shows[String(showId)];

    if(!show){
        return;
    }

    const confirmRemove = await showAppConfirm({
        title:"Remove Show",
        message:"Remove " + show.title + " from your tracker?",
        confirmLabel:"Remove",
        cancelLabel:"Cancel",
        danger:true
    });

    if(!confirmRemove){
        return;
    }

    const id = String(showId);
    const favoriteShows = DATA.profile && Array.isArray(DATA.profile.favorite_shows)
    ? DATA.profile.favorite_shows
    : [];
    const wasFavorite = favoriteShows.some(item=>String(item) === id);
    const deletedHistoryIds = (Array.isArray(DATA.history) ? DATA.history : [])
    .filter(entry=>String(entry.tmdb_id) === id)
    .map(entry=>String(entry.id || ""))
    .filter(Boolean);

    delete DATA.shows[id];
    DATA.history = (Array.isArray(DATA.history) ? DATA.history : []).filter(entry=>{
        return String(entry.tmdb_id) !== id;
    });

    if(wasFavorite){
        DATA.profile.favorite_shows = favoriteShows.filter(item=>String(item) !== id);
    }

    closeShowDetailsPage();
    refreshInterfaceForDataChanges({
        showIds:[id],
        historyChanged:deletedHistoryIds.length > 0,
        stateChanged:wasFavorite,
        remote:false
    });
    showToast(show.title + " removed");

    await waitForNextPaint();

    const saveOptions = {
        showDeleteIds:[id],
        historyDeleteIds:deletedHistoryIds
    };

    if(wasFavorite){
        saveOptions.stateKeys = ["profile"];
    }

    await saveData(saveOptions);

}
