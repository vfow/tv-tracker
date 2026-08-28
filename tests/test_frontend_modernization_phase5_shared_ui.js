"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const adapterPath = path.join(ROOT,"frontend/src/ui/feedback.ts");
const adapter = fs.readFileSync(adapterPath,"utf8");
const profile = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsProfile.vue"),"utf8");
const streaming = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsStreaming.vue"),"utf8");
const legacyFeedback = fs.readFileSync(path.join(ROOT,"static/js/feedback.js"),"utf8");
const core = fs.readFileSync(path.join(ROOT,"static/js/core/foundation.js"),"utf8");
const main = fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");

assert(adapter.includes("export const feedback = Object.freeze"),"Vue must expose one typed shared feedback adapter");
for(const method of ["success(message", "info(message", "warning(message", "error(message", "presentError"]){
    assert(adapter.includes(method),`Shared feedback adapter must expose ${method}`);
}
assert(adapter.includes("window.TVTrackerFeedback"),"The Vue adapter must delegate to the existing visible feedback owner");
assert(adapter.includes("window.TVTrackerCore?.feedback"),"The Vue adapter must reuse the canonical error-classification boundary");
assert(adapter.includes("surface.reportError"),"The Vue adapter must preserve the sanitized reportError fallback");
assert(adapter.includes("window.showToast"),"The adapter may retain the legacy compatibility bridge while feedback.js remains authoritative");
for(const forbiddenRendererToken of ["createElement(","appendChild(","insertAdjacentHTML(","innerHTML","tv-feedback-root","tv-offline-banner"]){
    assert(!adapter.includes(forbiddenRendererToken),`The Vue adapter must never render a second feedback surface (${forbiddenRendererToken})`);
}

for(const [name,source] of [["Profile",profile],["Streaming",streaming]]){
    assert(source.includes("from '../ui/feedback'"),`${name} Settings must use the shared Vue feedback boundary`);
    assert(source.includes("feedback."),`${name} Settings must call the shared feedback adapter`);
    assert(!source.includes("TVTrackerFeedback"),`${name} Settings must not access the visible feedback global directly`);
    assert(!source.includes("showToast"),`${name} Settings must not use the compatibility toast global directly`);
}

function frontendFiles(directory){
    const output = [];
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
        const full = path.join(directory,entry.name);
        if(entry.isDirectory()) output.push(...frontendFiles(full));
        else if(/\.(?:ts|vue)$/.test(entry.name)) output.push(full);
    }
    return output;
}

const directGlobalCallers = frontendFiles(path.join(ROOT,"frontend/src"))
    .filter(file=>file !== adapterPath)
    .filter(file=>/\b(?:TVTrackerFeedback|showToast)\b/.test(fs.readFileSync(file,"utf8")))
    .map(file=>path.relative(ROOT,file));
assert.deepStrictEqual(directGlobalCallers,[],"Vue components/modules must not bypass the shared feedback adapter");

assert(legacyFeedback.includes("global.TVTrackerFeedback = api;"),"feedback.js must remain the sole visible feedback owner");
assert(legacyFeedback.includes("global.showToast = function"),"Legacy callers must keep routing through the same feedback owner during migration");
assert(core.includes("const surface = global.TVTrackerFeedback;"),"Legacy core errors must continue delegating to the existing feedback owner");
assert(main.includes("FRONTEND_FOUNDATION_VERSION = 'phase5-shared-ui-feedback'"),"The compiled frontend must identify the Shared UI feedback slice");

console.log("Frontend modernization Phase 5 shared UI feedback ownership contracts passed.");
