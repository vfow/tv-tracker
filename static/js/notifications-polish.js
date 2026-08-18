(function(global){
    "use strict";

    const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";
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

    const settingsRenderBusy = new WeakSet();
    const upcomingRepairAttempts = new Map();
    let upcomingRepairBusy = false;

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

    function watchedEpisodeCount(show){
        const watched = show && show.episodes_watched && typeof show.episodes_watched === "object" ? show.episodes_watched : {};
        return Object.values(watched).reduce((total,episodes)=>total + (Array.isArray(episodes) ? episodes.length : 0),0);
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
        const activeStatus = tmdbStatus === "returning series" || tmdbStatus === "in production" || tmdbStatus === "planned" || tmdbStatus === "pilot";
        const nextEpisode = show.next_episode_to_air && typeof show.next_episode_to_air === "object" ? show.next_episode_to_air : null;
        const knownUnwatched = Number(show.number_of_episodes || 0) > watchedEpisodeCount(show);
        return activeStatus || !!nextEpisode || hasCurrentOrFutureLastAirDate(show) || knownUnwatched;
    }

    function showHasUpcomingItems(show){
        if(typeof global.getUpcomingScheduleItems !== "function") return true;
        try{ const items = global.getUpcomingScheduleItems(show); return Array.isArray(items) && items.length > 0; }
        catch(error){ return true; }
    }

    async function repairMissingWatchingSchedules(){
        if(upcomingRepairBusy) return false;
        if(!global.DATA || !global.DATA.shows || typeof global.refreshShowForSchedule !== "function" || typeof global.getUpcomingScheduleItems !== "function") return false;
        const now = Date.now();
        const candidates = Object.values(global.DATA.shows)
            .filter(show=>shouldRepairWatchingShow(show) && !showHasUpcomingItems(show))
            .filter(show=>{ const id=String(show.tmdb_id||show.id||""); if(!id)return false; const last=Number(upcomingRepairAttempts.get(id)||0); return !last || now-last>=UPCOMING_REPAIR_COOLDOWN_MS; })
            .slice(0,UPCOMING_REPAIR_MAX_PER_PASS);
        if(!candidates.length) return false;
        upcomingRepairBusy = true;
        let refreshed = 0;
        try{
            for(const show of candidates){
                const id=String(show.tmdb_id||show.id||"");
                upcomingRepairAttempts.set(id,Date.now());
                try{ await global.refreshShowForSchedule(show,true); refreshed += 1; }
                catch(error){ console.warn("TV Tracker targeted Upcoming refresh failed",id,error); }
            }
            if(refreshed > 0){
                if(typeof global.saveData === "function"){ try{ await global.saveData(); }catch(error){ console.warn("TV Tracker could not save targeted Upcoming refresh",error); } }
                if(global.activePage === "shows" && global.activeShowsTab === "upcoming" && typeof global.renderUpcoming === "function") await global.renderUpcoming(false);
                return true;
            }
            return false;
        }finally{ upcomingRepairBusy = false; }
    }

    function installUpcomingRepair(){
        const original = global.refreshUpcomingDataInBackground;
        if(typeof original !== "function" || original._tvtrackerTargetedRepair) return;
        const wrapped = async function(...args){ const result=await original.apply(this,args); await repairMissingWatchingSchedules(); return result; };
        wrapped._tvtrackerTargetedRepair = true;
        wrapped._tvtrackerOriginal = original;
        global.refreshUpcomingDataInBackground = wrapped;
        global.setTimeout(()=>{ if(global.activePage === "shows" && global.activeShowsTab === "upcoming") repairMissingWatchingSchedules(); },1200);
    }

    function boot(){ installCanonicalNavigation(); installUpcomingRepair(); }
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();

    global.TVTrackerNotificationPolish = Object.freeze({
        renderNotificationControls,
        renderDedicatedSettingsPage,
        openDedicatedSettingsPage,
        ensureMainSettingsSection,
        adoptMainSettingsSurface,
        shouldRepairWatchingShow,
        repairMissingWatchingSchedules,
        pushErrorMessage
    });
})(window);
