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
        createProfileSettingsDraft:()=>({username:"Tester"}),
        saveProfileSettings:async settings=>{
            saveCalls.push({...settings,stored:win.DATA.profile.streaming_region});
            return "saved";
        },
        renderSettings:()=>{},
        browseOptionState:{
            countries:[
                {code:"MY",name:"Malaysia"},
                {code:"MV",name:"Maldives"},
                {code:"ML",name:"Mali"},
                {code:"US",name:"United States"}
            ],
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
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(api.filterCountries("mal",win.browseOptionState.countries))).map(item=>item.name),
        ["Malaysia","Maldives","Mali"]
    );

    assert.strictEqual(JSON.stringify(await win.tmdbGetWatchProviderCatalog("tv","US")),"[]");
    assert.strictEqual(JSON.stringify(providerCalls),"[]");

    let params = win.TVTrackerBrowse.buildTMDBParams({providers:["8"]},1,{});
    assert.strictEqual(params.with_watch_providers,undefined);
    assert.strictEqual(params.watch_region,undefined);
    assert.strictEqual(params.with_watch_monetization_types,undefined);


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

    // A failed country request must reach Vue's existing error/reporting state,
    // and a subsequent request must retry after the shared promise is cleared.
    const failed = load().win;
    failed.browseOptionState.countries = [];
    let countryRequests = 0;
    failed.tmdbFetchJSON = async () => {
        countryRequests++;
        if(countryRequests === 1) throw new Error("Synthetic country outage");
        return [{iso_3166_1:"MY",english_name:"Malaysia"}];
    };
    await assert.rejects(failed.TVTrackerStreamingRegion.loadCountries(),/Synthetic country outage/);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await failed.TVTrackerStreamingRegion.loadCountries())),[{code:"MY",name:"Malaysia"}]);
    assert.strictEqual(countryRequests,2);

    // SettingsStreaming.vue is the sole renderer; this module is a data service.
    assert.strictEqual(api.mountStreamingRegionSetting,undefined);
    for(const removed of ["installProviderRenderGuard", "renderMovieProvidersHTML", "ensurePickerStyles", "settingMarkup", "mountSetting"]){
        assert.ok(!source.includes(removed),removed + " must remain removed");
    }
    assert.ok(!source.includes("innerHTML") && !source.includes("insertAdjacentHTML"));
    assert.ok(!source.includes("addEventListener"),"The service must not retain disconnected DOM listeners");

    console.log("Streaming region regression tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
