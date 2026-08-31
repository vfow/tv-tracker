(function(global){
    "use strict";

    const legacyRenderHistory = typeof global.renderHistory === "function" ? global.renderHistory : null;

    function root(){
        if(!global.document || typeof global.document.getElementById !== "function") return null;
        return global.document.getElementById("show-list");
    }

    function composeHistoryHTML(){
        if(typeof legacyRenderHistory !== "function") return null;
        const liveRoot = root();
        if(!liveRoot) return null;

        const parent = liveRoot.parentNode;
        if(!parent || typeof liveRoot.cloneNode !== "function" || typeof parent.insertBefore !== "function"){
            legacyRenderHistory();
            return String(liveRoot.innerHTML || "");
        }

        const originalId = String(liveRoot.id || "show-list");
        const stagingRoot = liveRoot.cloneNode(false);
        stagingRoot.id = originalId;
        if(stagingRoot.dataset){
            delete stagingRoot.dataset.tvtrackerHistoryOwner;
            delete stagingRoot.dataset.tvtrackerTrackerListsOwner;
        }

        liveRoot.id = originalId + "-vue-owned";
        parent.insertBefore(stagingRoot,liveRoot);

        try{
            legacyRenderHistory();
            return String(stagingRoot.innerHTML || "");
        }finally{
            if(typeof stagingRoot.remove === "function"){
                stagingRoot.remove();
            }else if(stagingRoot.parentNode && typeof stagingRoot.parentNode.removeChild === "function"){
                stagingRoot.parentNode.removeChild(stagingRoot);
            }
            liveRoot.id = originalId;
        }
    }

    function markVueOwnership(){
        const liveRoot = root();
        if(!liveRoot) return;
        if(liveRoot.dataset){
            delete liveRoot.dataset.tvtrackerTrackerListsOwner;
            liveRoot.dataset.tvtrackerHistoryOwner = "vue-history";
        }
        if(typeof liveRoot.querySelector === "function"){
            const marker = liveRoot.querySelector('[data-tvtracker-tracker-lists-owner="vue-watchlist"], [data-tvtracker-upcoming-notifications-owner="vue-upcoming"]');
            if(marker){
                marker.removeAttribute("data-tvtracker-tracker-lists-owner");
                marker.removeAttribute("data-tvtracker-upcoming-notifications-owner");
                marker.setAttribute("data-tvtracker-history-owner","vue-history");
            }
        }
    }

    function attachHistoryInteractions(){
        const liveRoot = root();
        if(!liveRoot || typeof liveRoot.querySelectorAll !== "function") return;
        liveRoot.querySelectorAll(".history-load-more").forEach(button=>{
            if(button.dataset && button.dataset.vueBound === "1") return;
            if(button.dataset) button.dataset.vueBound = "1";
            button.addEventListener("click",event=>{
                event.stopPropagation();
                if(typeof global.loadMoreHistory === "function"){
                    void global.loadMoreHistory();
                }
            });
        });
    }

    async function renderHistoryWithVue(){
        const sharedVueBridge = global.TVTrackerUpcomingNotificationsVueBridge;
        if(!sharedVueBridge || typeof sharedVueBridge.renderShowListHTML !== "function"){
            if(typeof legacyRenderHistory === "function") legacyRenderHistory();
            return false;
        }

        const html = composeHistoryHTML();
        if(html === null) return false;

        const rendered = await sharedVueBridge.renderShowListHTML(html);
        if(!rendered){
            if(typeof legacyRenderHistory === "function") legacyRenderHistory();
            return false;
        }

        markVueOwnership();
        attachHistoryInteractions();
        return true;
    }

    const renderHistory = renderHistoryWithVue;
    const bridge = Object.freeze({
        renderHistory,
        ownership:"vue-dom"
    });

    global.TVTrackerHistoryVueBridge = bridge;
    global.renderHistory = renderHistory;
})(window);
