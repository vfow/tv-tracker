(function(global){
    "use strict";

    const SHOW_DETAILS_TABS = new Set(["Info","Episodes"]);
    const SHOW_INFO_TABS = new Set(["Cast","Crew","Details","Genres","Releases"]);
    const MOVIE_DETAILS_TABS = new Set(["Info","Cast","Crew","Details","Genres","Releases"]);
    const MOVIE_RELEASE_SORTS = new Set(["date","country"]);

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

    function normalizeEntity(raw,media,fallbackId=""){
        if(!raw || typeof raw !== "object"){
            return null;
        }
        const id = cleanId(raw.tmdb_id || raw.id || raw.movie_id || fallbackId);
        if(!id){
            return null;
        }
        const isMovie = media === "movie";
        return Object.freeze({
            id,
            media:isMovie ? "movie" : "show",
            title:cleanText(raw.title || raw.name),
            originalTitle:cleanText(raw.original_title || raw.original_name),
            overview:cleanText(raw.overview || raw.summary),
            posterPath:cleanText(raw.poster_path),
            backdropPath:cleanText(raw.backdrop_path),
            releaseDate:cleanText(isMovie ? (raw.release_date || raw.date) : (raw.first_air_date || raw.premiered || raw.date)),
            voteAverage:cleanNumber(raw.vote_average),
            adult:raw.adult === true
        });
    }

    function showSnapshot(){
        const id = cleanId(global.selectedShowId);
        const tracked = id && global.DATA && global.DATA.shows && global.DATA.shows[id]
        ? global.DATA.shows[id]
        : null;
        const preview = global.showDetailPreview && typeof global.showDetailPreview === "object"
        ? global.showDetailPreview
        : null;
        const raw = tracked || preview;
        const entity = normalizeEntity(raw,"show",id);
        const entityId = entity ? entity.id : id;
        const detailsTabs = global.activeShowDetailsTabs && typeof global.activeShowDetailsTabs === "object"
        ? global.activeShowDetailsTabs
        : {};
        const infoTabs = global.activeShowInfoTabs && typeof global.activeShowInfoTabs === "object"
        ? global.activeShowInfoTabs
        : {};
        const rawDetailsTab = cleanText(detailsTabs[entityId] || "Info");
        const rawInfoTab = cleanText(infoTabs[entityId] || "Cast");

        return Object.freeze({
            page:"show-detail",
            selectedId:entityId,
            preview:!!entity && !tracked,
            activeDetailsTab:SHOW_DETAILS_TABS.has(rawDetailsTab) ? rawDetailsTab : "Info",
            activeInfoTab:SHOW_INFO_TABS.has(rawInfoTab) ? rawInfoTab : "Cast",
            entity
        });
    }

    function movieSnapshot(){
        const state = global.moviePageState && typeof global.moviePageState === "object"
        ? global.moviePageState
        : {};
        const id = cleanId(state.movieId || global.selectedMovieId);
        const rawTab = cleanText(global.activeMovieDetailsTab || "Info");
        const rawSort = cleanText(global.activeMovieReleaseSort || "date");

        return Object.freeze({
            page:"movie-detail",
            selectedId:id,
            routeSlug:cleanText(state.routeSlug),
            loading:state.loading === true,
            error:cleanText(state.error),
            activeDetailsTab:MOVIE_DETAILS_TABS.has(rawTab) ? rawTab : "Info",
            releaseSort:MOVIE_RELEASE_SORTS.has(rawSort) ? rawSort : "date",
            entity:normalizeEntity(state.movie,"movie",id)
        });
    }

    function snapshot(kind){
        const requested = cleanText(kind).toLowerCase();
        if(requested === "movie"){
            return movieSnapshot();
        }
        if(requested === "show"){
            return showSnapshot();
        }
        return global.activePage === "movie-detail" ? movieSnapshot() : showSnapshot();
    }

    global.TVTrackerMediaDetailsStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });
})(window);
