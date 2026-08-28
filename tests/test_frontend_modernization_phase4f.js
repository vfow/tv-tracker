"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const SETTINGS_SECTIONS = ["profile","auth","notifications","streaming","data","danger-zone"];
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const loaderSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-loader.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");

assert(settingsSource.includes("const SECTIONS = Object.freeze(["),"Settings route-state facade must keep the canonical section list");
assert(settingsSource.includes("global.TVTrackerSettings = Object.freeze({"),"Settings route-state facade must publish before the Vue bridge wraps it");
assert(!settingsSource.includes("global.renderSettings"),"The legacy Settings file must no longer publish a renderer");
for(const legacySymbol of [
    "function shell(",
    "function renderProfile(",
    "function renderAuth(",
    "function renderNotifications(",
    "function renderStreaming(",
    "function renderData(",
    "function renderDanger(",
    "function bindProfile(",
    "function bindAuth(",
    "function bindNotifications(",
    "function bindStreaming(",
    "function bindData(",
    "function bindDanger(",
    "function bodyFor(",
    "function bindSection(",
    "function render()"
]){
    assert(!settingsSource.includes(legacySymbol),`Phase 4F must remove legacy Settings rendering/binding symbol: ${legacySymbol}`);
}
for(const legacyService of [
    "saveProfileSettings",
    "loadAdminAccountIntoSettings",
    "renderNotificationControls",
    "saveStreamingRegion",
    "exportNativeBackupJSON",
    "importNativeBackupJSON",
    "resetTrackerData"
]){
    assert(!settingsSource.includes(legacyService),`Route-state facade must not retain Settings behavior binding: ${legacyService}`);
}

assert(bridgeSource.includes('ownership:"vue"'),"The Settings bridge must declare Vue as the completed renderer owner");
assert(bridgeSource.includes("Incomplete Vue Settings owner"),"The bridge must reject a partial Vue owner after completion");
assert(bridgeSource.includes('data-tvtracker-settings-loading="true"'),"The bridge must expose a bounded loading state while the manifest bundle attaches");
assert(bridgeSource.includes('data-tvtracker-settings-load-failed="true"'),"The bridge must expose a visible load-failure state without restoring legacy rendering");
assert(!bridgeSource.includes("VUE_CANARY_SECTIONS"),"Phase 4F must remove the transitional per-section canary allowlist");
assert(!bridgeSource.includes("legacy.render"),"Phase 4F must remove legacy render fallback calls");
assert(!bridgeSource.includes("return legacy.render()"),"Phase 4F must not keep a hidden dual-render path");
assert(bridgeSource.includes("global.renderSettings = render;"),"The bridge must be the sole global Settings render handoff");

assert(loaderSource.includes('"/static/vue/manifest.json"'),"Completed Settings ownership must remain manifest-driven");
assert(loaderSource.includes('cache:"no-store"'),"Manifest loading must avoid stale cross-release caching");
assert(loaderSource.includes("vue_settings_load_failed"),"Vue load failure must remain privacy-safe and observable");
assert(loaderSource.includes("renderLoadFailure"),"Loader failure must surface the bridge failure UI instead of falling back to legacy Settings");
for(const section of SETTINGS_SECTIONS){
    assert(loaderSource.includes(section),`Direct-route loader must recognize ${section}`);
}
assert(loaderSource.includes("/^\\/app\\/settings"),"Any supported direct Settings route must proactively load the Vue bundle");

for(const section of SETTINGS_SECTIONS){
    assert(mainSource.includes(`section === '${section}'`) || (section === "streaming" && mainSource.includes("return section === 'streaming';")),`Vue Settings owner must support ${section}`);
}
for(const component of [
    "SettingsProfile",
    "SettingsAuth",
    "SettingsNotifications",
    "SettingsStreaming",
    "SettingsData",
    "SettingsDanger"
]){
    assert(mainSource.includes(`createApp(${component})`),`Completed Vue Settings owner must mount ${component}`);
}

function createRouteState(initial="profile"){
    let section = initial;
    const openCalls = [];
    return {
        open(next,options){ section = next; openCalls.push({next,options}); },
        current(){ return section; },
        normalizeSection(value){ return SETTINGS_SECTIONS.includes(value) ? value : "profile"; },
        routeFor(value){ return `/app/settings/${this.normalizeSection(value)}`; },
        sectionFromPath(){ return section; },
        sections:SETTINGS_SECTIONS.map(id=>({id,label:id.toUpperCase()})),
        openCalls
    };
}

function loadBridge(initial="profile"){
    const routeState = createRouteState(initial);
    const dispatched = [];
    const root = {innerHTML:""};
    class CustomEvent {
        constructor(type,options={}){ this.type=type; this.detail=options.detail; }
    }
    const document = {
        dispatchEvent(event){ dispatched.push(event); return true; },
        getElementById(id){ return id === "settings-content" ? root : null; }
    };
    const window = {TVTrackerSettings:routeState,activePage:"settings",document,CustomEvent};
    window.window = window;
    vm.runInNewContext(bridgeSource,{window,Array,Object,Set,String,TypeError},{filename:"settings-vue-bridge.js"});
    return {bridge:window.TVTrackerSettingsBridge,routeState,dispatched,root,window};
}

const pending = loadBridge("profile");
assert(pending.bridge,"Phase 4F bridge must install over the route-state facade without requiring a legacy render method");
pending.bridge.render();
assert.strictEqual(pending.dispatched.length,1,"Rendering before Vue attaches must request the manifest owner once");
assert.strictEqual(pending.dispatched[0].detail.section,"profile");
assert(pending.root.innerHTML.includes('data-tvtracker-settings-loading="true"'),"Pre-attach rendering must show only the bounded loading state");
pending.bridge.renderLoadFailure();
assert(pending.root.innerHTML.includes('data-tvtracker-settings-load-failed="true"'),"Manifest failure must show the explicit Settings unavailable state");
assert(!pending.root.innerHTML.includes("Reset Tracker Data"),"Failure UI must not recreate legacy Settings content");

const active = loadBridge("auth");
assert.throws(
    ()=>active.bridge.attachVueOwner({
        supports(section){ return section === "auth"; },
        render(){},
        unmount(){}
    }),
    /Incomplete Vue Settings owner/,
    "A partial owner must be rejected once Settings ownership is complete"
);

const vueRenders = [];
const vueOwner = {
    supports(section){ return SETTINGS_SECTIONS.includes(section); },
    render(section){ vueRenders.push(section); },
    unmount(){}
};
active.bridge.attachVueOwner(vueOwner);
assert.deepStrictEqual(vueRenders,["auth"],"Attaching the complete owner while Settings is active must render the current section");
active.bridge.open("data",{fromRoute:true,skipShowPage:true});
assert.strictEqual(active.routeState.openCalls.length,1,"Bridge must preserve route-state delegation");
assert.strictEqual(active.routeState.openCalls[0].next,"data");
assert.strictEqual(active.routeState.openCalls[0].options.skipShowPage,true,"Phase 4F bridge must not mutate router skipShowPage semantics");
assert.deepStrictEqual(vueRenders,["auth","data"],"Route transitions must stay inside the sole Vue owner");
assert.strictEqual(active.bridge.ownership,"vue");
assert.strictEqual(active.bridge.routeState,active.routeState,"Bridge must expose the non-rendering route-state facade explicitly");

console.log("Frontend modernization Phase 4F Settings completion ownership tests passed.");
