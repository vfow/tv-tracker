(function(global){
    "use strict";

    const DAY_TTL = 1000 * 60 * 30;
    const WEEK_TTL = 1000 * 60 * 60 * 3;
    const CACHE_PREFIX = "tv-tracker-trending:v1:";
    const ROW_LIMIT = 14;

    const CONFIGS = Object.freeze({
        "tv-day":Object.freeze({key:"tv-day",media:"tv",window:"day",path:"trending/tv/day",title:"Trending TV Shows Today",rowTitle:"Trending Today",section:"TV Shows",ttl:DAY_TTL}),
        "tv-week":Object.freeze({key:"tv-week",media:"tv",window:"week",path:"trending/tv/week",title:"Trending TV Shows This Week",rowTitle:"Trending This Week",section:"TV Shows",ttl:WEEK_TTL}),
        "movie-day":Object.freeze({key:"movie-day",media:"movie",window:"day",path:"trending/movie/day",title:"Trending Movies Today",rowTitle:"Trending Today",section:"Movies",ttl:DAY_TTL}),
        "movie-week":Object.freeze({key:"movie-week",media:"movie",window:"week",path:"trending/movie/week",title:"Trending Movies This Week",rowTitle:"Trending This Week",section:"Movies",ttl:WEEK_TTL})
    });

    const ORDER = Object.freeze(["tv-day","tv-week","movie-day","movie-week"]);
    const hubSections = new Map();
    let hubLoadPromise = null;
    let pageRequestId = 0;

    function configFor(key){
        return CONFIGS[String(key || "").trim().toLowerCase()] || null;
    }

    function routeFor(key){
        const config = configFor(key);
        return config ? "/app/discover?trending=" + encodeURIComponent(config.key) : "/app/discover";
    }

    function parseRoute(pathname,search=""){
        const path = String(pathname || "").replace(/\/+$/g,"") || "/";
        if(path !== "/app/discover"){
            return "";
        }
        let params;
        try{
            params = new URLSearchParams(String(search || ""));
        }catch(error){
            return "";
        }
        const values = params.getAll("trending");
        if(values.length !== 1){
            return "";
        }
        for(const key of params.keys()){
            if(key !== "trending"){
                return "";
            }
        }
        const clean = String(values[0] || "").trim().toLowerCase();
        return configFor(clean) ? clean : "";
    }

    function currentRouteKey(){
        if(!global.location){ return ""; }
        return parseRoute(global.location.pathname,global.location.search);
    }

    function normalizeItem(raw,media){
        if(typeof global.normalizeDiscoverMediaResultItem === "function"){
            return global.normalizeDiscoverMediaResultItem(raw,media);
        }
        if(!raw || !raw.id){ return null; }
        const cleanMedia = media === "movie" ? "movie" : "tv";
        const title = cleanMedia === "movie"
        ? (raw.title || raw.original_title || "Untitled")
        : (raw.name || raw.original_name || "Untitled");
        const date = cleanMedia === "movie" ? (raw.release_date || "") : (raw.first_air_date || "");
        return {
            id:Number(raw.id || 0),
            media_type:cleanMedia,
            name:title,
            title:title,
            poster_path:raw.poster_path || "",
            backdrop_path:raw.backdrop_path || "",
            overview:raw.overview || "",
            first_air_date:cleanMedia === "tv" ? date : "",
            release_date:cleanMedia === "movie" ? date : "",
            date:date,
            vote_average:Number(raw.vote_average || 0),
            popularity:Number(raw.popularity || 0),
            adult:cleanMedia === "movie" && raw.adult === true
        };
    }

    function normalizeItems(results,media,limit=Infinity){
        const seen = new Set();
        const output = [];
        for(const raw of (Array.isArray(results) ? results : [])){
            const item = normalizeItem(raw,media);
            if(!item || !item.id || seen.has(String(item.id))){
                continue;
            }
            seen.add(String(item.id));
            output.push(item);
            if(output.length >= limit){ break; }
        }
        return output;
    }

    function buildSection(key,payload){
        const config = configFor(key);
        if(!config){ return null; }
        const items = normalizeItems(payload && payload.results,config.media,ROW_LIMIT);
        return {
            key:"trending/" + config.key,
            media:config.media,
            category:"trending-" + config.window,
            title:config.rowTitle,
            section:config.section,
            route:routeFor(config.key),
            items:items,
            shows:items,
            hasMore:items.length > 0,
            loadingMore:false
        };
    }

    function mergeSections(baseSections,trendingSections){
        const trendList = (Array.isArray(trendingSections) ? trendingSections : []).filter(Boolean);
        const trendKeys = new Set(trendList.map(section=>String(section.key || "")));
        const cleaned = (Array.isArray(baseSections) ? baseSections : []).filter(section=>section && !trendKeys.has(String(section.key || "")) && !String(section.key || "").startsWith("trending/"));
        const byMedia = {
            tv:trendList.filter(section=>section.media === "tv"),
            movie:trendList.filter(section=>section.media === "movie")
        };
        const inserted = {tv:false,movie:false};
        const output = [];

        cleaned.forEach(section=>{
            output.push(section);
            const media = section && section.media === "movie" ? "movie" : "tv";
            if(section && section.category === "popular" && byMedia[media].length){
                output.push(...byMedia[media]);
                inserted[media] = true;
            }
        });

        ["tv","movie"].forEach(media=>{
            if(inserted[media] || !byMedia[media].length){ return; }
            const firstIndex = output.findIndex(section=>section && section.media === media);
            if(firstIndex >= 0){
                output.splice(firstIndex,0,...byMedia[media]);
            }else{
                output.push(...byMedia[media]);
            }
        });
        return output;
    }

    function readCache(config){
        if(!config || typeof global.sessionStorage === "undefined"){ return null; }
        try{
            const raw = global.sessionStorage.getItem(CACHE_PREFIX + config.key);
            if(!raw){ return null; }
            const cached = JSON.parse(raw);
            if(!cached || !Array.isArray(cached.results) || Date.now() - Number(cached.savedAt || 0) > config.ttl){
                global.sessionStorage.removeItem(CACHE_PREFIX + config.key);
                return null;
            }
            return {results:cached.results};
        }catch(error){
            return null;
        }
    }

    function writeCache(config,payload){
        if(!config || !payload || !Array.isArray(payload.results) || typeof global.sessionStorage === "undefined"){ return; }
        try{
            global.sessionStorage.setItem(CACHE_PREFIX + config.key,JSON.stringify({savedAt:Date.now(),results:payload.results}));
        }catch(error){}
    }

    async function fetchFeed(config,force=false){
        if(!config){ throw new Error("Trending feed not found."); }
        if(!force){
            const cached = readCache(config);
            if(cached){ return cached; }
        }
        if(typeof global.tmdbFetchJSON !== "function"){
            throw new Error("TMDB is unavailable.");
        }
        const payload = await global.tmdbFetchJSON(config.path,{language:"en-US"});
        const clean = {results:Array.isArray(payload && payload.results) ? payload.results : []};
        writeCache(config,clean);
        return clean;
    }

    function currentHubTrendingSections(){
        return ORDER.map(key=>hubSections.get(key)).filter(Boolean);
    }

    function mergeHubState(){
        if(!global.discoverHubState || !Array.isArray(global.discoverHubState.sections)){ return; }
        global.discoverHubState.sections = mergeSections(global.discoverHubState.sections,currentHubTrendingSections());
    }

    async function loadHubRows(force=false){
        if(hubLoadPromise && !force){ return hubLoadPromise; }
        const task = (async()=>{
            const results = await Promise.allSettled(ORDER.map(async key=>{
                const config = CONFIGS[key];
                const payload = await fetchFeed(config,force);
                return {key,section:buildSection(key,payload)};
            }));
            results.forEach(result=>{
                if(result.status !== "fulfilled"){ return; }
                const value = result.value;
                if(value.section && value.section.items.length){
                    hubSections.set(value.key,value.section);
                }
            });
            mergeHubState();
            if(global.activePage === "discover" && typeof global.renderDiscoverHub === "function"){
                global.renderDiscoverHub();
            }
            return currentHubTrendingSections();
        })();
        hubLoadPromise = task;
        try{
            return await task;
        }finally{
            if(hubLoadPromise === task){ hubLoadPromise = null; }
        }
    }

    function isPlainClick(event){
        if(typeof global.isPlainAppLinkClick === "function"){
            return global.isPlainAppLinkClick(event);
        }
        return !!event && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    }

    function setRoute(config,replace=false){
        if(!config || !global.history){ return; }
        const method = replace ? "replaceState" : "pushState";
        global.history[method]({tvTrackerRoute:true,trending:true},"",routeFor(config.key));
        if(typeof global.rememberRouteNavContext === "function"){
            global.rememberRouteNavContext(routeFor(config.key),"discover");
        }
    }

    function showShell(config){
        if(typeof global.document === "undefined"){ return; }
        global.activePage = "discovery-detail";
        global.selectedShowId = null;
        global.selectedEpisodeContext = null;
        global.selectedGenreSlug = null;
        global.selectedPersonContext = null;
        global.selectedDiscoveryContext = null;
        global.selectedMovieId = null;
        global.selectedCollectionId = null;
        global.showDetailPreview = null;
        global.discoverPreviewShow = null;
        global.discoveryPageState = Object.assign({},global.discoveryPageState || {},{
            type:"trending",
            value:config.key,
            name:config.title,
            media:config.media,
            loading:true,
            error:"",
            shows:[]
        });
        global.document.querySelectorAll(".page").forEach(section=>section.classList.remove("active-page"));
        if(typeof global.activatePrimaryNavContext === "function"){
            global.activatePrimaryNavContext("discover");
        }
        const page = global.document.getElementById("genre-detail-page");
        if(page){
            page.classList.add("active-page");
            page.scrollTop = 0;
        }
        if(typeof global.updateShellTitle === "function"){
            global.updateShellTitle();
        }
    }

    function renderFullPage(config,items,loading,error=""){
        if(typeof global.document === "undefined"){ return; }
        const content = global.document.getElementById("genre-detail-content");
        if(!content){ return; }
        const safe = typeof global.escapeHTML === "function" ? global.escapeHTML : value=>String(value || "").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
        const body = error
        ? `<div class="empty-state genre-detail-empty"><h2>Trending could not load</h2><p>${safe(error)}</p></div>`
        : items.length
        ? `<div class="genre-tight-grid">${items.map(item=>{
            const card = typeof global.renderGenrePosterGridCard === "function" ? global.renderGenrePosterGridCard(item) : "";
            return card.replace('class="genre-result-card','class="genre-result-card trending-result-card');
        }).join("")}</div>`
        : loading
        ? `<div class="genre-tight-grid genre-tight-grid-loading">${typeof global.renderTrackerPosterSkeletonCards === "function" ? global.renderTrackerPosterSkeletonCards(12) : ""}</div>`
        : `<div class="empty-state genre-detail-empty"><h2>No trending titles found</h2><p>Try again later.</p></div>`;

        content.innerHTML = `
            <div class="genre-detail-page-inner trending-page-inner">
                <div class="genre-detail-header trending-page-header">
                    <button type="button" class="show-page-back-button genre-page-back-button" id="trending-page-back-button" aria-label="Back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
                    <div><h1 class="genre-detail-title">${safe(config.title)}</h1></div>
                </div>
                <div class="genre-result-content">${body}</div>
            </div>
        `;
        attachFullPageEvents(config);
    }

    function attachFullPageEvents(config){
        if(typeof global.document === "undefined"){ return; }
        const back = global.document.getElementById("trending-page-back-button");
        if(back){
            back.addEventListener("click",()=>{
                if(typeof global.navigateBackOrRouteFallback === "function"){
                    global.navigateBackOrRouteFallback("/app/discover");
                }else if(global.history && global.history.length > 1){
                    global.history.back();
                }else if(global.location){
                    global.location.assign("/app/discover");
                }
            });
        }
        global.document.querySelectorAll(".trending-result-card[data-media-id]").forEach(card=>{
            card.addEventListener("click",async event=>{
                if(!isPlainClick(event)){ return; }
                event.preventDefault();
                event.stopPropagation();
                const id = Number(card.dataset.mediaId || 0);
                const name = card.dataset.mediaName || card.dataset.showName || "";
                if(!id){ return; }
                const backRoute = routeFor(config.key);
                if(config.media === "movie" && typeof global.openMoviePage === "function"){
                    await global.openMoviePage(id,{movieName:name,navigationContext:"discover",backRoute});
                    return;
                }
                if(typeof global.openShowDetailsPage === "function"){
                    await global.openShowDetailsPage(id,{showName:name,navigationContext:"discover",backRoute});
                }
            });
        });
    }

    async function openPage(key,options={}){
        const config = configFor(key);
        if(!config){ return false; }
        const replace = options && options.replace === true;
        const keepRoute = options && options.keepRoute === true;
        if(!keepRoute){ setRoute(config,replace); }
        const requestId = ++pageRequestId;
        showShell(config);
        renderFullPage(config,[],true,"");
        try{
            const payload = await fetchFeed(config,false);
            if(requestId !== pageRequestId || currentRouteKey() !== config.key){ return true; }
            const items = normalizeItems(payload.results,config.media);
            global.discoveryPageState = Object.assign({},global.discoveryPageState || {},{loading:false,error:"",shows:items,name:config.title,media:config.media});
            renderFullPage(config,items,false,"");
            if(typeof global.updateShellTitle === "function"){ global.updateShellTitle(); }
        }catch(error){
            if(requestId !== pageRequestId || currentRouteKey() !== config.key){ return true; }
            const message = "Couldn’t load this page. Try again later.";
            global.discoveryPageState = Object.assign({},global.discoveryPageState || {},{loading:false,error:message,shows:[]});
            renderFullPage(config,[],false,message);
        }
        return true;
    }

    const initialKey = currentRouteKey();
    let pendingInitialKey = initialKey;

    const originalRenderDiscoverHub = typeof global.renderDiscoverHub === "function" ? global.renderDiscoverHub : null;
    if(originalRenderDiscoverHub){
        global.renderDiscoverHub = function(){
            mergeHubState();
            return originalRenderDiscoverHub.apply(this,arguments);
        };
    }

    const originalOpenDiscoverHomePage = typeof global.openDiscoverHomePage === "function" ? global.openDiscoverHomePage : null;
    if(originalOpenDiscoverHomePage){
        global.openDiscoverHomePage = function(options={}){
            if(pendingInitialKey){
                const key = pendingInitialKey;
                pendingInitialKey = "";
                return openPage(key,{replace:true});
            }
            const result = originalOpenDiscoverHomePage.apply(this,arguments);
            Promise.resolve(result).then(()=>loadHubRows(false)).catch(()=>{});
            return result;
        };
    }

    const originalNavigateToRouteFallback = typeof global.navigateToRouteFallback === "function" ? global.navigateToRouteFallback : null;
    if(originalNavigateToRouteFallback){
        global.navigateToRouteFallback = function(route){
            let key = "";
            try{
                const url = new URL(String(route || ""),global.location && global.location.origin ? global.location.origin : "http://localhost");
                key = parseRoute(url.pathname,url.search);
            }catch(error){}
            if(key){
                return openPage(key,{replace:false});
            }
            return originalNavigateToRouteFallback.apply(this,arguments);
        };
    }

    if(typeof global.document !== "undefined"){
        global.document.addEventListener("click",event=>{
            if(!isPlainClick(event)){ return; }
            const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if(!anchor){ return; }
            let url;
            try{ url = new URL(anchor.getAttribute("href"),global.location && global.location.origin ? global.location.origin : "http://localhost"); }
            catch(error){ return; }
            const key = parseRoute(url.pathname,url.search);
            if(!key){ return; }
            event.preventDefault();
            event.stopImmediatePropagation();
            openPage(key,{replace:false}).catch(()=>{});
        },true);
    }

    if(typeof global.addEventListener === "function"){
        global.addEventListener("popstate",event=>{
            const key = currentRouteKey();
            if(!key){ return; }
            if(event && typeof event.stopImmediatePropagation === "function"){
                event.stopImmediatePropagation();
            }
            openPage(key,{keepRoute:true}).catch(()=>{});
        });
    }

    global.TVTrackerTrending = Object.freeze({
        DAY_TTL,
        WEEK_TTL,
        CONFIGS,
        ORDER,
        routeFor,
        parseRoute,
        normalizeItems,
        buildSection,
        mergeSections,
        loadHubRows,
        openPage
    });
})(typeof window !== "undefined" ? window : globalThis);
