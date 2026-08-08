(function(){
    "use strict";

    const SHOW_TABS = new Set(["watchlist","upcoming","history"]);
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
    const SECTION_ROUTES = new Set([
        "/app/upcoming",
        "/app/history",
        "/app/discover",
        "/app/search",
        "/app/profile",
        "/app/settings"
    ]);
    let applyingRoute = false;

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

    function currentSearchQuery(){
        try{
            return new URLSearchParams(String(window.location.search || "")).get("q") || "";
        }catch(error){
            return "";
        }
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
        const path = String(window.location.pathname || "");
        const cleanPath = path.startsWith("/app") ? path : "/app/list/watching";
        const search = String(window.location.search || "");
        if(search && (cleanPath === "/app/search" || cleanPath.startsWith("/app/list/"))){
            return cleanPath + search;
        }
        return cleanPath;
    }

    function routeForState(){
        if(activePage === "episode-detail" && selectedEpisodeContext){
            return "/app/show/" + encodeURIComponent(String(selectedEpisodeContext.showId)) +
            "/season/" + encodeURIComponent(String(selectedEpisodeContext.season)) +
            "/episode/" + encodeURIComponent(String(selectedEpisodeContext.episode));
        }
        if(activePage === "movie-detail" && typeof selectedMovieId !== "undefined" && selectedMovieId){
            if(typeof getMovieDetailRoute === "function"){
                const movieName = typeof moviePageState !== "undefined" && moviePageState && moviePageState.movie ? moviePageState.movie.title : "";
                return getMovieDetailRoute(selectedMovieId,movieName);
            }
            return "/app/list/watching";
        }
        if(activePage === "person-detail" && typeof selectedPersonContext !== "undefined" && selectedPersonContext && selectedPersonContext.role && selectedPersonContext.personId){
            if(typeof getPersonDetailRoute === "function"){
                return getPersonDetailRoute(selectedPersonContext.role,selectedPersonContext.personId);
            }
            return "/app/list/watching";
        }
        if(activePage === "discovery-detail" && typeof selectedDiscoveryContext !== "undefined" && selectedDiscoveryContext && selectedDiscoveryContext.type && selectedDiscoveryContext.value){
            if(typeof getDiscoveryFilterDetailRoute === "function"){
                const routeName = typeof discoveryPageState !== "undefined" && discoveryPageState ? discoveryPageState.name : "";
                return getDiscoveryFilterDetailRoute(selectedDiscoveryContext.type,selectedDiscoveryContext.value,routeName);
            }
            return "/app/list/watching";
        }
        if(activePage === "genre-detail" && typeof selectedGenreSlug !== "undefined" && selectedGenreSlug){
            return "/app/genre/" + encodeURIComponent(String(selectedGenreSlug));
        }
        if(activePage === "show-detail" && selectedShowId){
            if(typeof getShowDetailRoute === "function"){
                return getShowDetailRoute(selectedShowId);
            }
            return "/app/list/watching";
        }
        if(activePage === "search"){
            const query = typeof searchRouteState !== "undefined" && searchRouteState ? searchRouteState.query : "";
            return typeof getSearchRoute === "function" ? getSearchRoute(query) : "/app/search";
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

    function updateRouteFromState(replace=false){
        if(applyingRoute){
            return;
        }
        setPathRoute(routeForState(),replace);
    }


    function getListRoute(filter,query=""){
        const routeSlug = FILTER_TO_LIST_ROUTE[String(filter || "watching")] || "watching";
        const cleanQuery = String(query || "").trim();
        return "/app/list/" + routeSlug + (cleanQuery ? "?q=" + encodeURIComponent(cleanQuery) : "");
    }

    function setActiveFilterButtons(){
        document.querySelectorAll(".filters button[data-filter]").forEach(button=>{
            button.classList.toggle("active",button.dataset.filter === activeFilter);
        });
    }

    function activateListRoute(listSlug,options={}){
        const cleanSlug = String(listSlug || "watching").trim().toLowerCase();
        const nextFilter = LIST_ROUTE_TO_FILTER[cleanSlug] || "watching";
        clearDetailState();
        activeShowsTab = "watchlist";
        activeFilter = nextFilter;
        if(typeof librarySearchQuery !== "undefined"){
            librarySearchQuery = currentSearchQuery();
        }
        document.querySelectorAll(".top-tabs button").forEach(button=>{
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
        document.querySelectorAll(".top-tabs button").forEach(button=>{
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
        if(typeof selectedGenreSlug !== "undefined"){
            selectedGenreSlug = null;
        }
        if(typeof selectedPersonContext !== "undefined"){
            selectedPersonContext = null;
        }
        if(typeof selectedDiscoveryContext !== "undefined"){
            selectedDiscoveryContext = null;
        }
    }

    function applyRoute(){
        if(typeof appDataReady !== "undefined" && !appDataReady){
            return;
        }

        const route = String(window.location.pathname || "").startsWith("/app") ? String(window.location.pathname || "") : "/app/list/watching";
        const fullRoute = currentRoute();

        if(
            Array.isArray(showDetailBackStack) &&
            showDetailBackStack.length &&
            showDetailBackStack[showDetailBackStack.length - 1] === fullRoute
        ){
            showDetailBackStack.pop();
        }

        applyingRoute = true;

        try{
            if(route === "/app" || route === "/app/" || route === "/app/watchlist" || route === "/app/list"){
                activateListRoute("watching",{replaceRoute:true});
                return;
            }

            const listMatch = route.match(/^\/app\/list\/(watching|paused|completed|plan-to-watch|dropped)$/);
            if(listMatch){
                activateListRoute(listMatch[1]);
                return;
            }

            if(route === "/app/search"){
                clearDetailState();
                if(typeof openSearchPage === "function"){
                    openSearchPage(currentSearchQuery(),{fromRoute:true});
                }else{
                    showPage("discover");
                }
                return;
            }

            const episodeMatch = route.match(/^\/app\/show\/([1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?)\/season\/(\d{1,5})\/episode\/([1-9][0-9]{0,5})$/);
            if(episodeMatch){
                const routeShow = parseRouteIdSlug(episodeMatch[1]);
                const routeShowId = routeShow.id;
                const routeSeason = Number(episodeMatch[2]);
                const routeEpisode = Number(episodeMatch[3]);

                if(
                    activePage === "episode-detail" &&
                    selectedEpisodeContext &&
                    String(selectedEpisodeContext.showId) === routeShowId &&
                    Number(selectedEpisodeContext.season) === routeSeason &&
                    Number(selectedEpisodeContext.episode) === routeEpisode
                ){
                    return;
                }

                if(typeof openEpisodeModal === "function"){
                    openEpisodeModal(routeShowId,routeSeason,routeEpisode,{
                        fromRoute:true,
                        backToShow:true
                    });
                }
                return;
            }

            const movieMatch = route.match(/^\/app\/movie\/([1-9][0-9]{0,11}-[a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(movieMatch){
                const routeMovie = parseRouteIdSlug(movieMatch[1]);
                if(typeof openMoviePage === "function"){
                    openMoviePage(routeMovie.id,{fromRoute:true,routeSlug:routeMovie.slug});
                }
                return;
            }

            const personMatch = route.match(/^\/app\/(actor|creator|director|writer|producer|editor|composer|cinematographer)\/([1-9][0-9]{0,11}-[a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(personMatch){
                const routePersonRole = personMatch[1];
                const routePerson = parseRouteIdSlug(personMatch[2]);
                const routePersonId = routePerson.id;
                if(
                    activePage === "person-detail" &&
                    typeof selectedPersonContext !== "undefined" &&
                    selectedPersonContext &&
                    String(selectedPersonContext.role || "") === routePersonRole &&
                    String(selectedPersonContext.personId || "") === routePersonId &&
                    !routePerson.slug
                ){
                    return;
                }
                if(typeof openPersonPage === "function"){
                    openPersonPage(routePersonRole,routePersonId,{fromRoute:true,routeSlug:routePerson.slug});
                }
                return;
            }

            const discoveryIdMatch = route.match(/^\/app\/(network|theme|company|provider)\/([1-9][0-9]{0,11}-[a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(discoveryIdMatch){
                const parsed = parseRouteIdSlug(discoveryIdMatch[2]);
                if(typeof openDiscoveryFilterPage === "function"){
                    openDiscoveryFilterPage(discoveryIdMatch[1],parsed.id,{fromRoute:true,routeSlug:parsed.slug});
                }
                return;
            }

            const discoveryCodeMatch = route.match(/^\/app\/(language)\/([a-z]{2,3}-[a-z0-9]+(?:-[a-z0-9]+)*)$|^\/app\/(country)\/([a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(discoveryCodeMatch){
                const routeDiscoveryType = discoveryCodeMatch[1] || discoveryCodeMatch[3];
                const rawDiscoveryValue = discoveryCodeMatch[2] || discoveryCodeMatch[4];
                const parsed = routeDiscoveryType === "language"
                ? parseRouteCodeSlug(rawDiscoveryValue,/^([a-z]{2,3})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/)
                : parseRouteCodeSlug(rawDiscoveryValue,/^([a-z]{2})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
                if(typeof openDiscoveryFilterPage === "function"){
                    openDiscoveryFilterPage(routeDiscoveryType,parsed.value,{fromRoute:true,routeSlug:parsed.slug});
                }
                return;
            }

            const yearMatch = route.match(/^\/app\/year\/(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})$/);
            if(yearMatch){
                if(typeof openDiscoveryFilterPage === "function"){
                    openDiscoveryFilterPage("year",yearMatch[1],{fromRoute:true});
                }
                return;
            }

            const statusMatch = route.match(/^\/app\/status\/(returning-series|ended|canceled|in-production)$/);
            if(statusMatch){
                if(typeof openDiscoveryFilterPage === "function"){
                    openDiscoveryFilterPage("status",statusMatch[1],{fromRoute:true});
                }
                return;
            }

            const certificationMatch = route.match(/^\/app\/certification\/(tv|movie)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(certificationMatch){
                if(typeof openDiscoveryFilterPage === "function"){
                    openDiscoveryFilterPage("certification",certificationMatch[1] + "/" + certificationMatch[2],{fromRoute:true});
                }
                return;
            }

            const genreMatch = route.match(/^\/app\/genre\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(genreMatch){
                const routeGenreSlug = genreMatch[1];
                if(activePage === "genre-detail" && typeof selectedGenreSlug !== "undefined" && String(selectedGenreSlug || "") === routeGenreSlug){
                    return;
                }
                if(typeof openGenrePage === "function"){
                    openGenrePage(routeGenreSlug,{fromRoute:true});
                }
                return;
            }

            const showMatch = route.match(/^\/app\/show\/([1-9][0-9]{0,11}-[a-z0-9]+(?:-[a-z0-9]+)*)$/);
            if(showMatch){
                const routeShow = parseRouteIdSlug(showMatch[1]);
                const routeShowId = routeShow.id;
                if(activePage === "show-detail" && String(selectedShowId || "") === routeShowId && !routeShow.slug){
                    return;
                }
                if(typeof openShowDetailsPage === "function"){
                    openShowDetailsPage(routeShowId,{fromRoute:true,routeSlug:routeShow.slug});
                }
                return;
            }

            if(!SECTION_ROUTES.has(route)){
                showRouteNotFound();
                return;
            }

            if(route === "/app/discover"){
                clearDetailState();
                showPage("discover");
                return;
            }
            if(route === "/app/profile"){
                clearDetailState();
                showPage("profile");
                return;
            }
            if(route === "/app/settings"){
                clearDetailState();
                showPage("settings");
                return;
            }
            if(route === "/app/upcoming"){
                clearDetailState();
                showPage("shows");
                activateShowsTab("upcoming");
                return;
            }
            if(route === "/app/history"){
                clearDetailState();
                showPage("shows");
                activateShowsTab("history");
                return;
            }

            clearDetailState();
            showPage("shows");
            activateListRoute("watching",{replaceRoute:route === "/app/watchlist"});
        }finally{
            applyingRoute = false;
        }
    }

    const originalShowPage = window.showPage;
    if(typeof originalShowPage === "function"){
        window.showPage = function(page){
            const result = originalShowPage.apply(this,arguments);
            window.setTimeout(()=>updateRouteFromState(false),0);
            return result;
        };
    }

    document.querySelectorAll(".app-primary-nav button[data-page]").forEach(button=>{
        button.addEventListener("click",()=>{
            window.setTimeout(()=>updateRouteFromState(false),0);
        });
    });

    document.querySelectorAll(".top-tabs button[data-tab]").forEach(button=>{
        button.addEventListener("click",()=>{
            window.setTimeout(()=>updateRouteFromState(false),0);
        });
    });

    document.querySelectorAll(".filters button[data-filter]").forEach(button=>{
        button.addEventListener("click",()=>{
            window.setTimeout(()=>updateRouteFromState(false),0);
        });
    });

    window.addEventListener("popstate",applyRoute);

    window.TVTrackerRouter = {
        applyRoute,
        currentRoute,
        updateRouteFromState,
        routePrefix,
        setPathRoute
    };

    window.setTimeout(applyRoute,0);
}());
