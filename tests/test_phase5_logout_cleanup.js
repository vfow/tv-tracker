"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const STATIC = path.join(ROOT,"static/js");

function readScript(relativePath){
    return fs.readFileSync(path.join(STATIC,relativePath),"utf8");
}

function walkScripts(dir){
    return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
        const full = path.join(dir,entry.name);
        if(entry.isDirectory()){
            return walkScripts(full);
        }
        if(entry.name.endsWith(".js")){
            return [full];
        }
        return [];
    });
}

// --- H1: renderHistory must be defined exactly once across the whole script set.
const allSources = walkScripts(STATIC).map(file=>fs.readFileSync(file,"utf8"));
const definitions = allSources
    .flatMap(source=>source.match(/function\s+renderHistory\s*\(/g) || [])
    .map(match=>match.trim());
assert.strictEqual(
    definitions.length,
    1,
    `renderHistory must be defined exactly once across static/js (found ${definitions.length})`
);

const uiSource = readScript("ui.js");
const historyActivitySource = readScript("history-activity.js");
const historyVueBridgeSource = readScript("history-vue-bridge.js");
assert(!/function\s+renderHistory\s*\(/.test(uiSource),"ui.js must not define renderHistory");
assert(!/function\s+renderHistory\s*\(/.test(historyActivitySource),"legacy history-activity.js must not define renderHistory");
assert(/function\s+renderHistory\s*\(/.test(historyVueBridgeSource),"History Vue bridge must be the sole renderHistory owner");

const templateSource = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
assert(templateSource.indexOf("js/ui.js") < templateSource.indexOf("js/history-activity.js"),"ui.js must load before the compatibility History placeholder");
assert(templateSource.indexOf("js/history-activity.js") < templateSource.indexOf("js/history-state-bridge.js"),"History state bridge must load after the compatibility placeholder");
assert(templateSource.indexOf("js/history-state-bridge.js") < templateSource.indexOf("js/history-vue-bridge.js"),"History Vue owner must load after structured History state");

// --- C2: Vue Auth Settings owns logout cleanup while preserving the native POST.
const settingsSource = readScript("settings.js");
const authSettingsSource = fs.readFileSync(
    path.join(ROOT,"frontend/src/settings/SettingsAuth.vue"),
    "utf8"
);
assert(!settingsSource.includes('form[action="/logout"]'),"route/state Settings facade must not retain logout presentation ownership");
assert(authSettingsSource.includes('action="/logout"'),"Vue Auth Settings must render the native logout POST form");
assert(authSettingsSource.includes('@submit="cleanupLogout"'),"logout submit must invoke cleanup before the native POST");
assert(authSettingsSource.includes('name="csrf_token"'),"logout form must preserve CSRF submission");
assert(authSettingsSource.includes(':value="csrfToken()"'),"logout form must submit the current CSRF token");
const cleanupStart = authSettingsSource.indexOf("function cleanupLogout(): void {");
const cleanupEnd = authSettingsSource.indexOf("\nonMounted(",cleanupStart);
assert(cleanupStart >= 0 && cleanupEnd > cleanupStart,"Vue Auth Settings must own logout cleanup");
const cleanupSource = authSettingsSource.slice(cleanupStart,cleanupEnd);
assert(cleanupSource.includes("clientStorage.clearOnLogout()"),"logout submit must invoke clearClientStorageOnLogout");
assert(!cleanupSource.includes("preventDefault"),"logout cleanup must not block the native POST");
assert(cleanupSource.includes("try {") && cleanupSource.includes("catch {"),"best-effort client cleanup failure must not block logout");

// --- Runtime behavior of clearClientStorageOnLogout.
function makeStorage(initial){
    const map = new Map(Object.entries(initial));
    const failingKeys = new Set();
    return {
        get length(){ return map.size; },
        key(index){
            return Array.from(map.keys())[Number(index) || 0] || null;
        },
        getItem(key){ return map.has(key) ? map.get(key) : null; },
        setItem(key,value){ map.set(String(key),String(value)); },
        removeItem(key){
            if(failingKeys.has(String(key))){
                throw new Error("storage restricted");
            }
            map.delete(String(key));
        },
        failOn(key){ failingKeys.add(String(key)); },
        snapshot(){ return Array.from(map.keys()).sort(); }
    };
}

function loadFoundation(options={}){
    const local = options.local || makeStorage({});
    const session = options.session || makeStorage({});
    const posted = [];
    class FakeBroadcastChannel {
        constructor(name){ this.name = name; }
        postMessage(message){ posted.push({name:this.name,message}); }
        close(){}
    }
    const window = {
        localStorage:local,
        sessionStorage:session,
        BroadcastChannel:FakeBroadcastChannel,
        location:{href:"http://localhost/app/settings"},
        document:{querySelector(){ return null; }},
        console
    };
    window.window = window;
    vm.runInNewContext(
        readScript("core/foundation.js"),
        {window,console},
        {filename:"foundation.js"}
    );
    return {window,local,session,posted};
}

const APP_KEYS_LOCAL = {
    "tv-tracker-pending-saves:v1":'[{"id":"operation-local-1","createdAt":1,"delta":{}}]',
    "tv-tracker-tmdb-configuration:v2":'{"images":{"base_url":"http://images"}}',
    "tv-tracker-tmdb-provider-catalog:v1:tv:10:US":'{"results":{}}',
    "tv-tracker-provider-availability:v1:tv:10:US":'{"providers":{}}',
    "tv-tracker-push-device:v1":"device-abc123",
    "main-data":'{"shows":{}}',
    "unrelated-site-theme":"dark"
};
const APP_KEYS_SESSION = {
    "tv-tracker-pending-saves:v1":'[{"id":"operation-session-1","createdAt":1,"delta":{}}]',
    "tv-tracker-push-client:v1":"tab-abc123",
    "tv-tracker-tmdb-search:needle":'{"results":[]}',
    "tv-tracker-trending:v1:popular":'{"results":[]}',
    "tv-tracker-discover-hub:v9":'{"rows":[]}',
    "tv-tracker-tmdb-collection-detail:v5:1":'{"parts":[]}',
    "tv-tracker-tmdb-collection-index:v6":'{"collections":[]}',
    "tv-tracker-collection-return-position:v1":'{}',
    "tv-tracker-route-nav-context:v1":'{}',
    "tv-tracker-tmdb-tv-genres:v1":'{"genres":[]}',
    "tv-tracker-tmdb-movie-genres:v1":'{"genres":[]}',
    "tv-tracker-v2-episode-details:1:1:1":'{}',
    "tv-tracker-404-gradient-index":"2",
    "unrelated-site-cart":"items"
};

const scenario = loadFoundation({
    local:makeStorage(APP_KEYS_LOCAL),
    session:makeStorage(APP_KEYS_SESSION)
});
scenario.window.TVTrackerCore.clientStorage.clearOnLogout();

assert.deepStrictEqual(
    scenario.local.snapshot(),
    ["unrelated-site-theme"],
    "only app-owned localStorage keys may be removed"
);
assert.deepStrictEqual(
    scenario.session.snapshot(),
    ["unrelated-site-cart"],
    "only app-owned sessionStorage keys may be removed"
);
assert.strictEqual(
    scenario.posted.length,
    1,
    "one sync message must be posted"
);
assert.strictEqual(scenario.posted[0].name,"tv-tracker-sync-v1");
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(scenario.posted[0].message)),
    {type:"logout-clear"}
);

// A restricted key must not block removal of the remaining keys.
const restricted = loadFoundation({
    local:makeStorage(APP_KEYS_LOCAL),
    session:makeStorage(APP_KEYS_SESSION)
});
restricted.local.failOn("tv-tracker-push-device:v1");
restricted.session.failOn("tv-tracker-404-gradient-index");
assert.doesNotThrow(()=>restricted.window.TVTrackerCore.clientStorage.clearOnLogout());
assert.deepStrictEqual(
    restricted.local.snapshot(),
    ["tv-tracker-push-device:v1","unrelated-site-theme"],
    "a failing key must be left behind without blocking the rest"
);
assert.deepStrictEqual(
    restricted.session.snapshot(),
    ["tv-tracker-404-gradient-index","unrelated-site-cart"],
    "a failing session key must be left behind without blocking the rest"
);

// Privacy mode (storage access throws) must never block logout cleanup.
const privacy = loadFoundation({local:undefined,session:undefined});
Object.defineProperty(privacy.window,"localStorage",{get(){ throw new Error("denied"); }});
Object.defineProperty(privacy.window,"sessionStorage",{get(){ throw new Error("denied"); }});
assert.doesNotThrow(()=>privacy.window.TVTrackerCore.clientStorage.clearOnLogout());

console.log("Phase 5 logout cleanup contracts passed.");
