var historyVisibleLimit = 40;
const HISTORY_BATCH_SIZE = 40;

const CHECK_SUCCESS_ANIMATION_MS = 560;

var profileSettingsDraft = null;
var avatarCropState = null;
var profileHeaderCropState = null;


function trackerImageURL(path,size="w500"){
    const value = String(path || "").trim();
    if(!value){
        return "";
    }
    if(/^https?:\/\//i.test(value)){
        return value;
    }
    if(window.TVTrackerTMDB && typeof window.TVTrackerTMDB.imageURL === "function"){
        return window.TVTrackerTMDB.imageURL(value,size);
    }
    return "https://image.tmdb.org/t/p/" + String(size || "w500") + value;
}

function trackerBackgroundImage(path,size="original"){
    const url = trackerImageURL(path,size);
    return url ? `url("${escapeHTML(url)}")` : "";
}

function safeExternalURL(value){
    const raw = String(value || "").trim();

    if(!raw){
        return "";
    }

    try{
        const parsed = new URL(raw);
        return parsed.protocol === "https:" || parsed.protocol === "http:"
        ? parsed.href
        : "";
    }catch(error){
        return "";
    }
}


function isPlainAppLinkClick(event){
    return !!event &&
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey;
}

function getCheckSuccessAnimationTarget(element){

    if(!element){
        return null;
    }

    return (
        element.closest("#episode-toggle-watched-button") ||
        element.closest(".episode-row") ||
        element.closest(".behind-episode-row") ||
        element.closest(".upcoming-batch-row") ||
        element.closest(".episode-detail-actions") ||
        element.closest(".season-box") ||
        element.closest(".show") ||
        element
    );

}

function playCheckSuccessAnimation(element){

    if(!element){
        return Promise.resolve();
    }

    const target = getCheckSuccessAnimationTarget(element);

    element.classList.remove("marking");

    if(target){
        target.classList.remove("card-marking");
    }

    void element.offsetWidth;

    element.classList.add("marking");

    if(target){
        target.classList.add("card-marking");
    }

    const reducedMotion = TVTrackerAuditUtils.prefersReducedMotion();

    return new Promise(resolve=>{
        const finish = ()=>{
            element.classList.remove("marking");

            if(target){
                target.classList.remove("card-marking");
            }

            resolve();
        };

        if(reducedMotion){
            requestAnimationFrame(finish);
            return;
        }

        setTimeout(finish,CHECK_SUCCESS_ANIMATION_MS);
    });

}




function getTrackerDocumentTitleLabel(){

    const pageTitles = {
        discover:"Discover",
        search:(typeof searchRouteState !== "undefined" && searchRouteState && searchRouteState.query ? `Search: ${searchRouteState.query}` : "Search"),
        profile:"Profile",
        settings:"Settings",
        notifications:"Notifications",
        "notification-settings":"Notification Settings",
        "show-detail":(typeof getShowForDetailPage === "function" && getShowForDetailPage(selectedShowId) ? getShowForDetailPage(selectedShowId).title : "Show"),
        "episode-detail":selectedEpisodeContext
        ? `S${selectedEpisodeContext.season}E${String(selectedEpisodeContext.episode).padStart(2,"0")}`
        : "Episode",
        "genre-detail":genrePageState && genrePageState.name ? genrePageState.name : "Genre",
        "discovery-detail":discoveryPageState && discoveryPageState.name ? discoveryPageState.name : "TV Shows",
        "browse-detail":typeof browsePageState !== "undefined" && browsePageState && browsePageState.media === "movie" ? "Browse Movies" : "Browse TV Shows",
        "collections-index":"Collections",
        "collection-detail":typeof collectionDetailPageState !== "undefined" && collectionDetailPageState && collectionDetailPageState.collection ? collectionDetailPageState.collection.name : "Collection",
        "person-detail":personPageState && personPageState.person && personPageState.person.name ? personPageState.person.name : "Person",
        "movie-detail":moviePageState && moviePageState.movie && moviePageState.movie.title ? moviePageState.movie.title : "Movie",
        "route-error":"Page Not Found"
    };

    const showTabTitles = {
        watchlist:"Watching",
        upcoming:"Upcoming",
        history:"History"
    };

    return activePage === "shows"
    ? (showTabTitles[activeShowsTab] || "Shows")
    : (pageTitles[activePage] || "Library");

}

function updateShellTitle(){

    const label = getTrackerDocumentTitleLabel();

    if(typeof document !== "undefined"){
        document.title = label || "Library";
    }

    const title = document.getElementById("mobile-page-title");

    if(title){
        title.textContent = label || "Library";
    }

}


function normalizePrimaryNavPage(page){
    const clean = String(page || "").trim().toLowerCase();
    return ["shows","discover","profile","settings"].includes(clean) ? clean : "";
}

function setAppPrimaryNavActive(page){
    const active = normalizePrimaryNavPage(page);
    document.querySelectorAll(".app-primary-nav [data-page]").forEach(button=>{
        const isActive = active && button.dataset.page === active;
        button.classList.toggle("active",!!isActive);

        if(isActive){
            button.setAttribute("aria-current","page");
        }else{
            button.removeAttribute("aria-current");
        }
    });
}

function showPage(page){

    activePage = page;

    if(page === "profile"){
        activeProfileView = "home";
    }

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    if(typeof setAppPrimaryNavActive === "function"){
        setAppPrimaryNavActive(page);
    }

    const pageElement = document.getElementById(page + "-page");

    if(!pageElement){
        return;
    }

    pageElement.classList.add("active-page");

    updateShellTitle();
    renderAll();

    if(window.TVTrackerRouter && typeof window.TVTrackerRouter.updateRouteFromState === "function"){
        window.setTimeout(()=>window.TVTrackerRouter.updateRouteFromState(false),0);
    }

}





function renderAll(){

    if(activePage === "shows"){
        renderShowsPage();
    }

    if(activePage === "discover"){
        updateTrackedLabels();
    }

    if(activePage === "profile"){
        renderProfile();
    }

    if(activePage === "settings"){
        renderSettings();
    }

    if(activePage === "show-detail" && typeof renderActiveShowDetailPage === "function"){
        renderActiveShowDetailPage();
    }

    if(activePage === "episode-detail" && typeof renderActiveEpisodeDetailPage === "function"){
        renderActiveEpisodeDetailPage();
    }

    if(activePage === "movie-detail" && typeof renderActiveMoviePage === "function"){
        renderActiveMoviePage();
    }

    if(activePage === "collections-index" && typeof renderActiveCollectionsPage === "function"){
        renderActiveCollectionsPage();
    }

    if(activePage === "collection-detail" && typeof renderActiveCollectionDetailPage === "function"){
        renderActiveCollectionDetailPage();
    }

}





function renderShowsPage(){

    updateShellTitle();

    const filters = document.querySelector(".filters");

    if(activeShowsTab === "watchlist"){

        filters.style.display = "flex";
        renderLibrarySearchControl();
        renderWatchlist();

    }else if(activeShowsTab === "upcoming"){

        removeLibrarySearchControl();
        filters.style.display = "none";
        renderUpcoming();

        }else if(activeShowsTab === "history"){

        removeLibrarySearchControl();
        filters.style.display = "none";
        renderHistory();

    }

}


