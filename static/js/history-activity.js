function getActivityHistoryEntries(){

    if(!DATA.history || !Array.isArray(DATA.history)){
        DATA.history = [];
    }

    return DATA.history
    .filter(entry=>{

        if(isMovieHistoryEntry(entry)){
            return true;
        }

        if(!entry.air_date){
            return true;
        }

        return isEpisodeAired(
            entry.air_date,
            entry,
            DATA.shows[String(entry.tmdb_id)] || null
        );

    })
    .slice()
    .sort((a,b)=>{

        const aTime = new Date(a && a.watched_at || 0).getTime();
        const bTime = new Date(b && b.watched_at || 0).getTime();
        const safeATime = Number.isFinite(aTime) ? aTime : 0;
        const safeBTime = Number.isFinite(bTime) ? bTime : 0;
        const timeDifference = safeBTime - safeATime;

        if(timeDifference !== 0){
            return timeDifference;
        }

        const aIsMovie = isMovieHistoryEntry(a);
        const bIsMovie = isMovieHistoryEntry(b);

        if(aIsMovie !== bIsMovie){
            return aIsMovie ? 1 : -1;
        }

        if(!aIsMovie){
            const seasonDifference =
            Number(b.season || 0) - Number(a.season || 0);

            if(seasonDifference !== 0){
                return seasonDifference;
            }

            const episodeDifference =
            Number(b.episode || 0) - Number(a.episode || 0);

            if(episodeDifference !== 0){
                return episodeDifference;
            }
        }

        return String(a && a.title || "").localeCompare(String(b && b.title || ""));

    });

}


function getMovieHistoryDisplayData(entry){

    const movieId = String(entry && (entry.movie_id || entry.tmdb_id) || "");
    const trackedMovie = movieId && typeof getMovieTrackingRecord === "function"
    ? (getMovieTrackingRecord(movieId) || {})
    : {};
    const title = String(entry && entry.title || trackedMovie.title || "Unknown Movie");
    const releaseDate = String(entry && entry.release_date || trackedMovie.release_date || "").trim();
    const year = String(entry && entry.year || trackedMovie.year || (releaseDate ? releaseDate.slice(0,4) : "")).trim();

    return {
        id:movieId,
        title:title,
        year:year,
        backdropPath:String(entry && entry.backdrop_path || trackedMovie.backdrop_path || "")
    };

}


function getHistoryViewModel(){

    const allHistoryEntries = getActivityHistoryEntries();

    if(allHistoryEntries.length === 0){
        return {
            surface:"history",
            groups:[],
            emptyState:{
                title:"No watch history",
                text:"Watched episodes and movies will appear here."
            },
            hasMore:false
        };
    }

    const historyEntries = allHistoryEntries.slice(0,historyVisibleLimit);
    const groups = groupHistoryByDate(historyEntries).map((group,groupIndex)=>({
        key:`history-group-${groupIndex}-${String(group.label || "")}`,
        label:String(group.label || ""),
        entries:group.entries.map((entry,entryIndex)=>{
            const movieEntry = isMovieHistoryEntry(entry);
            let route = "/app/history";
            let title = "";
            let detailLine = "";
            let imagePath = "";
            let placeholder = "📺";
            let identity = "";

            if(movieEntry){
                const movie = getMovieHistoryDisplayData(entry);
                title = movie.title;
                detailLine = movie.year || "";
                imagePath = movie.backdropPath;
                placeholder = "🎬";
                identity = `movie-${movie.id}`;
                route = typeof getMovieDetailRoute === "function"
                ? getMovieDetailRoute(movie.id,movie.title)
                : route;
            }else{
                const show = DATA.shows[String(entry.tmdb_id)] || {};
                const episodeData = getEpisodeData(show,entry.season,entry.episode);
                const episodeTitle = entry.episode_title || episodeData.name || "Untitled Episode";
                imagePath = entry.episode_still_path || episodeData.still_path || "";
                title = entry.title || show.title || "Unknown Show";
                detailLine = `S${entry.season}E${String(entry.episode).padStart(2,"0")} — ${episodeTitle}`;
                identity = `episode-${entry.tmdb_id}-${entry.season}-${entry.episode}`;
                route = typeof getEpisodeDetailRoute === "function"
                ? getEpisodeDetailRoute(entry.tmdb_id,entry.season,entry.episode)
                : route;
            }

            return {
                key:`${identity}-${String(entry.watched_at || "")}-${entryIndex}`,
                kind:movieEntry ? "movie" : "episode",
                route,
                title:String(title || ""),
                detailLine:String(detailLine || ""),
                imageUrl:imagePath ? trackerImageURL(imagePath,"w780") : "",
                placeholder,
                relativeTime:formatHistoryRelative(entry.watched_at)
            };
        })
    }));

    return {
        surface:"history",
        groups,
        emptyState:null,
        hasMore:allHistoryEntries.length > historyEntries.length
    };

}


function loadMoreHistory(){

    historyVisibleLimit += HISTORY_BATCH_SIZE;
    return globalThis.renderHistory();

}
