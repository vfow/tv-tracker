const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname,"..","static","js","streaming-region.js"),"utf8");

function load(){
    const providerCalls = [];
    const browseCalls = [];
    const saveCalls = [];
    const fetchCalls = [];
    const detailCalls = [];
    const win = {
        DATA:{profile:{}},
        searchRouteState:{query:"",media:"tv"},
        discoverSearchState:{query:"",media:"tv"},
        getSearchRoute:(q,m)=>`/app/search?q=${q}&type=${m}`,
        normalizeSearchMediaType:v=>v,
        history:{replaceState(){}},
        tmdbFetchJSON:async (pathName,params,options)=>{
            fetchCalls.push({pathName,params,options});
            return {id:1};
        },
        tmdbGetShowDetails:async id=>{
            detailCalls.push({type:"tv",id});
            return {id};
        },
        tmdbGetMovieDetails:async id=>{
            detailCalls.push({type:"movie",id});
            return {id};
        },
        tmdbGetWatchProviderCatalog:async (media,region)=>{
            providerCalls.push({media,region});
            return [{id:1,name:"Provider"}];
        },
        TVTrackerBrowse:Object.freeze({
            buildTMDBParams:(input,page,options)=>{
                browseCalls.push({input,page,options});
                return input && input.providers && input.providers.length
                ? {with_watch_providers:input.providers.join("|"),watch_region:String(options.watchRegion || "US").toUpperCase(),with_watch_monetization_types:"flatrate"}
                : {};
            }
        }),
        renderShowReleasesTabHTML:()=>"SHOW_ORIGINAL",
        renderMovieProvidersHTML:()=>"MOVIE_ORIGINAL",
        createProfileSettingsDraft:()=>({username:"Tester"}),
        saveProfileSettings:async settings=>{
            saveCalls.push({...settings,stored:win.DATA.profile.streaming_region});
            return "saved";
        },
        renderSettings:()=>{},
        browseOptionState:{
            countries:[{code:"MY",name:"Malaysia"},{code:"US",name:"United States"}],
            providers:{tv:[1],movie:[2]},
            loaded:{tvProviders:true,movieProviders:true},
            picker:{type:"provider",query:"x",loading:false,error:"",results:[1]}
        },
        browseReferencePromises:{tvProviders:null,movieProviders:null},
        activePage:"shows"
    };
    const context = {window:win,console,setTimeout,clearTimeout,Error,Object,String,Array,RegExp,Promise};
    vm.createContext(context);
    vm.runInContext(source,context);
    return {win,providerCalls,browseCalls,saveCalls,fetchCalls,detailCalls};
}

(async()=>{
    const {win,providerCalls,saveCalls,fetchCalls,detailCalls} = load();
    const api = win.TVTrackerStreamingRegion;

    assert.ok(api,"Streaming Region API should be exported");
    assert.strictEqual(api.getStreamingRegion(),"");
    assert.strictEqual(api.normalizeStreamingRegion(" my "),"MY");
    assert.strictEqual(api.normalizeStreamingRegion("USA"),"");
    assert.strictEqual(api.resolveCountryInput("Malaysia"),"MY");
    assert.strictEqual(api.resolveCountryInput("us"),"US");

    assert.strictEqual(JSON.stringify(await win.tmdbGetWatchProviderCatalog("tv","US")),"[]");
    assert.strictEqual(JSON.stringify(providerCalls),"[]");

    let params = win.TVTrackerBrowse.buildTMDBParams({providers:["8"]},1,{});
    assert.strictEqual(params.with_watch_providers,undefined);
    assert.strictEqual(params.watch_region,undefined);
    assert.strictEqual(params.with_watch_monetization_types,undefined);

    assert.ok(win.renderShowReleasesTabHTML({}).includes("Choose a streaming region"));
    assert.ok(win.renderMovieProvidersHTML({}).includes("Choose a streaming region"));

    await win.tmdbGetShowDetails(10);
    await win.tmdbGetMovieDetails(20);
    assert.strictEqual(detailCalls.length,0);
    assert.ok(!fetchCalls[0].params.append_to_response.includes("watch/providers"));
    assert.ok(!fetchCalls[1].params.append_to_response.includes("watch/providers"));

    api.setStreamingRegion("MY");
    assert.strictEqual(api.getStreamingRegion(),"MY");

    await win.tmdbGetShowDetails(11);
    await win.tmdbGetMovieDetails(21);
    assert.strictEqual(JSON.stringify(detailCalls),JSON.stringify([{type:"tv",id:11},{type:"movie",id:21}]));

    assert.strictEqual(JSON.stringify(await win.tmdbGetWatchProviderCatalog("movie","US")),JSON.stringify([{id:1,name:"Provider"}]));
    assert.strictEqual(JSON.stringify(providerCalls),JSON.stringify([{media:"movie",region:"MY"}]));

    params = win.TVTrackerBrowse.buildTMDBParams({providers:["8"]},2,{watchRegion:"US"});
    assert.strictEqual(params.with_watch_providers,"8");
    assert.strictEqual(params.watch_region,"MY");

    assert.ok(win.renderShowReleasesTabHTML({_tmdb_watch_providers:{results:{}}}).includes("No streaming provider data"));
    assert.ok(win.renderMovieProvidersHTML({watch_providers:{results:{}}}).includes("No streaming provider data"));
    assert.strictEqual(win.renderShowReleasesTabHTML({_tmdb_watch_providers:{results:{MY:{flatrate:[1]}}}}),"SHOW_ORIGINAL");
    assert.strictEqual(win.renderMovieProvidersHTML({watch_providers:{results:{MY:{flatrate:[1]}}}}),"MOVIE_ORIGINAL");

    const draft = win.createProfileSettingsDraft();
    assert.strictEqual(draft.streaming_region,"MY");

    await win.saveProfileSettings({...draft,streaming_region:"US"});
    assert.strictEqual(win.DATA.profile.streaming_region,"US");
    assert.strictEqual(saveCalls[0].stored,"US");
    assert.strictEqual(JSON.stringify(win.browseOptionState.providers),JSON.stringify({tv:[],movie:[]}));
    assert.strictEqual(win.browseOptionState.loaded.tvProviders,false);
    assert.strictEqual(win.browseOptionState.loaded.movieProviders,false);

    await win.saveProfileSettings({...draft,streaming_region:""});
    assert.strictEqual(win.DATA.profile.streaming_region,"");

    assert.ok(source.includes("MutationObserver"),"Settings re-renders should be observed so the Region field can remount");
    assert.ok(source.includes("saveButton.closest(\".profile-settings-buttons\")"),"Region field should mount next to the final Save Profile controls");
    assert.ok(source.includes("mountStreamingRegionSetting:mountSetting"),"Region mount should be directly testable and recoverable");
    assert.ok(!source.includes("if(!draft || typeof draft !== \"object\")"),"Region visibility must not depend on the settings draft already existing");

    console.log("Streaming region regression tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});