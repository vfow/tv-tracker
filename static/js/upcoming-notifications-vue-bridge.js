(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    const legacyRenderUpcoming = typeof global.renderUpcoming === "function" ? global.renderUpcoming : null;
    const legacyRenderWatchlist = typeof global.renderWatchlist === "function" ? global.renderWatchlist : null;
    const legacyNotifications = global.TVTrackerNotifications || null;
    let vueOwner = null;
    let loadPromise = null;
    const lastModels = new Map();

    function rootFor(surface){
        if(!global.document || typeof global.document.getElementById !== "function") return null;
        return global.document.getElementById(surface === "upcoming" || surface === "watchlist" ? "show-list" : "notifications-content");
    }

    function reportLoadFailure(surface){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface,code:"vue_upcoming_notifications_load_failed"});
        }
    }

    function loadVueOwner(surface){
        if(vueOwner) return Promise.resolve(true);
        if(loadPromise) return loadPromise;
        if(typeof global.fetch !== "function") return Promise.resolve(false);
        loadPromise = global.fetch(manifestUrl,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}})
        .then(response=>{
            if(!response.ok) throw new Error("manifest request failed");
            return response.json();
        })
        .then(manifest=>{
            const entry = manifest && manifest["frontend/src/main.ts"];
            const file = entry && typeof entry.file === "string" ? entry.file : "";
            if(!/^assets\/[A-Za-z0-9_-]+\.js$/.test(file)) throw new Error("invalid Vue manifest entry");
            const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
            return import(new URL("/static/vue/" + file,base).href).then(()=>true);
        })
        .catch(()=>{
            reportLoadFailure(surface);
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function rememberModel(surface){
        const root = rootFor(surface);
        if(!root) return null;
        const model = Object.freeze({surface,html:String(root.innerHTML || "")});
        lastModels.set(surface,model);
        return model;
    }

    async function csrfRequest(path,options={}){
        const headers = Object.assign({Accept:"application/json"},options.headers || {});
        const method = String(options.method || "GET").toUpperCase();
        if(method !== "GET" && method !== "HEAD"){
            const meta = global.document && global.document.querySelector('meta[name="csrf-token"]');
            headers["X-CSRF-Token"] = meta ? String(meta.content || "") : "";
        }
        const response = await global.fetch(path,Object.assign({},options,{method,headers,credentials:"same-origin",cache:"no-store"}));
        if(!response.ok) throw new Error("request failed: " + response.status);
        try{ return await response.json(); }catch(error){ return {}; }
    }

    function syncUpcomingBell(){
        const root = rootFor("upcoming");
        if(!root || typeof global.fetch !== "function") return;
        void csrfRequest("/api/notifications/status")
        .then(payload=>{
            root.querySelectorAll(".notification-unread-dot").forEach(dot=>{ dot.hidden = payload.unread !== true; });
        })
        .catch(()=>{});
    }

    function attachUpcomingInteractions(){
        const root = rootFor("upcoming");
        if(!root) return;
        root.querySelectorAll(".upcoming-batch-button").forEach(button=>{
            if(button.dataset.vueBound === "1") return;
            button.dataset.vueBound = "1";
            button.addEventListener("click",event=>{
                event.stopPropagation();
                const key = button.dataset.batch || "";
                if(!key) return;
                if(!global.expandedUpcomingBatches || typeof global.expandedUpcomingBatches !== "object"){
                    global.expandedUpcomingBatches = {};
                }
                global.expandedUpcomingBatches[key] = !global.expandedUpcomingBatches[key];
                void renderUpcoming(false);
            });
        });
        root.querySelectorAll(".upcoming-check, .upcoming-batch-check").forEach(check=>{
            if(check.dataset.vueBound === "1") return;
            check.dataset.vueBound = "1";
            check.addEventListener("click",async event=>{
                event.stopPropagation();
                if(check.disabled) return;
                check.disabled = true;
                try{
                    if(typeof global.playCheckSuccessAnimation === "function") await global.playCheckSuccessAnimation(check);
                    if(typeof global.updateEpisodeWatched === "function"){
                        await global.updateEpisodeWatched(Number(check.dataset.show),Number(check.dataset.season),Number(check.dataset.episode),true);
                    }
                    await renderUpcoming(false);
                }finally{
                    if(check.isConnected) check.disabled = false;
                }
            });
        });
        syncUpcomingBell();
    }

    async function deleteNotificationRow(row){
        const id = row && row.dataset ? String(row.dataset.notificationId || "") : "";
        if(!id) return false;
        try{
            await csrfRequest("/api/notifications/" + encodeURIComponent(id),{method:"DELETE"});
            row.classList.add("notification-row--removing");
            global.setTimeout(()=>row.remove(),180);
            return true;
        }catch(error){
            return false;
        }
    }

    function bindNotificationSwipe(row,link){
        if(!row || !link || !global.PointerEvent) return;
        let startX = 0;
        let startY = 0;
        let deltaX = 0;
        let active = false;
        let horizontal = false;
        row.addEventListener("pointerdown",event=>{
            if(event.pointerType === "mouse" || event.button !== 0) return;
            startX = event.clientX;
            startY = event.clientY;
            deltaX = 0;
            active = true;
            horizontal = false;
        });
        row.addEventListener("pointermove",event=>{
            if(!active) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if(!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) horizontal = true;
            if(!horizontal) return;
            deltaX = Math.min(0,Math.max(-120,dx));
            link.style.transform = "translateX(" + deltaX + "px)";
            row.classList.toggle("notification-row--delete-ready",deltaX <= -72);
        });
        const finish = async allowDelete=>{
            if(!active) return;
            active = false;
            const shouldDelete = !!allowDelete && horizontal && deltaX <= -72;
            if(shouldDelete){
                link.style.transform = "translateX(-120px)";
                const deleted = await deleteNotificationRow(row);
                if(!deleted && row.isConnected) link.style.transform = "";
            }else{
                link.style.transform = "";
                row.classList.remove("notification-row--delete-ready");
            }
        };
        row.addEventListener("pointerup",()=>finish(true));
        row.addEventListener("pointercancel",()=>finish(false));
    }

    function attachNotificationInteractions(){
        const root = rootFor("notifications");
        if(!root) return;
        root.querySelectorAll(".notification-row").forEach(row=>{
            if(row.dataset.vueBound === "1") return;
            row.dataset.vueBound = "1";
            const link = row.querySelector(".notification-row-link");
            const deleteButton = row.querySelector(".notification-row-delete");
            if(deleteButton){
                deleteButton.addEventListener("click",event=>{
                    event.preventDefault();
                    event.stopPropagation();
                    void deleteNotificationRow(row);
                });
            }
            if(link) bindNotificationSwipe(row,link);
        });
    }

    function attachWatchlistInteractions(){
        const root = rootFor("watchlist");
        if(!root || typeof root.querySelectorAll !== "function") return;

        root.querySelectorAll(".watchlist-action").forEach(button=>{
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
                    }else if(action === "watching" && typeof global.updateShowStatus === "function"){
                        await global.updateShowStatus(showId,"watching");
                    }
                }finally{
                    if(this.isConnected) this.disabled = false;
                }
            });
        });
    }

    function renderWithVue(surface,model){
        if(!vueOwner || !model) return false;
        vueOwner.render(model);
        if(surface === "upcoming") attachUpcomingInteractions();
        else attachNotificationInteractions();
        return true;
    }

    async function renderShowListHTML(html){
        const model = Object.freeze({surface:"upcoming",html:String(html || "")});
        if(!vueOwner){
            const loaded = await loadVueOwner("watchlist");
            if(!loaded || !vueOwner) return false;
        }
        vueOwner.render(model);
        const root = rootFor("watchlist");
        if(root && root.dataset){
            root.dataset.tvtrackerTrackerListsOwner = "vue-watchlist";
        }
        if(root && typeof root.querySelector === "function"){
            const marker = root.querySelector('[data-tvtracker-upcoming-notifications-owner="vue-upcoming"]');
            if(marker){
                marker.removeAttribute("data-tvtracker-upcoming-notifications-owner");
                marker.setAttribute("data-tvtracker-tracker-lists-owner","vue-watchlist");
            }
        }
        return true;
    }

    async function renderWatchlist(){
        if(typeof legacyRenderWatchlist !== "function") return false;
        legacyRenderWatchlist();
        const root = rootFor("watchlist");
        if(!root) return false;
        const rendered = await renderShowListHTML(root.innerHTML || "");
        if(rendered) attachWatchlistInteractions();
        return rendered;
    }

    async function refreshWatchlistShows(){
        return renderWatchlist();
    }

    async function renderUpcoming(startBackgroundRefresh=true){
        if(typeof legacyRenderUpcoming !== "function") return;
        await legacyRenderUpcoming(startBackgroundRefresh);
        const model = rememberModel("upcoming");
        if(renderWithVue("upcoming",model)) return;
        void loadVueOwner("upcoming");
    }

    async function renderNotificationsPage(){
        if(!legacyNotifications || typeof legacyNotifications.renderNotificationsPage !== "function") return;
        await legacyNotifications.renderNotificationsPage();
        const model = rememberModel("notifications");
        if(renderWithVue("notifications",model)) return;
        void loadVueOwner("notifications");
    }

    function openNotificationsPage(){
        if(global.document){
            global.document.querySelectorAll(".page").forEach(page=>page.classList.remove("active-page"));
            const page = global.document.getElementById("notifications-page");
            if(page) page.classList.add("active-page");
        }
        global.activePage = "notifications";
        if(typeof global.activatePrimaryNavContext === "function") global.activatePrimaryNavContext("shows");
        else if(typeof global.setAppPrimaryNavActive === "function") global.setAppPrimaryNavActive("shows");
        if(typeof global.updateShellTitle === "function") global.updateShellTitle();
        return renderNotificationsPage();
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Upcoming/Notifications Vue owner");
        }
        vueOwner = owner;
        lastModels.forEach((model,surface)=>renderWithVue(surface,model));
    }

    const bridge = Object.freeze({
        attachVueOwner,
        renderUpcoming,
        renderNotificationsPage,
        renderShowListHTML,
        ownership:"vue-dom"
    });
    global.TVTrackerUpcomingNotificationsVueBridge = bridge;
    global.renderUpcoming = renderUpcoming;

    const trackerListsBridge = Object.freeze({
        renderWatchlist,
        refreshWatchlistShows,
        ownership:"vue-dom"
    });
    global.TVTrackerTrackerListsVueBridge = trackerListsBridge;
    global.renderWatchlist = renderWatchlist;
    global.refreshWatchlistShows = refreshWatchlistShows;

    if(legacyNotifications){
        global.TVTrackerNotifications = Object.assign({},legacyNotifications,{
            openNotificationsPage,
            renderNotificationsPage
        });
    }

    const currentPath = String(global.location && global.location.pathname || "");
    if(currentPath === "/app/upcoming" || currentPath === "/app/notifications"){
        void loadVueOwner(currentPath === "/app/upcoming" ? "upcoming" : "notifications");
    }
})(window);
