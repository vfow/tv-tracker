(function(global){
    "use strict";

    const SEARCH_MEDIA_TYPES = new Set(["tv","movie","person","collection"]);

    function normalizeMedia(value){
        const media = String(value || "").trim().toLowerCase();
        return SEARCH_MEDIA_TYPES.has(media) ? media : "tv";
    }

    function snapshot(){
        const state = global.searchRouteState && typeof global.searchRouteState === "object"
            ? global.searchRouteState
            : {};

        return Object.freeze({
            query:String(state.query || ""),
            media:normalizeMedia(state.media),
            fadeWatched:state.fadeWatched === true,
            hideWatched:state.hideWatched === true,
            hidePlan:state.hidePlan === true,
            hideFavorites:state.hideFavorites === true
        });
    }

    global.TVTrackerSearchStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });
})(window);
