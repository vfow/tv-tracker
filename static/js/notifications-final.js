(function(global){
    "use strict";

    const DEVICE_KEY = "tv-tracker-push-device:v1";
    const CLIENT_KEY = "tv-tracker-push-client:v1";
    const PRESENCE_INTERVAL_MS = 25 * 1000;
    let mountBusy = false;
    let settingsObserver = null;
    let presenceTimer = null;
    let currentDeviceSubscribed = false;
    let pushRegistration = null;

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
        const response = await fetch(path,{
            method,
            headers,
            body,
            credentials:"same-origin",
            cache:"no-store",
            keepalive:options.keepalive === true
        });
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

    function stableId(storage,key,prefix){
        let value = "";
        try{ value = String(storage.getItem(key) || ""); }catch(error){}
        if(/^[A-Za-z0-9._:-]{8,160}$/.test(value)) return value;
        if(global.crypto && typeof global.crypto.randomUUID === "function"){
            value = prefix + global.crypto.randomUUID();
        }else{
            value = prefix + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        }
        try{ storage.setItem(key,value); }catch(error){}
        return value;
    }

    function deviceId(){ return stableId(localStorage,DEVICE_KEY,"device-"); }
    function clientId(){ return stableId(sessionStorage,CLIENT_KEY,"tab-"); }

    function notificationApi(){
        return typeof global.Notification !== "undefined" ? global.Notification : null;
    }

    function isIosLike(){
        const ua = String(navigator.userAgent || "");
        const platform = String(navigator.platform || "");
        return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
    }

    function isStandaloneDisplay(){
        const displayMode = !!(global.matchMedia && global.matchMedia("(display-mode: standalone)").matches);
        return displayMode || navigator.standalone === true;
    }

    function applicationServerKey(value){
        const padding = "=".repeat((4 - String(value || "").length % 4) % 4);
        const base64 = (String(value || "") + padding).replace(/-/g,"+").replace(/_/g,"/");
        const raw = global.atob(base64);
        return Uint8Array.from(Array.from(raw).map(char=>char.charCodeAt(0)));
    }

    async function serviceWorkerRegistration(){
        if(pushRegistration) return pushRegistration;
        if(!("serviceWorker" in navigator)) return null;
        pushRegistration = await navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"});
        return pushRegistration;
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

    function masterEnabled(){
        const master = document.querySelector('[data-notification-setting="enabled"]');
        return !(master && !master.checked);
    }

    function syncFinalDisabledStates(){
        const enabled = masterEnabled();
        document.querySelectorAll('[data-setting-row="movieReleased"] input,[data-setting-row="movieReleaseUpdates"] input').forEach(input=>{
            input.disabled = !enabled;
        });
        const push = document.querySelector('[data-setting-row="pushNotifications"]');
        if(push){
            const input = push.querySelector("input");
            const intrinsic = push.dataset.intrinsicDisabled === "1";
            if(input) input.disabled = !enabled || intrinsic;
            push.classList.toggle("notification-setting-row--disabled",!enabled || intrinsic);
        }
    }

    async function saveMovieSetting(key,value,input){
        input.disabled = true;
        try{
            await requestJSON("/api/notifications/settings",{method:"PATCH",body:{[key]:value}});
        }catch(error){
            input.checked = !value;
            console.error("TV Tracker could not save movie notification setting",error);
        }finally{
            syncFinalDisabledStates();
        }
    }

    async function browserSubscription(registration){
        if(!registration || !registration.pushManager) return null;
        try{ return await registration.pushManager.getSubscription(); }
        catch(error){ return null; }
    }

    async function pushState(){
        const NotificationApi = notificationApi();
        const hasServiceWorker = "serviceWorker" in navigator;

        if(isIosLike() && !isStandaloneDisplay() && hasServiceWorker){
            currentDeviceSubscribed = false;
            return {
                supported:true,
                installRequired:true,
                checked:false,
                disabled:true,
                description:"On iPhone/iPad, add TV Tracker to your Home Screen and open it there to enable Push.",
                publicKey:""
            };
        }

        const supported = !!NotificationApi && "PushManager" in global && hasServiceWorker;
        if(!supported){
            currentDeviceSubscribed = false;
            return {supported:false,checked:false,disabled:true,description:"Push notifications are not supported by this browser.",publicKey:""};
        }
        const config = await requestJSON("/api/push/config");
        if(!config.configured){
            currentDeviceSubscribed = false;
            return {supported:true,configured:false,checked:false,disabled:true,description:"Push is unavailable until the server push keys and dependency are configured.",publicKey:""};
        }
        const status = await requestJSON("/api/push/device?deviceId=" + encodeURIComponent(deviceId()));
        const permission = NotificationApi.permission;
        if(permission === "denied"){
            currentDeviceSubscribed = false;
            if(status.subscribed === true){
                requestJSON("/api/push/unsubscribe",{method:"POST",body:{deviceId:deviceId()}}).catch(()=>{});
            }
            return {supported:true,configured:true,checked:false,disabled:true,description:"Push blocked by this browser. Change the site permission to enable it.",publicKey:config.publicKey};
        }
        const registration = await serviceWorkerRegistration();
        const localSubscription = await browserSubscription(registration);
        const checked = status.subscribed === true && !!localSubscription;
        if(status.subscribed === true && !localSubscription){
            requestJSON("/api/push/unsubscribe",{method:"POST",body:{deviceId:deviceId()}}).catch(()=>{});
        }
        currentDeviceSubscribed = checked;
        return {
            supported:true,
            configured:true,
            checked,
            disabled:false,
            description:checked ? "Push is enabled on this device." : "Enable browser or phone alerts on this device.",
            publicKey:config.publicKey,
            permission
        };
    }

    async function enablePush(publicKey){
        const NotificationApi = notificationApi();
        if(!NotificationApi) throw new Error("Notifications are unavailable");
        if(NotificationApi.permission === "denied"){
            const error = new Error("Push blocked by this browser");
            error.code = "PUSH_PERMISSION";
            throw error;
        }

        // The settings row is mounted only after pushState() has registered the worker.
        // Calling subscribe() before any await keeps the subscription/permission request
        // directly attached to the user's toggle gesture (required by WebKit).
        const registration = pushRegistration;
        if(!registration || !registration.pushManager){
            throw new Error("Push setup is still loading. Try again.");
        }

        let subscription;
        try{
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly:true,
                applicationServerKey:applicationServerKey(publicKey)
            });
        }catch(error){
            if(NotificationApi.permission !== "granted"){
                const permissionError = new Error(NotificationApi.permission === "denied" ? "Push blocked by this browser" : "Push permission was not granted");
                permissionError.code = "PUSH_PERMISSION";
                throw permissionError;
            }
            throw error;
        }

        if(NotificationApi.permission !== "granted"){
            const error = new Error("Push permission was not granted");
            error.code = "PUSH_PERMISSION";
            throw error;
        }

        await requestJSON("/api/push/subscribe",{
            method:"POST",
            body:{deviceId:deviceId(),subscription:subscription.toJSON()}
        });
        currentDeviceSubscribed = true;
        startPresence();
    }

    async function disablePush(){
        const registration = await serviceWorkerRegistration();
        if(registration){
            const subscription = await browserSubscription(registration);
            if(subscription){
                try{ await subscription.unsubscribe(); }catch(error){}
            }
        }
        currentDeviceSubscribed = false;
        stopPresence(true);
        await requestJSON("/api/push/unsubscribe",{method:"POST",body:{deviceId:deviceId()}});
    }

    async function sendPresence(visible,keepalive=false){
        if(!currentDeviceSubscribed) return;
        try{
            await requestJSON("/api/push/presence",{
                method:"POST",
                body:{deviceId:deviceId(),clientId:clientId(),visible:visible === true},
                keepalive
            });
        }catch(error){
            if(!keepalive) console.warn("TV Tracker push presence update failed",error);
        }
    }

    function startPresence(){
        if(!currentDeviceSubscribed) return;
        if(presenceTimer) global.clearInterval(presenceTimer);
        sendPresence(!document.hidden);
        presenceTimer = global.setInterval(()=>sendPresence(!document.hidden),PRESENCE_INTERVAL_MS);
    }

    function stopPresence(markHidden=false){
        if(presenceTimer){
            global.clearInterval(presenceTimer);
            presenceTimer = null;
        }
        if(markHidden) sendPresence(false,true);
    }

    async function bindPushRow(row,state){
        const input = row.querySelector("input");
        const description = row.querySelector(".notification-setting-description");
        if(!input) return;
        row.dataset.intrinsicDisabled = state.disabled ? "1" : "0";
        input.addEventListener("change",async()=>{
            const next = input.checked;
            input.disabled = true;
            try{
                if(next){
                    await enablePush(state.publicKey);
                    row.dataset.intrinsicDisabled = "0";
                    if(description) description.textContent = "Push is enabled on this device.";
                }else{
                    await disablePush();
                    if(description) description.textContent = "Enable browser or phone alerts on this device.";
                }
            }catch(error){
                input.checked = !next;
                const NotificationApi = notificationApi();
                if(error && error.code === "PUSH_PERMISSION" && NotificationApi && NotificationApi.permission === "denied"){
                    row.dataset.intrinsicDisabled = "1";
                    input.disabled = true;
                    if(description) description.textContent = "Push blocked by this browser. Change the site permission to enable it.";
                }else{
                    console.error("TV Tracker could not update push notifications",error);
                }
            }finally{
                syncFinalDisabledStates();
            }
        });
    }

    async function mountFinalSettings(){
        if(mountBusy) return;
        const list = document.querySelector("#notification-settings-content .notification-settings-list");
        if(!list || list.querySelector('[data-setting-row="movieReleased"]')) return;
        mountBusy = true;
        try{
            const payload = await requestJSON("/api/notifications/settings");
            const settings = payload.settings || {};
            const enabled = settings.enabled !== false;
            const movieReleased = switchRow(
                "movieReleased","Movie Released",settings.movieReleased !== false,!enabled,
                "When a Plan to Watch movie reaches its first meaningful release in your selected region."
            );
            const movieUpdates = switchRow(
                "movieReleaseUpdates","Movie Release Updates",settings.movieReleaseUpdates !== false,!enabled,
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
            const pushRow = switchRow("pushNotifications","Push Notifications",state.checked,state.disabled || !enabled,state.description);
            pushRow.dataset.intrinsicDisabled = state.disabled ? "1" : "0";
            list.appendChild(pushRow);
            await bindPushRow(pushRow,state);
            syncFinalDisabledStates();
        }finally{
            mountBusy = false;
        }
    }

    function observeSettings(){
        const root = document.getElementById("notification-settings-content");
        if(!root || settingsObserver) return;
        settingsObserver = new MutationObserver(()=>{ mountFinalSettings(); syncFinalDisabledStates(); });
        settingsObserver.observe(root,{childList:true,subtree:true});
        mountFinalSettings();
        document.addEventListener("change",event=>{
            const input = event.target;
            if(input && input.matches && input.matches('[data-notification-setting="enabled"]')){
                global.setTimeout(syncFinalDisabledStates,0);
            }
        });
    }

    async function markPushClickRead(id){
        if(!Number.isInteger(id) || id <= 0) return false;
        try{
            const payload = await requestJSON("/api/notifications/" + encodeURIComponent(String(id)) + "/read",{method:"POST"});
            if(!payload || payload.ok !== true) return false;
            if(global.TVTrackerNotifications && typeof global.TVTrackerNotifications.refreshBellState === "function"){
                global.TVTrackerNotifications.refreshBellState();
            }
            return true;
        }catch(error){
            // A deleted notification is terminal: there is nothing left to mark read.
            if(error && error.status === 404) return true;
            console.warn("TV Tracker could not mark push notification read",error);
            return false;
        }
    }

    async function acknowledgePushClicks(ids){
        const clean = Array.from(new Set((Array.isArray(ids) ? ids : [])
            .map(value=>Number(value || 0))
            .filter(value=>Number.isInteger(value) && value > 0)));
        if(!clean.length || !("serviceWorker" in navigator)) return;
        try{
            const registration = await navigator.serviceWorker.ready;
            const worker = navigator.serviceWorker.controller || registration.active;
            if(worker) worker.postMessage({type:"tvtracker-ack-push-clicks",ids:clean});
        }catch(error){
            console.warn("TV Tracker could not acknowledge push notification clicks",error);
        }
    }

    function installServiceWorkerMessages(){
        if(!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.addEventListener("message",event=>{
            if(!event.data) return;
            if(event.data.type === "tvtracker-push-clicks"){
                const items = Array.isArray(event.data.items) ? event.data.items : [];
                Promise.all(items.map(async item=>{
                    const id = Number(item && item.id || 0);
                    const marked = await markPushClickRead(id);
                    return marked ? id : 0;
                })).then(ids=>acknowledgePushClicks(ids.filter(id=>id > 0))).catch(error=>{
                    console.warn("TV Tracker could not process pending push notification clicks",error);
                });
                return;
            }
        });
    }

    async function consumePendingPushClicks(){
        if(!("serviceWorker" in navigator)) return;
        try{
            const registration = await navigator.serviceWorker.ready;
            const worker = navigator.serviceWorker.controller || registration.active;
            if(worker) worker.postMessage({type:"tvtracker-consume-push-clicks"});
        }catch(error){
            console.warn("TV Tracker could not consume pending push clicks",error);
        }
    }

    async function detectExistingSubscription(){
        const NotificationApi = notificationApi();
        if(!NotificationApi || !("serviceWorker" in navigator) || !("PushManager" in global)) return;
        try{
            const status = await requestJSON("/api/push/device?deviceId=" + encodeURIComponent(deviceId()));
            const registration = await serviceWorkerRegistration();
            const localSubscription = await browserSubscription(registration);
            currentDeviceSubscribed = status.subscribed === true && !!localSubscription && NotificationApi.permission === "granted";
            if(currentDeviceSubscribed) startPresence();
        }catch(error){
            currentDeviceSubscribed = false;
        }
    }

    async function boot(){
        observeSettings();
        installServiceWorkerMessages();
        try{ await serviceWorkerRegistration(); }catch(error){ console.warn("TV Tracker service worker unavailable",error); }
        await detectExistingSubscription();
        await consumePendingPushClicks();
    }

    document.addEventListener("visibilitychange",()=>{
        if(currentDeviceSubscribed) sendPresence(!document.hidden);
    });
    global.addEventListener("focus",()=>{
        if(currentDeviceSubscribed) sendPresence(true);
    });
    global.addEventListener("pagehide",()=>{
        if(currentDeviceSubscribed) sendPresence(false,true);
    });

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
    else boot();

    global.TVTrackerFinalNotifications = Object.freeze({
        deviceId,
        clientId,
        mountFinalSettings,
        enablePush,
        disablePush,
        consumePendingPushClicks
    });
})(window);
