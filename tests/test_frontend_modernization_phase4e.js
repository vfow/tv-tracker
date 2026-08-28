"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const dangerSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsDanger.vue"),"utf8");
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4E_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4e-vue-build.yml")),"The temporary write-enabled Phase 4E build workflow must not survive the phase");
}

assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("danger-zone");'),"Phase 4E must add Danger Zone to the guarded Vue Settings lineage");
assert(bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("data");') < bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("danger-zone");'),"Danger Zone must extend the proven Settings canary sequence rather than replace it");
assert(bridgeSource.includes("return legacy.render();"),"Legacy Settings rendering must remain the fail-safe fallback through Phase 4E");

assert(mainSource.includes("import SettingsDanger from './settings/SettingsDanger.vue';"),"Danger Zone must have a dedicated Vue component");
assert(mainSource.includes("section === 'danger-zone'"),"The guarded Vue owner must explicitly recognize Danger Zone");
assert(mainSource.includes("createApp(SettingsDanger)"),"Danger Zone must mount through its dedicated Vue app");
assert(mainSource.includes("phase4e-settings-danger-canary"),"The compiled frontend must identify the Phase 4E Danger Zone canary");

assert(dangerSource.includes('data-tvtracker-vue-danger-settings="danger-zone"'),"Danger Zone Vue must expose an E2E ownership marker");
assert(dangerSource.includes('id="reset-data-button"'),"Danger Zone Vue must preserve the legacy reset-data-button element contract");
assert(dangerSource.includes("window.resetTrackerData()"),"Danger Zone Vue must delegate reset execution to the existing destructive service boundary");
assert(dangerSource.includes(">Deactivate account</button>"),"Danger Zone Vue must preserve the deactivation placeholder");
assert(dangerSource.includes(">Delete account</button>"),"Danger Zone Vue must preserve the deletion placeholder");
assert((dangerSource.match(/\bdisabled\b/g) || []).length >= 3,"Danger Zone Vue must keep unavailable destructive controls disabled, including the bridge guard");
assert(dangerSource.includes("Available when user accounts are enabled."),"Danger Zone Vue must preserve the account-control availability note");
assert(!dangerSource.includes("showAppConfirm"),"Danger Zone Vue must not duplicate destructive confirmation policy");
assert(!dangerSource.includes("confirm("),"Danger Zone Vue must not introduce browser-native destructive confirmation");
assert(!dangerSource.includes("fetch("),"Danger Zone Vue must not duplicate destructive transport or persistence");
assert(!dangerSource.includes("/api/"),"Danger Zone Vue must not introduce a parallel destructive API contract");
assert(!dangerSource.includes("localStorage"),"Danger Zone Vue must not take ownership of destructive client-storage cleanup");
assert(!dangerSource.includes("sessionStorage"),"Danger Zone Vue must not take ownership of destructive client-storage cleanup");
assert(!dangerSource.includes("DATA ="),"Danger Zone Vue must not replace tracker state directly");

assert(settingsSource.includes("function renderDanger()"),"Legacy Danger Zone renderer must remain available as the lazy-load fallback");
assert(settingsSource.includes("function bindDanger()"),"Legacy Danger Zone binding must remain available as the lazy-load fallback");
assert(settingsSource.includes('global.resetTrackerData'),"Legacy Danger Zone must continue delegating to the canonical reset function");
assert(appSource.includes("async function resetTrackerData()"),"Canonical tracker reset logic must remain in app.js during Phase 4E");
assert(appSource.includes('title:"Reset All Tracker Data"'),"Canonical tracker reset must retain the established destructive confirmation flow");
assert(appSource.includes("showAppConfirm({"),"Canonical tracker reset confirmation must remain outside Vue");

let section = "danger-zone";
let legacyRenderCalls = 0;
const legacyOpenCalls = [];
const dispatched = [];
const legacy = {
    render(){ legacyRenderCalls += 1; },
    open(next,options){ section = next; legacyOpenCalls.push({next,options}); },
    current(){ return section; },
    normalizeSection(value){ return ["profile","auth","notifications","streaming","data","danger-zone"].includes(value) ? value : "profile"; },
    routeFor(value){ return `/app/settings/${value}`; },
    sectionFromPath(){ return section; },
    sections:[
        {id:"profile",label:"PROFILE"},
        {id:"auth",label:"AUTH"},
        {id:"notifications",label:"NOTIFICATIONS"},
        {id:"streaming",label:"STREAMING"},
        {id:"data",label:"DATA"},
        {id:"danger-zone",label:"DANGER ZONE"}
    ]
};
class CustomEvent {
    constructor(type,options={}){ this.type=type; this.detail=options.detail; }
}
const document = { dispatchEvent(event){ dispatched.push(event); return true; } };
const window = {TVTrackerSettings:legacy,activePage:"settings",document,CustomEvent};
window.window = window;
vm.runInNewContext(bridgeSource,{window},{filename:"settings-vue-bridge.js"});
const bridge = window.TVTrackerSettingsBridge;
assert(bridge,"Settings bridge must install over the legacy fallback");

bridge.render();
assert.strictEqual(legacyRenderCalls,1,"Before Vue loads, Danger Zone must render through the legacy fallback");
assert.strictEqual(dispatched.length,1,"Danger Zone fallback must request the lazy Vue owner");
assert.strictEqual(dispatched[0].detail.section,"danger-zone");
assert.deepStrictEqual(Array.from(bridge.vueCanarySections),["streaming","notifications","profile","auth","data","danger-zone"],"All six current Settings sections must be guarded Vue canaries in Phase 4E");

const vueRenders = [];
let vueUnmountCalls = 0;
const vueOwner = {
    supports(value){ return ["streaming","notifications","profile","auth","data","danger-zone"].includes(value); },
    render(value){ vueRenders.push(value); },
    unmount(){ vueUnmountCalls += 1; }
};
bridge.attachVueOwner(vueOwner);
assert.deepStrictEqual(vueRenders,["danger-zone"],"Attaching Vue while Danger Zone is visible must hand ownership to Vue");
assert.strictEqual(legacyRenderCalls,1,"Vue handoff must not render legacy Danger Zone concurrently");

section = "data";
bridge.render();
assert.deepStrictEqual(vueRenders,["danger-zone","data"],"Switching between Danger Zone and Data must stay inside the guarded Vue owner");
assert.strictEqual(vueUnmountCalls,0,"The Vue owner must control its own section-to-section remount");

section = "billing";
bridge.render();
assert.strictEqual(vueUnmountCalls,1,"Unsupported Settings values must still unmount Vue before the legacy fail-safe runs");
assert.strictEqual(legacyRenderCalls,2,"The legacy renderer must remain reachable as a fail-safe even after all current sections are Vue canaries");

section = "danger-zone";
bridge.open("danger-zone",{fromRoute:true,skipShowPage:true});
assert.strictEqual(legacyOpenCalls.length,1,"Bridge must preserve legacy route/state ownership for Danger Zone");
assert.strictEqual(legacyOpenCalls[0].next,"danger-zone");
assert.strictEqual(legacyOpenCalls[0].options.skipShowPage,false,"Loaded Danger Zone Vue owner must route through the normal render cycle");

console.log("Frontend modernization Phase 4E Danger Zone Settings ownership tests passed.");
