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
    : (pageTitles[activePage] || "TV Tracker");

}

function updateShellTitle(){

    const label = getTrackerDocumentTitleLabel();

    if(typeof document !== "undefined"){
        document.title = label && label !== "TV Tracker" ? `${label} — TV Tracker` : "TV Tracker";
    }

    const title = document.getElementById("mobile-page-title");

    if(title){
        title.textContent = label || "TV Tracker";
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





function renderDiscoverHub(){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    const state = typeof discoverHubState === "object" && discoverHubState
    ? discoverHubState
    : {loaded:false,loading:false,error:"",sections:[],genres:[]};

    if(state.loading && (!state.sections || state.sections.length === 0)){
        results.innerHTML = `
            <div class="discover-page-shell">
                ${renderDiscoverHubSkeleton("TV Shows")}
                ${renderDiscoverHubSkeleton("Movies")}
                ${renderDiscoverHubSkeleton("Collections")}
            </div>
        `;
        return;
    }

    if(state.error && (!state.sections || state.sections.length === 0)){
        results.innerHTML = `
            <div class="discover-page-shell">
                <div class="empty-state search-empty-state">
                    <h2>Discover failed to load</h2>
                    <p>Couldn’t load this page. Try again later.</p>
                </div>
            </div>
        `;
        return;
    }

    const sections = (Array.isArray(state.sections) ? state.sections : [])
    .map(section=>{
        const items = Array.isArray(section.items) ? section.items : (Array.isArray(section.shows) ? section.shows : []);
        return Object.assign({},section,{items:items.filter(item=>item && item.id)});
    })
    .filter(section=>section.items.length > 0);

    const tvRows = sections.filter(section=>section.media === "tv");
    const movieRows = sections.filter(section=>section.media === "movie");

    results.innerHTML = `
        <div class="discover-page-shell">
            ${renderDiscoverSectionGroup("TV Shows",tvRows)}
            ${renderDiscoverSectionGroup("Movies",movieRows)}
            ${renderDiscoverCollectionsSection(state.collections || [])}
            ${renderDiscoverGenreSection(state.genres || [])}
        </div>
    `;

    attachDiscoverHubEvents();
}

function renderTrackerPosterSkeletonCards(count=12){
    return Array.from({length:count}).map(()=>`
        <div class="tt-skeleton-poster-card" aria-hidden="true">
            <div class="tt-skeleton-poster"></div>
            <div class="tt-skeleton-line tt-skeleton-line-title"></div>
            <div class="tt-skeleton-line tt-skeleton-line-meta"></div>
        </div>
    `).join("");
}

function renderTrackerPersonSkeletonCards(count=12){
    return Array.from({length:count}).map(()=>`
        <div class="search-person-card search-person-skeleton-card" aria-hidden="true">
            <div class="tt-skeleton-poster"></div>
            <div class="tt-skeleton-line tt-skeleton-line-title"></div>
        </div>
    `).join("");
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
            <button class="episode-detail-back-button" id="episode-open-show-button" type="button" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <section class="tt-episode-skeleton" aria-label="Loading episode">
                <div class="tt-episode-skeleton-still"></div>
                <div class="tt-episode-skeleton-copy">
                    <div class="tt-skeleton-kicker"></div>
                    <div class="tt-skeleton-heading"></div>
                    <div class="tt-skeleton-line tt-skeleton-line-wide"></div>
                    <div class="tt-skeleton-line tt-skeleton-line-mid"></div>
                    <p>S${Number(seasonNumber)}E${String(Number(episodeNumber)).padStart(2,"0")}</p>
                </div>
            </section>
        </div>
    `;
}

function renderDiscoverHubSkeleton(title){
    return `
        <section class="discover-section-group">
            <h2 class="discover-group-title">${escapeHTML(title)}</h2>
            <div class="discover-section">
                <div class="discover-card-row discover-card-row-loading" aria-label="Loading ${escapeHTML(title)}">
                    ${renderTrackerPosterSkeletonCards(8)}
                </div>
            </div>
        </section>
    `;
}

function renderDiscoverSectionGroup(title,sections){
    const cleanSections = Array.isArray(sections) ? sections : [];
    if(!cleanSections.length){
        return "";
    }
    return `
        <section class="discover-section-group">
            <h2 class="discover-group-title">${escapeHTML(title)}</h2>
            ${cleanSections.map(renderDiscoverHubSection).join("")}
        </section>
    `;
}

function renderDiscoverHubSection(section){
    const items = Array.isArray(section.items) ? section.items : [];
    const route = String(section.route || "").trim();
    return `
        <section class="discover-section">
            <div class="discover-section-heading">
                <h3>${escapeHTML(section.title || "Browse")}</h3>
                ${route ? `<a class="view-more-button discover-view-more-link" href="${escapeHTML(route)}">VIEW MORE</a>` : ""}
            </div>
            <div class="discover-carousel-shell">
                <div class="discover-card-row" data-discover-row="${escapeHTML(section.key || section.title || "row")}">
                    ${items.map(renderDiscoverHubCard).join("")}
                </div>
            </div>
        </section>
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

function getCollectionPosterSlotsForRender(collection){
    const slots = [];
    const pushSlot = raw=>{
        const slot = normalizeCollectionPosterSlotForRender(raw,collection);
        if(slot){ slots.push(slot); }
    };
    if(Array.isArray(collection && collection.poster_slots) && collection.poster_slots.length){
        collection.poster_slots.slice(0,3).forEach(pushSlot);
    }else if(Array.isArray(collection && collection.parts) && collection.parts.length){
        collection.parts.slice(0,3).forEach(pushSlot);
    }else if(Array.isArray(collection && collection.poster_paths) && collection.poster_paths.length){
        collection.poster_paths.slice(0,3).forEach(path=>pushSlot({poster_path:path,title:collection && (collection.name || collection.title) || "Collection"}));
    }else if(collection && collection.poster_path){
        pushSlot({poster_path:collection.poster_path,title:collection.name || collection.title || "Collection"});
    }
    return slots.slice(0,3);
}

function renderCollectionPosterStackHTML(collection){
    const title = String(collection && (collection.name || collection.title) || "Collection");
    const slots = getCollectionPosterSlotsForRender(collection);
    if(!slots.length){ return ""; }
    const html = slots.map((slot,index)=>{
        const labelTitle = getCollectionPosterSlotTitle(slot,collection);
        const year = getCollectionPosterSlotYear(slot);
        const label = year ? `${labelTitle} (${year})` : labelTitle;
        return `
            <div class="collection-stack-poster collection-stack-poster-${index + 1} ${slot.poster_path ? "" : "collection-stack-placeholder"}" title="${escapeHTML(label)}">
                ${slot.poster_path ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(slot.poster_path,"w500"))}" alt="${escapeHTML(title + " poster")}">` : `<span>${escapeHTML(label)}</span>`}
            </div>
        `;
    });
    return `<div class="collection-poster-stack collection-poster-count-${slots.length}" aria-hidden="true">${html.join("")}</div>`;
}

function renderCollectionCard(collection,extraClass=""){
    const id = collection && collection.id ? String(collection.id) : "";
    const name = String(collection && (collection.name || collection.title) || "Collection").trim();
    const route = typeof getCollectionDetailRoute === "function" ? getCollectionDetailRoute(id,name) : "";
    const count = typeof getCollectionMovieCount === "function" ? getCollectionMovieCount(collection) : Number(collection && collection.movie_count || (Array.isArray(collection && collection.parts) ? collection.parts.length : 0));
    const countLabel = count === 1 ? "1 movie" : `${count || 0} movies`;
    return `
        <a href="${escapeHTML(route)}" class="collection-card ${escapeHTML(extraClass)}" data-collection-id="${escapeHTML(id)}" data-collection-name="${escapeHTML(name)}">
            ${renderCollectionPosterStackHTML(collection)}
            <div class="collection-card-title">${escapeHTML(name)}</div>
            <div class="collection-card-meta">${escapeHTML(countLabel)}</div>
        </a>
    `;
}

function renderDiscoverCollectionsSection(collections){
    const cleanCollections = (Array.isArray(collections) ? collections : [])
    .filter(collection=>typeof isPromotableCollection === "function" ? isPromotableCollection(collection) : collection && collection.id && collection.name)
    .slice(0,12);
    if(!cleanCollections.length){
        return "";
    }
    return `
        <section class="discover-section-group discover-collections-section">
            <div class="discover-section-heading discover-collections-heading">
                <h2 class="discover-group-title">Collections</h2>
                <a class="view-more-button discover-view-more-link" href="/app/collections">VIEW MORE</a>
            </div>
            <section class="discover-section">
                <div class="discover-carousel-shell">
                    <div class="discover-card-row discover-collection-row" data-discover-row="collections">
                        ${cleanCollections.map(collection=>renderCollectionCard(collection,"discover-collection-card")).join("")}
                    </div>
                </div>
            </section>
        </section>
    `;
}

const DISCOVER_GENRE_TONE_CLASSES = Object.freeze({
    "action & adventure":"discover-genre-tone-action-adventure",
    "animation":"discover-genre-tone-animation",
    "comedy":"discover-genre-tone-comedy",
    "crime":"discover-genre-tone-crime",
    "documentary":"discover-genre-tone-documentary",
    "drama":"discover-genre-tone-drama",
    "family":"discover-genre-tone-family",
    "kids":"discover-genre-tone-kids",
    "mystery":"discover-genre-tone-mystery",
    "news":"discover-genre-tone-news",
    "reality":"discover-genre-tone-reality",
    "sci-fi & fantasy":"discover-genre-tone-sci-fi-fantasy",
    "soap":"discover-genre-tone-soap",
    "talk":"discover-genre-tone-talk",
    "war & politics":"discover-genre-tone-war-politics",
    "western":"discover-genre-tone-western",
    "action":"discover-genre-tone-action",
    "adventure":"discover-genre-tone-adventure",
    "fantasy":"discover-genre-tone-fantasy",
    "history":"discover-genre-tone-history",
    "horror":"discover-genre-tone-horror",
    "music":"discover-genre-tone-music",
    "romance":"discover-genre-tone-romance",
    "science fiction":"discover-genre-tone-science-fiction",
    "tv movie":"discover-genre-tone-tv-movie",
    "thriller":"discover-genre-tone-thriller",
    "war":"discover-genre-tone-war"
});

function getDiscoverGenreToneClass(name){
    return DISCOVER_GENRE_TONE_CLASSES[String(name || "").trim().toLowerCase()] || "";
}

function renderDiscoverGenreCards(genres,media){
    const cleanMedia = String(media || "tv").trim().toLowerCase() === "movie" ? "movie" : "tv";

    return (Array.isArray(genres) ? genres : [])
    .map(genre=>{
        const name = String(genre && genre.name || "").trim();

        if(cleanMedia === "tv" && name.toLowerCase() === "soap"){
            return null;
        }

        const route = name && genre && genre.id && typeof getGenreDetailRoute === "function" ? getGenreDetailRoute(genre.id,name,media) : "";
        return name && route && route !== "/app/list/watching" ? {name,route} : null;
    })
    .filter(Boolean)
    .map(item=>{
        const toneClass = getDiscoverGenreToneClass(item.name);
        return `<a class="discover-genre-card ${escapeHTML(toneClass)}" href="${escapeHTML(item.route)}"><span>${escapeHTML(item.name)}</span></a>`;
    })
    .join("");
}

function renderDiscoverGenreSection(genres){
    const grouped = typeof normalizeDiscoverGenreState === "function" ? normalizeDiscoverGenreState(genres) : {tv:Array.isArray(genres) ? genres : [],movie:[]};
    const activeMedia = typeof normalizeGenreMediaType === "function" ? normalizeGenreMediaType(typeof discoverGenreMedia !== "undefined" ? discoverGenreMedia : "tv") : "tv";
    const tvCards = renderDiscoverGenreCards(grouped.tv,"tv");
    const movieCards = renderDiscoverGenreCards(grouped.movie,"movie");

    if(!tvCards && !movieCards){
        return "";
    }

    return `
        <section class="discover-section-group discover-genre-section">
            <div class="discover-genre-heading-row">
                <h2 class="discover-group-title">Genres</h2>
                <div class="discover-genre-tab-row" role="tablist" aria-label="Genre media type">
                    <button type="button" class="discover-genre-tab ${activeMedia === "tv" ? "active" : ""}" data-discover-genre-media="tv" role="tab" aria-selected="${activeMedia === "tv" ? "true" : "false"}">TV Shows</button>
                    <button type="button" class="discover-genre-tab ${activeMedia === "movie" ? "active" : ""}" data-discover-genre-media="movie" role="tab" aria-selected="${activeMedia === "movie" ? "true" : "false"}">Movies</button>
                </div>
            </div>
            <div class="discover-genre-panel" data-discover-genre-panel="tv" ${activeMedia === "tv" ? "" : "hidden"}>
                <div class="discover-genre-grid">${tvCards || `<div class="v2-api-empty">No TV genres available.</div>`}</div>
            </div>
            <div class="discover-genre-panel" data-discover-genre-panel="movie" ${activeMedia === "movie" ? "" : "hidden"}>
                <div class="discover-genre-grid">${movieCards || `<div class="v2-api-empty">No movie genres available.</div>`}</div>
            </div>
        </section>
    `;
}

function renderDiscoverHubCard(item){
    const mediaType = item && item.media_type === "movie" ? "movie" : "tv";
    const title = item && (item.title || item.name) ? String(item.title || item.name) : "Untitled";
    const date = item && (item.date || item.release_date || item.first_air_date) ? String(item.date || item.release_date || item.first_air_date) : "";
    const year = date ? date.slice(0,4) : "Unknown";
    const posterHTML = item && item.poster_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(item.poster_path,"w500"))}" alt="${escapeHTML(title + " poster")}">`
    : renderDiscoverPosterPlaceholderHTML(item,mediaType);

    const route = mediaType === "movie"
    ? (typeof getMovieDetailRoute === "function" ? getMovieDetailRoute(item && item.id,title) : "")
    : (typeof getShowDetailRoute === "function" ? getShowDetailRoute(item && item.id,title) : "");

    return `
        <a
        href="${escapeHTML(route)}"
        class="discover-hub-card"
        data-media-type="${escapeHTML(mediaType)}"
        data-media-id="${escapeHTML(item && item.id)}"
        data-media-name="${escapeHTML(title)}"
        data-poster-path="${escapeHTML(item && item.poster_path || "")}" 
        data-overview="${escapeHTML(item && item.overview || "")}" 
        data-first-air-date="${escapeHTML(item && item.first_air_date || "")}" 
        data-release-date="${escapeHTML(item && item.release_date || "")}">
            <div class="discover-card-poster">
                ${posterHTML}
            </div>
            <div class="discover-card-title">${escapeHTML(title)}</div>
            <div class="discover-card-meta">${escapeHTML(year)}</div>
        </a>
    `;
}

function attachDiscoverHubEvents(){
    document.querySelectorAll(".discover-genre-tab[data-discover-genre-media]").forEach(button=>{
        button.addEventListener("click",function(){
            if(typeof normalizeGenreMediaType === "function"){
                discoverGenreMedia = normalizeGenreMediaType(this.dataset.discoverGenreMedia || "tv");
            }else{
                discoverGenreMedia = String(this.dataset.discoverGenreMedia || "tv") === "movie" ? "movie" : "tv";
            }
            renderDiscoverHub();
        });
    });

    document.querySelectorAll(".discover-hub-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaType = String(this.dataset.mediaType || "tv");
            const mediaId = Number(this.dataset.mediaId || 0);
            const mediaName = this.dataset.mediaName || "";
            if(!mediaId){
                return;
            }
            const backRoute = lockSearchRouteBeforeResultOpen();
            if(mediaType === "movie" && typeof openMoviePage === "function"){
                await openMoviePage(mediaId,{movieName:mediaName,navigationContext:"discover",backRoute:backRoute});
                return;
            }
            if(typeof openShowDetailsPage === "function"){
                await openShowDetailsPage(mediaId,{showName:mediaName,navigationContext:"discover",backRoute:backRoute});
            }
        });
    });
}

function renderSearchTabButtonHTML(type,label,isActive){
    return `
        <button
        type="button"
        class="search-tab-button ${isActive ? "active" : ""}"
        data-search-media="${escapeHTML(type)}"
        role="tab"
        aria-selected="${isActive ? "true" : "false"}">
            ${escapeHTML(label)}
        </button>
    `;
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

function renderMediaPosterPlaceholderHTML(item,media="movie",extraClass=""){
    const label = getMediaPosterPlaceholderLabel(item,media);
    return `<div class="genre-card-placeholder media-title-placeholder ${escapeHTML(extraClass)}" title="${escapeHTML(label)}"><span>${escapeHTML(label)}</span></div>`;
}

function renderPosterTitlePlaceholderHTML(item,media="movie",extraClass=""){
    const label = getMediaPosterPlaceholderLabel(item,media);
    return `<div class="poster-placeholder media-title-placeholder ${escapeHTML(extraClass)}" title="${escapeHTML(label)}"><span>${escapeHTML(label)}</span></div>`;
}

function renderDiscoverPosterPlaceholderHTML(item,media="movie"){
    const label = getMediaPosterPlaceholderLabel(item,media);
    return `<div class="discover-card-placeholder media-title-placeholder" title="${escapeHTML(label)}"><span>${escapeHTML(label)}</span></div>`;
}

function renderSearchResultPosterCard(result){
    const mediaType = result && result.media_type === "movie" ? "movie" : "tv";
    const title = result && (result.title || result.name) ? String(result.title || result.name) : "Untitled";
    const date = result && (result.date || result.first_air_date || result.release_date) ? String(result.date || result.first_air_date || result.release_date) : "";
    const posterHTML = result && result.poster_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(result.poster_path,"w500"))}" alt="${escapeHTML(title + " poster")}">`
    : renderMediaPosterPlaceholderHTML(result,mediaType);
    const year = date ? date.slice(0,4) : "Unknown";
    const rating = Number(result && result.vote_average || 0);
    const ratingHTML = rating > 0 ? ` • ${rating.toFixed(1)}` : "";

    const route = mediaType === "movie"
    ? (typeof getMovieDetailRoute === "function" ? getMovieDetailRoute(result && result.id,title) : "")
    : (typeof getShowDetailRoute === "function" ? getShowDetailRoute(result && result.id,title) : "");

    return `
        <a
        href="${escapeHTML(route)}"
        class="genre-result-card search-result-poster-card"
        data-eye-faded="${result && result._eyeFaded ? "true" : "false"}"
        data-media-type="${escapeHTML(mediaType)}"
        data-media-id="${escapeHTML(result && result.id)}"
        data-media-name="${escapeHTML(title)}"
        data-poster-path="${escapeHTML(result && result.poster_path || "")}" 
        data-overview="${escapeHTML(result && result.overview || "")}" 
        data-first-air-date="${escapeHTML(result && result.first_air_date || "")}" 
        data-release-date="${escapeHTML(result && result.release_date || "")}">
            <div class="genre-result-poster">${posterHTML}</div>
            <div class="genre-result-title">${escapeHTML(title)}</div>
            <div class="genre-result-meta">${escapeHTML(year)}${escapeHTML(ratingHTML)}</div>
        </a>
    `;
}