function renderTrackerDetailSkeletonHTML(kind="show",backButtonId="show-page-back-button"){
    const label = kind === "movie" ? "MOVIE" : "SHOW";
    return `
        <div class="show-detail-page-inner tt-detail-skeleton-page">
            <button type="button" class="show-page-back-button" id="${escapeHTML(backButtonId)}" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <section class="tt-detail-skeleton" aria-label="Loading ${escapeHTML(label.toLowerCase())}">
                <div class="tt-detail-skeleton-backdrop"></div>
                <div class="tt-detail-skeleton-main">
                    <div class="tt-detail-skeleton-poster"></div>
                    <div class="tt-detail-skeleton-copy">
                        <div class="tt-skeleton-kicker"></div>
                        <div class="tt-skeleton-heading"></div>
                        <div class="tt-skeleton-line tt-skeleton-line-wide"></div>
                        <div class="tt-skeleton-line tt-skeleton-line-mid"></div>
                        <div class="tt-skeleton-action-row">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function renderTrackerEpisodeSkeletonHTML(seasonNumber,episodeNumber){
    return `
        <div class="episode-detail-page-inner tt-episode-skeleton-page">
            <div class="show-page-hero-shell episode-page-hero-shell">
                <button class="show-page-back-button episode-page-back-button" id="episode-open-show-button" type="button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div class="show-page-hero episode-page-hero tt-episode-skeleton-still"></div>
                <div class="show-page-identity-row episode-page-identity-row tt-episode-skeleton-copy">
                    <div class="show-page-hero-content episode-page-hero-content">
                        <div class="tt-skeleton-kicker"></div>
                        <div class="tt-skeleton-heading"></div>
                        <div class="tt-skeleton-line tt-skeleton-line-wide"></div>
                        <div class="tt-skeleton-line tt-skeleton-line-mid"></div>
                        <div class="tt-skeleton-action-row"><span></span><span></span><span></span></div>
                        <p>S${Number(seasonNumber)}E${String(Number(episodeNumber)).padStart(2,"0")}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getCollectionPosterSlotTitle(slot,collection){
    const title = slot && (slot.title || slot.name || slot.original_title)
    ? String(slot.title || slot.name || slot.original_title).trim()
    : String(collection && (collection.name || collection.title) || "Collection").trim();
    return title || "Untitled Movie";
}

function getCollectionPosterSlotYear(slot){
    const date = String(slot && (slot.release_date || slot.date || slot.first_air_date) || "").trim();
    const match = date.match(/^(18|19|20|21)[0-9]{2}/);
    return match ? match[0] : "";
}

function normalizeCollectionPosterSlotForRender(raw,collection){
    if(!raw || typeof raw !== "object"){
        const path = String(raw || "").trim();
        return path ? {poster_path:path,title:getCollectionPosterSlotTitle(null,collection),release_date:""} : null;
    }
    const title = getCollectionPosterSlotTitle(raw,collection);
    const releaseDate = String(raw.release_date || raw.date || raw.first_air_date || "").trim();
    return {
        poster_path:String(raw.poster_path || raw.path || "").trim(),
        title,
        name:title,
        release_date:releaseDate,
        date:releaseDate
    };
}

function getCollectionStackSlotSortYear(slot){
    const year = Number(getCollectionPosterSlotYear(slot) || 0);
    return year > 0 ? year : 9999;
}

function collectionStackSlotHasPoster(slot){
    return !!String(slot && slot.poster_path || "").trim();
}

function orderCollectionPosterSlotsForStack(slots){
    const cleanSlots = (Array.isArray(slots) ? slots : []).slice(0,3);
    if(cleanSlots.length <= 1){
        return cleanSlots;
    }

    const ranked = cleanSlots.map((slot,index)=>({slot,index,year:getCollectionStackSlotSortYear(slot),hasPoster:collectionStackSlotHasPoster(slot)}));
    const posterCandidates = ranked.filter(item=>item.hasPoster);
    const frontItem = (posterCandidates.length ? posterCandidates : ranked)
    .slice()
    .sort((a,b)=>{
        if(a.year !== b.year){ return a.year - b.year; }
        return a.index - b.index;
    })[0];

    if(!frontItem){
        return cleanSlots;
    }

    const front = frontItem.slot;
    const behind = ranked
    .filter(item=>item.index !== frontItem.index)
    .sort((a,b)=>{
        if(a.hasPoster !== b.hasPoster){ return a.hasPoster ? -1 : 1; }
        return a.index - b.index;
    })
    .map(item=>item.slot);

    if(cleanSlots.length === 2){
        return [front,behind[0]].filter(Boolean);
    }

    return [behind[0],front,behind[1]].filter(Boolean);
}

function getCollectionPosterSlotsForRender(collection){
    const buildSlots = source=>{
        const output = [];
        const pushSlot = raw=>{
            const slot = normalizeCollectionPosterSlotForRender(raw,collection);
            if(slot){ output.push(slot); }
        };
        (Array.isArray(source) ? source : []).slice(0,3).forEach(pushSlot);
        return output;
    };

    const partSlots = buildSlots(collection && collection.parts);
    const posterSlots = buildSlots(collection && collection.poster_slots);
    const targetCount = Math.min(3,Math.max(0,Number(collection && collection.movie_count || 0),Array.isArray(collection && collection.parts) ? collection.parts.length : 0));
    let slots = [];

    if(partSlots.length && partSlots.length >= Math.min(targetCount || partSlots.length,3)){
        slots = partSlots.slice(0,3);
    }else if(posterSlots.length && (!partSlots.length || posterSlots.length >= partSlots.length)){
        slots = posterSlots.slice(0,3);
    }else if(partSlots.length){
        slots = partSlots.slice(0,3);
    }else{
        const pathSlots = [];
        if(Array.isArray(collection && collection.poster_paths) && collection.poster_paths.length){
            collection.poster_paths.slice(0,3).forEach(path=>{
                const slot = normalizeCollectionPosterSlotForRender({poster_path:path,title:collection && (collection.name || collection.title) || "Collection"},collection);
                if(slot){ pathSlots.push(slot); }
            });
        }else if(collection && collection.poster_path){
            const slot = normalizeCollectionPosterSlotForRender({poster_path:collection.poster_path,title:collection.name || collection.title || "Collection"},collection);
            if(slot){ pathSlots.push(slot); }
        }
        slots = pathSlots.slice(0,3);
    }

    return orderCollectionPosterSlotsForStack(slots);
}

function getMediaPosterTitle(item,media="movie"){
    const cleanMedia = media === "tv" ? "tv" : "movie";
    const title = item && (item.title || item.name || item.original_title || item.original_name)
    ? String(item.title || item.name || item.original_title || item.original_name).trim()
    : (cleanMedia === "movie" ? "Untitled Movie" : "Untitled Show");
    return title || (cleanMedia === "movie" ? "Untitled Movie" : "Untitled Show");
}

function getMediaPosterYear(item,media="movie"){
    const cleanMedia = media === "tv" ? "tv" : "movie";
    const date = String(item && (item.date || (cleanMedia === "movie" ? item.release_date : item.first_air_date) || item.release_date || item.first_air_date) || "").trim();
    const match = date.match(/^(18|19|20|21)[0-9]{2}/);
    return match ? match[0] : "";
}

function getMediaPosterPlaceholderLabel(item,media="movie"){
    const cleanMedia = media === "tv" ? "tv" : "movie";
    const title = getMediaPosterTitle(item,cleanMedia);
    const year = getMediaPosterYear(item,cleanMedia);
    return year ? `${title} (${year})` : title;
}

// --TVT-search-navigation-owner-begin--
function lockSearchRouteBeforeResultOpen(){
    if(typeof window.getSearchRoute !== "function"){
        return "";
    }

    const routeState = window.searchRouteState && typeof window.searchRouteState === "object"
    ? window.searchRouteState
    : {};
    const searchState = window.discoverSearchState && typeof window.discoverSearchState === "object"
    ? window.discoverSearchState
    : {};
    const query = String(searchState.query || routeState.query || "").trim();

    if(!query){
        return "";
    }

    const media = typeof window.normalizeSearchMediaType === "function"
    ? window.normalizeSearchMediaType(searchState.media || routeState.media || "tv")
    : "tv";
    const route = window.getSearchRoute(query,media,routeState);

    routeState.query = query;
    routeState.media = media;
    searchState.query = query;
    searchState.media = media;

    if(window.TVTrackerRouter && typeof window.TVTrackerRouter.setPathRoute === "function"){
        window.TVTrackerRouter.setPathRoute(route,true);
    }

    return route;
}
window.lockSearchRouteBeforeResultOpen = lockSearchRouteBeforeResultOpen;
// --TVT-search-navigation-owner-end--

function getShowDetailFilters(){
    const filters = window.TVTrackerShowDetailFilters || {};
    const normalizeList = function(value){
        return Array.isArray(value)
        ? value.map(item=>String(item || "").trim().toLowerCase()).filter(Boolean)
        : [];
    };

    return {
        hiddenAlternativeTitleCountries:normalizeList(filters.hiddenAlternativeTitleCountries),
        hiddenAlternativeTitleNames:normalizeList(filters.hiddenAlternativeTitleNames)
    };
}

function alternativeTitleCountryMatchesFilter(item,hiddenCountries){
    const code = String(item && item.iso_3166_1 ? item.iso_3166_1 : "").trim().toLowerCase();
    const countryName = code ? getCountryName(code).toLowerCase() : "";
    const countryLabel = code ? getCountryLabel(code).toLowerCase() : "";

    return hiddenCountries.some(hidden=>{
        return hidden === code || hidden === countryName || countryLabel.includes(hidden);
    });
}

function normalizeThemeItems(show){
    const source = Array.isArray(show && show._tmdb_keywords) ? show._tmdb_keywords : [];
    const seen = new Set();

    return source.map(theme=>{
        if(typeof theme === "string"){
            const name = theme.trim();
            return name ? {id:0,name:name} : null;
        }
        if(!theme){
            return null;
        }
        const name = String(theme.name || "").trim();
        const id = Number(theme.id || 0);
        return name ? {id:Number.isFinite(id) ? id : 0,name:name} : null;
    })
    .filter(Boolean)
    .filter(theme=>{
        const key = theme.id > 0 ? `id:${theme.id}` : `name:${theme.name.toLowerCase()}`;
        if(seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    });
}

function getEyeFilteredRenderItems(items,media,state){
    if(typeof applyEyeFiltersToItems === "function"){
        return applyEyeFiltersToItems(items,media,state || {});
    }
    return Array.isArray(items) ? items : [];
}





function getBrowseGenreOptions(media){
    const cleanMedia = String(media || "tv") === "movie" ? "movie" : "tv";
    let genres = typeof browseOptionState !== "undefined" && browseOptionState && browseOptionState.genres
    ? browseOptionState.genres[cleanMedia]
    : [];
    if((!Array.isArray(genres) || !genres.length) && typeof discoverHubState !== "undefined" && discoverHubState && discoverHubState.genres){
        genres = discoverHubState.genres[cleanMedia];
    }
    return (Array.isArray(genres) ? genres : []).filter(genre=>!(cleanMedia === "tv" && String(genre && genre.name || "").trim().toLowerCase() === "soap"));
}






function getBrowseServiceOptions(media){
    const cleanMedia = String(media || "tv") === "movie" ? "movie" : "tv";
    const source = typeof browseOptionState !== "undefined" && browseOptionState && browseOptionState.providers
    ? browseOptionState.providers[cleanMedia]
    : [];
    return Array.isArray(source) ? source : [];
}





function getBrowseYearControlLabel(state){
    if(state && state.upcoming){
        return "UPCOMING";
    }
    if(state && state.year){
        return String(state.year);
    }
    if(state && state.decade){
        return String(state.decade) + "s";
    }
    return "YEAR";
}

function getBrowseSelectedDecade(state){
    const year = Number(state && state.year || 0);
    if(year){
        return Math.floor(year / 10) * 10;
    }
    const decade = Number(state && state.decade || 0);
    return decade || 0;
}











function getLibrarySearchQuery(){

    if(typeof librarySearchQuery !== "string"){
        librarySearchQuery = "";
    }

    return librarySearchQuery;

}



function normalizeLibrarySearchText(text){

    return String(text || "").toLowerCase().trim();

}



function getShowStatusLabel(show){

    const statusMap = {
        watching:"Watching",
        paused:"Paused",
        finished:"Completed",
        plan:"Plan To Watch",
        dropped:"Dropped"
    };

    return statusMap[show.status] || show.status || "";

}



function getActiveFilterSearchLabel(){

    const filterMap = {
        watching:"Watching",
        paused:"Paused",
        finished:"Completed",
        plan:"Plan To Watch",
        dropped:"Dropped"
    };

    return filterMap[activeFilter] || "This List";

}




function getLibrarySearchText(show){

    const nextEpisode = getNextEpisode(show);
    const details = show._episode_details || {};
    const episodeTitles = Object.values(details)
    .slice(0,80)
    .map(item=>item && item.name ? item.name : "")
    .join(" ");

    return normalizeLibrarySearchText([
        show.title,
        show.name,
        show.overview,
        getShowStatusLabel(show),
        show.tmdb_status,
        nextEpisode ? nextEpisode.name : "",
        episodeTitles
    ].join(" "));

}



function libraryShowMatchesSearch(show,query){

    const cleanQuery = normalizeLibrarySearchText(query);

    if(!cleanQuery){
        return true;
    }

    const terms = cleanQuery.split(/\s+/).filter(Boolean);
    const haystack = getLibrarySearchText(show);

    return terms.every(term=>haystack.includes(term));

}



function sortLibrarySearchResults(a,b,query){

    const cleanQuery = normalizeLibrarySearchText(query);
    const titleA = normalizeLibrarySearchText(a.title || a.name || "");
    const titleB = normalizeLibrarySearchText(b.title || b.name || "");

    const aStarts = cleanQuery && titleA.startsWith(cleanQuery) ? 1 : 0;
    const bStarts = cleanQuery && titleB.startsWith(cleanQuery) ? 1 : 0;

    if(aStarts !== bStarts){
        return bStarts - aStarts;
    }

    const aIncludes = cleanQuery && titleA.includes(cleanQuery) ? 1 : 0;
    const bIncludes = cleanQuery && titleB.includes(cleanQuery) ? 1 : 0;

    if(aIncludes !== bIncludes){
        return bIncludes - aIncludes;
    }

    return titleA.localeCompare(titleB);

}




function getLibraryGenreFilter(){
    return String(typeof libraryGenreFilter !== "undefined" ? libraryGenreFilter : "all") || "all";
}

function getLibraryNetworkFilter(){
    return String(typeof libraryNetworkFilter !== "undefined" ? libraryNetworkFilter : "all") || "all";
}

function getLibraryYearFilter(){
    return String(typeof libraryYearFilter !== "undefined" ? libraryYearFilter : "all") || "all";
}

function getLibrarySortMode(){
    return String(typeof librarySortMode !== "undefined" ? librarySortMode : "default") || "default";
}

function getShowGenreNames(show){
    const genres = [];
    const push = value=>{
        const name = String(value || "").trim();
        if(name && !genres.includes(name)){
            genres.push(name);
        }
    };

    if(show && Array.isArray(show.genres)){
        show.genres.forEach(genre=>{
            if(typeof genre === "string"){
                push(genre);
            }else if(genre && typeof genre === "object"){
                push(genre.name);
            }
        });
    }

    if(show && Array.isArray(show.genre_names)){
        show.genre_names.forEach(push);
    }

    return genres;
}

function getShowNetworkNames(show){
    const networks = [];
    const push = value=>{
        const name = String(value || "").trim();
        if(name && !networks.includes(name)){
            networks.push(name);
        }
    };

    if(show && Array.isArray(show.networks)){
        show.networks.forEach(network=>{
            if(typeof network === "string"){
                push(network);
            }else if(network && typeof network === "object"){
                push(network.name);
            }
        });
    }

    if(show && show.network && typeof show.network === "object"){
        push(show.network.name);
    }else if(show && show.network){
        push(show.network);
    }

    if(show && Array.isArray(show._tmdb_networks)){
        show._tmdb_networks.forEach(network=>{
            if(typeof network === "string"){
                push(network);
            }else if(network && typeof network === "object"){
                push(network.name);
            }
        });
    }

    push(show && show.network_name);
    return networks;
}

function getLibraryBaseStatusShows(){
    return Object.values(DATA.shows || {}).filter(show=>filterShow(show));
}

function buildLibraryOptionCounts(type,baseShows=null){
    const counts = new Map();
    const statusShows = Array.isArray(baseShows) ? baseShows : getLibraryBaseStatusShows();

    statusShows.forEach(show=>{
        let values = [];
        if(type === "network"){
            values = getShowNetworkNames(show);
        }else if(type === "year"){
            const year = getShowReleaseYearValue(show);
            values = year ? [String(year)] : [];
        }else{
            values = getShowGenreNames(show);
        }

        values.forEach(value=>{
            counts.set(value,(counts.get(value) || 0) + 1);
        });
    });

    const selectedValue = type === "network"
    ? getLibraryNetworkFilter()
    : type === "year"
    ? getLibraryYearFilter()
    : getLibraryGenreFilter();

    if(selectedValue !== "all" && !counts.has(selectedValue)){
        counts.set(selectedValue,0);
    }

    return Array.from(counts.entries())
    .sort((a,b)=>type === "year"
        ? Number(b[0]) - Number(a[0])
        : a[0].localeCompare(b[0],undefined,{sensitivity:"base"}))
    .map(([name,count])=>({value:name,label:name + " (" + count + ")"}));
}

function setSelectOptions(select,firstLabel,options,value){
    if(!select){
        return;
    }

    const cleanValue = String(value || "all");
    const rows = [{value:"all",label:firstLabel}].concat(options || []);
    select.innerHTML = rows.map(option=>{
        const selected = String(option.value) === cleanValue ? " selected" : "";
        return `<option value="${escapeHTML(option.value)}"${selected}>${escapeHTML(option.label)}</option>`;
    }).join("");

    if(!rows.some(option=>String(option.value) === cleanValue)){
        select.value = "all";
    }
}

function syncLibraryFilterRoute(){
    if(
        typeof window !== "undefined" &&
        activePage === "shows" &&
        activeShowsTab === "watchlist" &&
        window.TVTrackerRouter &&
        typeof window.TVTrackerRouter.updateRouteFromState === "function"
    ){
        window.TVTrackerRouter.updateRouteFromState(false);
    }
}

function resetLibraryFiltersToDefault(){
    libraryGenreFilter = "all";
    libraryNetworkFilter = "all";
    libraryYearFilter = "all";
    librarySortMode = "default";

    renderLibrarySearchControl();
    renderWatchlist();
    syncLibraryFilterRoute();
}

function hasActiveLibraryControls(){
    return Boolean(
        getLibraryGenreFilter() !== "all" ||
        getLibraryNetworkFilter() !== "all" ||
        getLibraryYearFilter() !== "all" ||
        getLibrarySortMode() !== "default"
    );
}

function libraryShowMatchesAdvancedFilters(show){
    const genre = getLibraryGenreFilter();
    const network = getLibraryNetworkFilter();
    const year = getLibraryYearFilter();

    if(genre !== "all" && !getShowGenreNames(show).includes(genre)){
        return false;
    }

    if(network !== "all" && !getShowNetworkNames(show).includes(network)){
        return false;
    }

    if(year !== "all" && String(getShowReleaseYearValue(show)) !== year){
        return false;
    }

    return true;
}

function getShowReleaseYearValue(show){
    const raw = String(show && (show.first_air_date || show.release_date || show.year || "") || "");
    const match = raw.match(/\d{4}/);
    return match ? Number(match[0]) : 0;
}

function getShowRatingValue(show){
    const rating = Number(show && (show.vote_average || show.rating || show.tmdb_rating || 0));
    return Number.isFinite(rating) ? rating : 0;
}

function getShowAddedTimestamp(show){
    const value = show && (show.date_added || show.created_at || show.added_at || "");
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
}

function getLatestWatchedTimestampForShow(show){
    const id = String(show && (show.tmdb_id || show.id || "") || "");
    let latest = 0;

    (Array.isArray(DATA.history) ? DATA.history : []).forEach(entry=>{
        if(String(entry && (entry.tmdb_id || entry.show_id || "") || "") !== id){
            return;
        }

        const time = Date.parse(entry.watched_at || entry.date || "");
        if(Number.isFinite(time) && time > latest){
            latest = time;
        }
    });

    const activity = Date.parse(show && (show.last_activity_at || "") || "");
    return latest || (Number.isFinite(activity) ? activity : 0);
}

function sortLibraryShows(shows,query){
    const mode = getLibrarySortMode();
    const cleanQuery = getLibrarySearchQuery();
    const titleCompare = (a,b)=>String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""),undefined,{sensitivity:"base"});

    const output = shows.slice();

    if(mode === "title-az"){
        return output.sort(titleCompare);
    }

    if(mode === "title-za"){
        return output.sort((a,b)=>titleCompare(b,a));
    }

    if(mode === "recently-added"){
        return output.sort((a,b)=>getShowAddedTimestamp(b) - getShowAddedTimestamp(a) || titleCompare(a,b));
    }

    if(mode === "recently-watched"){
        return output.sort((a,b)=>getLatestWatchedTimestampForShow(b) - getLatestWatchedTimestampForShow(a) || titleCompare(a,b));
    }

    if(mode === "rating-desc"){
        return output.sort((a,b)=>getShowRatingValue(b) - getShowRatingValue(a) || titleCompare(a,b));
    }

    if(mode === "year-newest"){
        return output.sort((a,b)=>getShowReleaseYearValue(b) - getShowReleaseYearValue(a) || titleCompare(a,b));
    }

    if(mode === "year-oldest"){
        return output.sort((a,b)=>getShowReleaseYearValue(a) - getShowReleaseYearValue(b) || titleCompare(a,b));
    }

    if(cleanQuery){
        return output.sort((a,b)=>sortLibrarySearchResults(a,b,query));
    }

    return output.sort((a,b)=>{
        const activityA = a.last_activity_at || a.date_added || "";
        const activityB = b.last_activity_at || b.date_added || "";
        const timeA = new Date(activityA).getTime();
        const timeB = new Date(activityB).getTime();
        const safeTimeA = Number.isFinite(timeA) ? timeA : 0;
        const safeTimeB = Number.isFinite(timeB) ? timeB : 0;

        if(safeTimeA !== safeTimeB){
            return safeTimeB - safeTimeA;
        }

        return titleCompare(a,b);
    });
}

function removeLibrarySearchControl(){

    const existing = document.getElementById("library-search-box");

    if(existing){
        existing.remove();
    }

}



function renderLibrarySearchControl(){

    const filters = document.querySelector(".filters");

    if(!filters){
        return;
    }

    const statusTrack = filters.querySelector(".status-filter-track");
    let menu = document.getElementById("library-filter-menu");

    if(!menu){
        menu = createLibraryFilterMenu();
        if(statusTrack){
            filters.insertBefore(menu,statusTrack);
        }else{
            filters.insertBefore(menu,filters.firstChild);
        }
    }

    let box = document.getElementById("library-search-box");

    if(!box){

        box = createLibrarySearchBox();
        filters.appendChild(box);

    }

    const input = box.querySelector("#library-search");
    const genreSelect = menu.querySelector("#library-genre-filter");
    const networkSelect = menu.querySelector("#library-network-filter");
    const yearSelect = menu.querySelector("#library-year-filter");
    const sortSelect = menu.querySelector("#library-sort-mode");
    const resetButton = menu.querySelector("#library-reset-filters");

    if(input){
        input.placeholder = "Search " + getActiveFilterSearchLabel();
        const nextValue = getLibrarySearchQuery();
        if(document.activeElement !== input || input.value !== nextValue){
            input.value = nextValue;
        }
    }

    const baseStatusShows = getLibraryBaseStatusShows();
    setSelectOptions(genreSelect,"All Genres",buildLibraryOptionCounts("genre",baseStatusShows),getLibraryGenreFilter());
    setSelectOptions(networkSelect,"All Networks",buildLibraryOptionCounts("network",baseStatusShows),getLibraryNetworkFilter());
    setSelectOptions(yearSelect,"All Years",buildLibraryOptionCounts("year",baseStatusShows),getLibraryYearFilter());

    if(sortSelect){
        sortSelect.value = getLibrarySortMode();
    }

    if(resetButton){
        resetButton.hidden = !hasActiveLibraryControls();
    }

}



function closeLibraryFilterDropdown(){
    const dropdown = document.getElementById("library-filter-dropdown");
    const toggle = document.getElementById("library-filter-toggle");

    if(dropdown){
        dropdown.hidden = true;
    }

    if(toggle){
        toggle.setAttribute("aria-expanded","false");
    }
}

