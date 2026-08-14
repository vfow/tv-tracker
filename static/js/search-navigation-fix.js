(function(global){
    "use strict";

    function buildSearchBackRoute(){
        if(typeof global.getSearchRoute !== "function"){
            return "";
        }

        const routeState = global.searchRouteState && typeof global.searchRouteState === "object"
        ? global.searchRouteState
        : {};
        const searchState = global.discoverSearchState && typeof global.discoverSearchState === "object"
        ? global.discoverSearchState
        : {};
        const query = String(searchState.query || routeState.query || "").trim();

        if(!query){
            return "";
        }

        const media = typeof global.normalizeSearchMediaType === "function"
        ? global.normalizeSearchMediaType(searchState.media || routeState.media || "tv")
        : "tv";
        const route = global.getSearchRoute(query,media,routeState);

        routeState.query = query;
        routeState.media = media;
        searchState.query = query;
        searchState.media = media;

        if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
            global.TVTrackerRouter.setPathRoute(route,true);
        }else if(global.history && typeof global.history.replaceState === "function"){
            global.history.replaceState({tvTrackerRoute:true},"",route);
        }

        return route;
    }

    global.lockSearchRouteBeforeResultOpen = buildSearchBackRoute;
    global.TVTrackerSearchNavigationFix = Object.freeze({buildSearchBackRoute});
})(window);

