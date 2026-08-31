(function(global){
    "use strict";

    function cleanText(value){
        return String(value === null || typeof value === "undefined" ? "" : value).trim();
    }

    function cleanId(value){
        const clean = cleanText(value);
        return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
    }

    function cleanIndex(value){
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 ? number : 0;
    }

    function isMovie(entry){
        if(typeof global.isMovieHistoryEntry === "function"){
            return global.isMovieHistoryEntry(entry);
        }
        return cleanText(entry && entry.media_type).toLowerCase() === "movie" || Boolean(entry && entry.movie_id);
    }

    function isVisible(entry,shows){
        if(isMovie(entry) || !entry || !entry.air_date) return true;
        if(typeof global.isEpisodeAired !== "function") return true;
        return global.isEpisodeAired(entry.air_date,entry,shows[cleanText(entry.tmdb_id)] || null);
    }

    function sortEntries(entries){
        return entries.slice().sort((a,b)=>{
            const aTime = new Date(a && a.watched_at || 0).getTime();
            const bTime = new Date(b && b.watched_at || 0).getTime();
            const safeATime = Number.isFinite(aTime) ? aTime : 0;
            const safeBTime = Number.isFinite(bTime) ? bTime : 0;
            const timeDifference = safeBTime - safeATime;
            if(timeDifference !== 0) return timeDifference;

            const aIsMovie = isMovie(a);
            const bIsMovie = isMovie(b);
            if(aIsMovie !== bIsMovie) return aIsMovie ? 1 : -1;

            if(!aIsMovie){
                const seasonDifference = Number(b && b.season || 0) - Number(a && a.season || 0);
                if(seasonDifference !== 0) return seasonDifference;
                const episodeDifference = Number(b && b.episode || 0) - Number(a && a.episode || 0);
                if(episodeDifference !== 0) return episodeDifference;
            }

            return cleanText(a && a.title).localeCompare(cleanText(b && b.title));
        });
    }

    function normalizeEntry(entry){
        if(!entry || typeof entry !== "object") return null;
        if(isMovie(entry)){
            const movieId = cleanId(entry.movie_id || entry.tmdb_id);
            if(!movieId) return null;
            const releaseDate = cleanText(entry.release_date);
            return Object.freeze({
                kind:"movie",
                movieId,
                title:cleanText(entry.title),
                watchedAt:cleanText(entry.watched_at),
                releaseDate,
                year:cleanText(entry.year || (releaseDate ? releaseDate.slice(0,4) : "")),
                backdropPath:cleanText(entry.backdrop_path)
            });
        }

        const showId = cleanId(entry.tmdb_id || entry.show_id);
        if(!showId) return null;
        return Object.freeze({
            kind:"episode",
            showId,
            title:cleanText(entry.title),
            season:cleanIndex(entry.season),
            episode:cleanIndex(entry.episode),
            episodeTitle:cleanText(entry.episode_title),
            watchedAt:cleanText(entry.watched_at),
            airDate:cleanText(entry.air_date),
            stillPath:cleanText(entry.episode_still_path)
        });
    }

    function snapshot(){
        const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
        const shows = data.shows && typeof data.shows === "object" ? data.shows : {};
        const history = Array.isArray(data.history) ? data.history : [];
        const entries = sortEntries(history.filter(entry=>isVisible(entry,shows)))
        .map(normalizeEntry)
        .filter(Boolean);

        return Object.freeze({
            page:"shows",
            tab:"history",
            entries:Object.freeze(entries)
        });
    }

    global.TVTrackerHistoryStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });
})(window);
