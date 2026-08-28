"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const SETTINGS_SECTIONS = ["profile","auth","notifications","streaming","data","danger-zone"];
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const bridgeSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-bridge.js"),"utf8");
const loaderSource = fs.readFileSync(path.join(ROOT,"static/js/settings-vue-loader.js"),"utf8");
const routerSource = fs.readFileSync(path.join(ROOT,"static/js/app-router.js"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT,"package.json"),"utf8"));
const frontendDecision = fs.readFileSync(path.join(ROOT,"docs/architecture/FRONTEND_MODERNIZATION_DECISION_2026-08-28.md"),"utf8");

function loadedStaticScripts(markup){
    return (markup.match(/<script\b[^>]*>/gi) || []).flatMap(tag=>{
        const match = tag.match(/url_for\(\s*["']static["']\s*,\s*filename\s*=\s*["']([^"']+)["']\s*\)/i);
        return match ? [{filename:match[1],tag}] : [];
    });
}

function sourceFiles(root){
    if(!fs.existsSync(root)){ return []; }
    const files = [];
    for(const entry of fs.readdirSync(root,{withFileTypes:true})){
        const current = path.join(root,entry.name);
        if(entry.isDirectory()){
            files.push(...sourceFiles(current));
        }else if(entry.isFile()){
            files.push(current);
        }
    }
    return files;
}

const scripts = loadedStaticScripts(template);
const scriptNames = scripts.map(script=>script.filename);
const settingsScripts = scripts.filter(script=>script.filename === "js/settings.js");
assert.strictEqual(settingsScripts.length,1,"The legacy Settings fallback must remain loaded exactly once");
assert(!/\btype\s*=\s*["']module["']/i.test(settingsScripts[0].tag),"The legacy Settings fallback remains a classic script");
assert.strictEqual(scriptNames.filter(name=>name === "js/settings-vue-bridge.js").length,1,"The guarded Settings bridge must load exactly once");
assert.strictEqual(scriptNames.filter(name=>name === "js/settings-vue-loader.js").length,1,"The lazy Vue Settings loader must load exactly once");
assert(scriptNames.indexOf("js/settings.js") < scriptNames.indexOf("js/settings-vue-bridge.js"),"Legacy Settings must install before the bridge captures it");
assert(scriptNames.indexOf("js/settings-vue-bridge.js") < scriptNames.indexOf("js/settings-vue-loader.js"),"The bridge must exist before the lazy loader can attach Vue");
assert(scriptNames.indexOf("js/settings-vue-loader.js") < scriptNames.indexOf("js/app-router.js"),"The Settings handoff must be ready before routes delegate to it");
assert(!template.includes("static/vue/"),"The app shell must not hard-wire a hashed Vue asset; the canary stays manifest-driven");
assert(!/\bid\s*=\s*["']tv-modern-root["']/i.test(template),"The removed global framework mount must not return");

assert.strictEqual(packageJson.devDependencies?.vue,"3.5.41","Vue must remain the approved build-time foundation version");
assert(!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0,"The server runtime must not gain Node dependencies");
assert(frontendDecision.includes("supersedes **L-04 Frontend**"),"The Vue migration must remain backed by the explicit frontend architecture decision");

const frontendSources = sourceFiles(path.join(ROOT,"frontend","src"));
const settingsVueOwners = frontendSources.filter(file=>{
    const relative = path.relative(path.join(ROOT,"frontend","src"),file).replaceAll(path.sep,"/");
    const source = fs.readFileSync(file,"utf8");
    return /(?:^|\/)settings(?:\/|\.|$)/i.test(relative)
        || /data-tvtracker-vue-(?:settings|notifications-settings|profile-settings)/i.test(source);
});
assert.deepStrictEqual(
    settingsVueOwners
        .map(file=>path.relative(path.join(ROOT,"frontend","src"),file).replaceAll(path.sep,"/"))
        .sort(),
    [
        "notifications/SettingsNotifications.vue",
        "settings/SettingsProfile.vue",
        "settings/SettingsStreaming.vue"
    ],
    "Only the explicitly staged Streaming, Notifications, and Profile Vue Settings owners may exist in Phase 4B"
);

assert(bridgeSource.includes('const VUE_CANARY_SECTIONS = new Set(["streaming"]);'),"The guarded migration must preserve Streaming as the first Vue Settings canary");
assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("notifications");'),"The guarded migration must preserve Notifications as the second Vue Settings canary");
assert(bridgeSource.includes('VUE_CANARY_SECTIONS.add("profile");'),"Phase 4B must add Profile as the third Vue Settings canary");
for(const legacySection of ["auth","data","danger-zone"]){
    assert(!bridgeSource.includes(`VUE_CANARY_SECTIONS.add("${legacySection}");`),`${legacySection} must remain legacy-owned in Phase 4B`);
}
assert(loaderSource.includes('"/static/vue/manifest.json"'),"The Vue canary must load through the committed manifest");
assert(loaderSource.includes('cache:"no-store"'),"The manifest request must avoid stale cross-release caching");
assert(loaderSource.includes("vue_settings_load_failed"),"Lazy-load failure must be observable without exposing user data");

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
assert.deepStrictEqual(
    settingsPublishers,
    ["js/settings.js","js/settings-vue-bridge.js"],
    "Settings may have only the legacy fallback publisher and the explicit guarded handoff publisher"
);

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
assert(settingsApi,"The legacy Settings fallback must still install");
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
assert.strictEqual(routerRuntime.ownerCalls.length,1,"Initial Settings routing must delegate once to the browser owner");
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

assert(settingsSource.includes("global.renderSettings = render;"),"The legacy fallback renderSettings owner must remain explicit during the canary");
assert(bridgeSource.includes("global.renderSettings = render;"),"The bridge must explicitly replace the global render handoff");
assert(!loadedSources.get("js/ui.js").includes("function renderSettings()"),"The removed ui.js renderSettings shim must stay removed");
assert(!loadedSources.get("js/streaming-region.js").includes("MutationObserver"),"streaming-region.js must not reintroduce Settings DOM patching");
assert(!loadedSources.get("js/provider-freshness.js").includes("installSettingsCleanup"),"provider-freshness.js must not patch Settings cleanup");

console.log("Phase 14 Settings ownership contracts passed with the guarded Streaming, Notifications, and Profile Vue canaries.");