function createLibraryFilterMenu(){

    const menu = document.createElement("div");
    menu.id = "library-filter-menu";
    menu.className = "library-filter-menu";

    menu.innerHTML = `
        <button id="library-filter-toggle" class="library-filter-toggle" type="button" aria-label="Filters" aria-expanded="false" aria-controls="library-filter-dropdown">
            <img src="/static/assets/icons/filter.svg" alt="">
        </button>

        <div id="library-filter-dropdown" class="library-filter-dropdown" hidden>
            <label class="library-filter-label" for="library-genre-filter">Genre</label>
            <select id="library-genre-filter" class="library-filter-select" aria-label="Filter by genre">
                <option value="all">All Genres</option>
            </select>

            <label class="library-filter-label" for="library-network-filter">Network</label>
            <select id="library-network-filter" class="library-filter-select" aria-label="Filter by network">
                <option value="all">All Networks</option>
            </select>

            <label class="library-filter-label" for="library-year-filter">Year</label>
            <select id="library-year-filter" class="library-filter-select" aria-label="Filter by year">
                <option value="all">All Years</option>
            </select>

            <label class="library-filter-label" for="library-sort-mode">Sort</label>
            <select id="library-sort-mode" class="library-filter-select library-sort-select" aria-label="Sort library">
                <option value="default">Default Order</option>
                <option value="title-az">Title A–Z</option>
                <option value="title-za">Title Z–A</option>
                <option value="recently-added">Recently Added</option>
                <option value="recently-watched">Recently Watched</option>
                <option value="rating-desc">Rating High to Low</option>
                <option value="year-newest">Release Year Newest</option>
                <option value="year-oldest">Release Year Oldest</option>
            </select>

            <button id="library-reset-filters" class="library-reset-button" type="button" hidden>Reset Filters</button>
        </div>
    `;

    const toggle = menu.querySelector("#library-filter-toggle");
    const dropdown = menu.querySelector("#library-filter-dropdown");
    const genreSelect = menu.querySelector("#library-genre-filter");
    const networkSelect = menu.querySelector("#library-network-filter");
    const yearSelect = menu.querySelector("#library-year-filter");
    const sortSelect = menu.querySelector("#library-sort-mode");
    const resetButton = menu.querySelector("#library-reset-filters");

    toggle.addEventListener("click",function(event){
        event.stopPropagation();
        const willOpen = dropdown.hidden;
        dropdown.hidden = !willOpen;
        toggle.setAttribute("aria-expanded",willOpen ? "true" : "false");
    });

    dropdown.addEventListener("click",function(event){
        event.stopPropagation();
    });

    genreSelect.addEventListener("change",function(){
        libraryGenreFilter = this.value || "all";
        renderWatchlist();
        syncLibraryFilterRoute();
    });

    networkSelect.addEventListener("change",function(){
        libraryNetworkFilter = this.value || "all";
        renderWatchlist();
        syncLibraryFilterRoute();
    });

    yearSelect.addEventListener("change",function(){
        libraryYearFilter = this.value || "all";
        renderWatchlist();
        syncLibraryFilterRoute();
    });

    sortSelect.addEventListener("change",function(){
        librarySortMode = this.value || "default";
        renderWatchlist();
        syncLibraryFilterRoute();
    });

    resetButton.addEventListener("click",function(){
        resetLibraryFiltersToDefault();
        closeLibraryFilterDropdown();
    });

    if(!window.__tvTrackerLibraryFilterCloseBound){
        window.__tvTrackerLibraryFilterCloseBound = true;
        document.addEventListener("click",closeLibraryFilterDropdown);
        document.addEventListener("keydown",function(event){
            if(event.key === "Escape"){
                closeLibraryFilterDropdown();
            }
        });
    }

    return menu;

}

function createLibrarySearchBox(){

    const box = document.createElement("div");
    box.id = "library-search-box";
    box.className = "library-search-box library-control-row";

    const value = getLibrarySearchQuery();

    box.innerHTML = `
        <input
        id="library-search"
        class="library-search-input"
        type="search"
        placeholder="Search ${escapeHTML(getActiveFilterSearchLabel())}"
        autocomplete="off"
        spellcheck="false"
        autocorrect="off"
        autocapitalize="off"
        data-lpignore="true"
        data-form-type="other"
        value="${escapeHTML(value)}">
    `;

    const input = box.querySelector("#library-search");

    input.addEventListener("input",function(){

        librarySearchQuery = this.value;
        renderWatchlist();
        if(typeof scheduleLibrarySearchRouteUpdate === "function"){
            scheduleLibrarySearchRouteUpdate();
        }

    });

    return box;

}



function getWatchlistShowsForCurrentView(){
    const query = getLibrarySearchQuery();
    let shows = Object.values(DATA.shows || {})
    .filter(show=>filterShow(show))
    .filter(show=>libraryShowMatchesAdvancedFilters(show));

    if(query){
        shows = shows.filter(show=>libraryShowMatchesSearch(show,query));
    }

    shows = sortLibraryShows(shows,query);

    return {shows,query};
}



function refreshInterfaceForDataChanges(change={}){
    const showIds = Array.from(new Set((change.showIds || []).map(String)));
    const historyChanged = change.historyChanged === true;
    const stateChanged = change.stateChanged === true;

    if(activePage === "shows"){
        if(activeShowsTab === "watchlist"){
            if(showIds.length > 0){
                refreshWatchlistShows(showIds);
            }else if(stateChanged){
                renderWatchlist();
            }
        }else if(activeShowsTab === "history"){
            if(historyChanged || showIds.length > 0){
                renderHistory();
            }
        }else if(activeShowsTab === "upcoming"){
            if(showIds.length > 0 || historyChanged || stateChanged){
                renderUpcoming(false);
            }
        }
    }else if(activePage === "profile"){
        if(historyChanged || stateChanged || showIds.length > 0){
            renderProfile();
        }
    }else if(activePage === "settings"){
        if(stateChanged){
            renderSettings();
        }
    }else if(activePage === "discover" && showIds.length > 0){
        updateTrackedLabels();
    }

    const selectedId = typeof selectedShowId !== "undefined" && selectedShowId
    ? String(selectedShowId)
    : "";
    const selectedChanged = selectedId && showIds.includes(selectedId);
    const selectedNeedsRefresh = Boolean(
        selectedChanged || (stateChanged && selectedId)
    );

    if(selectedNeedsRefresh && selectedEpisodeContext){
        const show = typeof getShowForDetailPage === "function" ? getShowForDetailPage(selectedId) : (DATA.shows && DATA.shows[selectedId]);
        if(show){
            renderEpisodeModal(
                show,
                selectedEpisodeContext.season,
                selectedEpisodeContext.episode,
                selectedEpisodeContext
            );
        }
    }else if(selectedNeedsRefresh){
        const show = typeof getShowForDetailPage === "function" ? getShowForDetailPage(selectedId) : (DATA.shows && DATA.shows[selectedId]);
        if(show && typeof renderShowDetailsPagePreservingScroll === "function"){
            renderShowDetailsPagePreservingScroll(show);
        }else if(typeof closeShowDetailsPage === "function"){
            closeShowDetailsPage();
        }
    }
}


function isRecentlyAvailableEpisode(episode,show=null){

    if(!episode || !episode.air_date){
        return false;
    }

    if(!isEpisodeAired(episode.air_date,episode,show)){
        return false;
    }

    const diffDays = getDayDiffFromToday(episode.air_date,episode);

    return diffDays !== null && diffDays >= 0 && diffDays <= 4;

}



function closeBehindEpisodesPopup(){

    const overlay = document.getElementById("behind-popup");

    if(overlay){
        overlay.style.display = "none";
    }

}



function getShowNetworkItems(show){

    const networks = Array.isArray(show && show.networks)
    ? show.networks
    : [];

    const seen = new Set();

    return networks
    .map(network=>{

        if(typeof network === "string"){
            return {
                id:0,
                name:String(network || "").trim(),
                logo_path:"",
                origin_country:""
            };
        }

        if(network && network.name){
            return {
                id:Number(network.id || 0),
                name:String(network.name || "").trim(),
                logo_path:network.logo_path || "",
                origin_country:network.origin_country || ""
            };
        }

        return null;

    })
    .filter(network=>{

        if(!network || !network.name){
            return false;
        }

        const key = network.name.toLowerCase();

        if(seen.has(key)){
            return false;
        }

        seen.add(key);
        return true;

    });

}


function getShowGenreRoute(genre,media="tv"){
    const item = genre && typeof genre === "object" ? genre : null;
    const name = String(item ? item.name : genre || "").trim();
    const id = item ? Number(item.id || 0) : 0;
    if(id > 0 && typeof getGenreDetailRoute === "function"){
        return getGenreDetailRoute(id,name,media);
    }
    if(typeof getGenreRouteFromName === "function"){
        return getGenreRouteFromName(name,media);
    }
    return "";
}

function getMovieCertification(movie){
    const results = movie && movie.release_dates && Array.isArray(movie.release_dates.results) ? movie.release_dates.results : [];
    const us = results.find(item=>String(item.iso_3166_1 || "").toUpperCase() === "US");
    const release = us && Array.isArray(us.release_dates) ? us.release_dates.find(item=>String(item.certification || "").trim()) : null;
    return release ? String(release.certification || "").trim() : "";
}

function normalizeMovieThemeItems(movie){
    const payload = movie && movie.keywords ? movie.keywords : null;
    const source = payload && Array.isArray(payload.keywords)
    ? payload.keywords
    : (payload && Array.isArray(payload.results) ? payload.results : (Array.isArray(payload) ? payload : []));
    return normalizeThemeItems({_tmdb_keywords:source});
}

function renderMovieProvidersHTML(movie){
    const region = typeof v2GetWatchRegion === "function" ? v2GetWatchRegion() : "US";
    const providerRegion = movie && movie.watch_providers && movie.watch_providers.results ? movie.watch_providers.results[region] : null;
    if(!providerRegion){
        return `<div class="v2-api-empty">Unknown</div>`;
    }
    const renderGroup = function(label,providers){
        if(!Array.isArray(providers) || !providers.length){
            return "";
        }
        return `
            <div class="v2-provider-group">
                <div class="v2-provider-group-title">${escapeHTML(label)}</div>
                <div class="v2-provider-list">
                    ${providers.slice(0,10).map(provider=>{
                        const logo = provider.logo_path ? `<img class="v2-provider-logo" src="${escapeHTML(trackerImageURL(provider.logo_path,"w92"))}" alt="">` : "";
                        const providerName = provider && provider.provider_name ? provider.provider_name : (provider && provider.name ? provider.name : "Provider");
                        return `<span class="v2-provider-pill v2-provider-pill-muted">${logo}<span>${escapeHTML(providerName)}</span></span>`;
                    }).join("")}
                </div>
            </div>
        `;
    };
    const groups = [
        renderGroup("Streaming",providerRegion.flatrate),
        renderGroup("Rent",providerRegion.rent),
        renderGroup("Buy",providerRegion.buy)
    ].filter(Boolean).join("");
    return groups ? `<div class="show-release-provider-stack">${groups}</div>` : `<div class="v2-api-empty">Unknown</div>`;
}

function getMovieReleaseTypeLabel(type){
    const releaseTypes = {
        1:"Premiere",
        2:"Theatrical Limited",
        3:"Theatrical",
        4:"Digital",
        5:"Physical",
        6:"TV"
    };
    return releaseTypes[Number(type || 0)] || "Release";
}

function getMovieReleaseTypeOrder(type){
    const order = {1:1,2:2,3:3,4:4,5:5,6:6};
    return order[Number(type || 0)] || 99;
}

function getMovieReleaseSortMode(){
    const sort = String(typeof activeMovieReleaseSort !== "undefined" ? activeMovieReleaseSort : "date").trim().toLowerCase();
    return sort === "country" ? "country" : "date";
}

function collectMovieReleaseRows(movie){
    const results = movie && movie.release_dates && Array.isArray(movie.release_dates.results) ? movie.release_dates.results : [];
    const releases = [];

    results.forEach(country=>{
        const code = String(country && country.iso_3166_1 || "").trim().toUpperCase();
        const countryName = code ? getCountryName(code) : "Other";
        (Array.isArray(country && country.release_dates) ? country.release_dates : [])
        .map(release=>({
            countryCode:code,
            countryName:countryName || code || "Other",
            date:String(release && release.release_date || "").slice(0,10) || "Unknown",
            certification:String(release && release.certification || "").trim(),
            note:String(release && release.note || "").trim(),
            type:Number(release && release.type || 0),
            typeLabel:getMovieReleaseTypeLabel(release && release.type)
        }))
        .filter(release=>release.date !== "Unknown" || release.typeLabel !== "Release" || release.certification || release.note)
        .forEach(release=>releases.push(release));
    });

    return releases;
}

function sortMovieReleaseRows(a,b){
    const dateA = a.date === "Unknown" ? "9999-99-99" : a.date;
    const dateB = b.date === "Unknown" ? "9999-99-99" : b.date;
    if(dateA !== dateB){
        return dateA.localeCompare(dateB);
    }
    const countryDiff = String(a.countryName || "").localeCompare(String(b.countryName || ""));
    if(countryDiff){
        return countryDiff;
    }
    const typeDiff = getMovieReleaseTypeOrder(a.type) - getMovieReleaseTypeOrder(b.type);
    if(typeDiff){
        return typeDiff;
    }
    return String(a.certification || "").localeCompare(String(b.certification || ""));
}

function groupMovieReleasesByCountry(releases){
    const countries = new Map();
    releases.forEach(release=>{
        const key = release.countryCode || release.countryName || "Other";
        if(!countries.has(key)){
            countries.set(key,{
                countryCode:release.countryCode,
                countryName:release.countryName || release.countryCode || "Other",
                releases:[]
            });
        }
        countries.get(key).releases.push(release);
    });

    return Array.from(countries.values())
    .map(country=>({
        ...country,
        releases:country.releases.sort(sortMovieReleaseRows)
    }))
    .sort((a,b)=>String(a.countryName || "").localeCompare(String(b.countryName || "")));
}

function groupMovieReleasesByDate(releases){
    const dates = new Map();
    releases.forEach(release=>{
        const key = release.date || "Unknown";
        if(!dates.has(key)){
            dates.set(key,{date:key,releases:[]});
        }
        dates.get(key).releases.push(release);
    });

    return Array.from(dates.values())
    .map(group=>({
        ...group,
        releases:group.releases.sort((a,b)=>{
            const countryDiff = String(a.countryName || "").localeCompare(String(b.countryName || ""));
            if(countryDiff){
                return countryDiff;
            }
            const typeDiff = getMovieReleaseTypeOrder(a.type) - getMovieReleaseTypeOrder(b.type);
            if(typeDiff){
                return typeDiff;
            }
            return String(a.certification || "").localeCompare(String(b.certification || ""));
        })
    }))
    .sort((a,b)=>{
        const dateA = a.date === "Unknown" ? "9999-99-99" : a.date;
        const dateB = b.date === "Unknown" ? "9999-99-99" : b.date;
        return dateA.localeCompare(dateB);
    });
}

function normalizeCrewJobGroupLabel(job){
    const label = String(job || "Crew").trim() || "Crew";
    const lower = label.toLowerCase();
    const aliases = {
        "director":"Directors",
        "producer":"Producers",
        "executive producer":"Executive Producers",
        "writer":"Writers",
        "original writer":"Original Writers",
        "editor":"Editors",
        "director of photography":"Cinematography",
        "cinematographer":"Cinematography",
        "assistant director":"Assistant Directors",
        "casting":"Casting",
        "production design":"Production Design",
        "art direction":"Art Direction",
        "set decoration":"Set Decoration",
        "special effects":"Special Effects",
        "visual effects":"Visual Effects",
        "stunts":"Stunts",
        "composer":"Composers",
        "original music composer":"Original Music Composers",
        "sound":"Sound",
        "costume design":"Costume Design",
        "makeup":"Makeup",
        "hairstyling":"Hairstyling"
    };
    if(aliases[lower]){
        return aliases[lower];
    }
    if(/(?:designer|artist|operator|supervisor|coordinator|manager|assistant|director|producer|writer|editor|composer|photographer|technician|consultant)$/i.test(label)){
        return label + "s";
    }
    return label;
}

function getCrewJobDisplayOrder(job){
    const lower = String(job || "").trim().toLowerCase();
    const rules = [
        [10,value=>value === "director"],
        [20,value=>value === "producer"],
        [30,value=>value === "writer" || value.includes("screenplay") || value === "story"],
        [35,value=>value.includes("original writer")],
        [40,value=>value.includes("casting")],
        [50,value=>value === "editor" || value.includes("editing")],
        [60,value=>value.includes("director of photography") || value.includes("cinematograph")],
        [70,value=>value.includes("assistant director")],
        [80,value=>value.includes("executive producer")],
        [90,value=>value.includes("lighting") || value.includes("gaffer")],
        [100,value=>value.includes("camera operator") || value.includes("camera")],
        [110,value=>value.includes("production design")],
        [120,value=>value.includes("art direction") || value === "art director"],
        [130,value=>value.includes("set decoration")],
        [140,value=>value.includes("special effects")],
        [150,value=>value.includes("visual effects")],
        [160,value=>value.includes("stunt")],
        [170,value=>value.includes("composer") || value.includes("music")],
        [180,value=>value.includes("sound")],
        [190,value=>value.includes("costume")],
        [200,value=>value.includes("makeup") || value.includes("make-up")],
        [210,value=>value.includes("hair")]
    ];
    const match = rules.find(([,test])=>test(lower));
    return match ? match[0] : 500;
}

function flattenCrewEntries(source){
    if(Array.isArray(source)){
        return source.slice();
    }
    if(!source || typeof source !== "object"){
        return [];
    }
    const rows = [];
    Object.values(source).forEach(group=>{
        (Array.isArray(group) ? group : []).forEach(person=>{
            const jobs = String(person && person.job || "Crew").split(" / ").map(job=>job.trim()).filter(Boolean);
            (jobs.length ? jobs : ["Crew"]).forEach(job=>rows.push({...person,job}));
        });
    });
    return rows;
}

