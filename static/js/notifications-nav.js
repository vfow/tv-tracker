(function(global){
    "use strict";

    const rawFetch = typeof global.fetch === "function" ? global.fetch.bind(global) : null;

    function notificationLink(){
        return global.document && typeof global.document.querySelector === "function"
            ? global.document.querySelector('.sidebar [data-page="notifications"]')
            : null;
    }

    function removeSidebarEntry(){
        const link = notificationLink();
        if(link && typeof link.remove === "function") link.remove();
    }

    function isEndedNotification(item){
        return String(item && item.type || "").trim().toLowerCase() === "ended";
    }

    function requestPath(input){
        const raw = typeof input === "string"
            ? input
            : (input && typeof input.url === "string" ? input.url : "");
        if(!raw) return "";
        if(raw.charAt(0) === "/") return raw.split("?")[0];
        if(typeof global.URL === "function"){
            try{
                const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
                return new global.URL(raw,base).pathname;
            }catch(error){}
        }
        return raw.split("?")[0];
    }

    function installEndedResponseFilter(){
        if(typeof global.fetch !== "function" || global.fetch.__tvtrackerEndedFilter === true) return;
        const previousFetch = global.fetch.bind(global);
        const wrappedFetch = async function(input,init){
            const response = await previousFetch(input,init);
            const method = String(init && init.method || (input && input.method) || "GET").toUpperCase();
            if(
                method !== "GET" ||
                requestPath(input) !== "/api/notifications" ||
                !response || !response.ok ||
                typeof response.clone !== "function" ||
                typeof Proxy !== "function"
            ){
                return response;
            }
            try{
                const payload = await response.clone().json();
                const source = Array.isArray(payload && payload.notifications) ? payload.notifications : [];
                const notifications = source.filter(item=>!isEndedNotification(item));
                if(notifications.length === source.length) return response;
                const filteredPayload = Object.assign({},payload,{notifications});
                return new Proxy(response,{
                    get(target,property){
                        if(property === "json") return async()=>filteredPayload;
                        const value = Reflect.get(target,property,target);
                        return typeof value === "function" ? value.bind(target) : value;
                    }
                });
            }catch(error){
                return response;
            }
        };
        wrappedFetch.__tvtrackerEndedFilter = true;
        global.fetch = wrappedFetch;
    }

    function csrfToken(){
        if(!global.document || typeof global.document.querySelector !== "function") return "";
        const meta = global.document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    async function requestRawJSON(path){
        if(!rawFetch) return {};
        const response = await rawFetch(path,{
            method:"GET",
            credentials:"same-origin",
            cache:"no-store",
            headers:{Accept:"application/json"}
        });
        if(!response.ok) throw new Error("notification cleanup request failed: " + response.status);
        try{ return await response.json(); }catch(error){ return {}; }
    }

    async function purgeEndedNotifications(){
        if(!rawFetch) return 0;
        const payload = await requestRawJSON("/api/notifications");
        const ended = (Array.isArray(payload.notifications) ? payload.notifications : [])
            .filter(isEndedNotification)
            .map(item=>Number(item && item.id || 0))
            .filter(id=>Number.isInteger(id) && id > 0);
        if(!ended.length) return 0;
        const token = csrfToken();
        const results = await Promise.all(ended.map(async id=>{
            const response = await rawFetch("/api/notifications/" + encodeURIComponent(String(id)),{
                method:"DELETE",
                credentials:"same-origin",
                cache:"no-store",
                headers:{Accept:"application/json","X-CSRF-Token":token}
            });
            return !!(response && response.ok);
        }));
        return results.filter(Boolean).length;
    }

    function setShowsNavActive(){
        if(!global.document || typeof global.document.querySelectorAll !== "function") return;
        global.document.querySelectorAll(".app-primary-nav [data-page]").forEach(link=>{
            const active = !!(link && link.dataset && link.dataset.page === "shows");
            if(link && link.classList && typeof link.classList.toggle === "function"){
                link.classList.toggle("active",active);
            }
            if(link && typeof link.setAttribute === "function" && typeof link.removeAttribute === "function"){
                if(active) link.setAttribute("aria-current","page");
                else link.removeAttribute("aria-current");
            }
        });
    }

    function revealNotificationsPage(){
        if(global.document && typeof global.document.querySelectorAll === "function"){
            global.document.querySelectorAll(".page").forEach(page=>{
                if(page && page.classList && typeof page.classList.remove === "function"){
                    page.classList.remove("active-page");
                }
            });
            const page = global.document.getElementById && global.document.getElementById("notifications-page");
            if(page && page.classList && typeof page.classList.add === "function"){
                page.classList.add("active-page");
            }
        }
        global.activePage = "notifications";
        setShowsNavActive();
        if(typeof global.updateShellTitle === "function") global.updateShellTitle();
    }

    function installInstantNotificationsRoute(){
        const services = global.TVTrackerNotifications;
        if(!services || typeof services.renderNotificationsPage !== "function") return;
        if(services.openNotificationsPage && services.openNotificationsPage.__tvtrackerInstantNotifications === true) return;

        const originalRender = services.renderNotificationsPage.bind(services);
        const instantRender = async function(){
            const page = global.document && global.document.getElementById
                ? global.document.getElementById("notifications-page")
                : null;
            const wasActive = !!(page && page.classList && page.classList.contains("active-page"));
            if(wasActive && page.classList && typeof page.classList.remove === "function"){
                page.classList.remove("active-page");
            }
            let result = false;
            try{
                result = await originalRender();
            }finally{
                if(wasActive && page && page.classList && typeof page.classList.add === "function"){
                    page.classList.add("active-page");
                }
            }
            return result;
        };

        const openNotificationsPage = async function(options={}){
            if(!options.fromRoute && global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
                global.TVTrackerRouter.setPathRoute("/app/notifications",false);
                if(typeof global.TVTrackerRouter.applyRoute === "function"){
                    return global.TVTrackerRouter.applyRoute();
                }
            }

            const result = await instantRender();
            revealNotificationsPage();
            return result;
        };
        openNotificationsPage.__tvtrackerInstantNotifications = true;

        services.renderNotificationsPage = instantRender;
        services.openNotificationsPage = openNotificationsPage;
    }

    function boot(){
        installEndedResponseFilter();
        removeSidebarEntry();
        installInstantNotificationsRoute();
        void purgeEndedNotifications().catch(error=>{
            if(global.console && typeof global.console.warn === "function"){
                global.console.warn("Notification cleanup unavailable",error);
            }
        });
    }

    if(!global.document || global.document.readyState === "loading"){
        if(global.document && typeof global.document.addEventListener === "function"){
            global.document.addEventListener("DOMContentLoaded",boot,{once:true});
        }
    }else{
        boot();
    }
})(window);
