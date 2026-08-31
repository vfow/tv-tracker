(function(global){
    "use strict";

    const legacyRenderWatchlist = typeof global.renderWatchlist === "function" ? global.renderWatchlist : null;

    function root(){
        if(!global.document || typeof global.document.getElementById !== "function") return null;
        return global.document.getElementById("show-list");
    }

    function attachWatchlistInteractions(){
        const list = root();
        if(!list || typeof list.querySelectorAll !== "function") return;

        list.querySelectorAll(".watchlist-action").forEach(button=>{
            if(button.dataset && button.dataset.vueBound === "1") return;
            if(button.dataset) button.dataset.vueBound = "1";

            button.addEventListener("click",async function(event){
                event.stopPropagation();
                if(this.disabled) return;

                const card = typeof this.closest === "function" ? this.closest(".watchlist-card") : null;
                const showId = String(card && card.dataset ? card.dataset.showId || "" : "");
                const action = String(this.dataset ? this.dataset.watchlistAction || "" : "");
                if(!showId || !action) return;

                this.disabled = true;
                try{
                    if(action === "mark"){
                        if(typeof global.playCheckSuccessAnimation === "function"){
                            await global.playCheckSuccessAnimation(this);
                        }
                        if(typeof global.markNextEpisode === "function"){
                            await global.markNextEpisode(showId);
                        }
                    }else if(typeof global.updateShowStatus === "function"){
                        await global.updateShowStatus(showId,"watching");
                    }
                }finally{
                    if(this.isConnected) this.disabled = false;
                }
            });
        });
    }

    async function handoffCurrentHTML(){
        const list = root();
        const shared = global.TVTrackerUpcomingNotificationsVueBridge;
        if(!list || !shared || typeof shared.renderShowListHTML !== "function") return false;

        const html = String(list.innerHTML || "");
        const rendered = await shared.renderShowListHTML(html);
        if(rendered){
            attachWatchlistInteractions();
        }
        return rendered === true;
    }

    async function renderWatchlist(){
        if(typeof legacyRenderWatchlist !== "function") return false;
        legacyRenderWatchlist();
        return handoffCurrentHTML();
    }

    async function refreshWatchlistShows(){
        return renderWatchlist();
    }

    const bridge = Object.freeze({
        renderWatchlist,
        refreshWatchlistShows,
        handoffCurrentHTML,
        ownership:"vue-dom"
    });

    global.TVTrackerTrackerListsVueBridge = bridge;
    global.renderWatchlist = renderWatchlist;
    global.refreshWatchlistShows = refreshWatchlistShows;
})(window);
