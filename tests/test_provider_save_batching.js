const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
    path.join(__dirname,"..","static","js","provider-freshness.js"),
    "utf8"
);

function makeStorage(){
    const data = new Map();
    return {
        getItem:key=>data.has(key) ? data.get(key) : null,
        setItem:(key,value)=>data.set(key,String(value)),
        removeItem:key=>data.delete(key)
    };
}

function staleEntry(id){
    return {
        media:"tv",
        id:String(id),
        region:"MY",
        refreshed_at:new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        providers:{id:Number(id),results:{MY:{flatrate:[{provider_id:1}]}}}
    };
}

function load(){
    const saves = [];
    const providerCalls = [];
    let nextTimerId = 0;
    const cancelled = new Set();

    const shows = {};
    const providerMetadata = {};
    for(let id=101;id<=108;id+=1){
        shows[String(id)] = {tmdb_id:String(id)};
        providerMetadata[`tv:${id}:MY`] = staleEntry(id);
    }

    const win = {
        DATA:{shows,movies:{},profile:{streaming_region:"MY"},provider_metadata:providerMetadata},
        appDataReady:false,
        activePage:"",
        selectedShowId:null,
        selectedMovieId:null,
        moviePageState:{movieId:"",movie:null},
        showDetailPreview:null,
        discoverPreviewShow:null,
        localStorage:makeStorage(),
        TVTrackerStreamingRegion:{getStreamingRegion:()=>"MY"},
        tmdbFetchJSON:async requestPath=>{
            if(requestPath.endsWith("/watch/providers")){
                providerCalls.push(requestPath);
                await Promise.resolve();
                const id = Number(requestPath.split("/")[1]);
                return {id,results:{MY:{flatrate:[{provider_id:8}]}}};
            }
            return {id:0};
        },
        tmdbGetShowDetails:async()=>({}),
        tmdbGetMovieDetails:async()=>({}),
        openShowDetailsPage:async()=>{},
        openMoviePage:async()=>{},
        renderSettings:()=>{},
        saveProfileSettings:async()=>{},
        saveData:async options=>{
            saves.push(options);
            await Promise.resolve();
            return true;
        },
        renderActiveShowDetailPage:()=>{},
        renderActiveMoviePage:()=>{},
        setTimeout:(fn,ms)=>{
            const id = ++nextTimerId;
            Promise.resolve().then(()=>{
                if(!cancelled.has(id)){ fn(); }
            });
            return id;
        },
        clearTimeout:id=>cancelled.add(id),
        setInterval:()=>++nextTimerId,
        clearInterval:()=>{}
    };

    vm.runInNewContext(source,{
        window:win,console,Promise,Map,Object,String,Number,Array,Date,JSON,RegExp,encodeURIComponent
    });
    return {win,saves,providerCalls};
}

(async()=>{
    const {win,saves,providerCalls} = load();
    await win.TVTrackerProviderFreshness.refreshTrackedProviders();
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(providerCalls.length,8,"all stale tracked titles should refresh");
    assert.strictEqual(saves.length,1,"startup refresh must coalesce provider state into one save");
    assert.deepStrictEqual(Array.from(saves[0].stateKeys),["provider_metadata"]);
    assert.strictEqual(saves[0].silent,true);

    console.log("Provider save batching regression test passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});