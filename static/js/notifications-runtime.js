/* TV Tracker Notifications — permanent consolidated browser owner. */
(function(global){
    "use strict";

    function staticAsset(metaName,fallback){
        const meta = document.querySelector(`meta[name="${metaName}"]`);
        return meta && meta.content ? String(meta.content) : fallback;
    }

    const BELL_ICON = staticAsset("notification-bell-icon","/static/assets/icons/notification-bell.svg");
    const SETTINGS_ICON = staticAsset("notification-settings-icon","/static/assets/icons/notification-settings.svg");
    const bellButtons = new Set();
    let notificationSettings = null;
    let statusPromise = null;
    let timezoneBootstrapAttempted = false;
    const LIVE_NOTIFICATION_POLL_MS = 30 * 1000;
    const LIVE_NOTIFICATION_TOAST_MS = 10 * 1000;
    const MAX_VISIBLE_NOTIFICATION_TOASTS = 3;
    const liveNotificationVersions = new Map();
    const liveToastQueue = [];
    const liveToastKeys = new Set();
    let liveNotificationLatestVersion = "";
    let liveNotificationBootstrapped = false;
    let liveNotificationPollTimer = null;
    let liveNotificationPollBusy = false;
    let visibleNotificationToasts = 0;

    function csrfToken(){
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    async function requestJSON(path,options={}){
        const method = String(options.method || "GET").toUpperCase();
        const headers = Object.assign({"Accept":"application/json"},options.headers || {});
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
            credentials:"same-origin",
            cache:"no-store",
            headers,
            body
        });
        let payload = {};
        try{
            payload = await response.json();
        }catch(error){
            payload = {};
        }
        if(!response.ok){
            const error = new Error(payload.error || "Notification request failed");
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function detectedTimezone(){
        try{
            return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim();
        }catch(error){
            return "";
        }
    }

    async function ensureTimezone(timezone,timezoneMode="automatic"){
        if(String(timezoneMode || "automatic") === "manual"){
            return timezone || "";
        }
        const detected = detectedTimezone();
        if(!detected){ return timezone || ""; }
        if(timezone === detected && timezoneBootstrapAttempted){ return detected; }
        timezoneBootstrapAttempted = true;
        try{
            const payload = await requestJSON("/api/notifications/settings",{
                method:"PATCH",
                body:{timezone:detected,timezoneMode:"automatic"}
            });
            notificationSettings = payload.settings || notificationSettings;
            return notificationSettings && notificationSettings.timezone || detected;
        }catch(error){
            console.warn("TV Tracker could not synchronize notification timezone",error);
            return timezone || "";
        }
    }

    document.addEventListener("visibilitychange",()=>{
        if(!document.hidden && notificationSettings){
            ensureTimezone(notificationSettings.timezone || "",notificationSettings.timezoneMode || "automatic");
        }
    });
    global.addEventListener && global.addEventListener("focus",()=>{
        if(notificationSettings){ ensureTimezone(notificationSettings.timezone || "",notificationSettings.timezoneMode || "automatic"); }
    });

    function setUnreadDot(button,unread){
        if(!button){ return; }
        const dot = button.querySelector(".notification-unread-dot");
        if(dot){
            dot.hidden = !unread;
        }
    }

    function updateBellDots(unread){
        bellButtons.forEach(button=>{
            if(button && button.isConnected){
                setUnreadDot(button,unread);
            }else{
                bellButtons.delete(button);
            }
        });
    }

    async function loadStatus(force=false){
        if(statusPromise && !force){
            return statusPromise;
        }
        statusPromise = requestJSON("/api/notifications/status")
        .then(async payload=>{
            await ensureTimezone(payload.timezone || "",payload.timezoneMode || "automatic");
            updateBellDots(payload.unread === true);
            return payload;
        })
        .catch(error=>{
            console.warn("TV Tracker notification status unavailable",error);
            return {unread:false,timezone:""};
        })
        .finally(()=>{
            statusPromise = null;
        });
        return statusPromise;
    }

    function createIconImage(src,label,className){
        const image = document.createElement("img");
        image.src = src;
        image.alt = "";
        image.setAttribute("aria-hidden","true");
        image.className = className || "";
        if(label){ image.dataset.iconLabel = label; }
        return image;
    }

    function createUpcomingBell(){
        const link = document.createElement("a");
        link.href = "/app/notifications";
        link.className = "upcoming-notification-bell";
        link.setAttribute("aria-label","Notifications");
        link.appendChild(createIconImage(BELL_ICON,"Notifications","notification-icon notification-icon--light"));
        const dot = document.createElement("span");
        dot.className = "notification-unread-dot";
        dot.hidden = true;
        dot.setAttribute("aria-hidden","true");
        link.appendChild(dot);
        bellButtons.add(link);
        loadStatus();
        return link;
    }

    function mountUpcomingBell(titleElement){
        if(!titleElement || titleElement.querySelector(".upcoming-notification-bell")){
            return false;
        }
        titleElement.classList.add("upcoming-group-title--notifications");
        const text = String(titleElement.textContent || "").trim();
        titleElement.textContent = "";
        const label = document.createElement("span");
        label.className = "upcoming-group-title-label";
        label.textContent = text;
        titleElement.appendChild(label);
        titleElement.appendChild(createUpcomingBell());
        return true;
    }

    function mountUpcomingBellFallback(container){
        if(!container || container.querySelector(".upcoming-notification-fallback")){
            return;
        }
        const row = document.createElement("div");
        row.className = "upcoming-group-title upcoming-group-title--notifications upcoming-notification-fallback";
        const label = document.createElement("span");
        label.className = "upcoming-group-title-label";
        label.textContent = "UPCOMING";
        row.appendChild(label);
        row.appendChild(createUpcomingBell());
        container.prepend(row);
    }

    function showStandalonePage(pageId,pageName){
        document.querySelectorAll(".page").forEach(page=>page.classList.remove("active-page"));
        const page = document.getElementById(pageId);
        if(page){ page.classList.add("active-page"); }
        if(typeof global.activePage !== "undefined"){
            global.activePage = pageName;
        }else if(typeof activePage !== "undefined"){
            activePage = pageName;
        }
        if(typeof global.activatePrimaryNavContext === "function"){
            global.activatePrimaryNavContext("shows");
        }else if(typeof global.setAppPrimaryNavActive === "function"){
            global.setAppPrimaryNavActive("shows");
        }
        if(typeof global.updateShellTitle === "function"){
            global.updateShellTitle();
        }
    }

    function relativeTime(value){
        const time = Date.parse(value || "");
        if(!Number.isFinite(time)){
            return "";
        }
        const seconds = Math.max(0,Math.floor((Date.now() - time) / 1000));
        if(seconds < 60){ return "now"; }
        const minutes = Math.floor(seconds / 60);
        if(minutes < 60){ return minutes + "m ago"; }
        const hours = Math.floor(minutes / 60);
        if(hours < 24){ return hours + "h ago"; }
        const days = Math.floor(hours / 24);
        if(days < 7){ return days + "d ago"; }
        const weeks = Math.floor(days / 7);
        if(weeks < 8){ return weeks + "w ago"; }
        const months = Math.floor(days / 30);
        return months + "mo ago";
    }

    function notificationImageURL(path){
        const clean = String(path || "").trim();
        if(!clean){ return ""; }
        if(/^https?:\/\//i.test(clean)){ return clean; }
        return "https://image.tmdb.org/t/p/w300" + (clean.startsWith("/") ? clean : "/" + clean);
    }

    async function deleteNotification(id,row){
        if(!id){ return false; }
        try{
            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)),{method:"DELETE"});
            if(row){
                row.classList.add("notification-row--removing");
                window.setTimeout(()=>row.remove(),180);
            }
            return true;
        }catch(error){
            console.error("TV Tracker could not delete notification",error);
            return false;
        }
    }

    function bindSwipeDelete(row,id,link){
        if(!row || !link || !global.PointerEvent){ return; }
        let startX = 0;
        let startY = 0;
        let deltaX = 0;
        let active = false;
        let horizontal = false;
        let pointerId = null;
        let suppressClickUntil = 0;

        link.addEventListener("click",event=>{
            if(Date.now() < suppressClickUntil){
                event.preventDefault();
                event.stopPropagation();
            }
        },true);

        row.addEventListener("pointerdown",event=>{
            if(event.pointerType === "mouse" || event.button !== 0){ return; }
            startX = event.clientX;
            startY = event.clientY;
            deltaX = 0;
            active = true;
            horizontal = false;
            pointerId = event.pointerId;
            row.classList.remove("notification-row--delete-ready");
        });
        row.addEventListener("pointermove",event=>{
            if(!active || (pointerId !== null && event.pointerId !== pointerId)){ return; }
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if(!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){
                horizontal = true;
                row.classList.add("notification-row--swiping");
                if(typeof row.setPointerCapture === "function"){
                    try{ row.setPointerCapture(event.pointerId); }catch(error){}
                }
            }
            if(!horizontal){ return; }
            deltaX = Math.min(0,Math.max(-120,dx));
            link.style.transform = "translateX(" + deltaX + "px)";
            row.classList.toggle("notification-row--delete-ready",deltaX <= -72);
        });
        const finish = async allowDelete=>{
            if(!active){ return; }
            active = false;
            pointerId = null;
            if(horizontal && Math.abs(deltaX) > 8){
                suppressClickUntil = Date.now() + 450;
            }
            const shouldDelete = !!allowDelete && horizontal && deltaX <= -72;
            row.classList.remove("notification-row--swiping");
            if(shouldDelete){
                link.style.transform = "translateX(-120px)";
                const deleted = await deleteNotification(id,row);
                if(!deleted && row.isConnected){
                    link.style.transform = "";
                    row.classList.remove("notification-row--delete-ready");
                }
                return;
            }
            link.style.transform = "";
            row.classList.remove("notification-row--delete-ready");
        };
        row.addEventListener("pointerup",()=>finish(true));
        row.addEventListener("pointercancel",()=>finish(false));
    }

    function createNotificationRow(item){
        const row = document.createElement("article");
        row.className = "notification-row";
        row.dataset.notificationId = String(item.id || "");

        const swipeReveal = document.createElement("div");
        swipeReveal.className = "notification-swipe-delete-reveal";
        swipeReveal.setAttribute("aria-hidden","true");

        const link = document.createElement("a");
        link.className = "notification-row-link";
        link.href = item.route || (item.showId ? "/app/show/" + encodeURIComponent(String(item.showId)) : "/app/upcoming");

        const iconWrap = document.createElement("span");
        iconWrap.className = "notification-row-icon";
        iconWrap.appendChild(createIconImage(BELL_ICON,"","notification-icon"));

        const copy = document.createElement("span");
        copy.className = "notification-row-copy";
        const message = document.createElement("span");
        message.className = "notification-row-message";
        message.textContent = String(item.message || "Notification");
        const time = document.createElement("span");
        time.className = "notification-row-time";
        time.textContent = relativeTime(item.createdAt);
        copy.appendChild(message);
        copy.appendChild(time);

        link.appendChild(iconWrap);
        link.appendChild(copy);

        const imageURL = notificationImageURL(item.imagePath);
        if(imageURL){
            const image = document.createElement("img");
            image.className = "notification-row-thumb";
            image.src = imageURL;
            image.alt = "";
            image.loading = "lazy";
            link.appendChild(image);
        }else{
            const placeholder = document.createElement("span");
            placeholder.className = "notification-row-thumb notification-row-thumb--empty";
            placeholder.setAttribute("aria-hidden","true");
            link.appendChild(placeholder);
        }

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "notification-row-delete";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label","Delete notification");
        deleteButton.addEventListener("click",event=>{
            event.preventDefault();
            event.stopPropagation();
            deleteNotification(item.id,row);
        });

        row.appendChild(swipeReveal);
        row.appendChild(link);
        row.appendChild(deleteButton);
        bindSwipeDelete(row,item.id,link);
        return row;
    }

    async function renderNotificationsPage(){
        const root = document.getElementById("notifications-content");
        if(!root){ return; }
        root.innerHTML = `
            <div class="notifications-shell">
                <header class="notifications-header">
                    <div class="notifications-title-row">
                        <a class="show-page-back-button notifications-back-button" href="/app/upcoming" aria-label="Back to Upcoming">
                            <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                        </a>
                        <h1 class="tw-font-league">Notifications</h1>
                    </div>
                    <a class="notifications-settings-link" href="/app/settings/notifications" aria-label="Notification settings">
                        <img src="${SETTINGS_ICON}" alt="" aria-hidden="true" class="notification-icon notification-icon--light">
                    </a>
                </header>
                <div class="notifications-list" id="notifications-list">
                    <div class="notifications-loading">Loading notifications…</div>
                </div>
            </div>
        `;

        updateBellDots(false);
        try{
            await requestJSON("/api/notifications/read-all",{method:"POST"});
            updateBellDots(false);
            const payload = await requestJSON("/api/notifications");
            const list = root.querySelector("#notifications-list");
            if(!list){ return; }
            list.innerHTML = "";
            const items = Array.isArray(payload.notifications) ? payload.notifications : [];
            if(!items.length){
                const empty = document.createElement("div");
                empty.className = "notifications-empty";
                empty.textContent = "No notifications yet.";
                list.appendChild(empty);
                return;
            }
            items.forEach(item=>list.appendChild(createNotificationRow(item)));
        }catch(error){
            const list = root.querySelector("#notifications-list");
            if(list){
                list.innerHTML = '<div class="notifications-empty">Notifications are temporarily unavailable.</div>';
            }
            console.error("TV Tracker notifications failed to load",error);
        }
    }

    function notificationVersion(item){
        if(!item || !item.id){ return ""; }
        return String(item.id) + ":" + String(item.createdAt || "");
    }

    function rememberNotificationVersions(items){
        (Array.isArray(items) ? items : []).forEach(item=>{
            if(item && item.id){
                liveNotificationVersions.set(String(item.id),String(item.createdAt || ""));
            }
        });
    }

    function latestVersionFromStatus(status){
        if(!status || !status.latestId){ return ""; }
        return String(status.latestId) + ":" + String(status.latestCreatedAt || "");
    }

    function isNotificationsPageActive(){
        const page = document.getElementById("notifications-page");
        return !!(page && page.classList.contains("active-page"));
    }

    async function markNotificationRead(id){
        if(!id){ return false; }
        try{
            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)) + "/read",{method:"POST"});
            await loadStatus(true);
            return true;
        }catch(error){
            console.warn("TV Tracker could not mark notification read",error);
            return false;
        }
    }

    function navigateToNotification(item){
        const route = item && item.route ? String(item.route) : "/app/upcoming";
        if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(route,false);
            if(typeof global.TVTrackerRouter.applyRoute === "function"){
                global.TVTrackerRouter.applyRoute();
            }
            return;
        }
        global.location.href = route;
    }

    function ensureNotificationToastStack(){
        let stack = document.getElementById("notification-live-toast-stack");
        if(stack){ return stack; }
        stack = document.createElement("div");
        stack.id = "notification-live-toast-stack";
        stack.className = "notification-live-toast-stack";
        stack.setAttribute("aria-live","polite");
        stack.setAttribute("aria-label","New notifications");
        document.body.appendChild(stack);
        return stack;
    }

    function pumpNotificationToastQueue(){
        while(visibleNotificationToasts < MAX_VISIBLE_NOTIFICATION_TOASTS && liveToastQueue.length){
            const item = liveToastQueue.shift();
            showNotificationToast(item);
        }
    }

    function enqueueNotificationToast(item){
        const key = notificationVersion(item);
        if(!key || liveToastKeys.has(key)){ return; }
        liveToastKeys.add(key);
        liveToastQueue.push(item);
        pumpNotificationToastQueue();
    }

    function showNotificationToast(item){
        const key = notificationVersion(item);
        const stack = ensureNotificationToastStack();
        const toast = document.createElement("article");
        toast.className = "notification-live-toast";
        toast.tabIndex = 0;
        toast.setAttribute("role","button");
        toast.setAttribute("aria-label",String(item.message || "Open notification"));

        const iconWrap = document.createElement("span");
        iconWrap.className = "notification-live-toast-icon";
        iconWrap.appendChild(createIconImage(BELL_ICON,"","notification-icon"));

        const message = document.createElement("span");
        message.className = "notification-live-toast-message";
        message.textContent = String(item.message || "Notification");

        toast.appendChild(iconWrap);
        toast.appendChild(message);

        const imageURL = notificationImageURL(item.imagePath);
        if(imageURL){
            const image = document.createElement("img");
            image.className = "notification-live-toast-thumb";
            image.src = imageURL;
            image.alt = "";
            image.loading = "lazy";
            toast.appendChild(image);
        }

        const close = document.createElement("button");
        close.type = "button";
        close.className = "notification-live-toast-close";
        close.setAttribute("aria-label","Dismiss notification");
        close.textContent = "×";
        toast.appendChild(close);

        let timer = null;
        let remaining = LIVE_NOTIFICATION_TOAST_MS;
        let timerStartedAt = 0;
        let dismissed = false;

        const removeToast = ()=>{
            if(dismissed){ return; }
            dismissed = true;
            if(timer){ window.clearTimeout(timer); }
            toast.classList.add("notification-live-toast--leaving");
            window.setTimeout(()=>{
                toast.remove();
                visibleNotificationToasts = Math.max(0,visibleNotificationToasts - 1);
                liveToastKeys.delete(key);
                pumpNotificationToastQueue();
            },180);
        };

        const startTimer = ()=>{
            if(dismissed || timer || remaining <= 0){ return; }
            timerStartedAt = Date.now();
            timer = window.setTimeout(()=>{
                timer = null;
                remaining = 0;
                removeToast();
            },remaining);
        };

        const pauseTimer = ()=>{
            if(!timer){ return; }
            window.clearTimeout(timer);
            timer = null;
            remaining = Math.max(0,remaining - (Date.now() - timerStartedAt));
        };

        close.addEventListener("click",event=>{
            event.preventDefault();
            event.stopPropagation();
            removeToast();
        });
        toast.addEventListener("mouseenter",pauseTimer);
        toast.addEventListener("mouseleave",startTimer);
        toast.addEventListener("focusin",pauseTimer);
        toast.addEventListener("focusout",startTimer);

        const openToast = async event=>{
            if(event && event.type === "keydown" && !["Enter"," "].includes(event.key)){ return; }
            if(event){ event.preventDefault(); }
            removeToast();
            await markNotificationRead(item.id);
            navigateToNotification(item);
        };
        toast.addEventListener("click",openToast);
        toast.addEventListener("keydown",openToast);

        visibleNotificationToasts += 1;
        stack.appendChild(toast);
        startTimer();
    }

    async function fetchNotificationItems(){
        const payload = await requestJSON("/api/notifications");
        return Array.isArray(payload.notifications) ? payload.notifications : [];
    }

    async function bootstrapLiveNotifications(){
        if(liveNotificationBootstrapped){ return; }
        try{
            const items = await fetchNotificationItems();
            rememberNotificationVersions(items);
            liveNotificationLatestVersion = items.length ? notificationVersion(items[0]) : "";
            liveNotificationBootstrapped = true;
            updateBellDots(items.some(item=>item && item.read === false));
        }catch(error){
            console.warn("TV Tracker live notification bootstrap unavailable",error);
        }
    }

    async function pollLiveNotifications(){
        if(document.hidden || liveNotificationPollBusy){ return; }
        liveNotificationPollBusy = true;
        try{
            if(!liveNotificationBootstrapped){
                await bootstrapLiveNotifications();
                return;
            }
            const status = await requestJSON("/api/notifications/status");
            await ensureTimezone(status.timezone || "");
            updateBellDots(status.unread === true);
            const latestVersion = latestVersionFromStatus(status);
            if(latestVersion === liveNotificationLatestVersion){ return; }

            const items = await fetchNotificationItems();
            const fresh = items.filter(item=>{
                if(!item || !item.id){ return false; }
                const id = String(item.id);
                return !liveNotificationVersions.has(id) || liveNotificationVersions.get(id) !== String(item.createdAt || "");
            });
            rememberNotificationVersions(items);
            liveNotificationLatestVersion = items.length ? notificationVersion(items[0]) : "";

            if(!fresh.length){ return; }
            if(isNotificationsPageActive()){
                await renderNotificationsPage();
                return;
            }

            fresh
            .filter(item=>item && item.read === false)
            .sort((a,b)=>Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""))
            .forEach(enqueueNotificationToast);
        }catch(error){
            console.warn("TV Tracker live notification check unavailable",error);
        }finally{
            liveNotificationPollBusy = false;
        }
    }

    function clearLiveNotificationPoll(){
        if(liveNotificationPollTimer){
            window.clearTimeout(liveNotificationPollTimer);
            liveNotificationPollTimer = null;
        }
    }

    function scheduleLiveNotificationPoll(delay=LIVE_NOTIFICATION_POLL_MS){
        clearLiveNotificationPoll();
        if(document.hidden){ return; }
        liveNotificationPollTimer = window.setTimeout(async()=>{
            liveNotificationPollTimer = null;
            await pollLiveNotifications();
            scheduleLiveNotificationPoll();
        },delay);
    }

    function startLiveNotifications(){
        const start = async()=>{
            await bootstrapLiveNotifications();
            scheduleLiveNotificationPoll();
        };
        if(document.readyState === "loading"){
            document.addEventListener("DOMContentLoaded",start,{once:true});
        }else{
            start();
        }
        document.addEventListener("visibilitychange",()=>{
            if(document.hidden){
                clearLiveNotificationPoll();
                return;
            }
            pollLiveNotifications().finally(()=>scheduleLiveNotificationPoll());
        });
    }

    function openNotificationsPage(options={}){
        if(!options.fromRoute && global.TVTrackerRouter){
            global.TVTrackerRouter.setPathRoute("/app/notifications",false);
            global.TVTrackerRouter.applyRoute();
            return;
        }
        showStandalonePage("notifications-page","notifications");
        renderNotificationsPage();
    }

    global.TVTrackerNotifications = {
        mountUpcomingBell,
        mountUpcomingBellFallback,
        refreshBellState:()=>loadStatus(true),
        openNotificationsPage,
        renderNotificationsPage,
        _relativeTime:relativeTime
    };

    startLiveNotifications();
})(window);

