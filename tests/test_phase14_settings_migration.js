"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const SETTINGS_SECTIONS = ["profile","auth","notifications","streaming","data","danger-zone"];
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const routerSource = fs.readFileSync(path.join(ROOT,"static/js/app-router.js"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT,"package.json"),"utf8"));

function loadedStaticScripts(markup){
    return (markup.match(/<script\b[^>]*>/gi) || []).flatMap(tag=>{
        const match = tag.match(/url_for\(\s*["']static["']\s*,\s*filename\s*=\s*["']([^"']+)["']\s*\)/i);
        return match ? [{filename:match[1],tag}] : [];
    });
}

const scripts = loadedStaticScripts(template);
const scriptNames = scripts.map(script=>script.filename);
const settingsScripts = scripts.filter(script=>script.filename === "js/settings.js");
assert.strictEqual(settingsScripts.length,1,"Settings must be loaded exactly once by the browser template");
assert(!/\btype\s*=\s*["']module["']/i.test(settingsScripts[0].tag),"The selected Settings owner is the current classic modular-vanilla script");
assert(scriptNames.indexOf("js/settings.js") < scriptNames.indexOf("js/app-router.js"),"Settings must load before routes delegate to it");
assert(!scriptNames.some(filename=>/(?:^|\/)(?:frontend|modern)(?:\/|$)|\.(?:ts|tsx|vue)$/i.test(filename)),"No framework or modern Settings bundle may be loaded");
assert(!/\bid\s*=\s*["']tv-modern-root["']/i.test(template),"The removed framework mount must not return");

const forbiddenPackages = new Set(["vue","vite","typescript","@vitejs/plugin-vue"]);
const installedPackages = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
]);
for(const packageName of forbiddenPackages){
    assert(!installedPackages.has(packageName),`${packageName} must not reintroduce a duplicate Settings foundation`);
}

const loadedSources = new Map();
for(const script of scripts){
    if(!script.filename.endsWith(".js")){ continue; }
    const sourcePath = path.join(ROOT,"static",...script.filename.split("/"));
    assert(fs.existsSync(sourcePath),`Loaded browser source is missing: ${script.filename}`);
    loadedSources.set(script.filename,fs.readFileSync(sourcePath,"utf8"));
}
const settingsPublishers = Array.from(loadedSources.entries())
    .filter(([,source])=>/(?:window|globalThis|global)\.TVTrackerSettings\s*=/.test(source))
    .map(([filename])=>filename);
assert.deepStrictEqual(settingsPublishers,["js/settings.js"],"Exactly one loaded browser source may publish the Settings owner");

function loadSettings(pathname="/app/settings/profile"){
    const routes = [];
    const shownPages = [];
    const window = {
        location:{pathname},
        document:{getElementById(){ return null; }},
        showPage(page){ shownPages.push(page); },
        TVTrackerRouter:{
            setPathRoute(route,replace){ routes.push({route,replace}); }
        },
        history:{pushState(){},replaceState(){}}
    };
    window.window = window;
    vm.runInNewContext(settingsSource,{window},{filename:"settings.js"});
    return {api:window.TVTrackerSettings,routes,shownPages,window};
}

const settingsRuntime = loadSettings();
const settingsApi = settingsRuntime.api;
assert(settingsApi,"The Settings browser owner must install");
assert.deepStrictEqual(Array.from(settingsApi.sections,item=>item.id),SETTINGS_SECTIONS,"The current six Settings sections must remain exact");

for(const section of SETTINGS_SECTIONS){
    const route = `/app/settings/${section}`;
    assert.strictEqual(settingsApi.normalizeSection(section),section);
    assert.strictEqual(settingsApi.routeFor(section),route);
    assert.strictEqual(settingsApi.sectionFromPath(route),section);

    settingsRuntime.routes.length = 0;
    settingsApi.open(section);
    assert.strictEqual(settingsApi.current(),section);
    assert.strictEqual(settingsRuntime.routes.length,1,"Opening a Settings section must perform one route transition");
    assert.strictEqual(settingsRuntime.routes[0].route,route);
    assert.strictEqual(settingsRuntime.routes[0].replace,false);
}
assert.strictEqual(settingsApi.normalizeSection("billing"),"profile","Unknown sections must stay inside the current route boundary");
assert.strictEqual(settingsApi.sectionFromPath("/app/settings/not-a-section"),"profile");

function loadRouter(pathname){
    const ownerCalls = [];
    const document = {
        querySelectorAll(){ return []; },
        querySelector(){ return null; },
        getElementById(){ return null; },
        addEventListener(){}
    };
    const location = {pathname,search:"",hash:"",origin:"https://tracker.test"};
    const history = {
        pushState(_state,_title,route){ location.pathname = String(route).split("?")[0]; },
        replaceState(_state,_title,route){ location.pathname = String(route).split("?")[0]; }
    };
    const owner = {
        open(section,options){ ownerCalls.push({section,options}); }
    };
    const context = {
        console,
        URL,
        URLSearchParams,
        Set,
        Array,
        Number,
        String,
        encodeURIComponent,
        activePage:"shows",
        activeShowsTab:"watchlist",
        activeFilter:"watching",
        librarySearchQuery:"",
        libraryGenreFilter:"all",
        libraryNetworkFilter:"all",
        libraryYearFilter:"all",
        librarySortMode:"default",
        appDataReady:false,
        document,
        history,
        TVTrackerSettings:owner
    };
    context.showPage = page=>{ context.activePage = page; };
    context.window = {
        window:null,
        document,
        history,
        location,
        showPage:context.showPage,
        TVTrackerSettings:owner,
        addEventListener(){},
        setTimeout(){ return 1; }
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(routerSource,context,{filename:"app-router.js"});
    return {router:context.window.TVTrackerRouter,ownerCalls};
}

const routerRuntime = loadRouter("/app/settings/data");
assert.strictEqual(routerRuntime.ownerCalls.length,1,"Initial Settings routing must delegate once to the sole browser owner");
assert.strictEqual(routerRuntime.ownerCalls[0].section,"data");
assert.strictEqual(routerRuntime.ownerCalls[0].options.fromRoute,true);
assert.strictEqual(routerRuntime.ownerCalls[0].options.skipShowPage,true);

for(const section of SETTINGS_SECTIONS){
    const route = `/app/settings/${section}`;
    const parsed = routerRuntime.router.parseRoute(route);
    assert.strictEqual(parsed.valid,true,`${route} must remain routable`);
    assert.strictEqual(parsed.type,"settings");
    assert.strictEqual(parsed.canonicalRoute,route);
    assert.strictEqual(parsed.params.section,section);
}
const settingsRoot = routerRuntime.router.parseRoute("/app/settings");
assert.strictEqual(settingsRoot.canonicalRoute,"/app/settings/profile");
assert.strictEqual(settingsRoot.params.section,"profile");
const legacyNotifications = routerRuntime.router.parseRoute("/app/notifications/settings");
assert.strictEqual(legacyNotifications.canonicalRoute,"/app/settings/notifications");
assert.strictEqual(legacyNotifications.params.section,"notifications");
assert.strictEqual(routerRuntime.router.parseRoute("/app/settings/billing").valid,false,"Unknown Settings routes must not be broadened");

// This gate validates the completed Settings ownership transition. The legacy
// ui.js renderSettings shim and the streaming-region/provider-freshness
// re-render patches are gone; settings.js is the single publishing owner.
assert(settingsSource.includes("global.renderSettings = render;"),"The canonical renderSettings owner must remain explicit");
assert(!loadedSources.get("js/ui.js").includes("function renderSettings()"),"The legacy ui.js renderSettings shim must be fully removed");
assert(!loadedSources.get("js/streaming-region.js").includes("MutationObserver"),"streaming-region.js must no longer re-render Settings");
assert(!loadedSources.get("js/provider-freshness.js").includes("installSettingsCleanup"),"provider-freshness.js must no longer patch Settings cleanup");

console.log("Phase 14 Settings migration contracts passed; the full migration gate is complete.");
