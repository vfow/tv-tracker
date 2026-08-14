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

    function escapeHTML(value){
        return String(value || "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
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

    function ensurePickerStyles(){
        if(
            !global.document ||
            !global.document.head ||
            typeof global.document.createElement !== "function" ||
            global.document.getElementById("streaming-region-picker-styles")
        ){
            return;
        }
        const style = global.document.createElement("style");
        style.id = "streaming-region-picker-styles";
        style.textContent = `
            .streaming-region-section{overflow:visible!important;}
            .streaming-region-control{max-width:760px;}
            .streaming-region-combobox{position:relative;max-width:520px;}
            .streaming-region-combobox .profile-settings-input{width:100%;}
            .streaming-region-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:1200;max-height:300px;overflow-y:auto;border:1px solid #2b2b2b;background:#0b0b0b;box-shadow:0 18px 45px rgba(0,0,0,.55);}
            .streaming-region-menu[hidden]{display:none!important;}
            .streaming-region-option{display:flex;width:100%;align-items:center;justify-content:space-between;gap:18px;border:0;border-bottom:1px solid #1e1e1e;background:transparent;padding:11px 13px;text-align:left;color:#fff;cursor:pointer;}
            .streaming-region-option:last-child{border-bottom:0;}
            .streaming-region-option:hover,.streaming-region-option:focus,.streaming-region-option.is-active{background:#fff;color:#000;outline:0;}
            .streaming-region-option-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            .streaming-region-option-code{flex:0 0 auto;font-size:12px;letter-spacing:.08em;color:#888;}
            .streaming-region-option:hover .streaming-region-option-code,.streaming-region-option:focus .streaming-region-option-code,.streaming-region-option.is-active .streaming-region-option-code{color:#444;}
            .streaming-region-menu-state{padding:12px 13px;color:#888;font-size:13px;}
            .streaming-region-help{margin:8px 0 0;color:#888;font-size:13px;line-height:1.45;}
            .streaming-region-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;}
            @media (max-width:575.98px){
                .streaming-region-combobox{max-width:none;}
                .streaming-region-menu{max-height:260px;}
                .streaming-region-actions{align-items:stretch;}
                .streaming-region-actions .settings-action-button{flex:1 1 160px;}
            }
        `;
        global.document.head.appendChild(style);
    }

    function settingMarkup(){
        return `
            <section class="settings-section streaming-region-section" id="streaming-region-setting">
                <div class="settings-section-header">
                    <h2>Streaming</h2>
                    <p>Choose the country used for Where to Watch and streaming-service filters.</p>
                </div>
                <div class="streaming-region-control">
                    <label class="profile-settings-label" for="streaming-region-input">Streaming Region</label>
                    <div class="streaming-region-combobox">
                        <input class="profile-settings-input" id="streaming-region-input" type="search"
                            autocomplete="off" placeholder="Search countries" role="combobox"
                            aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false"
                            aria-controls="streaming-region-menu" aria-describedby="streaming-region-help">
                        <div class="streaming-region-menu" id="streaming-region-menu" role="listbox" hidden></div>
                    </div>
                    <p class="streaming-region-help" id="streaming-region-help">
                        No region is selected by default. Country codes are saved internally for TMDB, but this menu always shows country names first.
                    </p>
                    <div class="streaming-region-actions">
                        <button class="settings-action-button muted" id="clear-streaming-region" type="button">Clear Region</button>
                        <button class="settings-action-button" id="save-streaming-region" type="button">Save Region</button>
                    </div>
                </div>
            </section>
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
        writeDraftRegion(pendingRegion);
        ensurePickerStyles();

        const profileSection = typeof controls.closest === "function"
        ? controls.closest(".settings-section")
        : null;
        if(profileSection && typeof profileSection.insertAdjacentHTML === "function"){
            profileSection.insertAdjacentHTML("afterend",settingMarkup());
        }else if(typeof controls.insertAdjacentHTML === "function"){
            controls.insertAdjacentHTML("afterend",settingMarkup());
        }else{
            return false;
        }

        const input = global.document.getElementById("streaming-region-input");
        const menu = global.document.getElementById("streaming-region-menu");
        const clear = global.document.getElementById("clear-streaming-region");
        const saveRegion = global.document.getElementById("save-streaming-region");
        const saveProfile = global.document.getElementById("save-profile-settings");
        if(!input || !menu){
            return false;
        }

        let menuOpen = false;
        let activeIndex = -1;
        let visibleItems = [];

        function setExpanded(open){
            menuOpen = !!open;
            menu.hidden = !menuOpen;
            if(typeof input.setAttribute === "function"){
                input.setAttribute("aria-expanded",menuOpen ? "true" : "false");
            }
        }

        function renderMenu(){
            if(!menuOpen){
                return;
            }
            const source = availableCountries();
            if(!source.length){
                menu.innerHTML = `<div class="streaming-region-menu-state">Loading countries…</div>`;
                visibleItems = [];
                activeIndex = -1;
                return;
            }
            visibleItems = filterCountries(input.value,source);
            if(!visibleItems.length){
                menu.innerHTML = `<div class="streaming-region-menu-state">No countries found.</div>`;
                activeIndex = -1;
                return;
            }
            if(activeIndex >= visibleItems.length){
                activeIndex = visibleItems.length - 1;
            }
            menu.innerHTML = visibleItems.map((item,index)=>`
                <button class="streaming-region-option${index === activeIndex ? " is-active" : ""}" type="button"
                    role="option" data-region="${escapeHTML(item.code)}" aria-selected="${index === activeIndex ? "true" : "false"}">
                    <span class="streaming-region-option-name">${escapeHTML(item.name)}</span>
                    <span class="streaming-region-option-code">${escapeHTML(item.code)}</span>
                </button>
            `).join("");
        }

        function closeMenu(){
            activeIndex = -1;
            setExpanded(false);
        }

        function openMenu(){
            setExpanded(true);
            renderMenu();
            loadCountries().then(()=>{
                if(pendingRegion && !String(input.value || "").trim()){
                    input.value = countryName(pendingRegion);
                }
                renderMenu();
            });
        }

        function chooseRegion(code){
            const next = normalize(code);
            if(!next){
                return false;
            }
            pendingRegion = next;
            writeDraftRegion(next);
            input.value = countryName(next);
            if(typeof input.removeAttribute === "function"){
                input.removeAttribute("aria-invalid");
            }
            closeMenu();
            return true;
        }

        function validateInput(strict=true){
            const raw = String(input.value || "").trim();
            if(!raw){
                pendingRegion = "";
                writeDraftRegion("");
                if(typeof input.removeAttribute === "function"){
                    input.removeAttribute("aria-invalid");
                }
                return true;
            }
            const next = resolveCountry(raw);
            if(next){
                pendingRegion = next;
                writeDraftRegion(next);
                input.value = countryName(next);
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
                    global.showToast("Choose a country from the streaming region list or clear the field.");
                }
                if(typeof input.focus === "function"){
                    input.focus();
                }
                openMenu();
            }
            return false;
        }

        async function saveSelectedRegion(){
            if(!validateInput(true) || typeof global.saveProfileSettings !== "function"){
                return;
            }
            let settings = currentDraft();
            if(!settings && typeof global.createProfileSettingsDraft === "function"){
                settings = global.createProfileSettingsDraft() || {};
            }
            settings = settings && typeof settings === "object" ? settings : {};
            settings.streaming_region = pendingRegion;
            if(saveRegion){ saveRegion.disabled = true; }
            try{
                await global.saveProfileSettings(settings);
            }finally{
                if(saveRegion){ saveRegion.disabled = false; }
            }
        }

        input.value = countryName(pendingRegion);

        if(typeof input.addEventListener === "function"){
            input.addEventListener("focus",openMenu);
            input.addEventListener("click",openMenu);
            input.addEventListener("input",()=>{
                activeIndex = -1;
                openMenu();
                renderMenu();
            });
            input.addEventListener("keydown",event=>{
                const key = event && event.key;
                if(key === "Escape"){
                    closeMenu();
                    return;
                }
                if(key === "ArrowDown" || key === "ArrowUp"){
                    if(event && typeof event.preventDefault === "function"){
                        event.preventDefault();
                    }
                    if(!menuOpen){
                        openMenu();
                    }
                    if(!visibleItems.length){
                        renderMenu();
                    }
                    if(visibleItems.length){
                        const direction = key === "ArrowDown" ? 1 : -1;
                        activeIndex = activeIndex < 0
                        ? (direction > 0 ? 0 : visibleItems.length - 1)
                        : (activeIndex + direction + visibleItems.length) % visibleItems.length;
                        renderMenu();
                    }
                    return;
                }
                if(key === "Enter" && menuOpen && activeIndex >= 0 && visibleItems[activeIndex]){
                    if(event && typeof event.preventDefault === "function"){
                        event.preventDefault();
                    }
                    chooseRegion(visibleItems[activeIndex].code);
                }
            });
        }

        if(typeof menu.addEventListener === "function"){
            menu.addEventListener("click",event=>{
                const target = event && event.target && typeof event.target.closest === "function"
                ? event.target.closest("[data-region]")
                : null;
                if(target){
                    chooseRegion(target.getAttribute("data-region"));
                }
            });
        }

        if(clear && typeof clear.addEventListener === "function"){
            clear.addEventListener("click",()=>{
                input.value = "";
                pendingRegion = "";
                writeDraftRegion("");
                if(typeof input.removeAttribute === "function"){
                    input.removeAttribute("aria-invalid");
                }
                closeMenu();
                if(typeof input.focus === "function"){
                    input.focus();
                }
            });
        }

        if(saveRegion && typeof saveRegion.addEventListener === "function"){
            saveRegion.addEventListener("click",saveSelectedRegion);
        }

        if(saveProfile && typeof saveProfile.addEventListener === "function"){
            saveProfile.addEventListener("click",event=>{
                if(!validateInput(true)){
                    if(event && typeof event.preventDefault === "function"){
                        event.preventDefault();
                    }
                    if(event && typeof event.stopImmediatePropagation === "function"){
                        event.stopImmediatePropagation();
                    }
                }
            },true);
        }

        if(global.document && typeof global.document.addEventListener === "function"){
            global.document.addEventListener("click",event=>{
                const target = event && event.target;
                const shell = typeof input.closest === "function" ? input.closest(".streaming-region-combobox") : null;
                if(menuOpen && shell && target && typeof shell.contains === "function" && !shell.contains(target)){
                    closeMenu();
                }
            });
        }

        loadCountries().then(()=>{
            if(pendingRegion){
                input.value = countryName(pendingRegion);
            }
            renderMenu();
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
            mountSetting();
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
            writeDraftRegion(pendingRegion);
            return setRegion(pendingRegion);
        },
        resolveCountryInput:resolveCountry,
        filterCountries,
        getCountryName:countryName,
        loadCountries,
        mountStreamingRegionSetting:mountSetting,
        resetProviderRuntime:resetProviders,
        REGION_REQUIRED_MESSAGE:REGION_REQUIRED,
        NO_PROVIDER_MESSAGE:NO_PROVIDER_DATA
    });
})(window);