function collectCrewJobGroups(source){
    const groups = new Map();
    flattenCrewEntries(source).forEach(person=>{
        if(!person || !person.name){ return; }
        const job = String(person.job || "Crew").trim() || "Crew";
        const jobKey = typeof getPersonRoleKeyFromLabel === "function" ? getPersonRoleKeyFromLabel(job) : String(job).toLowerCase().replace(/[^a-z0-9]+/g,"-");
        if(!jobKey){ return; }
        if(!groups.has(jobKey)){
            groups.set(jobKey,{jobKey,job,label:normalizeCrewJobGroupLabel(job),people:new Map()});
        }
        const group = groups.get(jobKey);
        const id = Number(person.id || 0);
        const name = String(person.name || "Unknown").trim();
        const personKey = id ? `id:${id}` : `name:${name.toLowerCase()}`;
        if(!group.people.has(personKey)){
            group.people.set(personKey,{...person,job});
        }else if(Number(person.episode_count || 0) > Number(group.people.get(personKey).episode_count || 0)){
            group.people.set(personKey,{...person,job});
        }
    });

    return Array.from(groups.values()).map(group=>({
        jobKey:group.jobKey,
        job:group.job,
        label:group.label,
        people:Array.from(group.people.values()).sort((a,b)=>{
            const episodeDiff = Number(b.episode_count || 0) - Number(a.episode_count || 0);
            return episodeDiff || String(a.name || "").localeCompare(String(b.name || ""));
        })
    })).sort((a,b)=>{
        const orderDiff = getCrewJobDisplayOrder(a.job) - getCrewJobDisplayOrder(b.job);
        return orderDiff || a.label.localeCompare(b.label);
    });
}

function renderCrewJobGroupsHTML(source,media="tv",emptyText="Unknown"){
    const groups = collectCrewJobGroups(source);
    if(!groups.length){
        return `<div class="v2-api-empty">${escapeHTML(emptyText)}</div>`;
    }
    return `<div class="movie-crew-department-list crew-job-group-list">${groups.map(group=>`
        <div class="show-detail-crew-group movie-crew-department-group crew-job-group">
            <h3 class="modal-section-heading movie-crew-department-heading crew-job-heading">${escapeHTML(group.label)}</h3>
            <div class="v2-actor-list movie-crew-list">${renderV2CrewMemberRows(group.people,group.jobKey,media)}</div>
        </div>
    `).join("")}</div>`;
}

function v2GetWatchRegion(){
    return "US";
}

function getShowLanguageItems(show){
    const items = [];
    const seenCodes = new Set();
    const seenLabels = new Set();
    const push = function(code,label){
        const cleanCode = typeof normalizeLanguageCode === "function" ? normalizeLanguageCode(code) : String(code || "").trim().toLowerCase();
        const cleanLabel = String(label || (typeof getLanguageName === "function" ? getLanguageName(cleanCode) : cleanCode)).trim();
        const labelKey = cleanLabel.toLowerCase();

        if(cleanCode && seenCodes.has(cleanCode)){
            return;
        }

        if(labelKey && seenLabels.has(labelKey)){
            return;
        }

        if(!cleanCode && !cleanLabel){
            return;
        }

        if(cleanCode){
            seenCodes.add(cleanCode);
        }
        if(labelKey){
            seenLabels.add(labelKey);
        }
        items.push({code:cleanCode,label:cleanLabel});
    };

    if(show && show.original_language){
        const code = String(show.original_language || "").trim().toLowerCase();
        push(code,typeof getLanguageName === "function" ? getLanguageName(code) : code.toUpperCase());
    }

    (Array.isArray(show && show.spoken_languages) ? show.spoken_languages : []).forEach(language=>{
        if(typeof language === "string"){
            push("",language);
        }else if(language){
            push(language.iso_639_1 || language.iso_639_2 || "",language.english_name || language.name || "");
        }
    });

    return items;
}

function getCrewRouteRole(person,fallbackRole=""){
    const job = String(person && person.job || fallbackRole || "").trim();
    if(typeof getPersonRoleKeyFromLabel === "function"){
        return getPersonRoleKeyFromLabel(job);
    }
    return String(job || "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

function renderV2ActorImageHTML(actor){
    if(actor && actor.profile_path){
        return `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(actor.profile_path,"w185"))}" alt="">`;
    }

    return renderPersonSilhouettePlaceholderHTML("v2-actor-placeholder");
}

function getCastLayoutSetting(){
    return "vertical";
}

function renderV2ActorListHTML(actors,limit=12,media="tv"){
    const source = Array.isArray(actors) ? actors : [];
    const list = limit === null ? source : source.slice(0,Number(limit || 12));

    return list.map(actor=>{
        const actorId = Number(actor && actor.id || 0);
        const actorName = actor && actor.name || "Unknown Actor";
        const cleanMedia = media === "movie" ? "movie" : "tv";
        const route = actorId > 0 && typeof getPersonDetailRoute === "function" ? getPersonDetailRoute("acting",actorId,actorName,cleanMedia) : "";
        const openTag = route
        ? `<a class="v2-actor-list-row v2-person-card-link" href="${escapeHTML(route)}" data-person-role="acting" data-person-media="${escapeHTML(cleanMedia)}" data-person-id="${escapeHTML(actorId)}" data-person-name="${escapeHTML(actorName)}">`
        : `<div class="v2-actor-list-row">`;
        const closeTag = route ? "</a>" : "</div>";

        return `
            ${openTag}
                <div class="v2-actor-list-photo">${renderV2ActorImageHTML(actor)}</div>
                <div class="v2-actor-list-text">
                    <div class="v2-actor-name">${escapeHTML(actorName)}</div>
                    <div class="v2-actor-role">${escapeHTML(actor.character || "Unknown Role")}</div>
                </div>
            ${closeTag}
        `;
    }).join("");
}

function renderV2ActorGridHTML(actors,limit=12){
    const source = Array.isArray(actors) ? actors : [];
    const list = limit === null ? source : source.slice(0,Number(limit || 12));

    return list.map(actor=>{
        return `
            <div class="v2-actor-grid-card">
                <div class="v2-actor-grid-photo">${renderV2ActorImageHTML(actor)}</div>
                <div class="v2-actor-name">${escapeHTML(actor.name || "Unknown Actor")}</div>
                <div class="v2-actor-role">${escapeHTML(actor.character || "Unknown Role")}</div>
            </div>
        `;
    }).join("");
}

function renderV2ActorListSectionHTML(title,actors,extraClass="",options={}){
    const limit = Object.prototype.hasOwnProperty.call(options,"limit") ? options.limit : 12;
    const layout = getCastLayoutSetting();
    const rows = layout === "grid" ? renderV2ActorGridHTML(actors,limit) : renderV2ActorListHTML(actors,limit);

    if(!rows){
        return "";
    }

    return `
        <div class="modal-section v2-clean-section v2-actor-list-section ${escapeHTML(extraClass)} v2-cast-layout-${escapeHTML(layout)}">
            <h3 class="modal-section-heading">${escapeHTML(title)}</h3>
            <div class="${layout === "grid" ? "v2-actor-grid" : "v2-actor-list"}">${rows}</div>
        </div>
    `;
}

function getV2EpisodeCreditGroups(show,seasonNumber,episodeNumber){
    const key = `${Number(seasonNumber)}-${Number(episodeNumber)}`;
    const guestStars = show && show._episode_guest_stars && Array.isArray(show._episode_guest_stars[key])
    ? show._episode_guest_stars[key]
    : [];
    const cast = show && show._episode_cast_credits && Array.isArray(show._episode_cast_credits[key])
    ? show._episode_cast_credits[key]
    : [];

    return {guestStars,cast};
}

function renderV2EpisodeActorsHTML(show,seasonNumber,episodeNumber){
    const credits = getV2EpisodeCreditGroups(show,seasonNumber,episodeNumber);

    return [
        renderV2ActorListSectionHTML("Guest Stars",credits.guestStars,"v2-episode-guest-stars-section",{limit:null}),
        renderV2ActorListSectionHTML("Cast",credits.cast,"v2-episode-cast-section",{limit:null})
    ].filter(Boolean).join("");
}

function v2GetEpisodeDetailsObject(show,seasonNumber,episodeNumber){
    const key = `${Number(seasonNumber)}-${Number(episodeNumber)}`;
    const details = getEpisodeData(show,seasonNumber,episodeNumber) || {};
    const v2Details = show && show._episode_v2_details && show._episode_v2_details[key]
    ? show._episode_v2_details[key]
    : {};

    return {
        ...details,
        ...v2Details,
        external_ids:v2Details.external_ids || details.external_ids || null
    };
}

function renderV2EpisodeLinksHTML(show,seasonNumber,episodeNumber,episodeData){
    const ids = episodeData && episodeData.external_ids ? episodeData.external_ids : {};
    const links = [];

    if(ids.imdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://www.imdb.com/title/${escapeHTML(ids.imdb_id)}/" target="_blank" rel="noopener noreferrer">IMDb</a>`);
    }

    if(ids.tvdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://thetvdb.com/dereferrer/episode/${escapeHTML(ids.tvdb_id)}" target="_blank" rel="noopener noreferrer">TVDB</a>`);
    }

    if(show && show.tmdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://www.themoviedb.org/tv/${escapeHTML(show.tmdb_id)}/season/${escapeHTML(seasonNumber)}/episode/${escapeHTML(episodeNumber)}" target="_blank" rel="noopener noreferrer">TMDB</a>`);
    }

    if(!links.length){
        return "";
    }

    return `<div class="v2-episode-links-line v2-show-action-line">${links.map((item,index)=>{
        return `${index > 0 ? `<span class="modal-meta-separator">•</span>` : ""}${item}`;
    }).join("")}</div>`;
}

function attachV2ShowModalEvents(show){
    document.querySelectorAll("[data-v2-similar-open]").forEach(button=>{
        button.addEventListener("click",async function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            event.stopPropagation();
            const id = this.getAttribute("data-v2-similar-open");
            await openShowDetailsPage(id,{showName:this.dataset.v2SimilarName || ""});
        });
    });

    attachV2RailScrollEvents();
}

function attachV2RailScrollEvents(){
    document.querySelectorAll("[data-v2-rail-scroll]").forEach(button=>{
        button.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();

            const section = this.closest(".v2-rail-section");
            const rail = section ? section.querySelector(".v2-horizontal-rail") : null;

            if(!rail){
                return;
            }

            const direction = this.getAttribute("data-v2-rail-scroll") === "left" ? -1 : 1;
            const amount = Math.max(260,Math.floor(rail.clientWidth * 0.85));
            rail.scrollBy({left:direction * amount,behavior:"smooth"});
        });
    });
}

function renderShowDetailsPagePreservingScroll(show){
    const page = document.getElementById("show-detail-page");
    const scrollTop = page ? page.scrollTop : 0;

    renderShowDetailsPage(show,{preview:!(DATA.shows && DATA.shows[String(show && show.tmdb_id)])});

    if(page){
        requestAnimationFrame(()=>{
            page.scrollTop = scrollTop;
        });
    }
}

function renderPersonSilhouettePlaceholderHTML(className="person-silhouette-placeholder"){
    const cleanClass = String(className || "person-silhouette-placeholder").trim() || "person-silhouette-placeholder";
    return `
        <div class="${escapeHTML(cleanClass)} person-silhouette-placeholder" aria-hidden="true">
            <svg viewBox="0 0 64 64" focusable="false" role="img">
                <path class="person-silhouette-head" d="M32 30c7.18 0 13-5.82 13-13S39.18 4 32 4 19 9.82 19 17s5.82 13 13 13Z"></path>
                <path class="person-silhouette-body" d="M10 60c1.8-13.05 10.4-22 22-22s20.2 8.95 22 22H10Z"></path>
            </svg>
        </div>
    `;
}

function formatMovieReleaseDate(dateString){
    const clean = String(dateString || "").trim();
    if(!clean || clean === "Unknown"){
        return "Unknown";
    }
    const date = new Date(clean);
    if(Number.isNaN(date.getTime())){
        return clean;
    }
    return date.toLocaleDateString("en-GB",{
        day:"2-digit",
        month:"short",
        year:"numeric"
    });
}

function getShowDetailActiveTab(show){
    const id = String(show && show.tmdb_id ? show.tmdb_id : selectedShowId || "");
    const tab = activeShowDetailsTabs && activeShowDetailsTabs[id] ? activeShowDetailsTabs[id] : "Info";
    return ["Info","Episodes"].includes(tab) ? tab : "Info";
}

function getCountryFlag(code){
    const iso = String(code || "").trim().toUpperCase();
    if(!/^[A-Z]{2}$/.test(iso)){
        return "";
    }
    return iso.replace(/./g,char=>String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getCountryName(code){
    const iso = String(code || "").trim().toUpperCase();
    if(!iso){
        return "Unknown";
    }
    try{
        if(typeof Intl !== "undefined" && Intl.DisplayNames){
            const names = new Intl.DisplayNames(["en"],{type:"region"});
            return names.of(iso) || iso;
        }
    }catch(error){}
    return iso;
}

function getCountryLabel(code){
    const flag = getCountryFlag(code);
    const name = getCountryName(code);
    return `${flag ? flag + " " : ""}${name}`;
}

function renderV2CrewMemberRows(people,fallbackRole="",media="tv"){
    return (Array.isArray(people) ? people : []).map(person=>{
        const routeRole = getCrewRouteRole(person,fallbackRole);
        const photo = person.profile_path
        ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(person.profile_path,"w185"))}" alt="">`
        : renderPersonSilhouettePlaceholderHTML("v2-actor-placeholder");

        const personId = Number(person && person.id || 0);
        const personName = person.name || "Unknown";
        const cleanMedia = media === "movie" ? "movie" : "tv";
        const route = routeRole && personId > 0 && typeof getPersonDetailRoute === "function" ? getPersonDetailRoute(routeRole,personId,personName,cleanMedia) : "";
        const openTag = route
        ? `<a class="v2-actor-list-row v2-person-card-link" href="${escapeHTML(route)}" data-person-role="${escapeHTML(routeRole)}" data-person-media="${escapeHTML(cleanMedia)}" data-person-id="${escapeHTML(personId)}" data-person-name="${escapeHTML(personName)}">`
        : `<div class="v2-actor-list-row">`;
        const closeTag = route ? "</a>" : "</div>";

        return `
            ${openTag}
                <div class="v2-actor-list-photo">${photo}</div>
                <div class="v2-actor-list-text">
                    <div class="v2-actor-name">${escapeHTML(personName)}</div>
                    <div class="v2-actor-role">${escapeHTML(person.job || "Crew")}${person.episode_count ? ` • ${Number(person.episode_count)} episodes` : ""}</div>
                </div>
            ${closeTag}
        `;
    }).join("");
}

function renderShowModal(show){
    renderShowDetailsPage(show,{preview:!(DATA.shows && DATA.shows[String(show && show.tmdb_id)])});
}

function stopNestedSeasonAction(event){
    event.preventDefault();
    event.stopPropagation();
}



