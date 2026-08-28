"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const loaderSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-loader.js"),"utf8");
const componentSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsStreaming.vue"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,"static/vue/manifest.json"),"utf8"));

assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase3-vue-build.yml")),"The temporary write-enabled build workflow must not survive Phase 3");
assert(template.indexOf("js/settings.js") < template.indexOf("js/settings-vue-bridge.js"),"Legacy Settings must load before its bridge");
assert(template.indexOf("js/settings-vue-bridge.js") < template.indexOf("js/settings-vue-loader.js"),"Bridge must load before the lazy loader");
assert(template.indexOf("js/settings-vue-loader.js") < template.indexOf("js/app-router.js"),"Lazy Settings owner must be available before routing starts");
assert(!template.includes("static/vue/"),"The app shell must not pin a generated Vue filename");

assert(bridgeSource.includes('new Set(["streaming"])'),"Only Streaming Settings may opt into Vue in this canary");
assert(bridgeSource.includes("return legacy.render();"),"Bridge must retain a legacy rendering fallback");
assert(loaderSource.includes('cache:"no-store"'),"Manifest lookup must be fresh across deploys");
assert(loaderSource.includes('/^assets\\/[A-Za-z0-9_-]+\\.js$/'),"Manifest output must be validated before dynamic import");
assert(loaderSource.includes("vue_settings_load_failed"),"Vue-load failure must be sent through privacy-safe runtime telemetry");

assert(mainSource.includes("return section === 'streaming';"),"Vue Settings owner may support only Streaming in Phase 3");
assert(mainSource.includes("createApp(SettingsStreaming)"),"Streaming canary must mount the dedicated Vue component");
assert(componentSource.includes("saveData({ stateKeys: ['profile'] })"),"Streaming canary must preserve the existing profile persistence boundary");
assert(componentSource.includes("api.setStreamingRegion(before)"),"Failed saves must restore the previous streaming region");
assert(componentSource.includes("onBeforeUnmount"),"Vue Settings listeners must be cleaned up on unmount");
for(const key of ["ArrowDown","ArrowUp","Home","End","Enter","Escape","Tab"]){
    assert(componentSource.includes(`'${key}'`),`Streaming combobox must preserve ${key} keyboard behavior`);
}

const entry = manifest["frontend/src/main.ts"];
assert(entry && /^assets\/[A-Za-z0-9_-]+\.js$/.test(entry.file),"Committed manifest must point at one hashed Vue entry");
const bundlePath = path.join(ROOT,"static/vue",entry.file);
assert(fs.existsSync(bundlePath),"Committed Vue entry must exist");
assert(fs.statSync(bundlePath).size > 10000,"Vue Settings canary bundle must be a real compiled artifact");

let section = "streaming";
let legacyRenderCalls = 0;
const legacyOpenCalls = [];
const dispatched = [];
const legacy = {
    render(){ legacyRenderCalls += 1; },
    open(next,options){ section = next; legacyOpenCalls.push({next,options}); },
    current(){ return section; },
    normalizeSection(value){ return ["profile","streaming"].includes(value) ? value : "profile"; },
    routeFor(value){ return `/app/settings/${value}`; },
    sectionFromPath(){ return section; },
    sections:[{id:"profile",label:"PROFILE"},{id:"streaming",label:"STREAMING"}]
};
class CustomEvent {
    constructor(type,options={}){ this.type=type; this.detail=options.detail; }
}
const document = {
    dispatchEvent(event){ dispatched.push(event); return true; }
};
const window = {
    TVTrackerSettings:legacy,
    activePage:"settings",
    document,
    CustomEvent
};
window.window = window;
vm.runInNewContext(bridgeSource,{window},{filename:"settings-vue-bridge.js"});
const bridge = window.TVTrackerSettingsBridge;
assert(bridge,"Settings bridge must install over the legacy fallback");
assert.strictEqual(window.TVTrackerSettings,bridge,"Router-facing Settings API must be the guarded bridge");
assert.strictEqual(window.renderSettings,bridge.render,"Existing app/ui callers must keep using the global render handoff");

bridge.render();
assert.strictEqual(legacyRenderCalls,1,"Before Vue loads, Streaming must render through the legacy fallback");
assert.strictEqual(dispatched.length,1,"Streaming fallback should request the lazy Vue owner exactly once per render attempt");
assert.strictEqual(dispatched[0].type,"tvtracker:settings-vue-needed");
assert.strictEqual(dispatched[0].detail.section,"streaming");

let vueRenderCalls = 0;
let vueUnmountCalls = 0;
const vueOwner = {
    supports(value){ return value === "streaming"; },
    render(value){ assert.strictEqual(value,"streaming"); vueRenderCalls += 1; },
    unmount(){ vueUnmountCalls += 1; }
};
bridge.attachVueOwner(vueOwner);
assert.strictEqual(vueRenderCalls,1,"Attaching Vue while Streaming is visible must hand ownership to Vue");
assert.strictEqual(legacyRenderCalls,1,"Vue handoff must not render legacy Streaming at the same time");

section = "profile";
bridge.render();
assert.strictEqual(vueUnmountCalls,1,"Leaving the canary must unmount Vue before legacy rendering resumes");
assert.strictEqual(legacyRenderCalls,2,"Non-canary Settings sections must remain legacy-owned");

section = "streaming";
bridge.open("streaming",{fromRoute:true,skipShowPage:true});
assert.strictEqual(legacyOpenCalls.length,1,"The bridge must preserve legacy route/state ownership");
assert.strictEqual(legacyOpenCalls[0].next,"streaming");
assert.strictEqual(legacyOpenCalls[0].options.fromRoute,true);
assert.strictEqual(legacyOpenCalls[0].options.skipShowPage,false,"Loaded Vue canary must route through the normal render cycle instead of legacy direct-render bypass");

console.log("Frontend modernization Phase 3 guarded Streaming Settings canary tests passed.");
