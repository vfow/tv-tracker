"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const profileSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsProfile.vue"),"utf8");
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");
const uiSource = fs.readFileSync(path.join(ROOT,"static/js/ui.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4B_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4b-vue-build.yml")),"The temporary write-enabled Phase 4B build workflow must not survive the phase");
}

assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("profile");'),"Phase 4B must preserve Profile in the guarded Vue Settings lineage");
assert(bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("notifications");') < bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("profile");'),"Profile must extend the established Settings canary sequence rather than replace it");
assert(bridgeSource.includes("return legacy.render();"),"Legacy Settings rendering must remain the fail-safe fallback");

assert(mainSource.includes("import SettingsProfile from './settings/SettingsProfile.vue';"),"Profile must have a dedicated Vue component");
assert(mainSource.includes("section === 'profile'"),"The guarded Vue owner must explicitly recognize Profile");
assert(mainSource.includes("createApp(SettingsProfile)"),"Profile must mount through its dedicated Vue app");
assert(mainSource.includes("FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation'"),"Later Settings canaries must preserve the Phase 2 frontend foundation lineage");

assert(profileSource.includes('data-tvtracker-vue-profile-settings="profile"'),"Profile Vue must expose an E2E ownership marker");
assert(profileSource.includes('id="profile-username-input"'),"Profile Vue must preserve the legacy username element contract");
assert(profileSource.includes('id="settings-avatar-preview"'),"Profile Vue must preserve the avatar preview element contract");
assert(profileSource.includes('id="profile-header-preview-wrap"'),"Profile Vue must preserve the header preview element contract");
assert(profileSource.includes('id="upload-profile-avatar"'),"Profile Vue must preserve the avatar upload control contract");
assert(profileSource.includes('id="upload-profile-header"'),"Profile Vue must preserve the header upload control contract");
assert(profileSource.includes('id="adult-filter-input"'),"Profile Vue must preserve the adult-filter control contract");
assert(profileSource.includes("window.openAvatarFilePicker()"),"Avatar upload/crop ownership must remain behind the existing UI service boundary");
assert(profileSource.includes("window.openProfileHeaderFilePicker()"),"Header upload/crop ownership must remain behind the existing UI service boundary");
assert(profileSource.includes("window.updateProfileSettingsPreview?.()"),"Profile previews must continue using the existing preview service during the canary");
assert(profileSource.includes("await window.saveProfileSettings(draft)"),"Profile persistence must remain behind the existing saveProfileSettings boundary");
assert(!profileSource.includes("fetch("),"Profile Vue must not duplicate backend transport");
assert(!profileSource.includes("saveData("),"Profile Vue must not bypass the canonical profile persistence service");
assert(!profileSource.includes("/api/"),"Profile Vue must not introduce a parallel API contract");

assert(settingsSource.includes("function renderProfile()"),"Legacy Profile renderer must remain available as the lazy-load fallback");
assert(appSource.includes("async function saveProfileSettings(settings)"),"Canonical Profile persistence must remain in app.js during Phase 4B");
assert(uiSource.includes("function createProfileSettingsDraft()"),"Canonical Profile draft construction must remain in ui.js during Phase 4B");
assert(uiSource.includes("function updateProfileSettingsPreview()"),"Canonical Profile preview bridge must remain in ui.js during Phase 4B");
assert(uiSource.includes("function openAvatarFilePicker()"),"Canonical avatar upload/crop bridge must remain in ui.js during Phase 4B");
assert(uiSource.includes("function openProfileHeaderFilePicker()"),"Canonical header upload/crop bridge must remain in ui.js during Phase 4B");

let section = "profile";
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
assert.strictEqual(legacyRenderCalls,1,"Before Vue loads, Profile must render through the legacy fallback");
assert.strictEqual(dispatched.length,1,"Profile fallback must request the lazy Vue owner");
assert.strictEqual(dispatched[0].detail.section,"profile");
assert.deepStrictEqual(Array.from(bridge.vueCanarySections).slice(0,3),["streaming","notifications","profile"],"Streaming, Notifications, and Profile must remain the first three proven Settings canaries");

const vueRenders = [];
let vueUnmountCalls = 0;
const vueOwner = {
    supports(value){ return ["streaming","notifications","profile"].includes(value); },
    render(value){ vueRenders.push(value); },
    unmount(){ vueUnmountCalls += 1; }
};
bridge.attachVueOwner(vueOwner);
assert.deepStrictEqual(vueRenders,["profile"],"Attaching Vue while Profile is visible must hand ownership to Vue");
assert.strictEqual(legacyRenderCalls,1,"Vue handoff must not render legacy Profile concurrently");

section = "notifications";
bridge.render();
assert.deepStrictEqual(vueRenders,["profile","notifications"],"Switching from Profile to Notifications must stay within the guarded Vue owner");

section = "auth";
bridge.render();
assert.strictEqual(vueUnmountCalls,1,"A Vue owner that does not support Auth must unmount before legacy rendering resumes");
assert.strictEqual(legacyRenderCalls,2,"Legacy Auth fallback must remain usable by earlier-stage owners");

section = "profile";
bridge.open("profile",{fromRoute:true,skipShowPage:true});
assert.strictEqual(legacyOpenCalls.length,1,"Bridge must preserve legacy route/state ownership for Profile");
assert.strictEqual(legacyOpenCalls[0].next,"profile");
assert.strictEqual(legacyOpenCalls[0].options.skipShowPage,false,"Loaded Profile Vue owner must route through the normal render cycle");

console.log("Frontend modernization Phase 4B Profile Settings ownership tests passed.");
