var historyVisibleLimit = 40;
const HISTORY_BATCH_SIZE = 40;

const CHECK_SUCCESS_ANIMATION_MS = 520;

var profileSettingsDraft = null;
var avatarCropState = null;
var profileHeaderCropState = null;

function getCheckSuccessAnimationTarget(element){

    if(!element){
        return null;
    }

    return (
        element.closest(".episode-row") ||
        element.closest(".behind-episode-row") ||
        element.closest(".upcoming-batch-row") ||
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

    return new Promise(resolve=>{
        setTimeout(()=>{

            element.classList.remove("marking");

            if(target){
                target.classList.remove("card-marking");
            }

            resolve();

        },CHECK_SUCCESS_ANIMATION_MS);
    });

}




function updateShellTitle(){

    const title = document.getElementById("mobile-page-title");

    if(!title){
        return;
    }

    const pageTitles = {
        discover:"Discover",
        profile:"Profile",
        settings:"Settings"
    };

    const showTabTitles = {
        watchlist:"Watchlist",
        upcoming:"Upcoming",
        history:"History"
    };

    title.textContent = activePage === "shows"
    ? (showTabTitles[activeShowsTab] || "Shows")
    : (pageTitles[activePage] || "TV Tracker");

}



function closeMobileNavigation(){

    if(window.innerWidth >= 992){
        return;
    }

    if(window.TVTrackerShell){
        window.TVTrackerShell.closeNavigation();
        return;
    }

    const sidebar = document.getElementById("app-sidebar");

    if(!sidebar || !window.bootstrap || !window.bootstrap.Offcanvas){
        return;
    }

    const offcanvas = window.bootstrap.Offcanvas.getInstance(sidebar);

    if(offcanvas){
        offcanvas.hide();
    }

}



function showPage(page){

    activePage = page;

    if(page === "profile"){
        activeProfileView = "home";
    }

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    document.querySelectorAll(".app-primary-nav button[data-page]").forEach(button=>{
        const isActive = button.dataset.page === page;
        button.classList.toggle("active",isActive);

        if(isActive){
            button.setAttribute("aria-current","page");
        }else{
            button.removeAttribute("aria-current");
        }
    });

    const pageElement = document.getElementById(page + "-page");

    if(!pageElement){
        return;
    }

    pageElement.classList.add("active-page");

    updateShellTitle();
    closeMobileNavigation();
    renderAll();

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





function renderDiscoverHub(){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    const state = typeof discoverHubState === "object" && discoverHubState
    ? discoverHubState
    : {loaded:false,loading:false,error:"",sections:[]};

    if(state.loading && (!state.sections || state.sections.length === 0)){

        results.innerHTML = `
            <div class="discover-hub">
                ${renderDiscoverHubSkeleton("Coming Soon")}
                ${renderDiscoverHubSkeleton("Trending This Week")}
                ${renderDiscoverHubSkeleton("Airing Now")}
                ${renderDiscoverHubSkeleton("Popular")}
            </div>
        `;

        return;

    }

    if(state.error && (!state.sections || state.sections.length === 0)){

        results.innerHTML = `
            <div class="empty-state">
                <h2>Could not load Discover.</h2>
                <p>${escapeHTML(state.error)}</p>
            </div>
        `;

        return;

    }

    const sections = (state.sections || [])
    .map(section=>{

        const shows = (section.shows || []).filter(show=>{
            return show && show.id;
        });

        return Object.assign({},section,{shows:shows});

    })
    .filter(section=>section.shows && section.shows.length > 0);

    if(sections.length === 0){

        results.innerHTML = `
            <div class="empty-state">
                <h2>Nothing new here right now.</h2>
                <p>Search for a show above or check Discover again later.</p>
            </div>
        `;

        return;

    }

    results.innerHTML = `
        <div class="discover-hub">
            ${sections.map(renderDiscoverHubSection).join("")}
        </div>
    `;

    document.querySelectorAll(".discover-hub-card").forEach(card=>{

        card.addEventListener("click",async function(){

            await openDiscoverShowModal({
                id:Number(this.dataset.showId),
                name:this.dataset.showName || "",
                poster_path:this.dataset.posterPath || "",
                overview:this.dataset.overview || "",
                first_air_date:this.dataset.firstAirDate || ""
            });

        });

    });

    setupInfiniteDiscoverCarousels();

    document.querySelectorAll(".discover-row-arrow").forEach(button=>{

        button.addEventListener("click",function(event){

            event.preventDefault();
            event.stopPropagation();

            const direction = this.dataset.direction === "left" ? -1 : 1;
            const shell = this.closest(".discover-carousel-shell");
            const row = shell ? shell.querySelector(".discover-card-row") : null;

            if(!row){
                return;
            }

            normalizeInfiniteDiscoverRow(row,false);

            const scrollAmount = getDiscoverCarouselScrollAmount(row);

            row.scrollBy({
                left:direction * scrollAmount,
                behavior:"smooth"
            });

            window.setTimeout(()=>{
                normalizeInfiniteDiscoverRow(row,false);
            },360);

        });

    });

}



function renderDiscoverHubSkeleton(title){

    return `
        <div class="discover-section">
            <div class="discover-section-heading">
                <h3>${escapeHTML(title)}</h3>
            </div>
            <div class="discover-carousel-shell">
                <div class="discover-card-row">
                    ${Array.from({length:8}).map(()=>`<div class="discover-card skeleton-card"></div>`).join("")}
                </div>
            </div>
        </div>
    `;

}



function renderDiscoverHubSection(section){

    const rowKey = escapeHTML(section.key || section.title || "shows");
    const shows = section.shows || [];
    const repeatedShows = shows.length > 1
    ? [...shows,...shows,...shows]
    : shows;

    return `
        <div class="discover-section">
            <div class="discover-section-heading">
                <div>
                    <h3>${escapeHTML(section.title || "Shows")}</h3>
                </div>
            </div>
            <div class="discover-carousel-shell">
                <div class="discover-card-row infinite-discover-row" data-discover-row="${rowKey}" data-original-count="${shows.length}">
                    ${repeatedShows.map(renderDiscoverHubCard).join("")}
                </div>
                <div class="discover-carousel-overlay" aria-hidden="false">
                    <button type="button" class="discover-row-arrow discover-row-arrow-left" data-direction="left" aria-label="Scroll left">‹</button>
                    <button type="button" class="discover-row-arrow discover-row-arrow-right" data-direction="right" aria-label="Scroll right">›</button>
                </div>
            </div>
        </div>
    `;

}


function getDiscoverCarouselMetrics(row){

    const cards = Array.from(row.querySelectorAll(".discover-hub-card"));
    const originalCount = Number(row.dataset.originalCount || 0);

    if(!row || !cards.length || !originalCount || originalCount < 2){
        return null;
    }

    const rowStyle = window.getComputedStyle(row);
    const gap = parseFloat(rowStyle.columnGap || rowStyle.gap || "16") || 16;
    const cardWidth = cards[0].getBoundingClientRect().width || 142;
    const itemWidth = cardWidth + gap;
    const setWidth = originalCount * itemWidth;

    return {
        cards,
        originalCount,
        gap,
        cardWidth,
        itemWidth,
        setWidth
    };

}



function getDiscoverCarouselScrollAmount(row){

    const metrics = getDiscoverCarouselMetrics(row);

    if(!metrics){
        return Math.max(280,Math.round(row.clientWidth * 0.7));
    }

    const visibleCards = Math.max(1,Math.floor(row.clientWidth / metrics.itemWidth));
    const step = Math.max(1,visibleCards - 1);

    return Math.round(step * metrics.itemWidth);

}



function normalizeInfiniteDiscoverRow(row,instant){

    const metrics = getDiscoverCarouselMetrics(row);

    if(!metrics){
        return;
    }

    const min = metrics.setWidth * 0.35;
    const max = metrics.setWidth * 1.65;
    let target = null;

    if(row.scrollLeft < min){
        target = row.scrollLeft + metrics.setWidth;
    }else if(row.scrollLeft > max){
        target = row.scrollLeft - metrics.setWidth;
    }

    if(target === null){
        return;
    }

    if(instant){
        const previousBehavior = row.style.scrollBehavior;
        row.style.scrollBehavior = "auto";
        row.scrollLeft = target;
        row.style.scrollBehavior = previousBehavior;
        return;
    }

    window.requestAnimationFrame(()=>{
        const previousBehavior = row.style.scrollBehavior;
        row.style.scrollBehavior = "auto";
        row.scrollLeft = target;
        row.style.scrollBehavior = previousBehavior;
    });

}



function setupInfiniteDiscoverCarousels(){

    document.querySelectorAll(".infinite-discover-row").forEach(row=>{

        const metrics = getDiscoverCarouselMetrics(row);

        if(!metrics){
            return;
        }

        const previousBehavior = row.style.scrollBehavior;
        row.style.scrollBehavior = "auto";
        row.scrollLeft = metrics.setWidth;
        row.style.scrollBehavior = previousBehavior;

        row.addEventListener("scroll",function(){
            normalizeInfiniteDiscoverRow(row,false);
        },{passive:true});

    });

}


function renderDiscoverHubCard(show){

    const posterHTML = show.poster_path
    ? `<img loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w342${show.poster_path}" alt="">`
    : `<div class="discover-card-placeholder">TV</div>`;

    const year = show.first_air_date
    ? show.first_air_date.slice(0,4)
    : "Unknown";

    const rating = Number(show.vote_average || 0);
    const ratingHTML = rating > 0
    ? ` • <span>${rating.toFixed(1)}</span>`
    : "";

    return `
        <button
        class="discover-hub-card"
        data-show-id="${escapeHTML(show.id)}"
        data-show-name="${escapeHTML(show.name || "")}" 
        data-poster-path="${escapeHTML(show.poster_path || "")}" 
        data-overview="${escapeHTML(show.overview || "")}" 
        data-first-air-date="${escapeHTML(show.first_air_date || "")}">
            <div class="discover-card-poster">
                ${posterHTML}
            </div>
            <div class="discover-card-title">${escapeHTML(show.name || "Untitled")}</div>
            <div class="discover-card-meta">${escapeHTML(year)}${ratingHTML}</div>
        </button>
    `;

}



function renderSearchResults(shows){

    const results = document.getElementById("search-results");

    results.innerHTML = "";

    if(!shows || shows.length === 0){

        results.innerHTML = `
            <div class="empty-state">
                <h2>No results found.</h2>
            </div>
        `;

        return;

    }

    shows.forEach(show=>{

        const card = document.createElement("div");
        card.className = "show";

        const posterHTML = show.poster_path
        ? `<img class="poster" loading="lazy" decoding="async" src="https://image.tmdb.org/t/p/w154${show.poster_path}">`
        : `<div class="poster-placeholder">📺</div>`;

        const alreadyTracked = DATA.shows[String(show.id)];

        card.innerHTML = `

            ${posterHTML}

            <div class="info">

                <div class="title">
                    ${escapeHTML(show.name)}
                </div>

                <div class="episode">
                    First aired: ${show.first_air_date || "Unknown"}
                </div>

                <div class="episode-title">
                    ${escapeHTML(show.overview || "")}
                </div>

            </div>

        `;

        if(alreadyTracked){

            const label = document.createElement("div");
            label.className = "tracked-label";
            label.textContent = "Added";
            card.querySelector(".info").appendChild(label);

            card.addEventListener("click",function(){
                openShowModal(show.id);
            });

        }else{

            const button = document.createElement("button");
            button.className = "add-button";
            button.textContent = "Add Show";

            button.addEventListener("click",async function(event){
                event.stopPropagation();
                await handleAddShowClick(show);
            });

            card.addEventListener("click",async function(){
                await openDiscoverShowModal(show);
            });

            card.querySelector(".info").appendChild(button);

        }

        results.appendChild(card);

    });

}





function getWatchlistEmptyHTML(){

    const messages = {
        watching:{
            title:"Nothing to watch right now.",
            text:"You are caught up. New or missed episodes will appear here."
        },
        paused:{
            title:"No paused shows.",
            text:"Shows you pause will wait here until you are ready to continue."
        },
        finished:{
            title:"No completed shows yet.",
            text:"When you finish everything currently available, it will appear here."
        },
        plan:{
            title:"No planned shows yet.",
            text:"Add shows from Discover and choose Plan To Watch."
        },
        dropped:{
            title:"No dropped shows.",
            text:"Shows you stop watching will appear here."
        }
    };

    const message = messages[activeFilter] || {
        title:"Nothing here yet.",
        text:"Add or update shows to fill this section."
    };

    return `
        <div class="empty-state">
            <h2>${escapeHTML(message.title)}</h2>
            <p>${escapeHTML(message.text)}</p>
        </div>
    `;

}







function getLibrarySearchQuery(){

    if(typeof librarySearchQuery !== "string"){
        librarySearchQuery = "";
    }

    return librarySearchQuery.trim();

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



function getSearchDisplayFilter(show){

    if(show.status === "finished"){
        return "finished";
    }

    if(show.status === "dropped"){
        return "dropped";
    }

    if(show.status === "paused"){
        return "paused";
    }

    if(show.status === "plan"){
        return "plan";
    }

    return "watching";

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

    let box = document.getElementById("library-search-box");

    if(!box){

        box = createLibrarySearchBox();
        filters.appendChild(box);

    }

    const input = box.querySelector("#library-search");

    if(input){
        input.placeholder = "Search " + getActiveFilterSearchLabel();
        input.value = getLibrarySearchQuery();
    }

}



function createLibrarySearchBox(){

    const box = document.createElement("div");
    box.id = "library-search-box";
    box.className = "library-search-box";

    const value = getLibrarySearchQuery();

    box.innerHTML = `
        <input
        id="library-search"
        class="library-search-input"
        type="search"
        placeholder="Search ${escapeHTML(getActiveFilterSearchLabel())}"
        autocomplete="off"
        value="${escapeHTML(value)}">
    `;

    const input = box.querySelector("#library-search");

    input.addEventListener("input",function(){

        librarySearchQuery = this.value;
        renderWatchlist();

    });

    return box;

}



function getLibrarySearchEmptyHTML(query){

    return `
        <div class="empty-state">
            <h2>No matches in ${escapeHTML(getActiveFilterSearchLabel())}.</h2>
            <p>No show in this list matches “${escapeHTML(query)}”.</p>
        </div>
    `;

}



function getWatchlistProgressData(show){

    const watched = Math.max(Number(getWatchedEpisodeCount(show) || 0),0);
    const knownTotal = Math.max(Number(getTotalEpisodeCount(show) || 0),0);
    const total = Math.max(knownTotal,watched);
    const completed = show.status === "finished";
    const percent = total > 0
    ? Math.min(100,Math.max(0,completed ? 100 : Math.round((watched / total) * 100)))
    : 0;

    const label = total > 0
    ? `${watched} of ${total} watched`
    : `${watched} watched`;

    return {
        watched,
        total,
        percent,
        label
    };

}



function getWatchlistPosterFallback(show){

    const words = String(show.title || show.name || "TV")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0,2);

    const initials = words
    .map(word=>word.charAt(0))
    .join("")
    .toUpperCase();

    return initials || "TV";

}



function getWatchlistActionIcon(icon){

    const icons = {
        check:`
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `,
        play:`
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8.5 6.5v11l9-5.5-9-5.5Z" fill="currentColor"></path>
            </svg>
        `,
        restore:`
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8 8H4V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M4.5 8.5A8 8 0 1 1 5 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            </svg>
        `,
        clock:`
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"></circle>
                <path d="M12 8v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        `
    };

    return icons[icon] || icons.check;

}



function getWatchlistActionConfig(show,displayFilter,nextEp){

    const title = show.title || "show";

    if(displayFilter === "finished"){
        return null;
    }

    if(displayFilter === "paused"){
        return {
            action:"resume",
            icon:"play",
            label:`Resume ${title}`,
            disabled:false
        };
    }

    if(displayFilter === "plan"){
        return {
            action:"start",
            icon:"play",
            label:`Start watching ${title}`,
            disabled:false
        };
    }

    if(displayFilter === "dropped"){
        return {
            action:"restore",
            icon:"restore",
            label:`Restore ${title} to Watching`,
            disabled:false
        };
    }

    if(!nextEp){
        return null;
    }

    const isAvailable = Boolean(
        nextEp.air_date &&
        isEpisodeAired(nextEp.air_date,nextEp)
    );

    const releaseDate = nextEp.air_date
    ? formatAirDate(nextEp.air_date,nextEp)
    : "";

    return {
        action:"mark",
        icon:isAvailable ? "check" : "clock",
        label:isAvailable
        ? `Mark ${title} Season ${nextEp.season}, Episode ${nextEp.episode} watched`
        : releaseDate
        ? `${title} Season ${nextEp.season}, Episode ${nextEp.episode} is available ${releaseDate}`
        : `${title} episode release date is unavailable`,
        disabled:!isAvailable
    };

}



function createWatchlistCard(show,options={}){

    const displayFilter = options.filter || activeFilter;
    const isCompletedFilter = displayFilter === "finished";
    const isDroppedFilter = displayFilter === "dropped";
    const nextEp = (isCompletedFilter || isDroppedFilter) ? null : getNextEpisode(show);

    const droppedStopEpisode = isDroppedFilter && typeof getLatestWatchedEpisode === "function"
    ? getLatestWatchedEpisode(show)
    : null;

    const droppedStopEpisodeData = droppedStopEpisode && typeof getEpisodeData === "function"
    ? getEpisodeData(show,droppedStopEpisode.season,droppedStopEpisode.episode)
    : null;

    const showNewBadge =
    displayFilter === "watching" &&
    nextEp &&
    isNewUpcomingEpisode(show,{
        season_number:nextEp.season,
        episode_number:nextEp.episode,
        air_date:nextEp.air_date,
        air_time:nextEp.air_time || "",
        air_timestamp:nextEp.air_timestamp || "",
        tvmaze_airdate:nextEp.tvmaze_airdate || ""
    });

    const episodeLine = isCompletedFilter
    ? `<span class="completed-label">Completed</span>`
    : isDroppedFilter && droppedStopEpisode
    ? `Stopped after Season ${droppedStopEpisode.season}, Episode ${droppedStopEpisode.episode}`
    : isDroppedFilter
    ? `Dropped`
    : displayFilter === "plan" && nextEp
    ? `Start with Season ${nextEp.season}, Episode ${nextEp.episode}`
    : displayFilter === "paused" && nextEp
    ? `Next: Season ${nextEp.season}, Episode ${nextEp.episode}`
    : nextEp
    ? `Season ${nextEp.season}, Episode ${nextEp.episode}`
    : getNoNextEpisodeText(show);

    const episodeTitle = isDroppedFilter && droppedStopEpisodeData && droppedStopEpisodeData.name
    ? `“${escapeHTML(droppedStopEpisodeData.name)}”`
    : nextEp && nextEp.name
    ? `“${escapeHTML(nextEp.name)}”`
    : "";

    const nextEpisodeFuture = Boolean(
        nextEp &&
        nextEp.air_date &&
        !isEpisodeAired(nextEp.air_date,nextEp)
    );

    const releaseMeta = nextEpisodeFuture
    ? [
        formatAirDate(nextEp.air_date,nextEp),
        getCountdownText(nextEp.air_date,nextEp)
    ].filter(Boolean).join(" • ")
    : "";

    const progress = getWatchlistProgressData(show);
    const action = getWatchlistActionConfig(show,displayFilter,nextEp);

    const card = document.createElement("article");
    card.className = `show watchlist-card watchlist-card--${escapeHTML(displayFilter)}`;

    const posterHTML = show.poster_path
    ? `<img class="poster" src="https://image.tmdb.org/t/p/w200${show.poster_path}" alt="${escapeHTML(show.title || "Show")} poster" loading="lazy">`
    : `<div class="poster-placeholder watchlist-poster-placeholder" aria-hidden="true"><span>${escapeHTML(getWatchlistPosterFallback(show))}</span></div>`;

    const actionHTML = action
    ? `
        <button
        type="button"
        class="check watchlist-action watchlist-action--${escapeHTML(action.action)}"
        data-watchlist-action="${escapeHTML(action.action)}"
        aria-label="${escapeHTML(action.label)}"
        title="${escapeHTML(action.label)}"
        ${action.disabled ? "disabled" : ""}>
            ${getWatchlistActionIcon(action.icon)}
        </button>
    `
    : `
        <div class="watchlist-complete-mark" role="img" aria-label="Completed" title="Completed">
            ${getWatchlistActionIcon("check")}
        </div>
    `;

    card.innerHTML = `

        ${posterHTML}

        <div class="info watchlist-info">

            <div class="watchlist-title-row">
                <button type="button" class="title watchlist-title-button" aria-label="Open ${escapeHTML(show.title || "show")} details">${escapeHTML(show.title)}</button>
                ${showNewBadge ? `<span class="new-badge watchlist-new-badge">NEW</span>` : ""}
            </div>

            <div class="episode">${episodeLine}</div>

            ${episodeTitle ? `<div class="episode-title">${episodeTitle}</div>` : ""}

            ${releaseMeta ? `<div class="watchlist-release-meta">${escapeHTML(releaseMeta)}</div>` : ""}

            <div class="watchlist-progress" aria-label="${escapeHTML(progress.label)}">
                <div class="watchlist-progress-copy">
                    <span>${escapeHTML(progress.label)}</span>
                    <span>${progress.percent}%</span>
                </div>
                <div class="watchlist-progress-track" aria-hidden="true">
                    <span class="watchlist-progress-fill" style="width:${progress.percent}%"></span>
                </div>
            </div>

        </div>

        ${actionHTML}

    `;

    const openDetails = ()=>{
        openShowModal(show.tmdb_id);
    };

    card.addEventListener("click",openDetails);

    const titleButton = card.querySelector(".watchlist-title-button");

    if(titleButton){
        titleButton.addEventListener("click",function(event){
            event.stopPropagation();
            openDetails();
        });
    }

    const actionButton = card.querySelector(".watchlist-action");

    if(actionButton && action && !action.disabled){

        actionButton.addEventListener("click",async function(event){

            event.stopPropagation();
            this.disabled = true;

            try{

                await playCheckSuccessAnimation(this);

                if(action.action === "mark"){
                    await markNextEpisode(show.tmdb_id);
                }else{
                    await updateShowStatus(show.tmdb_id,"watching");
                }

            }finally{

                if(this.isConnected){
                    this.disabled = false;
                }

            }

        });

    }

    return card;

}




function renderWatchlist(){

    renderLibrarySearchControl();

    const list = document.getElementById("show-list");

    list.innerHTML = "";

    const query = getLibrarySearchQuery();

    let shows;

    if(query){

        shows = Object.values(DATA.shows)
        .filter(show=>filterShow(show))
        .filter(show=>libraryShowMatchesSearch(show,query))
        .sort((a,b)=>sortLibrarySearchResults(a,b,query));

    }else{

        shows = Object.values(DATA.shows)
        .filter(show=>filterShow(show))
        .sort((a,b)=>{

            const dateA = a.last_watched || a.date_added || "";
            const dateB = b.last_watched || b.date_added || "";

            return new Date(dateB) - new Date(dateA);

        });

    }

    if(shows.length === 0){

        const empty = document.createElement("div");
        empty.innerHTML = query ? getLibrarySearchEmptyHTML(query) : getWatchlistEmptyHTML();
        list.appendChild(empty.firstElementChild);
        return;

    }

    shows.forEach(show=>{
        list.appendChild(
            createWatchlistCard(show)
        );
    });

}



async function renderUpcoming(startBackgroundRefresh=true){

    const list = document.getElementById("show-list");

    list.innerHTML = "";

    const upcoming = getUpcomingShows();

    if(upcoming.length === 0){

        list.innerHTML = `
            <div class="empty-state">
                <h2>Your schedule is clear.</h2>
                <p>Missed episodes and future releases with real dates will appear here.</p>
            </div>
        `;

        if(startBackgroundRefresh){
            refreshUpcomingDataInBackground();
        }

        return;

    }

    const groupOrder = [
        "Catch Up",
        "Yesterday",
        "Today",
        "Tomorrow",
        "This Week",
        "This Month",
        "Later"
    ];

    groupOrder.forEach(groupName=>{

        const groupItems = upcoming.filter(item=>{
            return item.group === groupName;
        });

        if(groupItems.length === 0){
            return;
        }

        const groupBox = document.createElement("div");
        groupBox.className = "upcoming-group";

        groupBox.innerHTML = `
            <div class="upcoming-group-title">
                ${escapeHTML(groupName)}
            </div>
        `;

        const displayItems = prepareUpcomingDisplayItems(groupItems);

        displayItems.forEach(display=>{

            const item = display.item;
            const show = item.show;
            const ep = item.episode;
            const extraEpisodes = display.extraEpisodes || [];

            const card = document.createElement("div");
            card.className = "show upcoming-entry-card";

            const imagePath =
            ep.still_path ||
            show.poster_path ||
            "";

            const imageHTML = imagePath
            ? `<img class="upcoming-still" loading="lazy" src="https://image.tmdb.org/t/p/w300${imagePath}">`
            : `<div class="upcoming-still-placeholder">📺</div>`;

            const regularBehindText =
            !display.isBatch && item.behindCount > 0
            ? `${item.behindCount} more episode${item.behindCount === 1 ? "" : "s"} behind`
            : "";

            // A row can cross from future to available while it is already
            // displayed as a Today schedule item. Do not rely only on ep.type.
            const canLog = isEpisodeAired(ep.air_date,ep);

            const displayIsNew =
            canLog &&
            (
                item.isNew ||
                isNewUpcomingEpisode(show,ep) ||
                isRecentlyAvailableEpisode(ep)
            );

            const batchOpen =
            display.batchKey &&
            expandedUpcomingBatches[display.batchKey];

            const batchButtonHTML = display.isBatch
            ? `
                <button class="upcoming-batch-button" data-batch="${escapeHTML(display.batchKey)}">
                    ${batchOpen ? "Hide episodes ▴" : `View ${extraEpisodes.length} more ▾`}
                </button>
            `
            : "";

            const batchListHTML = display.isBatch && batchOpen
            ? renderUpcomingBatchEpisodesHTML(show,extraEpisodes)
            : "";

            card.innerHTML = `

                ${imageHTML}

                <div class="info">

                    <div class="title">
                        ${escapeHTML(show.title)}
                    </div>

                    <div class="upcoming-episode-line">
                        S${ep.season_number}E${String(ep.episode_number).padStart(2,"0")} — ${escapeHTML(ep.name || "Untitled Episode")}
                    </div>

                    ${
                    regularBehindText
                    ? `<button class="upcoming-behind" type="button">${escapeHTML(regularBehindText)}</button>`
                    : ""
                    }

                    ${batchButtonHTML}

                    ${
                    displayIsNew
                    ? `<div class="new-badge">NEW</div>`
                    : ""
                    }

                    ${batchListHTML}

                </div>

                <div class="upcoming-time">
                    ${escapeHTML(item.timeLabel)}
                </div>

                ${
                canLog
                ? `<div class="check upcoming-check" data-show="${show.tmdb_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}"></div>`
                : ""
                }

            `;

            card.addEventListener("click",function(){
                openEpisodeModal(
                    show.tmdb_id,
                    ep.season_number,
                    ep.episode_number,
                    {backToShow:false}
                );
            });

            const batchButton = card.querySelector(".upcoming-batch-button");

            if(batchButton){

                batchButton.addEventListener("click",function(event){

                    event.stopPropagation();

                    const key = this.dataset.batch;

                    expandedUpcomingBatches[key] = !expandedUpcomingBatches[key];

                    renderUpcoming(false);

                });

            }

            card.querySelectorAll(".upcoming-batch-row").forEach(row=>{

                row.addEventListener("click",function(event){

                    event.stopPropagation();

                    openEpisodeModal(
                        this.dataset.show,
                        Number(this.dataset.season),
                        Number(this.dataset.episode),
                        {backToShow:false}
                    );

                });

            });


            card.querySelectorAll(".upcoming-check, .upcoming-batch-check").forEach(check=>{

                check.addEventListener("click",async function(event){

                    event.stopPropagation();
                    await playCheckSuccessAnimation(this);

                    await updateEpisodeWatched(
                        Number(this.dataset.show),
                        Number(this.dataset.season),
                        Number(this.dataset.episode),
                        true
                    );

                    await renderUpcoming(false);

                });

            });

            groupBox.appendChild(card);

        });

        list.appendChild(groupBox);

    });

    if(startBackgroundRefresh){
        refreshUpcomingDataInBackground();
    }

}



function prepareUpcomingDisplayItems(groupItems){

    const displayItems = [];
    const used = new Set();

    groupItems.forEach((item,index)=>{

        if(used.has(index)){
            return;
        }

        const show = item.show;
        const ep = item.episode;

        if(ep.type === "future"){

            const batchIndexes = groupItems
            .map((candidate,candidateIndex)=>{
                return {candidate,candidateIndex};
            })
            .filter(entry=>{

                const other = entry.candidate;
                const otherEp = other.episode;

                return (
                    otherEp.type === "future" &&
                    String(other.show.tmdb_id) === String(show.tmdb_id) &&
                    Number(otherEp.season_number) === Number(ep.season_number) &&
                    String(otherEp.air_date || "") === String(ep.air_date || "")
                );

            });

            batchIndexes.forEach(entry=>{
                used.add(entry.candidateIndex);
            });

            const sortedBatch = batchIndexes
            .map(entry=>entry.candidate)
            .sort((a,b)=>{
                return Number(a.episode.episode_number) - Number(b.episode.episode_number);
            });

            displayItems.push({
                item:sortedBatch[0],
                extraEpisodes:sortedBatch.slice(1).map(batchItem=>batchItem.episode),
                isBatch:sortedBatch.length > 1,
                batchKey:getUpcomingBatchKey(show,sortedBatch[0].episode)
            });

            return;

        }

        const sameBatchBehind = (item.behindEpisodes || [])
        .filter(extra=>{

            return (
                Number(extra.season_number) === Number(ep.season_number) &&
                String(extra.air_date || "") === String(ep.air_date || "")
            );

        })
        .sort((a,b)=>{
            return Number(a.episode_number) - Number(b.episode_number);
        });

        used.add(index);

        displayItems.push({
            item:item,
            extraEpisodes:sameBatchBehind,
            isBatch:sameBatchBehind.length > 0,
            batchKey:getUpcomingBatchKey(show,ep)
        });

    });

    return displayItems;

}




function getUpcomingBatchKey(show,episode){

    return [
        String(show.tmdb_id),
        String(episode.season_number),
        String(episode.air_date || ""),
        String(episode.type || "")
    ].join("-");

}




function isRecentlyAvailableEpisode(episode){

    if(!episode || !episode.air_date){
        return false;
    }

    if(!isEpisodeAired(episode.air_date,episode)){
        return false;
    }

    const diffDays = getDayDiffFromToday(episode.air_date,episode);

    return diffDays !== null && diffDays >= 0 && diffDays <= 4;

}



function renderUpcomingBatchEpisodesHTML(show,episodes){

    if(!episodes || episodes.length === 0){
        return "";
    }

    let html = `<div class="upcoming-batch-list">`;

    episodes.forEach(ep=>{

        // Batch rows can also become available after their release time passes.
        const canLog = isEpisodeAired(ep.air_date,ep);

        const imagePath =
        ep.still_path ||
        show.poster_path ||
        "";

        const imageHTML = imagePath
        ? `<img class="upcoming-batch-still" loading="lazy" src="https://image.tmdb.org/t/p/w300${imagePath}">`
        : `<div class="upcoming-batch-still-placeholder">📺</div>`;

        html += `
            <div class="upcoming-batch-row" data-show="${show.tmdb_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}">

                ${imageHTML}

                <div class="upcoming-batch-info">

                    <div class="upcoming-batch-episode">
                        S${ep.season_number}E${String(ep.episode_number).padStart(2,"0")} — ${escapeHTML(ep.name || "Untitled Episode")}
                    </div>

                    <div class="upcoming-batch-date">
                        ${escapeHTML(getUpcomingTimeLabel(ep.air_date,ep))}
                    </div>

                </div>

                ${
                canLog
                ? `<div class="check upcoming-batch-check" data-show="${show.tmdb_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}"></div>`
                : ""
                }

            </div>
        `;

    });

    html += `</div>`;

    return html;

}







function getCatchUpEpisodesForPopup(currentEpisode,behindEpisodes){

    const episodeMap = new Map();

    [currentEpisode].concat(behindEpisodes || []).forEach(ep=>{

        if(!ep){
            return;
        }

        const season = Number(ep.season_number || ep.season || 0);
        const episode = Number(ep.episode_number || ep.episode || 0);

        if(!season || !episode){
            return;
        }

        episodeMap.set(`${season}-${episode}`,{
            season_number:season,
            episode_number:episode,
            name:ep.name || "",
            air_date:ep.air_date || "",
            still_path:ep.still_path || "",
            air_time:ep.air_time || "",
            air_timestamp:ep.air_timestamp || "",
            tvmaze_airdate:ep.tvmaze_airdate || "",
            type:ep.type || "missed"
        });

    });

    return Array.from(episodeMap.values()).sort((a,b)=>{

        if(Number(a.season_number) !== Number(b.season_number)){
            return Number(a.season_number) - Number(b.season_number);
        }

        return Number(a.episode_number) - Number(b.episode_number);

    });

}



function getBehindPopupElement(){

    let overlay = document.getElementById("behind-popup");

    if(overlay){
        return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = "behind-popup";
    overlay.className = "behind-popup-overlay";

    document.body.appendChild(overlay);

    return overlay;

}



function closeBehindEpisodesPopup(){

    const overlay = document.getElementById("behind-popup");

    if(overlay){
        overlay.style.display = "none";
    }

}



function openBehindEpisodesPopup(showId,episodes){

    const show = DATA.shows[String(showId)];

    if(!show || !episodes || episodes.length === 0){
        return;
    }

    const overlay = getBehindPopupElement();

    const rowsHTML = episodes.map(ep=>{

        const episodeData = getEpisodeData(show,ep.season_number,ep.episode_number);

        const title =
        ep.name ||
        episodeData.name ||
        "Untitled Episode";

        const imagePath =
        ep.still_path ||
        episodeData.still_path ||
        show.poster_path ||
        "";

        const imageHTML = imagePath
        ? `<img class="behind-episode-still" loading="lazy" src="https://image.tmdb.org/t/p/w300${imagePath}">`
        : `<div class="behind-episode-still-placeholder">📺</div>`;

        return `
            <div class="behind-episode-row" data-show="${show.tmdb_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}">

                ${imageHTML}

                <div class="behind-episode-info">
                    <div class="behind-episode-number">
                        S${ep.season_number}E${String(ep.episode_number).padStart(2,"0")}
                    </div>
                    <div class="behind-episode-title">
                        ${escapeHTML(title)}
                    </div>
                    <div class="behind-episode-date">
                        ${escapeHTML(getUpcomingTimeLabel(ep.air_date,ep))}
                    </div>
                </div>

                <button
                class="behind-episode-check episode-check-button"
                data-show="${show.tmdb_id}"
                data-season="${ep.season_number}"
                data-episode="${ep.episode_number}"
                title="Mark watched up to this episode">
                </button>

            </div>
        `;

    }).join("");

    overlay.innerHTML = `
        <div class="behind-popup-box">

            <button class="behind-popup-close" type="button">×</button>

            <h2>Catch Up</h2>

            <p>
                Choose the episode you watched. Earlier available episodes will be marked too.
            </p>

            <div class="behind-episode-list">
                ${rowsHTML}
            </div>

        </div>
    `;

    overlay.style.display = "flex";

    overlay.querySelector(".behind-popup-close").addEventListener("click",function(){
        closeBehindEpisodesPopup();
    });

    overlay.onclick = function(event){

        if(event.target === overlay){
            closeBehindEpisodesPopup();
        }

    };

    overlay.querySelectorAll(".behind-episode-row").forEach(row=>{

        row.addEventListener("click",function(event){

            if(event.target.closest(".behind-episode-check")){
                return;
            }

            closeBehindEpisodesPopup();

            openEpisodeModal(
                this.dataset.show,
                Number(this.dataset.season),
                Number(this.dataset.episode),
                {backToShow:false}
            );

        });

    });

    overlay.querySelectorAll(".behind-episode-check").forEach(button=>{

        button.addEventListener("click",async function(event){

            event.stopPropagation();

            await playCheckSuccessAnimation(this);

            await updateEpisodeWatched(
                this.dataset.show,
                Number(this.dataset.season),
                Number(this.dataset.episode),
                true
            );

            closeBehindEpisodesPopup();
            await renderUpcoming(false);

        });

    });

}



function renderHistory(){

    const list = document.getElementById("show-list");

    list.innerHTML = "";

    const allHistoryEntries = getHistoryEntries();

    if(allHistoryEntries.length === 0){

        list.innerHTML = `
            <div class="empty-state">
                <h2>No watch history yet.</h2>
                <p>Use a circle on any episode to start building your history.</p>
            </div>
        `;

        return;

    }

    const historyEntries = allHistoryEntries.slice(0,historyVisibleLimit);
    const groups = groupHistoryByDate(historyEntries);
    const fragment = document.createDocumentFragment();

    groups.forEach(group=>{

        const groupBox = document.createElement("div");
        groupBox.className = "history-group";

        groupBox.innerHTML = `
            <div class="history-group-title">
                ${escapeHTML(group.label)}
            </div>
        `;

        group.entries.forEach(entry=>{

            const show = DATA.shows[String(entry.tmdb_id)] || {};
            const episodeData = getEpisodeData(show,entry.season,entry.episode);

            const stillPath =
            entry.episode_still_path ||
            episodeData.still_path ||
            "";

            const card = document.createElement("div");
            card.className = "show history-entry-card";

            const imageHTML = stillPath
            ? `<img class="history-still" loading="lazy" src="https://image.tmdb.org/t/p/w185${stillPath}">`
            : `<div class="history-still-placeholder">📺</div>`;

            const episodeTitle =
            entry.episode_title ||
            episodeData.name ||
            "Untitled Episode";

            card.innerHTML = `

                ${imageHTML}

                <div class="info">

                    <div class="title">
                        ${escapeHTML(entry.title || show.title || "Unknown Show")}
                    </div>

                    <div class="history-episode-line">
                        S${entry.season}E${String(entry.episode).padStart(2,"0")} — ${escapeHTML(episodeTitle)}
                    </div>

                </div>

                <div class="history-time">
                    ${formatHistoryRelative(entry.watched_at)}
                </div>

            `;

            card.addEventListener("click",function(){

                if(DATA.shows[String(entry.tmdb_id)]){
                    openEpisodeModal(
                        entry.tmdb_id,
                        entry.season,
                        entry.episode,
                        {backToShow:false}
                    );
                }

            });

            groupBox.appendChild(card);

        });

        fragment.appendChild(groupBox);

    });

    list.appendChild(fragment);

    if(allHistoryEntries.length > historyEntries.length){

        const moreButton = document.createElement("button");
        moreButton.className = "history-load-more";
        moreButton.type = "button";
        moreButton.textContent = "Load More";

        moreButton.addEventListener("click",function(){
            historyVisibleLimit += HISTORY_BATCH_SIZE;
            renderHistory();
        });

        list.appendChild(moreButton);

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
                name:String(network || "").trim(),
                logo_path:""
            };
        }

        if(network && network.name){
            return {
                name:String(network.name || "").trim(),
                logo_path:network.logo_path || ""
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


function getShowNetworkText(show){

    return getShowNetworkItems(show)
    .map(network=>network.name)
    .join(" • ");

}


function getShowNetworkInlineHTML(show){

    const networks = getShowNetworkItems(show).slice(0,3);

    if(!networks.length){
        return "";
    }

    return `<span class="network-inline-group">${networks.map(network=>{

        if(network.logo_path){
            return `
                <span class="network-logo-chip" title="${escapeHTML(network.name)}">
                    <img class="network-logo-inline" src="https://image.tmdb.org/t/p/w92${escapeHTML(network.logo_path)}" alt="${escapeHTML(network.name)}">
                </span>
            `;
        }

        return `<span class="network-name-inline">${escapeHTML(network.name)}</span>`;

    }).join("")}</span>`;

}


function getShowMetaHTML(show,year,genres,ratingHTML){

    const networkHTML = getShowNetworkInlineHTML(show);
    let html = `<span>${escapeHTML(year)}</span>`;

    if(networkHTML){
        html += `<span class="modal-meta-separator">•</span>${networkHTML}`;
    }

    if(genres){
        html += `<span class="modal-meta-separator">•</span><span>${escapeHTML(genres)}</span>`;
    }

    if(ratingHTML){
        html += ratingHTML;
    }

    return html;

}

function renderDiscoverShowModal(show){

    const content = document.getElementById("show-modal-content");

    const year = show.first_air_date
    ? show.first_air_date.slice(0,4)
    : "Unknown";

    const genres = show.genres && show.genres.length
    ? show.genres.join(" • ")
    : "";

    const ratingAvailable =
    typeof show.tmdb_rating === "number" &&
    show.tmdb_rating > 0;

    const ratingHTML = ratingAvailable
    ? `<span class="modal-meta-separator">•</span><span class="tmdb-rating-group"><span class="tmdb-rating-inline">${Number(show.tmdb_rating).toFixed(1)}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>`
    : "";

    const backdrop = show.backdrop_path
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.4) 60%), url("https://image.tmdb.org/t/p/w780${show.backdrop_path}")`
    : `linear-gradient(to top, #080808 0%, #111 100%)`;

    const nextEpisode = show.next_episode_to_air
    ? `S${show.next_episode_to_air.season_number}E${show.next_episode_to_air.episode_number} — ${escapeHTML(show.next_episode_to_air.name || "Untitled Episode")}`
    : "None";

    const previewKey = getDiscoverPreviewKey(show);

    if(!expandedSeasons[previewKey]){
        expandedSeasons[previewKey] = {"1":true};
    }

    content.innerHTML = `

        <div class="modal-hero show-detail-hero" style='background-image:${backdrop}'>

            <div class="modal-hero-content">

                <div class="modal-title">
                    ${escapeHTML(show.title)}
                </div>

            </div>

        </div>



        <div class="modal-body">

            <div class="modal-section modal-status-section">

                <div class="modal-status-buttons">

                    ${discoverAddButtonHTML(show,"watching","Add to Watching")}
                    ${discoverAddButtonHTML(show,"plan","Add to Plan To Watch")}
                    ${discoverAddButtonHTML(show,"paused","Add to Paused")}
                    ${discoverAddButtonHTML(show,"finished","Add to Completed")}
                    ${discoverAddButtonHTML(show,"dropped","Add to Dropped")}

                </div>

                <div class="modal-meta modal-meta-under-status">
                    ${getShowMetaHTML(show,year,genres,ratingHTML)}
                </div>

            </div>



            <div class="modal-section">
                <h3>Synopsis</h3>
                <div class="modal-overview">
                    ${escapeHTML(show.overview || "No overview available.")}
                </div>
            </div>



            <div class="modal-section">
                <h3>Details</h3>
                <div class="modal-overview">
                    Status: ${escapeHTML(show.tmdb_status || "Unknown")}<br>
                    Seasons: ${show.number_of_seasons || 0}<br>
                    Episodes: ${show.number_of_episodes || 0}<br>
                    Next episode: ${nextEpisode}
                </div>
            </div>



            <div class="modal-section">
                <h3>Seasons</h3>
                <div class="seasons-list">
                    ${renderDiscoverPreviewSeasonsHTML(show)}
                </div>
            </div>

        </div>

    `;

    document.querySelectorAll(".discover-add-status-button").forEach(button=>{

        button.addEventListener("click",function(){
            addDiscoverPreviewShow(this.dataset.status);
        });

    });

    document.querySelectorAll(".discover-season-header").forEach(header=>{

        header.addEventListener("click",function(){

            const season = this.dataset.season;

            if(!expandedSeasons[previewKey]){
                expandedSeasons[previewKey] = {};
            }

            expandedSeasons[previewKey][String(season)] = !expandedSeasons[previewKey][String(season)];

            renderDiscoverShowModal(show);

        });

    });

    document.querySelectorAll(".discover-episode-row").forEach(row=>{

        row.addEventListener("click",async function(){

            await openDiscoverEpisodeModal(
                show.tmdb_id,
                this.dataset.season,
                this.dataset.episode
            );

        });

    });

}



function getDiscoverPreviewKey(show){

    return "discover-" + String(show && show.tmdb_id ? show.tmdb_id : "preview");

}



function renderDiscoverPreviewSeasonsHTML(show){

    const seasonCount = Math.max(show.number_of_seasons || 1,1);
    const previewKey = getDiscoverPreviewKey(show);

    if(!expandedSeasons[previewKey]){
        expandedSeasons[previewKey] = {"1":true};
    }

    let html = "";

    for(let season = 1; season <= seasonCount; season++){

        const isOpen = !!expandedSeasons[previewKey][String(season)];

        const episodeList =
        show._episode_list &&
        Array.isArray(show._episode_list[String(season)])
        ? show._episode_list[String(season)]
        : [];

        const total = episodeList.length || (show._season_episodes ? show._season_episodes[String(season)] : 0);

        html += `

            <div class="season-box ${isOpen ? "open" : ""}">

                <div class="season-header discover-season-header" data-season="${season}">

                    <div class="season-left">
                        <div class="season-arrow">▸</div>
                        <div class="season-title">Season ${season}</div>
                    </div>

                    <div class="season-count">${total ? `${total} episodes` : "Loading..."}</div>

                </div>

                ${
                isOpen
                ? `<div class="season-episodes">${renderDiscoverPreviewEpisodesHTML(show,season,episodeList)}</div>`
                : ""
                }

            </div>

        `;

    }

    return html;

}



function renderDiscoverPreviewEpisodesHTML(show,seasonNumber,episodeList){

    if(!episodeList || episodeList.length === 0){
        return `<div class="season-loading">Loading episode list...</div>`;
    }

    let html = "";

    episodeList.forEach(ep=>{

        html += `
            <div
            class="episode-row discover-episode-row ${isEpisodeAired(ep.air_date,ep) ? "" : "future"}"
            data-season="${seasonNumber}"
            data-episode="${ep.episode_number}">
                <div class="episode-name">
                    E${ep.episode_number} — "${escapeHTML(ep.name || "Untitled Episode")}"
                </div>
                <div class="episode-date">
                    ${ep.air_date ? escapeHTML(formatAirDate(ep.air_date,ep)) : "Unknown"}
                </div>
            </div>
        `;

    });

    return html;

}



function discoverAddButtonHTML(show,status,label){

    if(!isStatusAllowedForShow(show,status)){
        return "";
    }

    return `
        <button
        class="modal-status-button discover-add-status-button"
        data-status="${status}">
            ${label}
        </button>
    `;

}



function renderShowModal(show){

    const content = document.getElementById("show-modal-content");

    const year = show.first_air_date
    ? show.first_air_date.slice(0,4)
    : "Unknown";

    const genres = show.genres && show.genres.length
    ? show.genres.join(" • ")
    : "";

    const ratingAvailable =
    typeof show.tmdb_rating === "number" &&
    show.tmdb_rating > 0;

    const ratingHTML = ratingAvailable
    ? `<span class="modal-meta-separator">•</span><span class="tmdb-rating-group"><span class="tmdb-rating-inline">${Number(show.tmdb_rating).toFixed(1)}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>`
    : "";

    const watchedCount = getWatchedEpisodeCount(show);
    const totalCount = show.status === "finished"
    ? Math.max(watchedCount,getTotalEpisodeCount(show))
    : getTotalEpisodeCount(show);
    const progressPercent = show.status === "finished"
    ? 100
    : totalCount
    ? Math.round((watchedCount / totalCount) * 100)
    : 0;

    const progressText = show.status === "finished"
    ? `Completed • ${totalCount} / ${totalCount} episodes`
    : `${watchedCount} / ${totalCount} episodes`;

    const backdrop = show.backdrop_path
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.4) 60%), url("https://image.tmdb.org/t/p/w780${show.backdrop_path}")`
    : `linear-gradient(to top, #080808 0%, #111 100%)`;

    content.innerHTML = `

        <div class="modal-hero show-detail-hero" style='background-image:${backdrop}'>

            <div class="modal-hero-content">

                <div class="modal-title">
                    ${escapeHTML(show.title)}
                </div>

            </div>

        </div>



        <div class="modal-body">

            <div class="modal-section modal-status-section">

                <div class="modal-status-buttons">

                    ${statusButtonHTML(show,"watching","Watching")}
                    ${statusButtonHTML(show,"plan","Plan To Watch")}
                    ${statusButtonHTML(show,"paused","Paused")}
                    ${statusButtonHTML(show,"finished","Completed")}
                    ${statusButtonHTML(show,"dropped","Dropped")}

                    <button class="remove-show-button" id="remove-show-button">
                        Remove
                    </button>

                </div>

                <div class="modal-meta modal-meta-under-status">
                    ${getShowMetaHTML(show,year,genres,ratingHTML)}
                </div>

            </div>



            <div class="modal-section">

                <h3>Synopsis</h3>

                <div class="modal-overview">
                    ${escapeHTML(show.overview || "No overview available.")}
                </div>

            </div>



            <div class="modal-section">

                <h3>Overall Progress</h3>

                <div class="progress-text">
                    ${progressText}
                </div>

                <div class="progress-bar">
                    <div class="progress-fill" style="width:${progressPercent}%"></div>
                </div>

            </div>



            <div class="modal-section">

                <h3>Episodes</h3>

                <div class="seasons-list">
                    ${renderSeasonsHTML(show)}
                </div>

            </div>

        </div>

    `;


    document.querySelectorAll(".modal-status-button").forEach(button=>{

        button.addEventListener("click",function(){
            updateShowStatus(show.tmdb_id,this.dataset.status);
        });

    });


    document.querySelectorAll(".season-header").forEach(header=>{

        header.addEventListener("click",function(){
            toggleSeason(show.tmdb_id,Number(this.dataset.season));
        });

    });


    document.querySelectorAll(".season-all-button").forEach(button=>{

        button.addEventListener("click",async function(event){
            event.stopPropagation();

            if(!this.classList.contains("checked")){
                await playCheckSuccessAnimation(this);
            }

            await markSeasonWatched(
                show.tmdb_id,
                Number(this.dataset.season)
            );
        });

    });


    document.querySelectorAll(".episode-check-button").forEach(button=>{

        button.addEventListener("click",async function(event){

            event.stopPropagation();

            const currentlyWatched = this.dataset.watched === "true";

            if(!currentlyWatched){
                await playCheckSuccessAnimation(this);
            }

            await updateEpisodeWatched(
                show.tmdb_id,
                Number(this.dataset.season),
                Number(this.dataset.episode),
                !currentlyWatched
            );

        });

    });


    document.querySelectorAll(".episode-row[data-season][data-episode]").forEach(row=>{

        row.addEventListener("click",function(){

            openEpisodeModal(
                show.tmdb_id,
                Number(this.dataset.season),
                Number(this.dataset.episode),
                {backToShow:true}
            );

        });

    });


    document.getElementById("remove-show-button").addEventListener("click",function(){
        removeShow(show.tmdb_id);
    });

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



function getEpisodeNavLabel(prefix,target){

    if(!target){
        return "";
    }

    return `${prefix} S${target.season}E${String(target.episode).padStart(2,"0")}`;

}



function renderEpisodeModal(show,seasonNumber,episodeNumber,context={}){

    const content = document.getElementById("show-modal-content");
    const isDiscoverPreview = context && context.discoverPreview;
    const episodeData = getEpisodeData(show,seasonNumber,episodeNumber);
    const historyEntry = getEpisodeHistoryEntry(show.tmdb_id,seasonNumber,episodeNumber);
    const isWatched = isEpisodeWatched(show,seasonNumber,episodeNumber);
    const aired = isEpisodeAired(episodeData.air_date,episodeData);

    const episodeTitle = episodeData.name || "Untitled Episode";
    const episodeCode = `S${seasonNumber}E${String(episodeNumber).padStart(2,"0")}`;

    const imagePath = episodeData.still_path || show.backdrop_path || show.poster_path || "";

    const backdrop = imagePath
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.4) 65%), url("https://image.tmdb.org/t/p/w780${imagePath}")`
    : `linear-gradient(to top, #080808 0%, #111 100%)`;

    const airDateText = episodeData.air_date
    ? formatAirDate(episodeData.air_date,episodeData)
    : "Unknown";

    const releaseTimeText = episodeData.air_date
    ? getEpisodeReleaseTimeText(episodeData.air_date,episodeData)
    : "";

    const runtimeText = episodeData.runtime
    ? `${episodeData.runtime} min`
    : "Unknown";

    const episodeRating = Number(episodeData.vote_average || 0);
    const episodeRatingHTML = episodeRating > 0
    ? `<span class="episode-rating-group"><span class="episode-rating-value">${episodeRating.toFixed(1)}</span><span class="episode-rating-slash">/</span><span class="episode-rating-ten">10</span></span>`
    : "";

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
    const statusClass = isDiscoverPreview
    ? "preview"
    : isWatched
    ? "watched"
    : aired
    ? "unwatched"
    : "future";

    const showButtonLabel = isDiscoverPreview
    ? "Show Details"
    : context && context.backToShow
    ? "Back to Show"
    : "Open Show";
    const previousEpisodeTarget = getPreviousEpisodeTarget(show,seasonNumber,episodeNumber);
    const nextEpisodeTarget = getNextEpisodeTarget(show,seasonNumber,episodeNumber);

    content.innerHTML = `

        <div class="modal-hero episode-detail-hero" style='background-image:${backdrop}'>

            <div class="modal-hero-content episode-detail-hero-content">

                <div class="modal-title episode-detail-title">
                    ${escapeHTML(episodeTitle)}
                </div>

                <div class="modal-meta episode-detail-meta-line">
                    <span>${escapeHTML(show.title)}</span>
                    <span class="episode-meta-separator">•</span>
                    <span>${escapeHTML(episodeCode)}</span>
                    <span class="episode-meta-separator">•</span>
                    <span>${escapeHTML(airDateText)}</span>
                    ${releaseTimeText ? `<span class="episode-meta-separator">•</span><span>${escapeHTML(releaseTimeText)}</span>` : ""}
                    ${runtimeText !== "Unknown" ? `<span class="episode-meta-separator">•</span><span>${escapeHTML(runtimeText)}</span>` : ""}
                    ${episodeRatingHTML ? `<span class="episode-meta-separator">•</span>${episodeRatingHTML}` : ""}
                </div>

            </div>

        </div>



        <div class="modal-body episode-detail-body">

            <div class="modal-section episode-detail-actions">

                <button class="episode-detail-action-button" id="episode-open-show-button">
                    ${showButtonLabel}
                </button>

                ${
                previousEpisodeTarget
                ? `<button class="episode-detail-action-button episode-nav-button" id="episode-prev-button">
                    ${escapeHTML(getEpisodeNavLabel("← Previous",previousEpisodeTarget))}
                </button>`
                : `<button class="episode-detail-action-button episode-nav-button disabled" disabled>
                    First Episode
                </button>`
                }

                ${
                nextEpisodeTarget
                ? `<button class="episode-detail-action-button episode-nav-button" id="episode-next-button">
                    ${escapeHTML(getEpisodeNavLabel("Next",nextEpisodeTarget))} →
                </button>`
                : `<button class="episode-detail-action-button episode-nav-button disabled" disabled>
                    Latest Episode
                </button>`
                }

                ${
                canToggle
                ? `<button class="episode-detail-action-button primary" id="episode-toggle-watched-button">
                    ${isWatched ? "Mark Unwatched" : "Mark Watched"}
                </button>`
                : ""
                }

            </div>



            <div class="episode-detail-main modal-section">

                <div class="episode-detail-overview-card">
                    <div class="episode-detail-section-label">Episode Info</div>
                    <div class="episode-detail-overview">
                        ${escapeHTML(episodeData.overview || "No episode overview available.")}
                    </div>
                </div>

                <div class="episode-detail-grid">

                    <div class="episode-detail-info-card ${statusClass}">
                        <div class="episode-detail-label">Status</div>
                        <div class="episode-detail-value">${escapeHTML(statusText)}</div>
                    </div>

                    <div class="episode-detail-info-card">
                        <div class="episode-detail-label">Watched</div>
                        <div class="episode-detail-value">${escapeHTML(watchedText)}</div>
                    </div>


                </div>

            </div>

        </div>

    `;

    const openShowButton = document.getElementById("episode-open-show-button");

    if(openShowButton){

        openShowButton.addEventListener("click",function(){

            selectedEpisodeContext = null;

            if(isDiscoverPreview){

                const previewKey = getDiscoverPreviewKey(show);

                if(!expandedSeasons[previewKey]){
                    expandedSeasons[previewKey] = {};
                }

                expandedSeasons[previewKey][String(seasonNumber)] = true;

                renderDiscoverShowModal(show);
                return;

            }

            if(!expandedSeasons[String(show.tmdb_id)]){
                expandedSeasons[String(show.tmdb_id)] = {};
            }

            expandedSeasons[String(show.tmdb_id)][String(seasonNumber)] = true;

            renderShowModal(show);

        });

    }

    const previousButton = document.getElementById("episode-prev-button");

    if(previousButton && previousEpisodeTarget){

        previousButton.addEventListener("click",function(){

            if(isDiscoverPreview){
                openDiscoverEpisodeModal(
                    show.tmdb_id,
                    previousEpisodeTarget.season,
                    previousEpisodeTarget.episode
                );
                return;
            }

            openEpisodeModal(
                show.tmdb_id,
                previousEpisodeTarget.season,
                previousEpisodeTarget.episode,
                {backToShow:context && context.backToShow}
            );

        });

    }

    const nextButton = document.getElementById("episode-next-button");

    if(nextButton && nextEpisodeTarget){

        nextButton.addEventListener("click",function(){

            if(isDiscoverPreview){
                openDiscoverEpisodeModal(
                    show.tmdb_id,
                    nextEpisodeTarget.season,
                    nextEpisodeTarget.episode
                );
                return;
            }

            openEpisodeModal(
                show.tmdb_id,
                nextEpisodeTarget.season,
                nextEpisodeTarget.episode,
                {backToShow:context && context.backToShow}
            );

        });

    }



    const toggleButton = document.getElementById("episode-toggle-watched-button");

    if(toggleButton){

        toggleButton.addEventListener("click",async function(){

            await updateEpisodeWatched(
                show.tmdb_id,
                seasonNumber,
                episodeNumber,
                !isWatched
            );

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



function renderSeasonsHTML(show){

    const seasonCount = Math.max(show.number_of_seasons || 1,1);
    const showId = String(show.tmdb_id);

    let html = "";

    for(let season = 1; season <= seasonCount; season++){

        const isOpen =
        expandedSeasons[showId] &&
        expandedSeasons[showId][String(season)];

        const episodeList =
        show._episode_list &&
        Array.isArray(show._episode_list[String(season)])
        ? show._episode_list[String(season)]
        : null;

        const total = episodeList
        ? episodeList.length
        : show._season_episodes[String(season)];

        const watched = getSeasonWatchedCount(show,season);

        const watchedEpisodes = show.episodes_watched[String(season)] || [];

        const airedEpisodeNumbers = episodeList
        ? episodeList
            .filter(ep=>isEpisodeAired(ep.air_date,ep))
            .map(ep=>Number(ep.episode_number))
        : [];

        const seasonIsFullyWatched = airedEpisodeNumbers.length > 0
        ? airedEpisodeNumbers.every(episodeNumber=>watchedEpisodes.includes(episodeNumber))
        : total && watched >= total;

        html += `

            <div class="season-box ${isOpen ? "open" : ""}">

                <div class="season-header" data-season="${season}">

                    <div class="season-left">

                        <div class="season-arrow">
                            ▸
                        </div>

                        <div class="season-title">
                            Season ${season}
                        </div>

                    </div>

                    <div class="season-right">

                        <div class="season-count">
                            ${total ? `${watched} / ${total}` : ""}
                        </div>

                        <button
                        class="season-all-button ${seasonIsFullyWatched ? "checked" : ""}"
                        data-season="${season}"
                        title="${seasonIsFullyWatched ? "Mark season as unwatched" : "Mark aired episodes as watched"}">
                        </button>

                    </div>

                </div>

                ${
                isOpen
                ? `<div class="season-episodes">${renderSeasonEpisodesHTML(show,season)}</div>`
                : ""
                }

            </div>

        `;

    }

    return html;

}





function renderSeasonEpisodesHTML(show,seasonNumber){

    const episodeList =
    show._episode_list &&
    Array.isArray(show._episode_list[String(seasonNumber)])
    ? show._episode_list[String(seasonNumber)]
    : null;

    if(!episodeList || episodeList.length === 0){

        return "";

    }

    let html = "";

    episodeList.forEach(ep=>{

        const watchedEpisodes = show.episodes_watched[String(seasonNumber)] || [];
        const isWatched = watchedEpisodes.includes(ep.episode_number);
        const aired = isEpisodeAired(ep.air_date,ep);
        const canToggle = aired || isWatched;

        html += `

            <div class="${isWatched ? "episode-row watched" : aired ? "episode-row" : "episode-row future"}" data-season="${seasonNumber}" data-episode="${ep.episode_number}">

                <div class="episode-name">
                    E${ep.episode_number} — "${escapeHTML(ep.name || "Untitled Episode")}"
                </div>

                <button
                class="${isWatched ? "episode-check-button checked" : "episode-check-button"}"
                data-season="${seasonNumber}"
                data-episode="${ep.episode_number}"
                data-watched="${isWatched ? "true" : "false"}"
                ${canToggle ? "" : "disabled"}
                title="${canToggle ? (isWatched ? "Mark as unwatched" : "Mark as watched") : "Not aired yet"}">
                </button>

            </div>

        `;

    });

    return html;

}





function statusButtonHTML(show,status,label){

    if(!isStatusAllowedForShow(show,status)){
        return "";
    }

    return `
        <button
        class="modal-status-button ${show.status === status ? "active" : ""}"
        data-status="${status}">
            ${label}
        </button>
    `;

}





function openStatusPopup(show){

    pendingShow = show;

    document.getElementById("popup-title").textContent =
    "Add " + (show.title || show.name);

    document.querySelectorAll(".popup-buttons button").forEach(button=>{

        const status = button.dataset.status;

        if(isStatusAllowedForShow(show,status)){
            button.style.display = "";
        }else{
            button.style.display = "none";
        }

    });

    document.getElementById("status-popup").style.display = "flex";

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
        ? `<span class="ranked-network-logo"><img src="https://image.tmdb.org/t/p/w92${escapeHTML(item.logo_path)}" alt="${escapeHTML(item.name)}"></span>`
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


function renderSettings(){

    const settings = document.getElementById("settings-content");

    if(!settings){
        return;
    }

    ensureProfileData();
    profileSettingsDraft = createProfileSettingsDraft();

    const summary = getBackupSummary();

    const presetButtons = ["silhouette-1","silhouette-2","silhouette-3","silhouette-4"]
    .map(preset=>{
        return `
            <button class="avatar-preset-button" type="button" data-avatar-type="preset" data-avatar-preset="${preset}" title="Choose preset avatar">
                <span class="avatar-preset-preview">${getPresetAvatarSVG(preset)}</span>
            </button>
        `;
    }).join("");

    settings.innerHTML = `

        <div class="settings-inner">

            <h1>SETTINGS</h1>

            <div class="settings-section profile-settings-section">

                <div class="settings-section-header">
                    <h2>PROFILE</h2>
                </div>

                <div class="profile-settings-layout">

                    <div class="settings-avatar-preview" id="settings-avatar-preview">
                        ${getProfileAvatarInnerHTML(profileSettingsDraft)}
                    </div>

                    <div class="profile-settings-controls">

                        <label class="profile-settings-label" for="profile-username-input">Username</label>
                        <input class="profile-settings-input" id="profile-username-input" type="text" maxlength="30" value="${escapeHTML(profileSettingsDraft.username)}">

                        <div class="profile-settings-label avatar-label">Avatar</div>

                        <div class="avatar-preset-grid">
                            <button class="avatar-preset-button" type="button" data-avatar-type="initial" title="Use username initial">
                                <span class="avatar-initial-option">${escapeHTML(getProfileInitial(profileSettingsDraft.username))}</span>
                            </button>
                            ${presetButtons}
                        </div>

                        <div class="settings-button-list profile-settings-buttons">
                            <button class="settings-action-button muted" id="upload-profile-avatar" type="button">Upload Image</button>
                            <button class="settings-action-button muted" id="remove-profile-avatar" type="button">Remove Avatar</button>
                        </div>

                        <div class="profile-settings-label header-label">Profile Header</div>

                        <div id="profile-header-preview-wrap">
                            ${getProfileHeaderPreviewHTML(profileSettingsDraft)}
                        </div>

                        <div class="profile-header-preset-grid">
                            ${[
                                ["default","Default"],
                                ["blue","Blue"],
                                ["purple","Purple"],
                                ["green","Green"],
                                ["amber","Amber"],
                                ["monochrome","Monochrome"]
                            ].map(([preset,label])=>{
                                return `
                                    <button class="profile-header-preset-button profile-header-${preset}" type="button" data-profile-header-preset="${preset}">
                                        <span>${label}</span>
                                    </button>
                                `;
                            }).join("")}
                        </div>

                        <div class="settings-button-list profile-settings-buttons">
                            <button class="settings-action-button muted" id="upload-profile-header" type="button">Upload Header Image</button>
                            <button class="settings-action-button muted" id="remove-profile-header" type="button">Use Default Header</button>
                            <button class="settings-action-button" id="save-profile-settings" type="button">Save Profile</button>
                        </div>

                    </div>

                </div>

            </div>

            <div class="settings-section">

                <div class="settings-section-header">
                    <h2>APP BACKUP</h2>
                    <p>Export a full backup of this tracker.</p>
                </div>

                <div class="settings-summary-grid">
                    <div class="settings-summary-card">
                        <span>Shows</span>
                        <strong>${Number(summary.shows).toLocaleString()}</strong>
                    </div>

                    <div class="settings-summary-card">
                        <span>History Entries</span>
                        <strong>${Number(summary.historyEntries).toLocaleString()}</strong>
                    </div>

                    <div class="settings-summary-card">
                        <span>Favorites</span>
                        <strong>${Number(summary.favorites).toLocaleString()}</strong>
                    </div>
                </div>

                <div class="settings-button-list">
                    <button class="settings-action-button" id="export-native-backup-button" type="button">Export App Backup JSON</button>
                    <button class="settings-action-button" id="import-native-backup-button" type="button">Import App Backup JSON</button>
                    <button class="settings-action-button" id="export-html-report-button" type="button">Export HTML Report</button>
                </div>


            </div>

            <div class="settings-section subtle-section">
                <div class="settings-section-header">
                    <h2>EXPORT TO OTHER APPS</h2>
                    <p>On hold for now. Native App Backup JSON remains the main backup and restore format.</p>
                </div>
                <div class="settings-button-list">
                    <button class="settings-action-button muted" type="button" disabled>Simkl / Trakt Export Later</button>
                </div>
            </div>

            <div class="settings-section danger-section">
                <div class="settings-section-header">
                    <h2>DANGER ZONE</h2>
                    <p>Sign out or permanently delete all tracker data.</p>
                </div>
                <div class="settings-button-list danger-zone-actions">
                    <button class="settings-action-button danger" id="reset-data-button" type="button">Reset Data</button>
                    <form class="settings-logout-form" method="post" action="/logout">
                        <input type="hidden" name="csrf_token" value="${escapeHTML(csrfToken())}">
                        <button class="settings-action-button muted" type="submit">Log Out</button>
                    </form>
                </div>
            </div>

        </div>

    `;

    updateProfileSettingsPreview();

    const usernameInput = document.getElementById("profile-username-input");

    usernameInput.addEventListener("input",function(){
        profileSettingsDraft.username = this.value;
        const initial = document.querySelector(".avatar-initial-option");
        if(initial){
            initial.textContent = getProfileInitial(this.value);
        }
        if(profileSettingsDraft.avatar_type === "initial"){
            updateProfileSettingsPreview();
        }
    });

    document.querySelectorAll(".avatar-preset-button").forEach(button=>{
        button.addEventListener("click",function(){
            profileSettingsDraft.avatar_type = this.dataset.avatarType || "initial";
            profileSettingsDraft.avatar_preset = this.dataset.avatarPreset || "silhouette-1";
            if(profileSettingsDraft.avatar_type !== "upload"){
                profileSettingsDraft.avatar_data = "";
            }
            updateProfileSettingsPreview();
        });
    });

    document.getElementById("upload-profile-avatar").addEventListener("click",openAvatarFilePicker);

    document.getElementById("remove-profile-avatar").addEventListener("click",function(){
        profileSettingsDraft.avatar_type = "initial";
        profileSettingsDraft.avatar_data = "";
        updateProfileSettingsPreview();
    });

    document.querySelectorAll(".profile-header-preset-button").forEach(button=>{
        button.addEventListener("click",function(){
            profileSettingsDraft.header_type = "preset";
            profileSettingsDraft.header_preset = this.dataset.profileHeaderPreset || "default";
            profileSettingsDraft.header_image = "";
            updateProfileSettingsPreview();
        });
    });

    document.getElementById("upload-profile-header").addEventListener("click",openProfileHeaderFilePicker);

    document.getElementById("remove-profile-header").addEventListener("click",function(){
        profileSettingsDraft.header_type = "preset";
        profileSettingsDraft.header_preset = "default";
        profileSettingsDraft.header_image = "";
        updateProfileSettingsPreview();
    });

    document.getElementById("save-profile-settings").addEventListener("click",function(){
        profileSettingsDraft.username = usernameInput.value;
        saveProfileSettings(profileSettingsDraft);
    });

    document.getElementById("export-native-backup-button").addEventListener("click",exportNativeBackupJSON);
    document.getElementById("import-native-backup-button").addEventListener("click",importNativeBackupJSON);
    document.getElementById("export-html-report-button").addEventListener("click",exportHTMLReport);
    document.getElementById("reset-data-button").addEventListener("click",resetTrackerData);

}

function renderMetadataSyncPanel(){

    if(typeof getMetadataSyncSummary !== "function"){
        return "";
    }

    const sync = getMetadataSyncSummary();

    const stateText = sync.running
    ? "Running"
    : sync.paused
    ? "Paused"
    : sync.pending > 0
    ? "Ready"
    : sync.failed > 0
    ? "Needs Retry"
    : sync.total > 0
    ? "Complete"
    : "Idle";

    const currentText = sync.current
    ? `<p class="settings-small-note">Current: ${escapeHTML(sync.current)}</p>`
    : "";

    const errorText = sync.lastError
    ? `<p class="settings-small-note warning-note">Last issue: ${escapeHTML(sync.lastError)}</p>`
    : "";

    return `
        <div class="settings-section metadata-sync-section">
            <div class="settings-section-header">
                <h2>METADATA SYNC</h2>
                <p>Imports save your personal data first. Posters, TMDB matches, episode air dates, and TVmaze release times sync separately and can resume later.</p>
            </div>

            <div class="metadata-sync-status">
                <div class="metadata-sync-topline">
                    <strong>${escapeHTML(stateText)}</strong>
                    <span>${Number(sync.completed).toLocaleString()} / ${Number(sync.total).toLocaleString()}</span>
                </div>
                <div class="metadata-sync-bar">
                    <div class="metadata-sync-fill" style="width:${Number(sync.percent)}%"></div>
                </div>
                <div class="metadata-sync-details">
                    <span>Pending: ${Number(sync.pending).toLocaleString()}</span>
                    <span>Failed: ${Number(sync.failed).toLocaleString()}</span>
                    <span>${Number(sync.percent)}%</span>
                </div>
            </div>

            ${currentText}
            ${errorText}

            <div class="settings-button-list">
                <button class="settings-action-button" id="continue-metadata-sync-button" type="button" ${sync.pending > 0 || sync.failed > 0 ? "" : "disabled"}>Continue Sync</button>
                <button class="settings-action-button" id="pause-metadata-sync-button" type="button" ${sync.running || (sync.active && !sync.paused) ? "" : "disabled"}>Pause Sync</button>
                <button class="settings-action-button" id="retry-metadata-sync-button" type="button" ${sync.failed > 0 ? "" : "disabled"}>Retry Failed</button>
            </div>
        </div>
    `;

}


function renderCompatibleImportPreviewHTML(preview){

    if(!preview){
        return `
            <p class="settings-small-note">
                Choose your exported JSON file to preview it first, or use Import Compatible JSON when you are ready to replace the current tracker data.
            </p>
        `;
    }

    const statusCounts = preview.statusCounts || {};
    const mapped = preview.mappedStatusCounts || {};
    const warnings = Array.isArray(preview.warnings) ? preview.warnings : [];

    const statusRows = Object.keys(statusCounts).sort().map(status=>{
        return `
            <div class="settings-preview-row">
                <span>${escapeHTML(status)}</span>
                <strong>${Number(statusCounts[status]).toLocaleString()}</strong>
            </div>
        `;
    }).join("");

    const warningRows = warnings.map(warning=>{
        return `<li>${escapeHTML(warning)}</li>`;
    }).join("");

    return `
        <div class="compatible-preview-box">
            <div class="compatible-preview-header">
                <h3>IMPORT PREVIEW</h3>
                <p>${escapeHTML(preview.fileName)}</p>
            </div>

            <div class="settings-summary-grid preview-grid">
                <div class="settings-summary-card">
                    <span>Shows Found</span>
                    <strong>${Number(preview.shows).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Regular Watched</span>
                    <strong>${Number(preview.watchedRegularEpisodes).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Specials Watched</span>
                    <strong>${Number(preview.watchedSpecialEpisodes).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>TVDB IDs</span>
                    <strong>${Number(preview.tvdbIds).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>IMDb IDs</span>
                    <strong>${Number(preview.imdbIds).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Favorites</span>
                    <strong>${Number(preview.favorites).toLocaleString()}</strong>
                </div>
            </div>

            <div class="settings-preview-columns">
                <div class="settings-preview-panel">
                    <h4>Original Statuses</h4>
                    ${statusRows || `<p class="settings-small-note">No statuses found.</p>`}
                </div>

                <div class="settings-preview-panel">
                    <h4>Estimated App Statuses</h4>
                    <div class="settings-preview-row"><span>Completed</span><strong>${Number(mapped.completed || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Watching</span><strong>${Number(mapped.watching || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Plan To Watch</span><strong>${Number(mapped.plan || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Dropped</span><strong>${Number(mapped.dropped || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Needs Review</span><strong>${Number(mapped.review || 0).toLocaleString()}</strong></div>
                </div>
            </div>

            <ul class="settings-preview-warnings">
                ${warningRows}
            </ul>
        </div>
    `;

}


function renderCompatibleCSVPreviewHTML(preview){

    if(!preview){
        return `
            <p class="settings-small-note">
                Compatible CSV preview is separate from JSON. Select the series CSV and episodes CSV together to verify counts before we build full CSV import/export.
            </p>
        `;
    }

    const statusCounts = preview.statusCounts || {};
    const mapped = preview.mappedStatusCounts || {};
    const warnings = Array.isArray(preview.warnings) ? preview.warnings : [];

    const statusRows = Object.keys(statusCounts).sort().map(status=>{
        return `
            <div class="settings-preview-row">
                <span>${escapeHTML(status)}</span>
                <strong>${Number(statusCounts[status]).toLocaleString()}</strong>
            </div>
        `;
    }).join("");

    const warningRows = warnings.map(warning=>{
        return `<li>${escapeHTML(warning)}</li>`;
    }).join("");

    return `
        <div class="compatible-preview-box csv-preview-box">
            <div class="compatible-preview-header">
                <h3>CSV PREVIEW</h3>
                <p>${escapeHTML(preview.fileName)}</p>
            </div>

            <div class="settings-summary-grid preview-grid">
                <div class="settings-summary-card">
                    <span>Shows Found</span>
                    <strong>${Number(preview.shows).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Series Rows</span>
                    <strong>${Number(preview.seriesRows).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Episode Rows</span>
                    <strong>${Number(preview.episodeRows).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Regular Watched</span>
                    <strong>${Number(preview.watchedRegularEpisodes).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>Specials Watched</span>
                    <strong>${Number(preview.watchedSpecialEpisodes).toLocaleString()}</strong>
                </div>

                <div class="settings-summary-card">
                    <span>TVDB IDs</span>
                    <strong>${Number(preview.tvdbIds).toLocaleString()}</strong>
                </div>
            </div>

            <div class="settings-preview-columns">
                <div class="settings-preview-panel">
                    <h4>Original Statuses</h4>
                    ${statusRows || `<p class="settings-small-note">No statuses found. Select the series CSV too for status data.</p>`}
                </div>

                <div class="settings-preview-panel">
                    <h4>Estimated App Statuses</h4>
                    <div class="settings-preview-row"><span>Completed</span><strong>${Number(mapped.completed || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Watching</span><strong>${Number(mapped.watching || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Plan To Watch</span><strong>${Number(mapped.plan || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Dropped</span><strong>${Number(mapped.dropped || 0).toLocaleString()}</strong></div>
                    <div class="settings-preview-row"><span>Needs Review</span><strong>${Number(mapped.review || 0).toLocaleString()}</strong></div>
                </div>
            </div>

            <ul class="settings-preview-warnings">
                ${warningRows}
            </ul>
        </div>
    `;

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



function renderProfileHomeView(profile,stats){

    const favorites = stats.favoriteShows;

    let favoriteSlotsHTML = "";

    for(let i = 0; i < 8; i++){

        const show = favorites[i];

        if(show){

            const posterHTML = show.poster_path
            ? `<img src="https://image.tmdb.org/t/p/w300${show.poster_path}" alt="">`
            : `<div class="profile-favorite-placeholder">📺</div>`;

            favoriteSlotsHTML += `
                <button class="profile-favorite-slot filled" data-favorite-action="edit">
                    ${posterHTML}
                </button>
            `;

        }else{

            favoriteSlotsHTML += `
                <button class="profile-favorite-slot empty" data-favorite-action="edit">
                    +
                </button>
            `;

        }

    }

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
                    <img class="profile-stat-icon" src="/static/assets/WATCH%20TIME.svg" alt="">
                    <span>${escapeHTML(stats.watchTimeText)}</span>
                </div>
            </div>

            <div class="profile-stats-preview-divider"></div>

            <div class="profile-stats-preview-item">
                <div class="profile-stat-label">EPISODES WATCHED</div>
                <div class="profile-stat-value profile-stat-value-with-icon">
                    <img class="profile-stat-icon" src="/static/assets/EPISODES%20WATCHED.svg" alt="">
                    <span>${Number(stats.episodesWatched).toLocaleString()}</span>
                </div>
            </div>

            <div class="profile-stats-preview-arrow">›</div>

        </button>



        <div class="profile-section">

            <div class="profile-section-header">
                <h2>FAVORITE SHOWS</h2>

                <button class="profile-edit-button" id="edit-favorites-button">
                    Edit
                </button>
            </div>

            <div class="profile-favorites-grid">
                ${favoriteSlotsHTML}
            </div>

        </div>

    `;

    document.getElementById("open-profile-stats").addEventListener("click",function(){
        activeProfileView = "stats";
        renderProfile();
    });

    document.getElementById("edit-favorites-button").addEventListener("click",function(){
        openFavoritesPopup();
    });

    document.querySelectorAll("[data-favorite-action='edit']").forEach(button=>{

        button.addEventListener("click",function(){
            openFavoritesPopup();
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

function openFavoritesPopup(){

    renderFavoritesPopup();

    document.getElementById("favorites-popup").style.display = "flex";

}



function closeFavoritesPopup(){

    document.getElementById("favorites-popup").style.display = "none";

}



function renderFavoritesPopup(){

    const content = document.getElementById("favorites-popup-content");

    if(!content){
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
        ? `<img src="https://image.tmdb.org/t/p/w200${show.poster_path}" alt="" draggable="false">`
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
            ? `<img src="https://image.tmdb.org/t/p/w92${show.poster_path}" alt="" draggable="false">`
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