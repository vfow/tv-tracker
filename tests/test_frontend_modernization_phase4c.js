"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const authSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsAuth.vue"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4C_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4c-vue-build.yml")),"The temporary write-enabled Phase 4C build workflow must not survive the phase");
}

assert(bridgeSource.includes('ownership:"vue"'),"Completed Settings ownership must keep Vue authoritative after the Phase 4C migration");
assert(mainSource.includes("import SettingsAuth from './settings/SettingsAuth.vue';"),"Auth must have a dedicated Vue component");
assert(mainSource.includes("section === 'auth'"),"The Vue owner must explicitly recognize Auth");
assert(mainSource.includes("createApp(SettingsAuth)"),"Auth must mount through its dedicated Vue app");
assert(mainSource.includes("FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation'"),"Later Settings work must preserve the Phase 2 frontend foundation lineage");

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
    assert(authSource.includes(`id="${id}"`),`Auth Vue must preserve the ${id} element contract`);
}
assert(authSource.includes("window.loadAdminAccountIntoSettings?.()"),"Auth Vue must delegate account loading to the existing service boundary");
assert(authSource.includes("window.saveAdminAccountChanges()"),"Auth Vue must delegate credential persistence to the existing service boundary");
assert(authSource.includes('@input="markUsernameEdited"'),"Auth Vue must preserve the username edit guard while account loading is in flight");
assert(authSource.includes("input.dataset.userEdited = 'true'"),"Auth Vue must mark locally edited usernames before the loader can overwrite them");
assert(authSource.includes("clientStorage.clearOnLogout()"),"Auth Vue must preserve best-effort client-storage cleanup before logout");
assert(authSource.includes('name="csrf_token"'),"Auth Vue logout must preserve the CSRF form field");
assert(authSource.includes('method="post" action="/logout"'),"Auth Vue logout must remain a server POST");
assert(!authSource.includes("fetch("),"Auth Vue must not duplicate authentication transport");
assert(!authSource.includes("/api/"),"Auth Vue must not introduce a parallel authentication API contract");
assert(!authSource.includes("v-model"),"Auth Vue must not retain password values in Vue reactive state");

assert(appSource.includes("function getAdminAccountUsername()"),"Canonical account state accessor must remain in app.js");
assert(appSource.includes("async function loadAdminAccountIntoSettings"),"Canonical account loading must remain in app.js");
assert(appSource.includes('input.dataset.userEdited !== "true"'),"Canonical account loading must continue honoring the username edit guard");
assert(appSource.includes("async function saveAdminAccountChanges()"),"Canonical credential persistence must remain in app.js");

console.log("Frontend modernization Phase 4C Auth service-boundary tests passed.");
