(function(global){
    "use strict";

    function buildSearchBackRoute(){
        if(typeof global.getSearchRoute !== "function"){
            return "";
        }

        const routeState = global.searchRouteState && typeof global.searchRouteState === "object"
        ? global.searchRouteState
        : {};
        const searchState = global.discoverSearchState && typeof global.discoverSearchState === "object"
        ? global.discoverSearchState
        : {};
        const query = String(searchState.query || routeState.query || "").trim();

        if(!query){
            return "";
        }

        const media = typeof global.normalizeSearchMediaType === "function"
        ? global.normalizeSearchMediaType(searchState.media || routeState.media || "tv")
        : "tv";
        const route = global.getSearchRoute(query,media,routeState);

        routeState.query = query;
        routeState.media = media;
        searchState.query = query;
        searchState.media = media;

        if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(route,true);
        }else if(global.history && typeof global.history.replaceState === "function"){
            global.history.replaceState({tvTrackerRoute:true},"",route);
        }

        return route;
    }

    global.lockSearchRouteBeforeResultOpen = buildSearchBackRoute;
    global.TVTrackerSearchNavigationFix = Object.freeze({buildSearchBackRoute});
})(window);