function attachShowDetailsPageEvents(show,isTracked){
    const backButton = document.getElementById("show-page-back-button");
    if(backButton){
        backButton.addEventListener("click",closeShowDetailsPage);
    }

    document.querySelectorAll(".show-page-add-status-button").forEach(button=>{
        button.addEventListener("click",async function(){
            if(this.disabled){
                return;
            }
            this.disabled = true;
            try{
                await addShowDetailPreviewWithStatus(show.tmdb_id,this.dataset.addStatus);
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }
        });
    });

    document.querySelectorAll(".modal-status-button[data-status]").forEach(button=>{
        button.addEventListener("click",function(){
            updateShowStatus(show.tmdb_id,this.dataset.status);
        });
    });

    document.querySelectorAll(".show-detail-tab").forEach(button=>{
        button.addEventListener("click",function(){
            activeShowDetailsTabs[String(show.tmdb_id)] = this.dataset.showDetailTab || "Info";
            renderShowDetailsPagePreservingScroll(show);
        });
    });

    document.querySelectorAll(".show-info-subtab").forEach(button=>{
        button.addEventListener("click",function(){
            const showId = String(show.tmdb_id || "");
            activeShowInfoTabs[showId] = this.dataset.showInfoTab || "Cast";
            renderShowDetailsPagePreservingScroll(show);
        });
    });

    document.querySelectorAll(".show-genre-link[data-genre-name]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openGenrePage !== "function" || !isPlainAppLinkClick(event)){
                return;
            }
            event.preventDefault();
            openGenrePage(this.dataset.genreKey || this.dataset.genreName || this.textContent || "",{media:this.dataset.genreMedia || "tv"});
        });
    });

    document.querySelectorAll("[data-discovery-type][data-discovery-value]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openDiscoveryFilterPage !== "function" || !isPlainAppLinkClick(event)){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openDiscoveryFilterPage(this.dataset.discoveryType,this.dataset.discoveryValue,{name:this.dataset.discoveryName || "",routeLabel:this.dataset.discoveryLabel || "",media:this.dataset.discoveryMedia || ""});
        });
    });

    document.querySelectorAll(".v2-person-link[data-person-role][data-person-id]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openPersonPage !== "function" || !isPlainAppLinkClick(event)){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openPersonPage(this.dataset.personRole,this.dataset.personId,{personName:this.dataset.personName || this.textContent || "",media:this.dataset.personMedia || "tv"});
        });
    });

    document.querySelectorAll(".v2-person-card-link[data-person-role][data-person-id]").forEach(card=>{
        card.addEventListener("click",function(event){
            if(typeof openPersonPage !== "function" || !isPlainAppLinkClick(event)){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openPersonPage(this.dataset.personRole,this.dataset.personId,{personName:this.dataset.personName || this.textContent || "",media:this.dataset.personMedia || "tv"});
        });
    });

    document.querySelectorAll(".season-toggle-area[data-season]").forEach(toggle=>{
        const activate = function(event){
            if(event){
                event.preventDefault();
                event.stopPropagation();
            }
            toggleSeason(show.tmdb_id,Number(this.dataset.season));
        };

        toggle.addEventListener("click",activate);
        toggle.addEventListener("keydown",function(event){
            if(event.key === "Enter" || event.key === " "){
                activate.call(this,event);
            }
        });
    });

    document.querySelectorAll(".season-all-button").forEach(button=>{
        ["pointerdown","pointerup","mousedown","mouseup","touchstart"].forEach(eventName=>{
            button.addEventListener(eventName,function(event){
                event.stopPropagation();
            });
        });

        button.addEventListener("click",async function(event){
            stopNestedSeasonAction(event);

            if(this.disabled || !isTracked){
                return;
            }

            this.disabled = true;
            try{
                if(!this.classList.contains("checked")){
                    await playCheckSuccessAnimation(this);
                }
                await markSeasonWatched(show.tmdb_id,Number(this.dataset.season));
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }
        });
    });

    document.querySelectorAll(".episode-check-button").forEach(button=>{
        ["pointerdown","pointerup","mousedown","mouseup","touchstart"].forEach(eventName=>{
            button.addEventListener(eventName,function(event){
                event.stopPropagation();
            });
        });

        button.addEventListener("click",async function(event){
            stopNestedSeasonAction(event);

            if(this.disabled || !isTracked){
                return;
            }

            const currentlyWatched = this.dataset.watched === "true";
            this.disabled = true;
            try{
                if(!currentlyWatched){
                    await playCheckSuccessAnimation(this);
                }
                await updateEpisodeWatched(show.tmdb_id,Number(this.dataset.season),Number(this.dataset.episode),!currentlyWatched);
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }
        });
    });

    document.querySelectorAll(".episode-row[data-season][data-episode]").forEach(row=>{
        const warmEpisodeDetails = function(){
            if(typeof prefetchEpisodeV2Details === "function"){
                prefetchEpisodeV2Details(show.tmdb_id,Number(row.dataset.season),Number(row.dataset.episode));
            }
        };

        row.addEventListener("pointerenter",warmEpisodeDetails,{once:true});
        row.addEventListener("focusin",warmEpisodeDetails,{once:true});

        const routeLink = row.querySelector(".app-route-card-link");
        if(routeLink){
            routeLink.addEventListener("click",function(event){
                if(!isPlainAppLinkClick(event)){ return; }
                event.preventDefault();
                openEpisodeModal(show.tmdb_id,Number(row.dataset.season),Number(row.dataset.episode),{backToShow:true});
            });
        }
    });

    const favoriteButton = document.querySelector("[data-show-favorite-button]");
    if(favoriteButton){
        favoriteButton.addEventListener("click",async function(){
            if(this.disabled){
                return;
            }
            this.disabled = true;
            try{
                await toggleFavoriteShow(show.tmdb_id);
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }
        });
    }

    const removeButton = document.getElementById("remove-show-button");
    if(removeButton){
        removeButton.addEventListener("click",function(){
            removeShow(show.tmdb_id);
        });
    }
}

function getEpisodeCountForNavigation(show,seasonNumber){

    const seasonKey = String(seasonNumber);

    if(
        show._episode_list &&
        Array.isArray(show._episode_list[seasonKey]) &&
        show._episode_list[seasonKey].length > 0
    ){

        return Math.max(...show._episode_list[seasonKey].map(ep=>Number(ep.episode_number || 0)));

    }

    if(show._season_episodes && Number(show._season_episodes[seasonKey]) > 0){
        return Number(show._season_episodes[seasonKey]);
    }

    const detailKeys = Object.keys(show._episode_details || {})
    .map(key=>{
        const parts = key.split("-");
        return {
            season:Number(parts[0]),
            episode:Number(parts[1])
        };
    })
    .filter(item=>item.season === Number(seasonNumber) && item.episode > 0)
    .map(item=>item.episode);

    if(detailKeys.length > 0){
        return Math.max(...detailKeys);
    }

    return 0;

}



function getPreviousEpisodeTarget(show,seasonNumber,episodeNumber){

    const season = Number(seasonNumber);
    const episode = Number(episodeNumber);

    if(episode > 1){
        return {season:season,episode:episode - 1};
    }

    for(let s = season - 1; s >= 1; s--){

        const count = getEpisodeCountForNavigation(show,s);

        if(count > 0){
            return {season:s,episode:count};
        }

    }

    return null;

}



function getNextEpisodeTarget(show,seasonNumber,episodeNumber){

    const season = Number(seasonNumber);
    const episode = Number(episodeNumber);
    const currentSeasonCount = getEpisodeCountForNavigation(show,season);

    if(currentSeasonCount > 0 && episode < currentSeasonCount){
        return {season:season,episode:episode + 1};
    }

    const maxSeason = Math.max(Number(show.number_of_seasons || season),season);

    for(let s = season + 1; s <= maxSeason; s++){

        const count = getEpisodeCountForNavigation(show,s);

        if(count > 0 || !show._episode_list || !Array.isArray(show._episode_list[String(s)])){
            return {season:s,episode:1};
        }

    }

    return null;

}



