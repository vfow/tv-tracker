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

function trackerImageHTML(path,size,className,alt="",attrs=""){
    const url = trackerImageURL(path,size);
    if(!url){
        return "";
    }
    return `<img${className ? ` class="${escapeHTML(className)}"` : ""} src="${escapeHTML(url)}" alt="${escapeHTML(alt || "")}" ${attrs || ""}>`;
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

function getCheckSuccessAnimationTarget(element){

    if(!element){
        return null;
    }

    return (
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




function updateShellTitle(){

    const title = document.getElementById("mobile-page-title");

    if(!title){
        return;
    }

    const pageTitles = {
        discover:"Discover",
        profile:"Profile",
        settings:"Settings",
        "show-detail":(typeof getShowForDetailPage === "function" && getShowForDetailPage(selectedShowId) ? getShowForDetailPage(selectedShowId).title : "Show"),
        "episode-detail":selectedEpisodeContext
        ? `S${selectedEpisodeContext.season}E${String(selectedEpisodeContext.episode).padStart(2,"0")}`
        : "Episode",
        "genre-detail":genrePageState && genrePageState.name ? genrePageState.name : "Genre",
        "discovery-detail":discoveryPageState && discoveryPageState.name ? discoveryPageState.name : "TV Shows",
        "person-detail":personPageState && personPageState.person && personPageState.person.name ? personPageState.person.name : "Person"
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

    if(activePage === "show-detail" && typeof renderActiveShowDetailPage === "function"){
        renderActiveShowDetailPage();
    }

    if(activePage === "episode-detail" && typeof renderActiveEpisodeDetailPage === "function"){
        renderActiveEpisodeDetailPage();
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
                <h2>Discover failed to load</h2>
                <p>Try again later.</p>
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
                <h2>Nothing new right now</h2>
                <p>Try again later.</p>
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


    document.querySelectorAll(".discover-view-more-button").forEach(button=>{
        button.addEventListener("click",async function(){
            if(this.disabled){
                return;
            }

            this.disabled = true;
            await loadMoreDiscoverSection(this.dataset.sectionKey);
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
            ${section.hasMore ? `<button type="button" class="view-more-button discover-view-more-button" data-section-key="${rowKey}">${section.loadingMore ? "Loading…" : "View More"}</button>` : ""}
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
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="">`
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

        const state = typeof discoverSearchState === "object" && discoverSearchState
        ? discoverSearchState
        : {query:""};
        const query = String(state.query || "").trim();

        results.innerHTML = `
            <div class="empty-state">
                <h2>No matches found</h2>
                ${query ? `<p>Try another title.</p>` : ""}
            </div>
        `;

        return;

    }

    shows.forEach(show=>{

        const card = document.createElement("div");
        card.className = "show";

        const posterHTML = show.poster_path
        ? `<img class="poster" loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}">`
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

    const state = typeof discoverSearchState === "object" && discoverSearchState
    ? discoverSearchState
    : {page:1,totalPages:1,loading:false};

    if(Number(state.page || 1) < Number(state.totalPages || 1)){
        const moreButton = document.createElement("button");
        moreButton.className = "view-more-button search-view-more-button";
        moreButton.type = "button";
        moreButton.textContent = state.loading ? "Loading…" : "View More";
        moreButton.disabled = state.loading === true;
        moreButton.addEventListener("click",loadMoreSearchResults);
        results.appendChild(moreButton);
    }

}



function renderGenrePosterGridCard(show){
    const posterHTML = show && show.poster_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="${escapeHTML((show.name || "Show") + " poster")}">`
    : `<div class="genre-card-placeholder">TV</div>`;

    const year = show && show.first_air_date ? String(show.first_air_date).slice(0,4) : "Unknown";
    const rating = Number(show && show.vote_average || 0);
    const ratingHTML = rating > 0 ? ` • ${rating.toFixed(1)}` : "";

    return `
        <button
        type="button"
        class="genre-result-card"
        data-show-id="${escapeHTML(show && show.id)}"
        data-show-name="${escapeHTML(show && show.name || "")}" 
        data-poster-path="${escapeHTML(show && show.poster_path || "")}" 
        data-overview="${escapeHTML(show && show.overview || "")}" 
        data-first-air-date="${escapeHTML(show && show.first_air_date || "")}">
            <div class="genre-result-poster">${posterHTML}</div>
            <div class="genre-result-title">${escapeHTML(show && show.name || "Untitled")}</div>
            <div class="genre-result-meta">${escapeHTML(year)}${escapeHTML(ratingHTML)}</div>
        </button>
    `;
}

function renderPersonProfileHTML(person,role){
    const config = typeof getPersonRoleConfig === "function" ? getPersonRoleConfig(role) : null;
    const roleLabel = config && config.label ? config.label : "Person";
    const photo = person && person.profile_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(person.profile_path,"h632"))}" alt="${escapeHTML((person.name || "Person") + " photo")}">`
    : `<div class="person-profile-placeholder">NO PHOTO</div>`;
    const biography = person && person.biography ? String(person.biography).trim() : "";
    const facts = [
        person && person.known_for_department ? person.known_for_department : roleLabel,
        person && person.birthday ? `Born ${person.birthday}` : "",
        person && person.place_of_birth ? person.place_of_birth : ""
    ].filter(Boolean);
    return `
        <aside class="person-profile-panel" aria-label="Person details">
            <div class="person-profile-photo">${photo}</div>
            <div class="person-profile-name">${escapeHTML(person && person.name || "Unknown Person")}</div>
            ${facts.length ? `<div class="person-profile-facts">${facts.map(item=>`<span>${escapeHTML(item)}</span>`).join("")}</div>` : ""}
            <p class="person-profile-bio">${escapeHTML(biography || "No biography available yet.")}</p>
        </aside>
    `;
}

function renderPersonResultCard(item){
    const mediaType = item && item.media_type === "movie" ? "movie" : "tv";
    const posterHTML = item && item.poster_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(item.poster_path,"w500"))}" alt="${escapeHTML((item.title || "Title") + " poster")}">`
    : `<div class="genre-card-placeholder">${mediaType === "movie" ? "MOVIE" : "TV"}</div>`;
    const year = item && item.date ? String(item.date).slice(0,4) : "Unknown";
    const rating = Number(item && item.vote_average || 0);
    const ratingHTML = rating > 0 ? ` • ${rating.toFixed(1)}` : "";
    const roleMeta = item && item.character ? item.character : (item && item.job ? item.job : "");

    return `
        <button
        type="button"
        class="genre-result-card person-result-card"
        data-media-type="${escapeHTML(mediaType)}"
        data-media-id="${escapeHTML(item && item.id)}"
        data-media-name="${escapeHTML(item && item.title || "")}"
        data-poster-path="${escapeHTML(item && item.poster_path || "")}"
        data-overview="${escapeHTML(item && item.overview || "")}"
        data-first-air-date="${escapeHTML(item && item.first_air_date || "")}">
            <div class="genre-result-poster">${posterHTML}</div>
            <div class="genre-result-title">${escapeHTML(item && item.title || "Untitled")}</div>
            <div class="genre-result-meta">${escapeHTML(year)}${escapeHTML(ratingHTML)}</div>
            ${roleMeta ? `<div class="person-result-role">${escapeHTML(roleMeta)}</div>` : ""}
        </button>
    `;
}

function renderPersonDetailPage(state){
    const content = document.getElementById("person-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const role = typeof normalizePersonRoleSlug === "function" ? normalizePersonRoleSlug(pageState.role) : String(pageState.role || "actor");
    const media = typeof normalizePersonMediaType === "function" ? normalizePersonMediaType(pageState.media) : "tv";
    const person = pageState.person || null;
    const credits = Array.isArray(pageState.credits) ? pageState.credits : [];
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const title = typeof getPersonPageTitle === "function" ? getPersonPageTitle(role,media) : (media === "movie" ? "Movies" : "Shows");
    const name = person && person.name ? person.name : "Person";

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Person could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : credits.length
    ? `
        <div class="genre-tight-grid person-tight-grid">
            ${credits.map(renderPersonResultCard).join("")}
        </div>
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading">
            ${Array.from({length:12}).map(()=>`<div class="genre-skeleton-card"></div>`).join("")}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>No ${media === "movie" ? "movies" : "shows"} found</h2>
            <p>Try switching the media filter.</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner person-detail-page-inner">
            <div class="genre-detail-header person-detail-header">
                <div class="person-detail-title-area">
                    <button type="button" class="show-page-back-button genre-page-back-button" id="person-page-back-button" aria-label="Back">
                        <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                    </button>
                    <div>
                        <div class="genre-detail-kicker">${escapeHTML(title)}</div>
                        <h1 class="genre-detail-title person-detail-title">${escapeHTML(name)}</h1>
                    </div>
                </div>
                ${person ? renderPersonProfileHTML(person,role) : ""}
            </div>

            <div class="genre-filter-bar person-filter-bar" aria-label="Person filters">
                <label class="genre-filter-field" for="person-media-filter">
                    <span>Media</span>
                    <select id="person-media-filter">
                        <option value="tv" ${media === "tv" ? "selected" : ""}>TV Shows</option>
                        <option value="movie" ${media === "movie" ? "selected" : ""}>Movies</option>
                    </select>
                </label>
            </div>

            <div class="genre-result-content person-result-content">
                ${bodyHTML}
            </div>
        </div>
    `;
}

function renderGenreDetailPage(state){
    const content = document.getElementById("genre-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const name = pageState.name || (pageState.slug ? String(pageState.slug).split("-").map(part=>part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Genre");
    const shows = Array.isArray(pageState.shows) ? pageState.shows : [];
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const year = String(pageState.year || "").trim();
    const sort = String(pageState.sort || "popularity.desc");
    const page = Number(pageState.page || 1);
    const totalPages = Number(pageState.totalPages || 1);
    const canLoadMore = !loading && page < totalPages;

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Genre could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : shows.length
    ? `
        <div class="genre-tight-grid">
            ${shows.map(renderGenrePosterGridCard).join("")}
        </div>
        ${canLoadMore ? `<button type="button" class="view-more-button genre-load-more-button" id="genre-load-more-button">View More</button>` : ""}
        ${loading ? `<div class="v2-api-empty genre-loading-note">Loading more shows…</div>` : ""}
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading">
            ${Array.from({length:12}).map(()=>`<div class="genre-skeleton-card"></div>`).join("")}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>No shows found</h2>
            <p>Try a different year or sort option.</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner">
            <div class="genre-detail-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="genre-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div>
                    <div class="genre-detail-kicker">TV Shows</div>
                    <h1 class="genre-detail-title">${escapeHTML(name)}</h1>
                </div>
            </div>

            <div class="genre-filter-bar" aria-label="Genre filters">
                <label class="genre-filter-field" for="genre-year-filter">
                    <span>Year</span>
                    <input id="genre-year-filter" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Any" value="${escapeHTML(year)}">
                </label>
                <label class="genre-filter-field" for="genre-sort-filter">
                    <span>Sort</span>
                    <select id="genre-sort-filter">
                        <option value="popularity.desc" ${sort === "popularity.desc" ? "selected" : ""}>Popularity</option>
                        <option value="vote_average.desc" ${sort === "vote_average.desc" ? "selected" : ""}>Rating</option>
                        <option value="first_air_date.desc" ${sort === "first_air_date.desc" ? "selected" : ""}>First Air Date</option>
                    </select>
                </label>
            </div>

            <div class="genre-result-content">
                ${bodyHTML}
            </div>
        </div>
    `;
}





function renderDiscoveryFilterDetailPage(state){
    const content = document.getElementById("genre-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const title = String(pageState.name || "TV Shows").trim() || "TV Shows";
    const shows = Array.isArray(pageState.shows) ? pageState.shows : [];
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const year = String(pageState.year || "").trim();
    const sort = String(pageState.sort || "popularity.desc");
    const page = Number(pageState.page || 1);
    const totalPages = Number(pageState.totalPages || 1);
    const canLoadMore = !loading && page < totalPages;

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Shows could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : shows.length
    ? `
        <div class="genre-tight-grid">
            ${shows.map(show=>renderGenrePosterGridCard(show).replace('class="genre-result-card"','class="genre-result-card discovery-filter-result-card"')).join("")}
        </div>
        ${canLoadMore ? `<button type="button" class="view-more-button genre-load-more-button" id="discovery-filter-load-more-button">View More</button>` : ""}
        ${loading ? `<div class="v2-api-empty genre-loading-note">Loading more shows…</div>` : ""}
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading">
            ${Array.from({length:12}).map(()=>`<div class="genre-skeleton-card"></div>`).join("")}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>No shows found</h2>
            <p>Try a different year or sort option.</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner discovery-filter-page-inner">
            <div class="genre-detail-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="discovery-filter-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div>
                    <div class="genre-detail-kicker">TV Shows</div>
                    <h1 class="genre-detail-title">${escapeHTML(title)}</h1>
                </div>
            </div>

            <div class="genre-filter-bar" aria-label="TV show filters">
                <label class="genre-filter-field" for="discovery-filter-year-filter">
                    <span>Year</span>
                    <input id="discovery-filter-year-filter" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Any" value="${escapeHTML(year)}">
                </label>
                <label class="genre-filter-field" for="discovery-filter-sort-filter">
                    <span>Sort</span>
                    <select id="discovery-filter-sort-filter">
                        <option value="popularity.desc" ${sort === "popularity.desc" ? "selected" : ""}>Popularity</option>
                        <option value="vote_average.desc" ${sort === "vote_average.desc" ? "selected" : ""}>Rating</option>
                        <option value="first_air_date.desc" ${sort === "first_air_date.desc" ? "selected" : ""}>First Air Date</option>
                    </select>
                </label>
            </div>

            <div class="genre-result-content">
                ${bodyHTML}
            </div>
        </div>
    `;
}



function getWatchlistEmptyHTML(){

    const messages = {
        watching:{
            title:"Nothing in watching",
            text:"Add a show when you start watching."
        },
        paused:{
            title:"No paused shows",
            text:"Paused shows will appear here."
        },
        finished:{
            title:"No completed shows",
            text:"Finished shows will appear here."
        },
        plan:{
            title:"No planned shows",
            text:"Shows saved for later will appear here."
        },
        dropped:{
            title:"No dropped shows",
            text:"Shows you stop watching will appear here."
        }
    };

    const message = messages[activeFilter] || {
        title:"Nothing here yet",
        text:"Shows will appear here."
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




function getLibraryGenreFilter(){
    return String(typeof libraryGenreFilter !== "undefined" ? libraryGenreFilter : "all") || "all";
}

function getLibraryNetworkFilter(){
    return String(typeof libraryNetworkFilter !== "undefined" ? libraryNetworkFilter : "all") || "all";
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

function buildLibraryOptionCounts(type){
    const counts = new Map();

    Object.values(DATA.shows || {}).forEach(show=>{
        const values = type === "network" ? getShowNetworkNames(show) : getShowGenreNames(show);
        values.forEach(value=>{
            counts.set(value,(counts.get(value) || 0) + 1);
        });
    });

    return Array.from(counts.entries())
    .sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:"base"}))
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

function resetLibraryFiltersToDefault(){
    librarySearchQuery = "";
    libraryGenreFilter = "all";
    libraryNetworkFilter = "all";
    librarySortMode = "default";
    activeFilter = "watching";

    document.querySelectorAll(".filters button[data-filter]").forEach(button=>{
        button.classList.toggle("active",button.dataset.filter === activeFilter);
    });

    renderLibrarySearchControl();
    renderWatchlist();
}

function hasActiveLibraryControls(){
    return Boolean(
        getLibrarySearchQuery() ||
        getLibraryGenreFilter() !== "all" ||
        getLibraryNetworkFilter() !== "all" ||
        getLibrarySortMode() !== "default" ||
        activeFilter !== "watching"
    );
}

function libraryShowMatchesAdvancedFilters(show){
    const genre = getLibraryGenreFilter();
    const network = getLibraryNetworkFilter();

    if(genre !== "all" && !getShowGenreNames(show).includes(genre)){
        return false;
    }

    if(network !== "all" && !getShowNetworkNames(show).includes(network)){
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
    const sortSelect = menu.querySelector("#library-sort-mode");
    const resetButton = menu.querySelector("#library-reset-filters");

    if(input){
        input.placeholder = "Search " + getActiveFilterSearchLabel();
        input.value = getLibrarySearchQuery();
    }

    setSelectOptions(genreSelect,"All Genres",buildLibraryOptionCounts("genre"),getLibraryGenreFilter());
    setSelectOptions(networkSelect,"All Networks",buildLibraryOptionCounts("network"),getLibraryNetworkFilter());

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
    });

    networkSelect.addEventListener("change",function(){
        libraryNetworkFilter = this.value || "all";
        renderWatchlist();
    });

    sortSelect.addEventListener("change",function(){
        librarySortMode = this.value || "default";
        renderWatchlist();
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

    });

    return box;

}



function getLibrarySearchEmptyHTML(query){

    const filterText = [
        getLibraryGenreFilter() !== "all" ? getLibraryGenreFilter() : "",
        getLibraryNetworkFilter() !== "all" ? getLibraryNetworkFilter() : ""
    ].filter(Boolean).join(" • ");

    const detail = query
    ? `No show in this list matches “${escapeHTML(query)}”.`
    : filterText
    ? `No show matches ${escapeHTML(filterText)} in this list.`
    : "No show matches the selected filters.";

    return `
        <div class="empty-state">
            <h2>No matches in ${escapeHTML(getActiveFilterSearchLabel())}.</h2>
            <p>${detail}</p>
        </div>
    `;

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



function getWatchlistActionConfig(show,displayFilter,nextEp){

    const title = show.title || "show";

    if(displayFilter === "finished"){
        return null;
    }

    if(
        displayFilter === "paused" ||
        displayFilter === "plan" ||
        displayFilter === "dropped"
    ){
        return {
            action:"watching",
            label:`Change ${title} to Watching`,
            disabled:false
        };
    }

    if(!nextEp){
        return null;
    }

    const isAvailable = Boolean(
        nextEp.air_date &&
        isEpisodeAired(nextEp.air_date,nextEp,show)
    );

    const releaseDate = nextEp.air_date
    ? formatAirDate(nextEp.air_date,nextEp)
    : "";

    return {
        action:"mark",
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
    });

    const episodeLine = isCompletedFilter
    ? `<span class="completed-label">✓ Completed</span>`
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
        !isEpisodeAired(nextEp.air_date,nextEp,show)
    );

    const releaseMeta = nextEpisodeFuture
    ? [
        formatAirDate(nextEp.air_date,nextEp),
        getCountdownText(nextEp.air_date,nextEp)
    ].filter(Boolean).join(" • ")
    : "";

    const action = getWatchlistActionConfig(show,displayFilter,nextEp);

    const card = document.createElement("article");
    card.className = `show watchlist-card watchlist-card--${escapeHTML(displayFilter)}`;
    card.dataset.showId = String(show.tmdb_id || show.id || "");

    const posterHTML = show.poster_path
    ? `<img class="poster" src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="${escapeHTML(show.title || "Show")} poster" loading="lazy">`
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
        </button>
    `
    : "";

    card.innerHTML = `

        ${posterHTML}

        <div class="info watchlist-info">

            <div class="watchlist-title-row">
                <button type="button" class="title watchlist-title-button" aria-label="Open ${escapeHTML(show.title || "show")} details">${escapeHTML(show.title)}</button>
            </div>

            <div class="episode">${episodeLine}</div>

            ${episodeTitle ? `<div class="episode-title">${episodeTitle}</div>` : ""}

            ${showNewBadge ? `<div class="watchlist-new-badge-row"><span class="new-badge watchlist-new-badge">NEW</span></div>` : ""}

            ${releaseMeta ? `<div class="watchlist-release-meta">${escapeHTML(releaseMeta)}</div>` : ""}

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

                if(action.action === "mark"){
                    await playCheckSuccessAnimation(this);
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



function renderWatchlist(){
    renderLibrarySearchControl();

    const list = document.getElementById("show-list");
    list.innerHTML = "";

    const view = getWatchlistShowsForCurrentView();
    const shows = view.shows;
    const query = view.query;

    if(shows.length === 0){
        const empty = document.createElement("div");
        empty.innerHTML = query ? getLibrarySearchEmptyHTML(query) : getWatchlistEmptyHTML();
        list.appendChild(empty.firstElementChild);
        return;
    }

    const fragment = document.createDocumentFragment();
    shows.forEach(show=>fragment.appendChild(createWatchlistCard(show)));
    list.appendChild(fragment);
}

function refreshWatchlistShows(showIds){
    if(
        activePage !== "shows" ||
        activeShowsTab !== "watchlist"
    ){
        return;
    }

    const list = document.getElementById("show-list");

    if(!list){
        return;
    }

    renderLibrarySearchControl();

    const view = getWatchlistShowsForCurrentView();
    const shows = view.shows;
    const dirtyIds = new Set((showIds || []).map(String));

    if(shows.length === 0){
        renderWatchlist();
        return;
    }

    const existingCards = new Map();
    list.querySelectorAll(".watchlist-card[data-show-id]").forEach(card=>{
        existingCards.set(String(card.dataset.showId),card);
    });

    const fragment = document.createDocumentFragment();

    shows.forEach(show=>{
        const id = String(show.tmdb_id || show.id || "");
        let card = existingCards.get(id) || null;

        if(!card || dirtyIds.has(id)){
            card = createWatchlistCard(show);
        }

        fragment.appendChild(card);
        existingCards.delete(id);
    });

    list.replaceChildren(fragment);
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


async function renderUpcoming(startBackgroundRefresh=true){

    const list = document.getElementById("show-list");

    list.innerHTML = "";

    const upcoming = getUpcomingShows();

    if(upcoming.length === 0){

        list.innerHTML = `
            <div class="empty-state">
                <h2>No upcoming episodes</h2>
                <p>New releases will appear here.</p>
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
                ${escapeHTML(groupName.trim())}
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
            ? `<img class="upcoming-still" loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(imagePath,"w780"))}">`
            : `<div class="upcoming-still-placeholder">📺</div>`;

            const regularBehindText =
            !display.isBatch && item.behindCount > 0
            ? `${item.behindCount} more episode${item.behindCount === 1 ? "" : "s"} behind`
            : "";

            // A row can cross from future to available while it is already
            // displayed as a Today schedule item. Do not rely only on ep.type.
            const canLog = isEpisodeAired(ep.air_date,ep,show);

            const displayIsNew =
            canLog &&
            (
                item.isNew ||
                isNewUpcomingEpisode(show,ep) ||
                isRecentlyAvailableEpisode(ep,show)
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

                    if(this.disabled){
                        return;
                    }

                    this.disabled = true;

                    try{
                        await playCheckSuccessAnimation(this);

                        await updateEpisodeWatched(
                            Number(this.dataset.show),
                            Number(this.dataset.season),
                            Number(this.dataset.episode),
                            true
                        );

                        await renderUpcoming(false);
                    }finally{
                        if(this.isConnected){
                            this.disabled = false;
                        }
                    }

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



function renderUpcomingBatchEpisodesHTML(show,episodes){

    if(!episodes || episodes.length === 0){
        return "";
    }

    let html = `<div class="upcoming-batch-list">`;

    episodes.forEach(ep=>{

        // Batch rows can also become available after their release time passes.
        const canLog = isEpisodeAired(ep.air_date,ep,show);

        const imagePath =
        ep.still_path ||
        show.poster_path ||
        "";

        const imageHTML = imagePath
        ? `<img class="upcoming-batch-still" loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(imagePath,"w780"))}">`
        : `<div class="upcoming-batch-still-placeholder">📺</div>`;

        html += `
            <div class="upcoming-batch-row" data-show="${show.tmdb_id}" data-season="${ep.season_number}" data-episode="${ep.episode_number}">

                ${imageHTML}

                <div class="upcoming-batch-info">

                    <div class="upcoming-batch-episode">
                        S${ep.season_number}E${String(ep.episode_number).padStart(2,"0")} — ${escapeHTML(ep.name || "Untitled Episode")}
                    </div>

                    <div class="upcoming-batch-date">
                        ${escapeHTML(getUpcomingTimeLabel(ep.air_date,ep,show))}
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
        ? `<img class="behind-episode-still" loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(imagePath,"w780"))}">`
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
                        ${escapeHTML(getUpcomingTimeLabel(ep.air_date,ep,show))}
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

            if(this.disabled){
                return;
            }

            this.disabled = true;

            try{
                await playCheckSuccessAnimation(this);

                await updateEpisodeWatched(
                    this.dataset.show,
                    Number(this.dataset.season),
                    Number(this.dataset.episode),
                    true
                );

                closeBehindEpisodesPopup();
                await renderUpcoming(false);
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }

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
                <h2>No watch history</h2>
                <p>Watched episodes will appear here.</p>
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
            ? `<img class="history-still" loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(stillPath,"w780"))}">`
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
                    <img class="network-logo-inline" src="${escapeHTML(trackerImageURL(network.logo_path,"w92"))}" alt="${escapeHTML(network.name)}">
                </span>
            `;
        }

        return `<span class="network-name-inline">${escapeHTML(network.name)}</span>`;

    }).join("")}</span>`;

}



function getShowGenreRoute(genre){
    if(typeof getGenreRouteFromName === "function"){
        return getGenreRouteFromName(genre);
    }

    const slug = String(genre || "")
    .trim()
    .toLowerCase()
    .replace(/&/g," ")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");

    return slug ? "/app/genre/" + encodeURIComponent(slug) : "";
}

function renderShowGenreLinksHTML(genres){
    const list = (Array.isArray(genres) ? genres : [])
    .map(genre=>String(genre || "").trim())
    .filter(Boolean);

    if(!list.length){
        return "";
    }

    return `<span class="show-genre-link-list">${list.map((genre,index)=>{
        const route = getShowGenreRoute(genre);
        const link = route
        ? `<a class="show-genre-link" href="${escapeHTML(route)}" data-genre-name="${escapeHTML(genre)}" data-genre-route="${escapeHTML(route)}">${escapeHTML(genre)}</a>`
        : `<span class="show-genre-link-disabled">${escapeHTML(genre)}</span>`;
        return `${index > 0 ? `<span class="show-genre-separator">•</span>` : ""}${link}`;
    }).join("")}</span>`;
}

function getShowMetaHTML(show,year,genres,ratingHTML){

    const items = [];
    const contentRating = String(show && show.content_rating ? show.content_rating : "").trim();
    const networkHTML = renderV2NetworkLogoOnlyHTML(show);
    const creators = v2JoinList(show && show.created_by ? show.created_by : [],3);
    const cleanRatingHTML = String(ratingHTML || "").replace(/^<span class="modal-meta-separator">•<\/span>/,"");

    if(year){
        items.push(`<span>${escapeHTML(year)}</span>`);
    }

    if(contentRating){
        items.push(`<span>${escapeHTML(contentRating)}</span>`);
    }

    if(networkHTML){
        items.push(networkHTML);
    }

    if(creators){
        items.push(`<span>Created by ${escapeHTML(creators)}</span>`);
    }

    if(genres){
        const genreLinksHTML = renderShowGenreLinksHTML(show && show.genres ? show.genres : []);
        items.push(genreLinksHTML || `<span>${escapeHTML(genres)}</span>`);
    }

    if(cleanRatingHTML){
        items.push(cleanRatingHTML);
    }

    return items.map((item,index)=>`${index > 0 ? `<span class="modal-meta-separator">•</span>` : ""}${item}`).join("");

}


function v2CleanList(items,limit=4){
    return (Array.isArray(items) ? items : [])
    .map(item=>String(item || "").trim())
    .filter(Boolean)
    .slice(0,limit);
}

function v2JoinList(items,limit=4){
    const list = v2CleanList(items,limit);
    return list.length ? list.join(" • ") : "";
}

function v2FormatDate(value){
    const raw = String(value || "").trim();
    if(!raw){
        return "";
    }
    return raw;
}

function v2GetWatchRegion(){
    return "US";
}

function v2FirstTrailer(show){
    const videos = Array.isArray(show && show._tmdb_videos) ? show._tmdb_videos : [];
    return videos.find(video=>String(video.type || "").toLowerCase() === "trailer") || videos[0] || null;
}

function renderV2NetworkLogoOnlyHTML(show){
    const networks = getShowNetworkItems(show);

    if(!networks.length){
        return "";
    }

    return `<span class="network-inline-group">${networks.map(network=>{
        if(Number(network && network.id || 0) > 0){
            return renderNetworkEntityHTML(network);
        }
        if(network.logo_path){
            return `
                <span class="network-logo-chip" title="${escapeHTML(network.name || "Network")}">
                    <img class="network-logo-inline" src="${escapeHTML(trackerImageURL(network.logo_path,"w92"))}" alt="${escapeHTML(network.name || "Network")}">
                </span>
            `;
        }

        return `<span class="network-name-inline">${escapeHTML(network.name || "Network")}</span>`;
    }).join("")}</span>`;
}

function renderShowEntityLinkHTML(label,type,value,options={}){
    const cleanLabel = String(label || "").trim();
    if(!cleanLabel){
        return "";
    }
    const route = typeof getDiscoveryFilterDetailRoute === "function" ? getDiscoveryFilterDetailRoute(type,value) : "";
    const name = String(options && options.name || cleanLabel).trim();
    const className = options && options.className ? String(options.className) : "show-detail-entity-link";

    if(route && route !== "/app/watchlist"){
        return `<a class="${escapeHTML(className)}" href="${escapeHTML(route)}" data-discovery-type="${escapeHTML(type)}" data-discovery-value="${escapeHTML(value)}" data-discovery-name="${escapeHTML(name)}">${escapeHTML(cleanLabel)}</a>`;
    }

    return `<span>${escapeHTML(cleanLabel)}</span>`;
}

function renderNetworkLinkInnerHTML(network){
    const label = network && network.name ? String(network.name).trim() : "Network";
    if(network && network.logo_path){
        return `<span class="network-logo-chip" title="${escapeHTML(label)}"><img class="network-logo-inline" src="${escapeHTML(trackerImageURL(network.logo_path,"w92"))}" alt="${escapeHTML(label)}"></span>`;
    }
    return `<span class="v2-provider-pill">${escapeHTML(label)}</span>`;
}

function renderNetworkEntityHTML(network){
    const id = Number(network && network.id || 0);
    const label = network && network.name ? String(network.name).trim() : "Network";
    const inner = renderNetworkLinkInnerHTML(network);
    if(id > 0){
        const route = typeof getDiscoveryFilterDetailRoute === "function" ? getDiscoveryFilterDetailRoute("network",id) : "";
        return `<a class="show-detail-entity-link show-detail-network-link" href="${escapeHTML(route)}" data-discovery-type="network" data-discovery-value="${escapeHTML(id)}" data-discovery-name="${escapeHTML(`Shows from ${label}`)}" aria-label="Shows from ${escapeHTML(label)}">${inner}</a>`;
    }
    return inner;
}

function getShowLanguageItems(show){
    const items = [];
    const seen = new Set();
    const push = function(code,label){
        const cleanCode = typeof normalizeLanguageCode === "function" ? normalizeLanguageCode(code) : String(code || "").trim().toLowerCase();
        const cleanLabel = String(label || (typeof getLanguageName === "function" ? getLanguageName(cleanCode) : cleanCode)).trim();
        const key = cleanCode || cleanLabel.toLowerCase();
        if(!key || seen.has(key)){
            return;
        }
        seen.add(key);
        items.push({code:cleanCode,label:cleanLabel});
    };

    (Array.isArray(show && show.spoken_languages) ? show.spoken_languages : []).forEach(language=>{
        if(typeof language === "string"){
            push("",language);
        }else if(language){
            push(language.iso_639_1 || language.iso_639_2 || "",language.english_name || language.name || "");
        }
    });

    if(!items.length && show && show.original_language){
        const code = String(show.original_language || "").trim().toLowerCase();
        push(code,typeof getLanguageName === "function" ? getLanguageName(code) : code.toUpperCase());
    }

    return items;
}

function renderShowLanguageDetailsHTML(show){
    const languages = getShowLanguageItems(show);
    if(!languages.length){
        return "Unknown";
    }
    return `<span class="show-detail-inline-link-list">${languages.map((language,index)=>{
        const label = language.label || (typeof getLanguageName === "function" ? getLanguageName(language.code) : language.code);
        const link = language.code
        ? renderShowEntityLinkHTML(label,"language",language.code,{name:`${label} TV Shows`})
        : `<span>${escapeHTML(label)}</span>`;
        return `${index > 0 ? `<span class="show-detail-inline-separator">/</span>` : ""}${link}`;
    }).join("")}</span>`;
}

function renderShowCountryDetailsHTML(show){
    const countries = (Array.isArray(show && show.origin_country) ? show.origin_country : [])
    .map(code=>String(code || "").trim().toLowerCase())
    .filter(Boolean);
    const seen = new Set();
    const unique = countries.filter(code=>{
        if(seen.has(code)){
            return false;
        }
        seen.add(code);
        return true;
    });

    if(!unique.length){
        return "Unknown";
    }

    return `<span class="show-detail-inline-link-list">${unique.map((code,index)=>{
        const label = getCountryLabel(code);
        const name = `TV Shows from ${getCountryName(code)}`;
        return `${index > 0 ? `<span class="show-detail-inline-separator">/</span>` : ""}${renderShowEntityLinkHTML(label,"country",code,{name:name})}`;
    }).join("")}</span>`;
}

function renderShowThemesDetailsHTML(show){
    const themes = (Array.isArray(show && show._tmdb_keywords) ? show._tmdb_keywords : [])
    .map(theme=>String(theme || "").trim())
    .filter(Boolean)
    .slice(0,12);
    if(!themes.length){
        return "Unknown";
    }
    return `<div class="show-detail-theme-list">${themes.map(theme=>`<span>${escapeHTML(theme)}</span>`).join("")}</div>`;
}

function renderShowNetworkDetailsHTML(show){
    const networks = getShowNetworkItems(show);

    if(!networks.length){
        return "Unknown";
    }

    return `<div class="v2-provider-list">${networks.map(renderNetworkEntityHTML).join("")}</div>`;
}

function renderV2ShowInfoMetaLineHTML(show){
    const year = show && show.first_air_date ? String(show.first_air_date).slice(0,4) : "";
    const contentRating = String(show && show.content_rating ? show.content_rating : "").trim();
    const networkHTML = renderV2NetworkLogoOnlyHTML(show);
    const creators = v2JoinList(show && show.created_by ? show.created_by : [],3);
    const genres = show && Array.isArray(show.genres) && show.genres.length ? show.genres.join(" • ") : "";
    const rating = Number(show && show.tmdb_rating || 0);

    const items = [];

    if(year){
        items.push(`<span>${escapeHTML(year)}</span>`);
    }

    if(contentRating){
        items.push(`<span>${escapeHTML(contentRating)}</span>`);
    }

    if(networkHTML){
        items.push(networkHTML);
    }

    if(creators){
        items.push(`<span>Created by ${escapeHTML(creators)}</span>`);
    }

    if(genres){
        const genreLinksHTML = renderShowGenreLinksHTML(show && show.genres ? show.genres : []);
        items.push(genreLinksHTML || `<span>${escapeHTML(genres)}</span>`);
    }

    if(rating > 0){
        items.push(`<span class="tmdb-rating-group"><span class="tmdb-rating-inline">${rating.toFixed(1)}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>`);
    }

    if(!items.length){
        return "";
    }

    return `<div class="v2-show-info-meta-line">${items.map((item,index)=>{
        return `${index > 0 ? `<span class="modal-meta-separator">•</span>` : ""}${item}`;
    }).join("")}</div>`;
}

function renderV2ShowInfoLinksLineHTML(show){
    const ids = show && show._tmdb_external_ids ? show._tmdb_external_ids : {};
    const trailer = v2FirstTrailer(show);
    const links = [];

    if(trailer && trailer.key){
        links.push(`<a class="v2-clean-link v2-trailer-link" href="https://www.youtube.com/watch?v=${escapeHTML(trailer.key)}" target="_blank" rel="noopener noreferrer"><img class="v2-play-icon" src="/static/assets/icons/ui-play.svg" alt="">Trailer</a>`);
    }

    if(ids.imdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://www.imdb.com/title/${escapeHTML(ids.imdb_id)}/" target="_blank" rel="noopener noreferrer">IMDb</a>`);
    }

    if(ids.tvdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://thetvdb.com/dereferrer/series/${escapeHTML(ids.tvdb_id)}" target="_blank" rel="noopener noreferrer">TVDB</a>`);
    }

    if(show && show.tmdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://www.themoviedb.org/tv/${escapeHTML(show.tmdb_id)}" target="_blank" rel="noopener noreferrer">TMDB</a>`);
    }

    const homepageURL = show ? safeExternalURL(show.homepage) : "";

    if(homepageURL){
        links.push(`<a class="v2-clean-link v2-external-pill" href="${escapeHTML(homepageURL)}" target="_blank" rel="noopener noreferrer">Official Site ↗</a>`);
    }

    if(!links.length){
        return "";
    }

    return `<div class="modal-meta modal-meta-under-status v2-show-info-links-line v2-show-action-line">${links.map((item,index)=>{
        return `${index > 0 ? `<span class="modal-meta-separator">•</span>` : ""}${item}`;
    }).join("")}</div>`;
}

function renderV2ShowFactsHTML(show){
    return "";
}

function renderV2ExternalLinksHTML(show){
    return renderV2ShowInfoLinksLineHTML(show);
}

function renderV2VideosHTML(show){
    return "";
}

function collectV2ProviderNames(providers){
    const seen = new Set();
    const names = [];

    ["flatrate","rent","buy"].forEach(group=>{
        (Array.isArray(providers && providers[group]) ? providers[group] : []).forEach(provider=>{
            const name = String(provider && provider.provider_name ? provider.provider_name : "").trim();
            const key = name.toLowerCase();
            if(name && !seen.has(key)){
                seen.add(key);
                names.push(name);
            }
        });
    });

    return names.slice(0,12);
}

function getV2ProviderWatchLink(provider,providerRegion){
    const directLink = safeExternalURL(
        provider && (
            provider.link ||
            provider.url ||
            provider.watch_url ||
            provider.deep_link
        )
    );

    if(directLink){
        return directLink;
    }

    return safeExternalURL(providerRegion && providerRegion.link);
}

function renderV2ProvidersGroup(label,providers,providerRegion=null){
    if(!Array.isArray(providers) || providers.length === 0){
        return "";
    }

    const items = providers.slice(0,10).map(provider=>{
        const logo = provider.logo_path
        ? `<img class="v2-provider-logo" src="${escapeHTML(trackerImageURL(provider.logo_path,"w92"))}" alt="">`
        : "";
        const providerName = provider && provider.provider_name ? provider.provider_name : "Provider";
        const watchLink = getV2ProviderWatchLink(provider,providerRegion);
        const innerHTML = `
            ${logo}
            <span>${escapeHTML(providerName)}</span>
        `;

        if(watchLink){
            return `
                <a class="v2-provider-pill v2-provider-pill-link" href="${escapeHTML(watchLink)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHTML(providerName)} availability">
                    ${innerHTML}
                </a>
            `;
        }

        return `
            <span class="v2-provider-pill v2-provider-pill-muted" title="No direct watch link available">
                ${innerHTML}
            </span>
        `;
    }).join("");

    return `
        <div class="v2-provider-group">
            <div class="v2-provider-group-title">${escapeHTML(label)}</div>
            <div class="v2-provider-list">${items}</div>
        </div>
    `;
}

function renderV2WatchProvidersHTML(show){
    const region = v2GetWatchRegion();
    const providers = show && show._tmdb_watch_providers && show._tmdb_watch_providers.results
    ? show._tmdb_watch_providers.results[region]
    : null;

    if(!providers){
        return "";
    }

    const groups = [
        renderV2ProvidersGroup("Streaming",providers.flatrate,providers),
        renderV2ProvidersGroup("Rent",providers.rent,providers),
        renderV2ProvidersGroup("Buy",providers.buy,providers)
    ].filter(Boolean).join("");

    if(!groups){
        return "";
    }

    return `
        <div class="modal-section v2-clean-section v2-watch-section">
            <h3 class="modal-section-heading">Where to Watch</h3>
            ${groups}
        </div>
    `;
}


function renderV2KeywordsHTML(show){
    return "";
}

function renderV2RailSectionHTML(title,cardsHTML,extraClass=""){
    const cards = String(cardsHTML || "").trim();

    if(!cards){
        return "";
    }

    return `
        <div class="modal-section v2-rail-section ${escapeHTML(extraClass)}">
            <div class="v2-section-title-row v2-rail-heading-row">
                <h3 class="modal-section-heading">${escapeHTML(title)}</h3>
                <div class="v2-rail-controls" aria-hidden="false">
                    <button type="button" class="v2-rail-button" data-v2-rail-scroll="left" aria-label="Scroll ${escapeHTML(title)} left">←</button>
                    <button type="button" class="v2-rail-button" data-v2-rail-scroll="right" aria-label="Scroll ${escapeHTML(title)} right">→</button>
                </div>
            </div>
            <div class="v2-horizontal-rail">${cards}</div>
        </div>
    `;
}

function getPersonLinkNameHTML(person,role,fallbackName){
    const cleanRole = typeof normalizePersonRoleSlug === "function" ? normalizePersonRoleSlug(role) : String(role || "");
    const id = person && Number(person.id || 0);
    const name = fallbackName || (person && person.name) || "Unknown";

    if(cleanRole && id > 0){
        return `<button type="button" class="v2-person-link" data-person-role="${escapeHTML(cleanRole)}" data-person-id="${escapeHTML(id)}">${escapeHTML(name)}</button>`;
    }

    return `<span>${escapeHTML(name)}</span>`;
}

function getCrewRouteRole(person,fallbackRole){
    const fallback = typeof normalizePersonRoleSlug === "function" ? normalizePersonRoleSlug(fallbackRole) : String(fallbackRole || "");
    const job = String(person && person.job || "").toLowerCase();

    if(job.includes("creator") || job.includes("created by")){
        return "creator";
    }
    if(job.includes("director of photography") || job.includes("cinematograph")){
        return "cinematographer";
    }
    if(job.includes("editor")){
        return "editor";
    }
    if(job.includes("composer") || job.includes("music")){
        return "composer";
    }
    if(job.includes("director")){
        return "director";
    }
    if(job.includes("writer") || job.includes("screenplay") || job.includes("teleplay") || job.includes("story")){
        return "writer";
    }
    if(job.includes("producer")){
        return "producer";
    }

    return fallback;
}

function renderV2ActorImageHTML(actor){
    if(actor && actor.profile_path){
        return `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(actor.profile_path,"w185"))}" alt="">`;
    }

    return `<div class="v2-actor-placeholder">NO PHOTO</div>`;
}

function getCastLayoutSetting(){
    return "vertical";
}

function renderV2ActorListHTML(actors,limit=12){
    const source = Array.isArray(actors) ? actors : [];
    const list = limit === null ? source : source.slice(0,Number(limit || 12));

    return list.map(actor=>{
        const actorId = Number(actor && actor.id || 0);
        const linkAttributes = actorId > 0
        ? ` role="button" tabindex="0" data-person-role="actor" data-person-id="${escapeHTML(actorId)}"`
        : "";
        const linkClass = actorId > 0 ? " v2-person-card-link" : "";

        return `
            <div class="v2-actor-list-row${linkClass}"${linkAttributes}>
                <div class="v2-actor-list-photo">${renderV2ActorImageHTML(actor)}</div>
                <div class="v2-actor-list-text">
                    <div class="v2-actor-name">${getPersonLinkNameHTML(actor,"actor",actor.name || "Unknown Actor")}</div>
                    <div class="v2-actor-role">${escapeHTML(actor.character || "Unknown Role")}</div>
                </div>
            </div>
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

function renderV2ShowCastHTML(show){
    const cast = Array.isArray(show && show._tmdb_cast) ? show._tmdb_cast : [];
    return renderV2ActorListSectionHTML("Cast",cast,"v2-cast-section");
}

function renderV2EpisodeActorsHTML(show,seasonNumber,episodeNumber){
    const key = `${Number(seasonNumber)}-${Number(episodeNumber)}`;
    const actors = show && show._episode_actor_credits && Array.isArray(show._episode_actor_credits[key])
    ? show._episode_actor_credits[key]
    : [];

    return renderV2ActorListSectionHTML("Episode Cast",actors,"v2-episode-cast-section",{limit:null});
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

function renderV2EpisodeExtraHTML(show,seasonNumber,episodeNumber,episodeData){
    const links = renderV2EpisodeLinksHTML(show,seasonNumber,episodeNumber,episodeData);

    if(!links){
        return "";
    }

    return `
        <div class="modal-section v2-clean-section v2-episode-extra-section">
            ${links}
        </div>
    `;
}

function getV2SeasonDetails(show,seasonNumber){
    return show && show._season_details && show._season_details[String(seasonNumber)]
    ? show._season_details[String(seasonNumber)]
    : null;
}

function renderV2SeasonMetaHTML(show,seasonNumber,total){
    return "";
}

function renderV2SeasonOverviewHTML(show,seasonNumber){
    const details = getV2SeasonDetails(show,seasonNumber);
    const overview = details && details.overview ? String(details.overview).trim() : "";

    if(!overview){
        return "";
    }

    return `<div class="season-overview">${escapeHTML(overview)}</div>`;
}

function renderV2SimilarShowsHTML(show){
    const similar = Array.isArray(show && show._tmdb_similar) ? show._tmdb_similar : [];

    if(!similar.length){
        return "";
    }

    const cards = similar.slice(0,10).map(item=>{
        const poster = item.poster_path
        ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(item.poster_path,"w500"))}" alt="">`
        : `<div class="poster-placeholder">TV</div>`;

        return `
            <button type="button" class="v2-similar-card" data-v2-similar-open="${escapeHTML(item.id)}">
                <div class="v2-similar-poster">${poster}</div>
                <div class="v2-similar-title">${escapeHTML(item.name || "Untitled")}</div>
            </button>
        `;
    }).join("");

    return renderV2RailSectionHTML("More Like This",cards,"v2-more-like-section");
}

function renderV2ShowAPISectionsHTML(show){
    return "";
}

function attachV2ShowModalEvents(show){
    document.querySelectorAll("[data-v2-similar-open]").forEach(button=>{
        button.addEventListener("click",async function(event){
            event.stopPropagation();
            const id = this.getAttribute("data-v2-similar-open");
            await openShowDetailsPage(id);
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

function renderDiscoverShowModalPreservingScroll(show){
    const modalBox = document.querySelector("#show-modal .show-modal");
    const scrollTop = modalBox ? modalBox.scrollTop : 0;

    renderDiscoverShowModal(show);

    if(modalBox){
        requestAnimationFrame(()=>{
            modalBox.scrollTop = scrollTop;
        });
    }
}

function renderDiscoverShowModal(show){

    const modal = document.getElementById("show-modal");

    if(modal){
        modal.classList.remove("episode-detail-overlay");
        modal.classList.add("show-detail-overlay");
    }

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
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.4) 60%), ${trackerBackgroundImage(show.backdrop_path,"original")}`
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
                    ${discoverAddButtonHTML(show,"finished","Add to Completed")}
                    ${discoverAddButtonHTML(show,"dropped","Add to Dropped")}

                </div>

                <div class="modal-meta modal-meta-under-status">
                    ${getShowMetaHTML(show,year,genres,ratingHTML)}
                </div>

                ${renderV2ShowInfoLinksLineHTML(show)}

            </div>

            ${renderV2ShowAPISectionsHTML(show)}



            <div class="modal-section">
                <h3 class="modal-section-heading">Synopsis</h3>
                <div class="modal-overview">
                    ${escapeHTML(show.overview || "No overview available.")}
                </div>
            </div>




            <div class="modal-section">
                <h3>Seasons</h3>
                <div class="seasons-list">
                    ${renderDiscoverPreviewSeasonsHTML(show)}
                </div>
            </div>

            ${renderV2ShowCastHTML(show)}

            ${renderV2SimilarShowsHTML(show)}

        </div>

    `;

    document.querySelectorAll(".discover-add-status-button").forEach(button=>{

        button.addEventListener("click",function(){
            addDiscoverPreviewShow(this.dataset.status);
        });

    });

    document.querySelectorAll(".discover-season-toggle").forEach(toggle=>{

        const activate = function(event){
            if(event){
                event.preventDefault();
                event.stopPropagation();
            }
            toggleDiscoverPreviewSeason(show,Number(this.dataset.season));
        };

        toggle.addEventListener("click",activate);
        toggle.addEventListener("keydown",function(event){
            if(event.key === "Enter" || event.key === " "){
                activate.call(this,event);
            }
        });

    });

    document.querySelectorAll(".discover-season-all-button").forEach(button=>{

        ["pointerdown","pointerup","mousedown","mouseup","touchstart"].forEach(eventName=>{
            button.addEventListener(eventName,function(event){
                event.stopPropagation();
            });
        });

        button.addEventListener("click",async function(event){

            stopNestedSeasonAction(event);

            if(this.disabled){
                return;
            }

            this.disabled = true;

            try{
                await playCheckSuccessAnimation(this);
                await addDiscoverSeasonAsWatched(
                    show.tmdb_id,
                    Number(this.dataset.season)
                );
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }

        });

    });



    document.querySelectorAll(".discover-preview-check-button").forEach(button=>{

        ["pointerdown","pointerup","mousedown","mouseup","touchstart"].forEach(eventName=>{
            button.addEventListener(eventName,function(event){
                event.stopPropagation();
            });
        });

        button.addEventListener("click",async function(event){

            stopNestedSeasonAction(event);

            if(this.disabled){
                return;
            }

            this.disabled = true;

            try{
                await playCheckSuccessAnimation(this);
                await addDiscoverEpisodeAsWatched(
                    show.tmdb_id,
                    Number(this.dataset.season),
                    Number(this.dataset.episode)
                );
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }

        });

    });

    document.querySelectorAll(".discover-episode-row").forEach(row=>{

        row.addEventListener("click",async function(event){

            if(event.target && event.target.closest("button, a, input, select, textarea")){
                return;
            }

            await openDiscoverEpisodeModal(
                show.tmdb_id,
                this.dataset.season,
                this.dataset.episode
            );

        });

    });

    attachV2ShowModalEvents(show);

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

        const total = episodeList ? episodeList.length : (show._season_episodes ? show._season_episodes[String(season)] : 0);
        const seasonMetaHTML = renderV2SeasonMetaHTML(show,season,total);
        const isTrackedShow = !!(DATA.shows && DATA.shows[String(show.tmdb_id)]);

        const airedEpisodeNumbers = getAiredEpisodeNumbersInSeason(show,season);
        const seasonIsFullyWatched = isSeasonFullyWatched(
            show,
            season,
            airedEpisodeNumbers
        );
        const seasonHasAiredEpisodes = airedEpisodeNumbers.length > 0;

        html += `

            <div class="season-box collapse collapse-arrow bg-base-100 border-base-300 border ${isOpen ? "open collapse-open" : "collapse-close"}">

                <div class="season-header collapse-title">

                    <button
                    type="button"
                    class="season-toggle-area discover-season-toggle"
                    data-season="${season}"
                    aria-expanded="${isOpen ? "true" : "false"}">
                        <span class="season-left">
                            <span class="season-title-stack">
                                <span class="season-title">Season ${season}</span>
                                ${seasonMetaHTML}
                            </span>
                        </span>
                    </button>

                    <button
                    type="button"
                    class="season-all-button discover-season-all-button ${seasonIsFullyWatched ? "checked" : ""}"
                    data-season="${season}"
                    aria-label="${seasonHasAiredEpisodes ? `Log all aired episodes in Season ${season}` : `Season ${season} has no aired episodes yet`}"
                    title="${seasonHasAiredEpisodes ? `Log all aired episodes in Season ${season}` : "No aired episodes yet"}"
                    ${seasonHasAiredEpisodes ? "" : "disabled"}>
                    </button>

                </div>

                ${
                isOpen
                ? `<div class="season-episodes collapse-content">${renderDiscoverPreviewEpisodesHTML(show,season,episodeList)}</div>`
                : ""
                }

            </div>

        `;

    }

    return html;

}



function seasonEpisodeListIsLoadedEmpty(show,seasonNumber){

    const seasonKey = String(seasonNumber);

    return (
        show &&
        show._episode_list &&
        Array.isArray(show._episode_list[seasonKey]) &&
        show._episode_list[seasonKey].length === 0 &&
        show._season_episodes &&
        Object.prototype.hasOwnProperty.call(show._season_episodes,seasonKey) &&
        Number(show._season_episodes[seasonKey] || 0) === 0
    );

}



function renderSeasonEpisodeEmptyStateHTML(show,seasonNumber){

    const message = seasonEpisodeListIsLoadedEmpty(show,seasonNumber)
    ? "Episode list not announced yet."
    : "Loading episode list...";

    return `<div class="season-loading">${message}</div>`;

}



function renderDiscoverPreviewEpisodesHTML(show,seasonNumber,episodeList){

    if(!episodeList || episodeList.length === 0){
        return renderSeasonEpisodeEmptyStateHTML(show,seasonNumber);
    }

    let html = "";

    episodeList.forEach(ep=>{

        const aired = isEpisodeLoggable(ep,show,seasonNumber);

        html += `
            <div
            class="episode-row discover-episode-row ${aired ? "" : "future"}"
            data-season="${seasonNumber}"
            data-episode="${ep.episode_number}">
                <div class="episode-name">
                    E${ep.episode_number} — "${escapeHTML(ep.name || "Untitled Episode")}"
                </div>
                <div class="episode-date">
                    ${ep.air_date ? escapeHTML(formatAirDate(ep.air_date,ep)) : "Unknown"}
                </div>
                <button
                type="button"
                class="episode-check-button discover-preview-check-button"
                data-season="${seasonNumber}"
                data-episode="${ep.episode_number}"
                aria-label="${aired ? `Add ${escapeHTML(show.title || "show")} and mark watched through Season ${seasonNumber}, Episode ${ep.episode_number}` : "Episode has not aired yet"}"
                title="${aired ? "Add show and mark watched through this episode" : "Not aired yet"}"
                ${aired ? "" : "disabled"}>
                </button>
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

function renderShowModalPreservingScroll(show){
    renderShowDetailsPagePreservingScroll(show);
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

function renderShowDetailActionControlsHTML(show,isTracked){
    if(!show){
        return "";
    }

    if(!isTracked){
        return `
            <div class="modal-status-buttons show-page-status-buttons">
                <button class="modal-status-button show-page-add-status-button" data-add-status="watching">Add to Watching</button>
                <button class="modal-status-button show-page-add-status-button" data-add-status="plan">Add to Plan</button>
                <button class="modal-status-button show-page-add-status-button" data-add-status="finished">Add to Completed</button>
                <button class="modal-status-button show-page-add-status-button" data-add-status="dropped">Add to Dropped</button>
            </div>
        `;
    }

    return `
        <div class="modal-status-buttons show-page-status-buttons">
            ${statusButtonHTML(show,"watching","Watching")}
            ${statusButtonHTML(show,"plan","Plan to Watch")}
            ${statusButtonHTML(show,"paused","Paused")}
            ${statusButtonHTML(show,"finished","Completed")}
            ${statusButtonHTML(show,"dropped","Dropped")}
            <button class="remove-show-button" id="remove-show-button">Remove</button>
        </div>
    `;
}

function renderShowDetailTabsHTML(show){
    const activeTab = getShowDetailActiveTab(show);
    return `
        <div class="show-detail-tabs" role="tablist" aria-label="Show details sections">
            ${["Info","Episodes"].map(tab=>`
                <button type="button" class="show-detail-tab ${activeTab === tab ? "active" : ""}" data-show-detail-tab="${tab}" role="tab" aria-selected="${activeTab === tab ? "true" : "false"}">${tab}</button>
            `).join("")}
        </div>
    `;
}

function renderV2CrewMemberRows(people,fallbackRole=""){
    return (Array.isArray(people) ? people : []).map(person=>{
        const routeRole = getCrewRouteRole(person,fallbackRole);
        const photo = person.profile_path
        ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(person.profile_path,"w185"))}" alt="">`
        : `<div class="v2-actor-placeholder">CREW</div>`;

        return `
            <div class="v2-actor-list-row ${routeRole && Number(person && person.id || 0) > 0 ? "v2-person-card-link" : ""}" ${routeRole && Number(person && person.id || 0) > 0 ? `role="button" tabindex="0" data-person-role="${escapeHTML(routeRole)}" data-person-id="${escapeHTML(Number(person.id || 0))}"` : ""}>
                <div class="v2-actor-list-photo">${photo}</div>
                <div class="v2-actor-list-text">
                    <div class="v2-actor-name">${getPersonLinkNameHTML(person,routeRole,person.name || "Unknown")}</div>
                    <div class="v2-actor-role">${escapeHTML(person.job || "Crew")}${person.episode_count ? ` • ${Number(person.episode_count)} episodes` : ""}</div>
                </div>
            </div>
        `;
    }).join("");
}

function renderShowCrewTabHTML(show){
    const groups = show && show._tmdb_crew ? show._tmdb_crew : {};
    const order = [
        ["Creators","creators","creator"],
        ["Directors","directors","director"],
        ["Writers","writers","writer"],
        ["Producers","producers","producer"],
        ["Music","music","composer"],
        ["Other Crew","other",""]
    ];

    const html = order.map(([label,key,role])=>{
        const rows = renderV2CrewMemberRows(groups[key] || [],role);
        if(!rows){
            return "";
        }
        return `
            <div class="show-detail-crew-group">
                <h3 class="modal-section-heading">${escapeHTML(label)}</h3>
                <div class="v2-actor-list">${rows}</div>
            </div>
        `;
    }).filter(Boolean).join("");

    return html || `<div class="v2-api-empty">No crew details available yet.</div>`;
}

function renderAlternativeTitlesForDetailsHTML(show){
    const titles = Array.isArray(show && show._tmdb_alternative_titles) ? show._tmdb_alternative_titles : [];
    const grouped = new Map();

    titles
    .filter(item=>item && item.title)
    .slice(0,12)
    .forEach(item=>{
        const country = item.iso_3166_1 ? getCountryLabel(item.iso_3166_1) : "Other";
        const key = country || "Other";
        if(!grouped.has(key)){
            grouped.set(key,[]);
        }
        const title = String(item.title || "").trim();
        if(title && !grouped.get(key).includes(title)){
            grouped.get(key).push(title);
        }
    });

    if(!grouped.size){
        return "Unknown";
    }

    return `
        <div class="show-release-provider-stack">
            ${Array.from(grouped.entries()).map(([country,countryTitles])=>`
                <div class="v2-provider-group">
                    <div class="v2-provider-group-title">${escapeHTML(country)}</div>
                    <div class="show-detail-release-meta">
                        ${countryTitles.map(title=>`<span>${escapeHTML(title)}</span>`).join("")}
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderShowDetailsTabHTML(show){
    const rows = [
        {label:"Status",html:escapeHTML(show.tmdb_status || show.status || "Unknown")},
        {label:"Networks",html:renderShowNetworkDetailsHTML(show)},
        {label:"Language",html:renderShowLanguageDetailsHTML(show)},
        {label:"Country",html:renderShowCountryDetailsHTML(show)},
        {label:"Themes",html:renderShowThemesDetailsHTML(show)},
        {label:"Alternative Titles",html:renderAlternativeTitlesForDetailsHTML(show)}
    ];

    return `
        <div class="show-detail-fact-list">
            ${rows.map(row=>`
                <div class="show-detail-fact-row">
                    <div class="episode-detail-label">${escapeHTML(row.label)}</div>
                    <div class="episode-detail-value">${row.html}</div>
                </div>
            `).join("")}
        </div>
    `;
}

function renderShowGenresTabHTML(show){
    const genres = Array.isArray(show && show.genres) ? show.genres : [];
    if(!genres.length){
        return `<div class="v2-api-empty">No genres available.</div>`;
    }

    return `<div class="show-detail-genre-chips">${genres.map(genre=>{
        const route = getShowGenreRoute(genre);
        return route
        ? `<a href="${escapeHTML(route)}" class="show-detail-genre-chip show-genre-link" data-genre-name="${escapeHTML(genre)}" data-genre-route="${escapeHTML(route)}">${escapeHTML(genre)}</a>`
        : `<span>${escapeHTML(genre)}</span>`;
    }).join("")}</div>`;
}

function getRatingsByCountry(show){
    const map = new Map();
    (Array.isArray(show && show._tmdb_content_ratings) ? show._tmdb_content_ratings : []).forEach(item=>{
        if(item.iso_3166_1 && item.rating){
            map.set(String(item.iso_3166_1).toUpperCase(),String(item.rating));
        }
    });
    return map;
}

function renderProviderNamesForCountry(providerInfo){
    const names = collectV2ProviderNames(providerInfo);
    return names.length ? names.join(" / ") : "Not listed";
}

function renderShowReleasesTabHTML(show){
    const region = v2GetWatchRegion();
    const providers = show && show._tmdb_watch_providers && show._tmdb_watch_providers.results
    ? show._tmdb_watch_providers.results[region]
    : null;

    if(!providers){
        return `<div class="v2-api-empty">No watch provider data available for the selected region yet.</div>`;
    }

    const groups = [
        renderV2ProvidersGroup("Streaming",providers.flatrate,providers),
        renderV2ProvidersGroup("Rent",providers.rent,providers),
        renderV2ProvidersGroup("Buy",providers.buy,providers)
    ].filter(Boolean).join("");

    return groups ? `<div class="show-release-provider-stack">${groups}</div>` : `<div class="v2-api-empty">No watch provider data available for the selected region yet.</div>`;
}

function getShowInfoActiveTab(show){
    const id = String(show && show.tmdb_id ? show.tmdb_id : selectedShowId || "");
    const tab = activeShowInfoTabs && activeShowInfoTabs[id] ? activeShowInfoTabs[id] : "Cast";
    return ["Cast","Crew","Details","Genres","Releases"].includes(tab) ? tab : "Cast";
}

function renderShowInfoSubTabsHTML(show){
    const activeTab = getShowInfoActiveTab(show);
    return `
        <div class="show-info-subtabs" role="tablist" aria-label="Show info sections">
            ${["Cast","Crew","Details","Genres","Releases"].map(tab=>`
                <button type="button" class="show-info-subtab ${activeTab === tab ? "active" : ""}" data-show-info-tab="${tab}" role="tab" aria-selected="${activeTab === tab ? "true" : "false"}">${tab}</button>
            `).join("")}
        </div>
    `;
}

function renderShowCastTabHTML(show){
    const cast = Array.isArray(show && show._tmdb_cast) ? show._tmdb_cast : [];
    const rows = renderV2ActorListHTML(cast,null);

    return rows ? `<div class="v2-actor-list show-info-actor-list">${rows}</div>` : `<div class="v2-api-empty">No cast details available yet.</div>`;
}

function renderShowInfoSubTabContentHTML(show){
    const activeTab = getShowInfoActiveTab(show);

    if(activeTab === "Crew"){
        return renderShowCrewTabHTML(show);
    }
    if(activeTab === "Details"){
        return renderShowDetailsTabHTML(show);
    }
    if(activeTab === "Genres"){
        return renderShowGenresTabHTML(show);
    }
    if(activeTab === "Releases"){
        return renderShowReleasesTabHTML(show);
    }

    return renderShowCastTabHTML(show);
}

function getShowProgressSummary(show){
    const watchedCount = getWatchedEpisodeCount(show);
    const totalCount = show && show.status === "finished" ? Math.max(watchedCount,getTotalEpisodeCount(show)) : getTotalEpisodeCount(show);
    const progressPercent = show && show.status === "finished" ? 100 : totalCount ? Math.round((watchedCount / totalCount) * 100) : 0;
    const progressText = show && show.status === "finished" ? `Completed • ${totalCount} / ${totalCount} episodes` : `${watchedCount} / ${totalCount} episodes`;

    return {watchedCount,totalCount,progressPercent,progressText};
}

function renderShowProgressHTML(show){
    const summary = getShowProgressSummary(show);

    return `
        <div class="show-progress-card">
            <div class="show-progress-card-top">
                <div>
                    <div class="episode-detail-label">Overall Progress</div>
                    <div class="progress-text">${escapeHTML(summary.progressText)}</div>
                </div>
                <div class="show-progress-percent">${summary.progressPercent}%</div>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${summary.progressPercent}%"></div></div>
        </div>
    `;
}

function renderShowInfoTabHTML(show){
    return `
        <div class="show-info-tab-stack">
            <section class="show-info-synopsis-section">
                <h3 class="modal-section-heading">Synopsis</h3>
                <div class="modal-overview">${escapeHTML(show.overview || "No overview available.")}</div>
            </section>
            <section class="show-info-extra-section">
                ${renderShowInfoSubTabsHTML(show)}
                <div class="show-info-subtab-panel">${renderShowInfoSubTabContentHTML(show)}</div>
            </section>
        </div>
    `;
}

function renderShowEpisodesTabHTML(show){
    return `
        <div class="show-episodes-tab-stack">
            <div class="seasons-list">${renderSeasonsHTML(show)}</div>
        </div>
    `;
}

function renderShowDetailTabContentHTML(show){
    const activeTab = getShowDetailActiveTab(show);

    if(activeTab === "Episodes"){
        return renderShowEpisodesTabHTML(show);
    }

    return renderShowInfoTabHTML(show);
}

function renderShowDetailsPage(show,options={}){
    const content = document.getElementById("show-detail-content");

    if(!content || !show){
        return;
    }

    const isTracked = !!(DATA.shows && DATA.shows[String(show.tmdb_id)]);
    const year = show.first_air_date ? show.first_air_date.slice(0,4) : "Unknown";
    const genres = show.genres && show.genres.length ? show.genres.join(" • ") : "";
    const ratingAvailable = typeof show.tmdb_rating === "number" && show.tmdb_rating > 0;
    const ratingHTML = ratingAvailable
    ? `<span class="modal-meta-separator">•</span><span class="tmdb-rating-group"><span class="tmdb-rating-inline">${Number(show.tmdb_rating).toFixed(1)}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>`
    : "";
    const backdrop = show.backdrop_path
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), ${trackerBackgroundImage(show.backdrop_path,"original")}`
    : `linear-gradient(to top, #080808 0%, #141414 100%)`;

    selectedShowId = String(show.tmdb_id);
    activeShowDetailsTabs[String(show.tmdb_id)] = getShowDetailActiveTab(show);

    content.innerHTML = `
        <div class="show-detail-page-inner">
            <div class="show-page-hero-shell">
                <button type="button" class="show-page-back-button" id="show-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>

                <div class="modal-hero show-detail-hero show-page-hero" style='background-image:${backdrop}'></div>

                <div class="show-page-identity-row">
                    <div class="show-page-hero-poster">
                        ${show.poster_path ? `<img src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="${escapeHTML(show.title || "Show")} poster">` : `<div class="poster-placeholder">TV</div>`}
                    </div>
                    <div class="show-page-hero-content">
                        <div class="modal-title show-page-title">${escapeHTML(show.title || "Untitled")}</div>
                        <div class="modal-meta modal-meta-under-status show-page-meta-line">${getShowMetaHTML(show,year,genres,ratingHTML)}</div>
                        ${renderV2ShowInfoLinksLineHTML(show)}
                        <div class="show-page-actions-wrap">${renderShowDetailActionControlsHTML(show,isTracked)}</div>
                    </div>
                </div>
            </div>

            <div class="modal-body show-page-body">
                <div class="modal-section show-detail-tabs-section">
                    ${renderShowDetailTabsHTML(show)}
                    <div class="show-detail-tab-panel">${renderShowDetailTabContentHTML(show)}</div>
                </div>

                ${renderV2SimilarShowsHTML(show)}
            </div>
        </div>
    `;

    attachShowDetailsPageEvents(show,isTracked);
    attachV2ShowModalEvents(show);
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
            activeShowInfoTabs[String(show.tmdb_id)] = this.dataset.showInfoTab || "Cast";
            renderShowDetailsPagePreservingScroll(show);
        });
    });

    document.querySelectorAll(".show-genre-link[data-genre-name]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openGenrePage !== "function"){
                return;
            }
            event.preventDefault();
            openGenrePage(this.dataset.genreName || this.textContent || "");
        });
    });

    document.querySelectorAll(".show-detail-entity-link[data-discovery-type][data-discovery-value]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openDiscoveryFilterPage !== "function"){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openDiscoveryFilterPage(this.dataset.discoveryType,this.dataset.discoveryValue,{name:this.dataset.discoveryName || ""});
        });
    });

    document.querySelectorAll(".v2-person-link[data-person-role][data-person-id]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openPersonPage !== "function"){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openPersonPage(this.dataset.personRole,this.dataset.personId);
        });
    });

    document.querySelectorAll(".v2-person-card-link[data-person-role][data-person-id]").forEach(card=>{
        const activate = function(event){
            if(typeof openPersonPage !== "function"){
                return;
            }
            if(event){
                event.preventDefault();
                event.stopPropagation();
            }
            openPersonPage(this.dataset.personRole,this.dataset.personId);
        };

        card.addEventListener("click",activate);
        card.addEventListener("keydown",function(event){
            if(event.key === "Enter" || event.key === " "){
                activate.call(this,event);
            }
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
        row.addEventListener("click",function(event){
            if(event.target && event.target.closest("button, a, input, select, textarea")){
                return;
            }
            openEpisodeModal(show.tmdb_id,Number(this.dataset.season),Number(this.dataset.episode),{backToShow:true});
        });
    });

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



function getEpisodeNavLabel(prefix,target){

    if(!target){
        return "";
    }

    return `${prefix} S${target.season}E${String(target.episode).padStart(2,"0")}`;

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

    const imagePath = episodeData.still_path || show.backdrop_path || show.poster_path || "";

    const backdrop = imagePath
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.4) 65%), ${trackerBackgroundImage(imagePath,"original")}`
    : `linear-gradient(to top, #080808 0%, #111 100%)`;

    const airDateText = episodeData.air_date
    ? formatAirDate(episodeData.air_date,episodeData)
    : "Unknown";

    const releaseTimeText = episodeData.air_date
    ? getEpisodeReleaseTimeText(episodeData.air_date,episodeData,show)
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

    const episodeDetailCardsHTML = "";

    const previousEpisodeTarget = getPreviousEpisodeTarget(show,seasonNumber,episodeNumber);
    const nextEpisodeTarget = getNextEpisodeTarget(show,seasonNumber,episodeNumber);

    content.innerHTML = `

        <div class="episode-detail-page-inner">

        <div class="modal-hero episode-detail-hero" style='background-image:${backdrop}'>

            <button class="episode-detail-back-button" id="episode-open-show-button" type="button" aria-label="Back to show">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>

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
                ? `<button class="episode-detail-action-button ${isWatched ? "primary" : ""}" id="episode-toggle-watched-button">
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

                    ${episodeDetailCardsHTML}

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

            ${renderV2EpisodeExtraHTML(show,seasonNumber,episodeNumber,episodeData)}

            ${renderV2EpisodeActorsHTML(show,seasonNumber,episodeNumber)}

        </div>

        </div>

    `;

    attachV2RailScrollEvents();

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

        previousButton.addEventListener("click",function(){

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

        nextButton.addEventListener("click",function(){

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
        const seasonMetaHTML = renderV2SeasonMetaHTML(show,season,total);
        const isTrackedShow = !!(DATA.shows && DATA.shows[String(show.tmdb_id)]);

        const airedEpisodeNumbers = getAiredEpisodeNumbersInSeason(show,season);

        const seasonIsFullyWatched = isSeasonFullyWatched(
            show,
            season,
            airedEpisodeNumbers
        );

        html += `

            <div class="season-box collapse collapse-arrow bg-base-100 border-base-300 border ${isOpen ? "open collapse-open" : "collapse-close"}">

                <div class="season-header collapse-title">

                    <button
                    type="button"
                    class="season-toggle-area"
                    data-season="${season}"
                    aria-expanded="${isOpen ? "true" : "false"}">

                        <span class="season-left">

                            <span class="season-title-stack">
                                <span class="season-title">
                                    Season ${season}
                                </span>
                                ${seasonMetaHTML}
                            </span>

                        </span>

                        <span class="season-count">
                            ${total ? `${watched} / ${total}` : ""}
                        </span>

                    </button>

                    <button
                        type="button"
                        class="season-all-button ${seasonIsFullyWatched ? "checked" : ""}"
                        data-season="${season}"
                        title="${isTrackedShow ? (seasonIsFullyWatched ? "Mark season as unwatched" : "Mark aired episodes as watched") : "Add this show before changing watched episodes"}"
                        ${isTrackedShow ? "" : "disabled"}>
                        </button>

                </div>

                ${
                isOpen
                ? `<div class="season-episodes collapse-content">${renderSeasonEpisodesHTML(show,season)}</div>`
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
        return renderSeasonEpisodeEmptyStateHTML(show,seasonNumber);
    }

    let html = "";

    episodeList.forEach(ep=>{

        const watchedEpisodes = show.episodes_watched[String(seasonNumber)] || [];
        const isWatched = watchedEpisodes.includes(ep.episode_number);
        const aired = isEpisodeLoggable(ep,show,seasonNumber);
        const isTrackedShow = !!(DATA.shows && DATA.shows[String(show.tmdb_id)]);
        const canToggle = isTrackedShow && (aired || isWatched);

        html += `

            <div class="${isWatched ? "episode-row watched" : aired ? "episode-row" : "episode-row future"}" data-season="${seasonNumber}" data-episode="${ep.episode_number}">

                <div class="episode-name">
                    E${ep.episode_number} — "${escapeHTML(ep.name || "Untitled Episode")}"
                </div>

                <button
                type="button"
                class="${isWatched ? "episode-check-button checked" : "episode-check-button"}"
                data-season="${seasonNumber}"
                data-episode="${ep.episode_number}"
                data-watched="${isWatched ? "true" : "false"}"
                ${canToggle ? "" : "disabled"}
                title="${canToggle ? (isWatched ? "Mark as unwatched" : "Mark as watched") : (isTrackedShow ? "Not aired yet" : "Add this show before changing watched episodes")}">
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

            <div class="settings-section admin-account-section">

                <div class="settings-section-header">
                    <h2>ADMIN ACCOUNT</h2>
                    <p>Change the private login username or password. Saving signs out every logged-in device.</p>
                </div>

                <form class="admin-account-form" id="admin-account-form" autocomplete="on">
                <div class="admin-account-grid">
                    <label class="profile-settings-label" for="admin-username-input">Admin Username</label>
                    <input class="profile-settings-input" id="admin-username-input" type="text" maxlength="80" autocomplete="username" value="${escapeHTML(getAdminAccountUsername())}" placeholder="Loading account...">

                    <label class="profile-settings-label" for="admin-current-password-input">Current Password</label>
                    <input class="profile-settings-input" id="admin-current-password-input" type="password" autocomplete="current-password">

                    <label class="profile-settings-label" for="admin-new-password-input">New Password</label>
                    <input class="profile-settings-input" id="admin-new-password-input" type="password" minlength="16" autocomplete="new-password" placeholder="Leave blank to keep current password">

                    <label class="profile-settings-label" for="admin-confirm-password-input">Confirm New Password</label>
                    <input class="profile-settings-input" id="admin-confirm-password-input" type="password" minlength="16" autocomplete="new-password">
                </div>

                <p class="settings-small-note admin-account-status" id="admin-account-status" aria-live="polite"></p>

                <div class="settings-button-list">
                    <button class="settings-action-button" id="save-admin-account" type="submit">Save Account Changes</button>
                </div>
                </form>

            </div>

            <div class="settings-section">

                <div class="settings-section-header">
                    <h2>APP BACKUP</h2>
                    <p>Export or import a full backup of this tracker.</p>
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


    const adminUsernameInput = document.getElementById("admin-username-input");
    if(adminUsernameInput){
        adminUsernameInput.addEventListener("input",function(){
            this.dataset.userEdited = "true";
        });
    }

    const adminAccountForm = document.getElementById("admin-account-form");
    if(adminAccountForm){
        adminAccountForm.addEventListener("submit",function(event){
            event.preventDefault();
            saveAdminAccountChanges();
        });
    }

    loadAdminAccountIntoSettings();

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
            ? `<img src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="">`
            : `<div class="profile-favorite-placeholder">📺</div>`;

            favoriteSlotsHTML += `
                <button class="profile-favorite-slot filled" type="button" data-favorite-action="open" data-favorite-show-id="${escapeHTML(show.tmdb_id)}" aria-label="Open ${escapeHTML(show.title || "favorite show")}">
                    ${posterHTML}
                </button>
            `;

        }else{

            favoriteSlotsHTML += `
                <button class="profile-favorite-slot empty" type="button" data-favorite-action="edit" aria-label="Add favorite show">
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

    document.querySelectorAll("[data-favorite-action='open']").forEach(button=>{

        button.addEventListener("click",function(){
            const showId = this.dataset.favoriteShowId || "";
            if(showId && typeof openShowDetailsPage === "function"){
                openShowDetailsPage(showId);
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
