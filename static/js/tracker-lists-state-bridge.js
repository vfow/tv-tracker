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

    function imageURL(path,size="w500"){
        const value = cleanText(path);
        if(!value) return "";
        if(/^https?:\/\//i.test(value)) return value;
        if(typeof global.trackerImageURL === "function"){
            return cleanText(global.trackerImageURL(value,size));
        }
        return "https://image.tmdb.org/t/p/" + String(size || "w500") + value;
    }

    function posterFallback(show){
        const words = cleanText(show && (show.title || show.name) || "TV")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0,2);
        const initials = words.map(word=>word.charAt(0)).join("").toUpperCase();
        return initials || "TV";
    }

    function actionViewModel(show,displayFilter,nextEp){
        const title = cleanText(show && show.title) || "show";
        if(displayFilter === "finished") return null;
        if(displayFilter === "paused" || displayFilter === "plan" || displayFilter === "dropped"){
            return Object.freeze({kind:"watching",label:`Change ${title} to Watching`,disabled:false});
        }
        if(!nextEp) return null;
        const isAvailable = Boolean(
            nextEp.air_date &&
            typeof global.isEpisodeLoggable === "function" &&
            global.isEpisodeLoggable(nextEp,show,nextEp.season)
        );
        const releaseDate = nextEp.air_date && typeof global.formatAirDate === "function"
            ? cleanText(global.formatAirDate(nextEp.air_date,nextEp,show))
            : "";
        const label = isAvailable
            ? `Mark ${title} Season ${nextEp.season}, Episode ${nextEp.episode} watched`
            : releaseDate
                ? `${title} Season ${nextEp.season}, Episode ${nextEp.episode} is available ${releaseDate}`
                : `${title} episode release date is unavailable`;
        return Object.freeze({kind:"mark",label,disabled:!isAvailable});
    }

    function cardViewModel(show,displayFilter){
        if(!show || typeof show !== "object") return null;
        const id = cleanId(show.tmdb_id || show.id);
        if(!id) return null;
        const title = cleanText(show.title || show.name);
        const isCompletedFilter = displayFilter === "finished";
        const isDroppedFilter = displayFilter === "dropped";
        const nextEp = (!isCompletedFilter && !isDroppedFilter && typeof global.getNextEpisode === "function")
            ? global.getNextEpisode(show)
            : null;
        const droppedStopEpisode = isDroppedFilter && typeof global.getLatestWatchedEpisode === "function"
            ? global.getLatestWatchedEpisode(show)
            : null;
        const droppedStopEpisodeData = droppedStopEpisode && typeof global.getEpisodeData === "function"
            ? global.getEpisodeData(show,droppedStopEpisode.season,droppedStopEpisode.episode)
            : null;
        const newBadge = Boolean(
            displayFilter === "watching" &&
            nextEp &&
            typeof global.isNewUpcomingEpisode === "function" &&
            global.isNewUpcomingEpisode(show,{
                season_number:nextEp.season,
                episode_number:nextEp.episode,
                air_date:nextEp.air_date,
                air_time:nextEp.air_time || "",
                air_timestamp:nextEp.air_timestamp || ""
            })
        );
        const episodeText = isCompletedFilter
            ? "✓ Completed"
            : isDroppedFilter && droppedStopEpisode
                ? `Stopped after Season ${droppedStopEpisode.season}, Episode ${droppedStopEpisode.episode}`
                : isDroppedFilter
                    ? "Dropped"
                    : displayFilter === "plan" && nextEp
                        ? `Start with Season ${nextEp.season}, Episode ${nextEp.episode}`
                        : displayFilter === "paused" && nextEp
                            ? `Next: Season ${nextEp.season}, Episode ${nextEp.episode}`
                            : nextEp
                                ? `Season ${nextEp.season}, Episode ${nextEp.episode}`
                                : typeof global.getNoNextEpisodeText === "function"
                                    ? cleanText(global.getNoNextEpisodeText(show))
                                    : "";
        const episodeTitle = isDroppedFilter && droppedStopEpisodeData && droppedStopEpisodeData.name
            ? cleanText(droppedStopEpisodeData.name)
            : nextEp && nextEp.name
                ? cleanText(nextEp.name)
                : "";
        const route = typeof global.getShowDetailRoute === "function"
            ? cleanText(global.getShowDetailRoute(show.tmdb_id || show.id,title))
            : `/app/list/${routeSlug(displayFilter)}`;
        return Object.freeze({
            id,
            filter:displayFilter,
            title,
            route,
            posterUrl:imageURL(show.poster_path,"w500"),
            posterFallback:posterFallback(show),
            episodeText,
            completed:isCompletedFilter,
            episodeTitle,
            newBadge,
            action:actionViewModel(show,displayFilter,nextEp)
        });
    }

    function filterLabel(filter){
        const labels = {watching:"Watching",paused:"Paused",finished:"Completed",plan:"Plan To Watch",dropped:"Dropped"};
        return labels[filter] || "Watching";
    }

    function emptyStateFor(state,query){
        if(query){
            const filterText = [state.genre,state.network,state.year]
            .filter(value=>value && value !== "all")
            .join(" • ");
            return Object.freeze({
                title:`No matches in ${filterLabel(state.activeFilter)}.`,
                text:filterText ? `No show matches ${filterText} in this list.` : "No show matches the selected filters."
            });
        }
        const messages = {
            watching:["Nothing in watching","Add a show when you start watching."],
            paused:["No paused shows","Paused shows will appear here."],
            finished:["No completed shows","Finished shows will appear here."],
            plan:["No planned shows","Shows saved for later will appear here."],
            dropped:["No dropped shows","Shows you stop watching will appear here."]
        };
        const message = messages[state.activeFilter] || messages.watching;
        return Object.freeze({title:message[0],text:message[1]});
    }

    function viewModel(){
        const state = snapshot();
        const legacyView = typeof global.getWatchlistShowsForCurrentView === "function"
            ? global.getWatchlistShowsForCurrentView()
            : null;
        const rawShows = legacyView && Array.isArray(legacyView.shows)
            ? legacyView.shows
            : Object.values(global.DATA && global.DATA.shows || {}).filter(show=>normalizeFilter(show && show.status) === state.activeFilter);
        const query = legacyView ? cleanText(legacyView.query) : state.query;
        const items = rawShows.map(show=>cardViewModel(show,state.activeFilter)).filter(Boolean);
        return Object.freeze({
            surface:"watchlist",
            activeFilter:state.activeFilter,
            routeSlug:state.routeSlug,
            query,
            items:Object.freeze(items),
            emptyState:items.length ? null : emptyStateFor(state,query)
        });
    }

    global.TVTrackerTrackerListsStateBridge = Object.freeze({
        snapshot,
        viewModel,
        ownership:"legacy-read-only"
    });
})(window);