function renderSearchPersonCard(result){
    const name = result && result.name ? String(result.name) : "Unknown Person";
    const photoHTML = result && (result.profile_path || result.poster_path)
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(result.profile_path || result.poster_path,"h632"))}" alt="${escapeHTML(name + " photo")}">`
    : renderPersonSilhouettePlaceholderHTML("search-person-placeholder");

    const route = typeof getPersonDetailRoute === "function" ? getPersonDetailRoute("person",result && result.id,name) : "";

    return `
        <a
        href="${escapeHTML(route)}"
        class="search-person-card"
        data-media-type="person"
        data-media-id="${escapeHTML(result && result.id)}"
        data-media-name="${escapeHTML(name)}"
        data-person-role="person">
            <div class="search-person-photo">${photoHTML}</div>
            <div class="search-person-name">${escapeHTML(name)}</div>
        </a>
    `;
}


function lockSearchRouteBeforeResultOpen(){
    if(activePage !== "search" || typeof getSearchRoute !== "function" || !window.TVTrackerRouter){
        return "";
    }
    const state = typeof discoverSearchState === "object" && discoverSearchState ? discoverSearchState : {};
    const query = String(state.query || (searchRouteState && searchRouteState.query) || "").trim();
    const media = typeof normalizeSearchMediaType === "function" ? normalizeSearchMediaType(state.media || (searchRouteState && searchRouteState.media) || "tv") : "tv";
    const route = getSearchRoute(query,media,searchRouteState);
    if(searchRouteState){
        searchRouteState.query = query;
        searchRouteState.media = media;
    }
    if(discoverSearchState){
        discoverSearchState.query = query;
        discoverSearchState.media = media;
    }
    window.TVTrackerRouter.setPathRoute(route,true);
    return route;
}

function renderSearchResults(resultsList){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    const state = typeof discoverSearchState === "object" && discoverSearchState
    ? discoverSearchState
    : {query:"",media:"tv",page:1,totalPages:1,loading:false};
    const query = String(state.query || "").trim();
    const media = typeof normalizeSearchMediaType === "function" ? normalizeSearchMediaType(state.media || "tv") : "tv";
    const allItems = Array.isArray(resultsList) ? resultsList : [];
    const mediaItems = allItems.filter(item=>String(item && item.media_type || "tv") === media);
    const batchSize = typeof SEARCH_RESULT_BATCH_SIZE !== "undefined" ? SEARCH_RESULT_BATCH_SIZE : 21;
    const visibleLimit = Math.max(batchSize,Number(state.visibleLimit || batchSize));
    const filteredItems = media === "person" ? mediaItems : getEyeFilteredRenderItems(mediaItems,media,state);
    const visibleItems = filteredItems.slice(0,visibleLimit);
    const labels = {tv:"TV Shows",movie:"Movies",person:"People"};

    const searchEyeControlHTML = media !== "person" && query ? renderEyeFilterControlHTML(state,"search-eye-filter-menu") : "";
    const tabsHTML = `
        <div class="search-tab-row" role="tablist" aria-label="Search result type">
            ${renderSearchTabButtonHTML("tv","TV Shows",media === "tv")}
            ${renderSearchTabButtonHTML("movie","Movies",media === "movie")}
            ${renderSearchTabButtonHTML("person","People",media === "person")}
            ${searchEyeControlHTML}
        </div>
    `;

    const skeletonHTML = media === "person"
    ? `<div class="search-person-grid search-person-grid-loading">${renderTrackerPersonSkeletonCards(12)}</div>`
    : `<div class="genre-tight-grid genre-tight-grid-loading search-tight-grid">${renderTrackerPosterSkeletonCards(12)}</div>`;

    const bodyHTML = !query
    ? `
        <div class="empty-state search-empty-state">
            <p>Start typing to search.</p>
        </div>
    `
    : state.loading && !visibleItems.length
    ? skeletonHTML
    : visibleItems.length
    ? media === "person"
        ? `<div class="search-person-grid">${visibleItems.map(renderSearchPersonCard).join("")}</div>`
        : `<div class="genre-tight-grid search-tight-grid">${visibleItems.map(renderSearchResultPosterCard).join("")}</div>`
    : `
        <div class="empty-state search-empty-state">
            <h2>${escapeHTML(mediaItems.length ? "No results found" : `No ${labels[media] || "results"} found`)}</h2>
            <p>Try another tab or another search.</p>
        </div>
    `;

    const canLoadMore = query && (visibleItems.length < filteredItems.length || Number(state.page || 1) < Number(state.totalPages || 1));
    results.innerHTML = `
        <div class="search-page-shell ${activePage === "discover" ? "discover-live-search-shell" : ""}">
            ${tabsHTML}
            <div class="search-results-body">
                ${bodyHTML}
            </div>
            ${canLoadMore ? `<button type="button" class="view-more-button search-view-more-button" id="search-load-more-button" ${state.loading ? "disabled" : ""}>${state.loading ? "Loading…" : "VIEW MORE"}</button>` : ""}
        </div>
    `;

    if(typeof ensureBrowseGlobalInteractionEvents === "function"){
        ensureBrowseGlobalInteractionEvents();
    }

    document.querySelectorAll(".search-tab-button[data-search-media]").forEach(button=>{
        button.addEventListener("click",function(){
            if(typeof setSearchMediaType === "function"){
                setSearchMediaType(this.dataset.searchMedia || "tv");
            }
        });
    });

    document.querySelectorAll(".search-result-poster-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaType = String(this.dataset.mediaType || "tv");
            const mediaId = Number(this.dataset.mediaId || 0);
            const mediaName = this.dataset.mediaName || "";
            if(!mediaId){
                return;
            }
            const backRoute = lockSearchRouteBeforeResultOpen();
            if(mediaType === "movie" && typeof openMoviePage === "function"){
                await openMoviePage(mediaId,{movieName:mediaName,navigationContext:"discover",backRoute:backRoute});
                return;
            }
            if(typeof openShowDetailsPage === "function"){
                await openShowDetailsPage(mediaId,{showName:mediaName,navigationContext:"discover",backRoute:backRoute});
            }
        });
    });

    document.querySelectorAll(".search-person-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(!isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaId = Number(this.dataset.mediaId || 0);
            if(!mediaId || typeof openPersonPage !== "function"){
                return;
            }
            const backRoute = lockSearchRouteBeforeResultOpen();
            await openPersonPage(this.dataset.personRole || "person",mediaId,{personName:this.dataset.mediaName || "",navigationContext:"discover",backRoute:backRoute});
        });
    });

    const moreButton = document.getElementById("search-load-more-button");
    if(moreButton){
        moreButton.addEventListener("click",loadMoreSearchResults);
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

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

function renderThemeItemHTML(theme,extraClass="",media="tv"){
    const id = Number(theme && theme.id || 0);
    const name = String(theme && theme.name || "").trim();
    const cleanMedia = media === "movie" ? "movie" : "tv";
    const mediaWord = cleanMedia === "movie" ? "Movies" : "Shows";
    if(!name){
        return "";
    }
    if(id > 0){
        const route = typeof getDiscoveryFilterDetailRoute === "function" ? getDiscoveryFilterDetailRoute("theme",id,name,cleanMedia) : "";
        return `<a class="show-detail-theme-chip show-detail-theme-link ${escapeHTML(extraClass)}" href="${escapeHTML(route)}" data-discovery-type="theme" data-discovery-value="${escapeHTML(id)}" data-discovery-media="${escapeHTML(cleanMedia)}" data-discovery-name="${escapeHTML(`${mediaWord} about ${name}`)}" data-discovery-label="${escapeHTML(name)}">${escapeHTML(name)}</a>`;
    }
    return `<span class="show-detail-theme-chip ${escapeHTML(extraClass)}">${escapeHTML(name)}</span>`;
}

function renderGenrePosterGridCard(show){
    const mediaType = show && show.media_type === "movie" ? "movie" : "tv";
    const title = show && (show.title || show.name) ? (show.title || show.name) : "Untitled";
    const date = show && (show.date || show.release_date || show.first_air_date) ? String(show.date || show.release_date || show.first_air_date) : "";
    const posterHTML = show && show.poster_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="${escapeHTML(title + " poster")}">`
    : renderMediaPosterPlaceholderHTML(show,mediaType);

    const year = date ? date.slice(0,4) : "Unknown";
    const rating = Number(show && show.vote_average || 0);
    const ratingHTML = rating > 0 ? ` • ${rating.toFixed(1)}` : "";

    const route = mediaType === "movie"
    ? (typeof getMovieDetailRoute === "function" ? getMovieDetailRoute(show && show.id,title) : "")
    : (typeof getShowDetailRoute === "function" ? getShowDetailRoute(show && show.id,title) : "");

    return `
        <a
        href="${escapeHTML(route)}"
        class="genre-result-card ${show && show._eyeFaded ? "eye-filter-faded" : ""}"
        data-media-type="${escapeHTML(mediaType)}"
        data-media-id="${escapeHTML(show && show.id)}"
        data-show-id="${mediaType === "tv" ? escapeHTML(show && show.id) : ""}"
        data-media-name="${escapeHTML(title)}"
        data-show-name="${escapeHTML(title)}" 
        data-poster-path="${escapeHTML(show && show.poster_path || "")}" 
        data-overview="${escapeHTML(show && show.overview || "")}" 
        data-first-air-date="${escapeHTML(show && (show.first_air_date || show.date) || "")}">
            <div class="genre-result-poster">${posterHTML}</div>
            <div class="genre-result-title">${escapeHTML(title)}</div>
            <div class="genre-result-meta">${escapeHTML(year)}${escapeHTML(ratingHTML)}</div>
        </a>
    `;
}

function renderPersonProgressCardHTML(){
    const progress = typeof getPersonProgressSummary === "function" ? getPersonProgressSummary() : {watched:0,total:0,percent:0};
    const watched = Number(progress && progress.watched || 0);
    const total = Number(progress && progress.total || 0);
    const percent = Math.max(0,Math.min(100,Number(progress && progress.percent || 0)));
    return `
        <div class="person-progress-card" aria-label="Watched progress">
            <div class="person-progress-content">
                <div class="person-progress-copy">
                    <span>You've watched</span>
                    <strong>${escapeHTML(String(watched))} of ${escapeHTML(String(total))}</strong>
                </div>
                <div class="person-progress-percent" aria-label="${escapeHTML(String(percent))} percent watched">
                    <strong>${escapeHTML(String(percent))}</strong><span>%</span>
                </div>
            </div>
            <div class="person-progress-track" aria-hidden="true">
                <div class="person-progress-fill" style="width:${escapeHTML(String(percent))}%"></div>
            </div>
        </div>
    `;
}

function renderPersonProfileHTML(person,role){
    const photo = person && person.profile_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(person.profile_path,"h632"))}" alt="${escapeHTML((person.name || "Person") + " photo")}">`
    : renderPersonSilhouettePlaceholderHTML("person-profile-placeholder");
    const biography = person && person.biography ? String(person.biography).trim() : "";
    const hasLongBio = biography.length > 260;

    return `
        <aside class="person-profile-panel" aria-label="Person details">
            <div class="person-profile-photo">${photo}</div>
            <div class="person-profile-bio-wrap ${hasLongBio ? "is-collapsed" : ""}">
                <p class="person-profile-bio-text">${escapeHTML(biography || "No biography available yet.")}</p>
                ${hasLongBio ? `<button type="button" class="person-bio-more-button">more</button>` : ""}
            </div>
            ${renderPersonProgressCardHTML()}
        </aside>
    `;
}

function renderPersonResultCard(item){
    const mediaType = item && item.media_type === "movie" ? "movie" : "tv";
    const posterHTML = item && item.poster_path
    ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(item.poster_path,"w500"))}" alt="${escapeHTML((item.title || "Title") + " poster")}">`
    : renderMediaPosterPlaceholderHTML(item,mediaType);
    const year = item && item.date ? String(item.date).slice(0,4) : "Unknown";
    const rating = Number(item && item.vote_average || 0);
    const ratingHTML = rating > 0 ? ` • ${rating.toFixed(1)}` : "";
    const roleMeta = item && item.person_role_label ? item.person_role_label : (item && item.character ? `Actor: ${item.character}` : (item && item.job ? item.job : ""));

    const route = mediaType === "movie"
    ? (typeof getMovieDetailRoute === "function" ? getMovieDetailRoute(item && item.id,item && item.title || "") : "")
    : (typeof getShowDetailRoute === "function" ? getShowDetailRoute(item && item.id,item && item.title || "") : "");

    return `
        <a
        href="${escapeHTML(route)}"
        class="genre-result-card person-result-card"
        data-eye-faded="${item && item._eyeFaded ? "true" : "false"}"
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
        </a>
    `;
}

