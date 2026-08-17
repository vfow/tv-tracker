(function(global){
    "use strict";

    const DEVICE_KEY = "tv-tracker-push-device:v1";
    const CLIENT_KEY = "tv-tracker-push-client:v1";
    const PRESENCE_INTERVAL_MS = 25 * 1000;
    const SETTINGS_ROUTE = "/app/settings";
    const SETTINGS_HASH = "#notifications";
    const BASE_SETTING_OPTIONS = [
        ["newSeason","New Season","When a new season is added to a show."],
        ["seasonPremiereTomorrow","Season Premiere Tomorrow","When a show's new season begins tomorrow."],
        ["newEpisode","New Episode","When a new episode becomes available."],
        ["returnsTomorrow","Returns Tomorrow","When a Watching show returns."],
        ["canceledEnded","Canceled / Ended","When a show is canceled or ended."],
        ["premiereDateUpdates","Premiere Date Updates","When a season premiere date is announced, changed, or delayed."],
        ["movieReleased","Movie Released","When a movie you plan to watch is released."],
        ["movieReleaseUpdates","Movie Release Updates","When a movie you plan to watch gets a release date or the date changes."]
    ];

    let settingsObserver = null;
    let notificationLinksObserver = null;
    let settingsMountBusy = false;
    let settingsScrollPending = String(global.location && global.location.pathname || "") === SETTINGS_ROUTE &&
        String(global.location && global.location.hash || "") === SETTINGS_HASH;
    let presenceTimer = null;
    let currentDeviceSubscribed = false;
    let pushRegistration = null;
    let lastTimezoneSynced = "";
    let timezoneSyncPromise = null;

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

    function detectedTimezone(){
        try{
            return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim();
        }catch(error){
            return "";
        }
    }

    async function syncAutomaticTimezone(force=false){
        const timezone = detectedTimezone();
        if(!timezone) return "";
        if(!force && lastTimezoneSynced === timezone) return timezone;
        if(timezoneSyncPromise) return timezoneSyncPromise;
        timezoneSyncPromise = requestJSON("/api/notifications/settings",{
            method:"PATCH",
            body:{timezone,timezoneMode:"automatic"}
        }).then(payload=>{
            const settings = payload && payload.settings || {};
            lastTimezoneSynced = String(settings.timezone || timezone);
            return lastTimezoneSynced;
        }).catch(error=>{
            console.warn("TV Tracker could not synchronize notification timezone",error);
            return "";
        }).finally(()=>{
            timezoneSyncPromise = null;
        });
        return timezoneSyncPromise;
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
        const clean = String(value || "").trim();
        if(!clean) throw new Error("Push server key is missing.");
        const padding = "=".repeat((4 - clean.length % 4) % 4);
        const base64 = (clean + padding).replace(/-/g,"+").replace(/_/g,"/");
        const raw = global.atob(base64);
        const bytes = Uint8Array.from(Array.from(raw).map(char=>char.charCodeAt(0)));
        if(bytes.length !== 65 || bytes[0] !== 4){
            throw new Error("Push server key is invalid.");
        }
        return bytes;
    }

    function sameBytes(left,right){
        const a = new Uint8Array(left || []);
        const b = new Uint8Array(right || []);
        if(a.length !== b.length) return false;
        for(let index=0;index<a.length;index+=1){
            if(a[index] !== b[index]) return false;
        }
        return true;
    }

    function subscriptionMatchesPublicKey(subscription,publicKey){
        if(!subscription) return false;
        const options = subscription.options || {};
        if(!options.applicationServerKey) return true;
        try{
            return sameBytes(options.applicationServerKey,applicationServerKey(publicKey));
        }catch(error){
            return false;
        }
    }

    async function serviceWorkerRegistration(){
        if(pushRegistration) return pushRegistration;
        if(!("serviceWorker" in navigator)) return null;
        pushRegistration = await navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"});
        return pushRegistration;
    }

    async function browserSubscription(registration){
        if(!registration || !registration.pushManager) return null;
        try{ return await registration.pushManager.getSubscription(); }
        catch(error){ return null; }
    }

    async function serverSubscriptionStatus(){
        return requestJSON("/api/push/device?deviceId=" + encodeURIComponent(deviceId()));
    }

    async function registerSubscriptionWithServer(subscription){
        if(!subscription) throw new Error("Browser push subscription is unavailable.");
        const payload = typeof subscription.toJSON === "function" ? subscription.toJSON() : null;
        if(!payload || !payload.endpoint || !payload.keys){
            throw new Error("Browser push subscription is incomplete.");
        }
        return requestJSON("/api/push/subscribe",{
            method:"POST",
            body:{deviceId:deviceId(),subscription:payload}
        });
    }

    async function removeServerSubscription(){
        return requestJSON("/api/push/unsubscribe",{method:"POST",body:{deviceId:deviceId()}});
    }

    async function pushState(options={}){
        const reconcile = options.reconcile !== false;
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
                publicKey:"",
                localSubscription:null,
                error:""
            };
        }

        const supported = !!NotificationApi && "PushManager" in global && hasServiceWorker;
        if(!supported){
            currentDeviceSubscribed = false;
            return {supported:false,checked:false,disabled:true,description:"Push notifications are not supported by this browser.",publicKey:"",localSubscription:null,error:""};
        }

        const config = await requestJSON("/api/push/config");
        if(!config.configured){
            currentDeviceSubscribed = false;
            return {supported:true,configured:false,checked:false,disabled:true,description:"Push is temporarily unavailable.",publicKey:"",localSubscription:null,error:""};
        }

        let status = await serverSubscriptionStatus();
        const permission = NotificationApi.permission;
        const registration = await serviceWorkerRegistration();
        let localSubscription = await browserSubscription(registration);

        if(localSubscription && !subscriptionMatchesPublicKey(localSubscription,config.publicKey)){
            try{ await localSubscription.unsubscribe(); }catch(error){}
            localSubscription = null;
            if(status.subscribed === true){
                try{ await removeServerSubscription(); }catch(error){}
                status = {subscribed:false};
            }
        }

        if(permission === "denied"){
            currentDeviceSubscribed = false;
            if(status.subscribed === true){
                removeServerSubscription().catch(()=>{});
            }
            return {
                supported:true,
                configured:true,
                checked:false,
                disabled:true,
                description:"Push blocked by this browser. Change the site permission to enable it.",
                publicKey:config.publicKey,
                localSubscription,
                error:""
            };
        }

        let reconcileError = "";
        if(localSubscription && status.subscribed !== true && reconcile){
            try{
                await registerSubscriptionWithServer(localSubscription);
                status = await serverSubscriptionStatus();
            }catch(error){
                reconcileError = "Browser permission is allowed, but TV Tracker couldn't finish enabling Push. Try again.";
                console.warn("TV Tracker could not reconcile the browser push subscription",error);
            }
        }

        if(status.subscribed === true && !localSubscription){
            try{ await removeServerSubscription(); }catch(error){}
            status = {subscribed:false};
        }

        const checked = status.subscribed === true && !!localSubscription;
        currentDeviceSubscribed = checked;
        if(checked) startPresence();
        else stopPresence(false);

        return {
            supported:true,
            configured:true,
            checked,
            disabled:false,
            description:checked ? "Push is enabled on this device." : "Enable alerts on this device.",
            publicKey:config.publicKey,
            localSubscription,
            permission,
            error:reconcileError
        };
    }

    async function enablePush(publicKey,existingSubscription=null){
        const NotificationApi = notificationApi();
        if(!NotificationApi) throw new Error("Notifications are unavailable.");
        if(NotificationApi.permission === "denied"){
            const error = new Error("Push blocked by this browser.");
            error.code = "PUSH_PERMISSION";
            throw error;
        }

        // If no compatible subscription already exists, subscribe() is the first awaited
        // operation so WebKit keeps the permission request attached to the user's gesture.
        const registration = pushRegistration;
        if(!registration || !registration.pushManager){
            throw new Error("Push setup is still loading. Try again.");
        }

        let subscription = existingSubscription;
        if(!subscription){
            try{
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly:true,
                    applicationServerKey:applicationServerKey(publicKey)
                });
            }catch(error){
                if(NotificationApi.permission === "denied"){
                    const permissionError = new Error("Push blocked by this browser.");
                    permissionError.code = "PUSH_PERMISSION";
                    throw permissionError;
                }
                throw error;
            }
        }

        // A successfully-created PushSubscription is the source of truth here. Some
        // browsers can update Notification.permission slightly after subscribe() resolves.
        await registerSubscriptionWithServer(subscription);
        const status = await serverSubscriptionStatus();
        const verifiedLocal = await browserSubscription(registration);
        if(status.subscribed !== true || !verifiedLocal){
            throw new Error("TV Tracker couldn't verify Push on this device.");
        }

        currentDeviceSubscribed = true;
        startPresence();
        return verifiedLocal;
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
        await removeServerSubscription();
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

    function switchRow(key,label,checked,disabled,description,errorText=""){
        const row = document.createElement("label");
        row.className = "notification-setting-row" + (disabled ? " notification-setting-row--disabled" : "");
        row.dataset.settingRow = key;
        row.innerHTML = `
            <span class="notification-setting-copy">
                <strong>${label}</strong>
                <span class="notification-setting-description">${description}</span>
                ${key === "pushNotifications" ? `<span class="notification-setting-description warning-note" data-push-error role="status" ${errorText ? "" : "hidden"}>${errorText}</span>` : ""}
            </span>
            <span class="notification-switch">
                <input type="checkbox" data-notification-setting="${key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                <span class="notification-switch-track" aria-hidden="true"><span class="notification-switch-thumb"></span></span>
            </span>
        `;
        return row;
    }

    function settingsSection(){
        return document.getElementById("settings-notifications");
    }

    function masterEnabled(section=settingsSection()){
        const master = section && section.querySelector('[data-notification-setting="enabled"]');
        return !(master && !master.checked);
    }

    function syncSettingsDisabledStates(section=settingsSection()){
        if(!section) return;
        const enabled = masterEnabled(section);
        section.querySelectorAll("[data-setting-row]").forEach(row=>{
            const key = row.dataset.settingRow;
            if(key === "enabled") return;
            const input = row.querySelector("input");
            const intrinsic = key === "pushNotifications" && row.dataset.intrinsicDisabled === "1";
            const disabled = !enabled || intrinsic;
            if(input) input.disabled = disabled;
            row.classList.toggle("notification-setting-row--disabled",disabled);
        });
    }

    function setPushError(row,message){
        const error = row && row.querySelector("[data-push-error]");
        if(!error) return;
        error.textContent = String(message || "");
        error.hidden = !message;
    }

    function pushErrorMessage(error){
        const NotificationApi = notificationApi();
        if(error && error.code === "PUSH_PERMISSION"){
            return NotificationApi && NotificationApi.permission === "denied"
                ? "Push is blocked in your browser settings."
                : "Push permission wasn't granted.";
        }
        const message = String(error && error.message || "").trim();
        if(/server key/i.test(message)) return "Push configuration is invalid. Please try again later.";
        if(/verify Push/i.test(message)) return "TV Tracker couldn't finish enabling Push. Try again.";
        return "TV Tracker couldn't enable Push on this device. Try again.";
    }

    async function saveNotificationSetting(key,value,input,section){
        if(input) input.disabled = true;
        try{
            await requestJSON("/api/notifications/settings",{method:"PATCH",body:{[key]:value}});
        }catch(error){
            if(input) input.checked = !value;
            console.error("TV Tracker could not save notification setting",error);
        }finally{
            syncSettingsDisabledStates(section);
            if(input && key === "enabled") input.disabled = false;
        }
    }

    async function bindPushRow(row,state,section){
        const input = row.querySelector("input");
        const description = row.querySelector(".notification-setting-description");
        if(!input) return;
        let currentState = state;
        row.dataset.intrinsicDisabled = state.disabled ? "1" : "0";
        setPushError(row,state.error || "");

        input.addEventListener("change",async()=>{
            const next = input.checked;
            input.disabled = true;
            setPushError(row,"");
            try{
                if(next){
                    await enablePush(currentState.publicKey,currentState.localSubscription || null);
                    currentState = await pushState({reconcile:false});
                    if(!currentState.checked){
                        throw new Error("TV Tracker couldn't verify Push on this device.");
                    }
                    input.checked = true;
                    row.dataset.intrinsicDisabled = "0";
                    if(description) description.textContent = "Push is enabled on this device.";
                }else{
                    await disablePush();
                    currentState = await pushState({reconcile:false});
                    input.checked = false;
                    if(description) description.textContent = "Enable alerts on this device.";
                }
            }catch(error){
                console.error("TV Tracker could not update push notifications",error);
                try{
                    currentState = await pushState({reconcile:false});
                    input.checked = currentState.checked === true;
                    row.dataset.intrinsicDisabled = currentState.disabled ? "1" : "0";
                    if(description) description.textContent = currentState.description || "Enable alerts on this device.";
                }catch(refreshError){
                    input.checked = false;
                }
                setPushError(row,pushErrorMessage(error));
            }finally{
                syncSettingsDisabledStates(section);
            }
        });
    }

    function scrollToNotificationSettings(){
        const section = settingsSection();
        if(!section) return false;
        section.scrollIntoView({behavior:"smooth",block:"start"});
        settingsScrollPending = false;
        return true;
    }

    function markSettingsUrl(){
        try{
            history.replaceState({tvTrackerRoute:true},"",SETTINGS_ROUTE + SETTINGS_HASH);
        }catch(error){}
    }

    function navigateToNotificationSettings(replace=false){
        settingsScrollPending = true;
        if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(SETTINGS_ROUTE,replace);
            if(typeof global.TVTrackerRouter.applyRoute === "function"){
                global.TVTrackerRouter.applyRoute();
            }
            markSettingsUrl();
            global.setTimeout(()=>{
                mountSettingsNotifications();
                scrollToNotificationSettings();
            },0);
            return;
        }
        global.location.href = SETTINGS_ROUTE + SETTINGS_HASH;
    }

    function rewriteNotificationSettingsLinks(){
        document.querySelectorAll(".notifications-settings-link").forEach(link=>{
            link.setAttribute("href",SETTINGS_ROUTE + SETTINGS_HASH);
        });
    }

    async function mountSettingsNotifications(){
        if(settingsMountBusy) return;
        const root = document.getElementById("settings-content");
        if(!root || root.querySelector("#settings-notifications")){
            if(settingsScrollPending) scrollToNotificationSettings();
            return;
        }
        const profile = root.querySelector(".profile-settings-section");
        if(!profile) return;

        settingsMountBusy = true;
        const section = document.createElement("div");
        section.className = "settings-section notification-settings-section";
        section.id = "settings-notifications";
        section.innerHTML = `
            <div class="settings-section-header">
                <h2>NOTIFICATIONS</h2>
                <p>Choose which alerts TV Tracker can send you.</p>
            </div>
            <div class="notification-settings-list" aria-label="Notification settings">
                <div class="notifications-loading">Loading notification settings…</div>
            </div>
        `;
        profile.insertAdjacentElement("afterend",section);

        try{
            await syncAutomaticTimezone();
            const payload = await requestJSON("/api/notifications/settings");
            if(!section.isConnected) return;
            const settings = payload.settings || {};
            const enabled = settings.enabled !== false;
            const list = section.querySelector(".notification-settings-list");
            if(!list) return;
            list.innerHTML = "";

            const masterRow = switchRow("enabled","Notifications",enabled,false,"Turn all notifications on or off.");
            list.appendChild(masterRow);
            BASE_SETTING_OPTIONS.forEach(([key,label,description])=>{
                list.appendChild(switchRow(key,label,settings[key] !== false,!enabled,description));
            });

            let state;
            try{
                state = await pushState();
            }catch(error){
                state = {
                    checked:false,
                    disabled:true,
                    description:"Push settings are temporarily unavailable.",
                    publicKey:"",
                    localSubscription:null,
                    error:"Reload this page and try again."
                };
                console.warn("TV Tracker push status unavailable",error);
            }
            if(!section.isConnected) return;
            const pushRow = switchRow("pushNotifications","Push Notifications",state.checked,state.disabled || !enabled,state.description,state.error || "");
            pushRow.dataset.intrinsicDisabled = state.disabled ? "1" : "0";
            list.appendChild(pushRow);

            list.querySelectorAll('[data-notification-setting]:not([data-notification-setting="pushNotifications"])').forEach(input=>{
                input.addEventListener("change",()=>{
                    saveNotificationSetting(input.dataset.notificationSetting,input.checked,input,section);
                });
            });
            await bindPushRow(pushRow,state,section);
            syncSettingsDisabledStates(section);
            if(settingsScrollPending) scrollToNotificationSettings();
        }catch(error){
            if(section.isConnected){
                const list = section.querySelector(".notification-settings-list");
                if(list) list.innerHTML = '<div class="notifications-empty">Notification settings are temporarily unavailable.</div>';
            }
            console.error("TV Tracker settings notifications failed to load",error);
        }finally{
            settingsMountBusy = false;
            if(!settingsSection()) global.setTimeout(mountSettingsNotifications,0);
        }
    }

    function observeSettings(){
        const root = document.getElementById("settings-content");
        if(root && !settingsObserver){
            settingsObserver = new MutationObserver(()=>{
                mountSettingsNotifications();
                if(settingsScrollPending) scrollToNotificationSettings();
            });
            settingsObserver.observe(root,{childList:true,subtree:true});
        }
        mountSettingsNotifications();
    }

    function installNotificationSettingsNavigation(){
        rewriteNotificationSettingsLinks();
        const root = document.getElementById("notifications-content");
        if(root && !notificationLinksObserver){
            notificationLinksObserver = new MutationObserver(rewriteNotificationSettingsLinks);
            notificationLinksObserver.observe(root,{childList:true,subtree:true});
        }
        document.addEventListener("click",event=>{
            const target = event.target && event.target.closest ? event.target.closest(".notifications-settings-link") : null;
            if(!target) return;
            event.preventDefault();
            event.stopPropagation();
            navigateToNotificationSettings(false);
        },true);

        if(global.TVTrackerNotifications){
            global.TVTrackerNotifications.openNotificationSettingsPage = options=>{
                navigateToNotificationSettings(!!(options && options.fromRoute));
            };
        }

        if(String(global.location && global.location.pathname || "") === "/app/notifications/settings"){
            navigateToNotificationSettings(true);
        }
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
            const state = await pushState();
            currentDeviceSubscribed = state.checked === true;
            if(currentDeviceSubscribed) startPresence();
        }catch(error){
            currentDeviceSubscribed = false;
        }
    }

    async function boot(){
        // Settings UI and its navigation are owned by notifications-polish.js.
        installServiceWorkerMessages();
        syncAutomaticTimezone();
        try{ await serviceWorkerRegistration(); }catch(error){ console.warn("TV Tracker service worker unavailable",error); }
        await detectExistingSubscription();
        await consumePendingPushClicks();
    }

    document.addEventListener("visibilitychange",()=>{
        if(!document.hidden) syncAutomaticTimezone();
        if(currentDeviceSubscribed) sendPresence(!document.hidden);
    });
    global.addEventListener("focus",()=>{
        syncAutomaticTimezone();
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
        mountSettingsNotifications:(...args)=>{
            const polish = global.TVTrackerNotificationPolish;
            if(polish && typeof polish.adoptMainSettingsSurface === "function"){
                return polish.adoptMainSettingsSurface(...args);
            }
        },
        navigateToNotificationSettings:replace=>{
            const polish = global.TVTrackerNotificationPolish;
            if(polish && typeof polish.openDedicatedSettingsPage === "function"){
                return polish.openDedicatedSettingsPage({fromRoute:!!replace});
            }
        },
        pushState,
        enablePush,
        disablePush,
        syncAutomaticTimezone,
        consumePendingPushClicks
    });
})(window);
