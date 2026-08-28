"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const loaderSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-loader.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const notificationsSource = fs.readFileSync(path.join(ROOT,"frontend/src/notifications/SettingsNotifications.vue"),"utf8");
const runtimeSource = fs.readFileSync(path.join(ROOT,"static/js/notifications-runtime.js"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,"static/vue/manifest.json"),"utf8"));

if(process.env.TVTRACKER_ALLOW_PHASE4A_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4a-vue-build.yml")),"The temporary write-enabled Phase 4A build workflow must not survive the phase");
}
assert(template.indexOf("js/notifications-runtime.js") < template.indexOf("js/settings-vue-bridge.js"),"Canonical notification runtime must exist before the Settings Vue bridge");
assert(template.indexOf("js/settings-vue-bridge.js") < template.indexOf("js/settings-vue-loader.js"),"Settings bridge must exist before its lazy loader");
assert(!template.includes("static/vue/"),"The Flask app shell must remain manifest-driven instead of pinning a Vue asset");

assert(bridgeSource.includes('const VUE_CANARY_SECTIONS = new Set(["streaming"]);'),"Phase 3 Streaming lineage must remain explicit");
assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("notifications");'),"Phase 4A Notifications lineage must remain explicit in the guarded Vue allowlist");
assert(bridgeSource.includes("return legacy.render();"),"Legacy Settings rendering must remain the fail-safe fallback");
assert(loaderSource.includes("vue_settings_load_failed"),"Lazy Vue load failures must remain observable through privacy-safe telemetry");

assert(mainSource.includes("return section === 'streaming';"),"Streaming Vue ownership from Phase 3 must remain intact");
assert(mainSource.includes("section === 'notifications'"),"The Vue Settings owner must continue recognizing Notifications");
assert(mainSource.includes("settingsSection === section"),"The owner must distinguish which Vue Settings section is currently mounted");
assert(mainSource.includes("createApp(SettingsStreaming)"),"Streaming must continue mounting its dedicated component");
assert(mainSource.includes("createApp(SettingsNotifications)"),"Notifications must continue mounting its dedicated Vue component");
assert(mainSource.includes("settingsSection = ''"),"Unmount must clear the Vue Settings section identity");

assert(notificationsSource.includes('data-tvtracker-vue-notifications-settings="notifications"'),"Notifications Vue shell must expose an E2E ownership marker");
assert(notificationsSource.includes('id="settings-v2-notification-list"'),"The Vue shell must preserve the canonical notification control mount id during migration");
assert(notificationsSource.includes("runtime.renderNotificationControls(list)"),"Vue must delegate control behavior to the hardened notification runtime in Phase 4A");
assert(!notificationsSource.includes("fetch("),"Phase 4A Vue must not duplicate notification API transport");
assert(!notificationsSource.includes("enablePush("),"Phase 4A Vue must not duplicate Push permission/subscription logic");
assert(!notificationsSource.includes("serviceWorker"),"Phase 4A Vue must not take service-worker ownership");
assert(runtimeSource.includes("renderNotificationControls"),"Canonical notification control ownership must remain in notifications-runtime.js");
assert(runtimeSource.includes("/api/notifications/settings"),"Canonical notification persistence must remain in notifications-runtime.js");

const entry = manifest["frontend/src/main.ts"];
assert(entry && /^assets\/[A-Za-z0-9_-]+\.js$/.test(entry.file),"Committed manifest must point at one hashed Vue entry");
const bundlePath = path.join(ROOT,"static/vue",entry.file);
assert(fs.existsSync(bundlePath),"Committed Vue entry must exist");
assert(fs.statSync(bundlePath).size > 10000,"Vue Settings bundle must remain a real compiled artifact");

let section = "notifications";
let legacyRenderCalls = 0;
const legacyOpenCalls = [];
const dispatched = [];
const legacy = {
    render(){ legacyRenderCalls += 1; },
    open(next,options){ section = next; legacyOpenCalls.push({next,options}); },
    current(){ return section; },
    normalizeSection(value){ return ["profile","auth","notifications","streaming"].includes(value) ? value : "profile"; },
    routeFor(value){ return `/app/settings/${value}`; },
    sectionFromPath(){ return section; },
    sections:[
        {id:"profile",label:"PROFILE"},
        {id:"auth",label:"AUTH"},
        {id:"notifications",label:"NOTIFICATIONS"},
        {id:"streaming",label:"STREAMING"}
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
assert.strictEqual(legacyRenderCalls,1,"Before Vue loads, Notifications must render through the legacy fallback");
assert.strictEqual(dispatched.length,1,"Notifications fallback must request the lazy Vue owner");
assert.strictEqual(dispatched[0].detail.section,"notifications");
assert.deepStrictEqual(Array.from(bridge.vueCanarySections).slice(0,2),["streaming","notifications"],"Streaming and Notifications must remain the first guarded Vue Settings lineage");

const vueRenders = [];
let vueUnmountCalls = 0;
const vueOwner = {
    supports(value){ return value === "streaming" || value === "notifications"; },
    render(value){ vueRenders.push(value); },
    unmount(){ vueUnmountCalls += 1; }
};
bridge.attachVueOwner(vueOwner);
assert.deepStrictEqual(vueRenders,["notifications"],"Attaching Vue while Notifications is visible must hand ownership to Vue");
assert.strictEqual(legacyRenderCalls,1,"Vue handoff must not render legacy Notifications concurrently");

section = "streaming";
bridge.render();
assert.deepStrictEqual(vueRenders,["notifications","streaming"],"Switching between the Phase 3/4A Vue Settings sections must stay inside the guarded Vue owner");
assert.strictEqual(vueUnmountCalls,0,"Bridge must let the Vue owner perform its own section-to-section remount");

section = "auth";
bridge.render();
assert.strictEqual(vueUnmountCalls,1,"Leaving the Phase 3/4A Vue owner must unmount Vue before legacy rendering resumes");
assert.strictEqual(legacyRenderCalls,2,"Auth must remain available through the legacy fallback");

section = "notifications";
bridge.open("notifications",{fromRoute:true,skipShowPage:true});
assert.strictEqual(legacyOpenCalls.length,1,"Bridge must preserve legacy route/state ownership");
assert.strictEqual(legacyOpenCalls[0].next,"notifications");
assert.strictEqual(legacyOpenCalls[0].options.skipShowPage,false,"Loaded Notifications Vue owner must route through the normal render cycle");

console.log("Frontend modernization Phase 4A Notifications Settings ownership tests passed.");