function renderPersonDetailPage(state){
    const content = document.getElementById("person-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const role = typeof normalizePersonRoleSlug === "function" ? normalizePersonRoleSlug(pageState.role) : "";
    const media = typeof normalizePersonMediaType === "function" ? normalizePersonMediaType(pageState.media) : "tv";
    const person = pageState.person || null;
    const credits = Array.isArray(pageState.credits) ? pageState.credits : [];
    const visibleCredits = getEyeFilteredRenderItems(credits,media,pageState);
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const name = person && person.name ? person.name : "Person";
    const personRouteLabel = person && person.name ? person.name : (pageState.routeSlug || "");
    const availableRoles = person && typeof getPersonAvailableRoles === "function" ? getPersonAvailableRoles(person,media) : [];
    const tvRole = person && typeof personHasRole === "function" && !personHasRole(person,role,"tv") ? "" : role;
    const movieRole = person && typeof personHasRole === "function" && !personHasRole(person,role,"movie") ? "" : role;

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Person could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : visibleCredits.length
    ? `
        <div class="genre-tight-grid person-tight-grid">
            ${visibleCredits.map(renderPersonResultCard).join("")}
        </div>
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading person-tight-grid">
            ${renderTrackerPosterSkeletonCards(12)}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>${credits.length ? "No results found" : `No ${media === "movie" ? "movies" : "shows"} found`}</h2>
            <p>${credits.length ? "" : "Try switching the media filter."}</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner person-detail-page-inner">
            <div class="person-detail-layout">
                <main class="person-detail-main">
                    <div class="genre-detail-header person-detail-header">
                        <div class="person-detail-title-area">
                            <button type="button" class="show-page-back-button genre-page-back-button" id="person-page-back-button" aria-label="Back">
                                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                            </button>
                            <div>
                                <h1 class="genre-detail-title person-detail-title">${escapeHTML(name)}</h1>
                            </div>
                        </div>
                    </div>

                    <div class="genre-filter-bar person-filter-bar" aria-label="Person filters">
                        <div class="genre-media-switch person-media-switch" role="tablist" aria-label="Person media type">
                            <a href="${escapeHTML(typeof getPersonDetailRoute === "function" ? getPersonDetailRoute(tvRole,pageState.personId,personRouteLabel,"tv",pageState) : "")}" class="genre-media-switch-button ${media === "tv" ? "active" : ""}" data-person-media="tv" role="tab" aria-selected="${media === "tv" ? "true" : "false"}">TV Shows</a>
                            <a href="${escapeHTML(typeof getPersonDetailRoute === "function" ? getPersonDetailRoute(movieRole,pageState.personId,personRouteLabel,"movie",pageState) : "")}" class="genre-media-switch-button ${media === "movie" ? "active" : ""}" data-person-media="movie" role="tab" aria-selected="${media === "movie" ? "true" : "false"}">Movies</a>
                        </div>
                        <div class="browse-bar person-role-browse-bar">
                            <details class="browse-menu person-role-menu">
                                <summary class="browse-bar-button person-role-button">ROLE ${renderBrowseChevronIcon()}</summary>
                                <div class="browse-dropdown person-role-dropdown">
                                    <div class="browse-option-list">
                                        <button type="button" class="browse-dropdown-option ${!role ? "selected" : ""}" data-person-role-filter="">${renderBrowseOptionLabel("All Roles",!role)}</button>
                                        ${availableRoles.map(item=>{
                                            const selected = item.key === role;
                                            return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-person-role-filter="${escapeHTML(item.key)}">${renderBrowseOptionLabel(item.label,selected)}</button>`;
                                        }).join("")}
                                    </div>
                                </div>
                            </details>
                            ${renderEyeFilterControlHTML(pageState,"person-eye-filter-menu")}
                        </div>
                    </div>

                    <div class="genre-result-content person-result-content">
                        ${bodyHTML}
                    </div>
                </main>

                ${person ? renderPersonProfileHTML(person,role) : ""}
            </div>
        </div>
    `;
}


function renderBrowseMediaSwitchHTML(media){
    const cleanMedia = String(media || "tv") === "movie" ? "movie" : "tv";
    return `
        <div class="genre-media-switch browse-media-switch" role="tablist" aria-label="Media type">
            <button type="button" class="genre-media-switch-button ${cleanMedia === "tv" ? "active" : ""}" data-browse-media="tv" role="tab" aria-selected="${cleanMedia === "tv" ? "true" : "false"}">TV Shows</button>
            <button type="button" class="genre-media-switch-button ${cleanMedia === "movie" ? "active" : ""}" data-browse-media="movie" role="tab" aria-selected="${cleanMedia === "movie" ? "true" : "false"}">Movies</button>
        </div>
    `;
}

function getBrowseControlState(state,media="tv"){
    if(typeof createBrowseFilterState === "function"){
        return createBrowseFilterState(media,state || {});
    }
    return Object.assign({media,year:"",upcoming:false,genres:[],country:"",language:"",themes:[],companies:[],network:"",providers:[],statuses:[],certification:"",sort:"popularity-desc"},state || {});
}

function getBrowseControlLabels(labels){
    return typeof createBrowseLabelState === "function" ? createBrowseLabelState(labels) : (labels || {});
}

function renderBrowseChevronIcon(className="browse-chevron-down"){
    return `<svg class="browse-chevron ${escapeHTML(className)}" viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function renderBrowseDirectionalChevronIcon(direction="right"){
    const cleanDirection = direction === "left" ? "left" : "right";
    const path = cleanDirection === "left" ? "M6.5 1 1.5 6 6.5 11" : "M1.5 1 6.5 6 1.5 11";
    return `<svg class="browse-decade-nav-icon browse-decade-nav-icon-${cleanDirection}" viewBox="0 0 8 12" aria-hidden="true" focusable="false"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function renderBrowseCheckIcon(){
    return `<svg class="browse-selected-check" viewBox="0 0 12 10" aria-hidden="true" focusable="false"><path d="M1 5.2 4.2 8.3 11 1.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

function renderBrowseOptionLabel(label,selected=false){
    return `<span>${escapeHTML(label)}</span>${selected ? renderBrowseCheckIcon() : ""}`;
}


function getEyeFilterRenderState(inputState){
    if(typeof createEyeFilterState === "function"){
        return createEyeFilterState(inputState || {});
    }
    const source = inputState || {};
    return {
        fadeWatched:source.fadeWatched === true || String(source.fadeWatched || "") === "1",
        hideWatched:source.hideWatched === true || String(source.hideWatched || "") === "1",
        hidePlan:source.hidePlan === true || String(source.hidePlan || "") === "1",
        hideFavorites:source.hideFavorites === true || String(source.hideFavorites || "") === "1"
    };
}

function renderEyeFilterOption(label,key,selected){
    return `<button type="button" class="browse-dropdown-option eye-filter-option ${selected ? "selected" : ""}" data-eye-toggle="${escapeHTML(key)}">${renderBrowseOptionLabel(label,selected)}</button>`;
}

function renderEyeFilterControlHTML(inputState,extraClass=""){
    const state = getEyeFilterRenderState(inputState);
    const active = !!(state.fadeWatched || state.hideWatched || state.hidePlan || state.hideFavorites);
    const icon = active ? "/static/assets/icons/eye-closed.png" : "/static/assets/icons/eye-open.png";
    const forcedOpen = typeof shouldKeepEyeFilterMenuOpen === "function" && shouldKeepEyeFilterMenuOpen();
    return `
        <details class="browse-menu eye-filter-menu ${escapeHTML(extraClass)}" ${forcedOpen ? "open" : ""}>
            <summary class="browse-bar-button eye-filter-button" aria-label="Tracked filters" data-eye-filter-summary>
                <img src="${escapeHTML(icon)}" alt="" aria-hidden="true" class="eye-filter-icon">
            </summary>
            <div class="browse-dropdown eye-filter-dropdown">
                <div class="browse-option-list">
                    ${renderEyeFilterOption("Fade watched","fadeWatched",state.fadeWatched)}
                    ${renderEyeFilterOption("Hide watched","hideWatched",state.hideWatched)}
                    ${renderEyeFilterOption("Hide Plan to Watch","hidePlan",state.hidePlan)}
                    ${renderEyeFilterOption("Hide Favorites","hideFavorites",state.hideFavorites)}
                </div>
            </div>
        </details>
    `;
}

function getEyeFilteredRenderItems(items,media,state){
    if(typeof applyEyeFiltersToItems === "function"){
        return applyEyeFiltersToItems(items,media,state || {});
    }
    return Array.isArray(items) ? items : [];
}

function renderBrowseDecadeYearsHTML(decade,state){
    const currentYear = new Date().getFullYear();
    const currentDecade = Math.floor(currentYear / 10) * 10;
    const cleanDecade = Math.max(1870,Math.min(currentDecade,Number(decade || currentDecade)));
    const topYear = cleanDecade + 9;
    const years = [];
    for(let year=cleanDecade;year<=topYear;year+=1){
        const selected = String(state && state.year || "") === String(year);
        years.push(`<button type="button" class="browse-year-strip-year ${selected ? "selected" : ""}" data-browse-set-single="year" data-browse-value="${year}" aria-pressed="${selected ? "true" : "false"}">${renderBrowseOptionLabel(String(year),selected)}</button>`);
    }
    return years.join("");
}

function renderBrowseDecadeListHTML(state){
    const currentYear = new Date().getFullYear();
    const currentDecade = Math.floor(currentYear / 10) * 10;
    const selectedYear = Number(state && state.year || 0);
    const selectedDecadeValue = Number(state && state.decade || 0);
    const selectedDecade = selectedDecadeValue || (selectedYear ? Math.floor(selectedYear / 10) * 10 : 0);
    const rows = [];
    for(let decade=currentDecade;decade>=1870;decade-=10){
        const selected = selectedDecade === decade;
        rows.push(`
            <button type="button" class="browse-dropdown-option browse-decade-list-option ${selected ? "selected" : ""}" data-browse-year-open-decade="${decade}" aria-pressed="${selected ? "true" : "false"}">
                <span>${decade}s</span>
                <span class="browse-decade-list-icons">${selected ? renderBrowseCheckIcon() : ""}${renderBrowseDirectionalChevronIcon("right")}</span>
            </button>
        `);
    }
    return rows.join("");
}

function renderBrowseYearMenu(state){
    const anySelected = !state.year && !state.decade && !state.upcoming;
    return `
        <div class="browse-year-decade-menu" data-browse-year-decade-menu>
            <div class="browse-option-list">
                <button type="button" class="browse-dropdown-option ${anySelected ? "selected" : ""}" data-browse-set-single="year" data-browse-value="">${renderBrowseOptionLabel("Any",anySelected)}</button>
                <button type="button" class="browse-dropdown-option ${state.upcoming ? "selected" : ""}" data-browse-set-single="upcoming" data-browse-value="1">${renderBrowseOptionLabel("Upcoming",state.upcoming)}</button>
            </div>
            <div class="browse-dropdown-divider"></div>
            <div class="browse-option-list browse-year-decade-list">${renderBrowseDecadeListHTML(state)}</div>
        </div>
    `;
}

function renderBrowseYearSecondaryBarHTML(decade,state){
    const currentYear = new Date().getFullYear();
    const currentDecade = Math.floor(currentYear / 10) * 10;
    const visibleDecade = Math.max(1870,Math.min(currentDecade,Number(decade || currentDecade)));
    const atFirstDecade = visibleDecade <= 1870;
    const atCurrentDecade = visibleDecade >= currentDecade;
    return `
        <div class="browse-year-secondary-bar" data-browse-year-secondary-bar>
            <div class="browse-year-strip" data-browse-year-decade="${visibleDecade}" data-browse-current-decade="${currentDecade}" data-browse-min-decade="1870">
                <button type="button" class="browse-decade-nav browse-decade-nav-prev" data-browse-year-shift="-10" aria-label="Previous decade" ${atFirstDecade ? "disabled" : ""}>${renderBrowseDirectionalChevronIcon("left")}</button>
                <button type="button" class="browse-decade-current" data-browse-decade-current data-browse-year-show-decades aria-label="Back to decades">${visibleDecade}s</button>
                <div class="browse-year-strip-years" data-browse-decade-years>${renderBrowseDecadeYearsHTML(visibleDecade,state)}</div>
                <button type="button" class="browse-decade-nav browse-decade-nav-next" data-browse-year-shift="10" aria-label="Next decade" ${atCurrentDecade ? "disabled" : ""}>${renderBrowseDirectionalChevronIcon("right")}</button>
            </div>
        </div>
    `;
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

function renderBrowseGenreMenu(state){
    const genres = getBrowseGenreOptions(state.media);
    if(!genres.length){
        return `<div class="browse-dropdown-empty">Genres are loading…</div>`;
    }
    return `<div class="browse-option-list browse-option-list-genre">${genres.map(genre=>{
        const id = String(genre && genre.id || "");
        const name = String(genre && genre.name || "").trim();
        const selected = state.genres.includes(id);
        return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-toggle-multi="genres" data-browse-value="${escapeHTML(id)}" data-browse-label="${escapeHTML(name)}">${renderBrowseOptionLabel(name,selected)}</button>`;
    }).join("")}</div>`;
}

function renderBrowseCountryMenu(state){
    const options = typeof browseOptionState !== "undefined" && browseOptionState ? browseOptionState.countries : [];
    return `
        <input class="browse-dropdown-search" type="search" placeholder="Search countries" aria-label="Search countries" data-browse-list-search="country">
        <div class="browse-option-list" data-browse-list="country">
            <button type="button" class="browse-dropdown-option ${!state.country ? "selected" : ""}" data-browse-set-single="country" data-browse-value="" data-browse-option-label="any">${renderBrowseOptionLabel("Any",!state.country)}</button>
            ${(Array.isArray(options) ? options : []).map(item=>{
                const aliases = String(item.code || "").toLowerCase() === "gb" ? " uk great britain britain" : "";
                const searchTerms = `${item.name || ""} ${item.code || ""}${aliases}`.trim();
                const selected = state.country === item.code;
                return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-set-single="country" data-browse-value="${escapeHTML(item.code)}" data-browse-option-label="${escapeHTML(item.name)}" data-browse-option-search="${escapeHTML(searchTerms)}">${renderBrowseOptionLabel(item.name,selected)}</button>`;
            }).join("") || `<div class="browse-dropdown-empty">Countries are loading…</div>`}
        </div>
    `;
}

function renderBrowseLanguageMenu(state){
    const options = typeof browseOptionState !== "undefined" && browseOptionState ? browseOptionState.languages : [];
    return `
        <input class="browse-dropdown-search" type="search" placeholder="Search languages" aria-label="Search languages" data-browse-list-search="language">
        <div class="browse-option-list" data-browse-list="language">
            <button type="button" class="browse-dropdown-option ${!state.language ? "selected" : ""}" data-browse-set-single="language" data-browse-value="" data-browse-option-label="any">${renderBrowseOptionLabel("Any",!state.language)}</button>
            ${(Array.isArray(options) ? options : []).map(item=>{
                const searchTerms = `${item.name || ""} ${item.code || ""}`.trim();
                const selected = state.language === item.code;
                return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-set-single="language" data-browse-value="${escapeHTML(item.code)}" data-browse-option-label="${escapeHTML(item.name)}" data-browse-option-search="${escapeHTML(searchTerms)}">${renderBrowseOptionLabel(item.name,selected)}</button>`;
            }).join("") || `<div class="browse-dropdown-empty">Languages are loading…</div>`}
        </div>
    `;
}

function renderBrowseSelectedPickerValues(state,labels,group,heading){
    const values = Array.isArray(state && state[group]) ? state[group] : [];
    if(!values.length){ return ""; }
    const labelGroup = group === "themes" ? "themes" : "companies";
    const fallback = group === "themes" ? "Theme" : "Production Company";
    return `
        <div class="browse-selected-block">
            <div class="browse-option-list">
                ${values.map(value=>{
                    const label = typeof getBrowseLabel === "function" ? getBrowseLabel(labels,labelGroup,value,fallback) : fallback;
                    return `<button type="button" class="browse-dropdown-option browse-selected-option selected" data-browse-toggle-multi="${escapeHTML(group)}" data-browse-value="${escapeHTML(value)}" data-browse-label="${escapeHTML(label)}">${renderBrowseOptionLabel(label,true)}</button>`;
                }).join("")}
            </div>
        </div>
    `;
}

function renderBrowseContextSelectionHTML(){
    return "";
}

function getBrowseServiceOptions(media){
    const cleanMedia = String(media || "tv") === "movie" ? "movie" : "tv";
    const source = typeof browseOptionState !== "undefined" && browseOptionState && browseOptionState.providers
    ? browseOptionState.providers[cleanMedia]
    : [];
    return Array.isArray(source) ? source : [];
}

function renderBrowseServiceMenu(state,labels={}){
    const providers = getBrowseServiceOptions(state.media);
    return `
        <input class="browse-dropdown-search" type="search" placeholder="Search streaming services" aria-label="Search streaming services" data-browse-list-search="service">
        <div class="browse-option-list browse-service-option-list" data-browse-list="service">
            ${providers.map(provider=>{
                const id = String(provider && (provider.id || provider.provider_id) || "");
                const name = String(provider && (provider.name || provider.provider_name) || "").trim();
                if(!id || !name){ return ""; }
                const selected = Array.isArray(state.providers) && state.providers.includes(id);
                const logoPath = String(provider && provider.logo_path || "").trim();
                const logo = logoPath ? `<span class="browse-service-logo-tile"><img class="browse-service-logo" src="${escapeHTML(trackerImageURL(logoPath,"w92"))}" alt=""></span>` : `<span class="browse-service-logo-tile browse-service-logo-fallback" aria-hidden="true">TV</span>`;
                const label = typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"providers",id,name) : name;
                return `<button type="button" class="browse-dropdown-option browse-service-option ${selected ? "selected" : ""}" data-browse-toggle-multi="providers" data-browse-value="${escapeHTML(id)}" data-browse-label="${escapeHTML(label)}" data-browse-option-label="${escapeHTML(name)}" data-browse-option-search="${escapeHTML(name)}"><span class="browse-service-option-main">${logo}<span>${escapeHTML(name)}</span></span>${selected ? renderBrowseCheckIcon() : ""}</button>`;
            }).join("") || `<div class="browse-dropdown-empty">Streaming services are loading…</div>`}
        </div>
    `;
}

function renderBrowseRuntimeMenu(state){
    const media = state && state.media === "movie" ? "movie" : "tv";
    const api = typeof window !== "undefined" ? window.TVTrackerBrowse : null;
    const ranges = api && api.RUNTIME_RANGES ? api.RUNTIME_RANGES[media] : {};
    const options = Object.entries(ranges || {});
    return `<div class="browse-option-list browse-runtime-option-list">
        <button type="button" class="browse-dropdown-option ${!state.runtime ? "selected" : ""}" data-browse-set-single="runtime" data-browse-value="">${renderBrowseOptionLabel("Any",!state.runtime)}</button>
        ${options.map(([value,range])=>{
            const selected = state.runtime === value;
            return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-set-single="runtime" data-browse-value="${escapeHTML(value)}">${renderBrowseOptionLabel(range && range.label ? range.label : value,selected)}</button>`;
        }).join("")}
    </div>`;
}

function renderBrowseOtherMenu(state,labels={}){
    const statusOptions = [
        ["returning-series","Returning Series"],
        ["in-production","In Production"],
        ["ended","Ended"],
        ["canceled","Canceled"]
    ];
    const certifications = typeof browseOptionState !== "undefined" && browseOptionState ? browseOptionState.movieCertifications : [];
    return `
        ${renderBrowseContextSelectionHTML(state,labels)}
        <div class="browse-other-section">
            <span class="browse-other-heading">Theme</span>
            ${renderBrowseSelectedPickerValues(state,labels,"themes","Theme")}
            <input class="browse-dropdown-search" type="search" placeholder="Search themes" aria-label="Search themes" data-browse-picker-search="theme">
            <div class="browse-picker-results" id="browse-theme-picker-results"><div class="browse-picker-empty">Type at least 2 characters.</div></div>
        </div>
        <div class="browse-dropdown-divider"></div>
        <div class="browse-other-section">
            <span class="browse-other-heading">Production Company</span>
            ${renderBrowseSelectedPickerValues(state,labels,"companies","Production Company")}
            <input class="browse-dropdown-search" type="search" placeholder="Search production companies" aria-label="Search production companies" data-browse-picker-search="company">
            <div class="browse-picker-results" id="browse-company-picker-results"><div class="browse-picker-empty">Type at least 2 characters.</div></div>
        </div>
        ${state.media === "tv" ? `
            <div class="browse-dropdown-divider"></div>
            <div class="browse-other-section">
                <span class="browse-other-heading">Network</span>
                ${state.network ? (()=>{
                    const label = typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"networks",state.network,"Network") : "Network";
                    return `<div class="browse-selected-block"><div class="browse-option-list"><button type="button" class="browse-dropdown-option browse-selected-option selected" data-browse-set-single="network" data-browse-value="" data-browse-label="${escapeHTML(label)}">${renderBrowseOptionLabel(label,true)}</button></div></div>`;
                })() : ""}
                <input class="browse-dropdown-search" type="search" placeholder="Search networks" aria-label="Search networks" data-browse-picker-search="network">
                <div class="browse-picker-results" id="browse-network-picker-results"><div class="browse-picker-empty">Type at least 2 characters.</div></div>
            </div>
            <div class="browse-dropdown-divider"></div>
            <div class="browse-other-section">
                <span class="browse-other-heading">Status</span>
                <div class="browse-option-list">${statusOptions.map(([value,label])=>{
                    const selected = state.statuses.includes(value);
                    return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-toggle-multi="statuses" data-browse-value="${escapeHTML(value)}">${renderBrowseOptionLabel(label,selected)}</button>`;
                }).join("")}</div>
            </div>
        ` : `
            <div class="browse-dropdown-divider"></div>
            <div class="browse-other-section">
                <span class="browse-other-heading">US Certification</span>
                <div class="browse-option-list">
                    <button type="button" class="browse-dropdown-option ${!state.certification ? "selected" : ""}" data-browse-set-single="certification" data-browse-value="">${renderBrowseOptionLabel("Any",!state.certification)}</button>
                    ${(Array.isArray(certifications) ? certifications : []).map(value=>{
                        const slug = String(value || "").trim().toLowerCase();
                        const selected = state.certification === slug;
                        return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-set-single="certification" data-browse-value="${escapeHTML(slug)}">${renderBrowseOptionLabel(value,selected)}</button>`;
                    }).join("") || `<div class="browse-dropdown-empty">Certifications are loading…</div>`}
                </div>
            </div>
        `}
    `;
}

function renderBrowseSortMenu(state){
    const dateName = state.media === "movie" ? "Release Date" : "First Air Date";
    const options = [
        ["popularity-desc","Popularity — High to Low"],
        ["popularity-asc","Popularity — Low to High"],
        ["rating-desc","Rating — High to Low"],
        ["rating-asc","Rating — Low to High"],
        ["date-desc",`${dateName} — Newest`],
        ["date-asc",`${dateName} — Oldest`]
    ];
    return `<div class="browse-option-list">${options.map(([value,label])=>{
        const selected = state.sort === value;
        return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-browse-set-sort="${escapeHTML(value)}">${renderBrowseOptionLabel(label,selected)}</button>`;
    }).join("")}</div>`;
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

function renderBrowseActiveChipsHTML(state,labels){
    const chips = [];
    const push = (key,value,label)=>{
        if(!label){ return; }
        chips.push(`<button type="button" class="browse-active-chip" data-browse-remove="${escapeHTML(key)}" data-browse-value="${escapeHTML(value || "")}">${escapeHTML(label)} <span aria-hidden="true">×</span></button>`);
    };
    if(state.upcoming){ push("upcoming","1","Upcoming"); }
    if(state.year){ push("year",state.year,state.year); }
    if(!state.year && state.decade){ push("decade",state.decade,`${state.decade}s`); }
    state.genres.forEach(id=>{
        const option = getBrowseGenreOptions(state.media).find(genre=>String(genre && genre.id || "") === String(id));
        const fallback = option && option.name ? String(option.name) : "Genre";
        push("genres",id,typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"genres",id,fallback) : fallback);
    });
    if(state.country){ push("country",state.country,typeof getDiscoveryCountryName === "function" ? getDiscoveryCountryName(state.country) : state.country.toUpperCase()); }
    if(state.language){ push("language",state.language,typeof getLanguageName === "function" ? getLanguageName(state.language) : state.language.toUpperCase()); }
    state.themes.forEach(id=>push("themes",id,typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"themes",id,"Theme") : "Theme"));
    state.companies.forEach(id=>push("companies",id,typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"companies",id,"Production Company") : "Production Company"));
    if(state.network){ push("network",state.network,typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"networks",state.network,"Network") : "Network"); }
    state.providers.forEach(id=>push("providers",id,typeof getBrowseLabel === "function" ? getBrowseLabel(labels,"providers",id,"Streaming Service") : "Streaming Service"));
    if(state.runtime){
        const api = typeof window !== "undefined" ? window.TVTrackerBrowse : null;
        const ranges = api && api.RUNTIME_RANGES ? api.RUNTIME_RANGES[state.media] : null;
        const runtimeLabel = ranges && ranges[state.runtime] && ranges[state.runtime].label ? ranges[state.runtime].label : state.runtime;
        push("runtime",state.runtime,runtimeLabel);
    }
    state.statuses.forEach(value=>push("statuses",value,typeof getStatusRouteLabel === "function" ? getStatusRouteLabel(value) : value));
    if(state.certification){ push("certification",state.certification,`US ${state.certification.toUpperCase()}`); }
    const showClear = chips.length > 0 || state.sort !== "popularity-desc";
    if(!chips.length && !showClear){ return ""; }
    return `<div class="browse-active-row" aria-label="Active browse filters">${chips.join("")}${showClear ? `<button type="button" class="browse-clear-button" data-browse-clear>CLEAR ALL</button>` : ""}</div>`;
}

function renderBrowseControlsHTML(inputState,inputLabels={},options={}){
    const state = getBrowseControlState(inputState,inputState && inputState.media || "tv");
    const labels = getBrowseControlLabels(inputLabels);
    const hideSort = options && options.hideSort === true;
    return `
        <div class="browse-controls">
            <div class="browse-bar" aria-label="Browse filters">
                <span class="browse-bar-kicker">BROWSE BY</span>
                <details class="browse-menu browse-menu-year">
                    <summary class="browse-bar-button">${escapeHTML(getBrowseYearControlLabel(state))} ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-year">${renderBrowseYearMenu(state)}</div>
                </details>
                <details class="browse-menu">
                    <summary class="browse-bar-button">GENRE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderBrowseGenreMenu(state)}</div>
                </details>
                <details class="browse-menu">
                    <summary class="browse-bar-button">COUNTRY ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderBrowseCountryMenu(state)}</div>
                </details>
                <details class="browse-menu">
                    <summary class="browse-bar-button">LANGUAGE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderBrowseLanguageMenu(state)}</div>
                </details>
                <details class="browse-menu browse-menu-service">
                    <summary class="browse-bar-button">SERVICE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-service">${renderBrowseServiceMenu(state,labels)}</div>
                </details>
                <details class="browse-menu browse-menu-runtime">
                    <summary class="browse-bar-button">RUNTIME ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-runtime">${renderBrowseRuntimeMenu(state)}</div>
                </details>
                <details class="browse-menu browse-menu-other">
                    <summary class="browse-bar-button">OTHER ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-other">${renderBrowseOtherMenu(state,labels)}</div>
                </details>
                ${hideSort ? "" : `
                    <details class="browse-menu browse-menu-sort">
                        <summary class="browse-bar-button">SORT ${renderBrowseChevronIcon()}</summary>
                        <div class="browse-dropdown browse-dropdown-sort">${renderBrowseSortMenu(state)}</div>
                    </details>
                `}
                ${renderEyeFilterControlHTML(state,"browse-eye-filter-menu")}
            </div>
            ${getBrowseSelectedDecade(state) ? renderBrowseYearSecondaryBarHTML(getBrowseSelectedDecade(state),state) : ""}
            ${renderBrowseActiveChipsHTML(state,labels)}
        </div>
    `;
}

function renderBrowseDetailPage(state){
    const content = document.getElementById("genre-detail-content");
    if(!content){ return; }
    const pageState = state || {};
    const filters = getBrowseControlState(pageState.filters,pageState.media || "tv");
    const labels = getBrowseControlLabels(pageState.labels);
    const media = filters.media;
    const mediaWord = media === "movie" ? "movies" : "shows";
    const shows = Array.isArray(pageState.shows) ? pageState.shows : [];
    const visibleShows = getEyeFilteredRenderItems(shows,media,filters);
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const page = Number(pageState.page || 1);
    const totalPages = Number(pageState.totalPages || 1);
    const canLoadMore = !loading && page < totalPages;
    const bodyHTML = error
    ? `<div class="empty-state genre-detail-empty"><h2>Browse could not load</h2><p>${escapeHTML(error)}</p></div>`
    : visibleShows.length
    ? `<div class="genre-tight-grid">${visibleShows.map(show=>renderGenrePosterGridCard(show).replace('class="genre-result-card','class="genre-result-card browse-result-card')).join("")}</div>${canLoadMore ? `<button type="button" class="view-more-button genre-load-more-button" id="browse-load-more-button">VIEW MORE</button>` : ""}${loading ? `<div class="v2-api-empty genre-loading-note">Loading more ${mediaWord}…</div>` : ""}`
    : loading
    ? `<div class="genre-tight-grid genre-tight-grid-loading">${renderTrackerPosterSkeletonCards(12)}</div>`
    : `<div class="empty-state genre-detail-empty"><h2>${shows.length ? "No results found" : `No ${mediaWord} found`}</h2><p>Remove or change one or more filters.</p></div>`;

    content.innerHTML = `
        <div class="genre-detail-page-inner browse-detail-page-inner">
            <div class="genre-detail-header browse-detail-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="browse-page-back-button" aria-label="Back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button>
                <div>
                    <h1 class="genre-detail-title">Browse ${media === "movie" ? "Movies" : "TV Shows"}</h1>
                    ${renderBrowseMediaSwitchHTML(media)}
                </div>
            </div>
            ${renderBrowseControlsHTML(filters,labels)}
            <div class="genre-result-content">${bodyHTML}</div>
        </div>
    `;
}

function renderGenreDetailPage(state){
    const content = document.getElementById("genre-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const media = typeof normalizeGenreMediaType === "function" ? normalizeGenreMediaType(pageState.media || "tv") : (pageState.media === "movie" ? "movie" : "tv");
    const name = pageState.name || (pageState.slug && typeof getGenreDisplayNameFromSlug === "function" ? getGenreDisplayNameFromSlug(pageState.slug) : "Genre");
    const shows = Array.isArray(pageState.shows) ? pageState.shows : [];
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const year = String(pageState.year || "").trim();
    const sort = String(pageState.sort || "popularity.desc");
    const page = Number(pageState.page || 1);
    const totalPages = Number(pageState.totalPages || 1);
    const canLoadMore = !loading && page < totalPages;
    const mediaWord = media === "movie" ? "movies" : "shows";
    const browseState = typeof getGenreBrowseState === "function" ? getGenreBrowseState() : getBrowseControlState({year,sort},media);
    const visibleGenreShows = getEyeFilteredRenderItems(shows,media,browseState);
    const browseLabels = typeof genrePageState !== "undefined" && genrePageState ? getBrowseControlLabels(genrePageState.browseLabels) : getBrowseControlLabels({});
    const genreSwitchHTML = renderBrowseMediaSwitchHTML(media);

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Genre could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : visibleGenreShows.length
    ? `
        <div class="genre-tight-grid">
            ${visibleGenreShows.map(renderGenrePosterGridCard).join("")}
        </div>
        ${canLoadMore ? `<button type="button" class="view-more-button genre-load-more-button" id="genre-load-more-button">VIEW MORE</button>` : ""}
        ${loading ? `<div class="v2-api-empty genre-loading-note">Loading more ${mediaWord}…</div>` : ""}
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading">
            ${renderTrackerPosterSkeletonCards(12)}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>${shows.length ? "No results found" : `No ${mediaWord} found`}</h2>
            <p>Remove or change one or more filters.</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner">
            <div class="genre-detail-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="genre-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div>
                    <h1 class="genre-detail-title">${escapeHTML(name)}</h1>
                    ${genreSwitchHTML}
                </div>
            </div>

            ${renderBrowseControlsHTML(browseState,browseLabels)}

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
    const type = typeof normalizeDiscoveryFilterType === "function" ? normalizeDiscoveryFilterType(pageState.type) : String(pageState.type || "");
    const media = typeof getDiscoveryPageMediaFromState === "function" ? getDiscoveryPageMediaFromState() : (pageState.media === "movie" ? "movie" : "tv");
    const mediaWord = media === "movie" ? "movies" : "shows";
    const title = String(pageState.name || (media === "movie" ? "Movies" : "Shows")).trim() || (media === "movie" ? "Movies" : "Shows");
    const shows = Array.isArray(pageState.shows) ? pageState.shows : [];
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const page = Number(pageState.page || 1);
    const totalPages = Number(pageState.totalPages || 1);
    const canLoadMore = !loading && page < totalPages;
    const isDiscoverCategory = type === "discover-category";
    const isBrowseCompatible = !(type === "certification" && media === "tv");
    const showBrowseMediaSwitch = isBrowseCompatible && !isDiscoverCategory;
    const categoryConfig = isDiscoverCategory && typeof getDiscoverCategoryConfig === "function" ? getDiscoverCategoryConfig(pageState.value) : null;
    const hideBrowseSort = !!(categoryConfig && (categoryConfig.category === "popular" || categoryConfig.category === "top-rated"));
    const browseState = typeof getDiscoveryBrowseState === "function"
    ? getDiscoveryBrowseState()
    : getBrowseControlState({},media);
    const browseLabels = typeof discoveryPageState !== "undefined" && discoveryPageState
    ? getBrowseControlLabels(discoveryPageState.browseLabels)
    : getBrowseControlLabels({});
    const visibleDiscoveryShows = getEyeFilteredRenderItems(shows,media,browseState);

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Page could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : visibleDiscoveryShows.length
    ? `
        <div class="genre-tight-grid">
            ${visibleDiscoveryShows.map(show=>renderGenrePosterGridCard(show).replace('class="genre-result-card','class="genre-result-card discovery-filter-result-card')).join("")}
        </div>
        ${canLoadMore ? `<button type="button" class="view-more-button genre-load-more-button" id="discovery-filter-load-more-button">VIEW MORE</button>` : ""}
        ${loading ? `<div class="v2-api-empty genre-loading-note">Loading more ${mediaWord}…</div>` : ""}
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading">
            ${renderTrackerPosterSkeletonCards(12)}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>${shows.length ? "No results found" : `No ${mediaWord} found`}</h2>
            <p>${isDiscoverCategory ? "No titles are available for this category right now." : "Remove or change one or more filters."}</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner discovery-filter-page-inner">
            <div class="genre-detail-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="discovery-filter-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div>
                    <h1 class="genre-detail-title">${escapeHTML(title)}</h1>
                    ${showBrowseMediaSwitch ? renderBrowseMediaSwitchHTML(media) : ""}
                </div>
            </div>

            ${isBrowseCompatible ? renderBrowseControlsHTML(browseState,browseLabels,{hideSort:hideBrowseSort}) : ""}

            <div class="genre-result-content">
                ${bodyHTML}
            </div>
        </div>
    `;
}

