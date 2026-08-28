(function(global){
    "use strict";

    const routeState = global.TVTrackerSettings;
    if(
        !routeState ||
        typeof routeState.open !== "function" ||
        typeof routeState.current !== "function" ||
        typeof routeState.normalizeSection !== "function"
    ){
        return;
    }

    const SETTINGS_SECTIONS = Object.freeze(
        Array.from(routeState.sections || [],item=>String(item && item.id || "")).filter(Boolean)
    );
    const SETTINGS_SECTION_SET = new Set(SETTINGS_SECTIONS);
    let vueOwner = null;

    function currentSection(){
        return routeState.current();
    }

    function requestVue(section){
        if(
            !vueOwner &&
            SETTINGS_SECTION_SET.has(section) &&
            global.document &&
            typeof global.document.dispatchEvent === "function" &&
            typeof global.CustomEvent === "function"
        ){
            global.document.dispatchEvent(new global.CustomEvent("tvtracker:settings-vue-needed",{detail:{section}}));
        }
    }

    function settingsRoot(){
        return global.document && global.document.getElementById
            ? global.document.getElementById("settings-content")
            : null;
    }

    function renderLoading(){
        const root = settingsRoot();
        if(!root){ return; }
        root.innerHTML = '<div class="settings-v2-loading" data-tvtracker-settings-loading="true" role="status" aria-label="Loading settings"><div class="settings-v2-skeleton-line"></div><div class="settings-v2-skeleton-line"></div><div class="settings-v2-skeleton-line"></div></div>';
    }

    function renderLoadFailure(){
        if(vueOwner){ return; }
        const root = settingsRoot();
        if(!root){ return; }
        root.innerHTML = '<section class="settings-v2-section" data-tvtracker-settings-load-failed="true" role="alert"><h2>Settings unavailable</h2><p class="settings-v2-copy">Reload the page to try again.</p></section>';
    }

    function render(){
        const section = currentSection();
        if(vueOwner){
            return vueOwner.render(section);
        }
        requestVue(section);
        renderLoading();
    }

    function open(section,options={}){
        const normalized = routeState.normalizeSection(section);
        const result = routeState.open(normalized,options);
        if(global.activePage === "settings"){
            render();
        }
        return result;
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.supports !== "function" || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Settings owner");
        }
        const unsupported = SETTINGS_SECTIONS.filter(section=>!owner.supports(section));
        if(unsupported.length){
            throw new TypeError("Incomplete Vue Settings owner: " + unsupported.join(","));
        }
        vueOwner = owner;
        if(global.activePage === "settings"){
            render();
        }
    }

    const bridge = Object.freeze({
        attachVueOwner,
        render,
        renderLoadFailure,
        open,
        current:currentSection,
        normalizeSection:routeState.normalizeSection,
        routeFor:routeState.routeFor,
        sectionFromPath:routeState.sectionFromPath,
        sections:routeState.sections,
        routeState,
        ownership:"vue"
    });

    global.TVTrackerSettingsBridge = bridge;
    global.TVTrackerSettings = bridge;
    global.renderSettings = render;
})(window);
