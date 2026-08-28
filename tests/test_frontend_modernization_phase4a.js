"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

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
assert(template.indexOf("js/settings-vue-bridge.js") < template.indexOf("js/settings-vue-loader.js"),"Settings bridge must exist before its manifest loader");
assert(!template.includes("static/vue/"),"The Flask app shell must remain manifest-driven instead of pinning a Vue asset");
assert(bridgeSource.includes('ownership:"vue"'),"Completed Settings ownership must keep Vue authoritative after the Phase 4A migration");
assert(loaderSource.includes("vue_settings_load_failed"),"Vue Settings load failures must remain observable through privacy-safe telemetry");

assert(mainSource.includes("return section === 'streaming';"),"Streaming Vue ownership from Phase 3 must remain intact");
assert(mainSource.includes("section === 'notifications'"),"The Vue Settings owner must continue recognizing Notifications");
assert(mainSource.includes("createApp(SettingsStreaming)"),"Streaming must continue mounting its dedicated component");
assert(mainSource.includes("createApp(SettingsNotifications)"),"Notifications must continue mounting its dedicated Vue component");

assert(notificationsSource.includes('data-tvtracker-vue-notifications-settings="notifications"'),"Notifications Vue shell must expose an E2E ownership marker");
assert(notificationsSource.includes('id="settings-v2-notification-list"'),"The Vue shell must preserve the canonical notification control mount id");
assert(notificationsSource.includes("runtime.renderNotificationControls(list)"),"Vue must delegate control behavior to the hardened notification runtime");
assert(!notificationsSource.includes("fetch("),"Notifications Vue must not duplicate notification API transport");
assert(!notificationsSource.includes("enablePush("),"Notifications Vue must not duplicate Push permission/subscription logic");
assert(!notificationsSource.includes("serviceWorker"),"Notifications Vue must not take service-worker ownership");
assert(runtimeSource.includes("renderNotificationControls"),"Canonical notification control ownership must remain in notifications-runtime.js");
assert(runtimeSource.includes("/api/notifications/settings"),"Canonical notification persistence must remain in notifications-runtime.js");

const entry = manifest["frontend/src/main.ts"];
assert(entry && /^assets\/[A-Za-z0-9_-]+\.js$/.test(entry.file),"Committed manifest must point at one hashed Vue entry");
const bundlePath = path.join(ROOT,"static/vue",entry.file);
assert(fs.existsSync(bundlePath),"Committed Vue entry must exist");
assert(fs.statSync(bundlePath).size > 10000,"Vue Settings bundle must remain a real compiled artifact");

console.log("Frontend modernization Phase 4A Notifications service-boundary tests passed.");
