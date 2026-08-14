(function(global){
    "use strict";

    const REGION_RE = /^[A-Z]{2}$/;
    const REGION_REQUIRED = "Choose a streaming region in Settings.";
    const NO_PROVIDER_DATA = "No streaming provider data available for this region.";
    let countries = [];
    let countriesPromise = null;
    let pendingRegion = "";
    let mountQueued = false;
    let settingsObserver = null;

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
        .catch(()=>[])
        .finally(()=>{ countriesPromise = null; });

        return countriesPromise;
    }

    function countryName(code){
        const clean = normalize(code);
        if(!clean){
            return "";
        }
        const match = (countries.length ? countries : runtimeCountries()).find(item=>item.code === clean);
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
        const match = (countries.length ? countries : runtimeCountries())
        .find(item=>item.name.toLowerCase() === lower);
        return match ? match.code : "";
    }

    function escapeAttribute(value){
        return String(value || "")
        .replace(/&/g,"&amp;")
        .replace(/"/g,"&quot;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;");
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

    function emptyMessage(text){
        return `<div class="v2-api-empty">${text}</div>`;
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

    function installProviderRenderGuard(){
        const showRender = global.renderShowReleasesTabHTML;
        if(typeof showRender === "function" && !showRender.__streamingRegionGuard){
            const wrappedShow = function(show){
                const region = getRegion();
                if(!region){
                    return emptyMessage(REGION_REQUIRED);
                }
                const data = show && show._tmdb_watch_providers && show._tmdb_watch_providers.results
                ? show._tmdb_watch_providers.results[region]
                : null;
                return data ? showRender.call(this,show) : emptyMessage(NO_PROVIDER_DATA);
            };
            wrappedShow.__streamingRegionGuard = true;
            global.renderShowReleasesTabHTML = wrappedShow;
        }

        const movieRender = global.renderMovieProvidersHTML;
        if(typeof movieRender === "function" && !movieRender.__streamingRegionGuard){
            const wrappedMovie = function(movie){
                const region = getRegion();
                if(!region){
                    return emptyMessage(REGION_REQUIRED);
                }
                const data = movie && movie.watch_providers && movie.watch_providers.results
                ? movie.watch_providers.results[region]
                : null;
                return data ? movieRender.call(this,movie) : emptyMessage(NO_PROVIDER_DATA);
            };
            wrappedMovie.__streamingRegionGuard = true;
            global.renderMovieProvidersHTML = wrappedMovie;
        }
    }

    function currentDraft(){
        return global.profileSettingsDraft && typeof global.profileSettingsDraft === "object"
        ? global.profileSettingsDraft
        : null;
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

    function settingMarkup(){
        return `
            <div class="streaming-region-setting" id="streaming-region-setting" style="margin:22px 0;">
                <label class="profile-settings-label" for="streaming-region-input">Streaming Region</label>
                <input class="profile-settings-input" id="streaming-region-input" type="search"
                    list="streaming-region-options" autocomplete="off" placeholder="Search countries"
                    aria-describedby="streaming-region-help">
                <datalist id="streaming-region-options"></datalist>
                <p id="streaming-region-help" style="margin:8px 0 0;color:#888;font-size:13px;line-height:1.45;">
                    Controls Where to Watch and streaming-service filters. Leave empty for no region.
                </p>
                <button class="settings-action-button muted" id="clear-streaming-region"
                    type="button" style="margin-top:10px;">Clear Region</button>
            </div>
        `;
    }

    function mountSetting(){
        if(!global.document || typeof global.document.querySelector !== "function"){
            return false;
        }
        const controls = global.document.querySelector(".profile-settings-controls");
        if(!controls){
            return false;
        }
        if(global.document.getElementById("streaming-region-setting")){
            return true;
        }

        const draft = currentDraft();
        pendingRegion = normalize(
            draft && Object.prototype.hasOwnProperty.call(draft,"streaming_region")
            ? draft.streaming_region
            : (pendingRegion || getRegion())
        );
        if(draft){
            draft.streaming_region = pendingRegion;
        }

        const saveButton = global.document.getElementById("save-profile-settings");
        const finalButtons = saveButton && typeof saveButton.closest === "function"
        ? saveButton.closest(".profile-settings-buttons")
        : null;
        if(finalButtons && typeof finalButtons.insertAdjacentHTML === "function"){
            finalButtons.insertAdjacentHTML("beforebegin",settingMarkup());
        }else if(typeof controls.insertAdjacentHTML === "function"){
            controls.insertAdjacentHTML("beforeend",settingMarkup());
        }else{
            return false;
        }

        const input = global.document.getElementById("streaming-region-input");
        const list = global.document.getElementById("streaming-region-options");
        const clear = global.document.getElementById("clear-streaming-region");
        const save = global.document.getElementById("save-profile-settings");
        if(!input || !list){
            return false;
        }

        input.value = countryName(pendingRegion);

        const sync = strict=>{
            const raw = String(input.value || "").trim();
            if(!raw){
                pendingRegion = "";
                const liveDraft = currentDraft();
                if(liveDraft){ liveDraft.streaming_region = ""; }
                if(typeof input.removeAttribute === "function"){
                    input.removeAttribute("aria-invalid");
                }
                return true;
            }
            const region = resolveCountry(raw);
            if(region){
                pendingRegion = region;
                const liveDraft = currentDraft();
                if(liveDraft){ liveDraft.streaming_region = region; }
                if(typeof input.removeAttribute === "function"){
                    input.removeAttribute("aria-invalid");
                }
                return true;
            }
            if(strict){
                if(typeof input.setAttribute === "function"){
                    input.setAttribute("aria-invalid","true");
                }
                if(typeof global.showToast === "function"){
                    global.showToast("Choose a valid streaming region or clear the field.");
                }
                if(typeof input.focus === "function"){
                    input.focus();
                }
            }
            return false;
        };

        if(typeof input.addEventListener === "function"){
            input.addEventListener("input",()=>sync(false));
            input.addEventListener("change",()=>{
                if(sync(false) && pendingRegion){
                    input.value = countryName(pendingRegion);
                }
            });
        }
        if(clear && typeof clear.addEventListener === "function"){
            clear.addEventListener("click",()=>{
                input.value = "";
                pendingRegion = "";
                const liveDraft = currentDraft();
                if(liveDraft){ liveDraft.streaming_region = ""; }
                if(typeof input.removeAttribute === "function"){
                    input.removeAttribute("aria-invalid");
                }
                if(typeof input.focus === "function"){
                    input.focus();
                }
            });
        }
        if(save && typeof save.addEventListener === "function"){
            save.addEventListener("click",event=>{
                if(!sync(true)){
                    if(event && typeof event.preventDefault === "function"){
                        event.preventDefault();
                    }
                    if(event && typeof event.stopImmediatePropagation === "function"){
                        event.stopImmediatePropagation();
                    }
                }
            },true);
        }

        loadCountries().then(items=>{
            list.innerHTML = items.map(item=>
                `<option value="${escapeAttribute(item.name)}">${escapeAttribute(item.code)}</option>`
            ).join("");
            const current = normalize(pendingRegion);
            if(current){
                input.value = countryName(current);
            }
        });

        return true;
    }

    function queueMount(){
        if(mountQueued){
            return;
        }
        mountQueued = true;
        Promise.resolve().then(()=>{
            mountQueued = false;
            mountSetting();
        });
    }

    function installSettingsRender(){
        const original = global.renderSettings;
        if(typeof original !== "function" || original.__streamingRegionGuard){
            return;
        }
        const wrapped = function(){
            const result = original.apply(this,arguments);
            queueMount();
            return result;
        };
        wrapped.__streamingRegionGuard = true;
        global.renderSettings = wrapped;
    }

    function installSettingsObserver(){
        if(
            !global.document ||
            typeof global.MutationObserver !== "function" ||
            settingsObserver
        ){
            return;
        }
        const root = global.document.getElementById("settings-content");
        if(!root){
            return;
        }
        settingsObserver = new global.MutationObserver(()=>{
            if(
                global.document.querySelector(".profile-settings-controls") &&
                !global.document.getElementById("streaming-region-setting")
            ){
                queueMount();
            }
        });
        settingsObserver.observe(root,{childList:true,subtree:true});
    }

    function installMountLifecycle(){
        if(!global.document){
            return;
        }
        installSettingsObserver();
        queueMount();
        if(global.document.readyState === "loading" && typeof global.document.addEventListener === "function"){
            global.document.addEventListener("DOMContentLoaded",()=>{
                installSettingsObserver();
                queueMount();
            },{once:true});
        }
    }

    profile();
    pendingRegion = getRegion();
    installRegionGetters();
    installProviderCatalogGuard();
    installBrowseGuard();
    installDetailRequestGuard();
    installProviderRenderGuard();
    installSettingsDraft();
    installSettingsSave();
    installSettingsRender();
    installMountLifecycle();

    global.TVTrackerStreamingRegion = Object.freeze({
        normalizeStreamingRegion:normalize,
        getStreamingRegion:getRegion,
        setStreamingRegion:value=>{
            pendingRegion = normalize(value);
            return setRegion(pendingRegion);
        },
        resolveCountryInput:resolveCountry,
        loadCountries,
        mountStreamingRegionSetting:mountSetting,
        resetProviderRuntime:resetProviders,
        REGION_REQUIRED_MESSAGE:REGION_REQUIRED,
        NO_PROVIDER_MESSAGE:NO_PROVIDER_DATA
    });
})(window);
