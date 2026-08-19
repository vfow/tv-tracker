"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const trackerIntegritySource = fs.readFileSync("static/js/tracker-integrity.js","utf8");
const dataIntegritySource = fs.readFileSync("static/js/data-integrity.js","utf8");
const appSource = fs.readFileSync("static/js/app.js","utf8");
const startupSource = fs.readFileSync("static/js/startup.js","utf8");
const templateSource = fs.readFileSync("templates/index.html","utf8");
const failureMessage = "TV Tracker could not start. Refresh the page to try again.";

function createElement(){
  return {
    hidden:true,
    textContent:"",
    removed:false,
    remove(){ this.removed = true; }
  };
}

function createContext(options={}){
  const calls = [];
  const errors = [];
  const attributes = new Map();
  const status = createElement();
  const skeleton = createElement();
  let resolveStoredData;
  const storedData = options.storedDataPromise || new Promise(resolve=>{
    resolveStoredData = resolve;
  });
  const documentElement = {
    setAttribute(name,value){
      attributes.set(name,String(value));
      calls.push(name === "data-tv-tracker-app-ready" ? "ready-marker" : `attribute:${name}:${value}`);
    },
    removeAttribute(name){ attributes.delete(name); },
    getAttribute(name){ return attributes.has(name) ? attributes.get(name) : null; }
  };
  const document = {
    documentElement,
    addEventListener(){},
    getElementById(id){
      if(id === "tv-tracker-startup-status") return status;
      return null;
    },
    querySelector(selector){
      return selector === ".watchlist-initial-skeleton" ? skeleton : null;
    }
  };
  const context = {
    console:{
      log:console.log,
      warn:console.warn,
      error(...args){ errors.push(args); }
    },
    document,
    Promise,
    Map,
    Set,
    Date,
    Object,
    Array,
    Number,
    String,
    RegExp,
    JSON,
    setTimeout,
    clearTimeout,
    getStoredData(){
      calls.push("stored-data");
      return storedData;
    }
  };
  if(options.readinessTimeoutMs){
    context.TVTrackerDuplicateShowIntegrity = {readinessTimeoutMs:options.readinessTimeoutMs};
  }
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(trackerIntegritySource,context,{filename:"tracker-integrity.js"});
  vm.runInContext(appSource,context,{filename:"app.js"});

  context.initDatabase = async()=>{ calls.push("database"); };
  context.normalizeExistingData = ()=>{ calls.push("normalize"); };
  context.setupEvents = ()=>{ calls.push("events"); };
  context.renderAll = ()=>{ calls.push("render"); };
  context.startDataSync = ()=>{ calls.push("data-sync"); };
  context.scheduleInitialBackgroundMaintenance = ()=>{ calls.push("maintenance"); };
  context.TVTrackerSettings = {render(){}};
  context.TVTrackerRouter = {
    applyRoute(){
      calls.push("route-start");
      calls.push(`route-data-ready:${context.appDataReady}`);
      if(options.routeError){
        throw options.routeError;
      }
      if(options.routePromise){
        return options.routePromise.then(
          value=>{
            calls.push("route-complete");
            return value;
          },
          error=>{
            calls.push("route-rejected");
            throw error;
          }
        );
      }
      calls.push("route-complete");
    }
  };

  return {
    context,
    calls,
    errors,
    attributes,
    status,
    skeleton,
    resolveStoredData
  };
}

function runProductionBootstrap(context){
  vm.runInContext(startupSource,context,{filename:"startup.js"});
  return context.TVTrackerStartupPromise;
}

function nextTurn(){
  return new Promise(resolve=>setImmediate(resolve));
}

