const TMDB_SEARCH_CACHE_PREFIX = "tv-tracker-tmdb-search:";
const TMDB_SEARCH_CACHE_TTL = 1000 * 60 * 60 * 24;
const TMDB_CONFIGURATION_CACHE_KEY = "tv-tracker-tmdb-configuration:v2";
const TMDB_CONFIGURATION_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
const TMDB_SHOW_APPEND_TO_RESPONSE = [
    "external_ids",
    "videos",
    "content_ratings",
    "watch/providers",
    "recommendations",
    "similar",
    "aggregate_credits",
    "alternative_titles"
];

const TMDB_EPISODE_APPEND_TO_RESPONSE = [
    "external_ids",
    "credits"
];

const tmdbSearchMemoryCache = new Map();
let tmdbConfigurationMemoryCache = null;

function normalizeTMDBSearchQuery(query){
    return String(query || "").trim().toLowerCase();
}

function readTMDBSearchCache(query){
    const key = normalizeTMDBSearchQuery(query);

    if(!key){
        return null;
    }

    if(tmdbSearchMemoryCache.has(key)){
        return tmdbSearchMemoryCache.get(key);
    }

    try{
        const raw = sessionStorage.getItem(TMDB_SEARCH_CACHE_PREFIX + key);

        if(!raw){
            return null;
        }

        const cached = JSON.parse(raw);

        if(!cached || !Array.isArray(cached.results)){
            return null;
        }

        if(Date.now() - Number(cached.savedAt || 0) > TMDB_SEARCH_CACHE_TTL){
            sessionStorage.removeItem(TMDB_SEARCH_CACHE_PREFIX + key);
            return null;
        }

        tmdbSearchMemoryCache.set(key,cached.results);
        return cached.results;

    }catch(error){
        return null;
    }
}

function writeTMDBSearchCache(query,results){
    const key = normalizeTMDBSearchQuery(query);

    if(!key || !Array.isArray(results)){
        return;
    }

    const cleanResults = results.slice(0,20).map(show=>{
        return {
            id:show.id,
            name:show.name || show.original_name || "",
            poster_path:show.poster_path || "",
            backdrop_path:show.backdrop_path || "",
            overview:show.overview || "",
            first_air_date:show.first_air_date || "",
            vote_average:show.vote_average || 0,
            popularity:show.popularity || 0,
            _search_source:show._search_source || "title"
        };
    });

    tmdbSearchMemoryCache.set(key,cleanResults);

    try{
        sessionStorage.setItem(
            TMDB_SEARCH_CACHE_PREFIX + key,
            JSON.stringify({
                savedAt:Date.now(),
                results:cleanResults
            })
        );
    }catch(error){}
}

function tmdbGetCachedSearchShows(query){
    return readTMDBSearchCache(query);
}

function tmdbHasApiKey(){
    // The key is held by Flask and never exposed to the browser.
    return true;
}

async function tmdbFetchJSON(path,params={},options={}){
    const searchParams = new URLSearchParams();

    Object.keys(params || {}).forEach(key=>{
        const value = params[key];
        if(value !== undefined && value !== null && value !== ""){
            searchParams.set(key,String(value));
        }
    });

    const suffix = searchParams.toString() ? "?" + searchParams.toString() : "";
    const response = await fetch(
        `${TMDB_API_BASE}/${String(path || "").replace(/^\/+/,"")}${suffix}`,
        options && options.signal ? {signal:options.signal} : undefined
    );

    if(!response.ok){
        let message = "TMDB error: " + response.status;
        try{
            const data = await response.clone().json();
            if(data && data.status_message){
                message = data.status_message;
            }
        }catch(error){}

        if(response.status === 401){
            message = "TMDB access is unavailable. Check the server TMDB_API_KEY configuration.";
        }else if(response.status === 404){
            message = "No matching TV show found.";
        }else if(response.status === 429){
            message = "TMDB is rate-limiting requests. Try again soon.";
        }

        throw new Error(message);
    }

    return await response.json();
}

