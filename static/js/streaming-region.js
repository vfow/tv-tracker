(function(global){
    "use strict";

    const REGION_RE = /^[A-Z]{2}$/;
    const REGION_REQUIRED = "Choose a streaming region in Settings.";
    const NO_PROVIDER_DATA = "No streaming provider data available for this region.";
    let countries = [];
    let countriesPromise = null;
    let pendingRegion = "";

    function normalize(value){
        const code = String(value || "").trim().toUpperCase();
        return REGION_RE.test(code) ? code : "";
    }

    function profile(){
        if(!global.DATA || typeof global.DATA !== "object"){
            return null;
        }
        if(!global.DATA.profile || typeof global.DATA.profile !== "object"){
            global.DATA.profile = {};
        }
        global.DATA.profile.streaming_region = normalize(global.DATA.profile.streaming_region);
        return global.DATA.profile;
    }

    function getRegion(){
        const data = profile();
        return data ? data.streaming_region : "";
    }

    function setRegion(value){
        const data = profile();
        const code = normalize(value);
        if(data){
            data.streaming_region = code;
        }
        return code;
    }

    function normalizeCountries(items){
        const seen = new Set();
        return (Array.isArray(items) ? items : []).map(item=>{
            const code = normalize(item && (item.code || item.iso_3166_1));
            const name = String(item && (item.name || item.english_name || item.native_name) || "").trim();
            if(!code || !name || seen.has(code)){
                return null;
            }
            seen.add(code);
            return {code,name};
        }).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
    }

    function runtimeCountries(){
        return normalizeCountries(
            global.browseOptionState && Array.isArray(global.browseOptionState.countries)
            ? global.browseOptionState.countries
            : []
        );
    }

    async function loadCountries(){
        const runtime = runtimeCountries();
        if(runtime.length){
            countries = runtime;
            return countries;
        }
        if(countries.length){
            return countries;
        }
        if(countriesPromise){
            return countriesPromise;
        }
        if(typeof global.tmdbFetchJSON !== "function"){
            return [];
        }

        countriesPromise = global.tmdbFetchJSON("configuration/countries")
        .then(payload=>{
            countries = normalizeCountries(payload);
            if(
                global.browseOptionState &&
                Array.isArray(global.browseOptionState.countries) &&
                global.browseOptionState.countries.length === 0
            ){
                global.browseOptionState.countries = countries.slice();
            }
            return countries;
        })
        .finally(()=>{ countriesPromise = null; });

        return countriesPromise;
    }

    function availableCountries(){
        return countries.length ? countries : runtimeCountries();
    }

    function countryName(code){
        const clean = normalize(code);
        if(!clean){
            return "";
        }
        const match = availableCountries().find(item=>item.code === clean);
        return match ? match.name : clean;
    }

    function resolveCountry(value){
        const raw = String(value || "").trim();
        if(!raw){
            return "";
        }
        const direct = normalize(raw);
        if(direct){
            return direct;
        }
        const lower = raw.toLowerCase();
        const match = availableCountries().find(item=>item.name.toLowerCase() === lower);
        return match ? match.code : "";
    }

    function filterCountries(query,items=availableCountries()){
        const clean = String(query || "").trim().toLowerCase();
        const list = normalizeCountries(items);
        if(!clean){
            return list;
        }
        return list.filter(item=>
            item.name.toLowerCase().includes(clean) || item.code.toLowerCase().includes(clean)
        );
    }

    function resetProviders(){
        const options = global.browseOptionState;
        if(options){
            if(options.providers){
                options.providers.tv = [];
                options.providers.movie = [];
            }
            if(options.loaded){
                options.loaded.tvProviders = false;
                options.loaded.movieProviders = false;
            }
            if(options.picker && options.picker.type === "provider"){
                options.picker = {type:"",query:"",loading:false,error:"",results:[]};
            }
        }
        if(global.browseReferencePromises){
            global.browseReferencePromises.tvProviders = null;
            global.browseReferencePromises.movieProviders = null;
        }
    }

    function refreshRegionView(){
        const renders = {
            "show-detail":"renderActiveShowDetailPage",
            "movie-detail":"renderActiveMoviePage",
            "browse-detail":"renderActiveBrowsePage",
            settings:"renderSettings"
        };
        const name = renders[global.activePage];
        if(name && typeof global[name] === "function"){
            global[name]();
        }
    }

    function installRegionGetters(){
        global.getAppWatchRegion = getRegion;
        global.getStaticWatchRegion = getRegion;
        global.v2GetWatchRegion = getRegion;
    }

    function installProviderCatalogGuard(){
        const original = global.tmdbGetWatchProviderCatalog;
        if(typeof original !== "function" || original.__streamingRegionGuard){
            return;
        }
        const wrapped = async function(media){
            const region = getRegion();
            if(!region){
                return [];
            }
            const results = await original.call(this,media,region);
            if(getRegion() !== region){
                const error = new Error("Streaming region changed while provider data was loading.");
                error.code = "STALE_STREAMING_REGION";
                throw error;
            }
            return results;
        };
        wrapped.__streamingRegionGuard = true;
        global.tmdbGetWatchProviderCatalog = wrapped;
    }

    function installBrowseGuard(){
        const api = global.TVTrackerBrowse;
        if(!api || typeof api.buildTMDBParams !== "function" || api.__streamingRegionGuard){
            return;
        }
        const original = api.buildTMDBParams;
        global.TVTrackerBrowse = Object.freeze(Object.assign({},api,{
            buildTMDBParams(input,page,options={}){
                const region = getRegion();
                const params = original.call(api,input,page,Object.assign({},options,{watchRegion:region || "ZZ"}));
                if(!region){
                    delete params.with_watch_providers;
                    delete params.watch_region;
                    delete params.with_watch_monetization_types;
                }else if(params.with_watch_providers){
                    params.watch_region = region;
                }
                return params;
            },
            __streamingRegionGuard:true
        }));
    }

    function installDetailRequestGuard(){
        if(typeof global.tmdbFetchJSON !== "function"){
            return;
        }

        const showDetails = global.tmdbGetShowDetails;
        if(typeof showDetails === "function" && !showDetails.__streamingRegionGuard){
            const wrappedShow = async function(showId,options={}){
                if(getRegion()){
                    return showDetails.apply(this,arguments);
                }
                return global.tmdbFetchJSON(
                    "tv/" + encodeURIComponent(String(showId)),
                    {append_to_response:"external_ids,videos,content_ratings,similar,aggregate_credits,alternative_titles,keywords"},
                    options
                );
            };
            wrappedShow.__streamingRegionGuard = true;
            global.tmdbGetShowDetails = wrappedShow;
        }

        const movieDetails = global.tmdbGetMovieDetails;
        if(typeof movieDetails === "function" && !movieDetails.__streamingRegionGuard){
            const wrappedMovie = async function(movieId){
                if(getRegion()){
                    return movieDetails.apply(this,arguments);
                }
                return global.tmdbFetchJSON(
                    "movie/" + encodeURIComponent(String(movieId)),
                    {append_to_response:"external_ids,videos,release_dates,credits,similar,keywords"}
                );
            };
            wrappedMovie.__streamingRegionGuard = true;
            global.tmdbGetMovieDetails = wrappedMovie;
        }
    }

    function currentDraft(){
        return global.profileSettingsDraft && typeof global.profileSettingsDraft === "object"
        ? global.profileSettingsDraft
        : null;
    }

    function writeDraftRegion(value){
        const draft = currentDraft();
        if(draft){
            draft.streaming_region = normalize(value);
        }
    }

    function installSettingsDraft(){
        const original = global.createProfileSettingsDraft;
        if(typeof original !== "function" || original.__streamingRegionGuard){
            return;
        }
        const wrapped = function(){
            const draft = original.apply(this,arguments) || {};
            draft.streaming_region = getRegion();
            pendingRegion = draft.streaming_region;
            return draft;
        };
        wrapped.__streamingRegionGuard = true;
        global.createProfileSettingsDraft = wrapped;
    }

    function installSettingsSave(){
        const original = global.saveProfileSettings;
        if(typeof original !== "function" || original.__streamingRegionGuard){
            return;
        }
        const wrapped = async function(settings){
            const before = getRegion();
            const supplied = settings && Object.prototype.hasOwnProperty.call(settings,"streaming_region")
            ? settings.streaming_region
            : pendingRegion;
            const next = normalize(supplied);
            pendingRegion = next;
            if(settings && typeof settings === "object"){
                settings.streaming_region = next;
            }
            setRegion(next);
            try{
                const result = await original.apply(this,arguments);
                if(before !== next){
                    resetProviders();
                    refreshRegionView();
                }
                return result;
            }catch(error){
                pendingRegion = before;
                setRegion(before);
                throw error;
            }
        };
        wrapped.__streamingRegionGuard = true;
        global.saveProfileSettings = wrapped;
    }

    profile();
    pendingRegion = getRegion();
    installRegionGetters();
    installProviderCatalogGuard();
    installBrowseGuard();
    installDetailRequestGuard();
    installSettingsDraft();
    installSettingsSave();

    global.TVTrackerStreamingRegion = Object.freeze({
        normalizeStreamingRegion:normalize,
        getStreamingRegion:getRegion,
        setStreamingRegion:value=>{
            pendingRegion = normalize(value);
            writeDraftRegion(pendingRegion);
            return setRegion(pendingRegion);
        },
        resolveCountryInput:resolveCountry,
        filterCountries,
        getCountryName:countryName,
        loadCountries,
        resetProviderRuntime:resetProviders,
        REGION_REQUIRED_MESSAGE:REGION_REQUIRED,
        NO_PROVIDER_MESSAGE:NO_PROVIDER_DATA
    });
})(window);
