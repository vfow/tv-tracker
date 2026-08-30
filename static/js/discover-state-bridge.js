(function(global){
    "use strict";

    const DISCOVER_MEDIA_TYPES = new Set(["tv","movie"]);

    function normalizeMedia(value){
        const media = String(value || "").trim().toLowerCase();
        return DISCOVER_MEDIA_TYPES.has(media) ? media : "tv";
    }

    function text(value){
        return value === null || typeof value === "undefined" ? "" : String(value);
    }

    function number(value){
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function cloneGenre(value){
        const genre = value && typeof value === "object" ? value : {};
        return Object.freeze({
            id:number(genre.id),
            name:text(genre.name)
        });
    }

    function cloneMediaItem(value,fallbackMedia){
        const item = value && typeof value === "object" ? value : {};
        return Object.freeze({
            id:number(item.id),
            media_type:normalizeMedia(item.media_type || fallbackMedia),
            name:text(item.name),
            title:text(item.title),
            poster_path:text(item.poster_path),
            backdrop_path:text(item.backdrop_path),
            overview:text(item.overview),
            first_air_date:text(item.first_air_date),
            release_date:text(item.release_date),
            date:text(item.date),
            vote_average:number(item.vote_average),
            popularity:number(item.popularity),
            adult:item.adult === true
        });
    }

    function cloneReadonlyValue(value,seen){
        if(value === null || typeof value !== "object"){
            return typeof value === "function" || typeof value === "symbol" ? null : value;
        }
        if(seen.has(value)){
            return null;
        }
        seen.add(value);
        if(Array.isArray(value)){
            const copy = Object.freeze(value.map(item=>cloneReadonlyValue(item,seen)));
            seen.delete(value);
            return copy;
        }
        const copy = {};
        Object.keys(value).forEach(key=>{
            const item = value[key];
            if(typeof item === "undefined" || typeof item === "function" || typeof item === "symbol"){
                return;
            }
            copy[key] = cloneReadonlyValue(item,seen);
        });
        seen.delete(value);
        return Object.freeze(copy);
    }

    function cloneCollection(value){
        const collection = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        return cloneReadonlyValue(collection,new WeakSet());
    }

    function cloneSection(value){
        const section = value && typeof value === "object" ? value : {};
        const media = normalizeMedia(section.media);
        const items = Array.isArray(section.items)
            ? section.items.map(item=>cloneMediaItem(item,media))
            : [];
        const shows = Array.isArray(section.shows)
            ? section.shows.map(item=>cloneMediaItem(item,media))
            : [];
        return Object.freeze({
            key:text(section.key),
            media,
            category:text(section.category),
            title:text(section.title),
            section:text(section.section),
            route:text(section.route),
            items:Object.freeze(items),
            shows:Object.freeze(shows),
            hasMore:section.hasMore === true,
            loadingMore:section.loadingMore === true
        });
    }

    function snapshot(){
        const state = global.discoverHubState && typeof global.discoverHubState === "object"
            ? global.discoverHubState
            : {};
        const genres = state.genres && typeof state.genres === "object" ? state.genres : {};
        const sections = Array.isArray(state.sections) ? state.sections.map(cloneSection) : [];
        const collections = Array.isArray(state.collections) ? state.collections.map(cloneCollection) : [];

        return Object.freeze({
            loaded:state.loaded === true,
            loading:state.loading === true,
            error:text(state.error),
            sections:Object.freeze(sections),
            genres:Object.freeze({
                tv:Object.freeze((Array.isArray(genres.tv) ? genres.tv : []).map(cloneGenre)),
                movie:Object.freeze((Array.isArray(genres.movie) ? genres.movie : []).map(cloneGenre))
            }),
            collections:Object.freeze(collections)
        });
    }

    global.TVTrackerDiscoverStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });
})(window);
