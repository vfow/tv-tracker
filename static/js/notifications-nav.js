(function(global){
    "use strict";

    const HISTORY_SCOPE_KEY = "tv-tracker-notification-history-scope:v1";
    const POLL_MS = 30 * 1000;
    let syncPromise = null;
    let pollTimer = null;

    function notificationLink(){
        return global.document && typeof global.document.querySelector === "function"
            ? global.document.querySelector('.sidebar [data-page="notifications"]')
            : null;
    }

    function notificationDot(){
        const link = notificationLink();
        return link && typeof link.querySelector === "function"
            ? link.querySelector(".sidebar-notification-unread-dot")
            : null;
    }

    function setDotVisible(visible){
        const dot = notificationDot();
        if(dot){ dot.hidden = !visible; }
    }

    function setNotificationsActive(){
        if(!global.document || typeof global.document.querySelectorAll !== "function") return;
        global.document.querySelectorAll(".app-primary-nav [data-page]").forEach(link=>{
            const active = link && link.dataset && link.dataset.page === "notifications";
            if(link && link.classList && typeof link.classList.toggle === "function"){
                link.classList.toggle("active",active);
            }
            if(link && typeof link.setAttribute === "function" && typeof link.removeAttribute === "function"){
                if(active) link.setAttribute("aria-current","page");
                else link.removeAttribute("aria-current");
            }
        });
    }

    function notificationsOwnNav(requested){
        const clean = String(requested || "").trim().toLowerCase();
        const path = String(global.location && global.location.pathname || "");
        return clean === "notifications" || (
            clean === "shows" &&
            (String(global.activePage || "") === "notifications" || path === "/app/notifications")
        );
    }

    function installActiveNavBridge(){
        const originalSet = global.setAppPrimaryNavActive;
        if(typeof originalSet === "function" && originalSet.__tvtrackerNotificationsNav !== true){
            const wrappedSet = function(page){
                if(notificationsOwnNav(page)){
                    setNotificationsActive();
                    return;
                }
                return originalSet.apply(this,arguments);
            };
            wrappedSet.__tvtrackerNotificationsNav = true;
            global.setAppPrimaryNavActive = wrappedSet;
        }

        const originalActivate = global.activatePrimaryNavContext;
        if(typeof originalActivate === "function" && originalActivate.__tvtrackerNotificationsNav !== true){
            const wrappedActivate = function(page){
                if(notificationsOwnNav(page)){
                    setNotificationsActive();
                    return;
                }
                return originalActivate.apply(this,arguments);
            };
            wrappedActivate.__tvtrackerNotificationsNav = true;
            global.activatePrimaryNavContext = wrappedActivate;
        }else if(typeof originalActivate !== "function"){
            const activate = function(page){
                if(notificationsOwnNav(page)){
                    setNotificationsActive();
                    return;
                }
                if(typeof global.setAppPrimaryNavActive === "function"){
                    global.setAppPrimaryNavActive(page);
                }
            };
            activate.__tvtrackerNotificationsNav = true;
            global.activatePrimaryNavContext = activate;
        }
    }

    function storage(){
        try{
            if(!global.localStorage || typeof global.localStorage.getItem !== "function" || typeof global.localStorage.setItem !== "function") return null;
            return global.localStorage;
        }catch(error){ return null; }
    }

    function storedScope(){
        const target = storage();
        if(!target) return Object.freeze({mode:"all",latestId:0,latestCreatedAt:""});
        let raw = "";
        try{ raw = String(target.getItem(HISTORY_SCOPE_KEY) || ""); }
        catch(error){ return Object.freeze({mode:"all",latestId:0,latestCreatedAt:""}); }
        if(!raw) return null;
        try{
            const parsed = JSON.parse(raw);
            const latestId = Number(parsed && parsed.latestId || 0);
            const latestCreatedAt = String(parsed && parsed.latestCreatedAt || "");
            if(!Number.isFinite(latestId) || latestId < 0) return null;
            return Object.freeze({mode:"after",latestId,latestCreatedAt});
        }catch(error){ return null; }
    }

    function saveScope(scope){
        const target = storage();
        if(!target || !scope || scope.mode !== "after") return;
        try{
            target.setItem(HISTORY_SCOPE_KEY,JSON.stringify({
                latestId:Number(scope.latestId || 0),
                latestCreatedAt:String(scope.latestCreatedAt || "")
            }));
        }catch(error){}
    }

    async function requestJSON(path){
        const response = await global.fetch(path,{
            method:"GET",
            credentials:"same-origin",
            cache:"no-store",
            headers:{Accept:"application/json"}
        });
        if(!response.ok) throw new Error("notification nav request failed: " + response.status);
        try{ return await response.json(); }catch(error){ return {}; }
    }

    async function ensureScope(){
        const current = storedScope();
        if(current) return current;
        try{
            const status = await requestJSON("/api/notifications/status");
            const scope = Object.freeze({
                mode:"after",
                latestId:Math.max(0,Number(status && status.latestId || 0)),
                latestCreatedAt:String(status && status.latestCreatedAt || "")
            });
            saveScope(scope);
            return scope;
        }catch(error){
            return Object.freeze({mode:"all",latestId:0,latestCreatedAt:""});
        }
    }

    function isAfterScope(item,scope){
        if(!scope || scope.mode !== "after") return true;
        const itemId = Number(item && item.id || 0);
        const baselineId = Number(scope.latestId || 0);
        const itemTime = Date.parse(String(item && item.createdAt || ""));
        const baselineTime = Date.parse(String(scope.latestCreatedAt || ""));
        if(Number.isFinite(itemTime) && Number.isFinite(baselineTime) && itemTime !== baselineTime){
            return itemTime > baselineTime;
        }
        return itemId > baselineId;
    }

    function filterNotificationItems(items,scope){
        return (Array.isArray(items) ? items : []).filter(item=>isAfterScope(item,scope));
    }

    async function syncUnread(){
        if(typeof global.fetch !== "function") return false;
        if(syncPromise) return syncPromise;
        syncPromise = (async()=>{
            const scope = await ensureScope();
            const payload = await requestJSON("/api/notifications");
            const items = filterNotificationItems(payload.notifications,scope);
            const unread = items.some(item=>item && item.read === false);
            setDotVisible(unread);
            return unread;
        })().catch(error=>{
            if(global.console && typeof global.console.warn === "function"){
                global.console.warn("Notification sidebar state unavailable",error);
            }
            return false;
        }).finally(()=>{ syncPromise = null; });
        return syncPromise;
    }

    function schedulePoll(){
        if(pollTimer || typeof global.setInterval !== "function") return;
        pollTimer = global.setInterval(()=>{
            if(global.document && global.document.hidden) return;
            void syncUnread();
        },POLL_MS);
    }

    function bindLink(){
        const link = notificationLink();
        if(!link || link.dataset.notificationsNavBound === "1") return;
        link.dataset.notificationsNavBound = "1";
        link.addEventListener("click",event=>{
            if(!event || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            setDotVisible(false);
            if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
                global.TVTrackerRouter.setPathRoute("/app/notifications",false);
                if(typeof global.TVTrackerRouter.applyRoute === "function") global.TVTrackerRouter.applyRoute();
                setNotificationsActive();
                return;
            }
            if(global.location) global.location.href = "/app/notifications";
        });
    }

    function boot(){
        installActiveNavBridge();
        bindLink();
        if(String(global.location && global.location.pathname || "") === "/app/notifications"){
            setNotificationsActive();
        }
        void syncUnread();
        schedulePoll();
    }

    if(global.document && typeof global.document.addEventListener === "function"){
        global.document.addEventListener("visibilitychange",()=>{
            if(!global.document.hidden) void syncUnread();
        });
    }
    if(typeof global.addEventListener === "function"){
        global.addEventListener("focus",()=>{ void syncUnread(); });
    }

    global.TVTrackerNotificationsNav = Object.freeze({
        syncUnread,
        setNotificationsActive,
        filterNotificationItems,
        scopeKey:HISTORY_SCOPE_KEY
    });

    if(!global.document || global.document.readyState === "loading"){
        if(global.document && typeof global.document.addEventListener === "function"){
            global.document.addEventListener("DOMContentLoaded",boot,{once:true});
        }
    }else{
        boot();
    }
})(window);