(function(global){
    "use strict";

    const REGION_PATTERN = /^[A-Z]{2}$/;
    const REGION_REQUIRED_MESSAGE = "Choose a streaming region in Settings.";
    const NO_PROVIDER_MESSAGE = "No streaming provider data available for this region.";

    let countryOptions = [];
    let countryOptionsPromise = null;

    function normalizeStreamingRegion(value){
        const clean = String(value || "").trim().toUpperCase();
        return REGION_PATTERN.test(clean) ? clean : "";
    }

    function ensureStreamingProfile(){
        if(!global.DATA || typeof global.DATA !== "object"){
            return null;
        }
        if(!global.DATA.profile || typeof global.DATA.profile !== "object"){
            global.DATA.profile = {};
        }
        const clean = normalizeStreamingRegion(global.DATA.profile.streaming_region);
        global.DATA.profile.streaming_region = clean;
        return global.DATA.profile;
    }

    function getStreamingRegion(){
        const profile = ensureStreamingProfile();
        return profile ? normalizeStreamingRegion(profile.streaming_region) : "";
    }

    function setStreamingRegion(value){
        const profile = ensureStreamingProfile();
        const clean = normalizeStreamingRegion(value);
        if(profile){
            profile.streaming_region = clean;
        }
        return clean;
    }

    function normalizeCountryOptions(payload){
        const source = Array.isArray(payload) ? payload : [];
        const seen = new Set();
        return source.map(item=>{
            const code = normalizeStreamingRegion(item && (item.code || item.iso_3166_1));
            const name = String(item && (item.name || item.english_name || item.native_name) || "").trim();
            if(!code || !name || seen.has(code)){
                return null;
            }
            seen.add(code);
            return {code,name};
        }).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
    }

    function readRuntimeCountryOptions(){
        const runtime = global.browseOptionState && Array.isArray(global.browseOptionState.countries)
        ? global.browseOptionState.countries
        : [];
        return normalizeCountryOptions(runtime);
    }

    async function loadCountryOptions(){
        const runtime = readRuntimeCountryOptions();
        if(runtime.length){
            countryOptions = runtime;
            return countryOptions;
        }
        if(countryOptions.length){
            return countryOptions;
        }
        if(countryOptionsPromise){
            return countryOptionsPromise;
        }
        if(typeof global.tmdbFetchJSON !== "function"){
            return [];
        }

        countryOptionsPromise = global.tmdbFetchJSON("configuration/countries")
        .then(payload=>{
            countryOptions = normalizeCountryOptions(payload);
            if(global.browseOptionState && typeof global.browseOptionState === "object" && !global.browseOptionState.countries.length){
                global.browseOptionState.countries = countryOptions.slice();
            }
            return countryOptions;
        })
        .catch(()=>[])
        .finally(()=>{
            countryOptionsPromise = null;
        });

        return countryOptionsPromise;
    }

    function countryNameForRegion(region){
        const code = normalizeStreamingRegion(region);
        const options = countryOptions.length ? countryOptions : readRuntimeCountryOptions();
        const match = options.find(item=>item.code === code);
        return match ? match.name : code;
    }

    function resolveCountryInput(value){
        const raw = String(value || "").trim();
        if(!raw){
            return "";
        }
        const direct = normalizeStreamingRegion(raw);
        if(direct){
            return direct;
        }
        const lower = raw.toLowerCase();
        const options = countryOptions.length ? countryOptions : readRuntimeCountryOptions();
        const match = options.find(item=>String(item.name || "").toLowerCase() === lower);
        return match ? match.code : "";
    }

    function resetProviderRuntime(){
        if(global.browseOptionState && typeof global.browseOptionState === "object"){
            if(global.browseOptionState.providers){
                global.browseOptionState.providers.tv = [];
                global.browseOptionState.providers.movie = [];
            }
            if(global.browseOptionState.loaded){
                global.browseOptionState.loaded.tvProviders = false;
                global.browseOptionState.loaded.movieProviders = false;
            }
            if(global.browseOptionState.picker && global.browseOptionState.picker.type === "provider"){
                global.browseOptionState.picker = {type:"",query:"",loading:false,error:"",results:[]};
            }
        }
        if(global.browseReferencePromises && typeof global.browseReferencePromises === "object"){
            global.browseReferencePromises.tvProviders = null;
            global.browseReferencePromises.movieProviders = null;
        }
    }

    function refreshRegionSensitiveView(){
        if(global.activePage === "show-detail" && typeof global.renderActiveShowDetailPage === "function"){
            global.renderActiveShowDetailPage();
        }else if(global.activePage === "movie-detail" && typeof global.renderActiveMoviePage === "function"){
            global.renderActiveMoviePage();
        }else if(global.activePage === "browse-detail" && typeof global.renderActiveBrowsePage === "function"){
            global.renderActiveBrowsePage();
        }else if(global.activePage === "settings" && typeof global.renderSettings === "function"){
            global.renderSettings();
        }
    }

    function providerMessageHTML(message){
        return `<div class="v2-api-empty">${String(message || "")}</div>`;
    }

    function installRegionGetters(){
        global.getAppWatchRegion = getStreamingRegion;
        global.getStaticWatchRegion = getStreamingRegion;
        global.v2GetWatchRegion = getStreamingRegion;
    }

    function guardProviderCatalog(){
        if(typeof global.tmdbGetWatchProviderCatalog !== "function" || global.tmdbGetWatchProviderCatalog.__streamingRegionGuard){
            return;
        }
        const original = global.tmdbGetWatchProviderCatalog;
        const guarded = async function(media){
            const region = getStreamingRegion();
            if(!region){
                return [];
            }
            const results = await original.call(this,media,region);
            if(getStreamingRegion() !== region){
                const error = new Error("Streaming region changed while provider data was loading.");
                error.code = "STALE_STREAMING_REGION";
                throw error;
            }
            return results;
        };
        guarded.__streamingRegionGuard = true;
        global.tmdbGetWatchProviderCatalog = guarded;
    }

    function guardBrowseProviderParams(){
        const api = global.TVTrackerBrowse;
        if(!api || typeof api.buildTMDBParams !== "function" || api.__streamingRegionGuard){
            return;
        }

        const originalBuild = api.buildTMDBParams;
        const wrapped = Object.assign({},api,{
            buildTMDBParams:function(input,page,options={}){
                const region = getStreamingRegion();
                const safeOptions = Object.assign({},options,{watchRegion:region || "ZZ"});
                const params = originalBuild.call(api,input,page,safeOptions);

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
        });

        global.TVTrackerBrowse = Object.freeze(wrapped);
    }

    function guardProviderRendering(){
        if(typeof global.renderShowReleasesTabHTML === "function" && !global.renderShowReleasesTabHTML.__streamingRegionGuard){
            const originalShowReleases = global.renderShowReleasesTabHTML;
            const wrappedShowReleases = function(show){
                const region = getStreamingRegion();
                if(!region){
                    return providerMessageHTML(REGION_REQUIRED_MESSAGE);
                }
                const providers = show && show._tmdb_watch_providers && show._tmdb_watch_providers.results
                ? show._tmdb_watch_providers.results[region]
                : null;
                if(!providers){
                    return providerMessageHTML(NO_PROVIDER_MESSAGE);
                }
                return originalShowReleases.call(this,show);
            };
            wrappedShowReleases.__streamingRegionGuard = true;
            global.renderShowReleasesTabHTML = wrappedShowReleases;
        }

        if(typeof global.renderMovieProvidersHTML === "function" && !global.renderMovieProvidersHTML.__streamingRegionGuard){
            const originalMovieProviders = global.renderMovieProvidersHTML;
            const wrappedMovieProviders = function(movie){
                const region = getStreamingRegion();
                if(!region){
                    return providerMessageHTML(REGION_REQUIRED_MESSAGE);
                }
                const providers = movie && movie.watch_providers && movie.watch_providers.results
                ? movie.watch_providers.results[region]
                : null;
                if(!providers){
                    return providerMessageHTML(NO_PROVIDER_MESSAGE);
                }
                return originalMovieProviders.call(this,movie);
            };
            wrappedMovieProviders.__streamingRegionGuard = true;
            global.renderMovieProvidersHTML = wrappedMovieProviders;
        }
    }

    function extendSettingsDraft(){
        if(typeof global.createProfileSettingsDraft !== "function" || global.createProfileSettingsDraft.__streamingRegionGuard){
            return;
        }
        const originalCreateDraft = global.createProfileSettingsDraft;
        const wrappedCreateDraft = function(){
            const draft = originalCreateDraft.apply(this,arguments) || {};
            draft.streaming_region = getStreamingRegion();
            return draft;
        };
        wrappedCreateDraft.__streamingRegionGuard = true;
        global.createProfileSettingsDraft = wrappedCreateDraft;
    }

    function extendSettingsSave(){
        if(typeof global.saveProfileSettings !== "function" || global.saveProfileSettings.__streamingRegionGuard){
            return;
        }
        const originalSave = global.saveProfileSettings;
        const wrappedSave = async function(settings){
            const before = getStreamingRegion();
            const next = normalizeStreamingRegion(settings && settings.streaming_region);
            setStreamingRegion(next);

            try{
                const result = await originalSave.apply(this,arguments);
                if(before !== next){
                    resetProviderRuntime();
                    refreshRegionSensitiveView();
                }
                return result;
            }catch(error){
                setStreamingRegion(before);
                throw error;
            }
        };
        wrappedSave.__streamingRegionGuard = true;
        global.saveProfileSettings = wrappedSave;
    }

    function populateRegionDatalist(datalist,input,draft){
        return loadCountryOptions().then(options=>{
            if(!datalist || !input){
                return;
            }
            datalist.innerHTML = options.map(item=>
                `<option value="${String(item.name).replace(/"/g,"&quot;")}">${item.code}</option>`
            ).join("");

            const current = normalizeStreamingRegion(draft && draft.streaming_region);
            if(current && (!input.value || normalizeStreamingRegion(input.value) === current)){
                input.value = countryNameForRegion(current);
            }
        });
    }

    function mountStreamingRegionSetting(){
        if(!global.document || typeof global.document.querySelector !== "function"){
            return;
        }
        const controls = global.document.querySelector(".profile-settings-controls");
        if(!controls || global.document.getElementById("streaming-region-input")){
            return;
        }

        const buttons = controls.querySelector(".profile-settings-buttons");
        const draft = global.profileSettingsDraft && typeof global.profileSettingsDraft === "object"
        ? global.profileSettingsDraft
        : null;
        if(!draft){
            return;
        }

        draft.streaming_region = normalizeStreamingRegion(draft.streaming_region || getStreamingRegion());

        const block = global.document.createElement("div");
        block.className = "streaming-region-setting";
        block.innerHTML = `
            <label class="profile-settings-label" for="streaming-region-input">Streaming Region</label>
            <input
                class="profile-settings-input"
                id="streaming-region-input"
                type="search"
                list="streaming-region-options"
                autocomplete="off"
                placeholder="Search countries"
                aria-describedby="streaming-region-help"
            >
            <datalist id="streaming-region-options"></datalist>
            <p id="streaming-region-help" style="margin:8px 0 0;color:#888;font-size:13px;">
                Controls Where to Watch and streaming-service filters. Leave empty for no region.
            </p>
            <button class="settings-action-button muted" id="clear-streaming-region" type="button" style="margin-top:10px;">Clear Region</button>
        `;

        if(buttons){
            controls.insertBefore(block,buttons);
        }else{
            controls.appendChild(block);
        }

        const input = global.document.getElementById("streaming-region-input");
        const datalist = global.document.getElementById("streaming-region-options");
        const clearButton = global.document.getElementById("clear-streaming-region");
        const saveButton = global.document.getElementById("save-profile-settings");

        input.value = countryNameForRegion(draft.streaming_region);

        const updateDraft = function(strict=false){
            const raw = String(input.value || "").trim();
            if(!raw){
                draft.streaming_region = "";
                input.removeAttribute("aria-invalid");
                return true;
            }
            const region = resolveCountryInput(raw);
            if(region){
                draft.streaming_region = region;
                input.removeAttribute("aria-invalid");
                return true;
            }
            if(strict){
                input.setAttribute("aria-invalid","true");
                if(typeof global.showToast === "function"){
                    global.showToast("Choose a valid streaming region or clear the field.");
                }
                input.focus();
            }
            return false;
        };

        input.addEventListener("input",function(){
            updateDraft(false);
        });
        input.addEventListener("change",function(){
            if(updateDraft(false)){
                const region = normalizeStreamingRegion(draft.streaming_region);
                if(region){
                    input.value = countryNameForRegion(region);
                }
            }
        });

        if(clearButton){
            clearButton.addEventListener("click",function(){
                input.value = "";
                draft.streaming_region = "";
                input.removeAttribute("aria-invalid");
                input.focus();
            });
        }

        if(saveButton){
            saveButton.addEventListener("click",function(event){
                if(!updateDraft(true)){
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },true);
        }

        populateRegionDatalist(datalist,input,draft);
    }

    function extendSettingsRender(){
        if(typeof global.renderSettings !== "function" || global.renderSettings.__streamingRegionGuard){
            return;
        }
        const originalRender = global.renderSettings;
        const wrappedRender = function(){
            const result = originalRender.apply(this,arguments);
            mountStreamingRegionSetting();
            return result;
        };
        wrappedRender.__streamingRegionGuard = true;
        global.renderSettings = wrappedRender;
    }

    installRegionGetters();
    guardProviderCatalog();
    guardBrowseProviderParams();
    guardProviderRendering();
    extendSettingsDraft();
    extendSettingsSave();
    extendSettingsRender();
    ensureStreamingProfile();

    global.TVTrackerStreamingRegion = Object.freeze({
        normalizeStreamingRegion,
        getStreamingRegion,
        setStreamingRegion,
        resolveCountryInput,
        resetProviderRuntime,
        REGION_REQUIRED_MESSAGE,
        NO_PROVIDER_MESSAGE
    });
})(window);
