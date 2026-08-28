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

function sourceFiles(root){
    const files = [];
    if(!fs.existsSync(root)){ return files; }
    for(const entry of fs.readdirSync(root,{withFileTypes:true})){
        const full = path.join(root,entry.name);
        if(entry.isDirectory()){
            files.push(...sourceFiles(full));
        }else if(/\.(?:js|ts|vue)$/.test(entry.name)){
            files.push(full);
        }
    }
    return files;
}

const routingSources = [
    ...sourceFiles(path.join(ROOT,"static/js")),
    ...sourceFiles(path.join(ROOT,"frontend/src"))
];
const directHistoryPattern = /(?:\b(?:window|global)\.)?history\s*(?:\.\s*(?:pushState|replaceState)\s*\(|\[[^\]]+\]\s*\()/;
const popstatePattern = /(?:addEventListener\s*\(\s*["']popstate["']|\bonpopstate\b)/;
const historyWriters = [];
const popstateFiles = [];

for(const file of routingSources){
    const source = fs.readFileSync(file,"utf8");
    const relative = path.relative(ROOT,file).split(path.sep).join("/");
    if(directHistoryPattern.test(source)){ historyWriters.push(relative); }
    if(popstatePattern.test(source)){ popstateFiles.push(relative); }
}

historyWriters.sort();
popstateFiles.sort();
assert.deepStrictEqual(
    historyWriters,
    [
        "static/js/app-router.js",
        "static/js/app.js",
        "static/js/settings.js",
        "static/js/trending.js",
        "static/js/ui.js"
    ],
    "Routing migration must not introduce new direct browser-history writers; all legacy exceptions are explicitly inventoried"
);
assert.deepStrictEqual(
    popstateFiles,
    ["static/js/app-router.js"],
    "app-router.js must remain the sole application popstate owner"
);

console.log("Frontend modernization Routing boundary ownership contracts passed.");