function readCachedTMDBConfiguration(){
    if(tmdbConfigurationMemoryCache){
        return tmdbConfigurationMemoryCache;
    }

    try{
        const raw = localStorage.getItem(TMDB_CONFIGURATION_CACHE_KEY);
        if(!raw){
            return null;
        }

        const cached = JSON.parse(raw);
        if(!cached || !cached.data || Date.now() - Number(cached.savedAt || 0) > TMDB_CONFIGURATION_CACHE_TTL){
            localStorage.removeItem(TMDB_CONFIGURATION_CACHE_KEY);
            return null;
        }

        tmdbConfigurationMemoryCache = cached.data;
        return tmdbConfigurationMemoryCache;
    }catch(error){
        return null;
    }
}

function writeCachedTMDBConfiguration(data){
    if(!data || typeof data !== "object"){
        return;
    }

    tmdbConfigurationMemoryCache = data;

    try{
        localStorage.setItem(
            TMDB_CONFIGURATION_CACHE_KEY,
            JSON.stringify({savedAt:Date.now(),data:data})
        );
    }catch(error){}
}

async function tmdbGetConfiguration(force=false){
    if(!force){
        const cached = readCachedTMDBConfiguration();
        if(cached){
            return cached;
        }
    }

    const data = await tmdbFetchJSON("configuration");
    writeCachedTMDBConfiguration(data);
    return data;
}

async function tmdbWarmImageConfiguration(){
    if(!tmdbHasApiKey()){
        return null;
    }

    try{
        return await tmdbGetConfiguration(false);
    }catch(error){
        return null;
    }
}

function tmdbConfiguredImageURL(path,size="w500"){
    const value = String(path || "").trim();

    if(!value){
        return "";
    }

    if(/^https?:\/\//i.test(value)){
        return value;
    }

    const config = readCachedTMDBConfiguration();
    const images = config && config.images ? config.images : null;
    const secureBase = images && images.secure_base_url ? images.secure_base_url : "https://image.tmdb.org/t/p/";
    return secureBase + String(size || "w500") + value;
}

