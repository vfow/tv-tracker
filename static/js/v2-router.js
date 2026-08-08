(function(){
    "use strict";

    const SHOW_TABS = new Set(["watchlist","upcoming","history"]);
    const SECTION_ROUTES = new Set([
        "/app/watchlist",
        "/app/upcoming",
        "/app/history",
        "/app/discover",
        "/app/profile",
        "/app/settings"
    ]);
    let applyingRoute = false;

    function routePrefix(){
        return "/app";
    }

    function currentRoute(){
        const path = String(window.location.pathname || "");
        return path.startsWith("/app") ? path : "/app/watchlist";
    }

    function routeForState(){
        if(activePage === "episode-detail" && selectedEpisodeContext){
            return "/app/show/" + encodeURIComponent(String(selectedEpisodeContext.showId)) +
            "/season/" + encodeURIComponent(String(selectedEpisodeContext.season)) +
            "/episode/" + encodeURIComponent(String(selectedEpisodeContext.episode));
        }
        if(activePage === "person-detail" && typeof selectedPersonContext !== "undefined" && selectedPersonContext && selectedPersonContext.role && selectedPersonContext.personId){
            return "/app/" + encodeURIComponent(String(selectedPersonContext.role)) + "/" + encodeURIComponent(String(selectedPersonContext.personId));
        }
        if(activePage === "genre-detail" && typeof selectedGenreSlug !== "undefined" && selectedGenreSlug){
            return "/app/genre/" + encodeURIComponent(String(selectedGenreSlug));
        }
        if(activePage === "show-detail" && selectedShowId){
            return "/app/show/" + encodeURIComponent(String(selectedShowId));
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
            return "/app/watchlist";
        }
        return "/app/watchlist";
    }

    function setPathRoute(route,replace=false){
        const nextRoute = String(route || "/app/watchlist");
        if(window.location.pathname === nextRoute && !window.location.search && !window.location.hash){
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
        if(typeof selectedGenreSlug !== "undefined"){
            selectedGenreSlug = null;
        }
        if(typeof selectedPersonContext !== "undefined"){
            selectedPersonContext = null;
        }
    }

    function applyRoute(){
        if(typeof appDataReady !== "undefined" && !appDataReady){
            return;
        }

        const route = currentRoute();

        if(
            Array.isArray(showDetailBackStack) &&
            showDetailBackStack.length &&
            showDetailBackStack[showDetailBackStack.length - 1] === route
        ){
            showDetailBackStack.pop();
        }

        applyingRoute = true;

        try{
            const episodeMatch = route.match(/^\/app\/show\/([1-9][0-9]{0,11})\/season\/(\d{1,5})\/episode\/([1-9][0-9]{0,5})$/);
            if(episodeMatch){
                const routeShowId = episodeMatch[1];
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

            const personMatch = route.match(/^\/app\/(actor|creator|director|writer|producer|editor|composer|cinematographer)\/([1-9][0-9]{0,11})$/);
            if(personMatch){
                const routePersonRole = personMatch[1];
                const routePersonId = personMatch[2];
                if(
                    activePage === "person-detail" &&
                    typeof selectedPersonContext !== "undefined" &&
                    selectedPersonContext &&
                    String(selectedPersonContext.role || "") === routePersonRole &&
                    String(selectedPersonContext.personId || "") === routePersonId
                ){
                    return;
                }
                if(typeof openPersonPage === "function"){
                    openPersonPage(routePersonRole,routePersonId,{fromRoute:true});
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

            const showMatch = route.match(/^\/app\/show\/([1-9][0-9]{0,11})$/);
            if(showMatch){
                const routeShowId = showMatch[1];
                if(activePage === "show-detail" && String(selectedShowId || "") === routeShowId){
                    return;
                }
                if(typeof openShowDetailsPage === "function"){
                    openShowDetailsPage(routeShowId,{fromRoute:true});
                }
                return;
            }

            if(!SECTION_ROUTES.has(route)){
                setPathRoute("/app/watchlist",true);
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
            activateShowsTab("watchlist");
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

    window.addEventListener("popstate",applyRoute);

    window.TVTrackerV2Router = {
        applyRoute,
        currentRoute,
        updateRouteFromState,
        routePrefix,
        setPathRoute
    };

    window.setTimeout(applyRoute,0);
}());
