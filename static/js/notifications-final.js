(function(global){
    "use strict";

    const DEVICE_KEY = "tv-tracker-push-device:v1";
    let mountBusy = false;
    let settingsObserver = null;

    function csrfToken(){
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    async function requestJSON(path,options={}){
        const method = String(options.method || "GET").toUpperCase();
        const headers = Object.assign({Accept:"application/json"},options.headers || {});
        if(method !== "GET" && method !== "HEAD"){
            headers["X-CSRF-Token"] = csrfToken();
        }
        let body = options.body;
        if(body && typeof body !== "string"){
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(body);
        }
        const response = await fetch(path,{method,headers,body,credentials:"same-origin",cache:"no-store"});
        let payload = {};
        try{ payload = await response.json(); }catch(error){ payload = {}; }
        if(!response.ok){
            const error = new Error(payload.error || "Request failed");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function deviceId(){
        let value = "";
        try{ value = String(localStorage.getItem(DEVICE_KEY) || ""); }catch(error){}
        if(/^[A-Za-z0-9._:-]{8,160}$/.test(value)){
            return value;
        }
        if(global.crypto && typeof global.crypto.randomUUID === "function"){
            value = "device-" + global.crypto.randomUUID();
        }else{
            value = "device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        }
        try{ localStorage.setItem(DEVICE_KEY,value); }catch(error){}
        return value;
    }

    function applicationServerKey(value){
        const padding = "=".repeat((4 - String(value || "").length % 4) % 4);
        const base64 = (String(value || "") + padding).replace(/-/g,"+").replace(/_/g,"/");
        const raw = global.atob(base64);
        return Uint8Array.from(Array.from(raw).map(char=>char.charCodeAt(0)));
    }

    async function serviceWorkerRegistration(){
        if(!("serviceWorker" in navigator)){
            return null;
        }
        return navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"});
    }

    function switchRow(key,label,checked,disabled,description){
        const row = document.createElement("label");
        row.className = "notification-setting-row" + (disabled ? " notification-setting-row--disabled" : "");
        row.dataset.settingRow = key;
        row.innerHTML = `
            <span class="notification-setting-copy">
                <strong>${label}</strong>
                <span class="notification-setting-description">${description}</span>
            </span>
            <span class="notification-switch">
                <input type="checkbox" data-notification-setting="${key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                <span class="notification-switch-track" aria-hidden="true"><span class="notification-switch-thumb"></span></span>
            </span>
        `;
        return row;
    }

    async function saveMovieSetting(key,value,input){
        input.disabled = true;
        try{
            await requestJSON("/api/notifications/settings",{method:"PATCH",body:{[key]:value}});
        }catch(error){
            input.checked = !value;
            console.error("TV Tracker could not save movie notification setting",error);
        }finally{
            const master = document.querySelector('[data-notification-setting="enabled"]');
            input.disabled = !!(master && !master.checked);
        }
    }

    async function pushState(){
        const supported = "Notification" in global && "PushManager" in global && "serviceWorker" in navigator;
        if(!supported){
            return {supported:false,checked:false,disabled:true,description:"Push notifications are not supported by this browser."};
        }
        const config = await requestJSON("/api/push/config");
        const permission = Notification.permission;
        if(!config.configured){
            return {supported:true,configured:false,checked:false,disabled:true,description:"Push is unavailable until the server push keys are configured.",publicKey:""};
        }
        const status = await requestJSON("/api/push/device?deviceId=" + encodeURIComponent(deviceId()));
        if(permission === "denied"){
            return {supported:true,configured:true,checked:false,disabled:true,description:"Push blocked by this browser. Change the site permission to enable it.",publicKey:config.publicKey};
        }
        return {
            supported:true,
            configured:true,
            checked:status.subscribed === true,
            disabled:false,
            description:status.subscribed === true ? "Push is enabled on this device." : "Enable browser or phone alerts on this device.",
            publicKey:config.publicKey,
            permission
        };
    }

    async function enablePush(publicKey){
        const registration = await serviceWorkerRegistration();
        if(!registration){ throw new Error("Service workers are unavailable"); }
        let permission = Notification.permission;
        if(permission === "default"){
            permission = await Notification.requestPermission();
        }
        if(permission !== "granted"){
            const error = new Error(permission === "denied" ? "Push blocked by this browser" : "Push permission was not granted");
            error.code = "PUSH_PERMISSION";
            throw error;
        }
        let subscription = await registration.pushManager.getSubscription();
        if(!subscription){
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly:true,
                applicationServerKey:applicationServerKey(publicKey)
            });
        }
        await requestJSON("/api/push/subscribe",{
            method:"POST",
            body:{deviceId:deviceId(),subscription:subscription.toJSON()}
        });
    }

    async function disablePush(){
        const registration = await serviceWorkerRegistration();
        if(registration){
            const subscription = await registration.pushManager.getSubscription();
            if(subscription){
                try{ await subscription.unsubscribe(); }catch(error){}
            }
        }
        await requestJSON("/api/push/unsubscribe",{method:"POST",body:{deviceId:deviceId()}});
    }

    async function bindPushRow(row,state){
        const input = row.querySelector("input");
        const description = row.querySelector(".notification-setting-description");
        if(!input){ return; }
        input.addEventListener("change",async()=>{
            const next = input.checked;
            input.disabled = true;
            try{
                if(next){
                    await enablePush(state.publicKey);
                    if(description){ description.textContent = "Push is enabled on this device."; }
                }else{
                    await disablePush();
                    if(description){ description.textContent = "Enable browser or phone alerts on this device."; }
                }
            }catch(error){
                input.checked = !next;
                if(error && error.code === "PUSH_PERMISSION" && Notification.permission === "denied"){
                    input.disabled = true;
                    if(description){ description.textContent = "Push blocked by this browser. Change the site permission to enable it."; }
                }else{
                    console.error("TV Tracker could not update push notifications",error);
                }
            }finally{
                const master = document.querySelector('[data-notification-setting="enabled"]');
                if(!(Notification.permission === "denied") && !(master && !master.checked)){
                    input.disabled = false;
                }
            }
        });
    }

    async function mountFinalSettings(){
        if(mountBusy){ return; }
        const list = document.querySelector("#notification-settings-content .notification-settings-list");
        if(!list || list.querySelector('[data-setting-row="movieReleased"]')){ return; }
        mountBusy = true;
        try{
            const payload = await requestJSON("/api/notifications/settings");
            const settings = payload.settings || {};
            const masterEnabled = settings.enabled !== false;
            const movieReleased = switchRow(
                "movieReleased",
                "Movie Released",
                settings.movieReleased !== false,
                !masterEnabled,
                "When a Plan to Watch movie reaches its first meaningful release in your selected region."
            );
            const movieUpdates = switchRow(
                "movieReleaseUpdates",
                "Movie Release Updates",
                settings.movieReleaseUpdates !== false,
                !masterEnabled,
                "When a Plan to Watch movie release is announced, moved earlier, delayed, or removed."
            );
            list.appendChild(movieReleased);
            list.appendChild(movieUpdates);
            movieReleased.querySelector("input").addEventListener("change",event=>saveMovieSetting("movieReleased",event.target.checked,event.target));
            movieUpdates.querySelector("input").addEventListener("change",event=>saveMovieSetting("movieReleaseUpdates",event.target.checked,event.target));

            let state;
            try{ state = await pushState(); }
            catch(error){
                state = {checked:false,disabled:true,description:"Push settings are temporarily unavailable.",publicKey:""};
                console.warn("TV Tracker push status unavailable",error);
            }
            const pushRow = switchRow("pushNotifications","Push Notifications",state.checked,state.disabled || !masterEnabled,state.description);
            list.appendChild(pushRow);
            await bindPushRow(pushRow,state);
        }finally{
            mountBusy = false;
        }
    }

    function observeSettings(){
        const root = document.getElementById("notification-settings-content");
        if(!root || settingsObserver){ return; }
        settingsObserver = new MutationObserver(()=>{ mountFinalSettings(); });
        settingsObserver.observe(root,{childList:true,subtree:true});
        mountFinalSettings();
    }

    async function consumePushDeepLink(){
        let url;
        try{ url = new URL(global.location.href); }catch(error){ return; }
        const raw = url.searchParams.get("pushNotification");
        const id = Number(raw || 0);
        if(!Number.isInteger(id) || id <= 0){ return; }
        try{
            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)) + "/read",{method:"POST"});
            if(global.TVTrackerNotifications && typeof global.TVTrackerNotifications.refreshBellState === "function"){
                global.TVTrackerNotifications.refreshBellState();
            }
        }catch(error){
            console.warn("TV Tracker could not mark push notification read",error);
        }
        url.searchParams.delete("pushNotification");
        global.history.replaceState(global.history.state,"",url.pathname + (url.search ? url.search : "") + url.hash);
    }

    function installServiceWorkerMessages(){
        if(!("serviceWorker" in navigator)){ return; }
        navigator.serviceWorker.addEventListener("message",event=>{
            if(!event.data || event.data.type !== "tvtracker-notification-refresh"){ return; }
            if(global.TVTrackerNotifications && typeof global.TVTrackerNotifications.refreshBellState === "function"){
                global.TVTrackerNotifications.refreshBellState();
            }
            document.dispatchEvent(new Event("visibilitychange"));
        });
    }

    async function boot(){
        observeSettings();
        installServiceWorkerMessages();
        consumePushDeepLink();
        try{ await serviceWorkerRegistration(); }catch(error){ console.warn("TV Tracker service worker unavailable",error); }
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded",boot,{once:true});
    }else{
        boot();
    }

    global.TVTrackerFinalNotifications = Object.freeze({
        deviceId,
        mountFinalSettings,
        enablePush,
        disablePush
    });
})(window);
