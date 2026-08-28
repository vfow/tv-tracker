"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const loaderSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-loader.js"),"utf8");
const componentSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsStreaming.vue"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,"static/vue/manifest.json"),"utf8"));

assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase3-vue-build.yml")),"The temporary write-enabled Phase 3 build workflow must not survive the phase");
assert(template.indexOf("js/settings.js") < template.indexOf("js/settings-vue-bridge.js"),"Settings route state must load before its Vue ownership bridge");
assert(template.indexOf("js/settings-vue-bridge.js") < template.indexOf("js/settings-vue-loader.js"),"Bridge must load before the manifest loader");
assert(template.indexOf("js/settings-vue-loader.js") < template.indexOf("js/app-router.js"),"Settings Vue loading must be available before routing starts");
assert(!template.includes("static/vue/"),"The app shell must not pin a generated Vue filename");

assert(bridgeSource.includes('ownership:"vue"'),"Completed Settings ownership must keep Vue authoritative after the Phase 3 Streaming migration");
assert(!bridgeSource.includes("legacy.render"),"Completed Settings ownership must not restore the transitional legacy renderer");
assert(loaderSource.includes('cache:"no-store"'),"Manifest lookup must remain fresh across deploys");
assert(loaderSource.includes('/^assets\\/[A-Za-z0-9_-]+\\.js$/'),"Manifest output must be validated before dynamic import");
assert(loaderSource.includes("vue_settings_load_failed"),"Vue-load failure must remain privacy-safe and observable");

assert(mainSource.includes("return section === 'streaming';"),"Streaming must remain supported by the Vue Settings owner");
assert(mainSource.includes("createApp(SettingsStreaming)"),"Streaming must continue mounting the dedicated Vue component");
assert(mainSource.includes("FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation'"),"Later Settings work must preserve the Phase 2 Vue foundation lineage");
assert(componentSource.includes('data-tvtracker-vue-settings="streaming"'),"Streaming Vue must retain its E2E ownership marker");
assert(componentSource.includes("saveData({ stateKeys: ['profile'] })"),"Streaming must preserve the existing profile persistence boundary");
assert(componentSource.includes("api.setStreamingRegion(before)"),"Failed saves must restore the previous streaming region");
assert(componentSource.includes("onBeforeUnmount"),"Streaming Vue listeners must be cleaned up on unmount");
for(const key of ["ArrowDown","ArrowUp","Home","End","Enter","Escape","Tab"]){
    assert(componentSource.includes(`'${key}'`),`Streaming combobox must preserve ${key} keyboard behavior`);
}

const entry = manifest["frontend/src/main.ts"];
assert(entry && /^assets\/[A-Za-z0-9_-]+\.js$/.test(entry.file),"Committed manifest must point at one hashed Vue entry");
const bundlePath = path.join(ROOT,"static/vue",entry.file);
assert(fs.existsSync(bundlePath),"Committed Vue entry must exist");
assert(fs.statSync(bundlePath).size > 10000,"Vue Settings bundle must remain a real compiled artifact");

console.log("Frontend modernization Phase 3 Streaming service-boundary tests passed.");
