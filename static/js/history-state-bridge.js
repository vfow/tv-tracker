(function(global){
    "use strict";

    const DEFAULT_VISIBLE_LIMIT = 40;

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

    function visibleEntries(){
        const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
        const shows = data.shows && typeof data.shows === "object" ? data.shows : {};
        const history = Array.isArray(data.history) ? data.history : [];
        return sortEntries(history.filter(entry=>isVisible(entry,shows)));
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
        const entries = visibleEntries()
        .map(normalizeEntry)
        .filter(Boolean);

        return Object.freeze({
            page:"shows",
            tab:"history",
            entries:Object.freeze(entries)
        });
    }

    function imageUrl(path){
        const value = cleanText(path);
        if(!value || typeof global.trackerImageURL !== "function") return "";
        return cleanText(global.trackerImageURL(value,"w780"));
    }

    function relativeTime(value){
        if(typeof global.formatHistoryRelative === "function"){
            return cleanText(global.formatHistoryRelative(value));
        }
        return cleanText(value);
    }

    function movieDisplay(entry){
        const movieId = cleanId(entry && (entry.movie_id || entry.tmdb_id));
        const tracked = movieId && typeof global.getMovieTrackingRecord === "function"
        ? (global.getMovieTrackingRecord(movieId) || {})
        : {};
        const title = cleanText(entry && entry.title || tracked.title) || "Unknown Movie";
        const releaseDate = cleanText(entry && entry.release_date || tracked.release_date);
        const year = cleanText(entry && entry.year || tracked.year || (releaseDate ? releaseDate.slice(0,4) : ""));
        const backdropPath = cleanText(entry && entry.backdrop_path || tracked.backdrop_path);
        const route = typeof global.getMovieDetailRoute === "function"
        ? cleanText(global.getMovieDetailRoute(movieId,title))
        : "/app/history";
        return {movieId,title,year,backdropPath,route};
    }

    function cardViewModel(entry,index){
        if(isMovie(entry)){
            const movie = movieDisplay(entry);
            return Object.freeze({
                key:"movie:" + movie.movieId + ":" + cleanText(entry && entry.watched_at) + ":" + String(index),
                kind:"movie",
                route:movie.route || "/app/history",
                title:movie.title,
                detailLine:movie.year,
                imageUrl:imageUrl(movie.backdropPath),
                placeholder:"🎬",
                relativeTime:relativeTime(entry && entry.watched_at)
            });
        }

        const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
        const shows = data.shows && typeof data.shows === "object" ? data.shows : {};
        const showId = cleanId(entry && (entry.tmdb_id || entry.show_id));
        const show = shows[showId] || {};
        const season = cleanIndex(entry && entry.season);
        const episode = cleanIndex(entry && entry.episode);
        const episodeData = typeof global.getEpisodeData === "function"
        ? (global.getEpisodeData(show,season,episode) || {})
        : {};
        const episodeTitle = cleanText(entry && entry.episode_title || episodeData.name) || "Untitled Episode";
        const stillPath = cleanText(entry && entry.episode_still_path || episodeData.still_path);
        const title = cleanText(entry && entry.title || show.title) || "Unknown Show";
        const route = typeof global.getEpisodeDetailRoute === "function"
        ? cleanText(global.getEpisodeDetailRoute(showId,season,episode))
        : "/app/history";

        return Object.freeze({
            key:"episode:" + showId + ":" + String(season) + ":" + String(episode) + ":" + cleanText(entry && entry.watched_at) + ":" + String(index),
            kind:"episode",
            route:route || "/app/history",
            title,
            detailLine:"S" + String(season) + "E" + String(episode).padStart(2,"0") + " — " + episodeTitle,
            imageUrl:imageUrl(stillPath),
            placeholder:"📺",
            relativeTime:relativeTime(entry && entry.watched_at)
        });
    }

    function viewModel(visibleLimit=DEFAULT_VISIBLE_LIMIT){
        const allEntries = visibleEntries();
        const requestedLimit = Number(visibleLimit);
        const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_VISIBLE_LIMIT;
        const shownEntries = allEntries.slice(0,limit);
        const rawGroups = typeof global.groupHistoryByDate === "function"
        ? global.groupHistoryByDate(shownEntries)
        : [{label:"History",entries:shownEntries}];
        let cardIndex = 0;
        const groups = (Array.isArray(rawGroups) ? rawGroups : []).map((group,groupIndex)=>{
            const entries = Array.isArray(group && group.entries) ? group.entries : [];
            const cards = entries.map(entry=>cardViewModel(entry,cardIndex++));
            return Object.freeze({
                key:"history-group:" + String(groupIndex) + ":" + cleanText(group && group.label),
                label:cleanText(group && group.label),
                entries:Object.freeze(cards)
            });
        });

        return Object.freeze({
            surface:"history",
            groups:Object.freeze(groups),
            emptyState:allEntries.length === 0
            ? Object.freeze({title:"No watch history",text:"Watched episodes and movies will appear here."})
            : null,
            hasMore:allEntries.length > shownEntries.length
        });
    }

    global.TVTrackerHistoryStateBridge = Object.freeze({
        snapshot,
        viewModel,
        ownership:"legacy-read-only"
    });
})(window);
