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
        renderMovieProvidersHTML:()=>"MOVIE_ORIGINAL",
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

function fakeElement(extra={}){
    const listeners = {};
    const attributes = {};
    return Object.assign({
        value:"",
        hidden:false,
        disabled:false,
        innerHTML:"",
        listeners,
        attributes,
        addEventListener(type,fn){ listeners[type] = fn; },
        setAttribute(name,value){ attributes[name] = String(value); },
        removeAttribute(name){ delete attributes[name]; },
        getAttribute(name){ return attributes[name]; },
        focus(){},
        closest(){ return null; }
    },extra);
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

    assert.ok(win.renderMovieProvidersHTML({watch_providers:{results:{}}}).includes("No streaming provider data"));
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

    // Exact UI regression: standalone STREAMING section + one-click custom country menu.
    let inserted = false;
    let insertedMarkup = "";
    const input = fakeElement({
        closest:()=>({contains:()=>true})
    });
    const menu = fakeElement({hidden:true});
    const clear = fakeElement();
    const saveRegion = fakeElement();
    const saveProfile = fakeElement();
    const profileSection = {
        insertAdjacentHTML(position,html){
            assert.strictEqual(position,"afterend");
            inserted = true;
            insertedMarkup = html;
        }
    };
    const controls = {
        closest:selector=>selector === ".settings-section" ? profileSection : null,
        insertAdjacentHTML(){ throw new Error("Streaming must be outside the Profile section"); }
    };
    win.profileSettingsDraft = null;
    win.document = {
        head:null,
        querySelector:selector=>selector === ".profile-settings-controls" ? controls : null,
        addEventListener(){},
        getElementById:id=>{
            if(id === "streaming-region-setting"){ return inserted ? {} : null; }
            if(id === "streaming-region-input"){ return inserted ? input : null; }
            if(id === "streaming-region-menu"){ return inserted ? menu : null; }
            if(id === "clear-streaming-region"){ return inserted ? clear : null; }
            if(id === "save-streaming-region"){ return inserted ? saveRegion : null; }
            if(id === "save-profile-settings"){ return saveProfile; }
            return null;
        }
    };

    assert.strictEqual(api.mountStreamingRegionSetting(),true,"Streaming Region should mount even before a profile settings draft exists");
    assert.ok(insertedMarkup.includes("<h2>Streaming</h2>"),"Streaming Region must be its own Settings section");
    assert.ok(insertedMarkup.includes("role=\"combobox\""));
    assert.ok(insertedMarkup.includes("role=\"listbox\""));
    assert.ok(!insertedMarkup.includes("<datalist"),"Native datalist must be removed");
    assert.ok(!insertedMarkup.includes("list=\"streaming-region-options\""),"Native datalist linkage must be removed");
    assert.ok(input.listeners.click,"Click should open the custom country menu on the first click");
    assert.ok(input.listeners.focus,"Focus should open the custom country menu");

    input.listeners.click();
    await Promise.resolve();
    assert.strictEqual(menu.hidden,false,"One click should open the country menu");
    assert.strictEqual(input.attributes["aria-expanded"],"true");
    assert.ok(menu.innerHTML.includes("Malaysia"),"Country names should be the primary menu text");
    assert.ok(menu.innerHTML.includes("MY"),"ISO code may appear as secondary metadata");

    input.value = "mal";
    input.listeners.input();
    assert.ok(menu.innerHTML.includes("Malaysia"));
    assert.ok(menu.innerHTML.includes("Maldives"));
    assert.ok(menu.innerHTML.includes("Mali"));
    assert.ok(!menu.innerHTML.includes("United States"),"Typing should filter the custom menu immediately");

    assert.ok(source.includes("profileSection.insertAdjacentHTML(\"afterend\",settingMarkup())"),"Streaming section must be inserted after Profile, not inside it");
    assert.ok(source.includes("input.addEventListener(\"click\",openMenu)"),"Picker must open on first click");
    assert.ok(source.includes("streaming-region-option-name"),"Country names should be the primary option label");
    assert.ok(source.includes("streaming-region-option-code"),"Country code should be secondary metadata only");
    assert.ok(!source.includes("MutationObserver"),"settings.js now renders its own streaming section; streaming-region.js must not install a re-render observer");
    assert.ok(!source.includes("renderShowReleasesTabHTML"),"Streaming Region must not wrap the removed Show composer");
    assert.ok(source.includes("mountStreamingRegionSetting:mountSetting"),"Region mount should remain directly testable");

    console.log("Streaming region regression tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
