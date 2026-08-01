const TMDB_SEARCH_CACHE_PREFIX = "tv-tracker-tmdb-search:";
const TMDB_SEARCH_CACHE_TTL = 1000 * 60 * 60 * 24;
const tmdbSearchMemoryCache = new Map();



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

    const cleanResults = results.slice(0,12).map(show=>{
        return {
            id:show.id,
            name:show.name || show.original_name || "",
            poster_path:show.poster_path || "",
            overview:show.overview || "",
            first_air_date:show.first_air_date || "",
            vote_average:show.vote_average || 0,
            popularity:show.popularity || 0
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



async function tmdbSearchShows(query,options={}){

    const cleanQuery = String(query || "").trim();

    if(!cleanQuery){
        return [];
    }

    const cached = readTMDBSearchCache(cleanQuery);

    if(cached){
        return cached;
    }

    const response = await fetch(
        `${TMDB_API_BASE}/search/tv?query=${encodeURIComponent(cleanQuery)}&include_adult=false&page=1`,
        options && options.signal ? {signal:options.signal} : undefined
    );

    if(!response.ok){
        throw new Error("TMDB error: " + response.status);
    }

    const data = await response.json();
    const results = data.results || [];

    writeTMDBSearchCache(cleanQuery,results);

    return readTMDBSearchCache(cleanQuery) || results;

}



async function tmdbGetShowDetails(showId){

    const response = await fetch(
        `${TMDB_API_BASE}/tv/${showId}`
    );

    if(!response.ok){
        throw new Error("TMDB error: " + response.status);
    }

    return await response.json();

}



async function tmdbGetSeason(showId, seasonNumber){

    const response = await fetch(
        `${TMDB_API_BASE}/tv/${showId}/season/${seasonNumber}`
    );

    if(!response.ok){
        throw new Error("TMDB error: " + response.status);
    }

    return await response.json();

}
