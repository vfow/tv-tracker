"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const mainSource = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const dataSource = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsData.vue"),"utf8");
const appSource = fs.readFileSync(path.join(ROOT,"static/js/app.js"),"utf8");

if(process.env.TVTRACKER_ALLOW_PHASE4D_GENERATOR !== "1"){
    assert(!fs.existsSync(path.join(ROOT,".github/workflows/phase4d-vue-build.yml")),"The temporary write-enabled Phase 4D build workflow must not survive the phase");
}

assert(bridgeSource.includes('ownership:"vue"'),"Completed Settings ownership must keep Vue authoritative after the Phase 4D migration");
assert(mainSource.includes("import SettingsData from './settings/SettingsData.vue';"),"Data must have a dedicated Vue component");
assert(mainSource.includes("section === 'data'"),"The Vue owner must explicitly recognize Data");
assert(mainSource.includes("createApp(SettingsData)"),"Data must mount through its dedicated Vue app");
assert(mainSource.includes("FRONTEND_FOUNDATION_VERSION"),"The compiled frontend must retain explicit foundation versioning");

assert(dataSource.includes('data-tvtracker-vue-data-settings="data"'),"Data Vue must expose an E2E ownership marker");
for(const id of [
    "export-native-backup-button",
    "import-native-backup-button",
    "export-html-report-button"
]){
    assert(dataSource.includes(`id="${id}"`),`Data Vue must preserve the ${id} element contract`);
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

assert(appSource.includes("function getBackupSummary()"),"Canonical backup summary logic must remain in app.js");
assert(appSource.includes("function exportNativeBackupJSON()"),"Canonical native backup export must remain in app.js");
assert(appSource.includes("function importNativeBackupJSON()"),"Canonical native backup import must remain in app.js");
assert(appSource.includes("function exportHTMLReport()"),"Canonical HTML report export must remain in app.js");

console.log("Frontend modernization Phase 4D Data service-boundary tests passed.");
