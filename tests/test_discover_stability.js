const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname,"..","static","js","discover-stability.js"),"utf8");

function deferred(){
    let resolve;
    let reject;
    const promise = new Promise((res,rej)=>{ resolve = res; reject = rej; });
    return {promise,resolve,reject};
}

async function flush(){
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve=>setTimeout(resolve,0));
}

function load(trendingDeferred){
    let finalRenders = 0;
    const results = {innerHTML:"",dataset:{}};
    const win = {
        activePage:"discover",
        discoverHubState:{loaded:false,loading:true,error:"",sections:[]},
        shouldShowDiscoverHub:()=>true,
        renderDiscoverHubSkeleton:title=>`<section data-skeleton="${title}"></section>`,
        renderDiscoverHub:()=>{ finalRenders += 1; },
        document:{getElementById:id=>id === "search-results" ? results : null},
        TVTrackerTrending:{
            loadHubRows:()=>trendingDeferred.promise.then(value=>{
                win.renderDiscoverHub();
                return value;
            })
        }
    };
    const context = {window:win,console,setTimeout,clearTimeout,Promise,Object,String};
    vm.createContext(context);
    vm.runInContext(source,context);
    return {win,results,getFinalRenders:()=>finalRenders};
}

(async()=>{
    {
        const trend = deferred();
        const env = load(trend);

        env.win.renderDiscoverHub();
        assert.strictEqual(env.getFinalRenders(),0,"initial Discover render should stay on the skeleton");
        assert.ok(env.results.innerHTML.includes("data-skeleton=\"TV Shows\""));

        env.win.discoverHubState = {loaded:true,loading:false,error:"",sections:[{key:"tv/popular"}]};
        env.win.renderDiscoverHub();
        assert.strictEqual(env.getFinalRenders(),0,"base rows must not render before Trending settles");

        trend.resolve([{key:"trending/tv-day"}]);
        await flush();
        assert.strictEqual(env.getFinalRenders(),1,"Discover should render exactly once after base and Trending settle");
        assert.strictEqual(env.win.TVTrackerDiscoverStability.isGateActive(),false);
    }

    {
        const trend = deferred();
        const env = load(trend);

        env.win.renderDiscoverHub();
        trend.resolve([]);
        await flush();
        assert.strictEqual(env.getFinalRenders(),0,"Trending finishing first must not expose a partial page");

        env.win.discoverHubState = {loaded:true,loading:false,error:"",sections:[{key:"tv/popular"}]};
        env.win.renderDiscoverHub();
        assert.strictEqual(env.getFinalRenders(),1,"the base completion should release the already-settled gate once");
    }

    {
        const trend = deferred();
        const env = load(trend);

        env.win.renderDiscoverHub();
        env.win.discoverHubState = {loaded:false,loading:false,error:"Discover failed",sections:[]};
        env.win.renderDiscoverHub();
        assert.strictEqual(env.getFinalRenders(),0,"base failure should still wait for the Trending side to settle");

        trend.reject(new Error("Trending failed"));
        await flush();
        assert.strictEqual(env.getFinalRenders(),1,"failed requests must still release the gate instead of freezing Discover");
    }

    assert.ok(source.includes("Promise.resolve().then(()=>api.loadHubRows(false))"),"Discover stability should coordinate the existing Trending loader");
    assert.ok(source.includes("state.loaded === true || !!state.error"),"base success or failure should both count as settled");

    console.log("Discover stability regression tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});