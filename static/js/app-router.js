(function(){
    "use strict";

    const SHOW_TABS = new Set(["watchlist","upcoming","history"]);
    const SETTINGS_SECTIONS = new Set(["profile","auth","notifications","streaming","data","danger-zone"]);
    const LIST_ROUTE_TO_FILTER = {
        "watching":"watching",
        "paused":"paused",
        "completed":"finished",
        "plan-to-watch":"plan",
        "dropped":"dropped"
    };
    const FILTER_TO_LIST_ROUTE = {
        watching:"watching",
        paused:"paused",
        finished:"completed",
        plan:"plan-to-watch",
        dropped:"dropped"
    };
    const LIBRARY_SORT_MODES = new Set([
        "default",
        "title-az",
        "title-za",
        "recently-added",
        "recently-watched",
        "rating-desc",
        "year-newest",
        "year-oldest"
    ]);
    const COLLECTION_SORT_MODES = new Set([
        "name.asc",
        "size.desc",
        "date.desc",
        "date.asc",
        "rating.desc",
        "rating.asc",
        "popularity.desc",
        "popularity.asc"
    ]);
    const COLLECTION_DETAIL_SORT_MODES = new Set([
        "collection-order",
        "date-desc",
        "date-asc",
        "popularity-desc",
        "popularity-asc",
        "rating-desc",
        "rating-asc",
        "title-asc",
        "title-desc"
    ]);
    let applyingRoute = false;
    let initialRoutePrepared = false;
    const registeredRouteHandlers = [];

    function parseRouteIdSlug(value){
        const clean = String(value || "").trim().toLowerCase();
        const match = clean.match(/^([1-9][0-9]{0,11})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
        return match ? {id:match[1],slug:match[2] || "",hasSlug:!!match[2]} : {id:"",slug:"",hasSlug:false};
    }

    function parseRouteCodeSlug(value,pattern){
        const clean = String(value || "").trim().toLowerCase();
        const match = clean.match(pattern);
        return match ? {value:match[1],slug:match[2] || "",hasSlug:!!match[2]} : {value:"",slug:"",hasSlug:false};
    }

    function readSearchParams(search){
        try{
            return new URLSearchParams(String(search || ""));
        }catch(error){
            return new URLSearchParams();
        }
    }


    function canonicalEyeParams(params){
        const eye = {
            fadeWatched:params.get("fadeWatched") === "1",
            hideWatched:params.get("hideWatched") === "1",
            hidePlan:params.get("hidePlan") === "1",
            hideFavorites:params.get("hideFavorites") === "1"
        };
        const parts = [];
        if(eye.fadeWatched){ parts.push("fadeWatched=1"); }
        if(eye.hideWatched){ parts.push("hideWatched=1"); }
        if(eye.hidePlan){ parts.push("hidePlan=1"); }
        if(eye.hideFavorites){ parts.push("hideFavorites=1"); }
        return {eye,parts};
    }

    function canonicalSearchRoute(search){
        const params = readSearchParams(search);
        const query = String(params.get("q") || "").trim();
        const rawMedia = String(params.get("type") || "tv").trim().toLowerCase();
        const media = ["tv","movie","person","collection"].includes(rawMedia) ? rawMedia : "tv";
        const eye = canonicalEyeParams(params);
        const parts = query ? ["q=" + encodeURIComponent(query),"type=" + encodeURIComponent(media)] : [];
        if(query && media !== "person" && media !== "collection"){
            eye.parts.forEach(part=>parts.push(part));
        }
        return {
            query,
            media,
            eyeState:eye.eye,
            search:parts.length ? "?" + parts.join("&") : ""
        };
    }

    function canonicalListSearch(search){
        const params = readSearchParams(search);
        const query = String(params.get("q") || "").trim();
        const genre = String(params.get("genre") || "").trim();
        const network = String(params.get("network") || "").trim();
        const rawYear = String(params.get("year") || "").trim();
        const year = /^\d{4}$/.test(rawYear) ? rawYear : "";
        const rawSort = String(params.get("sort") || "").trim().toLowerCase();
        const sort = LIBRARY_SORT_MODES.has(rawSort) ? rawSort : "default";
        const parts = [];

        if(query){
            parts.push("q=" + encodeURIComponent(query));
        }
        if(genre && genre !== "all"){
            parts.push("genre=" + encodeURIComponent(genre));
        }
        if(network && network !== "all"){
            parts.push("network=" + encodeURIComponent(network));
        }
        if(year){
            parts.push("year=" + encodeURIComponent(year));
        }
        if(sort !== "default"){
            parts.push("sort=" + encodeURIComponent(sort));
        }

        return {
            query,
            genre:genre && genre !== "all" ? genre : "all",
            network:network && network !== "all" ? network : "all",
            year:year || "all",
            sort,
            search:parts.length ? "?" + parts.join("&") : ""
        };
    }

    function canonicalBrowseSearch(search,media="tv"){
        const cleanMedia = String(media || "tv").trim().toLowerCase() === "movie" ? "movie" : "tv";
        const api = typeof window !== "undefined" ? window.TVTrackerBrowse : null;
        if(api && typeof api.parseSearch === "function"){
            const parsed = api.parseSearch(search,cleanMedia);
            return {state:parsed.state,search:parsed.search};
        }
        return {state:{media:cleanMedia},search:""};
    }

    function canonicalCollectionsSearch(search){
        const params = readSearchParams(search);
        const rawQuery = String(params.get("q") || "").trim().slice(0,120);
        const rawGenre = String(params.get("genre") || "").trim();
        const genre = /^[1-9][0-9]{0,11}$/.test(rawGenre) ? rawGenre : "";
        const rawDecade = String(params.get("decade") || "").trim();
        const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
        const decadeNumber = /^(18|19|20|21)[0-9]0$/.test(rawDecade) ? Number(rawDecade) : 0;
        const decade = decadeNumber >= 1870 && decadeNumber <= currentDecade ? String(decadeNumber) : "";
        const rawSort = String(params.get("sort") || "").trim().toLowerCase();
        const sort = COLLECTION_SORT_MODES.has(rawSort) ? rawSort : "popularity.desc";
        const rawPage = String(params.get("page") || "").trim();
        const page = /^[1-9][0-9]{0,5}$/.test(rawPage) ? Math.max(1,Number(rawPage)) : 1;
        const parts = [];
        if(rawQuery){ parts.push("q=" + encodeURIComponent(rawQuery)); }
        if(genre){ parts.push("genre=" + encodeURIComponent(genre)); }
        if(decade){ parts.push("decade=" + encodeURIComponent(decade)); }
        if(sort !== "popularity.desc"){ parts.push("sort=" + encodeURIComponent(sort)); }
        if(page > 1){ parts.push("page=" + encodeURIComponent(String(page))); }
        return {state:{query:rawQuery,genre,decade,sort,page},search:parts.length ? "?" + parts.join("&") : ""};
    }
    function canonicalCollectionDetailSearch(search){
        const params = readSearchParams(search);
        const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
        const normalizeIdList = value=>{
            const seen = new Set();
            return String(value || "").split(",").map(item=>String(item || "").trim()).filter(item=>{
                if(!/^[1-9][0-9]{0,11}$/.test(item) || seen.has(item)){ return false; }
                seen.add(item);
                return true;
            }).slice(0,12);
        };
        const rawYear = String(params.get("year") || "").trim();
        const year = /^(18|19|20|21)[0-9]{2}$/.test(rawYear) ? rawYear : "";
        const rawDecade = String(params.get("decade") || "").trim();
        const decadeNumber = /^(18|19|20|21)[0-9]0$/.test(rawDecade) ? Number(rawDecade) : 0;
        const decade = !year && decadeNumber >= 1870 && decadeNumber <= currentDecade ? String(decadeNumber) : "";
        const rawLanguage = String(params.get("language") || "").trim().toLowerCase();
        const language = /^[a-z]{2,3}$/.test(rawLanguage) ? rawLanguage : "";
        const rawSort = String(params.get("sort") || "").trim().toLowerCase();
        const sort = COLLECTION_DETAIL_SORT_MODES.has(rawSort) ? rawSort : "collection-order";
        const eye = canonicalEyeParams(params);
        const genres = normalizeIdList(params.get("genre") || "");
        const parts = [];
        if(genres.length){ parts.push("genre=" + genres.map(value=>encodeURIComponent(value)).join(",")); }
        if(language){ parts.push("language=" + encodeURIComponent(language)); }
        if(year){ parts.push("year=" + encodeURIComponent(year)); }
        else if(decade){ parts.push("decade=" + encodeURIComponent(decade)); }
        eye.parts.forEach(part=>parts.push(part));
        if(sort !== "collection-order"){ parts.push("sort=" + encodeURIComponent(sort)); }
        return {
            state:Object.assign({media:"movie",genres,language,year,decade,sort},eye.eye),
            search:parts.length ? "?" + parts.join("&") : ""
        };
    }

    function buildParsedRoute(type,path,search="",params={}){
        const canonicalRoute = path + search;
        return {
            valid:true,
            type,
            path,
            search,
            canonicalRoute,
            params
        };
    }

    function registerRouteHandler(handler){
        if(!handler || typeof handler.parseRoute !== "function" || typeof handler.applyRoute !== "function"){
            return false;
        }
        registeredRouteHandlers.push(handler);
        return true;
    }

    function drainRouteHandlerQueue(){
        const queue = typeof window !== "undefined" ? window.TVTrackerRouteHandlerQueue : null;
        if(!Array.isArray(queue)){ return; }
        while(queue.length){
            registerRouteHandler(queue.shift());
        }
    }

    function parseAppRoute(pathname,search=""){
        const rawPath = String(pathname || "").trim() || "/app/list/watching";
        if(rawPath !== "/app" && !rawPath.startsWith("/app/")){
            return {valid:false,type:"not-found",path:rawPath,search:"",canonicalRoute:rawPath,params:{}};
        }

        for(const handler of registeredRouteHandlers){
            const claimed = handler.parseRoute(rawPath,search);
            if(claimed && claimed.valid){
                claimed.handler = handler;
                return claimed;
            }
        }

        const path = rawPath.length > 4 ? rawPath.replace(/\/+$/g,"") : rawPath;

        if(path === "/app"){
            return buildParsedRoute("list","/app/list/watching","",{listSlug:"watching",filter:"watching"});
        }

        const listMatch = path.match(/^\/app\/list\/(watching|paused|completed|plan-to-watch|dropped)$/);
        if(listMatch){
            const listSearch = canonicalListSearch(search);
            return buildParsedRoute("list",path,listSearch.search,{
                listSlug:listMatch[1],
                filter:LIST_ROUTE_TO_FILTER[listMatch[1]] || "watching",
                query:listSearch.query,
                genre:listSearch.genre,
                network:listSearch.network,
                year:listSearch.year,
                sort:listSearch.sort
            });
        }

        if(path === "/app/search"){
            const searchState = canonicalSearchRoute(search);
            return buildParsedRoute("search",path,searchState.search,{query:searchState.query,media:searchState.media,eyeState:searchState.eyeState});
        }

        if(path === "/app/upcoming"){
            return buildParsedRoute("upcoming",path,"",{});
        }
        if(path === "/app/history"){
            return buildParsedRoute("history",path,"",{});
        }
        if(path === "/app/discover"){
            return buildParsedRoute("discover",path,"",{});
        }
        if(path === "/app/collections"){
            const collectionFilters = canonicalCollectionsSearch(search);
            return buildParsedRoute("collections",path,collectionFilters.search,{filters:collectionFilters.state});
        }
        const browseMatch = path.match(/^\/app\/browse\/(tv|movie)$/);
        if(browseMatch){
            const browse = canonicalBrowseSearch(search,browseMatch[1]);
            return buildParsedRoute("browse",path,browse.search,{media:browseMatch[1],browseState:browse.state});
        }
        if(path === "/app/profile"){
            return buildParsedRoute("profile",path,"",{});
        }
        if(path === "/app/settings"){
            return buildParsedRoute("settings","/app/settings/profile","",{section:"profile"});
        }
        const settingsMatch = path.match(/^\/app\/settings\/(profile|auth|notifications|streaming|data|danger-zone)$/);
        if(settingsMatch && SETTINGS_SECTIONS.has(settingsMatch[1])){
            return buildParsedRoute("settings",path,"",{section:settingsMatch[1]});
        }
        if(path === "/app/notifications"){
            return buildParsedRoute("notifications",path,"",{});
        }
        if(path === "/app/notifications/settings"){
            return buildParsedRoute("settings","/app/settings/notifications","",{section:"notifications",legacy:true});
        }

        const discoverCategoryMatch = path.match(/^\/app\/discover\/(?:(tv)\/(popular|top-rated|airing-today|on-the-air)|(movie)\/(popular|top-rated|now-playing|upcoming))$/);
        if(discoverCategoryMatch){
            const media = discoverCategoryMatch[1] || discoverCategoryMatch[3];
            const category = discoverCategoryMatch[2] || discoverCategoryMatch[4];
            const browse = canonicalBrowseSearch(search,media);
            if(category === "popular" || category === "top-rated"){
                browse.state.sort = "popularity-desc";
                const api = typeof window !== "undefined" ? window.TVTrackerBrowse : null;
                browse.search = api && typeof api.serializeSearch === "function" ? api.serializeSearch(browse.state) : browse.search;
            }
            return buildParsedRoute("discover-category",path,browse.search,{media,category,value:media + "/" + category,browseState:browse.state});
        }

        const episodeMatch = path.match(/^\/app\/show\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)\/season\/(\d{1,5})\/episode\/([1-9][0-9]{0,5})$/);
        if(episodeMatch){
            const show = parseRouteIdSlug(episodeMatch[1]);
            return buildParsedRoute("episode",path,"",{
                showId:show.id,
                showSlug:show.slug,
                season:Number(episodeMatch[2]),
                episode:Number(episodeMatch[3])
            });
        }

        const movieMatch = path.match(/^\/app\/movie\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(movieMatch){
            const movie = parseRouteIdSlug(movieMatch[1]);
            return buildParsedRoute("movie",path,"",{id:movie.id,slug:movie.slug});
        }

        const collectionMatch = path.match(/^\/app\/collection\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(collectionMatch){
            const collection = parseRouteIdSlug(collectionMatch[1]);
            const filters = canonicalCollectionDetailSearch(search);
            return buildParsedRoute("collection",path,filters.search,{id:collection.id,slug:collection.slug,filters:filters.state});
        }

        const personMatch = path.match(/^\/app\/person\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(personMatch){
            const person = parseRouteIdSlug(personMatch[1]);
            const personSearchParams = readSearchParams(search);
            const media = String(personSearchParams.get("media") || "").trim().toLowerCase() === "movie" ? "movie" : "tv";
            const rawRole = String(personSearchParams.get("role") || "").trim().toLowerCase();
            const role = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawRole) ? rawRole : "";
            const personEye = canonicalEyeParams(personSearchParams);
            const personParts = [];
            if(media === "movie"){ personParts.push("media=movie"); }
            if(role){ personParts.push("role=" + encodeURIComponent(role)); }
            personEye.parts.forEach(part=>personParts.push(part));
            const personSearch = personParts.length ? "?" + personParts.join("&") : "";
            return buildParsedRoute("person",path,personSearch,{id:person.id,slug:person.slug,role,media,eyeState:personEye.eye});
        }

        const networkMatch = path.match(/^\/app\/network\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(networkMatch){
            const parsed = parseRouteIdSlug(networkMatch[1]);
            const browse = canonicalBrowseSearch(search,"tv");
            return buildParsedRoute("discovery-detail",path,browse.search,{
                discoveryType:"network",
                value:parsed.id,
                slug:parsed.slug,
                media:"tv",
                browseState:browse.state
            });
        }

        const typedDiscoveryIdMatch = path.match(/^\/app\/(theme|company|provider)\/(tv|movie)\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(typedDiscoveryIdMatch){
            const parsed = parseRouteIdSlug(typedDiscoveryIdMatch[3]);
            const media = typedDiscoveryIdMatch[2];
            const browse = canonicalBrowseSearch(search,media);
            return buildParsedRoute("discovery-detail",path,browse.search,{
                discoveryType:typedDiscoveryIdMatch[1],
                value:parsed.id,
                slug:parsed.slug,
                media,
                browseState:browse.state
            });
        }

        const languageMatch = path.match(/^\/app\/language\/(tv|movie)\/([a-z]{2,3}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(languageMatch){
            const parsed = parseRouteCodeSlug(languageMatch[2],/^([a-z]{2,3})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
            const media = languageMatch[1];
            const browse = canonicalBrowseSearch(search,media);
            return buildParsedRoute("discovery-detail",path,browse.search,{discoveryType:"language",value:parsed.value,slug:parsed.slug,media,browseState:browse.state});
        }

        const countryMatch = path.match(/^\/app\/country\/(tv|movie)\/([a-z]{2}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(countryMatch){
            const parsed = parseRouteCodeSlug(countryMatch[2],/^([a-z]{2})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
            const media = countryMatch[1];
            const browse = canonicalBrowseSearch(search,media);
            return buildParsedRoute("discovery-detail",path,browse.search,{discoveryType:"country",value:parsed.value,slug:parsed.slug,media,browseState:browse.state});
        }

        const yearMatch = path.match(/^\/app\/year\/(tv|movie)\/((?:18|19|20|21)[0-9]{2})$/);
        if(yearMatch){
            const media = yearMatch[1];
            const browse = canonicalBrowseSearch(search,media);
            return buildParsedRoute("discovery-detail",path,browse.search,{discoveryType:"year",value:yearMatch[2],slug:"",media,browseState:browse.state});
        }

        const statusMatch = path.match(/^\/app\/status\/(returning-series|ended|canceled|in-production)$/);
        if(statusMatch){
            const browse = canonicalBrowseSearch(search,"tv");
            return buildParsedRoute("discovery-detail",path,browse.search,{discoveryType:"status",value:statusMatch[1],slug:"",media:"tv",browseState:browse.state});
        }

        const certificationMatch = path.match(/^\/app\/certification\/movie\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
        if(certificationMatch){
            const media = "movie";
            const browse = canonicalBrowseSearch(search,media);
            return buildParsedRoute("discovery-detail",path,browse.search,{
                discoveryType:"certification",
                value:"movie/" + certificationMatch[1],
                slug:"",
                media,
                browseState:browse.state
            });
        }

        const genreMatch = path.match(/^\/app\/genre\/(tv|movie)\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(genreMatch){
            const media = genreMatch[1];
            const genre = parseRouteIdSlug(genreMatch[2]);
            const browse = canonicalBrowseSearch(search,media);
            return buildParsedRoute("genre",path,browse.search,{media,id:genre.id,slug:genre.slug,key:genreMatch[2],browseState:browse.state});
        }

        const showMatch = path.match(/^\/app\/show\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)$/);
        if(showMatch){
            const show = parseRouteIdSlug(showMatch[1]);
            return buildParsedRoute("show",path,"",{id:show.id,slug:show.slug});
        }

        return {valid:false,type:"not-found",path,search:"",canonicalRoute:path,params:{}};
    }

    function getParsedCurrentRoute(){
        return parseAppRoute(
            typeof window !== "undefined" && window.location ? window.location.pathname : "/app/list/watching",
            typeof window !== "undefined" && window.location ? window.location.search : ""
        );
    }

    function currentSearchQuery(){
        const parsed = getParsedCurrentRoute();
        return parsed.valid && parsed.params ? String(parsed.params.query || "") : "";
    }

    function currentSearchMediaType(){
        const parsed = getParsedCurrentRoute();
        return parsed.valid && parsed.params && ["tv","movie","person"].includes(parsed.params.media) ? parsed.params.media : "tv";
    }

    function showRouteNotFound(){
        if(typeof renderAppRouteNotFoundPage === "function"){
            renderAppRouteNotFoundPage();
            return;
        }
        setPathRoute("/app/list/watching",true);
    }

    function routePrefix(){
        return "/app";
    }

    function currentRoute(){
        const parsed = getParsedCurrentRoute();
        if(parsed.valid){
            return parsed.canonicalRoute;
        }
        const path = String(window.location.pathname || "");
        return path.startsWith("/app") ? path + String(window.location.search || "") : "/app/list/watching";
    }

    function routeForState(){
        if(activePage === "browse-detail" && typeof browsePageState !== "undefined" && browsePageState){
            if(typeof getBrowseRoute === "function"){
                return getBrowseRoute(browsePageState.filters || {media:browsePageState.media || "tv"});
            }
            return "/app/browse/" + (browsePageState.media === "movie" ? "movie" : "tv");
        }
        if(activePage === "episode-detail" && selectedEpisodeContext){
            if(typeof getEpisodeDetailRoute === "function"){
                const showId = String(selectedEpisodeContext.showId || "");
                const showInfo = typeof getKnownShowRouteLabel === "function" ? getKnownShowRouteLabel(showId) : "";
                return getEpisodeDetailRoute(showId,selectedEpisodeContext.season,selectedEpisodeContext.episode,showInfo);
            }
            return "/app/list/watching";
        }
        if(activePage === "movie-detail" && typeof selectedMovieId !== "undefined" && selectedMovieId){
            if(typeof getMovieDetailRoute === "function"){
                const movieName = typeof moviePageState !== "undefined" && moviePageState && moviePageState.movie ? moviePageState.movie.title : "";
                return getMovieDetailRoute(selectedMovieId,movieName);
            }
            return "/app/list/watching";
        }
        if(activePage === "collection-detail" && typeof selectedCollectionId !== "undefined" && selectedCollectionId){
            const collectionName = typeof collectionDetailPageState !== "undefined" && collectionDetailPageState && collectionDetailPageState.collection ? collectionDetailPageState.collection.name : "";
            if(typeof getCollectionDetailRouteWithFilters === "function"){
                return getCollectionDetailRouteWithFilters(selectedCollectionId,collectionName,collectionDetailPageState && collectionDetailPageState.filters || {});
            }
            if(typeof getCollectionDetailRoute === "function"){
                return getCollectionDetailRoute(selectedCollectionId,collectionName);
            }
            return "/app/collections";
        }
        if(activePage === "collections-index"){
            return typeof getCollectionsRoute === "function" ? getCollectionsRoute(collectionsPageState || {}) : "/app/collections";
        }
        if(activePage === "person-detail" && typeof selectedPersonContext !== "undefined" && selectedPersonContext && selectedPersonContext.personId){
            if(typeof getPersonDetailRoute === "function"){
                const personName = typeof personPageState !== "undefined" && personPageState && personPageState.person ? personPageState.person.name : (typeof personPageState !== "undefined" && personPageState ? personPageState.routeSlug : "");
                const personMedia = typeof personPageState !== "undefined" && personPageState ? personPageState.media : "tv";
                const personRole = typeof personPageState !== "undefined" && personPageState ? personPageState.role : "";
                return getPersonDetailRoute(personRole,selectedPersonContext.personId,personName,personMedia);
            }
            return "/app/list/watching";
        }
        if(activePage === "discovery-detail" && typeof discoveryPageState !== "undefined" && discoveryPageState && discoveryPageState.type === "trending" && discoveryPageState.value){
            const api = typeof window !== "undefined" ? window.TVTrackerTrending : null;
            if(api && typeof api.routeFor === "function"){
                return api.routeFor(discoveryPageState.value);
            }
            return "/app/discover";
        }
        if(activePage === "discovery-detail" && typeof selectedDiscoveryContext !== "undefined" && selectedDiscoveryContext && selectedDiscoveryContext.type && selectedDiscoveryContext.value){
            if(typeof getDiscoveryFilterDetailRoute === "function"){
                const routeName = typeof discoveryPageState !== "undefined" && discoveryPageState ? (discoveryPageState.routeSlug || discoveryPageState.name) : "";
                const routeMedia = typeof discoveryPageState !== "undefined" && discoveryPageState ? discoveryPageState.media : "tv";
                const baseRoute = getDiscoveryFilterDetailRoute(selectedDiscoveryContext.type,selectedDiscoveryContext.value,routeName,routeMedia);
                const api = typeof window !== "undefined" ? window.TVTrackerBrowse : null;
                const browseSearch = api && typeof api.serializeSearch === "function" && typeof discoveryPageState !== "undefined" && discoveryPageState
                ? api.serializeSearch(discoveryPageState.browse || {media:routeMedia})
                : "";
                return baseRoute + browseSearch;
            }
            return "/app/list/watching";
        }
        if(activePage === "genre-detail" && typeof selectedGenreSlug !== "undefined" && selectedGenreSlug){
            const genreMedia = typeof selectedGenreMedia !== "undefined" && selectedGenreMedia === "movie" ? "movie" : "tv";
            const baseRoute = typeof getGenreDetailRoute === "function" && typeof genrePageState !== "undefined" && genrePageState && genrePageState.genreId
            ? getGenreDetailRoute(genrePageState.genreId,genrePageState.name || genrePageState.slug || "",genreMedia)
            : "/app/list/watching";
            const api = typeof window !== "undefined" ? window.TVTrackerBrowse : null;
            const browseSearch = api && typeof api.serializeSearch === "function" && typeof genrePageState !== "undefined" && genrePageState
            ? api.serializeSearch(genrePageState.browse || {media:genreMedia})
            : "";
            return baseRoute + browseSearch;
        }
        if(activePage === "show-detail" && selectedShowId){
            if(typeof getShowDetailRoute === "function"){
                return getShowDetailRoute(selectedShowId);
            }
            return "/app/list/watching";
        }
        if(activePage === "search"){
            const query = typeof searchRouteState !== "undefined" && searchRouteState ? searchRouteState.query : "";
            const media = typeof searchRouteState !== "undefined" && searchRouteState ? searchRouteState.media : "tv";
            return typeof getSearchRoute === "function" ? getSearchRoute(query,media,searchRouteState || {}) : "/app/search";
        }
        if(activePage === "discover"){
            return "/app/discover";
        }
        if(activePage === "profile"){
            return "/app/profile";
        }
        if(activePage === "settings"){
            return "/app/settings";
        }
        if(activePage === "notifications"){
            return "/app/notifications";
        }
        if(activePage === "notification-settings"){
            return "/app/notifications/settings";
        }
        if(activePage === "shows"){
            if(activeShowsTab === "upcoming"){
                return "/app/upcoming";
            }
            if(activeShowsTab === "history"){
                return "/app/history";
            }
            return getListRoute(activeFilter,typeof librarySearchQuery !== "undefined" ? librarySearchQuery : "");
        }
        return "/app/list/watching";
    }

    function setPathRoute(route,replace=false){
        const nextRoute = String(route || "/app/list/watching");
        const current = String(window.location.pathname || "") + String(window.location.search || "");
        if(current === nextRoute && !window.location.hash){
            return;
        }
        if(replace){
            history.replaceState({tvTrackerRoute:true},"",nextRoute);
        }else{
            history.pushState({tvTrackerRoute:true},"",nextRoute);
        }
    }

    function normalizeCurrentRoute(parsed){
        if(!parsed || !parsed.valid){
            return;
        }
        const current = String(window.location.pathname || "") + String(window.location.search || "");
        if(current !== parsed.canonicalRoute || window.location.hash){
            setPathRoute(parsed.canonicalRoute,true);
        }
    }

    function updateRouteFromState(replace=false){
        if(applyingRoute){
            return;
        }
        setPathRoute(routeForState(),replace);
    }

    function getListRoute(filter,query=""){
        const routeSlug = FILTER_TO_LIST_ROUTE[String(filter || "watching")] || "watching";
        const cleanQuery = String(query || "").trim();
        const genre = String(typeof libraryGenreFilter !== "undefined" ? libraryGenreFilter : "all").trim();
        const network = String(typeof libraryNetworkFilter !== "undefined" ? libraryNetworkFilter : "all").trim();
        const year = String(typeof libraryYearFilter !== "undefined" ? libraryYearFilter : "all").trim();
        const sort = String(typeof librarySortMode !== "undefined" ? librarySortMode : "default").trim();
        const parts = [];

        if(cleanQuery){
            parts.push("q=" + encodeURIComponent(cleanQuery));
        }
        if(genre && genre !== "all"){
            parts.push("genre=" + encodeURIComponent(genre));
        }
        if(network && network !== "all"){
            parts.push("network=" + encodeURIComponent(network));
        }
        if(/^\d{4}$/.test(year)){
            parts.push("year=" + encodeURIComponent(year));
        }
        if(LIBRARY_SORT_MODES.has(sort) && sort !== "default"){
            parts.push("sort=" + encodeURIComponent(sort));
        }

        return "/app/list/" + routeSlug + (parts.length ? "?" + parts.join("&") : "");
    }

    function setActiveFilterButtons(){
        document.querySelectorAll(".filters [data-filter]").forEach(button=>{
            button.classList.toggle("active",button.dataset.filter === activeFilter);
        });
    }

    function setPageActiveWithoutRender(pageId,navContext=""){
        if(typeof document === "undefined" || !document || typeof document.querySelectorAll !== "function"){
            return;
        }
        document.querySelectorAll(".page").forEach(section=>section.classList.remove("active-page"));
        const page = typeof document.getElementById === "function" ? document.getElementById(pageId) : null;
        if(page){
            page.classList.add("active-page");
        }
        if(navContext && typeof activatePrimaryNavContext === "function"){
            activatePrimaryNavContext(navContext);
        }else if(navContext && typeof setAppPrimaryNavActive === "function"){
            setAppPrimaryNavActive(navContext);
        }
    }

    function configureInitialListSkeleton(filter){
        if(typeof document === "undefined" || !document || typeof document.querySelectorAll !== "function"){
            return;
        }
        const hideAction = String(filter || "watching") === "finished";
        document.querySelectorAll(".watchlist-initial-skeleton .watchlist-skeleton-action").forEach(action=>{
            action.style.display = hideAction ? "none" : "";
        });
    }

    function setInitialShowsTab(tab){
        activePage = "shows";
        activeShowsTab = SHOW_TABS.has(tab) ? tab : "watchlist";
        setPageActiveWithoutRender("shows-page","shows");
        if(typeof document !== "undefined" && document && typeof document.querySelectorAll === "function"){
            document.querySelectorAll(".top-tabs [data-tab]").forEach(button=>{
                const isActive = button.dataset.tab === activeShowsTab;
                button.classList.toggle("active",isActive);
                if(isActive){
                    button.setAttribute("aria-current","page");
                }else{
                    button.removeAttribute("aria-current");
                }
            });
        }
        const filters = typeof document !== "undefined" && document && typeof document.querySelector === "function" ? document.querySelector(".filters") : null;
        if(filters){
            filters.style.display = activeShowsTab === "watchlist" ? "flex" : "none";
        }
        if(activeShowsTab !== "watchlist" && typeof document !== "undefined" && document && typeof document.getElementById === "function"){
            const list = document.getElementById("show-list");
            if(list){
                if(activeShowsTab === "history" && typeof renderHistorySkeletonHTML === "function"){
                    list.innerHTML = renderHistorySkeletonHTML();
                }else if(activeShowsTab !== "upcoming"){
                    list.innerHTML = "";
                }
            }
        }
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
    }

    function primeDiscoveryGridRoute(parsed){
        const params = parsed.params || {};
        if(parsed.type === "genre"){
            selectedGenreSlug = params.key || (params.id + (params.slug ? "-" + params.slug : ""));
            selectedGenreMedia = params.media;
            genrePageState = Object.assign({},genrePageState,{
                media:params.media,
                slug:params.slug,
                routeKey:params.key || "",
                name:"",
                genreId:params.id,
                year:params.browseState && params.browseState.year || "",
                sort:params.browseState && params.browseState.sort === "rating-desc" ? "vote_average.desc" : (params.browseState && params.browseState.sort === "date-desc" ? "first_air_date.desc" : "popularity.desc"),
                browse:params.browseState || null,
                browseLabels:null,
                page:1,
                totalPages:1,
                loading:true,
                error:"",
                shows:[]
            });
            if(typeof showGenreDetailPageShell === "function"){
                showGenreDetailPageShell("discover");
            }else{
                activePage = "genre-detail";
                setPageActiveWithoutRender("genre-detail-page","discover");
            }
            if(typeof renderActiveGenrePage === "function"){
                renderActiveGenrePage();
            }
            return;
        }

        const type = parsed.type === "discover-category" ? "discover-category" : params.discoveryType;
        const value = parsed.type === "discover-category" ? params.value : params.value;
        selectedDiscoveryContext = {type,value};
        discoveryPageState = Object.assign({},discoveryPageState,{
            type,
            value,
            name:"",
            routeSlug:params.slug || "",
            media:params.media || "tv",
            year:params.browseState && params.browseState.year || "",
            sort:params.browseState && params.browseState.sort === "rating-desc" ? "vote_average.desc" : (params.browseState && params.browseState.sort === "date-desc" ? "first_air_date.desc" : "popularity.desc"),
            browse:params.browseState || null,
            browseLabels:null,
            page:1,
            totalPages:1,
            loading:true,
            error:"",
            shows:[]
        });
        if(typeof showDiscoveryFilterPageShell === "function"){
            showDiscoveryFilterPageShell("discover");
        }else{
            activePage = "discovery-detail";
            setPageActiveWithoutRender("genre-detail-page","discover");
        }
        if(typeof renderActiveDiscoveryFilterPage === "function"){
            renderActiveDiscoveryFilterPage();
        }
    }

    function prepareInitialRoute(){
        if(initialRoutePrepared){
            return;
        }
        initialRoutePrepared = true;

        const parsed = getParsedCurrentRoute();
        if(!parsed.valid){
            showRouteNotFound();
            return;
        }

        normalizeCurrentRoute(parsed);
        if(parsed.handler){
            if(typeof parsed.handler.prepareInitialRoute === "function"){
                parsed.handler.prepareInitialRoute(parsed);
            }else{
                parsed.handler.applyRoute(parsed,{source:"initial"});
            }
            return;
        }
        const params = parsed.params || {};

        if(parsed.type === "list"){
            activeFilter = params.filter || "watching";
            if(typeof librarySearchQuery !== "undefined"){
                librarySearchQuery = params.query || "";
            }
            if(typeof libraryGenreFilter !== "undefined"){
                libraryGenreFilter = params.genre || "all";
            }
            if(typeof libraryNetworkFilter !== "undefined"){
                libraryNetworkFilter = params.network || "all";
            }
            if(typeof libraryYearFilter !== "undefined"){
                libraryYearFilter = params.year || "all";
            }
            if(typeof librarySortMode !== "undefined"){
                librarySortMode = params.sort || "default";
            }
            configureInitialListSkeleton(activeFilter);
            setInitialShowsTab("watchlist");
            setActiveFilterButtons();
            return;
        }
        if(parsed.type === "upcoming" || parsed.type === "history"){
            setInitialShowsTab(parsed.type);
            return;
        }
        if(parsed.type === "notifications"){
            activePage = "notifications";
            setPageActiveWithoutRender("notifications-page","shows");
            if(typeof updateShellTitle === "function"){ updateShellTitle(); }
            return;
        }
        if(parsed.type === "profile"){
            activePage = "profile";
            setPageActiveWithoutRender("profile-page","profile");
            if(typeof updateShellTitle === "function"){ updateShellTitle(); }
            return;
        }
        if(parsed.type === "settings"){
            activePage = "settings";
            setPageActiveWithoutRender("settings-page","settings");
            if(globalThis.TVTrackerSettings && typeof globalThis.TVTrackerSettings.open === "function"){
                globalThis.TVTrackerSettings.open(params.section || "profile",{fromRoute:true,skipShowPage:true});
            }
            if(typeof updateShellTitle === "function"){ updateShellTitle(); }
            return;
        }
        if(parsed.type === "show"){
            selectedShowId = params.id;
            if(typeof showShowDetailPageShell === "function"){
                showShowDetailPageShell("shows");
            }
            if(typeof renderShowDetailLoading === "function"){
                renderShowDetailLoading(params.id);
            }
            return;
        }
        if(parsed.type === "movie"){
            selectedMovieId = params.id;
            moviePageState = Object.assign({},moviePageState,{movieId:params.id,routeSlug:params.slug,loading:true,error:"",movie:null});
            if(typeof showMovieDetailPageShell === "function"){
                showMovieDetailPageShell("shows");
            }
            if(typeof renderMovieDetailLoading === "function"){
                renderMovieDetailLoading();
            }
            return;
        }
        if(parsed.type === "collection"){
            selectedCollectionId = params.id;
            collectionDetailPageState = Object.assign({},collectionDetailPageState,{collectionId:params.id,routeSlug:params.slug,loading:true,error:"",collection:null,movies:[],filters:params.filters || {}});
            if(typeof showCollectionDetailPageShell === "function"){
                showCollectionDetailPageShell("discover");
            }
            if(typeof renderActiveCollectionDetailPage === "function"){
                renderActiveCollectionDetailPage();
            }
            return;
        }
        if(parsed.type === "episode"){
            selectedShowId = params.showId;
            selectedEpisodeContext = {showId:params.showId,season:params.season,episode:params.episode,backToShow:true,discoverPreview:false};
            if(typeof showEpisodeDetailPageShell === "function"){
                showEpisodeDetailPageShell("shows");
            }
            if(typeof renderEpisodeDetailLoading === "function"){
                renderEpisodeDetailLoading(params.showId,params.season,params.episode);
            }
            return;
        }
        if(parsed.type === "person"){
            selectedPersonContext = {role:params.role || "",personId:params.id};
            personPageState = Object.assign({},personPageState,{role:params.role || "",personId:params.id,routeSlug:params.slug,media:params.media || "tv",loading:true,error:"",person:null,credits:[]});
            if(typeof showPersonDetailPageShell === "function"){
                showPersonDetailPageShell("discover");
            }
            if(typeof renderActivePersonPage === "function"){
                renderActivePersonPage();
            }
            return;
        }
        if(parsed.type === "browse"){
            activePage = "browse-detail";
            browsePageState = Object.assign({},browsePageState,{
                media:params.media || "tv",
                filters:params.browseState || {media:params.media || "tv"},
                labels:null,
                page:1,
                totalPages:1,
                loading:true,
                error:"",
                shows:[]
            });
            if(typeof showBrowsePageShell === "function"){
                showBrowsePageShell("discover");
            }else{
                setPageActiveWithoutRender("genre-detail-page","discover");
            }
            if(typeof renderActiveBrowsePage === "function"){
                renderActiveBrowsePage();
            }
            return;
        }
        if(parsed.type === "genre" || parsed.type === "discovery-detail" || parsed.type === "discover-category"){
            primeDiscoveryGridRoute(parsed);
            return;
        }
        if(parsed.type === "discover" || parsed.type === "search"){
            activePage = parsed.type === "search" ? "search" : "discover";
            if(parsed.type === "search"){
                searchRouteState.query = params.query || "";
                searchRouteState.media = params.media || "tv";
                if(typeof applyEyeFilterState === "function"){ applyEyeFilterState(searchRouteState,params.eyeState || {}); }
                if(typeof discoverSearchState !== "undefined"){
                    discoverSearchState = Object.assign({},discoverSearchState,{query:params.query || "",media:params.media || "tv",loading:true},params.eyeState || {});
                }
            }else if(typeof discoverHubState !== "undefined"){
                discoverHubState = Object.assign({},discoverHubState,{error:""});
            }
            if(typeof showSearchPageShell === "function"){
                showSearchPageShell();
                if(parsed.type === "discover"){
                    activePage = "discover";
                }
            }else{
                setPageActiveWithoutRender("discover-page","discover");
            }
            const input = typeof document !== "undefined" && document && typeof document.getElementById === "function" ? document.getElementById("search") : null;
            if(input){
                input.value = params.query || "";
                input.setAttribute("placeholder","Search shows, movies, people");
            }
            if(parsed.type === "search" && typeof renderSearchLoading === "function"){
                renderSearchLoading(params.query || "");
            }else if(parsed.type === "discover" && typeof renderDiscoverHub === "function"){
                const discoverWasLoading = typeof discoverHubState !== "undefined" && discoverHubState.loading === true;
                if(typeof discoverHubState !== "undefined"){
                    discoverHubState = Object.assign({},discoverHubState,{loading:true,error:""});
                }
                renderDiscoverHub();
                if(typeof discoverHubState !== "undefined" && !discoverWasLoading){
                    discoverHubState = Object.assign({},discoverHubState,{loading:false});
                }
            }
            if(typeof updateShellTitle === "function"){
                updateShellTitle();
            }
        }
        if(parsed.type === "collections"){
            activePage = "collections-index";
            if(typeof collectionsPageState !== "undefined"){
                collectionsPageState = Object.assign({},collectionsPageState,params.filters || {});
            }
            if(typeof showCollectionsPageShell === "function"){
                showCollectionsPageShell("discover");
            }
            if(typeof renderActiveCollectionsPage === "function"){
                renderActiveCollectionsPage();
            }
            if(typeof updateShellTitle === "function"){
                updateShellTitle();
            }
        }
    }

    function activateListRoute(listSlug,options={}){
        const cleanSlug = String(listSlug || "watching").trim().toLowerCase();
        const nextFilter = LIST_ROUTE_TO_FILTER[cleanSlug] || "watching";
        clearDetailState();
        activeShowsTab = "watchlist";
        activeFilter = nextFilter;
        const routeState = options && options.routeState ? options.routeState : null;
        if(typeof librarySearchQuery !== "undefined"){
            librarySearchQuery = routeState ? (routeState.query || "") : currentSearchQuery();
        }
        if(routeState && typeof libraryGenreFilter !== "undefined"){
            libraryGenreFilter = routeState.genre || "all";
        }
        if(routeState && typeof libraryNetworkFilter !== "undefined"){
            libraryNetworkFilter = routeState.network || "all";
        }
        if(routeState && typeof libraryYearFilter !== "undefined"){
            libraryYearFilter = routeState.year || "all";
        }
        if(routeState && typeof librarySortMode !== "undefined"){
            librarySortMode = routeState.sort || "default";
        }
        document.querySelectorAll(".top-tabs [data-tab]").forEach(button=>{
            button.classList.toggle("active",button.dataset.tab === "watchlist");
        });
        setActiveFilterButtons();
        showPage("shows");
        if(options && options.replaceRoute){
            setPathRoute(getListRoute(activeFilter,typeof librarySearchQuery !== "undefined" ? librarySearchQuery : ""),true);
        }
    }

    function activateShowsTab(tab){
        if(!SHOW_TABS.has(tab)){
            tab = "watchlist";
        }
        activeShowsTab = tab;
        document.querySelectorAll(".top-tabs [data-tab]").forEach(button=>{
            button.classList.toggle("active",button.dataset.tab === tab);
        });
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
        if(typeof renderShowsPage === "function"){
            renderShowsPage();
        }
    }

    function clearDetailState(){
        if(typeof closeShowModal === "function"){
            closeShowModal();
        }
        showDetailPreview = null;
        discoverPreviewShow = null;
        selectedShowId = null;
        selectedEpisodeContext = null;
        if(typeof selectedMovieId !== "undefined"){
            selectedMovieId = null;
        }
        if(typeof selectedCollectionId !== "undefined"){
            selectedCollectionId = null;
        }
        if(typeof selectedGenreSlug !== "undefined"){
            selectedGenreSlug = null;
        }
        if(typeof selectedGenreMedia !== "undefined"){
            selectedGenreMedia = "tv";
        }
        if(typeof selectedPersonContext !== "undefined"){
            selectedPersonContext = null;
        }
        if(typeof selectedDiscoveryContext !== "undefined"){
            selectedDiscoveryContext = null;
        }
    }

    function applyParsedRoute(parsed,source="direct"){
        if(parsed.handler && typeof parsed.handler.applyRoute === "function"){
            if(parsed.handler.applyRoute(parsed,{source}) !== false){
                return;
            }
        }
        const params = parsed.params || {};

        if(parsed.type === "list"){
            activateListRoute(params.listSlug,{routeState:params});
            return;
        }
        if(parsed.type === "search"){
            clearDetailState();
            if(typeof openSearchPage === "function"){
                openSearchPage(params.query || "",{fromRoute:true,media:params.media || "tv",eyeState:params.eyeState || {}});
            }else{
                showPage("discover");
            }
            return;
        }
        if(parsed.type === "browse"){
            clearDetailState();
            if(typeof openBrowsePage === "function"){
                openBrowsePage(params.browseState || {media:params.media || "tv"},{fromRoute:true,media:params.media || "tv"});
            }else{
                showPage("discover");
            }
            return;
        }
        if(parsed.type === "discover-category"){
            clearDetailState();
            if(typeof openDiscoverCategoryPage === "function"){
                openDiscoverCategoryPage(params.media,params.category,{fromRoute:true,browseState:params.browseState});
            }else if(typeof openDiscoveryFilterPage === "function"){
                openDiscoveryFilterPage("discover-category",params.value,{fromRoute:true,media:params.media,browseState:params.browseState});
            }else{
                showPage("discover");
            }
            return;
        }
        if(parsed.type === "episode"){
            if(typeof openEpisodeModal === "function"){
                openEpisodeModal(params.showId,params.season,params.episode,{fromRoute:true,backToShow:true,routeSlug:params.showSlug || ""});
            }
            return;
        }
        if(parsed.type === "movie"){
            if(typeof openMoviePage === "function"){
                openMoviePage(params.id,{fromRoute:true,routeSlug:params.slug});
            }
            return;
        }
        if(parsed.type === "collection"){
            if(typeof openCollectionDetailPage === "function"){
                openCollectionDetailPage(params.id,{fromRoute:true,routeSlug:params.slug,filters:params.filters || {}});
            }
            return;
        }
        if(parsed.type === "collections"){
            clearDetailState();
            if(typeof openCollectionsPage === "function"){
                openCollectionsPage({fromRoute:true,filters:params.filters || {}});
            }else{
                showPage("discover");
            }
            return;
        }
        if(parsed.type === "person"){
            if(typeof openPersonPage === "function"){
                openPersonPage(params.role || "",params.id,{fromRoute:true,routeSlug:params.slug,media:params.media || "tv",eyeState:params.eyeState || {}});
            }
            return;
        }
        if(parsed.type === "discovery-detail"){
            if(typeof openDiscoveryFilterPage === "function"){
                openDiscoveryFilterPage(params.discoveryType,params.value,{fromRoute:true,routeSlug:params.slug || "",media:params.media || "tv",browseState:params.browseState});
            }
            return;
        }
        if(parsed.type === "genre"){
            if(typeof openGenrePage === "function"){
                openGenrePage(params.key || params.id,{fromRoute:true,media:params.media,browseState:params.browseState,routeSlug:params.slug});
            }
            return;
        }
        if(parsed.type === "show"){
            if(typeof openShowDetailsPage === "function"){
                openShowDetailsPage(params.id,{fromRoute:true,routeSlug:params.slug});
            }
            return;
        }
        if(parsed.type === "discover"){
            clearDetailState();
            if(typeof openDiscoverHomePage === "function"){
                openDiscoverHomePage({fromRoute:true});
            }else{
                showPage("discover");
            }
            return;
        }
        if(parsed.type === "notifications"){
            clearDetailState();
            if(
                window.TVTrackerNotifications &&
                typeof window.TVTrackerNotifications.openNotificationsPage === "function"
            ){
                window.TVTrackerNotifications.openNotificationsPage({fromRoute:true});
            }
            return;
        }
        if(parsed.type === "profile"){
            clearDetailState();
            showPage("profile");
            return;
        }
        if(parsed.type === "settings"){
            clearDetailState();
            if(window.TVTrackerSettings && typeof window.TVTrackerSettings.open === "function"){
                window.TVTrackerSettings.open(params.section || "profile",{fromRoute:true});
            }else{
                showPage("settings");
            }
            return;
        }
        if(parsed.type === "upcoming"){
            clearDetailState();
            showPage("shows");
            activateShowsTab("upcoming");
            return;
        }
        if(parsed.type === "history"){
            clearDetailState();
            showPage("shows");
            activateShowsTab("history");
        }
    }

    function applyRoute(source="direct"){
        const parsed = getParsedCurrentRoute();
        if(!parsed.valid){
            showRouteNotFound();
            return;
        }

        normalizeCurrentRoute(parsed);

        if(typeof appDataReady !== "undefined" && !appDataReady){
            initialRoutePrepared = false;
            prepareInitialRoute();
            return;
        }

        const fullRoute = parsed.canonicalRoute;
        if(
            Array.isArray(showDetailBackStack) &&
            showDetailBackStack.length &&
            showDetailBackStack[showDetailBackStack.length - 1] === fullRoute
        ){
            showDetailBackStack.pop();
        }

        applyingRoute = true;
        try{
            applyParsedRoute(parsed,source);
        }finally{
            applyingRoute = false;
        }
    }

    document.querySelectorAll(".app-primary-nav [data-page]").forEach(link=>{
        link.addEventListener("click",()=>{
            window.setTimeout(()=>updateRouteFromState(false),0);
        });
    });

    document.querySelectorAll(".top-tabs [data-tab]").forEach(link=>{
        link.addEventListener("click",()=>{
            window.setTimeout(()=>updateRouteFromState(false),0);
        });
    });

    document.querySelectorAll(".filters [data-filter]").forEach(link=>{
        link.addEventListener("click",()=>{
            window.setTimeout(()=>updateRouteFromState(false),0);
        });
    });

    function isPlainAppRouteClick(event,anchor){
        if(
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            !anchor ||
            anchor.target ||
            anchor.hasAttribute("download")
        ){
            return false;
        }
        const href = anchor.getAttribute("href") || "";
        if(!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")){
            return false;
        }
        try{
            const url = new URL(href,window.location.origin);
            return url.origin === window.location.origin && url.pathname.startsWith("/app");
        }catch(error){
            return false;
        }
    }

    function handleAppRouteAnchorClick(event){
        const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if(!isPlainAppRouteClick(event,anchor)){
            return;
        }
        const url = new URL(anchor.getAttribute("href"),window.location.origin);
        const parsed = parseAppRoute(url.pathname,url.search);
        event.preventDefault();
        if(!parsed.valid){
            setPathRoute(url.pathname + url.search,false);
            showRouteNotFound();
            return;
        }
        setPathRoute(parsed.canonicalRoute,false);
        applyRoute("click");
    }

    if(typeof document !== "undefined" && document && typeof document.addEventListener === "function"){
        document.addEventListener("click",handleAppRouteAnchorClick);
    }

    window.addEventListener("popstate",function(){ applyRoute("popstate"); });

    window.TVTrackerRouter = {
        applyRoute,
        currentRoute,
        parseRoute:parseAppRoute,
        prepareInitialRoute,
        updateRouteFromState,
        routePrefix,
        setPathRoute,
        registerRouteHandler
    };

    drainRouteHandlerQueue();
    prepareInitialRoute();
    if(typeof appDataReady === "undefined" || appDataReady){
        window.setTimeout(applyRoute,0);
    }
}());
