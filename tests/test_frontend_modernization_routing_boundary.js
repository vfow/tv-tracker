"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const adapter = fs.readFileSync(path.join(ROOT,"frontend/src/routing/router.ts"),"utf8");
const legacyRouter = fs.readFileSync(path.join(ROOT,"static/js/app-router.js"),"utf8");

assert(adapter.includes("export const router = Object.freeze"),"Vue routing must expose one typed adapter");
assert(adapter.includes("TVTrackerRouter"),"The typed adapter must delegate to the existing canonical router");
assert(adapter.includes("owner.parseRoute"),"Route parsing must remain delegated to the canonical router");
assert(adapter.includes("owner.setPathRoute"),"Route writes must remain delegated to the canonical router");
assert(adapter.includes("owner.applyRoute"),"Route application must remain delegated to the canonical router");

for(const forbidden of ["pushState(","replaceState(","addEventListener('popstate'",'addEventListener("popstate"',"onpopstate"]){
    assert(!adapter.includes(forbidden),`Typed routing adapter must not become a second history owner (${forbidden})`);
}

const popstateOwners = (legacyRouter.match(/addEventListener\(["']popstate["']/g) || []).length;
assert.strictEqual(popstateOwners,1,"Legacy app-router must remain the sole popstate owner during this slice");
assert(legacyRouter.includes("window.TVTrackerRouter = {"),"Legacy app-router must remain the runtime routing owner");

console.log("Frontend modernization Routing boundary ownership contracts passed.");
