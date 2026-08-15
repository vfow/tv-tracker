(function(global){
    "use strict";

    function staticAsset(metaName,fallback){
        const meta = document.querySelector(`meta[name="${metaName}"]`);
        return meta && meta.content ? String(meta.content) : fallback;
    }

    const BELL_ICON = staticAsset("notification-bell-icon","/static/assets/icons/notification-bell.svg");
    const SETTINGS_ICON = staticAsset("notification-settings-icon","/static/assets/icons/notification-settings.svg");
    const SETTINGS_OPTIONS = [
        ["newSeason","New Season","When a new season is added to a show."],
        ["seasonPremiereTomorrow","Season Premiere Tomorrow","When a show's new season begins tomorrow."],
        ["newEpisode","New Episode","When a new episode show becomes available."],
        ["returnsTomorrow","Returns Tomorrow","When a Watching show returns."],
        ["canceledEnded","Canceled / Ended","When a show is canceled or ended."],
        ["premiereDateUpdates","Premiere Date Updates","When a season premiere date is announced, changed, or delayed."]
    ];
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

    async function ensureTimezone(timezone){
        if(timezone || timezoneBootstrapAttempted){
            return timezone || "";
        }
        timezoneBootstrapAttempted = true;
        const detected = detectedTimezone();
        if(!detected){
            return "";
        }
        try{
            const payload = await requestJSON("/api/notifications/settings",{
                method:"PATCH",
                body:{timezone:detected,timezoneIfUnset:true}
            });
            notificationSettings = payload.settings || notificationSettings;
            return notificationSettings && notificationSettings.timezone || detected;
        }catch(error){
            console.warn("TV Tracker could not initialize notification timezone",error);
            return "";
        }
    }

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
            await ensureTimezone(payload.timezone || "");
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
                    <a class="notifications-settings-link" href="/app/notifications/settings" aria-label="Notification settings">
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

    async function loadSettings(){
        const payload = await requestJSON("/api/notifications/settings");
        notificationSettings = payload.settings || {};
        await ensureTimezone(notificationSettings.timezone || "");
        if(notificationSettings && !notificationSettings.timezone){
            const refreshed = await requestJSON("/api/notifications/settings");
            notificationSettings = refreshed.settings || notificationSettings;
        }
        return notificationSettings;
    }

    function switchMarkup(key,label,checked,disabled=false,description=""){
        return `
            <label class="notification-setting-row" data-setting-row="${key}">
                <span class="notification-setting-copy">
                    <strong>${label}</strong>
                    ${description ? '<span class="notification-setting-description">' + description + '</span>' : ""}
                </span>
                <span class="notification-switch">
                    <input type="checkbox" data-notification-setting="${key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                    <span class="notification-switch-track" aria-hidden="true"><span class="notification-switch-thumb"></span></span>
                </span>
            </label>
        `;
    }

    async function saveSetting(key,value){
        const payload = await requestJSON("/api/notifications/settings",{
            method:"PATCH",
            body:{[key]:value}
        });
        notificationSettings = payload.settings || notificationSettings;
        return notificationSettings;
    }

    function refreshSettingsDisabledState(root){
        if(!root || !notificationSettings){ return; }
        const enabled = notificationSettings.enabled !== false;
        root.querySelectorAll('[data-notification-setting]:not([data-notification-setting="enabled"])').forEach(input=>{
            input.disabled = !enabled;
        });
        root.querySelectorAll('[data-setting-row]:not([data-setting-row="enabled"])').forEach(row=>{
            row.classList.toggle("notification-setting-row--disabled",!enabled);
        });
    }

    async function renderNotificationSettingsPage(){
        const root = document.getElementById("notification-settings-content");
        if(!root){ return; }
        root.innerHTML = '<div class="notifications-shell"><div class="notifications-loading">Loading settings…</div></div>';
        try{
            const settings = await loadSettings();
            const familyRows = SETTINGS_OPTIONS.map(([key,label,description])=>{
                return switchMarkup(key,label,settings[key] !== false,settings.enabled === false,description);
            }).join("");
            root.innerHTML = `
                <div class="notifications-shell notification-settings-shell">
                    <header class="notifications-header notification-settings-header">
                        <div class="notifications-title-row">
                            <a class="show-page-back-button notifications-back-button" href="/app/notifications" aria-label="Back to Notifications">
                                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                            </a>
                            <h1 class="tw-font-league">Notification Settings</h1>
                        </div>
                    </header>
                    <section class="notification-settings-list" aria-label="Notification settings">
                        ${switchMarkup("enabled","Notifications",settings.enabled !== false,false)}
                        ${familyRows}
                    </section>
                </div>
            `;
            root.querySelectorAll("[data-notification-setting]").forEach(input=>{
                input.addEventListener("change",async()=>{
                    const key = input.dataset.notificationSetting;
                    const next = input.checked;
                    input.disabled = true;
                    try{
                        await saveSetting(key,next);
                        if(key === "enabled"){
                            refreshSettingsDisabledState(root);
                        }
                    }catch(error){
                        input.checked = !next;
                        console.error("TV Tracker could not save notification setting",error);
                    }finally{
                        if(key === "enabled" || (notificationSettings && notificationSettings.enabled !== false)){
                            input.disabled = false;
                        }
                    }
                });
            });
            refreshSettingsDisabledState(root);
        }catch(error){
            root.innerHTML = '<div class="notifications-shell"><div class="notifications-empty">Notification settings are temporarily unavailable.</div></div>';
            console.error("TV Tracker notification settings failed to load",error);
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

    function openNotificationSettingsPage(options={}){
        if(!options.fromRoute && global.TVTrackerRouter){
            global.TVTrackerRouter.setPathRoute("/app/notifications/settings",false);
            global.TVTrackerRouter.applyRoute();
            return;
        }
        showStandalonePage("notification-settings-page","notification-settings");
        renderNotificationSettingsPage();
    }

    global.TVTrackerNotifications = {
        mountUpcomingBell,
        mountUpcomingBellFallback,
        refreshBellState:()=>loadStatus(true),
        openNotificationsPage,
        openNotificationSettingsPage,
        renderNotificationsPage,
        renderNotificationSettingsPage,
        _relativeTime:relativeTime
    };

    startLiveNotifications();
})(window);