const COLLECTION_INDEX_SORT_OPTIONS = Object.freeze([
    {value:"name.asc",label:"Collection Name"},
    {value:"size.desc",label:"Collection Size"},
    {value:"date.desc",label:"Newest First"},
    {value:"date.asc",label:"Oldest First"},
    {value:"rating.desc",label:"Highest Rated"},
    {value:"rating.asc",label:"Lowest Rated"},
    {value:"popularity.desc",label:"Most Popular"},
    {value:"popularity.asc",label:"Least Popular"}
]);

function getCollectionIndexSortLabel(sort){
    const clean = String(sort || "popularity.desc").trim().toLowerCase();
    const match = COLLECTION_INDEX_SORT_OPTIONS.find(item=>item.value === clean);
    return match ? match.label : "Most Popular";
}

function renderCollectionIndexGenreMenu(state){
    const genres = Array.isArray(state && state.availableGenres) ? state.availableGenres : [];
    if(!genres.length){
        return `<div class="browse-dropdown-empty">Genres are loading…</div>`;
    }
    const selectedGenre = String(state && state.genre || "");
    return `
        <div class="browse-option-list browse-option-list-genre">
            <button type="button" class="browse-dropdown-option ${!selectedGenre ? "selected" : ""}" data-collection-filter="genre" data-collection-value="">${renderBrowseOptionLabel("Any",!selectedGenre)}</button>
            ${genres.map(genre=>{
                const id = String(genre && genre.id || "");
                const name = String(genre && genre.name || "").trim() || "Genre " + id;
                const selected = selectedGenre === id;
                return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-collection-filter="genre" data-collection-value="${escapeHTML(id)}">${renderBrowseOptionLabel(name,selected)}</button>`;
            }).join("")}
        </div>
    `;
}

function renderCollectionIndexDecadeMenu(state){
    const decades = Array.isArray(state && state.availableDecades) ? state.availableDecades : [];
    if(!decades.length){
        return `<div class="browse-dropdown-empty">Decades are loading…</div>`;
    }
    const selectedDecade = String(state && state.decade || "");
    return `
        <div class="browse-option-list">
            <button type="button" class="browse-dropdown-option ${!selectedDecade ? "selected" : ""}" data-collection-filter="decade" data-collection-value="">${renderBrowseOptionLabel("Any",!selectedDecade)}</button>
            ${decades.map(decade=>{
                const value = String(decade || "");
                const selected = selectedDecade === value;
                return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-collection-filter="decade" data-collection-value="${escapeHTML(value)}">${renderBrowseOptionLabel(value + "s",selected)}</button>`;
            }).join("")}
        </div>
    `;
}

function renderCollectionIndexSortMenu(state){
    const selectedSort = String(state && state.sort || "popularity.desc");
    return `
        <div class="browse-option-list">
            ${COLLECTION_INDEX_SORT_OPTIONS.map(item=>{
                const selected = selectedSort === item.value;
                return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-collection-filter="sort" data-collection-value="${escapeHTML(item.value)}">${renderBrowseOptionLabel(item.label,selected)}</button>`;
            }).join("")}
        </div>
    `;
}

function getCollectionIndexGenreLabel(state,genreId){
    const id = String(genreId || "");
    const genres = Array.isArray(state && state.availableGenres) ? state.availableGenres : [];
    const match = genres.find(genre=>String(genre && genre.id || "") === id);
    return match ? String(match.name || "").trim() : "Genre " + id;
}

function renderCollectionIndexActiveChipsHTML(state){
    const chips = [];
    const genre = String(state && state.genre || "");
    const decade = String(state && state.decade || "");
    if(genre){
        chips.push(`<button type="button" class="browse-active-chip" data-collection-clear="genre">Genre: ${escapeHTML(getCollectionIndexGenreLabel(state,genre))}<span aria-hidden="true">×</span></button>`);
    }
    if(decade){
        chips.push(`<button type="button" class="browse-active-chip" data-collection-clear="decade">Decade: ${escapeHTML(decade)}s<span aria-hidden="true">×</span></button>`);
    }
    if(String(state && state.sort || "popularity.desc") !== "popularity.desc"){
        chips.push(`<button type="button" class="browse-active-chip" data-collection-filter="sort" data-collection-value="popularity.desc">Sort: ${escapeHTML(getCollectionIndexSortLabel(state.sort))}<span aria-hidden="true">×</span></button>`);
    }
    return chips.length ? `<div class="browse-active-row collections-active-row" aria-label="Active collection filters">${chips.join("")}<button type="button" class="browse-clear-button" data-collection-clear="all">CLEAR ALL</button></div>` : "";
}

function renderCollectionIndexControlsHTML(state){
    return `
        <div class="browse-controls collections-controls">
            <div class="browse-bar collections-browse-bar" aria-label="Collection filters">
                <span class="browse-bar-kicker">BROWSE BY</span>
                <details class="browse-menu">
                    <summary class="browse-bar-button">DECADE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderCollectionIndexDecadeMenu(state)}</div>
                </details>
                <details class="browse-menu">
                    <summary class="browse-bar-button">GENRE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderCollectionIndexGenreMenu(state)}</div>
                </details>
                <details class="browse-menu browse-menu-sort">
                    <summary class="browse-bar-button">SORT ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-sort">${renderCollectionIndexSortMenu(state)}</div>
                </details>
            </div>
            ${renderCollectionIndexActiveChipsHTML(state)}
        </div>
    `;
}

function renderCollectionsViewMoreHTML(state){
    const visibleCount = Array.isArray(state && state.visibleCollections) ? state.visibleCollections.length : 0;
    const totalResults = Number(state && state.totalResults || visibleCount || 0);
    if(!totalResults || visibleCount >= totalResults){
        return "";
    }
    return `
        <div class="collections-view-more-row">
            <button type="button" class="view-more-button collections-view-more-button" data-collection-view-more>VIEW MORE</button>
        </div>
    `;
}

function renderCollectionsIndexPage(state){
    const content = document.getElementById("genre-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const hasPagedCollections = Array.isArray(pageState.visibleCollections) && (pageState.loaded === true || Number(pageState.totalResults || 0) >= 0);
    const renderCollections = hasPagedCollections ? pageState.visibleCollections : pageState.collections;
    const collections = Array.isArray(renderCollections) ? renderCollections.filter(collection=>typeof isPromotableCollection === "function" ? isPromotableCollection(collection) : collection && collection.id && collection.name) : [];
    const loading = pageState.loading === true;
    const building = pageState.building === true;
    const error = String(pageState.error || "").trim();
    const hasFilters = !!(pageState.genre || pageState.decade || String(pageState.sort || "popularity.desc") !== "popularity.desc");

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Collections could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : collections.length
    ? `<div class="collection-grid">${collections.map(collection=>renderCollectionCard(collection,"collection-index-card")).join("")}</div>${renderCollectionsViewMoreHTML(pageState)}`
    : loading || building
    ? `
        <div class="collection-grid collection-grid-loading">${Array.from({length:12}).map(()=>renderCollectionSkeletonCardHTML()).join("")}</div>
        <div class="v2-api-empty genre-loading-note">Collections are loading. Please refresh in a moment.</div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>No collections found</h2>
            <p>${hasFilters ? "Remove or change one or more filters." : "Try again later."}</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner collections-page-inner">
            <div class="genre-detail-header collections-page-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="collections-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div>
                    <h1 class="genre-detail-title">Collections</h1>
                </div>
            </div>
            ${renderCollectionIndexControlsHTML(pageState)}
            <div class="genre-result-content">
                ${bodyHTML}
            </div>
        </div>
    `;
}

function renderCollectionSkeletonCardHTML(){
    return `
        <div class="collection-card collection-skeleton-card" aria-hidden="true">
            <div class="collection-poster-stack">
                <div class="collection-stack-poster collection-stack-poster-1"></div>
                <div class="collection-stack-poster collection-stack-poster-2"></div>
                <div class="collection-stack-poster collection-stack-poster-3"></div>
            </div>
            <div class="tt-skeleton-line tt-skeleton-line-title"></div>
            <div class="tt-skeleton-line tt-skeleton-line-meta"></div>
        </div>
    `;
}

const COLLECTION_DETAIL_SORT_OPTIONS = Object.freeze([
    {value:"collection-order",label:"Collection Order"},
    {value:"date-desc",label:"Release Date — Newest"},
    {value:"date-asc",label:"Release Date — Oldest"},
    {value:"popularity-desc",label:"Popularity — High to Low"},
    {value:"popularity-asc",label:"Popularity — Low to High"},
    {value:"rating-desc",label:"Rating — High to Low"},
    {value:"rating-asc",label:"Rating — Low to High"},
    {value:"title-asc",label:"Title — A to Z"},
    {value:"title-desc",label:"Title — Z to A"}
]);

function getCollectionDetailFilterStateForRender(state){
    if(typeof createCollectionDetailFilterState === "function"){
        return createCollectionDetailFilterState(state && state.filters || {});
    }
    return getBrowseControlState(Object.assign({sort:"collection-order"},state && state.filters || {}),"movie");
}

function getCollectionDetailSortLabel(sort){
    const clean = String(sort || "collection-order").trim().toLowerCase();
    const match = COLLECTION_DETAIL_SORT_OPTIONS.find(item=>item.value === clean);
    return match ? match.label : "Collection Order";
}

function renderCollectionDetailYearMenu(state){
    const anySelected = !state.year && !state.decade;
    return `
        <div class="browse-year-decade-menu" data-collection-detail-year-menu>
            <div class="browse-option-list">
                <button type="button" class="browse-dropdown-option ${anySelected ? "selected" : ""}" data-collection-detail-set="year" data-collection-detail-value="">${renderBrowseOptionLabel("Any",anySelected)}</button>
            </div>
            <div class="browse-dropdown-divider"></div>
            <div class="browse-option-list browse-year-decade-list">${renderCollectionDetailDecadeListHTML(state)}</div>
        </div>
    `;
}

function renderCollectionDetailDecadeListHTML(state){
    const currentYear = new Date().getFullYear();
    const currentDecade = Math.floor(currentYear / 10) * 10;
    const selectedYear = Number(state && state.year || 0);
    const selectedDecadeValue = Number(state && state.decade || 0);
    const selectedDecade = selectedDecadeValue || (selectedYear ? Math.floor(selectedYear / 10) * 10 : 0);
    const rows = [];
    for(let decade=currentDecade;decade>=1870;decade-=10){
        const selected = selectedDecade === decade;
        rows.push(`
            <button type="button" class="browse-dropdown-option browse-decade-list-option ${selected ? "selected" : ""}" data-collection-detail-set="decade" data-collection-detail-value="${decade}" aria-pressed="${selected ? "true" : "false"}">
                <span>${decade}s</span>
                <span class="browse-decade-list-icons">${selected ? renderBrowseCheckIcon() : ""}${renderBrowseDirectionalChevronIcon("right")}</span>
            </button>
        `);
    }
    return rows.join("");
}

function renderCollectionDetailYearSecondaryBarHTML(decade,state){
    const currentYear = new Date().getFullYear();
    const currentDecade = Math.floor(currentYear / 10) * 10;
    const visibleDecade = Math.max(1870,Math.min(currentDecade,Number(decade || currentDecade)));
    const selectedYear = String(state && state.year || "");
    const years = [];
    for(let year=visibleDecade;year<=visibleDecade + 9;year+=1){
        const selected = selectedYear === String(year);
        years.push(`<button type="button" class="browse-year-strip-year ${selected ? "selected" : ""}" data-collection-detail-set="year" data-collection-detail-value="${year}" aria-pressed="${selected ? "true" : "false"}">${renderBrowseOptionLabel(String(year),selected)}</button>`);
    }
    return `
        <div class="browse-year-secondary-bar" data-collection-detail-year-secondary-bar>
            <div class="browse-year-strip" data-collection-detail-visible-decade="${visibleDecade}">
                <button type="button" class="browse-decade-nav browse-decade-nav-prev" data-collection-detail-set="decade" data-collection-detail-value="${Math.max(1870,visibleDecade - 10)}" aria-label="Previous decade" ${visibleDecade <= 1870 ? "disabled" : ""}>${renderBrowseDirectionalChevronIcon("left")}</button>
                <button type="button" class="browse-decade-current" data-collection-detail-set="decade" data-collection-detail-value="${visibleDecade}" aria-label="Current decade">${visibleDecade}s</button>
                <div class="browse-year-strip-years">${years.join("")}</div>
                <button type="button" class="browse-decade-nav browse-decade-nav-next" data-collection-detail-set="decade" data-collection-detail-value="${Math.min(currentDecade,visibleDecade + 10)}" aria-label="Next decade" ${visibleDecade >= currentDecade ? "disabled" : ""}>${renderBrowseDirectionalChevronIcon("right")}</button>
            </div>
        </div>
    `;
}

function getCollectionDetailGenreLabel(state,genreId){
    const id = String(genreId || "");
    const genres = Array.isArray(state && state.availableGenres) ? state.availableGenres : [];
    const match = genres.find(genre=>String(genre && genre.id || "") === id);
    return match ? String(match.name || "").trim() : (typeof getCollectionGenreLabel === "function" ? getCollectionGenreLabel(id) : "Genre " + id);
}

function renderCollectionDetailGenreMenu(pageState,filters){
    const genres = Array.isArray(pageState && pageState.availableGenres) ? pageState.availableGenres : [];
    if(!genres.length){
        return `<div class="browse-dropdown-empty">Genres are loading…</div>`;
    }
    return `<div class="browse-option-list browse-option-list-genre">${genres.map(genre=>{
        const id = String(genre && genre.id || "");
        const name = String(genre && genre.name || "").trim() || "Genre " + id;
        const selected = filters.genres.includes(id);
        return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-collection-detail-set="genre" data-collection-detail-value="${escapeHTML(id)}">${renderBrowseOptionLabel(name,selected)}</button>`;
    }).join("")}</div>`;
}

function renderCollectionDetailLanguageMenu(pageState,filters){
    const languages = Array.isArray(pageState && pageState.availableLanguages) ? pageState.availableLanguages : [];
    if(!languages.length){
        return `<div class="browse-dropdown-empty">Languages are loading…</div>`;
    }
    return `
        <div class="browse-option-list">
            <button type="button" class="browse-dropdown-option ${!filters.language ? "selected" : ""}" data-collection-detail-set="language" data-collection-detail-value="">${renderBrowseOptionLabel("Any",!filters.language)}</button>
            ${languages.map(language=>{
                const code = String(language && language.code || "");
                const name = String(language && language.name || "").trim() || code.toUpperCase();
                const selected = filters.language === code;
                return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-collection-detail-set="language" data-collection-detail-value="${escapeHTML(code)}">${renderBrowseOptionLabel(name,selected)}</button>`;
            }).join("")}
        </div>
    `;
}

function renderCollectionDetailSortMenu(filters){
    return `<div class="browse-option-list">${COLLECTION_DETAIL_SORT_OPTIONS.map(item=>{
        const selected = filters.sort === item.value;
        return `<button type="button" class="browse-dropdown-option ${selected ? "selected" : ""}" data-collection-detail-set="sort" data-collection-detail-value="${escapeHTML(item.value)}">${renderBrowseOptionLabel(item.label,selected)}</button>`;
    }).join("")}</div>`;
}

function renderCollectionDetailActiveChipsHTML(pageState,filters){
    const chips = [];
    const push = (key,value,label)=>{
        if(label){ chips.push(`<button type="button" class="browse-active-chip" data-collection-detail-remove="${escapeHTML(key)}" data-collection-detail-value="${escapeHTML(value || "")}">${escapeHTML(label)} <span aria-hidden="true">×</span></button>`); }
    };
    if(filters.year){ push("year",filters.year,filters.year); }
    if(!filters.year && filters.decade){ push("decade",filters.decade,`${filters.decade}s`); }
    filters.genres.forEach(id=>push("genres",id,getCollectionDetailGenreLabel(pageState,id)));
    if(filters.language){ push("language",filters.language,typeof getLanguageName === "function" ? getLanguageName(filters.language) : filters.language.toUpperCase()); }
    if(filters.sort !== "collection-order"){ push("sort",filters.sort,getCollectionDetailSortLabel(filters.sort)); }
    const eyeActive = !!(filters.fadeWatched || filters.hideWatched || filters.hidePlan || filters.hideFavorites);
    if(!chips.length && !eyeActive){ return ""; }
    return `<div class="browse-active-row collection-detail-active-row" aria-label="Active collection movie filters">${chips.join("")}<button type="button" class="browse-clear-button" data-collection-detail-clear>CLEAR ALL</button></div>`;
}

function renderCollectionDetailControlsHTML(pageState){
    const filters = getCollectionDetailFilterStateForRender(pageState);
    return `
        <div class="browse-controls collection-detail-controls">
            <div class="browse-bar" aria-label="Collection movie filters">
                <span class="browse-bar-kicker">BROWSE BY</span>
                <details class="browse-menu browse-menu-year">
                    <summary class="browse-bar-button">${escapeHTML(getBrowseYearControlLabel(filters))} ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-year">${renderCollectionDetailYearMenu(filters)}</div>
                </details>
                <details class="browse-menu">
                    <summary class="browse-bar-button">GENRE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderCollectionDetailGenreMenu(pageState,filters)}</div>
                </details>
                <details class="browse-menu">
                    <summary class="browse-bar-button">LANGUAGE ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown">${renderCollectionDetailLanguageMenu(pageState,filters)}</div>
                </details>
                <details class="browse-menu browse-menu-sort">
                    <summary class="browse-bar-button">SORT ${renderBrowseChevronIcon()}</summary>
                    <div class="browse-dropdown browse-dropdown-sort">${renderCollectionDetailSortMenu(filters)}</div>
                </details>
                ${renderEyeFilterControlHTML(filters,"collection-detail-eye-filter-menu")}
            </div>
            ${getBrowseSelectedDecade(filters) ? renderCollectionDetailYearSecondaryBarHTML(getBrowseSelectedDecade(filters),filters) : ""}
            ${renderCollectionDetailActiveChipsHTML(pageState,filters)}
        </div>
    `;
}

function renderCollectionDetailPage(state){
    const content = document.getElementById("genre-detail-content");
    if(!content){
        return;
    }

    const pageState = state || {};
    const collection = pageState.collection || null;
    const title = String(collection && collection.name || "Collection").trim() || "Collection";
    const sourceMovies = Array.isArray(pageState.movies) ? pageState.movies : [];
    const visibleMovies = Array.isArray(pageState.visibleMovies) ? pageState.visibleMovies : sourceMovies;
    const loading = pageState.loading === true;
    const error = String(pageState.error || "").trim();
    const visibleCount = visibleMovies.length;
    const countLabel = visibleCount === 1 ? "1 movie" : `${visibleCount || 0} movies`;
    const filtersHTML = !loading && !error && collection ? renderCollectionDetailControlsHTML(pageState) : "";

    const bodyHTML = error
    ? `
        <div class="empty-state genre-detail-empty">
            <h2>Collection could not load</h2>
            <p>${escapeHTML(error)}</p>
        </div>
    `
    : visibleMovies.length
    ? `
        <div class="genre-result-summary">${escapeHTML(countLabel)}</div>
        <div class="genre-tight-grid collection-movie-grid">
            ${visibleMovies.map(movie=>renderGenrePosterGridCard(movie).replace('class="genre-result-card','class="genre-result-card collection-movie-card').replace('class="genre-result-card collection-movie-card','class="genre-result-card collection-movie-card')).join("")}
        </div>
    `
    : loading
    ? `
        <div class="genre-tight-grid genre-tight-grid-loading">
            ${renderTrackerPosterSkeletonCards(12)}
        </div>
    `
    : `
        <div class="empty-state genre-detail-empty">
            <h2>No movies found</h2>
            <p>${escapeHTML(typeof getCollectionDetailEmptyMessage === "function" ? getCollectionDetailEmptyMessage(pageState) : "This collection has no movies available right now.")}</p>
        </div>
    `;

    content.innerHTML = `
        <div class="genre-detail-page-inner collection-detail-page-inner">
            <div class="genre-detail-header collection-detail-header">
                <button type="button" class="show-page-back-button genre-page-back-button" id="collection-detail-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div>
                    <h1 class="genre-detail-title">${escapeHTML(title)}</h1>
                </div>
            </div>
            ${filtersHTML}
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
        input.value = getLibrarySearchQuery();
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