function renderEpisodeModal(show,seasonNumber,episodeNumber,context={}){

    const content = document.getElementById("episode-detail-content");

    if(!content){
        return;
    }

    const isDiscoverPreview = context && context.discoverPreview;
    const episodeData = v2GetEpisodeDetailsObject(show,seasonNumber,episodeNumber);
    const historyEntry = getEpisodeHistoryEntry(show.tmdb_id,seasonNumber,episodeNumber);
    const isWatched = isEpisodeWatched(show,seasonNumber,episodeNumber);
    const aired = isEpisodeLoggable(episodeData,show,seasonNumber);

    const episodeTitle = episodeData.name || "Untitled Episode";
    const episodeCode = `S${seasonNumber}E${String(episodeNumber).padStart(2,"0")}`;
    const imagePath = episodeData.still_path || show.backdrop_path || "";
    const backdrop = imagePath
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), ${trackerBackgroundImage(imagePath,"original")}`
    : `linear-gradient(to top, #080808 0%, #141414 100%)`;

    const airDateText = episodeData.air_date
    ? formatAirDate(episodeData.air_date,episodeData,show)
    : "Unknown";
    const runtimeText = episodeData.runtime ? `${episodeData.runtime} min` : "";
    const episodeRating = Number(episodeData.vote_average || 0);
    const episodeRatingHTML = episodeRating > 0
    ? `<span class="tmdb-rating-group"><span class="tmdb-rating-inline">${episodeRating.toFixed(1)}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>`
    : "";
    const showRoute = typeof getShowDetailRoute === "function"
    ? getShowDetailRoute(show.tmdb_id,show.title || show.name || "")
    : "/app/list/watching";

    const watchedText = isDiscoverPreview
    ? "Not in library"
    : historyEntry && historyEntry.watched_at
    ? formatEpisodeWatchedDate(historyEntry.watched_at)
    : "Not watched";

    const statusText = isDiscoverPreview
    ? "Preview"
    : isWatched
    ? "Watched"
    : aired
    ? "Unwatched"
    : "Not aired yet";

    const canToggle = !isDiscoverPreview && (aired || isWatched);
    const statusClass = isWatched ? "watched" : "";
    const previousEpisodeTarget = getPreviousEpisodeTarget(show,seasonNumber,episodeNumber);
    const nextEpisodeTarget = getNextEpisodeTarget(show,seasonNumber,episodeNumber);
    const externalLinksHTML = renderV2EpisodeLinksHTML(show,seasonNumber,episodeNumber,episodeData);

    content.innerHTML = `
        <div class="episode-detail-page-inner episode-page-rebuild">
            <div class="show-page-hero-shell episode-page-hero-shell">
                <button class="show-page-back-button episode-page-back-button" id="episode-open-show-button" type="button" aria-label="Back to show">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>

                <div class="modal-hero show-detail-hero show-page-hero episode-page-hero" style='background-image:${backdrop}'></div>

                <div class="show-page-identity-row episode-page-identity-row">
                    <div class="show-page-hero-content episode-page-hero-content">
                        <div class="modal-title show-page-title episode-page-title">${escapeHTML(episodeTitle)}</div>
                        <div class="modal-meta modal-meta-under-status show-page-meta-line episode-page-meta-line">
                            <a class="show-detail-entity-link episode-page-show-link" href="${escapeHTML(showRoute)}">${escapeHTML(show.title || "Untitled Show")}</a>
                            <span class="modal-meta-separator">•</span>
                            <span>${escapeHTML(episodeCode)}</span>
                            <span class="modal-meta-separator">•</span>
                            <span>${escapeHTML(airDateText)}</span>
                            ${runtimeText ? `<span class="modal-meta-separator">•</span><span>${escapeHTML(runtimeText)}</span>` : ""}
                            ${episodeRatingHTML ? `<span class="modal-meta-separator">•</span>${episodeRatingHTML}` : ""}
                        </div>

                    </div>
                </div>
            </div>

            <div class="modal-body show-page-body episode-page-body">
                <div class="episode-page-primary-row">
                    <section class="modal-section show-info-synopsis-section episode-page-info-section">
                        <h3 class="modal-section-heading">Episode Info</h3>
                        <div class="modal-overview">${escapeHTML(episodeData.overview || "No episode overview available.")}</div>
                        ${externalLinksHTML}
                    </section>

                    <section class="episode-page-actions-section" aria-label="Episode actions">
                        <div class="show-page-actions-wrap episode-detail-actions episode-page-actions">
                            <div class="modal-status-buttons show-page-status-buttons episode-page-action-buttons">
                                ${canToggle ? `<button class="modal-status-button episode-page-action-button ${isWatched ? "active" : ""}" id="episode-toggle-watched-button" type="button">${isWatched ? "MARK UNWATCHED" : "MARK WATCHED"}</button>` : ""}
                                ${previousEpisodeTarget ? `<a class="modal-status-button episode-page-action-button episode-page-nav-button" id="episode-prev-button" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,previousEpisodeTarget.season,previousEpisodeTarget.episode,show.title || show.name || "") : "/app/list/watching")}">PREVIOUS EPISODE</a>` : ""}
                                ${nextEpisodeTarget ? `<a class="modal-status-button episode-page-action-button episode-page-nav-button" id="episode-next-button" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,nextEpisodeTarget.season,nextEpisodeTarget.episode,show.title || show.name || "") : "/app/list/watching")}">NEXT EPISODE</a>` : ""}
                            </div>
                        </div>
                    </section>
                </div>

                <section class="modal-section episode-page-status-section">
                    <div class="episode-page-status-grid">
                        <div class="show-progress-card episode-page-status-card ${statusClass}">
                            <div class="episode-detail-label">Status</div>
                            <div class="episode-detail-value">${escapeHTML(statusText)}</div>
                        </div>
                        <div class="show-progress-card episode-page-status-card">
                            <div class="episode-detail-label">Watched</div>
                            <div class="episode-detail-value">${escapeHTML(watchedText)}</div>
                        </div>
                    </div>
                </section>

                ${renderV2EpisodeActorsHTML(show,seasonNumber,episodeNumber)}
            </div>
        </div>
    `;

    const openShowButton = document.getElementById("episode-open-show-button");

    if(openShowButton){
        openShowButton.addEventListener("click",function(){
            if(!expandedSeasons[String(show.tmdb_id)]){
                expandedSeasons[String(show.tmdb_id)] = {};
            }

            expandedSeasons[String(show.tmdb_id)][String(seasonNumber)] = true;
            closeEpisodeDetailsPage();
        });
    }

    const previousButton = document.getElementById("episode-prev-button");

    if(previousButton && previousEpisodeTarget){
        previousButton.addEventListener("click",function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();

            if(isDiscoverPreview){
                openEpisodeModal(
                    show.tmdb_id,
                    previousEpisodeTarget.season,
                    previousEpisodeTarget.episode,
                    {backToShow:true,discoverPreview:true,replaceInPlace:true,replaceRoute:true}
                );
                return;
            }

            openEpisodeModal(
                show.tmdb_id,
                previousEpisodeTarget.season,
                previousEpisodeTarget.episode,
                {backToShow:true,replaceInPlace:true,replaceRoute:true}
            );
        });
    }

    const nextButton = document.getElementById("episode-next-button");

    if(nextButton && nextEpisodeTarget){
        nextButton.addEventListener("click",function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();

            if(isDiscoverPreview){
                openEpisodeModal(
                    show.tmdb_id,
                    nextEpisodeTarget.season,
                    nextEpisodeTarget.episode,
                    {backToShow:true,discoverPreview:true,replaceInPlace:true,replaceRoute:true}
                );
                return;
            }

            openEpisodeModal(
                show.tmdb_id,
                nextEpisodeTarget.season,
                nextEpisodeTarget.episode,
                {backToShow:true,replaceInPlace:true,replaceRoute:true}
            );
        });
    }

    const toggleButton = document.getElementById("episode-toggle-watched-button");

    if(toggleButton){
        toggleButton.addEventListener("click",async function(){
            if(this.disabled){
                return;
            }

            this.disabled = true;

            try{
                if(!isWatched){
                    await playCheckSuccessAnimation(this);
                }

                await updateEpisodeWatched(
                    show.tmdb_id,
                    seasonNumber,
                    episodeNumber,
                    !isWatched
                );
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }
        });
    }
}



function formatEpisodeWatchedDate(dateString){

    if(!dateString){
        return "Not watched";
    }

    const date = new Date(dateString);

    if(Number.isNaN(date.getTime())){
        return "Not watched";
    }

    return date.toLocaleDateString(undefined,{
        year:"numeric",
        month:"short",
        day:"numeric"
    }) + " • " + date.toLocaleTimeString(undefined,{
        hour:"numeric",
        minute:"2-digit"
    });

}



function closeStatusPopup(){

    pendingShow = null;

    document.getElementById("status-popup").style.display = "none";

}





let toastTimer = null;

function showToast(message,options={}){

    const toast = document.getElementById("toast");

    if(toastTimer){
        clearTimeout(toastTimer);
    }

    toast.innerHTML = "";

    const text = document.createElement("span");
    text.className = "toast-message";
    text.textContent = message;
    toast.appendChild(text);

    if(options.actionLabel && typeof options.onAction === "function"){

        const button = document.createElement("button");
        button.className = "toast-action";
        button.type = "button";
        button.textContent = options.actionLabel;

        button.addEventListener("click",async function(){

            if(toastTimer){
                clearTimeout(toastTimer);
            }

            toast.style.display = "none";
            await options.onAction();

        });

        toast.appendChild(button);

    }

    toast.style.display = "flex";

    toastTimer = setTimeout(()=>{
        toast.style.display = "none";
    },options.duration || 2200);

}

function getAppDialogRoot(){

    let root = document.getElementById("app-dialog-root");

    if(root){
        return root;
    }

    root = document.createElement("div");
    root.id = "app-dialog-root";
    document.body.appendChild(root);

    return root;

}



function closeAppDialog(resolve,value){

    const root = getAppDialogRoot();
    root.innerHTML = "";

    if(typeof resolve === "function"){
        resolve(value);
    }

}



function showAppDialog(options={}){

    return new Promise(resolve=>{

        const root = getAppDialogRoot();
        root.innerHTML = "";

        const overlay = document.createElement("div");
        overlay.className = "app-dialog-overlay";
        overlay.tabIndex = -1;

        const box = document.createElement("div");
        box.className = "app-dialog";

        const title = document.createElement("h2");
        title.textContent = options.title || "Confirm";
        box.appendChild(title);

        if(options.message){
            const message = document.createElement("div");
            message.className = "app-dialog-message";
            message.textContent = String(options.message);
            box.appendChild(message);
        }

        let input = null;

        if(options.type === "prompt"){
            input = document.createElement("input");
            input.className = "app-dialog-input";
            input.type = "text";
            input.placeholder = options.placeholder || "";
            box.appendChild(input);
        }

        const actions = document.createElement("div");
        actions.className = "app-dialog-actions";

        if(options.type !== "alert"){
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "app-dialog-button secondary";
            cancelButton.textContent = options.cancelLabel || "Cancel";
            cancelButton.addEventListener("click",function(){
                closeAppDialog(resolve,options.type === "prompt" ? null : false);
            });
            actions.appendChild(cancelButton);
        }

        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = options.danger ? "app-dialog-button danger" : "app-dialog-button primary";
        confirmButton.textContent = options.confirmLabel || "OK";
        confirmButton.addEventListener("click",function(){

            if(options.type === "prompt"){
                closeAppDialog(resolve,input ? input.value : "");
                return;
            }

            closeAppDialog(resolve,true);

        });
        actions.appendChild(confirmButton);

        box.appendChild(actions);
        overlay.appendChild(box);
        root.appendChild(overlay);

        const focusTarget = input || confirmButton;

        requestAnimationFrame(()=>{
            focusTarget.focus();
        });

        overlay.addEventListener("keydown",function(event){

            if(event.key === "Escape"){
                closeAppDialog(resolve,options.type === "prompt" ? null : false);
            }

            if(event.key === "Enter" && input){
                closeAppDialog(resolve,input.value);
            }

        });

    });

}



function showAppConfirm(options={}){
    return showAppDialog({...options,type:"confirm"});
}



function showAppAlert(options={}){
    return showAppDialog({...options,type:"alert"});
}



function showAppPrompt(options={}){
    return showAppDialog({...options,type:"prompt"});
}





function groupHistoryByDate(entries){

    const groups = [];
    const lookup = new Map();

    entries.forEach(entry=>{

        const label = getHistoryGroupLabel(entry.watched_at);
        let group = lookup.get(label);

        if(!group){

            group = {
                label:label,
                entries:[]
            };

            lookup.set(label,group);
            groups.push(group);

        }

        group.entries.push(entry);

    });

    return groups;

}





function getHistoryGroupLabel(dateString){

    const date = new Date(dateString);

    const today = new Date();
    today.setHours(0,0,0,0);

    const target = new Date(date);
    target.setHours(0,0,0,0);

    const diffDays = Math.round(
        (today - target) / (1000 * 60 * 60 * 24)
    );

    if(diffDays === 0){
        return "Today";
    }

    if(diffDays === 1){
        return "Yesterday";
    }

    if(diffDays > 1 && diffDays < 6){

        return date.toLocaleDateString(undefined,{
            weekday:"long",
            month:"long",
            day:"numeric"
        });

    }

    return date.toLocaleDateString(undefined,{
        month:"long",
        day:"numeric"
    });

}





function formatHistoryRelative(dateString){

    const date = new Date(dateString);
    const now = new Date();

    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if(diffMinutes < 1){
        return "Just now";
    }

    if(diffMinutes < 60){
        return diffMinutes + "m ago";
    }

    if(diffHours < 24){
        return diffHours + "h ago";
    }

    if(diffDays === 1){
        return "Yesterday";
    }

    if(diffDays < 6){
        return diffDays + " days ago";
    }

    return date.toLocaleDateString(undefined,{
        month:"long",
        day:"numeric"
    });

}




function getProfileInitial(username){

    const text = String(username || "Username").trim();
    const match = text.match(/[A-Za-z0-9]/);

    return match ? match[0].toUpperCase() : "U";

}


function getPresetAvatarSVG(preset){

    const commonStart = `<svg viewBox="0 0 100 100" aria-hidden="true">`;
    const commonEnd = `</svg>`;

    if(preset === "silhouette-2"){
        return commonStart + `
            <rect width="100" height="100" fill="#080808"/>
            <circle cx="50" cy="35" r="19" fill="none" stroke="#e2e2e2" stroke-width="7"/>
            <path d="M18 100c2-27 14-42 32-42s30 15 32 42" fill="none" stroke="#e2e2e2" stroke-width="8"/>
        ` + commonEnd;
    }

    if(preset === "silhouette-3"){
        return commonStart + `
            <rect width="100" height="100" fill="#080808"/>
            <rect x="31" y="16" width="38" height="38" rx="14" fill="#d8d8d8"/>
            <path d="M18 100V82c0-15 12-27 27-27h10c15 0 27 12 27 27v18Z" fill="#9a9a9a"/>
            <circle cx="43" cy="35" r="3" fill="#333"/>
            <circle cx="57" cy="35" r="3" fill="#333"/>
        ` + commonEnd;
    }

    if(preset === "silhouette-4"){
        return commonStart + `
            <rect width="100" height="100" fill="#080808"/>
            <circle cx="50" cy="36" r="21" fill="#dcdcdc"/>
            <path d="M14 100c4-29 18-43 36-43s32 14 36 43" fill="#dcdcdc"/>
            <rect x="28" y="30" width="44" height="12" rx="6" fill="#3a3a3a"/>
        ` + commonEnd;
    }

    return commonStart + `
        <rect width="100" height="100" fill="#080808"/>
        <circle cx="50" cy="35" r="20" fill="#e0e0e0"/>
        <path d="M14 100c3-29 18-44 36-44s33 15 36 44" fill="#e0e0e0"/>
    ` + commonEnd;

}

function getProfileAvatarInnerHTML(profile){

    const data = profile || {};
    const type = data.avatar_type || "initial";

    if(type === "upload" && data.avatar_data){
        return `<img class="profile-avatar-image" src="${escapeHTML(data.avatar_data)}" alt="Profile avatar">`;
    }

    if(type === "preset"){
        return `<div class="profile-avatar-preset">${getPresetAvatarSVG(data.avatar_preset || "silhouette-1")}</div>`;
    }

    return `<span class="profile-avatar-initial">${escapeHTML(getProfileInitial(data.username))}</span>`;

}


function getProfileHeaderPreset(profile){

    const allowed = ["default","blue","purple","green","amber","monochrome"];
    const preset = String((profile && profile.header_preset) || "default");

    return allowed.includes(preset) ? preset : "default";

}


function getProfileHeaderClass(profile){

    const data = profile || {};

    if(data.header_type === "upload" && data.header_image){
        return "profile-header-upload";
    }

    return "profile-header-" + getProfileHeaderPreset(data);

}


function getProfileHeaderImageLayerHTML(profile){

    const data = profile || {};

    if(data.header_type !== "upload" || !data.header_image){
        return "";
    }

    return `
        <div class="profile-header-image-layer" aria-hidden="true">
            <img src="${escapeHTML(data.header_image)}" alt="">
        </div>
        <div class="profile-header-image-overlay" aria-hidden="true"></div>
    `;

}


function getProfileHeaderPreviewHTML(profile){

    const data = profile || {};

    return `
        <div class="settings-header-preview ${getProfileHeaderClass(data)}" id="settings-header-preview">
            ${getProfileHeaderImageLayerHTML(data)}
            <div class="settings-header-preview-content">
                <div class="settings-header-mini-avatar">
                    ${getProfileAvatarInnerHTML(data)}
                </div>
                <span>${escapeHTML(data.username || "Username")}</span>
            </div>
        </div>
    `;

}


function createProfileSettingsDraft(){

    ensureProfileData();

    const originalPresets = [
        "silhouette-1",
        "silhouette-2",
        "silhouette-3",
        "silhouette-4"
    ];

    const savedPreset = originalPresets.includes(DATA.profile.avatar_preset)
    ? DATA.profile.avatar_preset
    : "silhouette-1";

    return {
        username:DATA.profile.username || "Username",
        avatar_type:DATA.profile.avatar_type || "initial",
        avatar_preset:savedPreset,
        avatar_data:DATA.profile.avatar_data || "",
        header_type:DATA.profile.header_type || "preset",
        header_preset:getProfileHeaderPreset(DATA.profile),
        header_image:DATA.profile.header_image || ""
    };

}


function updateProfileSettingsPreview(){

    if(!profileSettingsDraft){
        return;
    }

    const preview = document.getElementById("settings-avatar-preview");

    if(preview){
        preview.innerHTML = getProfileAvatarInnerHTML(profileSettingsDraft);
    }

    const headerPreview = document.getElementById("profile-header-preview-wrap");

    if(headerPreview){
        headerPreview.innerHTML = getProfileHeaderPreviewHTML(profileSettingsDraft);
    }

    document.querySelectorAll(".avatar-preset-button").forEach(button=>{

        const type = button.dataset.avatarType;
        const preset = button.dataset.avatarPreset || "";
        const isActive = profileSettingsDraft.avatar_type === type && (
            type !== "preset" || profileSettingsDraft.avatar_preset === preset
        );

        button.classList.toggle("active",isActive);

    });

    document.querySelectorAll(".profile-header-preset-button").forEach(button=>{

        const preset = button.dataset.profileHeaderPreset || "default";
        const isActive = profileSettingsDraft.header_type !== "upload" &&
        profileSettingsDraft.header_preset === preset;

        button.classList.toggle("active",isActive);

    });

}


function openAvatarFilePicker(){

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";

    input.addEventListener("change",function(){

        const file = input.files && input.files[0];

        if(!file){
            return;
        }

        const allowedTypes = ["image/jpeg","image/png","image/webp"];

        if(!allowedTypes.includes(file.type)){
            showToast("Use a JPG, PNG, or WebP image");
            return;
        }

        if(file.size > 5 * 1024 * 1024){
            showToast("Avatar image must be 5 MB or smaller");
            return;
        }

        const reader = new FileReader();

        reader.addEventListener("load",function(){
            openAvatarCropModal(String(reader.result || ""));
        });

        reader.addEventListener("error",function(){
            showToast("Could not read that image");
        });

        reader.readAsDataURL(file);

    });

    input.click();

}


function openAvatarCropModal(source){

    closeAvatarCropModal();

    const image = new Image();

    image.addEventListener("load",function(){

        const overlay = document.createElement("div");
        overlay.className = "avatar-crop-overlay";
        overlay.id = "avatar-crop-overlay";

        overlay.innerHTML = `
            <div class="avatar-crop-dialog">
                <div class="avatar-crop-header">
                    <h2>CROP AVATAR</h2>
                    <button type="button" class="avatar-crop-close" id="avatar-crop-close">×</button>
                </div>

                <div class="avatar-crop-canvas-wrap">
                    <canvas id="avatar-crop-canvas" width="512" height="512"></canvas>
                    <div class="avatar-crop-circle-guide"></div>
                </div>

                <label class="avatar-crop-zoom-label" for="avatar-crop-zoom">Zoom</label>
                <input id="avatar-crop-zoom" class="avatar-crop-zoom" type="range" min="1" max="3" step="0.01" value="1">

                <p class="avatar-crop-note">Drag the image to position it inside the circle.</p>

                <div class="avatar-crop-actions">
                    <button type="button" class="episode-detail-action-button" id="avatar-crop-cancel">Cancel</button>
                    <button type="button" class="episode-detail-action-button primary" id="avatar-crop-use">Use Avatar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const canvas = document.getElementById("avatar-crop-canvas");
        const context = canvas.getContext("2d");

        avatarCropState = {
            image:image,
            canvas:canvas,
            context:context,
            zoom:1,
            offsetX:0,
            offsetY:0,
            dragging:false,
            lastX:0,
            lastY:0
        };

        drawAvatarCrop();

        const zoomInput = document.getElementById("avatar-crop-zoom");

        zoomInput.addEventListener("input",function(){
            avatarCropState.zoom = Number(this.value || 1);
            clampAvatarCropOffsets();
            drawAvatarCrop();
        });

        canvas.addEventListener("pointerdown",function(event){
            avatarCropState.dragging = true;
            avatarCropState.lastX = event.clientX;
            avatarCropState.lastY = event.clientY;
            canvas.setPointerCapture(event.pointerId);
        });

        canvas.addEventListener("pointermove",function(event){

            if(!avatarCropState || !avatarCropState.dragging){
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const ratioX = canvas.width / rect.width;
            const ratioY = canvas.height / rect.height;

            avatarCropState.offsetX += (event.clientX - avatarCropState.lastX) * ratioX;
            avatarCropState.offsetY += (event.clientY - avatarCropState.lastY) * ratioY;
            avatarCropState.lastX = event.clientX;
            avatarCropState.lastY = event.clientY;

            clampAvatarCropOffsets();
            drawAvatarCrop();

        });

        canvas.addEventListener("pointerup",function(){
            if(avatarCropState){
                avatarCropState.dragging = false;
            }
        });

        canvas.addEventListener("pointercancel",function(){
            if(avatarCropState){
                avatarCropState.dragging = false;
            }
        });

        document.getElementById("avatar-crop-close").addEventListener("click",closeAvatarCropModal);
        document.getElementById("avatar-crop-cancel").addEventListener("click",closeAvatarCropModal);

        document.getElementById("avatar-crop-use").addEventListener("click",function(){

            if(!avatarCropState || !profileSettingsDraft){
                return;
            }

            drawAvatarCrop();

            const data = avatarCropState.canvas.toDataURL("image/webp",0.85);

            if(!data.startsWith("data:image/webp")){
                showToast("This browser could not create a WebP avatar");
                return;
            }

            profileSettingsDraft.avatar_type = "upload";
            profileSettingsDraft.avatar_data = data;
            closeAvatarCropModal();
            updateProfileSettingsPreview();

        });

        overlay.addEventListener("click",function(event){
            if(event.target === overlay){
                closeAvatarCropModal();
            }
        });

    });

    image.addEventListener("error",function(){
        showToast("That file is not a valid image");
    });

    image.src = source;

}


function getAvatarCropGeometry(){

    if(!avatarCropState){
        return null;
    }

    const state = avatarCropState;
    const canvasSize = state.canvas.width;
    const baseScale = Math.max(
        canvasSize / state.image.naturalWidth,
        canvasSize / state.image.naturalHeight
    );
    const scale = baseScale * state.zoom;
    const width = state.image.naturalWidth * scale;
    const height = state.image.naturalHeight * scale;

    return {
        width:width,
        height:height,
        x:(canvasSize - width) / 2 + state.offsetX,
        y:(canvasSize - height) / 2 + state.offsetY,
        maxX:Math.max(0,(width - canvasSize) / 2),
        maxY:Math.max(0,(height - canvasSize) / 2)
    };

}


function clampAvatarCropOffsets(){

    const geometry = getAvatarCropGeometry();

    if(!geometry || !avatarCropState){
        return;
    }

    avatarCropState.offsetX = Math.max(-geometry.maxX,Math.min(geometry.maxX,avatarCropState.offsetX));
    avatarCropState.offsetY = Math.max(-geometry.maxY,Math.min(geometry.maxY,avatarCropState.offsetY));

}


function drawAvatarCrop(){

    const geometry = getAvatarCropGeometry();

    if(!geometry || !avatarCropState){
        return;
    }

    const state = avatarCropState;
    state.context.clearRect(0,0,state.canvas.width,state.canvas.height);
    state.context.drawImage(
        state.image,
        geometry.x,
        geometry.y,
        geometry.width,
        geometry.height
    );

}


function closeAvatarCropModal(){

    const overlay = document.getElementById("avatar-crop-overlay");

    if(overlay){
        overlay.remove();
    }

    avatarCropState = null;

}


function openProfileHeaderFilePicker(){

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";

    input.addEventListener("change",function(){

        const file = input.files && input.files[0];

        if(!file){
            return;
        }

        const allowedTypes = ["image/jpeg","image/png","image/webp"];

        if(!allowedTypes.includes(file.type)){
            showToast("Use a JPG, PNG, or WebP image");
            return;
        }

        if(file.size > 10 * 1024 * 1024){
            showToast("Header image must be 10 MB or smaller");
            return;
        }

        const reader = new FileReader();

        reader.addEventListener("load",function(){
            openProfileHeaderCropModal(String(reader.result || ""));
        });

        reader.addEventListener("error",function(){
            showToast("Could not read that image");
        });

        reader.readAsDataURL(file);

    });

    input.click();

}


