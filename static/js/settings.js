(function(global){
    "use strict";

    const SECTIONS = Object.freeze([
        {id:"profile",label:"PROFILE"},
        {id:"auth",label:"AUTH"},
        {id:"notifications",label:"NOTIFICATIONS"},
        {id:"streaming",label:"STREAMING"},
        {id:"data",label:"DATA"},
        {id:"danger-zone",label:"DANGER ZONE"}
    ]);
    const VALID = new Set(SECTIONS.map(item=>item.id));
    let activeSection = "profile";
    let regionRequest = 0;

    function escapeHTML(value){
        if(typeof global.escapeHTML === "function") return global.escapeHTML(value);
        return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    function csrfToken(){
        if(typeof global.csrfToken === "function") return global.csrfToken();
        const meta = global.document && global.document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    function normalizeSection(value){
        const clean = String(value || "profile").trim().toLowerCase();
        return VALID.has(clean) ? clean : "profile";
    }

    function sectionFromPath(pathname){
        const match = String(pathname || "").match(/^\/app\/settings(?:\/([^/?#]+))?\/?$/);
        return normalizeSection(match && match[1] ? match[1] : "profile");
    }

    function routeFor(section){ return "/app/settings/" + normalizeSection(section); }

    function root(){ return global.document ? global.document.getElementById("settings-content") : null; }

    function notify(message,options={}){
        if(global.TVTrackerFeedback && typeof global.TVTrackerFeedback.notify === "function"){
            return global.TVTrackerFeedback.notify(message,options);
        }
        if(typeof global.showToast === "function") return global.showToast(message,options);
        return null;
    }

    function shell(body){
        const tabs = SECTIONS.map(item=>{
            const selected = item.id === activeSection;
            return `<a class="settings-v2-tab" href="${routeFor(item.id)}" data-settings-section="${item.id}" ${selected ? 'aria-current="page"' : ""}>${item.label}</a>`;
        }).join("");
        return `<div class="settings-v2"><header class="settings-v2-header"><h1 class="settings-v2-title">Account Settings</h1><nav class="settings-v2-tabs" aria-label="Account Settings sections">${tabs}</nav></header><div class="settings-v2-body" data-settings-body>${body}</div><nav class="settings-v2-legal-links" aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/about">About</a></nav></div>`;
    }

    function loading(){ return '<div class="settings-v2-loading" role="status" aria-label="Loading settings"><div class="settings-v2-skeleton-line"></div><div class="settings-v2-skeleton-line"></div><div class="settings-v2-skeleton-line"></div></div>'; }

    function ensureProfile(){
        if(!global.DATA || typeof global.DATA !== "object") return {};
        if(!global.DATA.profile || typeof global.DATA.profile !== "object") global.DATA.profile = {};
        if(typeof global.DATA.profile.adult_filter !== "boolean") global.DATA.profile.adult_filter = true;
        return global.DATA.profile;
    }

    function profileDraft(){
        const profile = ensureProfile();
        const draft = typeof global.createProfileSettingsDraft === "function" ? global.createProfileSettingsDraft() : Object.assign({},profile);
        draft.adult_filter = profile.adult_filter !== false;
        if(global.TVTrackerStreamingRegion && typeof global.TVTrackerStreamingRegion.getStreamingRegion === "function"){
            draft.streaming_region = global.TVTrackerStreamingRegion.getStreamingRegion();
        }else{
            draft.streaming_region = String(profile.streaming_region || "");
        }
        global.profileSettingsDraft = draft;
        return draft;
    }

    function renderProfile(){
        const draft = profileDraft();
        const presets = ["silhouette-1","silhouette-2","silhouette-3","silhouette-4"].map(preset=>`<button type="button" data-avatar-type="preset" data-avatar-preset="${preset}" title="Choose preset avatar">${typeof global.getPresetAvatarSVG === "function" ? global.getPresetAvatarSVG(preset) : ""}</button>`).join("");
        const avatar = typeof global.getProfileAvatarInnerHTML === "function" ? global.getProfileAvatarInnerHTML(draft) : "";
        const header = typeof global.getProfileHeaderPreviewHTML === "function" ? global.getProfileHeaderPreviewHTML(draft) : "";
        return `<section class="settings-v2-section settings-v2-profile-section"><h2>Profile</h2><p class="settings-v2-copy">Update how your profile appears in TV Tracker.</p><div class="settings-v2-avatar-row"><div class="settings-v2-avatar-preview" id="settings-avatar-preview">${avatar}</div><div><div class="settings-v2-field"><label for="profile-username-input">Username</label><input class="settings-v2-input" id="profile-username-input" type="text" maxlength="30" value="${escapeHTML(draft.username || "Username")}"></div><span class="settings-v2-label">Avatar</span><div class="settings-v2-presets"><button type="button" data-avatar-type="initial" title="Use username initial"><span class="avatar-initial-option">${typeof global.getProfileInitial === "function" ? escapeHTML(global.getProfileInitial(draft.username)) : "U"}</span></button>${presets}</div><div class="settings-v2-actions"><button class="settings-v2-button" id="upload-profile-avatar" type="button">Upload Image</button><button class="settings-v2-button" id="remove-profile-avatar" type="button">Remove Avatar</button></div></div></div><div class="settings-v2-field" style="margin-top:28px"><span class="settings-v2-label">Profile Header</span><div id="profile-header-preview-wrap">${header}</div></div><div class="settings-v2-header-presets">${[["default","Default"],["blue","Blue"],["purple","Purple"],["green","Green"],["amber","Amber"],["monochrome","Monochrome"]].map(([preset,label])=>`<button class="settings-v2-button profile-header-preset-button profile-header-${preset}" type="button" data-profile-header-preset="${preset}">${label}</button>`).join("")}</div><div class="settings-v2-actions"><button class="settings-v2-button" id="upload-profile-header" type="button">Upload Header Image</button><button class="settings-v2-button" id="remove-profile-header" type="button">Use Default Header</button><button class="settings-v2-button settings-v2-button--primary" id="save-profile-settings" type="button">Save Profile</button></div><label class="settings-v2-check-row" for="adult-filter-input"><input id="adult-filter-input" type="checkbox" ${draft.adult_filter !== false ? "checked" : ""}><span class="settings-v2-check-copy"><strong>Adult filter</strong><span>Hide movies and TV shows that TMDB classifies as adult content. Existing tracked titles are hidden, not deleted.</span></span></label></section>`;
    }

    function updateProfilePreview(){
        if(typeof global.updateProfileSettingsPreview === "function") global.updateProfileSettingsPreview();
    }

    function bindProfile(){
        const draft = global.profileSettingsDraft || profileDraft();
        const username = global.document.getElementById("profile-username-input");
        const adult = global.document.getElementById("adult-filter-input");
        if(username){ username.addEventListener("input",()=>{ draft.username = username.value; updateProfilePreview(); }); }
        global.document.querySelectorAll("[data-avatar-type]").forEach(button=>button.addEventListener("click",()=>{
            draft.avatar_type = button.dataset.avatarType || "initial";
            draft.avatar_preset = button.dataset.avatarPreset || "silhouette-1";
            if(draft.avatar_type !== "upload") draft.avatar_data = "";
            updateProfilePreview();
        }));
        const avatarUpload = global.document.getElementById("upload-profile-avatar");
        const avatarRemove = global.document.getElementById("remove-profile-avatar");
        if(avatarUpload && typeof global.openAvatarFilePicker === "function") avatarUpload.addEventListener("click",global.openAvatarFilePicker);
        if(avatarRemove) avatarRemove.addEventListener("click",()=>{ draft.avatar_type="initial"; draft.avatar_data=""; updateProfilePreview(); });
        global.document.querySelectorAll("[data-profile-header-preset]").forEach(button=>button.addEventListener("click",()=>{ draft.header_type="preset"; draft.header_preset=button.dataset.profileHeaderPreset || "default"; draft.header_image=""; updateProfilePreview(); }));
        const headerUpload = global.document.getElementById("upload-profile-header");
        const headerRemove = global.document.getElementById("remove-profile-header");
        if(headerUpload && typeof global.openProfileHeaderFilePicker === "function") headerUpload.addEventListener("click",global.openProfileHeaderFilePicker);
        if(headerRemove) headerRemove.addEventListener("click",()=>{ draft.header_type="preset"; draft.header_preset="default"; draft.header_image=""; updateProfilePreview(); });
        const save = global.document.getElementById("save-profile-settings");
        if(save) save.addEventListener("click",async()=>{
            draft.username = username ? username.value : draft.username;
            draft.adult_filter = adult ? adult.checked : true;
            save.disabled = true;
            try{
                if(typeof global.saveProfileSettings === "function") await global.saveProfileSettings(draft);
                ensureProfile().adult_filter = draft.adult_filter !== false;
                if(typeof global.saveData === "function") await global.saveData({stateKeys:["profile"]});
                if(global.TVTrackerAdultPolicy && typeof global.TVTrackerAdultPolicy.refresh === "function") global.TVTrackerAdultPolicy.refresh();
                notify("Settings saved",{severity:"success"});
            }catch(error){
                notify("Couldn’t save your changes.",{severity:"error",actionLabel:"Retry",onAction:()=>save.click()});
            }finally{ if(save.isConnected) save.disabled = false; }
        });
        updateProfilePreview();
    }

    function renderAuth(){
        const username = typeof global.getAdminAccountUsername === "function" ? global.getAdminAccountUsername() : "";
        return `<section class="settings-v2-section"><h2>Auth</h2><p class="settings-v2-copy">Change the private login username or password. Saving account changes signs out logged-in sessions.</p><form id="admin-account-form" autocomplete="on"><div class="settings-v2-field"><label for="admin-username-input">Login username</label><input class="settings-v2-input" id="admin-username-input" type="text" maxlength="80" autocomplete="username" value="${escapeHTML(username)}" placeholder="Loading account..."></div><div class="settings-v2-field"><label for="admin-current-password-input">Current Password</label><input class="settings-v2-input" id="admin-current-password-input" type="password" autocomplete="current-password"></div><div class="settings-v2-field"><label for="admin-new-password-input">New Password</label><input class="settings-v2-input" id="admin-new-password-input" type="password" minlength="16" autocomplete="new-password" placeholder="Leave blank to keep current password"></div><div class="settings-v2-field"><label for="admin-confirm-password-input">Confirm New Password</label><input class="settings-v2-input" id="admin-confirm-password-input" type="password" minlength="16" autocomplete="new-password"></div><p class="settings-v2-copy" id="admin-account-status" aria-live="polite"></p><div class="settings-v2-actions"><button class="settings-v2-button settings-v2-button--primary" id="save-admin-account" type="submit">Save Account Changes</button></div></form></section><section class="settings-v2-section"><h2>Session</h2><p class="settings-v2-copy">Sign out of this TV Tracker session.</p><form method="post" action="/logout"><input type="hidden" name="csrf_token" value="${escapeHTML(csrfToken())}"><button class="settings-v2-button" type="submit">Log Out</button></form></section>`;
    }

    function bindAuth(){
        const input = global.document.getElementById("admin-username-input");
        if(input) input.addEventListener("input",()=>{ input.dataset.userEdited="true"; });
        const form = global.document.getElementById("admin-account-form");
        if(form && typeof global.saveAdminAccountChanges === "function") form.addEventListener("submit",event=>{ event.preventDefault(); global.saveAdminAccountChanges(); });
        if(typeof global.loadAdminAccountIntoSettings === "function") global.loadAdminAccountIntoSettings();
    }

    function renderNotifications(){
        return `<section class="settings-v2-section"><h2>Notifications</h2><div class="notification-settings-list" id="settings-v2-notification-list" aria-label="Notification settings">${loading()}</div></section>`;
    }

    function bindNotifications(attempt=0){
        const list = global.document.getElementById("settings-v2-notification-list");
        if(!list) return;
        const api = global.TVTrackerNotificationPolish;
        if(api && typeof api.renderNotificationControls === "function"){
            api.renderNotificationControls(list);
            return;
        }
        if(attempt < 20){ global.setTimeout(()=>bindNotifications(attempt+1),50); return; }
        list.innerHTML = '<p class="settings-v2-copy">Notification settings are temporarily unavailable.</p>';
    }

    function renderStreaming(){
        const regionApi = global.TVTrackerStreamingRegion;
        const region = regionApi && typeof regionApi.getStreamingRegion === "function" ? regionApi.getStreamingRegion() : String(ensureProfile().streaming_region || "");
        const label = regionApi && typeof regionApi.getCountryName === "function" ? regionApi.getCountryName(region) : region;
        return `<section class="settings-v2-section"><h2>Streaming</h2><p class="settings-v2-copy">Choose the country used for Where to Watch and streaming-service filters.</p><div class="settings-v2-field"><label for="settings-v2-region-input">Streaming Region</label><div class="settings-v2-streaming-combobox"><input class="settings-v2-input" id="settings-v2-region-input" type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" value="${escapeHTML(label)}" placeholder="Search countries"><div class="settings-v2-region-menu" id="settings-v2-region-menu" role="listbox" hidden></div></div></div><div class="settings-v2-actions"><button class="settings-v2-button" id="settings-v2-clear-region" type="button">Clear Region</button><button class="settings-v2-button settings-v2-button--primary" id="settings-v2-save-region" type="button">Save Region</button></div></section>`;
    }

    function bindStreaming(){
        const api = global.TVTrackerStreamingRegion;
        const input = global.document.getElementById("settings-v2-region-input");
        const menu = global.document.getElementById("settings-v2-region-menu");
        const clear = global.document.getElementById("settings-v2-clear-region");
        const save = global.document.getElementById("settings-v2-save-region");
        if(!api || !input || !menu){ return; }
        let chosen = api.getStreamingRegion ? api.getStreamingRegion() : "";
        let countries = [];
        const requestId = ++regionRequest;
        const close = ()=>{ menu.hidden=true; input.setAttribute("aria-expanded","false"); };
        const draw = ()=>{
            if(requestId !== regionRequest) return;
            const filtered = typeof api.filterCountries === "function" ? api.filterCountries(input.value,countries) : countries;
            menu.innerHTML = filtered.length ? filtered.slice(0,120).map(item=>`<button class="settings-v2-region-option" type="button" role="option" data-region="${escapeHTML(item.code)}"><span>${escapeHTML(item.name)}</span><span class="settings-v2-region-code">${escapeHTML(item.code)}</span></button>`).join("") : '<div class="settings-v2-region-empty">No countries found.</div>';
        };
        const open = ()=>{ menu.hidden=false; input.setAttribute("aria-expanded","true"); draw(); };
        Promise.resolve(typeof api.loadCountries === "function" ? api.loadCountries() : []).then(items=>{ if(requestId===regionRequest){ countries=Array.isArray(items)?items:[]; if(chosen && !input.value && api.getCountryName) input.value=api.getCountryName(chosen); draw(); }}).catch(()=>{});
        input.addEventListener("focus",open);
        input.addEventListener("input",()=>{ chosen=""; open(); });
        menu.addEventListener("click",event=>{ const option=event.target.closest&&event.target.closest("[data-region]"); if(!option)return; chosen=String(option.dataset.region||""); input.value=api.getCountryName?api.getCountryName(chosen):chosen; close(); });
        if(clear) clear.addEventListener("click",()=>{ chosen=""; input.value=""; close(); input.focus(); });
        if(save) save.addEventListener("click",async()=>{
            let next = chosen;
            if(input.value.trim() && !next && typeof api.resolveCountryInput === "function") next = api.resolveCountryInput(input.value);
            if(input.value.trim() && !next){ notify("Choose a country from the streaming region list or clear the field.",{severity:"warning"}); input.focus(); open(); return; }
            const before = api.getStreamingRegion ? api.getStreamingRegion() : "";
            save.disabled=true;
            try{
                if(typeof api.setStreamingRegion === "function") api.setStreamingRegion(next);
                ensureProfile().streaming_region = next;
                if(typeof global.saveData === "function") await global.saveData({stateKeys:["profile"]});
                if(before !== next && typeof api.resetProviderRuntime === "function") api.resetProviderRuntime();
                notify("Settings saved",{severity:"success"});
            }catch(error){
                if(typeof api.setStreamingRegion === "function") api.setStreamingRegion(before);
                ensureProfile().streaming_region = before;
                notify("Couldn’t save your changes.",{severity:"error"});
            }finally{ if(save.isConnected) save.disabled=false; }
        });
        global.document.addEventListener("click",event=>{ const box=input.closest(".settings-v2-streaming-combobox"); if(box && !box.contains(event.target)) close(); },{once:false});
    }

    function renderData(){
        const summary = typeof global.getBackupSummary === "function" ? global.getBackupSummary() : {shows:0,historyEntries:0,favorites:0};
        return `<section class="settings-v2-section"><h2>Data</h2><p class="settings-v2-copy">Export, import, or create a readable report of your TV Tracker data.</p><div class="settings-v2-summary"><div><span>Shows</span><strong>${Number(summary.shows||0).toLocaleString()}</strong></div><div><span>History Entries</span><strong>${Number(summary.historyEntries||0).toLocaleString()}</strong></div><div><span>Favorites</span><strong>${Number(summary.favorites||0).toLocaleString()}</strong></div></div><div class="settings-v2-actions"><button class="settings-v2-button settings-v2-button--primary" id="export-native-backup-button" type="button">Export App Backup JSON</button><button class="settings-v2-button" id="import-native-backup-button" type="button">Import App Backup JSON</button><button class="settings-v2-button" id="export-html-report-button" type="button">Export HTML Report</button></div></section>`;
    }

    function bindData(){
        const bindings = [["export-native-backup-button","exportNativeBackupJSON"],["import-native-backup-button","importNativeBackupJSON"],["export-html-report-button","exportHTMLReport"]];
        bindings.forEach(([id,name])=>{ const button=global.document.getElementById(id); if(button && typeof global[name] === "function") button.addEventListener("click",global[name]); });
    }

    function renderDanger(){
        return `<section class="settings-v2-section"><h2>Danger Zone</h2><p class="settings-v2-copy">These actions affect tracker or account data.</p><div class="settings-v2-actions"><button class="settings-v2-button settings-v2-button--danger" id="reset-data-button" type="button">Reset Tracker Data</button></div></section><section class="settings-v2-section"><h2>Deactivate account</h2><p class="settings-v2-copy">Temporarily disable your account while keeping its data.</p><button class="settings-v2-button settings-v2-button--danger" type="button" disabled>Deactivate account</button><p class="settings-v2-disabled-note">Available when user accounts are enabled.</p></section><section class="settings-v2-section"><h2>Delete account</h2><p class="settings-v2-copy">Permanently delete the account and its TV Tracker data.</p><button class="settings-v2-button settings-v2-button--danger" type="button" disabled>Delete account</button><p class="settings-v2-disabled-note">Available when user accounts are enabled.</p></section>`;
    }

    function bindDanger(){ const button=global.document.getElementById("reset-data-button"); if(button && typeof global.resetTrackerData === "function") button.addEventListener("click",global.resetTrackerData); }

    function bodyFor(section){
        if(section === "auth") return renderAuth();
        if(section === "notifications") return renderNotifications();
        if(section === "streaming") return renderStreaming();
        if(section === "data") return renderData();
        if(section === "danger-zone") return renderDanger();
        return renderProfile();
    }

    function bindSection(){
        if(activeSection === "profile") bindProfile();
        else if(activeSection === "auth") bindAuth();
        else if(activeSection === "notifications") bindNotifications();
        else if(activeSection === "streaming") bindStreaming();
        else if(activeSection === "data") bindData();
        else if(activeSection === "danger-zone") bindDanger();
    }

    function bindTabs(){
        const container = root();
        if(!container) return;
        container.querySelectorAll("[data-settings-section]").forEach(link=>link.addEventListener("click",event=>{
            if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            open(link.dataset.settingsSection,{fromRoute:false});
        }));
    }

    function render(){
        const container = root();
        if(!container) return;
        container.innerHTML = shell(bodyFor(activeSection));
        bindTabs();
        bindSection();
        if(typeof global.updateShellTitle === "function") global.updateShellTitle();
    }

    function open(section,options={}){
        activeSection = normalizeSection(section);
        global.activePage = "settings";
        if(typeof global.showPage === "function" && options.skipShowPage !== true){
            global.showPage("settings");
        }else{
            render();
        }
        if(!options.fromRoute){
            const route = routeFor(activeSection);
            if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function") global.TVTrackerRouter.setPathRoute(route,options.replaceRoute === true);
            else if(global.history){ global.history[options.replaceRoute ? "replaceState" : "pushState"]({tvTrackerRoute:true},"",route); }
        }
    }

    function current(){ return activeSection; }

    activeSection = sectionFromPath(global.location && global.location.pathname);
    global.TVTrackerSettings = Object.freeze({render,open,current,normalizeSection,routeFor,sectionFromPath,sections:SECTIONS});
    global.renderSettings = render;
})(window);
