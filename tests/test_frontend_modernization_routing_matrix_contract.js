"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname,"..");
const routerTests = fs.readFileSync(path.join(ROOT,"tests/test_router.js"),"utf8");
const searchNavigationTests = fs.readFileSync(path.join(ROOT,"tests/test_search_navigation_fix.js"),"utf8");

const requiredRouterMatrixEvidence = [
    ["createRouter('/app/show/1399-game-of-thrones')","direct pretty-route load"],
    ["createRouter('/app/show/1399',{appDataReady:false})","reload/startup loading shell"],
    ["router.updateRouteFromState(false)","state-to-route click/navigation write"],
    ["calls.some(item=>item[0]==='pushState'","canonical push navigation"],
    ["calls.some(item=>item[0]==='replaceState'","canonical replace/canonicalization"],
    ["listeners.popstate();","Back/Forward routing"],
    ["browser back/forward should route through the shared parser","Back/Forward assertion"]
];

for(const [needle,label] of requiredRouterMatrixEvidence){
    assert(
        routerTests.includes(needle),
        `Routing matrix must retain ${label} coverage (${needle})`
    );
}

assert(
    searchNavigationTests.includes("TVTrackerRouter:{setPathRoute:"),
    "Search result click navigation must keep coverage through the canonical TVTrackerRouter boundary"
);
assert(
    searchNavigationTests.includes("assert.deepStrictEqual(calls,[{route,replace:true}])"),
    "Search result click navigation must prove the search route is locked through canonical replace navigation"
);

console.log("Frontend modernization Routing direct/click/reload/Back-Forward matrix contract passed.");
