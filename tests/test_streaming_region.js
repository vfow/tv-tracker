const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname,"..","static","js","search-navigation-fix.js"),"utf8");

function load(){
    const providerCalls = [];
    const browseCalls = [];
    const saveCalls = [];
    const win = {
        DATA:{profile:{}},
        searchRouteState:{query:"",media:"tv"},
        discoverSearchState:{query:"",media:"tv"},
        getSearchRoute:(q,m)=>`/app/search?q=${q}&type=${m}`,
        normalizeSearchMediaType:v=>v,
        history:{replaceState(){}},
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
    return {win,providerCalls,browseCalls,saveCalls};
}

(async()=>{
    const {win,providerCalls,saveCalls} = load();
    const api = win.TVTrackerStreamingRegion;

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

    api.setStreamingRegion("MY");
    assert.strictEqual(api.getStreamingRegion(),"MY");

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

    console.log("Streaming region regression tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
