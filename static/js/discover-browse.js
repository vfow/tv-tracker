(function(global){
    "use strict";

    const DEFAULT_SORT = "popularity-desc";
    const SORTS = new Set([
        "popularity-desc",
        "popularity-asc",
        "rating-desc",
        "rating-asc",
        "date-desc",
        "date-asc"
    ]);
    const TV_STATUS_VALUES = Object.freeze({
        "returning-series":"0",
        "in-production":"2",
        "ended":"3",
        "canceled":"4"
    });
    const MULTI_KEYS = Object.freeze(["genres","themes","companies","providers","statuses"]);
    const RUNTIME_RANGES = Object.freeze({
        tv:Object.freeze({
            "under-30":Object.freeze({label:"Under 30 min",min:0,max:29}),
            "30-44":Object.freeze({label:"30–44 min",min:30,max:44}),
            "45-59":Object.freeze({label:"45–59 min",min:45,max:59}),
            "60-89":Object.freeze({label:"60–89 min",min:60,max:89}),
            "90-plus":Object.freeze({label:"90+ min",min:90,max:null})
        }),
        movie:Object.freeze({
            "under-90":Object.freeze({label:"Under 90 min",min:0,max:89}),
            "90-119":Object.freeze({label:"90–119 min",min:90,max:119}),
            "120-149":Object.freeze({label:"120–149 min",min:120,max:149}),
            "150-179":Object.freeze({label:"150–179 min",min:150,max:179}),
            "180-plus":Object.freeze({label:"180+ min",min:180,max:null})
        })
    });

    function normalizeMedia(media){
        return String(media || "tv").trim().toLowerCase() === "movie" ? "movie" : "tv";
    }

    function normalizeId(value){
        const clean = String(value || "").trim();
        return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
    }

    function normalizeCountry(value){
        const clean = String(value || "").trim().toLowerCase();
        return /^[a-z]{2}$/.test(clean) ? clean : "";
    }

    function normalizeLanguage(value){
        const clean = String(value || "").trim().toLowerCase();
        return /^[a-z]{2,3}$/.test(clean) ? clean : "";
    }

    function normalizeYear(value){
        const clean = String(value || "").trim();
        return /^(18|19|20|21)[0-9]{2}$/.test(clean) ? clean : "";
    }

    function normalizeCertification(value){
        const clean = String(value || "").trim().toLowerCase();
        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean) ? clean : "";
    }

    function normalizeRuntime(value,media="tv"){
        const cleanMedia = normalizeMedia(media);
        const clean = String(value || "").trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(RUNTIME_RANGES[cleanMedia],clean) ? clean : "";
    }

    function normalizeSort(value){
        const clean = String(value || "").trim().toLowerCase();
        return SORTS.has(clean) ? clean : DEFAULT_SORT;
    }

    function unique(values,normalizer){
        const output = [];
        const seen = new Set();
        (Array.isArray(values) ? values : []).forEach(value=>{
            const clean = normalizer(value);
            if(!clean || seen.has(clean)){
                return;
            }
            seen.add(clean);
            output.push(clean);
        });
        return output.slice(0,12);
    }

    function parseList(value,normalizer){
        const source = Array.isArray(value) ? value : String(value || "").split(",");
        return unique(source,normalizer);
    }

    function normalizeStatus(value){
        const clean = String(value || "").trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(TV_STATUS_VALUES,clean) ? clean : "";
    }

    function emptyState(media="tv"){
        return {
            media:normalizeMedia(media),
            year:"",
            upcoming:false,
            genres:[],
            country:"",
            language:"",
            themes:[],
            companies:[],
            network:"",
            providers:[],
            runtime:"",
            statuses:[],
            certification:"",
            sort:DEFAULT_SORT
        };
    }

    function normalizeState(input={},media){
        const source = input && typeof input === "object" ? input : {};
        const cleanMedia = normalizeMedia(media || source.media || "tv");
        const upcoming = source.upcoming === true || String(source.upcoming || "") === "1";
        const state = {
            media:cleanMedia,
            year:upcoming ? "" : normalizeYear(source.year),
            upcoming,
            genres:parseList(source.genres || source.genre,normalizeId),
            country:normalizeCountry(source.country),
            language:normalizeLanguage(source.language),
            themes:parseList(source.themes || source.theme,normalizeId),
            companies:parseList(source.companies || source.company,normalizeId),
            network:normalizeId(source.network),
            providers:parseList(source.providers || source.provider,normalizeId),
            runtime:normalizeRuntime(source.runtime,cleanMedia),
            statuses:parseList(source.statuses || source.status,normalizeStatus),
            certification:normalizeCertification(source.certification),
            sort:normalizeSort(source.sort)
        };

        if(cleanMedia === "movie"){
            state.network = "";
            state.statuses = [];
        }else{
            state.certification = "";
        }
        return state;
    }

    function readParams(search){
        try{
            return new URLSearchParams(String(search || ""));
        }catch(error){
            return new URLSearchParams();
        }
    }

    function parseSearch(search,media="tv"){
        const params = readParams(search);
        const state = normalizeState({
            media,
            year:params.get("year") || "",
            upcoming:params.get("upcoming") === "1",
            genres:params.get("genre") || "",
            country:params.get("country") || "",
            language:params.get("language") || "",
            themes:params.get("theme") || "",
            companies:params.get("company") || "",
            network:params.get("network") || "",
            providers:params.get("provider") || "",
            runtime:params.get("runtime") || "",
            statuses:params.get("status") || "",
            certification:params.get("certification") || "",
            sort:params.get("sort") || DEFAULT_SORT
        },media);
        return {state,search:serializeSearch(state)};
    }

    function encodeList(values){
        return values.map(value=>encodeURIComponent(String(value))).join(",");
    }

    function serializeSearch(input){
        const state = normalizeState(input,input && input.media);
        const parts = [];
        if(state.genres.length){ parts.push("genre=" + encodeList(state.genres)); }
        if(state.themes.length){ parts.push("theme=" + encodeList(state.themes)); }
        if(state.companies.length){ parts.push("company=" + encodeList(state.companies)); }
        if(state.network){ parts.push("network=" + encodeURIComponent(state.network)); }
        if(state.providers.length){ parts.push("provider=" + encodeList(state.providers)); }
        if(state.runtime){ parts.push("runtime=" + encodeURIComponent(state.runtime)); }
        if(state.country){ parts.push("country=" + encodeURIComponent(state.country)); }
        if(state.language){ parts.push("language=" + encodeURIComponent(state.language)); }
        if(state.upcoming){
            parts.push("upcoming=1");
        }else if(state.year){
            parts.push("year=" + encodeURIComponent(state.year));
        }
        if(state.media === "tv" && state.statuses.length){ parts.push("status=" + encodeList(state.statuses)); }
        if(state.media === "movie" && state.certification){ parts.push("certification=" + encodeURIComponent(state.certification)); }
        if(state.sort !== DEFAULT_SORT){ parts.push("sort=" + encodeURIComponent(state.sort)); }
        return parts.length ? "?" + parts.join("&") : "";
    }

    function routeForState(input){
        const state = normalizeState(input,input && input.media);
        return "/app/browse/" + encodeURIComponent(state.media) + serializeSearch(state);
    }

    function cloneState(input){
        const state = normalizeState(input,input && input.media);
        return Object.assign({},state,{
            genres:state.genres.slice(),
            themes:state.themes.slice(),
            companies:state.companies.slice(),
            providers:state.providers.slice(),
            statuses:state.statuses.slice()
        });
    }

    function toggleMulti(input,key,value){
        const state = cloneState(input);
        if(!MULTI_KEYS.includes(key)){
            return state;
        }
        const normalizer = key === "statuses" ? normalizeStatus : normalizeId;
        const cleanValue = normalizer(value);
        if(!cleanValue){
            return state;
        }
        const values = state[key].slice();
        const index = values.indexOf(cleanValue);
        if(index >= 0){
            values.splice(index,1);
        }else{
            values.push(cleanValue);
        }
        state[key] = values;
        return normalizeState(state,state.media);
    }

    function setSingle(input,key,value){
        const state = cloneState(input);
        if(key === "year"){
            state.year = normalizeYear(value);
            state.upcoming = false;
        }else if(key === "upcoming"){
            state.upcoming = value === true || String(value || "") === "1";
            if(state.upcoming){ state.year = ""; }
        }else if(key === "country"){
            state.country = normalizeCountry(value);
        }else if(key === "language"){
            state.language = normalizeLanguage(value);
        }else if(key === "network"){
            state.network = normalizeId(value);
        }else if(key === "runtime"){
            state.runtime = normalizeRuntime(value,state.media);
        }else if(key === "certification"){
            state.certification = normalizeCertification(value);
        }else if(key === "sort"){
            state.sort = normalizeSort(value);
        }
        return normalizeState(state,state.media);
    }

    function removeValue(input,key,value=""){
        let state = cloneState(input);
        if(MULTI_KEYS.includes(key)){
            const clean = key === "statuses" ? normalizeStatus(value) : normalizeId(value);
            state[key] = state[key].filter(item=>item !== clean);
        }else if(key === "upcoming"){
            state.upcoming = false;
        }else if(Object.prototype.hasOwnProperty.call(state,key)){
            if(key === "sort"){
                state.sort = DEFAULT_SORT;
            }else if(Array.isArray(state[key])){
                state[key] = [];
            }else if(typeof state[key] === "boolean"){
                state[key] = false;
            }else{
                state[key] = "";
            }
        }
        return normalizeState(state,state.media);
    }

    function clearFilters(input){
        const media = normalizeMedia(input && input.media);
        return emptyState(media);
    }

    function switchMedia(input,targetMedia){
        const state = cloneState(input);
        state.media = normalizeMedia(targetMedia);
        if(state.media === "movie"){
            state.network = "";
            state.statuses = [];
        }else{
            state.certification = "";
        }
        return normalizeState(state,state.media);
    }

    function hasFilters(input){
        const state = normalizeState(input,input && input.media);
        return !!(
            state.year || state.upcoming || state.genres.length || state.country || state.language ||
            state.themes.length || state.companies.length || state.network || state.providers.length || state.runtime ||
            state.statuses.length || state.certification
        );
    }

    function sortToTMDB(sort,media){
        const cleanSort = normalizeSort(sort);
        const cleanMedia = normalizeMedia(media);
        const map = {
            "popularity-desc":"popularity.desc",
            "popularity-asc":"popularity.asc",
            "rating-desc":"vote_average.desc",
            "rating-asc":"vote_average.asc",
            "date-desc":cleanMedia === "movie" ? "primary_release_date.desc" : "first_air_date.desc",
            "date-asc":cleanMedia === "movie" ? "primary_release_date.asc" : "first_air_date.asc"
        };
        return map[cleanSort] || "popularity.desc";
    }

    function buildTMDBParams(input,page=1,options={}){
        const state = normalizeState(input,input && input.media);
        const media = state.media;
        const params = {
            page:Math.max(1,Number(page || 1)),
            sort_by:sortToTMDB(state.sort,media),
            include_adult:"false"
        };
        if(media === "tv"){
            params.include_null_first_air_dates = "false";
        }else{
            params.include_video = "false";
        }
        if(state.genres.length){ params.with_genres = state.genres.join("|"); }
        if(state.themes.length){ params.with_keywords = state.themes.join("|"); }
        if(state.companies.length){ params.with_companies = state.companies.join("|"); }
        if(media === "tv" && state.network){ params.with_networks = state.network; }
        if(state.providers.length){
            params.with_watch_providers = state.providers.join("|");
            params.watch_region = String(options.watchRegion || "US").toUpperCase();
            params.with_watch_monetization_types = "flatrate";
        }
        if(state.runtime){
            const range = RUNTIME_RANGES[media][state.runtime];
            if(range){
                if(Number.isFinite(range.min) && range.min > 0){ params["with_runtime.gte"] = range.min; }
                if(Number.isFinite(range.max)){ params["with_runtime.lte"] = range.max; }
            }
        }
        if(state.country){ params.with_origin_country = state.country.toUpperCase(); }
        if(state.language){ params.with_original_language = state.language; }
        if(state.upcoming){
            const today = /^\d{4}-\d{2}-\d{2}$/.test(String(options.today || ""))
            ? String(options.today)
            : new Date().toISOString().slice(0,10);
            if(media === "movie"){
                params["primary_release_date.gte"] = today;
            }else{
                params["first_air_date.gte"] = today;
            }
        }else if(state.year){
            if(media === "movie"){
                params.primary_release_year = state.year;
            }else{
                params.first_air_date_year = state.year;
            }
        }
        if(media === "tv" && state.statuses.length){
            params.with_status = state.statuses.map(status=>TV_STATUS_VALUES[status]).filter(Boolean).join("|");
        }
        if(media === "movie" && state.certification){
            params.certification_country = "US";
            params.certification = state.certification.toUpperCase();
        }
        if(state.sort === "rating-desc" || state.sort === "rating-asc"){
            params["vote_count.gte"] = media === "movie" ? 50 : 20;
        }
        return params;
    }

    function sortLabel(sort,media="tv"){
        const cleanSort = normalizeSort(sort);
        const dateName = normalizeMedia(media) === "movie" ? "Release Date" : "First Air Date";
        const labels = {
            "popularity-desc":"Popularity — High to Low",
            "popularity-asc":"Popularity — Low to High",
            "rating-desc":"Rating — High to Low",
            "rating-asc":"Rating — Low to High",
            "date-desc":dateName + " — Newest",
            "date-asc":dateName + " — Oldest"
        };
        return labels[cleanSort] || labels[DEFAULT_SORT];
    }

    global.TVTrackerBrowse = Object.freeze({
        DEFAULT_SORT,
        SORTS,
        TV_STATUS_VALUES,
        RUNTIME_RANGES,
        emptyState,
        normalizeState,
        parseSearch,
        serializeSearch,
        routeForState,
        cloneState,
        toggleMulti,
        setSingle,
        removeValue,
        clearFilters,
        switchMedia,
        hasFilters,
        sortToTMDB,
        buildTMDBParams,
        sortLabel,
        normalizeMedia,
        normalizeYear,
        normalizeCountry,
        normalizeLanguage,
        normalizeId,
        normalizeCertification,
        normalizeRuntime,
        normalizeSort
    });
}(window));