function getLibrarySearchEmptyHTML(query){

    const filterText = [
        getLibraryGenreFilter() !== "all" ? getLibraryGenreFilter() : "",
        getLibraryNetworkFilter() !== "all" ? getLibraryNetworkFilter() : "",
        getLibraryYearFilter() !== "all" ? getLibraryYearFilter() : ""
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

    const showRoute = typeof getShowDetailRoute === "function" ? getShowDetailRoute(show.tmdb_id,show.title || "") : "/app/list/watching";

    card.innerHTML = `

        <a class="watchlist-card-link" href="${escapeHTML(showRoute)}" aria-label="Open ${escapeHTML(show.title || "show")} details">
            ${posterHTML}

            <div class="info watchlist-info">

            <div class="watchlist-title-row">
                <div class="title">${escapeHTML(show.title)}</div>
            </div>

            <div class="episode">${episodeLine}</div>

            ${episodeTitle ? `<div class="episode-title">${episodeTitle}</div>` : ""}

            ${showNewBadge ? `<div class="watchlist-new-badge-row"><span class="new-badge watchlist-new-badge">NEW</span></div>` : ""}

            ${releaseMeta ? `<div class="watchlist-release-meta">${escapeHTML(releaseMeta)}</div>` : ""}

            </div>
        </a>

        ${actionHTML}

    `;

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

            const episodeRoute = typeof getEpisodeDetailRoute === "function"
            ? getEpisodeDetailRoute(show.tmdb_id,ep.season_number,ep.episode_number)
            : "/app/list/watching";

            card.innerHTML = `

                <a class="app-route-card-link" href="${escapeHTML(episodeRoute)}" aria-label="Open ${escapeHTML(show.title || "show")} episode"></a>

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

            const batchButton = card.querySelector(".upcoming-batch-button");

            if(batchButton){

                batchButton.addEventListener("click",function(event){

                    event.stopPropagation();

                    const key = this.dataset.batch;

                    expandedUpcomingBatches[key] = !expandedUpcomingBatches[key];

                    renderUpcoming(false);

                });

            }

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

                <a class="app-route-card-link" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,ep.season_number,ep.episode_number) : "/app/list/watching")}" aria-label="Open ${escapeHTML(show.title || "show")} episode"></a>

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

                <a class="app-route-card-link" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,ep.season_number,ep.episode_number) : "/app/list/watching")}" aria-label="Open ${escapeHTML(show.title || "show")} episode"></a>

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

            const card = document.createElement("a");
            card.className = "show history-entry-card";
            card.href = typeof getEpisodeDetailRoute === "function"
            ? getEpisodeDetailRoute(entry.tmdb_id,entry.season,entry.episode)
            : "/app/history";

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

function renderShowGenreLinksHTML(genres,media="tv"){
    const list = (Array.isArray(genres) ? genres : [])
    .map(genre=>genre && typeof genre === "object" ? {id:Number(genre.id || 0),name:String(genre.name || "").trim()} : {id:0,name:String(genre || "").trim()})
    .filter(genre=>genre.name);
    if(!list.length){ return ""; }
    return `<span class="show-genre-link-list">${list.map((genre,index)=>{
        const route = getShowGenreRoute(genre,media);
        const key = genre.id > 0 && typeof buildRouteKey === "function" ? buildRouteKey(genre.id,genre.name) : "";
        const link = route && route !== "/app/list/watching"
        ? `<a class="show-genre-link" href="${escapeHTML(route)}" data-genre-key="${escapeHTML(key)}" data-genre-name="${escapeHTML(genre.name)}" data-genre-media="${escapeHTML(media === "movie" ? "movie" : "tv")}" data-genre-route="${escapeHTML(route)}">${escapeHTML(genre.name)}</a>`
        : `<span class="show-genre-link-disabled">${escapeHTML(genre.name)}</span>`;
        return `${index > 0 ? `<span class="show-genre-separator">•</span>` : ""}${link}`;
    }).join("")}</span>`;
}

function renderPlainInlineRouteLinkHTML(label,route,extraClass=""){
    const text = String(label || "").trim();
    const href = String(route || "").trim();
    if(!text){
        return "";
    }
    if(!href){
        return `<span>${escapeHTML(text)}</span>`;
    }
    return `<a class="show-detail-entity-link show-detail-inline-link ${escapeHTML(extraClass)}" href="${escapeHTML(href)}">${escapeHTML(text)}</a>`;
}

function renderYearLinkHTML(year,media="tv"){
    const cleanYear = String(year || "").trim();
    const route = typeof getYearDetailRoute === "function" ? getYearDetailRoute(cleanYear,media) : "";
    return cleanYear ? renderPlainInlineRouteLinkHTML(cleanYear,route,"show-detail-year-link") : "";
}

function renderCertificationLinkHTML(media,rating){
    const cleanRating = String(rating || "").trim();
    if(!cleanRating){
        return "";
    }
    if(media !== "movie"){
        return `<span>${escapeHTML(cleanRating)}</span>`;
    }
    const route = typeof getCertificationDetailRoute === "function" ? getCertificationDetailRoute("movie",cleanRating) : "";
    return renderPlainInlineRouteLinkHTML(cleanRating,route,"show-detail-certification-link");
}

function getTVStatusSlugFromLabel(label){
    const clean = String(label || "").trim().toLowerCase();
    if(clean === "returning series"){
        return "returning-series";
    }
    if(clean === "ended"){
        return "ended";
    }
    if(clean === "canceled" || clean === "cancelled"){
        return "canceled";
    }
    if(clean === "in production"){
        return "in-production";
    }
    return "";
}

function renderStatusLinkHTML(status){
    const label = String(status || "").trim();
    const slug = getTVStatusSlugFromLabel(label);
    const route = slug && typeof getStatusDetailRoute === "function" ? getStatusDetailRoute(slug) : "";
    return label ? renderPlainInlineRouteLinkHTML(label,route,"show-detail-status-link") : "Unknown";
}

function renderCreatedByHTML(show){
    const people = Array.isArray(show && show.created_by_people) ? show.created_by_people : [];
    if(people.length){
        const links = people.slice(0,3).map((person,index)=>{
            const id = Number(person && person.id || 0);
            const name = String(person && person.name || "").trim();
            const route = id && typeof getPersonDetailRoute === "function" ? getPersonDetailRoute("creator",id,name) : "";
            return `${index > 0 ? `<span class="show-detail-inline-separator">/</span>` : ""}${renderPlainInlineRouteLinkHTML(name,route,"show-detail-person-link")}`;
        }).join("");
        return links ? `<span>Created by ${links}</span>` : "";
    }

    const creators = Array.isArray(show && show.created_by) ? show.created_by.slice(0,3) : [];
    if(!creators.length){
        return "";
    }
    return `<span>Created by ${creators.map(escapeHTML).join(" • ")}</span>`;
}

function renderCompanyLogoTilesHTML(companies,media="tv"){
    const cleanMedia = media === "movie" ? "movie" : "tv";
    const items = (Array.isArray(companies) ? companies : [])
    .map(company=>{
        const id = Number(company && company.id || 0);
        const name = String(company && company.name || "").trim();
        const logoPath = String(company && company.logo_path || "").trim();
        const route = id && typeof getCompanyDetailRoute === "function" ? getCompanyDetailRoute(id,name,cleanMedia) : "";
        if(!name){
            return "";
        }

        const innerHTML = logoPath
        ? `<img class="movie-company-logo" src="${escapeHTML(trackerImageURL(logoPath,"w154"))}" alt="${escapeHTML(name)}">`
        : `<span class="movie-company-name-fallback">${escapeHTML(name)}</span>`;
        const className = `movie-company-logo-link${logoPath ? "" : " movie-company-logo-link-name"}`;

        return route
        ? `<a href="${escapeHTML(route)}" class="${className}" title="${escapeHTML(name)}" aria-label="${escapeHTML(name)}">${innerHTML}</a>`
        : `<span class="${className}" title="${escapeHTML(name)}" aria-label="${escapeHTML(name)}">${innerHTML}</span>`;
    })
    .filter(Boolean);
    return items.length ? `<span class="movie-company-logo-list">${items.join("")}</span>` : "";
}

function renderCompanyLinksHTML(companies){
    return renderCompanyLogoTilesHTML(companies,"tv") || "Unknown";
}

function renderMovieCompanyLogosHTML(companies){
    return renderCompanyLogoTilesHTML(companies,"movie");
}

function getMovieCertification(movie){
    const results = movie && movie.release_dates && Array.isArray(movie.release_dates.results) ? movie.release_dates.results : [];
    const us = results.find(item=>String(item.iso_3166_1 || "").toUpperCase() === "US");
    const release = us && Array.isArray(us.release_dates) ? us.release_dates.find(item=>String(item.certification || "").trim()) : null;
    return release ? String(release.certification || "").trim() : "";
}

function renderMovieGenresHTML(movie){
    const genres = Array.isArray(movie && movie.genres) ? movie.genres : [];
    return renderShowGenreLinksHTML(genres,"movie") || "Unknown";
}

function normalizeMovieThemeItems(movie){
    const payload = movie && movie.keywords ? movie.keywords : null;
    const source = payload && Array.isArray(payload.keywords)
    ? payload.keywords
    : (payload && Array.isArray(payload.results) ? payload.results : (Array.isArray(payload) ? payload : []));
    return normalizeThemeItems({_tmdb_keywords:source});
}

function renderMovieThemesDetailsHTML(movie){
    const themes = normalizeMovieThemeItems(movie);
    if(!themes.length){
        return "Unknown";
    }

    return `
        <div class="show-detail-theme-list show-detail-theme-list-expanded">
            ${themes.map(theme=>renderThemeItemHTML(theme,"","movie")).join("")}
        </div>
    `;
}

function renderMovieGenresTabHTML(movie){
    const genres = Array.isArray(movie && movie.genre_items) && movie.genre_items.length ? movie.genre_items : (Array.isArray(movie && movie.genres) ? movie.genres : []);
    const themesHTML = renderMovieThemesDetailsHTML(movie);
    const genreHTML = genres.length
    ? `<div class="show-detail-genre-chips">${genres.map(genre=>{
        const name = String(genre && typeof genre === "object" ? genre.name : genre || "").trim();
        const route = getShowGenreRoute(genre,"movie");
        const key = genre && typeof genre === "object" && genre.id && typeof buildRouteKey === "function" ? buildRouteKey(genre.id,name) : "";
        return route && route !== "/app/list/watching"
        ? `<a href="${escapeHTML(route)}" class="show-detail-genre-chip show-genre-link" data-genre-key="${escapeHTML(key)}" data-genre-name="${escapeHTML(name)}" data-genre-media="movie" data-genre-route="${escapeHTML(route)}">${escapeHTML(name)}</a>`
        : `<span>${escapeHTML(name)}</span>`;
    }).join("")}</div>`
    : `<div class="v2-api-empty">No genres available.</div>`;

    return `
        <div class="show-genres-tab-stack">
            <section class="show-genres-tab-section">
                <h3 class="modal-section-heading show-genres-tab-heading">Genres</h3>
                ${genreHTML}
            </section>
            ${themesHTML !== "Unknown" ? `
                <section class="show-genres-tab-section">
                    <h3 class="modal-section-heading show-genres-tab-heading">Themes</h3>
                    ${themesHTML}
                </section>
            ` : ""}
        </div>
    `;
}

function renderMovieExternalLinksHTML(movie){
    const ids = movie && movie.external_ids ? movie.external_ids : {};
    const links = [];
    const homepageURL = movie ? safeExternalURL(movie.homepage) : "";
    const trailer = movie && movie.videos && Array.isArray(movie.videos.results)
    ? movie.videos.results.find(video=>String(video.site || "").toLowerCase() === "youtube" && String(video.type || "").toLowerCase().includes("trailer"))
    : null;

    if(trailer && trailer.key){
        links.push(`<a class="v2-clean-link v2-trailer-link" href="https://www.youtube.com/watch?v=${escapeHTML(trailer.key)}" target="_blank" rel="noopener noreferrer"><img class="v2-play-icon" src="/static/assets/icons/ui-play.svg" alt="">Trailer</a>`);
    }
    if(ids.imdb_id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://www.imdb.com/title/${escapeHTML(ids.imdb_id)}/" target="_blank" rel="noopener noreferrer">IMDb</a>`);
    }
    if(movie && movie.id){
        links.push(`<a class="v2-clean-link v2-external-pill" href="https://www.themoviedb.org/movie/${escapeHTML(movie.id)}" target="_blank" rel="noopener noreferrer">TMDB</a>`);
    }
    if(homepageURL){
        links.push(`<a class="v2-clean-link v2-external-pill" href="${escapeHTML(homepageURL)}" target="_blank" rel="noopener noreferrer">Official Site ↗</a>`);
    }

    return links.length ? `<div class="modal-meta modal-meta-under-status v2-show-info-links-line v2-show-action-line">${links.map((item,index)=>`${index > 0 ? `<span class="modal-meta-separator">•</span>` : ""}${item}`).join("")}</div>` : "";
}

