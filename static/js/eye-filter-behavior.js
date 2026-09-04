(function(global){
    "use strict";

    const originalApplyEyeFiltersToItems = global.applyEyeFiltersToItems;
    if(typeof originalApplyEyeFiltersToItems !== "function"){
        return;
    }

    function normalizeMedia(value){
        return String(value || "tv").trim().toLowerCase() === "movie" ? "movie" : "tv";
    }

    function normalizeEyeState(value){
        if(typeof global.createEyeFilterState === "function"){
            return global.createEyeFilterState(value || {});
        }
        const state = value && typeof value === "object" ? value : {};
        return {
            fadeWatched:state.fadeWatched === true || String(state.fadeWatched || "") === "1",
            hideWatched:state.hideWatched === true || String(state.hideWatched || "") === "1"
        };
    }

    function getTrackedTVStatus(item){
        if(!item || typeof global.getShowByTmdb !== "function"){
            return "";
        }
        const show = global.getShowByTmdb(item.id);
        return String(show && show.status || "").trim().toLowerCase();
    }

    global.applyEyeFiltersToItems = function(items,media="tv",eyeState={}){
        const filtered = originalApplyEyeFiltersToItems.call(this,items,media,eyeState);
        const state = normalizeEyeState(eyeState);
        const cleanMedia = normalizeMedia(media);

        if(
            cleanMedia !== "tv" ||
            !state.fadeWatched ||
            state.hideWatched ||
            !Array.isArray(filtered)
        ){
            return filtered;
        }

        return filtered.map(item=>{
            if(!item || item._eyeFaded === true || getTrackedTVStatus(item) !== "watching"){
                return item;
            }
            return Object.assign({},item,{_eyeFaded:true});
        });
    };
})(window);