function detectTMDBSearchInput(query){
    const raw = String(query || "").trim();
    const lower = raw.toLowerCase();

    const prefixedTMDB = lower.match(/^tmdb\s*[:#-]?\s*(\d+)$/);
    if(prefixedTMDB){
        return {type:"tmdb",id:prefixedTMDB[1],raw:raw};
    }

    const prefixedTVDB = lower.match(/^tvdb\s*[:#-]?\s*(\d+)$/);
    if(prefixedTVDB){
        return {type:"tvdb",id:prefixedTVDB[1],raw:raw};
    }

    const imdb = lower.match(/^(tt\d{5,})$/);
    if(imdb){
        return {type:"imdb",id:imdb[1],raw:raw};
    }

    if(/^\d+$/.test(raw)){
        return {type:"numeric",id:raw,raw:raw};
    }

    return {type:"title",id:"",raw:raw};
}

function normalizeTMDBShowSearchResult(show,source="title"){
    if(!show || !show.id){
        return null;
    }

    return {
        id:show.id,
        name:show.name || show.original_name || show.title || "Untitled",
        poster_path:show.poster_path || "",
        backdrop_path:show.backdrop_path || "",
        overview:show.overview || "",
        first_air_date:show.first_air_date || "",
        vote_average:show.vote_average || 0,
        popularity:show.popularity || 0,
        _search_source:source
    };
}

async function tmdbFindTVByExternalId(externalId,externalSource,options={}){
    const data = await tmdbFetchJSON(
        "find/" + encodeURIComponent(String(externalId || "").trim()),
        {external_source:externalSource},
        options
    );

    return (data.tv_results || [])
    .map(show=>normalizeTMDBShowSearchResult(show,externalSource))
    .filter(Boolean);
}

async function tmdbSearchShowsByDetectedInput(query,options={}){
    const detected = detectTMDBSearchInput(query);

    if(detected.type === "imdb"){
        return tmdbFindTVByExternalId(detected.id,"imdb_id",options);
    }

    if(detected.type === "tvdb"){
        return tmdbFindTVByExternalId(detected.id,"tvdb_id",options);
    }

    if(detected.type === "tmdb" || detected.type === "numeric"){
        try{
            const details = await tmdbGetShowDetails(detected.id,options);
            if(details && details.id){
                return [normalizeTMDBShowSearchResult(details,detected.type === "tmdb" ? "tmdb_id" : "numeric_tmdb")];
            }
        }catch(error){
            if(detected.type === "tmdb"){
                throw error;
            }
        }

        if(detected.type === "numeric"){
            try{
                return await tmdbFindTVByExternalId(detected.id,"tvdb_id",options);
            }catch(error){
                return [];
            }
        }
    }

    return null;
}

async function tmdbSearchShowsPage(query,page=1,options={}){
    const cleanQuery = String(query || "").trim();
    const pageNumber = Math.max(1,Number(page || 1));

    if(!cleanQuery){
        return {results:[],page:1,total_pages:1,total_results:0};
    }

    const detected = detectTMDBSearchInput(cleanQuery);
    const isIdSearch = detected.type !== "title";

    if(isIdSearch){
        if(pageNumber > 1){
            return {results:[],page:pageNumber,total_pages:1,total_results:0};
        }

        const idResults = await tmdbSearchShowsByDetectedInput(cleanQuery,options);
        return {
            results:idResults || [],
            page:1,
            total_pages:1,
            total_results:(idResults || []).length
        };
    }

    if(pageNumber === 1){
        const cached = readTMDBSearchCache(cleanQuery);

        if(cached){
            return {
                results:cached,
                page:1,
                total_pages:cached.length >= 20 ? 2 : 1,
                total_results:cached.length
            };
        }
    }

    const data = await tmdbFetchJSON("search/tv",{
        query:cleanQuery,
        include_adult:"false",
        page:pageNumber
    },options);

    const results = data.results || [];

    if(pageNumber === 1){
        writeTMDBSearchCache(cleanQuery,results);
    }

    return {
        results:results,
        page:Number(data.page || pageNumber),
        total_pages:Number(data.total_pages || pageNumber || 1),
        total_results:Number(data.total_results || results.length || 0)
    };
}

async function tmdbSearchShows(query,options={}){
    const cleanQuery = String(query || "").trim();

    if(!cleanQuery){
        return [];
    }

    const payload = await tmdbSearchShowsPage(cleanQuery,1,options);
    return payload.results || [];
}

async function tmdbGetShowDetails(showId,options={}){
    return await tmdbFetchJSON(
        "tv/" + encodeURIComponent(String(showId)),
        {append_to_response:TMDB_SHOW_APPEND_TO_RESPONSE.join(",")},
        options
    );
}

async function tmdbGetSeason(showId,seasonNumber,options={}){
    return await tmdbFetchJSON(
        "tv/" + encodeURIComponent(String(showId)) + "/season/" + encodeURIComponent(String(seasonNumber)),
        {append_to_response:"external_ids"},
        options
    );
}

async function tmdbGetExternalIds(showId){
    return await tmdbFetchJSON("tv/" + encodeURIComponent(String(showId)) + "/external_ids");
}


async function tmdbGetShowRecommendations(showId,page=1,options={}){
    const data = await tmdbFetchJSON(
        "tv/" + encodeURIComponent(String(showId)) + "/recommendations",
        {page:Math.max(1,Number(page || 1))},
        options
    );

    return data;
}

async function tmdbGetSimilarShows(showId,page=1,options={}){
    const data = await tmdbFetchJSON(
        "tv/" + encodeURIComponent(String(showId)) + "/similar",
        {page:Math.max(1,Number(page || 1))},
        options
    );

    return data;
}

async function tmdbGetEpisodeDetails(showId,seasonNumber,episodeNumber,options={}){
    return await tmdbFetchJSON(
        "tv/" + encodeURIComponent(String(showId)) +
        "/season/" + encodeURIComponent(String(seasonNumber)) +
        "/episode/" + encodeURIComponent(String(episodeNumber)),
        {append_to_response:TMDB_EPISODE_APPEND_TO_RESPONSE.join(",")},
        options
    );
}

async function tmdbGetEpisodeCredits(showId,seasonNumber,episodeNumber,options={}){
    return await tmdbFetchJSON(
        "tv/" + encodeURIComponent(String(showId)) +
        "/season/" + encodeURIComponent(String(seasonNumber)) +
        "/episode/" + encodeURIComponent(String(episodeNumber)) +
        "/credits",
        {},
        options
    );
}

window.TVTrackerTMDB = window.TVTrackerTMDB || {};
window.TVTrackerTMDB.detectInput = detectTMDBSearchInput;
window.TVTrackerTMDB.imageURL = tmdbConfiguredImageURL;
window.TVTrackerTMDB.getConfiguration = tmdbGetConfiguration;
window.TVTrackerTMDB.warmImageConfiguration = tmdbWarmImageConfiguration;