function getMovieActiveTab(){
    const tab = String(activeMovieDetailsTab || "Info");
    return ["Info","Cast","Crew","Details","Genres","Releases"].includes(tab) ? tab : "Info";
}

function renderMovieTabsHTML(){
    const activeTab = getMovieActiveTab();
    return `
        <div class="show-detail-tabs movie-detail-tabs" role="tablist" aria-label="Movie details sections">
            ${["Info","Cast","Crew","Details","Genres","Releases"].map(tab=>`
                <button type="button" class="show-detail-tab ${activeTab === tab ? "active" : ""}" data-movie-detail-tab="${tab}" role="tab" aria-selected="${activeTab === tab ? "true" : "false"}">${tab}</button>
            `).join("")}
        </div>
    `;
}

function renderFavoriteHeartButtonHTML(active,attributes=""){
    const isActive = !!active;
    const label = isActive ? "Remove from favorites" : "Add to favorites";
    return `
        <button class="favorite-heart-button ${isActive ? "active" : ""}" type="button" ${attributes} aria-pressed="${isActive ? "true" : "false"}" aria-label="${label}" title="${label}">
            <svg class="favorite-heart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 20.4 4.35 13.2A5.25 5.25 0 0 1 11.7 5.7L12 6l.3-.3a5.25 5.25 0 0 1 7.35 7.5Z" fill="${isActive ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        </button>
    `;
}

