const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname,"..","static","js","provider-freshness.js"),"utf8");

function makeStorage(){
    const data = new Map();
    return {
        getItem:key=>data.has(key) ? data.get(key) : null,
        setItem:(key,value)=>data.set(key,String(value)),
        removeItem:key=>data.delete(key),
        keys:()=>Array.from(data.keys())
    };
}

function load(options={}){
    const calls = [];
    const saves = [];
    const storage = makeStorage();
    const selectedRegion = {value:options.region === undefined ? "MY" : options.region};
    const timers = [];
    const win = {
        DATA:{
            shows:options.shows || {},
            movies:options.movies || {},
            profile:{streaming_region:selectedRegion.value},
            provider_metadata:options.provider_metadata || {}
        },
        appDataReady:false,
        activePage:"",
        selectedShowId:null,
        selectedMovieId:null,
        moviePageState:{movieId:"",movie:null},
        showDetailPreview:null,
        discoverPreviewShow:null,
        localStorage:storage,
        TVTrackerStreamingRegion:{getStreamingRegion:()=>selectedRegion.value},
        tmdbFetchJSON:async (requestPath,params)=>{
            calls.push({requestPath,params});
            if(options.failFetch){ throw new Error("TMDB failed"); }
            const parts = String(requestPath).split("/");
            const titleId = Number(parts[1] || 0);
            if(requestPath.endsWith("/watch/providers")){
                return {
                    id:titleId,
                    results:{
                        MY:{flatrate:[{provider_id:8,provider_name:"Netflix"}]},
                        US:{flatrate:[{provider_id:9,provider_name:"Prime Video"}]}
                    }
                };
            }
            return {id:titleId,name:"Title"};
        },
        tmdbGetShowDetails:async titleId=>{
            calls.push({requestPath:"original-show:"+titleId});
            return {id:Number(titleId),"watch/providers":{id:Number(titleId),results:{MY:{flatrate:[{provider_id:8}]}}}};
        },
        tmdbGetMovieDetails:async titleId=>{
            calls.push({requestPath:"original-movie:"+titleId});
            return {id:Number(titleId),"watch/providers":{id:Number(titleId),results:{MY:{flatrate:[{provider_id:8}]}}}};
        },
        openShowDetailsPage:async()=>{},
        openMoviePage:async()=>{},
        renderSettings:()=>{},
        saveProfileSettings:async settings=>{
            if(settings && Object.prototype.hasOwnProperty.call(settings,"streaming_region")){
                selectedRegion.value = settings.streaming_region;
            }
        },
        saveData:async opts=>{ saves.push(opts); },
        renderActiveShowDetailPage:()=>{},
        renderActiveMoviePage:()=>{},
        setTimeout:(fn,ms)=>{ timers.push({fn,ms}); return timers.length; },
        clearTimeout:()=>{},
        setInterval:(fn,ms)=>{ timers.push({fn,ms,interval:true}); return timers.length; },
        clearInterval:()=>{}
    };
    vm.runInNewContext(source,{
        window:win,console,Promise,Map,Object,String,Number,Array,Date,JSON,RegExp,encodeURIComponent
    });
    return {win,calls,saves,storage,selectedRegion};
}

