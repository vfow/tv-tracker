"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const profileSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsProfile.vue"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");
const uiSource = fs.readFileSync(path.join(ROOT,"static/js/ui.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4B_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4b-vue-build.yml")),"The temporary write-enabled Phase 4B build workflow must not survive the phase");
}

assert(bridgeSource.includes('ownership:"vue"'),"Completed Settings ownership must keep Vue authoritative after the Phase 4B migration");
assert(mainSource.includes("import SettingsProfile from './settings/SettingsProfile.vue';"),"Profile must have a dedicated Vue component");
assert(mainSource.includes("section === 'profile'"),"The Vue owner must explicitly recognize Profile");
assert(mainSource.includes("createApp(SettingsProfile)"),"Profile must mount through its dedicated Vue app");
assert(mainSource.includes("FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation'"),"Later Settings work must preserve the Phase 2 frontend foundation lineage");

assert(profileSource.includes('data-tvtracker-vue-profile-settings="profile"'),"Profile Vue must expose an E2E ownership marker");
for(const id of [
    "profile-username-input",
    "settings-avatar-preview",
    "profile-header-preview-wrap",
    "upload-profile-avatar",
    "upload-profile-header",
    "adult-filter-input"
]){
    assert(profileSource.includes(`id="${id}"`),`Profile Vue must preserve the ${id} element contract`);
}
assert(profileSource.includes("window.openAvatarFilePicker()"),"Avatar upload/crop ownership must remain behind the existing UI service boundary");
assert(profileSource.includes("window.openProfileHeaderFilePicker()"),"Header upload/crop ownership must remain behind the existing UI service boundary");
assert(profileSource.includes("window.updateProfileSettingsPreview?.()"),"Profile previews must continue using the existing preview service");
assert(profileSource.includes("await window.saveProfileSettings(draft)"),"Profile persistence must remain behind the existing saveProfileSettings boundary");
assert(!profileSource.includes("fetch("),"Profile Vue must not duplicate backend transport");
assert(!profileSource.includes("saveData("),"Profile Vue must not bypass the canonical profile persistence service");
assert(!profileSource.includes("/api/"),"Profile Vue must not introduce a parallel API contract");

assert(appSource.includes("async function saveProfileSettings(settings)"),"Canonical Profile persistence must remain in app.js");
assert(uiSource.includes("function createProfileSettingsDraft()"),"Canonical Profile draft construction must remain in ui.js");
assert(uiSource.includes("function updateProfileSettingsPreview()"),"Canonical Profile preview bridge must remain in ui.js");
assert(uiSource.includes("function openAvatarFilePicker()"),"Canonical avatar upload/crop bridge must remain in ui.js");
assert(uiSource.includes("function openProfileHeaderFilePicker()"),"Canonical header upload/crop bridge must remain in ui.js");

console.log("Frontend modernization Phase 4B Profile service-boundary tests passed.");
