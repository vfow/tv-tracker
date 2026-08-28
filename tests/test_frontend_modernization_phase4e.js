"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const dangerSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsDanger.vue"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4E_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4e-vue-build.yml")),"The temporary write-enabled Phase 4E build workflow must not survive the phase");
}

assert(bridgeSource.includes('ownership:"vue"'),"Completed Settings ownership must keep Vue authoritative after the Phase 4E migration");
assert(mainSource.includes("import SettingsDanger from './settings/SettingsDanger.vue';"),"Danger Zone must have a dedicated Vue component");
assert(mainSource.includes("section === 'danger-zone'"),"The Vue owner must explicitly recognize Danger Zone");
assert(mainSource.includes("createApp(SettingsDanger)"),"Danger Zone must mount through its dedicated Vue app");

assert(dangerSource.includes('data-tvtracker-vue-danger-settings="danger-zone"'),"Danger Zone Vue must expose an E2E ownership marker");
assert(dangerSource.includes('id="reset-data-button"'),"Danger Zone Vue must preserve the reset-data-button element contract");
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

assert(appSource.includes("async function resetTrackerData()"),"Canonical tracker reset logic must remain in app.js");
assert(appSource.includes('title:"Reset All Tracker Data"'),"Canonical tracker reset must retain the established destructive confirmation flow");
assert(appSource.includes("showAppConfirm({"),"Canonical tracker reset confirmation must remain outside Vue");

console.log("Frontend modernization Phase 4E Danger Zone service-boundary tests passed.");
