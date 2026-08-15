(function(global){
    "use strict";

    function staticAsset(metaName,fallback){
        const meta = document.querySelector(`meta[name="${metaName}"]`);
        return meta && meta.content ? String(meta.content) : fallback;
    }

    const BELL_ICON = staticAsset("notification-bell-icon","/static/assets/icons/notification-bell.svg");
    const SETTINGS_ICON = staticAsset("notification-settings-icon","/static/assets/icons/notification-settings.svg");
    const SETTINGS_LABELS = [
        ["newSeason","New Season"],
        ["seasonPremiereTomorrow","Season Premiere Tomorrow"],
        ["newEpisode","New Episode"],
        ["returnsTomorrow","Returns Tomorrow"],
        ["canceledEnded","Canceled / Ended"],
        ["premiereDateUpdates","Premiere Date Updates"]
    ];
    const bellButtons = new Set();
    let notificationSettings = null;
    let statusPromise = null;
    let timezoneBootstrapAttempted = false;

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
        if(!id){ return; }
        try{
            await requestJSON("/api/notifications/" + encodeURIComponent(String(id)),{method:"DELETE"});
            if(row){
                row.classList.add("notification-row--removing");
                window.setTimeout(()=>row.remove(),180);
            }
        }catch(error){
            console.error("TV Tracker could not delete notification",error);
        }
    }

    function bindSwipeDelete(row,id){
        if(!row || !global.PointerEvent){ return; }
        let startX = 0;
        let startY = 0;
        let deltaX = 0;
        let active = false;
        let horizontal = false;

        row.addEventListener("pointerdown",event=>{
            if(event.pointerType === "mouse" || event.button !== 0){ return; }
            startX = event.clientX;
            startY = event.clientY;
            deltaX = 0;
            active = true;
            horizontal = false;
        });
        row.addEventListener("pointermove",event=>{
            if(!active){ return; }
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if(!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){
                horizontal = true;
            }
            if(!horizontal){ return; }
            deltaX = Math.min(0,Math.max(-110,dx));
            row.style.transform = "translateX(" + deltaX + "px)";
        });
        const finish = ()=>{
            if(!active){ return; }
            active = false;
            row.style.transform = "";
            if(horizontal && deltaX <= -72){
                deleteNotification(id,row);
            }
        };
        row.addEventListener("pointerup",finish);
        row.addEventListener("pointercancel",finish);
    }

    function createNotificationRow(item){
        const row = document.createElement("article");
        row.className = "notification-row";
        row.dataset.notificationId = String(item.id || "");

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

        row.appendChild(link);
        row.appendChild(deleteButton);
        bindSwipeDelete(row,item.id);
        return row;
    }

    async function renderNotificationsPage(){
        const root = document.getElementById("notifications-content");
        if(!root){ return; }
        root.innerHTML = `
            <div class="notifications-shell">
                <header class="notifications-header">
                    <h1>Notifications</h1>
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

    function switchMarkup(key,label,checked,disabled=false){
        return `
            <label class="notification-setting-row" data-setting-row="${key}">
                <span class="notification-setting-copy">
                    <strong>${label}</strong>
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
            const familyRows = SETTINGS_LABELS.map(([key,label])=>{
                return switchMarkup(key,label,settings[key] !== false,settings.enabled === false);
            }).join("");
            root.innerHTML = `
                <div class="notifications-shell notification-settings-shell">
                    <header class="notifications-header notification-settings-header">
                        <h1>Notification Settings</h1>
                    </header>
                    <section class="notification-settings-list" aria-label="Notification settings">
                        ${switchMarkup("enabled","Notifications",settings.enabled !== false,false)}
                        <div class="notification-settings-divider"></div>
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
})(window);
