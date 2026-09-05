(function(global){
    "use strict";

    function cloneShowForPreview(show){
        if(!show || typeof show !== "object"){
            return null;
        }
        let preview = null;
        try{
            preview = JSON.parse(JSON.stringify(show));
        }catch(error){
            preview = Object.assign({},show);
        }

        preview.status = "";
        preview._preview_only = true;
        preview.episodes_watched = {};
        preview.completed_at = "";
        return preview;
    }

    if(typeof global.removeShow === "function"){
        const removeTrackedShow = global.removeShow;

        global.removeShow = async function(showId){
            const id = String(showId || "");
            const show = global.DATA && global.DATA.shows
                ? global.DATA.shows[id]
                : null;
            const keepDetailOpen = Boolean(
                show &&
                global.activePage === "show-detail" &&
                String(global.selectedShowId || "") === id
            );
            const preview = keepDetailOpen ? cloneShowForPreview(show) : null;
            const originalClose = global.closeShowDetailsPage;

            if(keepDetailOpen && typeof originalClose === "function"){
                // removeShow historically closes the detail route immediately.
                // Suppress only that navigation while the mutation runs; after a
                // confirmed removal, the same route is rendered as an untracked
                // Discover preview instead.
                global.closeShowDetailsPage = function(){};
            }

            try{
                const result = await removeTrackedShow(showId);
                const wasRemoved = Boolean(
                    keepDetailOpen &&
                    global.DATA &&
                    global.DATA.shows &&
                    !global.DATA.shows[id]
                );

                if(wasRemoved && preview){
                    global.showDetailPreview = preview;
                    global.selectedShowId = id;
                    global.selectedEpisodeContext = null;

                    if(typeof global.renderShowDetailsPagePreservingScroll === "function"){
                        global.renderShowDetailsPagePreservingScroll(preview);
                    }else if(typeof global.renderShowDetailsPage === "function"){
                        global.renderShowDetailsPage(preview,{preview:true});
                    }
                    if(typeof global.updateShellTitle === "function"){
                        global.updateShellTitle();
                    }
                }

                return result;
            }finally{
                if(keepDetailOpen && typeof originalClose === "function"){
                    global.closeShowDetailsPage = originalClose;
                }
            }
        };
    }

    if(typeof global.savePreparedShow === "function"){
        const savePreparedTrackedShow = global.savePreparedShow;

        global.savePreparedShow = async function(showObject,status){
            const requestedStatus = String(status || "").trim().toLowerCase();
            const seasonOne = showObject && showObject._episode_list
                ? showObject._episode_list["1"]
                : null;

            if(
                requestedStatus === "watching" &&
                showObject &&
                (!Array.isArray(seasonOne) || seasonOne.length === 0) &&
                typeof global.ensureSeasonLoaded === "function"
            ){
                try{
                    // Loading Season 1 does not mark anything watched. It only
                    // gives the newly-added Watching card enough canonical data
                    // to present S01E01 as the next episode immediately.
                    await global.ensureSeasonLoaded(showObject,1,false,{skipSave:true});
                }catch(error){
                    // Adding the show must still work if episode metadata is
                    // temporarily unavailable; normal metadata refresh can retry.
                }
            }

            return savePreparedTrackedShow(showObject,status);
        };
    }

    if(
        global.TVTrackerTrackerListsStateBridge &&
        typeof global.TVTrackerTrackerListsStateBridge.viewModel === "function"
    ){
        const trackerListsBridge = global.TVTrackerTrackerListsStateBridge;
        const originalViewModel = trackerListsBridge.viewModel.bind(trackerListsBridge);

        global.TVTrackerTrackerListsStateBridge = Object.freeze(Object.assign({},trackerListsBridge,{
            viewModel(){
                const model = originalViewModel();
                if(!model || !Array.isArray(model.items)){
                    return model;
                }

                const items = model.items.map(item=>{
                    if(!item || typeof item !== "object"){
                        return item;
                    }
                    const episodeText = String(item.episodeText || "").replace(/^Stopped after /,"Stopped at ");
                    return episodeText === item.episodeText
                        ? item
                        : Object.freeze(Object.assign({},item,{episodeText}));
                });

                return Object.freeze(Object.assign({},model,{items:Object.freeze(items)}));
            }
        }));
    }
})(window);