(async()=>{
  {
    const startupNeedle = "filename='js/startup.js'";
    const startupIndex = templateSource.indexOf(startupNeedle);
    const scriptTags = Array.from(templateSource.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi));
    const startupLoads = Array.from(templateSource.matchAll(/filename='js\/startup\.js'/g));
    assert.ok(scriptTags.length > 0);
    assert.strictEqual(
      scriptTags.filter(match=>!/<script\b[^>]*\bsrc\s*=/i.test(match[0])).length,
      0,
      "CSP script-src 'self' requires startup to have no inline script block"
    );
    assert.strictEqual(startupLoads.length,1,"the startup asset must load exactly once");
    assert.ok(startupIndex >= 0);
    assert.ok(scriptTags.every(match=>match.index <= startupIndex),"startup must run after every owner script tag");
    assert.ok(scriptTags[scriptTags.length - 1][0].includes(startupNeedle),"startup.js must be the final script");
    assert.ok(templateSource.indexOf("filename='js/settings.js'") < startupIndex);
    assert.ok(templateSource.indexOf("filename='js/app-router.js'") < startupIndex);
    assert.ok(templateSource.indexOf("filename='js/data-integrity.js'") < startupIndex);
    assert.ok(startupSource.includes(".catch(error=>global.handleTVTrackerStartupFailure(error))"),"production startup must catch init and route rejection");
    assert.ok(!templateSource.includes("startTVTrackerApp"),"the template must not invoke startup inline");
    assert.ok(!/\ninit\(\);\s*$/.test(appSource),"app.js must not start before later owner scripts load");
  }

  {
    const harness = createContext();
    vm.runInContext(dataIntegritySource,harness.context,{filename:"data-integrity.js"});
    const startupPromise = runProductionBootstrap(harness.context);

    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(harness.context.TVTrackerStartup.status,"starting");
    assert.strictEqual(harness.attributes.get("data-tv-tracker-startup"),"starting");
    assert.strictEqual(harness.attributes.has("data-tv-tracker-app-ready"),false,"ready marker must wait for stored data");
    assert.strictEqual(harness.calls.includes("data-sync"),false);

    harness.resolveStoredData({shows:{},history:[]});
    assert.strictEqual(await startupPromise,true);
    assert.strictEqual(harness.context.appDataReady,true);
    assert.strictEqual(harness.context.TVTrackerStartup.status,"ready");
    assert.strictEqual(harness.attributes.get("data-tv-tracker-startup"),"ready");
    assert.strictEqual(harness.attributes.get("data-tv-tracker-app-ready"),"true");
    assert.ok(harness.calls.indexOf("data-sync") >= 0);
    assert.ok(
      harness.calls.indexOf("data-sync") < harness.calls.indexOf("ready-marker"),
      "ready marker must follow data-sync startup"
    );
    assert.ok(
      harness.calls.indexOf("route-complete") < harness.calls.indexOf("ready-marker"),
      "ready marker must follow initial route completion"
    );
    assert.ok(harness.calls.includes("route-data-ready:true"),"the full initial route must run with app data ready");
    assert.strictEqual(harness.status.hidden,true);
    assert.strictEqual(harness.status.textContent,"");

    const integrityState = harness.context.TVTrackerDuplicateShowIntegrity;
    vm.runInContext(trackerIntegritySource,harness.context,{filename:"tracker-integrity-reevaluation.js"});
    assert.strictEqual(harness.context.TVTrackerDuplicateShowIntegrity,integrityState);
    assert.strictEqual(harness.context.TVTrackerDuplicateShowIntegrity.ready,true);
    assert.strictEqual(harness.attributes.get("data-tv-tracker-startup"),"ready");
    assert.strictEqual(harness.attributes.get("data-tv-tracker-app-ready"),"true");
  }

  {
    let resolveRoute;
    const routePromise = new Promise(resolve=>{ resolveRoute = resolve; });
    const harness = createContext({
      storedDataPromise:Promise.resolve({shows:{},history:[]}),
      routePromise
    });
    vm.runInContext(dataIntegritySource,harness.context,{filename:"data-integrity.js"});
    const startupPromise = runProductionBootstrap(harness.context);

    await nextTurn();
    assert.ok(harness.calls.includes("route-start"));
    assert.ok(harness.calls.includes("route-data-ready:true"));
    assert.strictEqual(harness.calls.includes("route-complete"),false);
    assert.strictEqual(harness.context.TVTrackerStartup.status,"starting");
    assert.strictEqual(harness.attributes.has("data-tv-tracker-app-ready"),false,"an asynchronous route must finish before readiness");

    resolveRoute();
    assert.strictEqual(await startupPromise,true);
    assert.ok(harness.calls.indexOf("route-complete") < harness.calls.indexOf("ready-marker"));
  }

  {
    const routeError = new Error("synchronous route failure");
    const harness = createContext({
      storedDataPromise:Promise.resolve({shows:{},history:[]}),
      routeError
    });
    vm.runInContext(dataIntegritySource,harness.context,{filename:"data-integrity.js"});

    assert.strictEqual(await runProductionBootstrap(harness.context),false);
    assert.strictEqual(harness.context.TVTrackerStartup.status,"failed");
    assert.strictEqual(harness.context.TVTrackerStartup.error,routeError);
    assert.strictEqual(harness.attributes.has("data-tv-tracker-app-ready"),false);
    assert.strictEqual(harness.errors.length,1);
  }

  {
    let rejectRoute;
    const routePromise = new Promise((resolve,reject)=>{ rejectRoute = reject; });
    const routeError = new Error("asynchronous route failure");
    const harness = createContext({
      storedDataPromise:Promise.resolve({shows:{},history:[]}),
      routePromise
    });
    vm.runInContext(dataIntegritySource,harness.context,{filename:"data-integrity.js"});
    const unhandled = [];
    const onUnhandled = error=>{ unhandled.push(error); };
    process.on("unhandledRejection",onUnhandled);
    try{
      const startupPromise = runProductionBootstrap(harness.context);
      await nextTurn();
      rejectRoute(routeError);
      assert.strictEqual(await startupPromise,false);
      await nextTurn();
      assert.deepStrictEqual(unhandled,[],"an asynchronous route rejection must be handled by startup");
    }finally{
      process.removeListener("unhandledRejection",onUnhandled);
    }
    assert.strictEqual(harness.context.TVTrackerStartup.status,"failed");
    assert.strictEqual(harness.context.TVTrackerStartup.error,routeError);
    assert.ok(harness.calls.includes("route-rejected"));
    assert.strictEqual(harness.attributes.has("data-tv-tracker-app-ready"),false);
    assert.strictEqual(harness.errors.length,1);
  }

  {
    const harness = createContext({
      readinessTimeoutMs:15,
      storedDataPromise:Promise.resolve({shows:{},history:[]})
    });
    const unhandled = [];
    const onUnhandled = error=>{ unhandled.push(error); };
    process.on("unhandledRejection",onUnhandled);
    try{
      const result = await runProductionBootstrap(harness.context);
      await nextTurn();
      assert.strictEqual(result,false,"production catch must convert startup rejection into a handled failure");
      assert.deepStrictEqual(unhandled,[],"production startup must not leak an unhandled rejection");
    }finally{
      process.removeListener("unhandledRejection",onUnhandled);
    }

    assert.strictEqual(harness.context.TVTrackerDuplicateShowIntegrity.readinessFailed,true);
    assert.strictEqual(harness.context.appDataReady,false);
    assert.strictEqual(harness.context.TVTrackerStartup.status,"failed");
    assert.match(harness.context.TVTrackerStartup.error.message,/data integrity startup timed out/);
    assert.strictEqual(harness.attributes.get("data-tv-tracker-startup"),"failed");
    assert.strictEqual(harness.attributes.has("data-tv-tracker-app-ready"),false);
    assert.strictEqual(harness.status.hidden,false);
    assert.strictEqual(harness.status.textContent,failureMessage);
    assert.strictEqual(harness.skeleton.removed,true,"failed startup must not leave the loading skeleton running");
    assert.strictEqual(harness.errors.length,1,"startup failure must be logged once");
  }

  console.log("Startup readiness contracts passed.");
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
