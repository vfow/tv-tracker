"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const authSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsAuth.vue"),"utf8");
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4C_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4c-vue-build.yml")),"The temporary write-enabled Phase 4C build workflow must not survive the phase");
}

assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("auth");'),"Phase 4C must add Auth to the guarded Vue Settings lineage");
assert(bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("profile");') < bridgeSource.indexOf('VUE_CANARY_SECTIONS.add("auth");'),"Auth must extend the proven Settings canary sequence rather than replace it");
assert(bridgeSource.includes("return legacy.render();"),"Legacy Settings rendering must remain the fail-safe fallback");

assert(mainSource.includes("import SettingsAuth from './settings/SettingsAuth.vue';"),"Auth must have a dedicated Vue component");
assert(mainSource.includes("section === 'auth'"),"The guarded Vue owner must explicitly recognize Auth");
assert(mainSource.includes("createApp(SettingsAuth)"),"Auth must mount through its dedicated Vue app");
assert(mainSource.includes("phase4c-settings-auth-canary"),"The compiled frontend must identify the Phase 4C Auth canary");

assert(authSource.includes('data-tvtracker-vue-auth-settings="auth"'),"Auth Vue must expose an E2E ownership marker");
for(const id of [
    "admin-account-form",
    "admin-username-input",
    "admin-current-password-input",
    "admin-new-password-input",
    "admin-confirm-password-input",
    "admin-account-status",
    "save-admin-account"
]){
    assert(authSource.includes(`id="${id}"`),`Auth Vue must preserve the legacy ${id} element contract`);
}
assert(authSource.includes("window.loadAdminAccountIntoSettings?.()"),"Auth Vue must delegate account loading to the existing service boundary");
assert(authSource.includes("window.saveAdminAccountChanges()"),"Auth Vue must delegate credential persistence to the existing service boundary");
assert(authSource.includes('@input="markUsernameEdited"'),"Auth Vue must preserve the legacy username edit guard while account loading is in flight");
assert(authSource.includes("input.dataset.userEdited = 'true'"),"Auth Vue must mark locally edited usernames before the legacy loader can overwrite them");
assert(authSource.includes("clientStorage.clearOnLogout()"),"Auth Vue must preserve best-effort client-storage cleanup before logout");
assert(authSource.includes('name="csrf_token"'),"Auth Vue logout must preserve the CSRF form field");
assert(authSource.includes('method="post" action="/logout"'),"Auth Vue logout must remain a server POST");
assert(!authSource.includes("fetch("),"Auth Vue must not duplicate authentication transport");
assert(!authSource.includes("/api/"),"Auth Vue must not introduce a parallel authentication API contract");
assert(!authSource.includes("v-model"),"Auth Vue must not retain password values in Vue reactive state");

assert(settingsSource.includes("function renderAuth()"),"Legacy Auth renderer must remain available as the lazy-load fallback");
assert(appSource.includes("function getAdminAccountUsername()"),"Canonical account state accessor must remain in app.js during Phase 4C");
assert(appSource.includes("async function loadAdminAccountIntoSettings"),"Canonical account loading must remain in app.js during Phase 4C");
assert(appSource.includes('input.dataset.userEdited !== "true"'),"Canonical account loading must continue honoring the username edit guard");
assert(appSource.includes("async function saveAdminAccountChanges()"),"Canonical credential persistence must remain in app.js during Phase 4C");

let section = "auth";
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
assert.strictEqual(legacyRenderCalls,1,"Before Vue loads, Auth must render through the legacy fallback");
assert.strictEqual(dispatched.length,1,"Auth fallback must request the lazy Vue owner");
assert.strictEqual(dispatched[0].detail.section,"auth");
assert.deepStrictEqual(Array.from(bridge.vueCanarySections),["streaming","notifications","profile","auth"],"Only the four proven Settings sections may be Vue-owned in Phase 4C");

const vueRenders = [];
let vueUnmountCalls = 0;
const vueOwner = {
    supports(value){ return ["streaming","notifications","profile","auth"].includes(value); },
    render(value){ vueRenders.push(value); },
    unmount(){ vueUnmountCalls += 1; }
};
bridge.attachVueOwner(vueOwner);
assert.deepStrictEqual(vueRenders,["auth"],"Attaching Vue while Auth is visible must hand ownership to Vue");
assert.strictEqual(legacyRenderCalls,1,"Vue handoff must not render legacy Auth concurrently");

section = "profile";
bridge.render();
assert.deepStrictEqual(vueRenders,["auth","profile"],"Switching between Auth and Profile must stay inside the guarded Vue owner");
assert.strictEqual(vueUnmountCalls,0,"The Vue owner must control its own section-to-section remount");

section = "data";
bridge.render();
assert.strictEqual(vueUnmountCalls,1,"Leaving the Phase 4C allowlist must unmount Vue before legacy rendering resumes");
assert.strictEqual(legacyRenderCalls,2,"Data must remain legacy-owned in Phase 4C");

section = "auth";
bridge.open("auth",{fromRoute:true,skipShowPage:true});
assert.strictEqual(legacyOpenCalls.length,1,"Bridge must preserve legacy route/state ownership for Auth");
assert.strictEqual(legacyOpenCalls[0].next,"auth");
assert.strictEqual(legacyOpenCalls[0].options.skipShowPage,false,"Loaded Auth Vue owner must route through the normal render cycle");

console.log("Frontend modernization Phase 4C Auth Settings ownership tests passed.");
