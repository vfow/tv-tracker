(function(global){
    "use strict";

    const DEDICATED_SETTINGS_ROUTE = "/app/notifications/settings";
    const UPCOMING_REPAIR_COOLDOWN_MS = 30 * 60 * 1000;
    const UPCOMING_REPAIR_MAX_PER_PASS = 8;
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

    const initialDedicatedSettingsRoute = String(global.location && global.location.pathname || "") === DEDICATED_SETTINGS_ROUTE;
    const settingsRenderBusy = new WeakSet();
    const upcomingRepairAttempts = new Map();
    let settingsObserver = null;
    let notificationLinksObserver = null;
    let mainSettingsTimer = null;
    let upcomingRepairBusy = false;

    function finalApi(){
        return global.TVTrackerFinalNotifications || null;
    }

    function csrfToken(){
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
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
        const response = await fetch(path,{
            method,
            headers,
            body,
            credentials:"same-origin",
            cache:"no-store"
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

    function switchRow(key,label,checked,disabled,description,errorText=""){
        const row = document.createElement("label");
        row.className = "notification-setting-row" + (disabled ? " notification-setting-row--disabled" : "");
        row.dataset.settingRow = key;
        row.dataset.polishControl = "1";
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
                ? "Push is blocked in your browser settings."
                : "Push permission wasn't granted.";
        }
        const message = String(error && error.message || "").trim();
        if(/server key/i.test(message)) return "Push is temporarily unavailable. Try again later.";
        if(/verify Push/i.test(message)) return "TV Tracker couldn't finish enabling Push. Try again.";
        return "TV Tracker couldn't enable Push on this device. Try again.";
    }

    async function saveSetting(key,value,input,list){
        if(input) input.disabled = true;
        try{
            await requestJSON("/api/notifications/settings",{method:"PATCH",body:{[key]:value}});
        }catch(error){
            if(input) input.checked = !value;
            console.error("TV Tracker could not save notification setting",error);
        }finally{
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
                if(!api) throw new Error("Push setup is unavailable.");
                if(next){
                    await api.enablePush(currentState.publicKey,currentState.localSubscription || null);
                    currentState = await api.pushState({reconcile:false});
                    if(!currentState.checked) throw new Error("TV Tracker couldn't verify Push on this device.");
                    input.checked = true;
                    row.dataset.intrinsicDisabled = "0";
                    if(description) description.textContent = "Push is enabled on this device.";
                }else{
                    await api.disablePush();
                    currentState = await api.pushState({reconcile:false});
                    input.checked = false;
                    row.dataset.intrinsicDisabled = currentState.disabled ? "1" : "0";
                    if(description) description.textContent = "Enable alerts on this device.";
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
                setPushError(row,pushErrorMessage(error));
            }finally{
                syncDisabledStates(list);
            }
        });
    }

    async function renderNotificationControls(list){
        if(!list || settingsRenderBusy.has(list)) return;
        settingsRenderBusy.add(list);
        list.innerHTML = '<div class="notifications-loading">Loading notification settings…</div>';
        try{
            const api = finalApi();
            if(api && typeof api.syncAutomaticTimezone === "function") await api.syncAutomaticTimezone();
            const payload = await requestJSON("/api/notifications/settings");
            if(!list.isConnected) return;
            const settings = payload.settings || {};
            const enabled = settings.enabled !== false;
            list.innerHTML = "";

            const masterRow = switchRow("enabled","Notifications",enabled,false,"Turn all notifications on or off.");
            list.appendChild(masterRow);
            BASE_SETTING_OPTIONS.forEach(([key,label,description])=>{
                list.appendChild(switchRow(key,label,settings[key] !== false,!enabled,description));
            });

            let state;
            try{
                state = api ? await api.pushState() : null;
            }catch(error){
                state = null;
                console.warn("TV Tracker push status unavailable",error);
            }
            if(!state){
                state = {
                    checked:false,
                    disabled:true,
                    description:"Push settings are temporarily unavailable.",
                    publicKey:"",
                    localSubscription:null,
                    error:"Reload this page and try again."
                };
            }
            if(!list.isConnected) return;
            const pushRow = switchRow(
                "pushNotifications",
                "Push Notifications",
                state.checked === true,
                state.disabled === true || !enabled,
                state.description || "Enable alerts on this device.",
                state.error || ""
            );
            pushRow.dataset.intrinsicDisabled = state.disabled ? "1" : "0";
            list.appendChild(pushRow);

            list.querySelectorAll('[data-notification-setting]:not([data-notification-setting="pushNotifications"])').forEach(input=>{
                input.addEventListener("change",()=>{
                    saveSetting(input.dataset.notificationSetting,input.checked,input,list);
                });
            });
            await bindPushRow(pushRow,state,list);
            syncDisabledStates(list);
        }catch(error){
            if(list.isConnected){
                list.innerHTML = '<div class="notifications-empty">Notification settings are temporarily unavailable.</div>';
            }
            console.error("TV Tracker notification settings failed to load",error);
        }finally{
            settingsRenderBusy.delete(list);
        }
    }

    function adoptMainSettingsSurface(){
        const section = document.getElementById("settings-notifications");
        if(!section) return false;
        const header = section.querySelector(".settings-section-header");
        if(header) header.innerHTML = "<h2>NOTIFICATIONS</h2>";
        const list = section.querySelector(".notification-settings-list");
        if(!list) return false;
        if(!list.querySelector('[data-polish-control="1"]')) renderNotificationControls(list);
        return true;
    }

    function scheduleMainSettingsAdoption(){
        if(mainSettingsTimer) global.clearTimeout(mainSettingsTimer);
        mainSettingsTimer = global.setTimeout(()=>{
            mainSettingsTimer = null;
            adoptMainSettingsSurface();
        },0);
    }

    function observeMainSettings(){
        const root = document.getElementById("settings-content");
        if(!root || settingsObserver) return;
        settingsObserver = new MutationObserver(scheduleMainSettingsAdoption);
        settingsObserver.observe(root,{childList:true,subtree:true});
        scheduleMainSettingsAdoption();
    }

    function showDedicatedSettingsPage(){
        document.querySelectorAll(".page").forEach(page=>page.classList.remove("active-page"));
        const page = document.getElementById("notification-settings-page");
        if(page) page.classList.add("active-page");
        global.activePage = "notification-settings";
        if(typeof global.activatePrimaryNavContext === "function") global.activatePrimaryNavContext("shows");
        else if(typeof global.setAppPrimaryNavActive === "function") global.setAppPrimaryNavActive("shows");
        if(typeof global.updateShellTitle === "function") global.updateShellTitle();
    }

    async function renderDedicatedSettingsPage(){
        const root = document.getElementById("notification-settings-content");
        if(!root) return;
        root.innerHTML = `
            <div class="notifications-shell">
                <header class="notifications-header notification-settings-header">
                    <div class="notifications-title-row">
                        <a class="show-page-back-button notifications-back-button" href="/app/notifications" aria-label="Back to Notifications">
                            <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                        </a>
                        <h1 class="tw-font-league">Notification Settings</h1>
                    </div>
                </header>
                <section class="notification-settings-list" aria-label="Notification settings">
                    <div class="notifications-loading">Loading notification settings…</div>
                </section>
            </div>
        `;
        await renderNotificationControls(root.querySelector(".notification-settings-list"));
    }

    function openDedicatedSettingsPage(options={}){
        if(!options.fromRoute && global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(DEDICATED_SETTINGS_ROUTE,false);
            if(typeof global.TVTrackerRouter.applyRoute === "function") global.TVTrackerRouter.applyRoute();
            return;
        }
        if(!options.fromRoute){
            try{ history.pushState({tvTrackerRoute:true},"",DEDICATED_SETTINGS_ROUTE); }catch(error){}
        }
        showDedicatedSettingsPage();
        renderDedicatedSettingsPage();
    }

    function installDedicatedSettingsNavigation(){
        if(global.TVTrackerNotifications){
            global.TVTrackerNotifications.openNotificationSettingsPage = openDedicatedSettingsPage;
            global.TVTrackerNotifications.renderNotificationSettingsPage = renderDedicatedSettingsPage;
        }

        const rewriteLinks = ()=>{
            document.querySelectorAll(".notifications-settings-link").forEach(link=>{
                link.setAttribute("href",DEDICATED_SETTINGS_ROUTE);
            });
        };
        rewriteLinks();

        const notificationsRoot = document.getElementById("notifications-content");
        if(notificationsRoot && !notificationLinksObserver){
            notificationLinksObserver = new MutationObserver(rewriteLinks);
            notificationLinksObserver.observe(notificationsRoot,{childList:true,subtree:true});
        }

        global.addEventListener("click",event=>{
            if(!event || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const target = event.target && event.target.closest ? event.target.closest(".notifications-settings-link") : null;
            if(!target) return;
            event.preventDefault();
            event.stopPropagation();
            openDedicatedSettingsPage({fromRoute:false});
        },true);
    }

    function restoreInitialDedicatedSettingsRoute(){
        if(!initialDedicatedSettingsRoute) return;
        try{ history.replaceState({tvTrackerRoute:true},"",DEDICATED_SETTINGS_ROUTE); }catch(error){}
        openDedicatedSettingsPage({fromRoute:true});
    }

    function watchedEpisodeCount(show){
        const watched = show && show.episodes_watched && typeof show.episodes_watched === "object" ? show.episodes_watched : {};
        return Object.values(watched).reduce((total,episodes)=>{
            return total + (Array.isArray(episodes) ? episodes.length : 0);
        },0);
    }

    function hasCurrentOrFutureLastAirDate(show){
        const raw = String(show && show.last_air_date || "").trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
        const value = Date.parse(raw + "T23:59:59Z");
        return Number.isFinite(value) && value >= Date.now() - 24 * 60 * 60 * 1000;
    }

    function shouldRepairWatchingShow(show){
        if(!show || show.status !== "watching") return false;
        const tmdbStatus = String(show.tmdb_status || "").trim().toLowerCase();
        if(tmdbStatus === "canceled" || tmdbStatus === "cancelled") return false;

        const activeStatus = tmdbStatus === "returning series" ||
            tmdbStatus === "in production" ||
            tmdbStatus === "planned" ||
            tmdbStatus === "pilot";
        const nextEpisode = show.next_episode_to_air && typeof show.next_episode_to_air === "object"
            ? show.next_episode_to_air
            : null;
        const knownUnwatched = Number(show.number_of_episodes || 0) > watchedEpisodeCount(show);

        return activeStatus || !!nextEpisode || hasCurrentOrFutureLastAirDate(show) || knownUnwatched;
    }

    function showHasUpcomingItems(show){
        if(typeof global.getUpcomingScheduleItems !== "function") return true;
        try{
            const items = global.getUpcomingScheduleItems(show);
            return Array.isArray(items) && items.length > 0;
        }catch(error){
            return true;
        }
    }

    async function repairMissingWatchingSchedules(){
        if(upcomingRepairBusy) return false;
        if(!global.DATA || !global.DATA.shows || typeof global.refreshShowForSchedule !== "function") return false;
        if(typeof global.getUpcomingScheduleItems !== "function") return false;

        const now = Date.now();
        const candidates = Object.values(global.DATA.shows)
            .filter(show=>shouldRepairWatchingShow(show) && !showHasUpcomingItems(show))
            .filter(show=>{
                const id = String(show.tmdb_id || show.id || "");
                if(!id) return false;
                const lastAttempt = Number(upcomingRepairAttempts.get(id) || 0);
                return !lastAttempt || now - lastAttempt >= UPCOMING_REPAIR_COOLDOWN_MS;
            })
            .slice(0,UPCOMING_REPAIR_MAX_PER_PASS);

        if(!candidates.length) return false;
        upcomingRepairBusy = true;
        let refreshed = 0;
        try{
            for(const show of candidates){
                const id = String(show.tmdb_id || show.id || "");
                upcomingRepairAttempts.set(id,Date.now());
                try{
                    await global.refreshShowForSchedule(show,true);
                    refreshed += 1;
                }catch(error){
                    console.warn("TV Tracker targeted Upcoming refresh failed",id,error);
                }
            }

            if(refreshed > 0){
                if(typeof global.saveData === "function"){
                    try{ await global.saveData(); }catch(error){ console.warn("TV Tracker could not save targeted Upcoming refresh",error); }
                }
                if(global.activePage === "shows" && global.activeShowsTab === "upcoming" && typeof global.renderUpcoming === "function"){
                    await global.renderUpcoming(false);
                }
                return true;
            }
            return false;
        }finally{
            upcomingRepairBusy = false;
        }
    }

    function installUpcomingRepair(){
        const original = global.refreshUpcomingDataInBackground;
        if(typeof original !== "function" || original._tvtrackerTargetedRepair) return;

        const wrapped = async function(...args){
            const result = await original.apply(this,args);
            await repairMissingWatchingSchedules();
            return result;
        };
        wrapped._tvtrackerTargetedRepair = true;
        wrapped._tvtrackerOriginal = original;
        global.refreshUpcomingDataInBackground = wrapped;

        global.setTimeout(()=>{
            if(global.activePage === "shows" && global.activeShowsTab === "upcoming"){
                repairMissingWatchingSchedules();
            }
        },1200);
    }

    function boot(){
        observeMainSettings();
        installDedicatedSettingsNavigation();
        installUpcomingRepair();
        restoreInitialDedicatedSettingsRoute();
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded",boot,{once:true});
    }else{
        boot();
    }

    global.TVTrackerNotificationPolish = Object.freeze({
        renderNotificationControls,
        renderDedicatedSettingsPage,
        openDedicatedSettingsPage,
        adoptMainSettingsSurface,
        shouldRepairWatchingShow,
        repairMissingWatchingSchedules
    });
})(window);
