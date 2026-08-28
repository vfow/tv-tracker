"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const dataSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsData.vue"),"utf8");
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4D_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4d-vue-build.yml")),"The temporary write-enabled Phase 4D build workflow must not survive the phase");
}

assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("data");'),"Phase 4D must add Data to the guarded Vue Settings lineage");
assert(bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("auth");') < bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("data");'),"Data must extend the proven Settings canary sequence rather than replace it");
assert(bridgeSource.includes("return legacy.render();"),"Legacy Settings rendering must remain the fail-safe fallback");

assert(mainSource.includes("import SettingsData from './settings/SettingsData.vue';"),"Data must have a dedicated Vue component");
assert(mainSource.includes("section === 'data'"),"The guarded Vue owner must explicitly recognize Data");
assert(mainSource.includes("createApp(SettingsData)"),"Data must mount through its dedicated Vue app");
assert(mainSource.includes("FRONTEND_FOUNDATION_VERSION"),"The compiled frontend must retain explicit foundation versioning after Phase 4D");

assert(dataSource.includes('data-tvtracker-vue-data-settings="data"'),"Data Vue must expose an E2E ownership marker");
for(const id of [
    "export-native-backup-button",
    "import-native-backup-button",
    "export-html-report-button"
]){
    assert(dataSource.includes(`id="${id}"`),`Data Vue must preserve the legacy ${id} element contract`);
}
assert(dataSource.includes("window.getBackupSummary?.()"),"Data Vue must delegate summary generation to the existing backup service boundary");
assert(dataSource.includes("window.exportNativeBackupJSON()"),"Data Vue must delegate native backup export to the existing service boundary");
assert(dataSource.includes("window.importNativeBackupJSON()"),"Data Vue must delegate native backup import to the existing service boundary");
assert(dataSource.includes("window.exportHTMLReport()"),"Data Vue must delegate report export to the existing service boundary");
assert(!dataSource.includes("fetch("),"Data Vue must not duplicate backup transport or persistence");
assert(!dataSource.includes("/api/"),"Data Vue must not introduce a parallel backup API contract");
assert(!dataSource.includes("FileReader"),"Data Vue must not take ownership of backup file parsing");
assert(!dataSource.includes("JSON.parse"),"Data Vue must not take ownership of backup validation/parsing");
assert(!dataSource.includes("JSON.stringify"),"Data Vue must not take ownership of native backup serialization");
assert(!dataSource.includes('document.createElement("input")'),"Data Vue must not replace the established import file-picker workflow");

assert(settingsSource.includes("function renderData()"),"Legacy Data renderer must remain available as the lazy-load fallback");
assert(settingsSource.includes("function bindData()"),"Legacy Data bindings must remain available as the lazy-load fallback");
assert(appSource.includes("function getBackupSummary()"),"Canonical backup summary logic must remain in app.js during Phase 4D");
assert(appSource.includes("function exportNativeBackupJSON()"),"Canonical native backup export must remain in app.js during Phase 4D");
assert(appSource.includes("function importNativeBackupJSON()"),"Canonical native backup import must remain in app.js during Phase 4D");
assert(appSource.includes("function exportHTMLReport()"),"Canonical HTML report export must remain in app.js during Phase 4D");

let section = "data";
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
assert.strictEqual(legacyRenderCalls,1,"Before Vue loads, Data must render through the legacy fallback");
assert.strictEqual(dispatched.length,1,"Data fallback must request the lazy Vue owner");
assert.strictEqual(dispatched[0].detail.section,"data");
assert.deepStrictEqual(Array.from(bridge.vueCanarySections).slice(0,5),["streaming","notifications","profile","auth","data"],"The first five proven Settings canaries must preserve the Phase 4D lineage");

const vueRenders = [];
let vueUnmountCalls = 0;
const vueOwner = {
    supports(value){ return ["streaming","notifications","profile","auth","data"].includes(value); },
    render(value){ vueRenders.push(value); },
    unmount(){ vueUnmountCalls += 1; }
};
bridge.attachVueOwner(vueOwner);
assert.deepStrictEqual(vueRenders,["data"],"Attaching Vue while Data is visible must hand ownership to Vue");
assert.strictEqual(legacyRenderCalls,1,"Vue handoff must not render legacy Data concurrently");

section = "auth";
bridge.render();
assert.deepStrictEqual(vueRenders,["data","auth"],"Switching between Data and Auth must stay inside the guarded Vue owner");
assert.strictEqual(vueUnmountCalls,0,"The Vue owner must control its own section-to-section remount");

section = "billing";
bridge.render();
assert.strictEqual(vueUnmountCalls,1,"Unsupported Settings values must still unmount Vue before legacy rendering resumes");
assert.strictEqual(legacyRenderCalls,2,"The legacy renderer must remain reachable as a fail-safe after Phase 4D");

section = "data";
bridge.open("data",{fromRoute:true,skipShowPage:true});
assert.strictEqual(legacyOpenCalls.length,1,"Bridge must preserve legacy route/state ownership for Data");
assert.strictEqual(legacyOpenCalls[0].next,"data");
assert.strictEqual(legacyOpenCalls[0].options.skipShowPage,false,"Loaded Data Vue owner must route through the normal render cycle");

console.log("Frontend modernization Phase 4D Data Settings ownership tests passed.");