(async()=>{
    {
        const {win,calls} = load({region:""});
        assert.strictEqual(await win.TVTrackerProviderFreshness.refreshProviderAvailability("tv","10"),null);
        assert.strictEqual(calls.length,0,"no region means no provider request");
    }

    {
        const {win,calls} = load({
            shows:{"10":{tmdb_id:"10"}},
            provider_metadata:{
                "tv:10:MY":{
                    media:"tv",id:"10",region:"MY",refreshed_at:new Date().toISOString(),
                    providers:{id:10,results:{MY:{flatrate:[{provider_id:8}]}}}
                }
            }
        });
        const result = await win.TVTrackerProviderFreshness.refreshProviderAvailability("tv","10");
        assert.ok(result.results.MY);
        assert.strictEqual(calls.length,0,"fresh tracked data should not refetch providers");
        assert.ok(win.DATA.shows["10"]._tmdb_watch_providers.results.MY);
    }

    {
        const staleAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
        const {win,calls,saves} = load({
            shows:{"10":{tmdb_id:"10"}},
            provider_metadata:{
                "tv:10:MY":{
                    media:"tv",id:"10",region:"MY",refreshed_at:staleAt,
                    providers:{id:10,results:{MY:{flatrate:[{provider_id:1}]}}}
                }
            }
        });
        const [one,two] = await Promise.all([
            win.TVTrackerProviderFreshness.refreshProviderAvailability("tv","10"),
            win.TVTrackerProviderFreshness.refreshProviderAvailability("tv","10")
        ]);
        assert.ok(one.results.MY && two.results.MY);
        assert.strictEqual(calls.filter(call=>call.requestPath.endsWith("/watch/providers")).length,1,"duplicate refreshes should dedupe");
        const entry = win.DATA.provider_metadata["tv:10:MY"];
        assert.ok(win.TVTrackerProviderFreshness.entryIsFresh(entry));
        assert.strictEqual(entry.providers.results.US,undefined,"only selected-region data should be stored");
        await win.TVTrackerProviderFreshness.flushTrackedSave();
        assert.ok(saves.some(save=>save.stateKeys && save.stateKeys.includes("provider_metadata")));
    }

    {
        const staleAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
        const {win} = load({
            failFetch:true,
            shows:{"10":{tmdb_id:"10"}},
            provider_metadata:{
                "tv:10:MY":{
                    media:"tv",id:"10",region:"MY",refreshed_at:staleAt,
                    providers:{id:10,results:{MY:{flatrate:[{provider_id:1}]}}}
                }
            }
        });
        const result = await win.TVTrackerProviderFreshness.refreshProviderAvailability("tv","10");
        assert.strictEqual(result.results.MY.flatrate[0].provider_id,1);
        assert.strictEqual(win.DATA.provider_metadata["tv:10:MY"].refreshed_at,staleAt,"failed refresh must keep stale timestamp");
    }

    {
        const {win,storage} = load();
        win.TVTrackerProviderFreshness.captureProviderPayload(
            "movie","22","MY",
            {"watch/providers":{id:22,results:{MY:{rent:[{provider_id:3}]},US:{rent:[{provider_id:4}]}}}}
        );
        assert.ok(storage.keys().some(key=>key.includes("movie:22:MY")),"untracked title should use browser cache");
        assert.strictEqual(Object.keys(win.DATA.provider_metadata).length,0,"untracked title must not sync");
    }

    {
        const {win,calls,storage} = load();
        storage.setItem(
            "tv-tracker-provider-availability:v1:tv:33:MY",
            JSON.stringify({
                media:"tv",id:"33",region:"MY",refreshed_at:new Date().toISOString(),
                providers:{id:33,results:{MY:{flatrate:[{provider_id:8}]}}}
            })
        );
        const details = await win.tmdbGetShowDetails("33");
        const call = calls.find(item=>item.requestPath === "tv/33");
        assert.ok(call);
        assert.ok(!String(call.params.append_to_response).includes("watch/providers"),"fresh cache should omit provider subrequest from details");
        assert.ok(details["watch/providers"].results.MY);
        assert.strictEqual(calls.some(item=>item.requestPath === "original-show:33"),false);
    }

    {
        const {win,calls} = load();
        await win.tmdbGetMovieDetails("44");
        assert.ok(calls.some(item=>item.requestPath === "original-movie:44"),"missing cache should use normal details once");
        assert.ok(win.TVTrackerProviderFreshness.entryIsFresh(
            win.TVTrackerProviderFreshness.readProviderEntry("movie","44","MY")
        ));
    }

    {
        const staleAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
        const {win,calls} = load({
            shows:{"51":{tmdb_id:"51"}},
            movies:{"52":{id:"52",plan:true}},
            provider_metadata:{
                "tv:51:MY":{media:"tv",id:"51",region:"MY",refreshed_at:staleAt,providers:{id:51,results:{}}},
                "movie:52:MY":{media:"movie",id:"52",region:"MY",refreshed_at:staleAt,providers:{id:52,results:{}}}
            }
        });
        await win.TVTrackerProviderFreshness.refreshTrackedProviders();
        assert.strictEqual(calls.filter(call=>call.requestPath.endsWith("/watch/providers")).length,2,"startup refresh covers tracked shows and movies");
    }

    {
        const {win,storage} = load({
            provider_metadata:{
                "tv:77:MY":{
                    media:"tv",id:"77",region:"MY",refreshed_at:new Date().toISOString(),
                    providers:{id:77,results:{MY:{flatrate:[{provider_id:7}]}}}
                }
            }
        });
        assert.strictEqual(win.TVTrackerProviderFreshness.pruneTrackedState(),true);
        assert.strictEqual(win.DATA.provider_metadata["tv:77:MY"],undefined);
        assert.ok(storage.keys().some(key=>key.includes("tv:77:MY")),"removed tracked titles move to browser-only cache");
    }

    {
        let headerRemoved = false;
        let helpRemoved = false;
        let ariaRemoved = false;
        const {win} = load();
        const section = {
            querySelector:selector=>{
                if(selector === ".settings-section-header p"){ return {remove(){ headerRemoved = true; }}; }
                if(selector === ".streaming-region-help"){ return {remove(){ helpRemoved = true; }}; }
                return null;
            }
        };
        win.document = {
            getElementById:value=>{
                if(value === "streaming-region-setting"){ return section; }
                if(value === "streaming-region-input"){
                    return {removeAttribute:name=>{ if(name === "aria-describedby"){ ariaRemoved = true; } }};
                }
                return null;
            }
        };
        assert.strictEqual(win.TVTrackerProviderFreshness.cleanupStreamingSettingsCopy(),true);
        assert.ok(headerRemoved && helpRemoved && ariaRemoved);
    }

    assert.ok(source.includes("1000 * 60 * 60 * 24 * 3"));
    assert.ok(source.includes("STARTUP_CONCURRENCY = 2"));
    console.log("Provider freshness regression tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