function renderMovieTrackingButtonHTML(state,action,label){
    const active = !!(state && state[action]);
    return `
        <button
        class="modal-status-button movie-page-status-button ${active ? "active" : ""}"
        type="button"
        data-movie-tracking-action="${escapeHTML(action)}"
        aria-pressed="${active ? "true" : "false"}">
            ${escapeHTML(label)}
        </button>
    `;
}

function renderMovieActionButtonsHTML(movie){
    const state = typeof getMovieTrackingState === "function" ? getMovieTrackingState(movie && movie.id) : {watched:false,plan:false,favorite:false};
    const hasAnyState = !!(state.watched || state.plan || state.favorite);
    return `
        <div class="modal-status-buttons show-page-status-buttons movie-page-status-buttons" aria-label="Movie tracking actions">
            ${renderMovieTrackingButtonHTML(state,"watched","Watched")}
            ${renderMovieTrackingButtonHTML(state,"plan","Plan to Watch")}
            ${renderFavoriteHeartButtonHTML(state.favorite,`data-movie-tracking-action="favorite"`)}
            ${hasAnyState ? `<button class="remove-show-button remove-movie-button" type="button" data-movie-tracking-action="remove">Remove</button>` : ""}
        </div>
    `;
}

function getMovieCrewByJobs(movie,jobs){
    const wanted = new Set((Array.isArray(jobs) ? jobs : [jobs]).map(job=>String(job || "").toLowerCase()));
    const seen = new Set();
    return (Array.isArray(movie && movie.crew) ? movie.crew : [])
    .filter(person=>wanted.has(String(person && person.job || "").toLowerCase()))
    .filter(person=>{
        const key = String(person && person.id || person && person.name || "");
        if(!key || seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    });
}

function renderMovieCrewLinksHTML(movie,jobs,role){
    const people = getMovieCrewByJobs(movie,jobs);
    if(!people.length){
        return "Unknown";
    }
    return `<span class="show-detail-inline-link-list">${people.map((person,index)=>{
        const id = Number(person && person.id || 0);
        const name = String(person && person.name || "Unknown").trim();
        const route = id && typeof getPersonDetailRoute === "function" ? getPersonDetailRoute(role,id,name,"movie") : "";
        return `${index > 0 ? `<span class="show-detail-inline-separator">/</span>` : ""}${renderPlainInlineRouteLinkHTML(name,route,"show-detail-person-link")}`;
    }).join("")}</span>`;
}

function renderMovieDirectedByHTML(movie){
    const directors = getMovieCrewByJobs(movie,"Director");
    if(!directors.length){
        return "";
    }
    const links = directors.map((person,index)=>{
        const id = Number(person && person.id || 0);
        const name = String(person && person.name || "Unknown").trim();
        const route = id && typeof getPersonDetailRoute === "function" ? getPersonDetailRoute("director",id,name,"movie") : "";
        return `${index > 0 ? `<span class="show-detail-comma-separator">, </span>` : ""}${renderPlainInlineRouteLinkHTML(name,route,"show-detail-person-link")}`;
    }).join("");
    return links ? `<span>Directed by ${links}</span>` : "";
}

function renderMovieCountryDetailsHTML(movie){
    const countries = (Array.isArray(movie && movie.production_countries) ? movie.production_countries : [])
    .map(country=>({
        code:String(country && country.iso_3166_1 || "").trim().toLowerCase(),
        name:String(country && country.name || "").trim()
    }))
    .filter(country=>country.code || country.name);
    if(!countries.length){
        return "Unknown";
    }
    return `<span class="show-detail-inline-link-list">${countries.map((country,index)=>{
        const label = country.code ? getCountryLabel(country.code) : country.name;
        const routeName = country.code ? `${getCountryName(country.code)} Movies` : country.name;
        const link = country.code ? renderShowEntityLinkHTML(label,"country",country.code,{name:routeName,media:"movie"}) : `<span>${escapeHTML(label)}</span>`;
        return `${index > 0 ? `<span class="show-detail-inline-separator">/</span>` : ""}${link}`;
    }).join("")}</span>`;
}

function renderMovieLanguageDetailsHTML(movie){
    const originalLanguage = String(movie && movie.original_language || "").trim().toLowerCase();
    const languages = (Array.isArray(movie && movie.spoken_languages) ? movie.spoken_languages : [])
    .map(language=>({
        code:String(language && (language.iso_639_1 || language.iso_639_2) || "").trim().toLowerCase(),
        label:String(language && (language.english_name || language.name) || "").trim()
    }))
    .filter(language=>language.code || language.label);
    if(originalLanguage && !languages.some(language=>language.code === originalLanguage)){
        languages.unshift({code:originalLanguage,label:typeof getLanguageName === "function" ? getLanguageName(originalLanguage) : originalLanguage.toUpperCase()});
    }
    if(!languages.length){
        return "Unknown";
    }
    return `<span class="show-detail-inline-link-list">${languages.map((language,index)=>{
        const label = language.label || (typeof getLanguageName === "function" ? getLanguageName(language.code) : language.code.toUpperCase());
        const link = language.code && language.code === originalLanguage
        ? renderShowEntityLinkHTML(label,"language",language.code,{name:`${label} Movies`,media:"movie"})
        : `<span>${escapeHTML(label)}</span>`;
        return `${index > 0 ? `<span class="show-detail-inline-separator">/</span>` : ""}${link}`;
    }).join("")}</span>`;
}

function formatMovieMoney(value){
    const number = Number(value || 0);
    if(!Number.isFinite(number) || number <= 0){
        return "Unknown";
    }
    return "$" + Math.round(number).toLocaleString();
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

function renderMovieReleaseSortControlHTML(sortMode){
    const mode = sortMode === "country" ? "country" : "date";
    const label = mode === "country" ? "Country" : "Date";
    const options = ["date","country"].map(option=>{
        const optionLabel = option === "country" ? "Country" : "Date";
        const active = option === mode;
        return `
            <button class="movie-release-sort-menu-option${active ? " active" : ""}" type="button" data-movie-release-sort-option="${escapeHTML(option)}" role="menuitemradio" aria-checked="${active ? "true" : "false"}">
                ${escapeHTML(optionLabel)}
            </button>
        `;
    }).join("");
    return `
        <div class="movie-release-sort-note movie-release-sort-bar">
            <span class="movie-release-sort-static">Sort by</span>
            <span class="movie-release-sort-menu-wrap">
                <button class="movie-release-sort-button" type="button" data-movie-release-sort-toggle data-current-sort="${escapeHTML(mode)}" aria-haspopup="true" aria-expanded="false" aria-label="Choose movie release sort">
                    <span class="movie-release-sort-current">${escapeHTML(label)}</span>
                    <span class="movie-release-sort-chevron" aria-hidden="true">${renderBrowseChevronIcon("movie-release-sort-chevron-icon")}</span>
                </button>
                <span class="movie-release-sort-menu" data-movie-release-sort-menu role="menu" hidden>
                    ${options}
                </span>
            </span>
        </div>
    `;
}

function renderMovieReleaseEntryHTML(release){
    const certification = String(release.certification || "").trim();
    const note = String(release.note || "").trim();
    return `
        <div class="movie-release-entry">
            <div class="movie-release-entry-main">
                <span class="movie-release-date">${escapeHTML(formatMovieReleaseDate(release.date))}</span>
                <span class="modal-meta-separator">•</span>
                <span class="movie-release-type-label">${escapeHTML(release.typeLabel || "Release")}</span>
                ${certification ? `<span class="movie-release-certification-badge">${escapeHTML(certification)}</span>` : ""}
            </div>
            ${note ? `<div class="movie-release-note">${escapeHTML(note)}</div>` : ""}
        </div>
    `;
}

function renderMovieReleaseCountryRowHTML(country){
    const flag = getCountryFlag(country.countryCode);
    return `
        <div class="movie-release-country-row">
            <div class="movie-release-country-label">
                ${flag ? `<span class="movie-release-flag" aria-hidden="true">${escapeHTML(flag)}</span>` : ""}
                <span class="movie-release-country-name">${escapeHTML(country.countryName || "Other")}</span>
            </div>
            <div class="movie-release-entry-list">
                ${country.releases.map(renderMovieReleaseEntryHTML).join("")}
            </div>
        </div>
    `;
}

function renderMovieReleaseDateEntryHTML(release){
    const flag = getCountryFlag(release.countryCode);
    const certification = String(release.certification || "").trim();
    const note = String(release.note || "").trim();
    return `
        <div class="movie-release-date-entry">
            <div class="movie-release-date-entry-main">
                <span class="movie-release-date-country-label">
                    ${flag ? `<span class="movie-release-flag" aria-hidden="true">${escapeHTML(flag)}</span>` : ""}
                    <span class="movie-release-country-name">${escapeHTML(release.countryName || "Other")}</span>
                </span>
                <span class="modal-meta-separator">•</span>
                <span class="movie-release-type-label">${escapeHTML(release.typeLabel || "Release")}</span>
                ${certification ? `<span class="movie-release-certification-badge">${escapeHTML(certification)}</span>` : ""}
            </div>
            ${note ? `<div class="movie-release-note">${escapeHTML(note)}</div>` : ""}
        </div>
    `;
}

function renderMovieReleaseDateRowHTML(group){
    return `
        <div class="movie-release-date-row">
            <div class="movie-release-date-label">${escapeHTML(formatMovieReleaseDate(group.date))}</div>
            <div class="movie-release-date-entry-list">
                ${group.releases.map(renderMovieReleaseDateEntryHTML).join("")}
            </div>
        </div>
    `;
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

function renderMovieReleasesHTML(movie){
    const releases = collectMovieReleaseRows(movie);
    if(!releases.length){
        return `<div class="v2-api-empty">Unknown</div>`;
    }

    const sortMode = getMovieReleaseSortMode();
    if(sortMode === "country"){
        const countryRows = groupMovieReleasesByCountry(releases);
        return `
            <div class="movie-release-country-list">
                ${renderMovieReleaseSortControlHTML(sortMode)}
                ${countryRows.map(renderMovieReleaseCountryRowHTML).join("")}
            </div>
        `;
    }

    const dateRows = groupMovieReleasesByDate(releases);
    return `
        <div class="movie-release-date-list">
            ${renderMovieReleaseSortControlHTML(sortMode)}
            ${dateRows.map(renderMovieReleaseDateRowHTML).join("")}
        </div>
    `;
}

function renderMovieCastTabHTML(movie){
    const cast = Array.isArray(movie && movie.cast) ? movie.cast : [];
    const rows = renderV2ActorListHTML(cast,null,"movie");
    return rows ? `<div class="v2-actor-list show-info-actor-list">${rows}</div>` : `<div class="v2-api-empty">Unknown</div>`;
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

function renderMovieCrewTabHTML(movie){
    return renderCrewJobGroupsHTML(Array.isArray(movie && movie.crew) ? movie.crew : [],"movie","Unknown");
}

function formatRuntimeDisplay(runtimeMinutes){
    const minutes = Math.round(Number(runtimeMinutes || 0));
    if(!Number.isFinite(minutes) || minutes <= 0){
        return "";
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if(!hours){
        return `${minutes}m`;
    }
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function renderRuntimeDetailLinkHTML(runtimeMinutes,media="tv"){
    const label = formatRuntimeDisplay(runtimeMinutes);
    if(!label){
        return "";
    }
    const route = typeof getRuntimeBrowseRoute === "function" ? getRuntimeBrowseRoute(runtimeMinutes,media) : "";
    return route
    ? `<a class="show-detail-entity-link show-runtime-link" href="${escapeHTML(route)}" title="Browse titles by runtime">${escapeHTML(label)}</a>`
    : escapeHTML(label);
}

function getPrimaryShowRuntime(show){
    const runtimes = Array.isArray(show && show.episode_run_time) ? show.episode_run_time : [];
    const runtime = runtimes.map(value=>Number(value || 0)).find(value=>Number.isFinite(value) && value > 0);
    return runtime || 0;
}

function renderMovieDetailsTabHTML(movie){
    const certification = getMovieCertification(movie);
    const productionCompaniesHTML = renderMovieCompanyLogosHTML(movie && movie.production_companies);
    const rows = [
        {label:"Original Title",html:escapeHTML(movie.original_title || "Unknown")},
        {label:"Status",html:escapeHTML(movie.status || "Unknown")},
        {label:"Release Date",html:escapeHTML(movie.release_date || "Unknown")}
    ];
    if(Number(movie && movie.runtime || 0) > 0){
        rows.push({label:"Runtime",html:renderRuntimeDetailLinkHTML(movie.runtime,"movie")});
    }
    rows.push(
        {label:"Language",html:renderMovieLanguageDetailsHTML(movie)},
        {label:"Country",html:renderMovieCountryDetailsHTML(movie)},
        {label:"Certification",html:certification ? renderCertificationLinkHTML("movie",certification) : "Unknown"}
    );
    if(productionCompaniesHTML){
        rows.push({label:"Production Companies",html:productionCompaniesHTML});
    }
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

function renderMovieMoreLikeThisHTML(movie){
    const similar = Array.isArray(movie && movie.similar) ? movie.similar : [];
    if(!similar.length){
        return "";
    }
    const cards = similar.slice(0,10).map(item=>{
        const poster = item.poster_path
        ? `<img loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(item.poster_path,"w500"))}" alt="">`
        : renderPosterTitlePlaceholderHTML(item,"movie");
        const route = typeof getMovieDetailRoute === "function" ? getMovieDetailRoute(item.id,item.title || "") : "/app/discover";
        return `
            <a href="${escapeHTML(route)}" class="v2-similar-card" data-movie-similar-open="${escapeHTML(item.id)}" data-movie-similar-name="${escapeHTML(item.title || "")}">
                <div class="v2-similar-poster">${poster}</div>
                <div class="v2-similar-title">${escapeHTML(item.title || "Untitled")}</div>
            </a>
        `;
    }).join("");
    return renderV2RailSectionHTML("More Like This",cards,"v2-more-like-section movie-more-like-section");
}

function renderMovieInfoTabHTML(movie){
    const tagline = String(movie && movie.tagline || "").trim();
    return `
        <div class="movie-info-tab-stack">
            <section class="show-detail-section v2-show-info-section">
                <h2 class="modal-section-heading">Synopsis</h2>
                ${tagline ? `<p class="show-detail-tagline movie-info-tagline">${escapeHTML(tagline)}</p>` : ""}
                <p class="overview">${escapeHTML(movie.overview || "Unknown")}</p>
            </section>
            ${renderMovieMoreLikeThisHTML(movie)}
        </div>
    `;
}

function renderMovieActiveTabContentHTML(movie){
    const tab = getMovieActiveTab();
    if(tab === "Cast"){
        return `<section class="show-detail-section v2-show-info-section">${renderMovieCastTabHTML(movie)}</section>`;
    }
    if(tab === "Crew"){
        return `<section class="show-detail-section v2-show-info-section">${renderMovieCrewTabHTML(movie)}</section>`;
    }
    if(tab === "Details"){
        return `<section class="show-detail-section v2-show-info-section">${renderMovieDetailsTabHTML(movie)}</section>`;
    }
    if(tab === "Genres"){
        return `<section class="show-detail-section v2-show-info-section">${renderMovieGenresTabHTML(movie)}</section>`;
    }
    if(tab === "Releases"){
        return `<section class="show-detail-section v2-show-info-section">${renderMovieReleasesHTML(movie)}</section>`;
    }
    return renderMovieInfoTabHTML(movie);
}

function renderMovieDetailPage(state){
    const content = document.getElementById("show-detail-content");
    if(!content){
        return;
    }
    const pageState = state || {};
    const movie = pageState.movie || null;
    if(!movie){
        content.innerHTML = pageState.loading && typeof renderTrackerDetailSkeletonHTML === "function"
        ? renderTrackerDetailSkeletonHTML("movie","movie-page-back-button")
        : `
            <div class="show-detail-page-inner">
                <button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>
                <div class="empty-state show-detail-loading-state">
                    <h2>${pageState.loading ? "Loading movie" : "Movie could not load"}</h2>
                    <p>${escapeHTML(pageState.error || "Getting details.")}</p>
                </div>
            </div>
        `;
        return;
    }

    const title = movie.title || "Untitled";
    const posterHTML = movie.poster_path
    ? `<img src="${escapeHTML(trackerImageURL(movie.poster_path,"w500"))}" alt="${escapeHTML(title)} poster">`
    : renderPosterTitlePlaceholderHTML(movie,"movie");
    const backdrop = movie.backdrop_path
    ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), ${trackerBackgroundImage(movie.backdrop_path,"original")}`
    : `linear-gradient(to top, #080808 0%, #141414 100%)`;
    const certification = getMovieCertification(movie);
    const rating = Number(movie.vote_average || 0);
    const metaItems = [];
    if(movie.year){
        metaItems.push(renderYearLinkHTML(movie.year,"movie"));
    }else{
        metaItems.push("Unknown");
    }
    metaItems.push(certification ? renderCertificationLinkHTML("movie",certification) : "Unknown");
    metaItems.push(movie.runtime ? renderRuntimeDetailLinkHTML(movie.runtime,"movie") : `<span>Unknown</span>`);
    const directedByHTML = renderMovieDirectedByHTML(movie);
    if(directedByHTML){
        metaItems.push(directedByHTML);
    }
    const genresHTML = renderMovieGenresHTML(movie);
    if(genresHTML && genresHTML !== "Unknown"){
        metaItems.push(genresHTML);
    }
    if(rating > 0){
        metaItems.push(`<span class="tmdb-rating-group"><span class="tmdb-rating-inline">${rating.toFixed(1)}</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>`);
    }else{
        metaItems.push(`<span>Unknown</span>`);
    }
    const metaHTML = metaItems.filter(Boolean).map((item,index)=>`${index > 0 ? `<span class="modal-meta-separator">•</span>` : ""}${item}`).join("");

    content.innerHTML = `
        <div class="show-detail-page-inner movie-detail-page-inner">
            <div class="show-page-hero-shell movie-page-hero-shell">
                <button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back">
                    <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
                </button>

                <div class="modal-hero show-detail-hero show-page-hero movie-page-hero" style='background-image:${backdrop}'></div>

                <div class="show-page-identity-row movie-page-identity-row">
                    <div class="show-page-hero-poster movie-page-hero-poster">
                        ${posterHTML}
                    </div>
                    <div class="show-page-hero-content movie-page-hero-content">
                        <div class="modal-title show-page-title">${escapeHTML(title)}</div>
                        <div class="modal-meta modal-meta-under-status show-page-meta-line">${metaHTML}</div>
                        ${renderMovieExternalLinksHTML(movie)}
                        <div class="show-page-actions-wrap movie-page-actions-wrap">${renderMovieActionButtonsHTML(movie)}</div>
                    </div>
                </div>
            </div>

            <div class="modal-body show-page-body movie-page-body">
                <div class="modal-section show-detail-tabs-section movie-detail-tabs-section">
                    ${renderMovieTabsHTML()}
                    <div class="movie-detail-tab-content show-detail-tab-panel">
                        ${renderMovieActiveTabContentHTML(movie)}
                    </div>
                </div>
            </div>
        </div>
    `;
}



function getShowMetaHTML(show,year,genres,ratingHTML){

    const items = [];
    const contentRating = String(show && show.content_rating ? show.content_rating : "").trim();
    const networkHTML = renderV2NetworkLogoOnlyHTML(show);
    const creators = v2JoinList(show && show.created_by ? show.created_by : [],3);
    const cleanRatingHTML = String(ratingHTML || "").replace(/^<span class="modal-meta-separator">•<\/span>/,"");

    if(year){
        items.push(renderYearLinkHTML(year) || `<span>${escapeHTML(year)}</span>`);
    }

    if(contentRating){
        items.push(renderCertificationLinkHTML("tv",contentRating) || `<span>${escapeHTML(contentRating)}</span>`);
    }

    if(networkHTML){
        items.push(networkHTML);
    }

    const createdByHTML = renderCreatedByHTML(show);
    if(createdByHTML){
        items.push(createdByHTML);
    }

    if(genres){
        const genreLinksHTML = renderShowGenreLinksHTML(show && Array.isArray(show.genre_items) && show.genre_items.length ? show.genre_items : (show && show.genres ? show.genres : []));
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
    const routeLabel = String(options && options.routeLabel || cleanLabel).trim();
    const media = options && options.media === "movie" ? "movie" : "tv";
    const route = typeof getDiscoveryFilterDetailRoute === "function" ? getDiscoveryFilterDetailRoute(type,value,routeLabel,media) : "";
    const name = String(options && options.name || cleanLabel).trim();
    const className = options && options.className ? String(options.className) : "show-detail-entity-link";

    if(route && route !== "/app/list/watching"){
        return `<a class="${escapeHTML(className)}" href="${escapeHTML(route)}" data-discovery-type="${escapeHTML(type)}" data-discovery-value="${escapeHTML(value)}" data-discovery-media="${escapeHTML(media)}" data-discovery-name="${escapeHTML(name)}" data-discovery-label="${escapeHTML(routeLabel)}">${escapeHTML(cleanLabel)}</a>`;
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
        const route = typeof getDiscoveryFilterDetailRoute === "function" ? getDiscoveryFilterDetailRoute("network",id,label) : "";
        return `<a class="show-detail-entity-link show-detail-network-link" href="${escapeHTML(route)}" data-discovery-type="network" data-discovery-value="${escapeHTML(id)}" data-discovery-name="${escapeHTML(`Shows from ${label}`)}" data-discovery-label="${escapeHTML(label)}" aria-label="Shows from ${escapeHTML(label)}">${inner}</a>`;
    }
    return inner;
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

function renderShowLanguageDetailsHTML(show){
    const languages = getShowLanguageItems(show);
    const originalLanguage = String(show && show.original_language || "").trim().toLowerCase();
    if(!languages.length){
        return "Unknown";
    }
    return `<span class="show-detail-inline-link-list">${languages.map((language,index)=>{
        const label = language.label || (typeof getLanguageName === "function" ? getLanguageName(language.code) : language.code);
        const link = language.code && language.code === originalLanguage
        ? renderShowEntityLinkHTML(label,"language",language.code,{name:`${label} TV Shows`,media:"tv"})
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
    const themes = normalizeThemeItems(show);
    if(!themes.length){
        return "Unknown";
    }

    return `
        <div class="show-detail-theme-list show-detail-theme-list-expanded">
            ${themes.map(theme=>renderThemeItemHTML(theme)).join("")}
        </div>
    `;
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
        items.push(renderYearLinkHTML(year) || `<span>${escapeHTML(year)}</span>`);
    }

    if(contentRating){
        items.push(renderCertificationLinkHTML("tv",contentRating) || `<span>${escapeHTML(contentRating)}</span>`);
    }

    if(networkHTML){
        items.push(networkHTML);
    }

    const createdByHTML = renderCreatedByHTML(show);
    if(createdByHTML){
        items.push(createdByHTML);
    }

    if(genres){
        const genreLinksHTML = renderShowGenreLinksHTML(show && Array.isArray(show.genre_items) && show.genre_items.length ? show.genre_items : (show && show.genres ? show.genres : []));
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
        const providerName = provider && provider.provider_name ? provider.provider_name : (provider && provider.name ? provider.name : "Provider");
        const providerId = Number(provider && (provider.provider_id || provider.id) || 0);
        const providerRoute = providerId && typeof getProviderDetailRoute === "function" ? getProviderDetailRoute(providerId,providerName) : "";
        const watchLink = getV2ProviderWatchLink(provider,providerRegion);
        const innerHTML = `
            ${logo}
            <span>${escapeHTML(providerName)}</span>
        `;

        if(providerRoute){
            return `
                <a class="v2-provider-pill v2-provider-pill-link" href="${escapeHTML(providerRoute)}" title="Browse ${escapeHTML(providerName)}">
                    ${innerHTML}
                </a>
            `;
        }

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
                    <button type="button" class="v2-rail-button" data-v2-rail-scroll="left" aria-label="Scroll ${escapeHTML(title)} left"><svg class="v2-rail-button-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
                    <button type="button" class="v2-rail-button" data-v2-rail-scroll="right" aria-label="Scroll ${escapeHTML(title)} right"><svg class="v2-rail-button-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 2 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
                </div>
            </div>
            <div class="v2-horizontal-rail">${cards}</div>
        </div>
    `;
}

function getPersonLinkNameHTML(person,role,fallbackName,media="tv"){
    const cleanRole = typeof normalizePersonRoleSlug === "function" ? normalizePersonRoleSlug(role) : String(role || "");
    const cleanMedia = String(media || "tv") === "movie" ? "movie" : "tv";
    const id = person && Number(person.id || 0);
    const name = fallbackName || (person && person.name) || "Unknown";

    if(cleanRole && id > 0){
        const route = typeof getPersonDetailRoute === "function" ? getPersonDetailRoute(cleanRole,id,name,cleanMedia) : "";
        if(route){
            return `<a class="v2-person-link" href="${escapeHTML(route)}" data-person-role="${escapeHTML(cleanRole)}" data-person-media="${escapeHTML(cleanMedia)}" data-person-id="${escapeHTML(id)}" data-person-name="${escapeHTML(name)}">${escapeHTML(name)}</a>`;
        }
    }

    return `<span>${escapeHTML(name)}</span>`;
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
        : renderPosterTitlePlaceholderHTML(item,"tv");

        const route = typeof getShowDetailRoute === "function" ? getShowDetailRoute(item.id,item.name || "") : "/app/list/watching";
        return `
            <a href="${escapeHTML(route)}" class="v2-similar-card" data-v2-similar-open="${escapeHTML(item.id)}" data-v2-similar-name="${escapeHTML(item.name || "")}">
                <div class="v2-similar-poster">${poster}</div>
                <div class="v2-similar-title">${escapeHTML(item.name || "Untitled")}</div>
            </a>
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

        const routeLink = row.querySelector(".app-route-card-link");
        if(routeLink){
            routeLink.addEventListener("click",async function(event){
                if(!isPlainAppLinkClick(event)){ return; }
                event.preventDefault();
                await openDiscoverEpisodeModal(
                    show.tmdb_id,
                    row.dataset.season,
                    row.dataset.episode
                );
            });
        }

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
                <a class="app-route-card-link" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,seasonNumber,ep.episode_number,show.title || show.name || "") : "/app/discover")}" aria-label="Open ${escapeHTML(show.title || show.name || "show")} episode"></a>
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
            ${renderFavoriteHeartButtonHTML(typeof isShowFavorite === "function" && isShowFavorite(show.tmdb_id),`data-show-favorite-button="true"`)}
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

function renderShowCrewTabHTML(show){
    return renderCrewJobGroupsHTML(show && show._tmdb_crew ? show._tmdb_crew : [],"tv","No crew details available yet.");
}

function renderAlternativeTitlesForDetailsHTML(show){
    const titles = Array.isArray(show && show._tmdb_alternative_titles) ? show._tmdb_alternative_titles : [];
    const filters = getShowDetailFilters();
    const hiddenCountries = filters.hiddenAlternativeTitleCountries;
    const hiddenTitleNames = filters.hiddenAlternativeTitleNames;
    const grouped = new Map();

    titles
    .filter(item=>{
        if(!item || !item.title){
            return false;
        }
        const titleName = String(item.title || "").trim().toLowerCase();
        if(hiddenTitleNames.includes(titleName)){
            return false;
        }
        if(alternativeTitleCountryMatchesFilter(item,hiddenCountries)){
            return false;
        }
        return true;
    })
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
    const productionCompanies = Array.isArray(show && show._tmdb_production_companies) ? show._tmdb_production_companies : [];
    const contentRating = String(show && show.content_rating ? show.content_rating : "").trim();
    const rows = [
        {label:"Status",html:renderStatusLinkHTML(show && (show.tmdb_status || show.status) || "Unknown")}
    ];
    const runtime = getPrimaryShowRuntime(show);
    if(runtime){
        rows.push({label:"Runtime",html:renderRuntimeDetailLinkHTML(runtime,"tv")});
    }
    rows.push(
        {label:"Networks",html:renderShowNetworkDetailsHTML(show)},
        {label:"Language",html:renderShowLanguageDetailsHTML(show)},
        {label:"Country",html:renderShowCountryDetailsHTML(show)},
        {label:"Certification",html:contentRating ? renderCertificationLinkHTML("tv",contentRating) : "Unknown"},
        {label:"Production Companies",html:renderCompanyLinksHTML(productionCompanies)},
        {label:"Alternative Titles",html:renderAlternativeTitlesForDetailsHTML(show)}
    );

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
    const genres = Array.isArray(show && show.genre_items) && show.genre_items.length ? show.genre_items : (Array.isArray(show && show.genres) ? show.genres : []);
    const themesHTML = renderShowThemesDetailsHTML(show);
    const genreHTML = genres.length
    ? `<div class="show-detail-genre-chips">${genres.map(genre=>{
        const name = String(genre && typeof genre === "object" ? genre.name : genre || "").trim();
        const route = getShowGenreRoute(genre,"tv");
        const key = genre && typeof genre === "object" && genre.id && typeof buildRouteKey === "function" ? buildRouteKey(genre.id,name) : "";
        return route && route !== "/app/list/watching"
        ? `<a href="${escapeHTML(route)}" class="show-detail-genre-chip show-genre-link" data-genre-key="${escapeHTML(key)}" data-genre-name="${escapeHTML(name)}" data-genre-media="tv" data-genre-route="${escapeHTML(route)}">${escapeHTML(name)}</a>`
        : `<span>${escapeHTML(name)}</span>`;
    }).join("")}</div>`
    : `<div class="v2-api-empty">No genres available.</div>`;

    return `
        <div class="show-genres-tab-stack">
            <section class="show-genres-tab-section">
                <h3 class="modal-section-heading show-genres-tab-heading">Genres</h3>
                ${genreHTML}
            </section>
            ${themesHTML !== "Unknown" ? `
                <section class="show-genres-tab-section">
                    <h3 class="modal-section-heading show-genres-tab-heading">Themes</h3>
                    ${themesHTML}
                </section>
            ` : ""}
        </div>
    `;
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
    const rows = renderV2ActorListHTML(cast,null,"tv");

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
                        ${show.poster_path ? `<img src="${escapeHTML(trackerImageURL(show.poster_path,"w500"))}" alt="${escapeHTML(show.title || "Show")} poster">` : renderPosterTitlePlaceholderHTML(show,"tv")}
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
                ? `<a class="episode-detail-action-button episode-nav-button" id="episode-prev-button" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,previousEpisodeTarget.season,previousEpisodeTarget.episode,show.title || show.name || "") : "/app/list/watching")}">
                    ${escapeHTML(getEpisodeNavLabel("← Previous",previousEpisodeTarget))}
                </a>`
                : `<button class="episode-detail-action-button episode-nav-button disabled" disabled>
                    First Episode
                </button>`
                }

                ${
                nextEpisodeTarget
                ? `<a class="episode-detail-action-button episode-nav-button" id="episode-next-button" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,nextEpisodeTarget.season,nextEpisodeTarget.episode,show.title || show.name || "") : "/app/list/watching")}">
                    ${escapeHTML(getEpisodeNavLabel("Next",nextEpisodeTarget))} →
                </a>`
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

                <a class="app-route-card-link" href="${escapeHTML(typeof getEpisodeDetailRoute === "function" ? getEpisodeDetailRoute(show.tmdb_id,seasonNumber,ep.episode_number,show.title || show.name || "") : "/app/list/watching")}" aria-label="Open ${escapeHTML(show.title || show.name || "show")} episode"></a>

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