(function(global){
    "use strict";

    const DEVICE_KEY = "tv-tracker-push-device:v1";
    const CLIENT_KEY = "tv-tracker-push-client:v1";
    const PRESENCE_INTERVAL_MS = 25 * 1000;

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
        // The canonical Settings owner is installed by the runtime below.
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
            const polish = global.TVTrackerNotificationsRuntime;
            if(polish && typeof polish.adoptMainSettingsSurface === "function"){
                return polish.adoptMainSettingsSurface(...args);
            }
        },
        navigateToNotificationSettings:replace=>{
            const polish = global.TVTrackerNotificationsRuntime;
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

(function(global){
    "use strict";

    const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";
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

    const settingsRenderBusy = new WeakSet();
    function finalApi(){ return global.TVTrackerFinalNotifications || null; }

    function csrfToken(){
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    function feedback(message,options={}){
        if(global.TVTrackerFeedback && typeof global.TVTrackerFeedback.notify === "function"){
            return global.TVTrackerFeedback.notify(message,options);
        }
        if(typeof global.showToast === "function") return global.showToast(message,options);
        return null;
    }

    async function requestJSON(path,options={}){
        const method = String(options.method || "GET").toUpperCase();
        const headers = Object.assign({Accept:"application/json"},options.headers || {});
        if(method !== "GET" && method !== "HEAD") headers["X-CSRF-Token"] = csrfToken();
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

    function switchRow(key,label,checked,disabled,description,errorText=""){
        const row = document.createElement("label");
        row.className = "notification-setting-row" + (disabled ? " notification-setting-row--disabled" : "");
        row.dataset.settingRow = key;
        row.dataset.canonicalControl = "1";
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

    function masterEnabled(list){
        const master = list && list.querySelector('[data-notification-setting="enabled"]');
        return !(master && !master.checked);
    }

    function syncDisabledStates(list){
        if(!list) return;
        const enabled = masterEnabled(list);
        list.querySelectorAll("[data-setting-row]").forEach(row=>{
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
        const NotificationApi = typeof global.Notification !== "undefined" ? global.Notification : null;
        if(error && error.code === "PUSH_PERMISSION"){
            return NotificationApi && NotificationApi.permission === "denied"
                ? "Push notifications are blocked in your browser settings."
                : "Push permission wasn’t granted.";
        }
        const message = String(error && error.message || "").trim();
        if(/blocked|denied/i.test(message)) return "Push notifications are blocked in your browser settings.";
        if(/permission/i.test(message)) return "Push permission wasn’t granted.";
        if(/config|server key|VAPID|dependency|crypto|unavailable/i.test(message)) return "Push notifications are temporarily unavailable.";
        return "TV Tracker couldn’t enable Push on this device. Try again later.";
    }

    async function saveSetting(key,value,input,list){
        if(input) input.disabled = true;
        try{
            await requestJSON("/api/notifications/settings",{method:"PATCH",body:{[key]:value}});
        }catch(error){
            if(input) input.checked = !value;
            console.error("TV Tracker could not save notification setting",error);
            feedback("Couldn’t save your changes.",{severity:"error"});
        }finally{
            if(input && key === "enabled") input.disabled = false;
            syncDisabledStates(list);
        }
    }

    async function bindPushRow(row,state,list){
        const input = row.querySelector("input");
        const description = row.querySelector(".notification-setting-description");
        if(!input) return;
        row.dataset.intrinsicDisabled = state.disabled ? "1" : "0";
        let currentState = state;

        input.addEventListener("change",async()=>{
            const api = finalApi();
            const next = input.checked;
            input.disabled = true;
            setPushError(row,"");
            try{
                if(!api) throw new Error("Push unavailable");
                if(next){
                    await api.enablePush(currentState.publicKey,currentState.localSubscription || null);
                    currentState = await api.pushState({reconcile:false});
                    if(!currentState.checked) throw new Error("Push enable failed");
                    input.checked = true;
                    row.dataset.intrinsicDisabled = "0";
                    if(description) description.textContent = "Push is enabled on this device.";
                    feedback("Push notifications enabled",{severity:"success"});
                }else{
                    await api.disablePush();
                    currentState = await api.pushState({reconcile:false});
                    input.checked = false;
                    row.dataset.intrinsicDisabled = currentState.disabled ? "1" : "0";
                    if(description) description.textContent = "Enable alerts on this device.";
                    feedback("Push notifications disabled",{severity:"success"});
                }
            }catch(error){
                console.error("TV Tracker could not update push notifications",error);
                try{
                    if(finalApi()) currentState = await finalApi().pushState({reconcile:false});
                    input.checked = currentState && currentState.checked === true;
                    row.dataset.intrinsicDisabled = currentState && currentState.disabled ? "1" : "0";
                    if(description && currentState) description.textContent = currentState.description || "Enable alerts on this device.";
                }catch(refreshError){
                    input.checked = false;
                    row.dataset.intrinsicDisabled = "1";
                    if(description) description.textContent = "Push settings are temporarily unavailable.";
                }
                const friendly = pushErrorMessage(error);
                setPushError(row,friendly);
                feedback(friendly,{severity:"error"});
            }finally{
                syncDisabledStates(list);
            }
        });
    }

    function safePushState(state){
        if(!state){
            return {checked:false,disabled:true,description:"Push settings are temporarily unavailable.",publicKey:"",localSubscription:null,error:"Push notifications are temporarily unavailable."};
        }
        const clean = Object.assign({},state);
        if(clean.configured === false || clean.disabled === true){
            clean.error = clean.error ? pushErrorMessage({message:clean.error}) : "Push notifications are temporarily unavailable.";
        }else{
            clean.error = "";
        }
        return clean;
    }

    async function renderNotificationControls(list){
        if(!list || settingsRenderBusy.has(list)) return;
        settingsRenderBusy.add(list);
        list.innerHTML = '<div class="notifications-loading">Loading notification settings…</div>';
        try{
            const api = finalApi();
            if(api && typeof api.syncAutomaticTimezone === "function") await api.syncAutomaticTimezone();
            const [payload,pushResult] = await Promise.all([
                requestJSON("/api/notifications/settings"),
                (async()=>{ try{ return api ? safePushState(await api.pushState()) : safePushState(null); }catch(error){ console.warn("TV Tracker push status unavailable",error); return safePushState(null); } })()
            ]);
            if(!list.isConnected) return;
            const settings = payload.settings || {};
            const enabled = settings.enabled !== false;
            list.innerHTML = "";

            // Push is intentionally the first control in Account Settings.
            const pushRow = switchRow("pushNotifications","Push Notifications",pushResult.checked === true,pushResult.disabled === true || !enabled,pushResult.description || "Enable alerts on this device.",pushResult.error || "");
            pushRow.dataset.intrinsicDisabled = pushResult.disabled ? "1" : "0";
            list.appendChild(pushRow);

            const masterRow = switchRow("enabled","Notifications",enabled,false,"Turn all in-app notification families on or off.");
            list.appendChild(masterRow);
            BASE_SETTING_OPTIONS.forEach(([key,label,description])=>{
                list.appendChild(switchRow(key,label,settings[key] !== false,!enabled,description));
            });

            list.querySelectorAll('[data-notification-setting]:not([data-notification-setting="pushNotifications"])').forEach(input=>{
                input.addEventListener("change",()=>saveSetting(input.dataset.notificationSetting,input.checked,input,list));
            });
            await bindPushRow(pushRow,pushResult,list);
            syncDisabledStates(list);
        }catch(error){
            if(list.isConnected) list.innerHTML = '<div class="notifications-empty">Couldn’t load notification settings.</div>';
            console.error("TV Tracker notification settings failed to load",error);
            feedback("Couldn’t load notifications.",{severity:"error",actionLabel:"Retry",onAction:()=>renderNotificationControls(list)});
        }finally{
            settingsRenderBusy.delete(list);
        }
    }

    function openDedicatedSettingsPage(options={}){
        if(global.TVTrackerSettings && typeof global.TVTrackerSettings.open === "function"){
            global.TVTrackerSettings.open("notifications",{fromRoute:options.fromRoute === true,replaceRoute:options.replaceRoute === true});
            return;
        }
        if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(CANONICAL_SETTINGS_ROUTE,options.replaceRoute === true);
            if(typeof global.TVTrackerRouter.applyRoute === "function") global.TVTrackerRouter.applyRoute();
            return;
        }
        global.location.assign(CANONICAL_SETTINGS_ROUTE);
    }

    function renderDedicatedSettingsPage(){
        openDedicatedSettingsPage({fromRoute:true});
    }

    function ensureMainSettingsSection(){
        const list = document.getElementById("settings-v2-notification-list");
        return list ? list.closest(".settings-v2-section") : null;
    }

    function adoptMainSettingsSurface(){
        const list = document.getElementById("settings-v2-notification-list");
        if(!list) return false;
        if(!list.querySelector('[data-canonical-control="1"]')) renderNotificationControls(list);
        return true;
    }

    function installCanonicalNavigation(){
        // Temporary adapters: legacy entry points on TVTrackerNotifications now
        // delegate to the canonical Settings owner (TVTrackerNotificationsRuntime).
        // Remove together with these properties once nothing references them.
        if(global.TVTrackerNotifications){
            global.TVTrackerNotifications.openNotificationSettingsPage = openDedicatedSettingsPage;
            global.TVTrackerNotifications.renderNotificationSettingsPage = renderDedicatedSettingsPage;
        }
        document.querySelectorAll(".notifications-settings-link").forEach(link=>link.setAttribute("href",CANONICAL_SETTINGS_ROUTE));
        global.addEventListener("click",event=>{
            if(!event || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = event.target && event.target.closest ? event.target.closest(".notifications-settings-link") : null;
            if(!target) return;
            event.preventDefault();
            event.stopPropagation();
            openDedicatedSettingsPage({fromRoute:false});
        },true);
    }

    function boot(){ installCanonicalNavigation(); }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();

    global.TVTrackerNotificationsRuntime = Object.freeze({
        renderNotificationControls,
        renderDedicatedSettingsPage,
        openDedicatedSettingsPage,
        ensureMainSettingsSection,
        adoptMainSettingsSurface,
        pushErrorMessage
    });
})(window);
