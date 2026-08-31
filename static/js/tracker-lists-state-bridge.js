(function(global){
    "use strict";

    const FILTERS = new Set(["watching","paused","finished","plan","dropped"]);
    const SORTS = new Set([
        "default","title-az","title-za","recently-added","recently-watched",
        "rating-desc","year-newest","year-oldest"
    ]);

    function cleanText(value){
        return String(value === null || typeof value === "undefined" ? "" : value).trim();
    }

    function cleanId(value){
        const clean = cleanText(value);
        return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
    }

    function cleanNumber(value){
        if(value === null || value === "" || typeof value === "undefined"){
            return null;
        }
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function normalizeFilter(value){
        const clean = cleanText(value).toLowerCase();
        return FILTERS.has(clean) ? clean : "watching";
    }

    function normalizeSort(value){
        const clean = cleanText(value).toLowerCase();
        return SORTS.has(clean) ? clean : "default";
    }

    function routeSlug(filter){
        if(filter === "finished") return "completed";
        if(filter === "plan") return "plan-to-watch";
        return filter;
    }

    function favoriteShowIds(profile,shows){
        const source = profile && Array.isArray(profile.favorite_shows) ? profile.favorite_shows : [];
        const seen = new Set();
        const ids = source
        .map(cleanId)
        .filter(id=>{
            if(!id || seen.has(id) || !shows[id]) return false;
            seen.add(id);
            return true;
        })
        .slice(0,8);
        return Object.freeze(ids);
    }

    function favoriteMovieIds(profile,movies){
        const source = profile && Array.isArray(profile.favorite_movies) ? profile.favorite_movies : [];
        const seen = new Set();
        const ids = source
        .map(item=>cleanId(item && typeof item === "object" ? (item.id || item.tmdb_id || item.movie_id) : item))
        .filter(id=>{
            if(!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .slice(0,8);
        return Object.freeze(ids);
    }

    function normalizeShow(raw,key,favorites){
        if(!raw || typeof raw !== "object") return null;
        const id = cleanId(raw.tmdb_id || raw.id || key);
        if(!id) return null;
        return Object.freeze({
            id,
            title:cleanText(raw.title || raw.name),
            status:normalizeFilter(raw.status),
            posterPath:cleanText(raw.poster_path),
            firstAirDate:cleanText(raw.first_air_date || raw.premiered || raw.date),
            voteAverage:cleanNumber(raw.vote_average),
            favorite:favorites.has(id)
        });
    }

    function normalizeMovie(raw,key,favorites){
        if(!raw || typeof raw !== "object") return null;
        const id = cleanId(raw.id || raw.tmdb_id || raw.movie_id || key);
        if(!id) return null;
        return Object.freeze({
            id,
            title:cleanText(raw.title || raw.name),
            posterPath:cleanText(raw.poster_path),
            releaseDate:cleanText(raw.release_date || raw.date),
            voteAverage:cleanNumber(raw.vote_average),
            watched:raw.watched === true,
            plan:raw.plan === true,
            favorite:favorites.has(id) || raw.favorite === true
        });
    }

    function snapshot(){
        const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
        const shows = data.shows && typeof data.shows === "object" ? data.shows : {};
        const movies = data.movies && typeof data.movies === "object" ? data.movies : {};
        const profile = data.profile && typeof data.profile === "object" ? data.profile : {};
        const favoriteShows = favoriteShowIds(profile,shows);
        const favoriteMovies = favoriteMovieIds(profile,movies);
        const favoriteShowSet = new Set(favoriteShows);
        const favoriteMovieSet = new Set(favoriteMovies);
        const activeFilter = normalizeFilter(global.activeFilter);

        const showItems = Object.entries(shows)
        .map(([key,value])=>normalizeShow(value,key,favoriteShowSet))
        .filter(Boolean)
        .sort((a,b)=>a.id.localeCompare(b.id));

        const movieItems = Object.entries(movies)
        .map(([key,value])=>normalizeMovie(value,key,favoriteMovieSet))
        .filter(Boolean)
        .sort((a,b)=>a.id.localeCompare(b.id));

        return Object.freeze({
            page:"shows",
            tab:"watchlist",
            activeFilter,
            routeSlug:routeSlug(activeFilter),
            query:cleanText(global.librarySearchQuery),
            genre:cleanText(global.libraryGenreFilter) || "all",
            network:cleanText(global.libraryNetworkFilter) || "all",
            year:cleanText(global.libraryYearFilter) || "all",
            sort:normalizeSort(global.librarySortMode),
            shows:Object.freeze(showItems),
            movies:Object.freeze(movieItems),
            favoriteShowIds:favoriteShows,
            favoriteMovieIds:favoriteMovies
        });
    }

    global.TVTrackerTrackerListsStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });
})(window);