function openProfileHeaderCropModal(source){

    closeProfileHeaderCropModal();

    const image = new Image();

    image.addEventListener("load",function(){

        const overlay = document.createElement("div");
        overlay.className = "profile-header-crop-overlay";
        overlay.id = "profile-header-crop-overlay";

        overlay.innerHTML = `
            <div class="profile-header-crop-dialog">
                <div class="avatar-crop-header">
                    <h2>POSITION HEADER</h2>
                    <button type="button" class="avatar-crop-close" id="profile-header-crop-close">×</button>
                </div>

                <div class="profile-header-crop-canvas-wrap">
                    <canvas id="profile-header-crop-canvas" width="1600" height="500"></canvas>
                </div>

                <label class="avatar-crop-zoom-label" for="profile-header-crop-zoom">Zoom</label>
                <input id="profile-header-crop-zoom" class="avatar-crop-zoom" type="range" min="1" max="3" step="0.01" value="1">

                <p class="avatar-crop-note">Drag the image to position it inside the Profile header.</p>

                <div class="avatar-crop-actions">
                    <button type="button" class="episode-detail-action-button" id="profile-header-crop-cancel">Cancel</button>
                    <button type="button" class="episode-detail-action-button primary" id="profile-header-crop-use">Use Header</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const canvas = document.getElementById("profile-header-crop-canvas");
        const context = canvas.getContext("2d");

        profileHeaderCropState = {
            image:image,
            canvas:canvas,
            context:context,
            zoom:1,
            offsetX:0,
            offsetY:0,
            dragging:false,
            lastX:0,
            lastY:0
        };

        drawProfileHeaderCrop();

        const zoomInput = document.getElementById("profile-header-crop-zoom");

        zoomInput.addEventListener("input",function(){
            profileHeaderCropState.zoom = Number(this.value || 1);
            clampProfileHeaderCropOffsets();
            drawProfileHeaderCrop();
        });

        canvas.addEventListener("pointerdown",function(event){
            profileHeaderCropState.dragging = true;
            profileHeaderCropState.lastX = event.clientX;
            profileHeaderCropState.lastY = event.clientY;
            canvas.setPointerCapture(event.pointerId);
        });

        canvas.addEventListener("pointermove",function(event){

            if(!profileHeaderCropState || !profileHeaderCropState.dragging){
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const ratioX = canvas.width / rect.width;
            const ratioY = canvas.height / rect.height;

            profileHeaderCropState.offsetX += (event.clientX - profileHeaderCropState.lastX) * ratioX;
            profileHeaderCropState.offsetY += (event.clientY - profileHeaderCropState.lastY) * ratioY;
            profileHeaderCropState.lastX = event.clientX;
            profileHeaderCropState.lastY = event.clientY;

            clampProfileHeaderCropOffsets();
            drawProfileHeaderCrop();

        });

        canvas.addEventListener("pointerup",function(){
            if(profileHeaderCropState){
                profileHeaderCropState.dragging = false;
            }
        });

        canvas.addEventListener("pointercancel",function(){
            if(profileHeaderCropState){
                profileHeaderCropState.dragging = false;
            }
        });

        document.getElementById("profile-header-crop-close").addEventListener("click",closeProfileHeaderCropModal);
        document.getElementById("profile-header-crop-cancel").addEventListener("click",closeProfileHeaderCropModal);

        document.getElementById("profile-header-crop-use").addEventListener("click",function(){

            if(!profileHeaderCropState || !profileSettingsDraft){
                return;
            }

            drawProfileHeaderCrop();

            const data = profileHeaderCropState.canvas.toDataURL("image/webp",0.86);

            if(!data.startsWith("data:image/webp")){
                showToast("This browser could not create a WebP header");
                return;
            }

            profileSettingsDraft.header_type = "upload";
            profileSettingsDraft.header_image = data;
            closeProfileHeaderCropModal();
            updateProfileSettingsPreview();

        });

        overlay.addEventListener("click",function(event){
            if(event.target === overlay){
                closeProfileHeaderCropModal();
            }
        });

    });

    image.addEventListener("error",function(){
        showToast("That file is not a valid image");
    });

    image.src = source;

}


function getProfileHeaderCropGeometry(){

    if(!profileHeaderCropState){
        return null;
    }

    const state = profileHeaderCropState;
    const baseScale = Math.max(
        state.canvas.width / state.image.naturalWidth,
        state.canvas.height / state.image.naturalHeight
    );
    const scale = baseScale * state.zoom;
    const width = state.image.naturalWidth * scale;
    const height = state.image.naturalHeight * scale;

    return {
        width:width,
        height:height,
        x:(state.canvas.width - width) / 2 + state.offsetX,
        y:(state.canvas.height - height) / 2 + state.offsetY,
        maxX:Math.max(0,(width - state.canvas.width) / 2),
        maxY:Math.max(0,(height - state.canvas.height) / 2)
    };

}


function clampProfileHeaderCropOffsets(){

    const geometry = getProfileHeaderCropGeometry();

    if(!geometry || !profileHeaderCropState){
        return;
    }

    profileHeaderCropState.offsetX = Math.max(-geometry.maxX,Math.min(geometry.maxX,profileHeaderCropState.offsetX));
    profileHeaderCropState.offsetY = Math.max(-geometry.maxY,Math.min(geometry.maxY,profileHeaderCropState.offsetY));

}


function drawProfileHeaderCrop(){

    const geometry = getProfileHeaderCropGeometry();

    if(!geometry || !profileHeaderCropState){
        return;
    }

    const state = profileHeaderCropState;
    state.context.clearRect(0,0,state.canvas.width,state.canvas.height);
    state.context.drawImage(
        state.image,
        geometry.x,
        geometry.y,
        geometry.width,
        geometry.height
    );

}


function closeProfileHeaderCropModal(){

    const overlay = document.getElementById("profile-header-crop-overlay");

    if(overlay){
        overlay.remove();
    }

    profileHeaderCropState = null;

}


function renderRankedStatsRows(items,type){

    if(!items || !items.length){
        return `<div class="ranked-stats-empty">No data available yet.</div>`;
    }

    return items.map((item,index)=>{

        const networkLogo = type === "network" && item.logo_path
        ? `<span class="ranked-network-logo"><img src="${escapeHTML(trackerImageURL(escapeHTML(item.logo_path),"w92"))}" alt="${escapeHTML(item.name)}"></span>`
        : "";

        return `
            <div class="ranked-stats-row">
                <div class="ranked-stats-rank">${index + 1}</div>
                <div class="ranked-stats-name">${networkLogo}<span>${escapeHTML(item.name)}</span></div>
                <div class="ranked-stats-count">${Number(item.count).toLocaleString()} shows</div>
                <div class="ranked-stats-percent">${Number(item.percentage)}%</div>
            </div>
        `;

    }).join("");

}


function renderProfile(){

    const profile = document.getElementById("profile-content");

    if(!profile){
        return;
    }

    const stats = getProfileStats();

    if(activeProfileView === "stats"){
        renderProfileStatsView(profile,stats);
        return;
    }

    renderProfileHomeView(profile,stats);

}



function renderProfileFavoriteSlotsHTML(kind,items){

    const cleanKind = kind === "movie" ? "movie" : "show";
    const source = Array.isArray(items) ? items : [];
    let slotsHTML = "";

    for(let i = 0; i < 8; i++){
        const item = source[i];

        if(item){
            const id = cleanKind === "movie" ? String(item.id || item.tmdb_id || "") : String(item.tmdb_id || "");
            const title = cleanKind === "movie" ? String(item.title || "favorite movie") : String(item.title || "favorite show");
            const posterHTML = item.poster_path
            ? `<img src="${escapeHTML(trackerImageURL(item.poster_path,"w500"))}" alt="">`
            : `<div class="profile-favorite-placeholder">${cleanKind === "movie" ? "🎬" : "📺"}</div>`;

            const route = cleanKind === "movie"
            ? (typeof getMovieDetailRoute === "function" ? getMovieDetailRoute(id,title) : "/app/profile")
            : (typeof getShowDetailRoute === "function" ? getShowDetailRoute(id,title) : "/app/profile");
            slotsHTML += `
                <a class="profile-favorite-slot filled" href="${escapeHTML(route)}" data-favorite-kind="${cleanKind}" data-favorite-action="open" data-favorite-id="${escapeHTML(id)}" aria-label="Open ${escapeHTML(title)}">
                    ${posterHTML}
                </a>
            `;
        }else{
            slotsHTML += `
                <button class="profile-favorite-slot empty" type="button" data-favorite-kind="${cleanKind}" data-favorite-action="edit" aria-label="Add favorite ${cleanKind}">
                    +
                </button>
            `;
        }
    }

    return slotsHTML;

}

function renderProfileHomeView(profile,stats){

    const favoriteShows = stats.favoriteShows || [];
    const favoriteMovies = typeof getFavoriteMovies === "function" ? getFavoriteMovies() : [];

    profile.innerHTML = `

        <div class="profile-hero ${getProfileHeaderClass(stats)}">

            ${getProfileHeaderImageLayerHTML(stats)}

            <div class="profile-avatar">${getProfileAvatarInnerHTML(stats)}</div>

            <div class="profile-name">
                ${escapeHTML(stats.username)}
            </div>

        </div>



        <button class="profile-stats-preview-card" id="open-profile-stats" type="button" aria-label="Open stats">

            <div class="profile-stats-preview-item">
                <div class="profile-stat-label">WATCH TIME</div>
                <div class="profile-stat-value profile-stat-value-with-icon">
                    <img class="profile-stat-icon" src="/static/assets/icons/WATCH%20TIME.svg" alt="">
                    <span>${escapeHTML(stats.watchTimeText)}</span>
                </div>
            </div>

            <div class="profile-stats-preview-divider"></div>

            <div class="profile-stats-preview-item">
                <div class="profile-stat-label">EPISODES WATCHED</div>
                <div class="profile-stat-value profile-stat-value-with-icon">
                    <img class="profile-stat-icon" src="/static/assets/icons/EPISODES%20WATCHED.svg" alt="">
                    <span>${Number(stats.episodesWatched).toLocaleString()}</span>
                </div>
            </div>

            <div class="profile-stats-preview-arrow">›</div>

        </button>



        <div class="profile-section">

            <div class="profile-section-header">
                <h2>FAVORITE SHOWS</h2>

                <button class="profile-edit-button" id="edit-favorites-button" data-favorite-kind="show">
                    Edit
                </button>
            </div>

            <div class="profile-favorites-grid">
                ${renderProfileFavoriteSlotsHTML("show",favoriteShows)}
            </div>

        </div>

        <div class="profile-section">

            <div class="profile-section-header">
                <h2>FAVORITE MOVIES</h2>

                <button class="profile-edit-button" id="edit-favorite-movies-button" data-favorite-kind="movie">
                    Edit
                </button>
            </div>

            <div class="profile-favorites-grid">
                ${renderProfileFavoriteSlotsHTML("movie",favoriteMovies)}
            </div>

        </div>

    `;

    document.getElementById("open-profile-stats").addEventListener("click",function(){
        activeProfileView = "stats";
        renderProfile();
    });

    document.querySelectorAll("[data-favorite-action='edit'], .profile-edit-button[data-favorite-kind]").forEach(button=>{

        button.addEventListener("click",function(){
            openFavoritesPopup(this.dataset.favoriteKind || "show");
        });

    });

    document.querySelectorAll("[data-favorite-action='open']").forEach(button=>{

        button.addEventListener("click",function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const id = this.dataset.favoriteId || "";
            const kind = this.dataset.favoriteKind || "show";
            if(kind === "movie" && id && typeof openMoviePage === "function"){
                const movie = typeof getFavoriteMovieById === "function" ? getFavoriteMovieById(id) : null;
                openMoviePage(id,{movieName:movie ? movie.title : "",navigationContext:"profile"});
                return;
            }
            if(id && typeof openShowDetailsPage === "function"){
                openShowDetailsPage(id,{navigationContext:"profile"});
            }
        });

    });

}



function renderProfileStatsView(profile,stats){

    const statCards = [
        {label:"WATCH TIME",value:stats.watchTimeText},
        {label:"WATCH HOURS",value:Number(stats.watchHoursRounded).toLocaleString()},
        {label:"EPISODES WATCHED",value:Number(stats.episodesWatched).toLocaleString()},
        {label:"SHOWS TRACKED",value:Number(stats.showsTracked).toLocaleString()},
        {label:"COMPLETED SHOWS",value:Number(stats.completedShows).toLocaleString()},
        {label:"WATCHING",value:Number(stats.watchingShows).toLocaleString()},
        {label:"PLAN TO WATCH",value:Number(stats.planShows).toLocaleString()},
        {label:"PAUSED",value:Number(stats.pausedShows).toLocaleString()},
        {label:"DROPPED",value:Number(stats.droppedShows).toLocaleString()},
        {label:"REGULAR EPISODES",value:Number(stats.regularEpisodesWatched).toLocaleString()},
        {label:"SPECIAL EPISODES",value:Number(stats.specialEpisodesWatched).toLocaleString()}
    ];

    const cardsHTML = statCards.map(card=>{
        return `
            <div class="profile-detail-stat-card">
                <div class="profile-detail-stat-label">${escapeHTML(card.label)}</div>
                <div class="profile-detail-stat-value">${escapeHTML(String(card.value))}</div>
            </div>
        `;
    }).join("");

    const networkSync = typeof getNetworkMetadataSyncSummary === "function"
    ? getNetworkMetadataSyncSummary()
    : null;

    const networkSyncText = networkSync && (networkSync.running || networkSync.pending > 0)
    ? `<div class="ranked-stats-sync">Updating network metadata${networkSync.current ? ` • ${escapeHTML(networkSync.current)}` : ""} • ${networkSync.percent}%</div>`
    : networkSync && networkSync.failed > 0
    ? `<div class="ranked-stats-sync warning">${networkSync.failed} network metadata item${networkSync.failed === 1 ? "" : "s"} will retry next time.</div>`
    : "";

    profile.innerHTML = `

        <div class="profile-stats-page">

            <button class="profile-stats-back" id="profile-stats-back" type="button">‹ Back</button>

            <div class="profile-stats-title-block">
                <h1>STATS</h1>
            </div>

            <div class="profile-detail-stats-grid">${cardsHTML}</div>

            <div class="profile-ranked-stats-grid">

                <section class="profile-ranked-panel">
                    <div class="profile-ranked-header">
                        <h2>TOP SHOW GENRES</h2>
                    </div>
                    <div class="profile-ranked-list">${renderRankedStatsRows(stats.topGenres,"genre")}</div>
                </section>

                <section class="profile-ranked-panel">
                    <div class="profile-ranked-header">
                        <h2>TOP SHOW NETWORKS</h2>
                    </div>
                    ${networkSyncText}
                    <div class="profile-ranked-list">${renderRankedStatsRows(stats.topNetworks,"network")}</div>
                </section>

            </div>

        </div>

    `;

    document.getElementById("profile-stats-back").addEventListener("click",function(){
        activeProfileView = "home";
        renderProfile();
    });

    if(typeof startNetworkMetadataSync === "function"){
        startNetworkMetadataSync();
    }

}

function openFavoritesPopup(mode="show"){

    activeFavoritesMode = mode === "movie" ? "movie" : "show";
    renderFavoritesPopup(activeFavoritesMode);

    document.getElementById("favorites-popup").style.display = "flex";

}



function closeFavoritesPopup(){

    document.getElementById("favorites-popup").style.display = "none";

}




function renderFavoriteMoviesPopup(content){

    const favorites = typeof getFavoriteMovies === "function" ? getFavoriteMovies() : [];
    const addHTML = favorites.length < 8
    ? `
        <div class="favorites-add-row">
            <input id="favorite-movie-search" type="search" placeholder="Search movies..." autocomplete="off">

            <button id="add-favorite-movie-button" disabled>
                Add
            </button>
        </div>

        <div class="favorites-search-results" id="favorite-movie-search-results"></div>
    `
    : `
        <div class="favorites-limit-text">
            You already picked 8 favorite movies.
        </div>
    `;

    const favoritesHTML = favorites.length
    ? favorites.map(movie=>{

        const posterHTML = movie.poster_path
        ? `<img src="${escapeHTML(trackerImageURL(movie.poster_path,"w500"))}" alt="" draggable="false">`
        : `<div class="favorites-popup-poster-placeholder">🎬</div>`;

        return `
            <div class="favorites-popup-item" data-favorite-movie-item="${escapeHTML(movie.id)}">
                <div class="favorites-popup-poster">
                    ${posterHTML}
                </div>

                <div class="favorites-popup-title">
                    ${escapeHTML(movie.title || "Untitled")}
                </div>

                <div class="favorites-popup-actions">
                    <button data-favorite-movie-remove="${escapeHTML(movie.id)}">
                        Remove
                    </button>
                </div>
            </div>
        `;

    }).join("")
    : `
        <div class="favorites-empty-text">
            No favorite movies selected yet.
        </div>
    `;

    content.innerHTML = `
        <div class="favorites-popup-controls">
            ${addHTML}
        </div>

        <div class="favorites-current-scroll">
            <div class="favorites-current-list">
                ${favoritesHTML}
            </div>
        </div>
    `;

    const addButton = document.getElementById("add-favorite-movie-button");
    const searchInput = document.getElementById("favorite-movie-search");
    const searchResults = document.getElementById("favorite-movie-search-results");
    let selectedMovie = null;
    let searchTimer = null;

    function setMovieSelection(movie){
        selectedMovie = movie;
        if(searchInput && movie){
            searchInput.value = movie.title || "";
        }
        if(addButton){
            addButton.disabled = !selectedMovie;
        }
        if(searchResults){
            searchResults.innerHTML = movie ? `<div class="favorites-search-hint">Selected: ${escapeHTML(movie.title || "")}</div>` : "";
        }
    }

    async function renderMovieSearchResults(query){
        if(!searchResults){
            return;
        }
        const cleanQuery = String(query || "").trim();
        if(!cleanQuery){
            searchResults.innerHTML = "";
            return;
        }
        searchResults.innerHTML = `<div class="favorites-search-hint">Searching movies...</div>`;
        try{
            const payload = typeof tmdbSearchMediaPage === "function"
            ? await tmdbSearchMediaPage(cleanQuery,"movie",1)
            : {results:[]};
            const existingIds = new Set(favorites.map(movie=>String(movie.id)));
            const matches = (payload.results || [])
            .map(item=>typeof normalizeFavoriteMovieFromSearch === "function" ? normalizeFavoriteMovieFromSearch(item) : null)
            .filter(movie=>movie && !existingIds.has(String(movie.id)))
            .slice(0,8);

            if(!matches.length){
                searchResults.innerHTML = `<div class="favorites-search-hint">No matching movies found.</div>`;
                return;
            }

            searchResults.innerHTML = matches.map(movie=>{
                const posterHTML = movie.poster_path
                ? `<img src="${escapeHTML(trackerImageURL(movie.poster_path,"w185"))}" alt="" draggable="false">`
                : `<span class="favorites-search-placeholder">🎬</span>`;
                return `
                    <button class="favorites-search-result" data-favorite-movie-pick="${escapeHTML(movie.id)}">
                        <span class="favorites-search-poster">${posterHTML}</span>
                        <span>${escapeHTML(movie.title || "Untitled")}</span>
                    </button>
                `;
            }).join("");

            searchResults.querySelectorAll("[data-favorite-movie-pick]").forEach(button=>{
                button.addEventListener("click",function(){
                    const id = String(this.dataset.favoriteMoviePick || "");
                    const movie = matches.find(item=>String(item.id) === id) || null;
                    setMovieSelection(movie);
                });
            });
        }catch(error){
            searchResults.innerHTML = `<div class="favorites-search-hint">Couldn’t search movies. Try again later.</div>`;
        }
    }

    if(searchInput){
        searchInput.addEventListener("input",function(){
            selectedMovie = null;
            if(addButton){
                addButton.disabled = true;
            }
            const query = this.value;
            if(searchTimer){
                clearTimeout(searchTimer);
            }
            searchTimer = setTimeout(()=>renderMovieSearchResults(query),350);
        });
    }

    if(addButton){
        addButton.addEventListener("click",async function(){
            if(selectedMovie && typeof addFavoriteMovie === "function"){
                await addFavoriteMovie(selectedMovie);
            }
        });
    }

    content.querySelectorAll("[data-favorite-movie-remove]").forEach(button=>{
        button.addEventListener("click",async function(event){
            event.stopPropagation();
            if(typeof removeFavoriteMovie === "function"){
                await removeFavoriteMovie(this.dataset.favoriteMovieRemove);
            }
        });
    });

}



function renderFavoritesPopup(mode=""){

    const content = document.getElementById("favorites-popup-content");

    if(!content){
        return;
    }

    const requestedMode = mode || (typeof activeFavoritesMode !== "undefined" ? activeFavoritesMode : "show");
    activeFavoritesMode = requestedMode === "movie" ? "movie" : "show";

    const title = document.getElementById("favorites-popup-title");
    const description = document.getElementById("favorites-popup-description");
    if(title){
        title.textContent = activeFavoritesMode === "movie" ? "Favorite Movies" : "Favorite Shows";
    }
    if(description){
        description.textContent = activeFavoritesMode === "movie" ? "Choose up to 8 favorite movies." : "Choose up to 8 favorite shows.";
    }

    if(activeFavoritesMode === "movie"){
        renderFavoriteMoviesPopup(content);
        return;
    }

    const favorites = getFavoriteShows();
    const available = getAvailableFavoriteShows();

    const addHTML = favorites.length < 8
    ? `
        <div class="favorites-add-row">
            <input id="favorite-show-search" type="search" placeholder="Search shows..." autocomplete="off">

            <button id="add-favorite-button" disabled>
                Add
            </button>
        </div>

        <div class="favorites-search-results" id="favorite-search-results"></div>
    `
    : `
        <div class="favorites-limit-text">
            You already picked 8 favorite shows.
        </div>
    `;

    const favoritesHTML = favorites.length
    ? favorites.map(show=>{

        const posterHTML = show.poster_path
        ? `<img src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="" draggable="false">`
        : `<div class="favorites-popup-poster-placeholder">📺</div>`;

        return `
            <div
                class="favorites-popup-item"
                data-favorite-item="${show.tmdb_id}"
                title="Hold and drag to reorder"
            >

                <div class="favorites-popup-poster">
                    ${posterHTML}
                </div>

                <div class="favorites-popup-title">
                    ${escapeHTML(show.title)}
                </div>

                <div class="favorites-popup-actions">
                    <button data-favorite-remove="${show.tmdb_id}">
                        Remove
                    </button>
                </div>

            </div>
        `;

    }).join("")
    : `
        <div class="favorites-empty-text">
            No favorite shows selected yet.
        </div>
    `;

    content.innerHTML = `
        <div class="favorites-popup-controls">
            ${addHTML}
        </div>

        <div class="favorites-current-scroll">
            <div class="favorites-current-list">
                ${favoritesHTML}
            </div>
        </div>
    `;

    const addButton = document.getElementById("add-favorite-button");
    const searchInput = document.getElementById("favorite-show-search");
    const searchResults = document.getElementById("favorite-search-results");
    const favoritesList = content.querySelector(".favorites-current-list");
    const favoritesScroll = content.querySelector(".favorites-current-scroll");
    let selectedFavoriteShowId = "";

    function renderFavoriteSearchResults(query){

        if(!searchResults){
            return;
        }

        const cleanQuery = String(query || "").trim().toLowerCase();

        if(!cleanQuery){
            searchResults.innerHTML = "";
            return;
        }

        const matches = available
        .filter(show=>String(show.title || "").toLowerCase().includes(cleanQuery))
        .slice(0,8);

        if(!matches.length){
            searchResults.innerHTML = `<div class="favorites-search-hint">No matching shows found.</div>`;
            return;
        }

        searchResults.innerHTML = matches.map(show=>{
            const posterHTML = show.poster_path
            ? `<img src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="" draggable="false">`
            : `<span class="favorites-search-placeholder">📺</span>`;

            return `
                <button class="favorites-search-result" data-favorite-pick="${show.tmdb_id}">
                    <span class="favorites-search-poster">${posterHTML}</span>
                    <span>${escapeHTML(show.title)}</span>
                </button>
            `;
        }).join("");

        searchResults.querySelectorAll("[data-favorite-pick]").forEach(button=>{
            button.addEventListener("click",function(){
                selectedFavoriteShowId = String(this.dataset.favoritePick || "");
                const pickedShow = available.find(show=>String(show.tmdb_id) === selectedFavoriteShowId);

                if(searchInput && pickedShow){
                    searchInput.value = pickedShow.title || "";
                }

                if(addButton){
                    addButton.disabled = !selectedFavoriteShowId;
                }

                searchResults.innerHTML = `<div class="favorites-search-hint">Selected: ${escapeHTML(pickedShow ? pickedShow.title : "")}</div>`;
            });
        });

    }

    if(searchInput){

        renderFavoriteSearchResults("");

        searchInput.addEventListener("input",function(){
            selectedFavoriteShowId = "";

            if(addButton){
                addButton.disabled = true;
            }

            renderFavoriteSearchResults(this.value);
        });

    }

    if(addButton){

        addButton.addEventListener("click",async function(){

            if(!selectedFavoriteShowId){
                return;
            }

            await addFavoriteShow(selectedFavoriteShowId);

        });

    }

    content.querySelectorAll("[data-favorite-remove]").forEach(button=>{

        button.addEventListener("click",async function(event){
            event.stopPropagation();
            await removeFavoriteShow(this.dataset.favoriteRemove);
        });

        button.addEventListener("pointerdown",function(event){
            event.stopPropagation();
        });

    });

    if(!favoritesList || favorites.length < 2){
        return;
    }

    const dragState = {
        row:null,
        pointerId:null,
        pointerType:"",
        originalIndex:-1,
        pointerOffsetY:0,
        startX:0,
        startY:0,
        lastX:0,
        lastY:0,
        lastScrollY:0,
        holdTimer:null,
        active:false,
        manualScrolling:false,
        placeholder:null,
        autoScrollDirection:0,
        autoScrollFrame:null
    };

    function getFavoriteRows(){
        return Array.from(
            favoritesList.querySelectorAll(".favorites-popup-item")
        );
    }

    function clearHoldTimer(){
        if(dragState.holdTimer){
            clearTimeout(dragState.holdTimer);
            dragState.holdTimer = null;
        }
    }

    function stopAutoScroll(){
        dragState.autoScrollDirection = 0;

        if(dragState.autoScrollFrame){
            cancelAnimationFrame(dragState.autoScrollFrame);
            dragState.autoScrollFrame = null;
        }
    }

    function updatePlaceholder(pointerY){

        if(!dragState.active || !dragState.placeholder){
            return;
        }

        const rows = getFavoriteRows();

        let inserted = false;

        for(const row of rows){

            const rect = row.getBoundingClientRect();

            if(pointerY < rect.top + (rect.height / 2)){
                favoritesList.insertBefore(dragState.placeholder,row);
                inserted = true;
                break;
            }

        }

        if(!inserted){
            favoritesList.appendChild(dragState.placeholder);
        }

    }

    function runAutoScroll(){

        if(
            !dragState.active ||
            !favoritesScroll ||
            dragState.autoScrollDirection === 0
        ){
            dragState.autoScrollFrame = null;
            return;
        }

        favoritesScroll.scrollTop += dragState.autoScrollDirection * 10;
        updatePlaceholder(dragState.lastY);

        dragState.autoScrollFrame = requestAnimationFrame(runAutoScroll);

    }

    function updateAutoScroll(pointerY){

        if(!favoritesScroll){
            return;
        }

        const rect = favoritesScroll.getBoundingClientRect();
        const edgeSize = Math.min(58,Math.max(34,rect.height * 0.16));

        let direction = 0;

        if(pointerY < rect.top + edgeSize){
            direction = -1;
        }else if(pointerY > rect.bottom - edgeSize){
            direction = 1;
        }

        if(direction === dragState.autoScrollDirection){
            return;
        }

        stopAutoScroll();
        dragState.autoScrollDirection = direction;

        if(direction !== 0){
            dragState.autoScrollFrame = requestAnimationFrame(runAutoScroll);
        }

    }

    function restoreDraggedRowStyles(){

        if(!dragState.row){
            return;
        }

        dragState.row.classList.remove("favorites-live-dragging");
        dragState.row.style.position = "";
        dragState.row.style.left = "";
        dragState.row.style.top = "";
        dragState.row.style.width = "";
        dragState.row.style.height = "";
        dragState.row.style.margin = "";
        dragState.row.style.zIndex = "";

        document.body.classList.remove("favorite-reordering");

    }

    function startLiveFavoriteDrag(){

        if(!dragState.row || dragState.active){
            return;
        }

        clearHoldTimer();

        const rect = dragState.row.getBoundingClientRect();

        dragState.pointerOffsetY = dragState.lastY - rect.top;
        dragState.active = true;
        dragState.manualScrolling = false;

        const placeholder = document.createElement("div");
        placeholder.className = "favorites-drag-placeholder";
        placeholder.style.height = `${rect.height}px`;

        dragState.placeholder = placeholder;

        favoritesList.insertBefore(placeholder,dragState.row);
        document.body.appendChild(dragState.row);

        dragState.row.classList.add("favorites-live-dragging");
        dragState.row.style.position = "fixed";
        dragState.row.style.left = `${rect.left}px`;
        dragState.row.style.top = `${rect.top}px`;
        dragState.row.style.width = `${rect.width}px`;
        dragState.row.style.height = `${rect.height}px`;
        dragState.row.style.margin = "0";
        dragState.row.style.zIndex = "10001";

        document.body.classList.add("favorite-reordering");

        updatePlaceholder(dragState.lastY);

    }

    function moveDraggedFavorite(pointerY){

        if(!dragState.active || !dragState.row){
            return;
        }

        dragState.row.style.top = `${pointerY - dragState.pointerOffsetY}px`;

        updatePlaceholder(pointerY);
        updateAutoScroll(pointerY);

    }

    function resetDragState(){

        clearHoldTimer();
        stopAutoScroll();

        dragState.row = null;
        dragState.pointerId = null;
        dragState.pointerType = "";
        dragState.originalIndex = -1;
        dragState.pointerOffsetY = 0;
        dragState.startX = 0;
        dragState.startY = 0;
        dragState.lastX = 0;
        dragState.lastY = 0;
        dragState.lastScrollY = 0;
        dragState.active = false;
        dragState.manualScrolling = false;
        dragState.placeholder = null;

    }

    function removeDocumentDragListeners(){

        document.removeEventListener("pointermove",handleFavoritePointerMove,true);
        document.removeEventListener("pointerup",handleFavoritePointerUp,true);
        document.removeEventListener("pointercancel",handleFavoritePointerCancel,true);

    }

    function cancelFavoriteDrag(){

        const row = dragState.row;
        const placeholder = dragState.placeholder;
        const originalIndex = dragState.originalIndex;

        if(dragState.active && row){

            const rows = getFavoriteRows();

            if(originalIndex >= rows.length){
                favoritesList.appendChild(row);
            }else{
                favoritesList.insertBefore(row,rows[originalIndex]);
            }

            if(placeholder){
                placeholder.remove();
            }

            restoreDraggedRowStyles();

        }

        removeDocumentDragListeners();
        resetDragState();

    }

    async function finishFavoriteDrag(){

        clearHoldTimer();

        const row = dragState.row;
        const placeholder = dragState.placeholder;
        const wasActive = dragState.active;

        if(!wasActive){
            removeDocumentDragListeners();
            resetDragState();
            return;
        }

        if(placeholder){
            favoritesList.insertBefore(row,placeholder);
            placeholder.remove();
        }else{
            favoritesList.appendChild(row);
        }

        restoreDraggedRowStyles();

        const orderedIds = getFavoriteRows().map(item=>{
            return String(item.dataset.favoriteItem || "");
        }).filter(Boolean);

        removeDocumentDragListeners();
        resetDragState();

        await saveFavoriteShowsOrder(orderedIds);

    }

    function handleFavoritePointerMove(event){

        if(
            !dragState.row ||
            event.pointerId !== dragState.pointerId
        ){
            return;
        }

        dragState.lastX = event.clientX;
        dragState.lastY = event.clientY;

        const movement = Math.hypot(
            event.clientX - dragState.startX,
            event.clientY - dragState.startY
        );

        if(!dragState.active){

            if(dragState.pointerType === "touch"){

                if(movement > 7){

                    clearHoldTimer();
                    dragState.manualScrolling = true;

                    if(favoritesScroll){
                        const deltaY = event.clientY - dragState.lastScrollY;
                        favoritesScroll.scrollTop -= deltaY;
                    }

                    dragState.lastScrollY = event.clientY;
                    event.preventDefault();

                }

                return;

            }

            if(movement < 4){
                return;
            }

            startLiveFavoriteDrag();

        }

        if(dragState.active){
            event.preventDefault();
            moveDraggedFavorite(event.clientY);
        }

    }

    async function handleFavoritePointerUp(event){

        if(
            !dragState.row ||
            event.pointerId !== dragState.pointerId
        ){
            return;
        }

        event.preventDefault();
        await finishFavoriteDrag();

    }

    function handleFavoritePointerCancel(event){

        if(
            !dragState.row ||
            event.pointerId !== dragState.pointerId
        ){
            return;
        }

        cancelFavoriteDrag();

    }

    getFavoriteRows().forEach(row=>{

        row.addEventListener("dragstart",function(event){
            event.preventDefault();
        });

        row.addEventListener("pointerdown",function(event){

            if(
                event.target.closest(
                    "button,input,select,textarea,a,[data-favorite-remove]"
                )
            ){
                return;
            }

            if(event.pointerType === "mouse" && event.button !== 0){
                return;
            }

            event.preventDefault();

            dragState.row = this;
            dragState.pointerId = event.pointerId;
            dragState.pointerType = event.pointerType || "mouse";
            dragState.originalIndex = getFavoriteRows().indexOf(this);
            dragState.startX = event.clientX;
            dragState.startY = event.clientY;
            dragState.lastX = event.clientX;
            dragState.lastY = event.clientY;
            dragState.lastScrollY = event.clientY;
            dragState.active = false;
            dragState.manualScrolling = false;

            document.addEventListener(
                "pointermove",
                handleFavoritePointerMove,
                {capture:true,passive:false}
            );

            document.addEventListener(
                "pointerup",
                handleFavoritePointerUp,
                {capture:true,passive:false}
            );

            document.addEventListener(
                "pointercancel",
                handleFavoritePointerCancel,
                {capture:true,passive:false}
            );

            if(dragState.pointerType === "touch"){
                dragState.holdTimer = setTimeout(function(){
                    startLiveFavoriteDrag();
                },200);
            }

        });

    });


}



function setupFavoritesPopupEvents(){

    const closeButton = document.getElementById("close-favorites-popup");
    const overlay = document.getElementById("favorites-popup");

    if(closeButton){
        closeButton.addEventListener("click",function(){
            closeFavoritesPopup();
        });
    }

    if(overlay){
        overlay.addEventListener("click",function(event){

            if(event.target.id === "favorites-popup"){
                closeFavoritesPopup();
            }

        });
    }

}

function escapeHTML(text){

    return String(text)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}
