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

    const cleanResults = results.slice(0,20).map(show=>{
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




async function tmdbSearchShowsPage(query,page=1,options={}){

    const cleanQuery = String(query || "").trim();
    const pageNumber = Math.max(1,Number(page || 1));

    if(!cleanQuery){
        return {results:[],page:1,total_pages:1,total_results:0};
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

    const response = await fetch(
        `${TMDB_API_BASE}/search/tv?query=${encodeURIComponent(cleanQuery)}&include_adult=false&page=${encodeURIComponent(pageNumber)}`,
        options && options.signal ? {signal:options.signal} : undefined
    );

    if(!response.ok){
        throw new Error("TMDB error: " + response.status);
    }

    const data = await response.json();
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
