(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    const notificationServices = global.TVTrackerNotifications || null;
    let vueOwner = null;
    let trackerListsVueOwner = null;
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

    function staticAsset(metaName,fallback){
        const meta = global.document && typeof global.document.querySelector === "function"
            ? global.document.querySelector('meta[name="' + metaName + '"]')
            : null;
        return meta && meta.content ? String(meta.content) : fallback;
    }

    function imageURL(path,size="w780"){
        const value = String(path || "").trim();
        if(!value) return "";
        if(typeof global.trackerImageURL === "function") return String(global.trackerImageURL(value,size) || "");
        if(/^https?:\/\//i.test(value)) return value;
        return "https://image.tmdb.org/t/p/" + String(size || "w780") + (value.startsWith("/") ? value : "/" + value);
    }

    function episodeRoute(show,episode){
        if(typeof global.getEpisodeDetailRoute === "function"){
            return String(global.getEpisodeDetailRoute(show.tmdb_id,episode.season_number,episode.episode_number) || "/app/list/watching");
        }
        return "/app/list/watching";
    }

    function episodeLabel(episode){
        return "S" + Number(episode.season_number || 0) + "E" + String(Number(episode.episode_number || 0)).padStart(2,"0") + " — " + String(episode.name || "Untitled Episode");
    }

    function getUpcomingBatchKey(show,episode){
        return [
            String(show.tmdb_id),
            String(episode.season_number),
            String(episode.air_date || ""),
            String(episode.type || "")
        ].join("-");
    }

    function prepareUpcomingDisplayItems(groupItems){
        const displayItems = [];
        const used = new Set();

        groupItems.forEach((item,index)=>{
            if(used.has(index)) return;

            const show = item.show;
            const episode = item.episode;
            if(episode.type === "future"){
                const batchIndexes = groupItems
                .map((candidate,candidateIndex)=>({candidate,candidateIndex}))
                .filter(entry=>{
                    const other = entry.candidate;
                    const otherEpisode = other.episode;
                    return (
                        otherEpisode.type === "future" &&
                        String(other.show.tmdb_id) === String(show.tmdb_id) &&
                        Number(otherEpisode.season_number) === Number(episode.season_number) &&
                        String(otherEpisode.air_date || "") === String(episode.air_date || "")
                    );
                });

                batchIndexes.forEach(entry=>used.add(entry.candidateIndex));
                const sortedBatch = batchIndexes
                .map(entry=>entry.candidate)
                .sort((a,b)=>Number(a.episode.episode_number) - Number(b.episode.episode_number));

                displayItems.push({
                    item:sortedBatch[0],
                    extraEpisodes:sortedBatch.slice(1).map(batchItem=>batchItem.episode),
                    isBatch:sortedBatch.length > 1,
                    batchKey:getUpcomingBatchKey(show,sortedBatch[0].episode)
                });
                return;
            }

            const sameBatchBehind = (item.behindEpisodes || [])
            .filter(extra=>(
                Number(extra.season_number) === Number(episode.season_number) &&
                String(extra.air_date || "") === String(episode.air_date || "")
            ))
            .sort((a,b)=>Number(a.episode_number) - Number(b.episode_number));

            used.add(index);
            displayItems.push({
                item,
                extraEpisodes:sameBatchBehind,
                isBatch:sameBatchBehind.length > 0,
                batchKey:getUpcomingBatchKey(show,episode)
            });
        });

        return displayItems;
    }

    function batchEpisodeModel(show,episode){
        const canLog = typeof global.isEpisodeAired === "function"
            ? !!global.isEpisodeAired(episode.air_date,episode,show)
            : false;
        const imagePath = episode.still_path || show.poster_path || "";
        return Object.freeze({
            key:String(show.tmdb_id) + ":" + String(episode.season_number) + ":" + String(episode.episode_number),
            showId:String(show.tmdb_id || ""),
            season:Number(episode.season_number || 0),
            episode:Number(episode.episode_number || 0),
            label:episodeLabel(episode),
            timeLabel:typeof global.getUpcomingTimeLabel === "function" ? String(global.getUpcomingTimeLabel(episode.air_date,episode,show) || "") : "",
            route:episodeRoute(show,episode),
            imageUrl:imageURL(imagePath,"w780"),
            canLog
        });
    }

    function upcomingEpisodeModel(display){
        const item = display.item || {};
        const show = item.show || {};
        const episode = item.episode || {};
        const extraEpisodes = Array.isArray(display.extraEpisodes) ? display.extraEpisodes : [];
        const canLog = typeof global.isEpisodeLoggable === "function"
            ? !!global.isEpisodeLoggable(episode,show,episode.season_number)
            : false;
        const recentlyAvailable = typeof global.isRecentlyAvailableEpisode === "function"
            ? !!global.isRecentlyAvailableEpisode(episode,show)
            : false;
        const isNew = canLog && (
            item.isNew === true ||
            (typeof global.isNewUpcomingEpisode === "function" && global.isNewUpcomingEpisode(show,episode)) ||
            recentlyAvailable
        );
        const batchKey = display.isBatch ? String(display.batchKey || "") : "";
        const expanded = global.expandedUpcomingBatches && typeof global.expandedUpcomingBatches === "object"
            ? global.expandedUpcomingBatches
            : {};
        const batchOpen = !!(batchKey && expanded[batchKey]);
        const behindCount = Number(item.behindCount || 0);
        const behindText = !display.isBatch && behindCount > 0
            ? behindCount + " more episode" + (behindCount === 1 ? "" : "s") + " behind"
            : "";
        const imagePath = episode.still_path || show.poster_path || "";
        return Object.freeze({
            key:String(show.tmdb_id || "") + ":" + String(episode.season_number || 0) + ":" + String(episode.episode_number || 0),
            showId:String(show.tmdb_id || ""),
            season:Number(episode.season_number || 0),
            episode:Number(episode.episode_number || 0),
            showTitle:String(show.title || ""),
            episodeLabel:episodeLabel(episode),
            timeLabel:String(item.timeLabel || ""),
            route:episodeRoute(show,episode),
            imageUrl:imageURL(imagePath,"w780"),
            canLog,
            isNew:!!isNew,
            behindText,
            batchKey,
            batchOpen,
            extraEpisodes:Object.freeze(extraEpisodes.map(extra=>batchEpisodeModel(show,extra)))
        });
    }

    function buildUpcomingModel(startBackgroundRefresh=true){
        const upcoming = typeof global.getUpcomingShows === "function" ? global.getUpcomingShows() : [];
        const items = Array.isArray(upcoming) ? upcoming : [];
        const loading = items.length === 0 && (startBackgroundRefresh || global.isRefreshingUpcoming === true);
        const bellIcon = staticAsset("notification-bell-icon","/static/assets/icons/notification-bell.svg");
        if(items.length === 0){
            return Object.freeze({surface:"upcoming",state:loading ? "loading" : "empty",groups:Object.freeze([]),unread:false,bellIcon});
        }
        const groupOrder = ["Catch Up","Yesterday","Today","Tomorrow","This Week","This Month","Later"];
        let bellAssigned = false;
        const groups = [];
        groupOrder.forEach(name=>{
            const groupItems = items.filter(item=>item && item.group === name);
            if(!groupItems.length) return;
            const displays = prepareUpcomingDisplayItems(groupItems);
            const showNotificationBell = !bellAssigned;
            bellAssigned = true;
            groups.push(Object.freeze({
                name,
                showNotificationBell,
                items:Object.freeze((Array.isArray(displays) ? displays : []).map(upcomingEpisodeModel))
            }));
        });
        return Object.freeze({surface:"upcoming",state:"ready",groups:Object.freeze(groups),unread:false,bellIcon});
    }

    function notificationImageURL(path){
        const clean = String(path || "").trim();
        if(!clean) return "";
        if(/^https?:\/\//i.test(clean)) return clean;
        return "https://image.tmdb.org/t/p/w300" + (clean.startsWith("/") ? clean : "/" + clean);
    }

    function relativeTime(value){
        if(notificationServices && typeof notificationServices._relativeTime === "function"){
            return String(notificationServices._relativeTime(value) || "");
        }
        const time = Date.parse(value || "");
        if(!Number.isFinite(time)) return "";
        const seconds = Math.max(0,Math.floor((Date.now() - time) / 1000));
        if(seconds < 60) return "now";
        const minutes = Math.floor(seconds / 60);
        if(minutes < 60) return minutes + "m ago";
        const hours = Math.floor(minutes / 60);
        if(hours < 24) return hours + "h ago";
        const days = Math.floor(hours / 24);
        if(days < 7) return days + "d ago";
        const weeks = Math.floor(days / 7);
        if(weeks < 8) return weeks + "w ago";
        return Math.floor(days / 30) + "mo ago";
    }

    function buildNotificationsModel(state,items=[]){
        const source = Array.isArray(items) ? items : [];
        return Object.freeze({
            surface:"notifications",
            state,
            items:Object.freeze(source.map(item=>Object.freeze({
                id:String(item && item.id || ""),
                message:String(item && item.message || "Notification"),
                timeLabel:relativeTime(item && item.createdAt),
                route:String(item && item.route || (item && item.showId ? "/app/show/" + encodeURIComponent(String(item.showId)) : "/app/upcoming")),
                imageUrl:notificationImageURL(item && item.imagePath)
            }))),
            bellIcon:staticAsset("notification-bell-icon","/static/assets/icons/notification-bell.svg"),
            settingsIcon:staticAsset("notification-settings-icon","/static/assets/icons/notification-settings.svg")
        });
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
                if(!global.expandedUpcomingBatches || typeof global.expandedUpcomingBatches !== "object") global.expandedUpcomingBatches = {};
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
        }catch(error){ return false; }
    }

    function bindNotificationSwipe(row,link){
        if(!row || !link || !global.PointerEvent) return;
        let startX = 0, startY = 0, deltaX = 0, active = false, horizontal = false;
        row.addEventListener("pointerdown",event=>{
            if(event.pointerType === "mouse" || event.button !== 0) return;
            startX = event.clientX; startY = event.clientY; deltaX = 0; active = true; horizontal = false;
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
                    event.preventDefault(); event.stopPropagation(); void deleteNotificationRow(row);
                });
            }
            if(link) bindNotificationSwipe(row,link);
        });
    }

    function renderWithVue(surface,model){
        if(!vueOwner || !model) return false;
        if(vueOwner.render(model) !== true) return false;
        lastModels.set(surface,model);
        if(surface === "upcoming") attachUpcomingInteractions(); else attachNotificationInteractions();
        return true;
    }

    function buildWatchlistModel(){
        const stateBridge = global.TVTrackerTrackerListsStateBridge;
        if(!stateBridge || stateBridge.ownership !== "legacy-read-only" || typeof stateBridge.viewModel !== "function") return null;
        try{ return stateBridge.viewModel(); }catch(error){ return null; }
    }

    function renderWatchlistLoadFailure(){
        const root = rootFor("watchlist");
        if(!root) return;
        root.innerHTML = '<div class="empty-state" data-tvtracker-watchlist-vue-load-failed="true" role="alert"><h2>List unavailable</h2><p>Reload the page to try again.</p></div>';
    }

    async function performTrackerListAction(kind,showId,target){
        const id = String(showId || "").trim();
        if(!id) return;
        if(kind === "mark"){
            if(target && typeof global.playCheckSuccessAnimation === "function") await global.playCheckSuccessAnimation(target);
            if(typeof global.markNextEpisode === "function") await global.markNextEpisode(id);
            return;
        }
        if(kind === "watching" && typeof global.updateShowStatus === "function") await global.updateShowStatus(id,"watching");
    }

    const trackerListsActions = Object.freeze({perform:performTrackerListAction});

    function attachTrackerListsVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function") throw new TypeError("Invalid Tracker Lists Vue owner");
        trackerListsVueOwner = owner;
    }

    async function renderWatchlist(){
        if(typeof global.renderLibrarySearchControl === "function") global.renderLibrarySearchControl();
        const model = buildWatchlistModel();
        if(!model){ renderWatchlistLoadFailure(); return false; }
        if(!trackerListsVueOwner){
            const loaded = await loadVueOwner("watchlist");
            if(!loaded || !trackerListsVueOwner){ renderWatchlistLoadFailure(); return false; }
        }
        trackerListsVueOwner.render(model);
        const root = rootFor("watchlist");
        if(root && root.dataset) root.dataset.tvtrackerTrackerListsOwner = "vue-watchlist";
        return true;
    }

    async function refreshWatchlistShows(){ return renderWatchlist(); }

    async function renderUpcoming(startBackgroundRefresh=true){
        const model = buildUpcomingModel(startBackgroundRefresh);
        if(!vueOwner){
            const loaded = await loadVueOwner("upcoming");
            if(!loaded || !vueOwner){ reportLoadFailure("upcoming"); return; }
        }
        renderWithVue("upcoming",model);
        if(model.state === "loading"){
            if(startBackgroundRefresh && global.isRefreshingUpcoming !== true && typeof global.refreshUpcomingDataInBackground === "function"){
                void global.refreshUpcomingDataInBackground();
            }
            return;
        }
        if(startBackgroundRefresh && typeof global.refreshUpcomingDataInBackground === "function"){
            void global.refreshUpcomingDataInBackground();
        }
    }

    async function renderNotificationsPage(){
        if(!vueOwner){
            const loaded = await loadVueOwner("notifications");
            if(!loaded || !vueOwner){ reportLoadFailure("notifications"); return false; }
        }
        if(!renderWithVue("notifications",buildNotificationsModel("loading"))) return false;
        let model;
        try{
            await csrfRequest("/api/notifications/read-all",{method:"POST"});
            const root = global.document;
            if(root && typeof root.querySelectorAll === "function") root.querySelectorAll(".notification-unread-dot").forEach(dot=>{ dot.hidden = true; });
            const payload = await csrfRequest("/api/notifications");
            const items = Array.isArray(payload.notifications) ? payload.notifications : [];
            model = buildNotificationsModel(items.length ? "ready" : "empty",items);
        }catch(error){
            model = buildNotificationsModel("error");
        }
        return renderWithVue("notifications",model);
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
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function") throw new TypeError("Invalid Upcoming/Notifications Vue owner");
        vueOwner = owner;
        lastModels.forEach((model,surface)=>renderWithVue(surface,model));
    }

    global.TVTrackerUpcomingNotificationsVueBridge = Object.freeze({attachVueOwner,renderUpcoming,renderNotificationsPage,buildUpcomingModel,ownership:"vue-dom"});
    global.renderUpcoming = renderUpcoming;

    global.TVTrackerTrackerListsVueBridge = Object.freeze({
        attachVueOwner:attachTrackerListsVueOwner,
        renderWatchlist,
        refreshWatchlistShows,
        actions:trackerListsActions,
        ownership:"vue-dom"
    });
    global.renderWatchlist = renderWatchlist;
    global.refreshWatchlistShows = refreshWatchlistShows;

    if(notificationServices){
        global.TVTrackerNotifications = Object.assign({},notificationServices,{openNotificationsPage,renderNotificationsPage});
    }

    const currentPath = String(global.location && global.location.pathname || "");
    if(currentPath === "/app/upcoming" || currentPath === "/app/notifications"){
        void loadVueOwner(currentPath === "/app/upcoming" ? "upcoming" : "notifications");
    }
})(window);
