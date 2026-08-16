var DATA = {
    shows:{},
    movies:{},
    history:[],
    profile:{
        username:"Username",
        favorite_shows:[],
        favorite_movies:[],
        avatar_type:"initial",
        avatar_preset:"silhouette-1",
        avatar_data:""
    },
    network_sync:{
        active:false,
        total:0,
        completed:0,
        pending:[],
        failed:[],
        current:"",
        lastRun:"",
        completedAt:""
    }
};

var activePage = "shows";
var activeShowsTab = "watchlist";
var activeFilter = "watching";
var activeProfileView = "home";
var activeFavoritesMode = "show";
var pendingShow = null;
var discoverPreviewShow = null;
var selectedShowId = null;
var selectedEpisodeContext = null;
var selectedGenreSlug = null;
var selectedGenreMedia = "tv";
var selectedDiscoveryContext = null;
var selectedPersonContext = null;
var selectedMovieId = null;
var searchRouteState = {query:"",media:"tv",fadeWatched:false,hideWatched:false,hidePlan:false,hideFavorites:false};
var personPageState = {
    role:"",
    personId:"",
    media:"tv",
    loading:false,
    error:"",
    person:null,
    credits:[],
    fadeWatched:false,
    hideWatched:false,
    hidePlan:false,
    hideFavorites:false
};
var genrePageState = {
    media:"tv",
    slug:"",
    name:"",
    genreId:null,
    year:"",
    sort:"popularity.desc",
    browse:null,
    browseLabels:null,
    categoryDates:null,
    page:1,
    totalPages:1,
    loading:false,
    error:"",
    shows:[]
};
var discoveryPageState = {
    type:"",
    value:"",
    name:"",
    media:"tv",
    year:"",
    sort:"popularity.desc",
    browse:null,
    browseLabels:null,
    page:1,
    totalPages:1,
    loading:false,
    error:"",
    shows:[]
};
var browsePageState = {
    media:"tv",
    filters:null,
    labels:null,
    page:1,
    totalPages:1,
    loading:false,
    error:"",
    shows:[]
};
var browseOptionState = {
    genres:{tv:[],movie:[]},
    countries:[],
    languages:[],
    movieCertifications:[],
    providers:{tv:[],movie:[]},
    loaded:{common:false,tvGenres:false,movieGenres:false,certifications:false,tvProviders:false,movieProviders:false},
    picker:{type:"",query:"",loading:false,error:"",results:[]}
};
var browseReferencePromises = {common:null,tv:null,movie:null,certifications:null,tvProviders:null,movieProviders:null};
var browsePickerSearchTimer = null;
var browsePickerSearchRequestId = 0;
var browseGlobalEventsBound = false;
var keepEyeFilterMenuOpen = false;
var genrePageRequestId = 0;
var discoveryPageRequestId = 0;
var browsePageRequestId = 0;
var moviePageState = {
    movieId:"",
    routeSlug:"",
    loading:false,
    error:"",
    movie:null
};
var showDetailPreview = null;
var showDetailBackStack = [];
var showDetailOpeningFromRoute = false;
var showDetailScrollTopBeforeEpisode = 0;
var showDetailScrollRestorePending = false;
var appDataReady = false;
var activeShowDetailsTabs = {};
var activeMovieDetailsTab = "Info";
var activeMovieReleaseSort = "date";
var activeShowInfoTabs = {};
var expandedSeasons = {};
var expandedUpcomingBatches = {};
var searchTimer = null;
var currentSearchController = null;
var searchRequestId = 0;
var lastDiscoverSearchQuery = "";
var lastDiscoverSearchResults = [];
var discoverSearchState = {query:"",media:"tv",page:1,totalPages:1,visibleLimit:21,loading:false};
var discoverHubState = {
    loaded:false,
    loading:false,
    error:"",
    sections:[],
    genres:{tv:[],movie:[]},
    collections:[]
};
var collectionsPageState = {loaded:false,loading:false,error:"",collections:[],filteredCollections:[],visibleCollections:[],query:"",genre:"",decade:"",sort:"popularity.desc",page:1,totalPages:1,totalResults:0,availableGenres:[],availableDecades:[],building:false,sourceDate:"",indexedCount:0,totalIds:0,cursor:0};
var collectionSearchTimer = null;
var collectionSearchController = null;
var collectionSearchRequestId = 0;
var collectionIndexPollTimer = null;
var collectionIndexHydrationRun = 0;
var collectionDetailPageState = {collectionId:"",routeSlug:"",loading:false,error:"",collection:null,movies:[],filters:null,labels:null,visibleMovies:[],totalResults:0,availableGenres:[],availableLanguages:[]};
var selectedCollectionId = null;
var discoverGenreMedia = "tv";
var librarySearchQuery = "";
var librarySearchRouteTimer = null;
var v2EpisodeDetailPendingLoads = new Map();
var V2_EPISODE_DETAIL_CACHE_PREFIX = "tv-tracker-v2-episode-details:";
var V2_EPISODE_DETAIL_CACHE_TTL = 1000 * 60 * 60 * 24;
var libraryGenreFilter = "all";
var libraryNetworkFilter = "all";
var libraryYearFilter = "all";
var librarySortMode = "default";
var isRefreshingUpcoming = false;
var lastCompatibleImportPreview = null;
var lastCompatibleCSVPreview = null;
var metadataSyncRunning = false;
var networkMetadataSyncRunning = false;
var adminAccountState = {loaded:false,loading:false,username:"",error:""};


const DISCOVER_HUB_CACHE_KEY = "tv-tracker-discover-hub:v9";
const DISCOVER_HUB_CACHE_TTL = 1000 * 60 * 60 * 3;
const DISCOVER_ROW_LIMIT = 14;
const DISCOVER_COLLECTION_ROW_LIMIT = 12;
const COLLECTIONS_PAGE_SIZE = 64;
const COLLECTIONS_DEFAULT_SORT = "popularity.desc";
const COLLECTION_SORT_VALUES = new Set(["name.asc","size.desc","date.desc","date.asc","rating.desc","rating.asc","popularity.desc","popularity.asc"]);
const COLLECTION_DETAIL_DEFAULT_SORT = "collection-order";
const COLLECTION_DETAIL_SORT_VALUES = new Set(["collection-order","date-desc","date-asc","popularity-desc","popularity-asc","rating-desc","rating-asc","title-asc","title-desc"]);
const TMDB_COLLECTION_DETAIL_CACHE_PREFIX = "tv-tracker-tmdb-collection-detail:v5:";
const TMDB_COLLECTION_DETAIL_CACHE_TTL = 1000 * 60 * 60 * 24;
const TMDB_COLLECTION_INDEX_CACHE_KEY = "tv-tracker-tmdb-collection-index:v6";
const TMDB_COLLECTION_INDEX_CACHE_TTL = 1000 * 60 * 5;
const COLLECTION_RETURN_POSITION_KEY = "tv-tracker-collection-return-position:v1";
const DISCOVER_COLLECTION_IDS = Object.freeze([
    10,
    1241,
    119,
    121938,
    726871,
    573436,
    722971,
    86311,
    404609,
    263,
    556,
    531241,
    131635,
    230,
    2344,
    264,
    10194,
    295,
    328,
    2150,
    8091,
    9485,
    87359,
    131292,
    131295,
    131296,
    284433,
    422834,
    529892,
    448150,
    87096,
    87118,
    386382,
    86066,
    14740,
    77816,
    748,
    8945,
    84,
    304,
    86119,
    9888,
    2602,
    521226,
    295130,
    313086,
    558216
]);
const TMDB_COLLECTION_INDEX_POLL_DELAY = 4000;
const SEARCH_MEDIA_TYPES = new Set(["tv","movie","person","collection"]);
const SEARCH_RESULT_BATCH_SIZE = 21;
const SEARCH_TYPING_DELAY_MS = 360;
const APP_ROUTE_NAV_CONTEXT_KEY = "tv-tracker-route-nav-context:v1";
const DISCOVER_CATEGORY_ROUTES = {
    "tv/popular":{media:"tv",category:"popular",path:"tv/popular",title:"Popular TV Shows",rowTitle:"Popular",section:"TV Shows"},
    "tv/top-rated":{media:"tv",category:"top-rated",path:"tv/top_rated",title:"Top Rated TV Shows",rowTitle:"Top Rated",section:"TV Shows"},
    "tv/airing-today":{media:"tv",category:"airing-today",path:"tv/airing_today",title:"Airing Today",rowTitle:"Airing Today",section:"TV Shows"},
    "tv/on-the-air":{media:"tv",category:"on-the-air",path:"tv/on_the_air",title:"On The Air",rowTitle:"On The Air",section:"TV Shows"},
    "movie/popular":{media:"movie",category:"popular",path:"movie/popular",title:"Popular Movies",rowTitle:"Popular",section:"Movies"},
    "movie/top-rated":{media:"movie",category:"top-rated",path:"movie/top_rated",title:"Top Rated Movies",rowTitle:"Top Rated",section:"Movies"},
    "movie/now-playing":{media:"movie",category:"now-playing",path:"movie/now_playing",title:"Now Playing",rowTitle:"Now Playing",section:"Movies"},
    "movie/upcoming":{media:"movie",category:"upcoming",path:"movie/upcoming",title:"Upcoming Movies",rowTitle:"Upcoming",section:"Movies"}
};
const TMDB_TV_GENRE_CACHE_KEY = "tv-tracker-tmdb-tv-genres:v1";
const TMDB_MOVIE_GENRE_CACHE_KEY = "tv-tracker-tmdb-movie-genres:v1";
const TMDB_TV_GENRE_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
const GENRE_MEDIA_TYPES = new Set(["tv","movie"]);
const TV_GENRE_SLUGS = new Set(["action-adventure","animation","comedy","crime","documentary","drama","family","kids","mystery","news","reality","sci-fi-fantasy","soap","talk","war-politics","western"]);
const MOVIE_GENRE_SLUGS = new Set(["action","adventure","animation","comedy","crime","documentary","drama","family","fantasy","history","horror","music","mystery","romance","science-fiction","tv-movie","thriller","war","western"]);
const TV_TO_MOVIE_GENRE_SLUGS = {
    "action-adventure":"action",
    "sci-fi-fantasy":"science-fiction",
    "war-politics":"war",
    "kids":"family"
};
const MOVIE_TO_TV_GENRE_SLUGS = {
    action:"action-adventure",
    adventure:"action-adventure",
    fantasy:"sci-fi-fantasy",
    "science-fiction":"sci-fi-fantasy",
    war:"war-politics"
};
const DISCOVERY_GRID_PAGE_SIZE = 21;
const GENRE_PAGE_SORTS = new Set(["popularity.desc","vote_average.desc","first_air_date.desc"]);
const DISCOVERY_PAGE_TYPES = new Set(["network","language","country","theme","company","provider","year","status","certification","discover-category"]);
const PERSON_MEDIA_TYPES = new Set(["tv","movie"]);
const BROWSE_MEDIA_TYPES = new Set(["tv","movie"]);
const TV_STATUS_ROUTES = {
    "returning-series":{label:"Returning Series",tmdbValue:"0"},
    "ended":{label:"Ended",tmdbValue:"3"},
    "canceled":{label:"Canceled",tmdbValue:"4"},
    "in-production":{label:"In Production",tmdbValue:"2"}
};






















function cleanProviderHTML(value){
    const div = document.createElement("div");
    div.innerHTML = String(value || "");
    return div.textContent || div.innerText || "";
}


function getLegacyMetadataMarker(){
    return "tv" + "maze";
}

function isLegacyMetadataKey(key){
    const name = String(key || "").toLowerCase();
    const marker = getLegacyMetadataMarker();
    return (
        name.indexOf(marker) !== -1 ||
        name === "air_time" ||
        name === "air_timestamp" ||
        name === "airtime" ||
        name === "airstamp" ||
        name === "metadata_source" ||
        name === "artwork_source" ||
        name === "provider" ||
        name === "_artwork_tmdb_id" ||
        name === "date_only_episode_time_override"
    );
}

function cleanLegacyMetadata(value){
    if(Array.isArray(value)){
        value.forEach(item=>cleanLegacyMetadata(item));
        return value;
    }

    if(!value || typeof value !== "object"){
        return value;
    }

    Object.keys(value).forEach(key=>{
        if(isLegacyMetadataKey(key)){
            delete value[key];
            return;
        }
        cleanLegacyMetadata(value[key]);
    });

    return value;
}

function getCleanTrackerDataCopy(data){
    const copy = JSON.parse(JSON.stringify(data || {}));
    normalizeTrackerDataForEpisodeIntegrity(copy);
    return cleanLegacyMetadata(copy);
}


function getEpisodeIdentityKey(showId,season,episode){
    const cleanShowId = String(showId || "").trim();
    const cleanSeason = Number(season);
    const cleanEpisode = Number(episode);

    if(!cleanShowId || !Number.isFinite(cleanSeason) || !Number.isFinite(cleanEpisode)){
        return "";
    }

    return cleanShowId + "::" + String(cleanSeason) + "::" + String(cleanEpisode);
}

function getHistoryEntryEpisodeKey(entry){
    if(!entry || typeof entry !== "object"){
        return "";
    }

    return getEpisodeIdentityKey(
        entry.tmdb_id || entry.show_id,
        entry.season,
        entry.episode
    );
}

function getDeterministicHistoryId(showId,season,episode){
    const cleanShowId = String(showId || "").trim();
    const cleanSeason = Number(season);
    const cleanEpisode = Number(episode);

    if(!cleanShowId || !Number.isFinite(cleanSeason) || !Number.isFinite(cleanEpisode)){
        return "";
    }

    return "watched-" + cleanShowId + "-s" + cleanSeason + "-e" + cleanEpisode;
}

function getHistoryEntryTimestampValue(entry){
    const value = entry && (entry.watched_at || entry.date || "");
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
}

function preferHistoryEntryForEpisode(left,right){
    if(!left){
        return right;
    }

    if(!right){
        return left;
    }

    const leftTime = getHistoryEntryTimestampValue(left);
    const rightTime = getHistoryEntryTimestampValue(right);

    if(rightTime > leftTime){
        return right;
    }

    return left;
}

function normalizeWatchedEpisodeArray(values){
    const seen = new Set();
    const output = [];

    (Array.isArray(values) ? values : []).forEach(value=>{
        const episode = Number(value);

        if(!Number.isFinite(episode) || seen.has(episode)){
            return;
        }

        seen.add(episode);
        output.push(episode);
    });

    output.sort((a,b)=>a-b);
    return output;
}

function normalizeShowEpisodeProgress(show,summary=null){
    if(!show || typeof show !== "object"){
        return;
    }

    if(!show.episodes_watched || typeof show.episodes_watched !== "object"){
        show.episodes_watched = {};
    }

    Object.keys(show.episodes_watched).forEach(seasonKey=>{
        const season = Number(seasonKey);
        const original = Array.isArray(show.episodes_watched[seasonKey]) ? show.episodes_watched[seasonKey] : [];
        const clean = normalizeWatchedEpisodeArray(show.episodes_watched[seasonKey]);
        if(summary && original.length > clean.length){
            summary.duplicateProgressEntriesRemoved += original.length - clean.length;
        }
        delete show.episodes_watched[seasonKey];

        if(Number.isFinite(season) && clean.length > 0){
            show.episodes_watched[String(season)] = clean;
        }
    });
}

function dedupeTrackerHistoryEntries(data){
    if(!data || !Array.isArray(data.history)){
        return [];
    }

    const byEpisode = new Map();
    const passthrough = [];
    const removedIds = [];

    data.history.forEach((entry,index)=>{
        if(!entry || typeof entry !== "object"){
            return;
        }

        const key = getHistoryEntryEpisodeKey(entry);

        if(!key){
            passthrough.push(entry);
            return;
        }

        if(!entry.id){
            entry.id = getDeterministicHistoryId(entry.tmdb_id || entry.show_id,entry.season,entry.episode) || ("history-" + index);
        }

        const previous = byEpisode.get(key);
        const preferred = preferHistoryEntryForEpisode(previous,entry);

        if(previous && previous !== preferred && previous.id){
            removedIds.push(String(previous.id));
        }

        if(previous && entry !== preferred && entry.id){
            removedIds.push(String(entry.id));
        }

        byEpisode.set(key,preferred);
    });

    const deduped = [...passthrough,...Array.from(byEpisode.values())];
    deduped.sort((a,b)=>getHistoryEntryTimestampValue(b) - getHistoryEntryTimestampValue(a));
    data.history = deduped;

    return Array.from(new Set(removedIds));
}


function createDuplicateCleanupSummary(){
    return {
        duplicateShowsRemoved:0,
        duplicateWatchedRecordsRemoved:0,
        duplicateProgressEntriesRemoved:0,
        invalidHistoryEntriesSkipped:0
    };
}

function countWatchedProgressEntries(show){
    if(!show || !show.episodes_watched || typeof show.episodes_watched !== "object"){
        return 0;
    }

    return Object.values(show.episodes_watched).reduce((total,values)=>{
        return total + (Array.isArray(values) ? values.length : 0);
    },0);
}

function choosePreferredDuplicateShow(left,right){
    if(!left){
        return right;
    }

    if(!right){
        return left;
    }

    const leftWatched = countWatchedProgressEntries(left);
    const rightWatched = countWatchedProgressEntries(right);

    if(rightWatched > leftWatched){
        return right;
    }

    const leftHistory = Date.parse(left.last_activity_at || left.updated_at || left.date_added || "");
    const rightHistory = Date.parse(right.last_activity_at || right.updated_at || right.date_added || "");
    const leftTime = Number.isFinite(leftHistory) ? leftHistory : 0;
    const rightTime = Number.isFinite(rightHistory) ? rightHistory : 0;

    if(rightTime > leftTime){
        return right;
    }

    return left;
}

function cleanupDuplicateShows(data,summary=null){
    if(!data || !data.shows || typeof data.shows !== "object" || Array.isArray(data.shows)){
        return;
    }

    const cleaned = {};
    const seen = new Map();

    Object.entries(data.shows).forEach(([key,show])=>{
        if(!show || typeof show !== "object"){
            return;
        }

        const id = String(show.tmdb_id || show.id || key || "").trim();

        if(!id){
            cleaned[key] = show;
            return;
        }

        show.tmdb_id = show.tmdb_id || id;
        show.id = show.id || Number(id) || id;

        if(!seen.has(id)){
            seen.set(id,show);
            cleaned[id] = show;
            return;
        }

        const previous = seen.get(id);
        const preferred = choosePreferredDuplicateShow(previous,show);
        seen.set(id,preferred);
        cleaned[id] = preferred;

        if(summary){
            summary.duplicateShowsRemoved += 1;
        }
    });

    data.shows = cleaned;
}

function normalizeTrackerDataForEpisodeIntegrity(data,summary=null){
    if(!data || typeof data !== "object"){
        return [];
    }

    if(!data.shows || typeof data.shows !== "object"){
        data.shows = {};
    }

    cleanupDuplicateShows(data,summary);
    Object.values(data.shows).forEach(show=>normalizeShowEpisodeProgress(show,summary));

    if(!Array.isArray(data.history)){
        data.history = [];
        return [];
    }

    const beforeHistoryCount = data.history.length;
    const removedIds = dedupeTrackerHistoryEntries(data);

    if(summary && beforeHistoryCount > data.history.length){
        summary.duplicateWatchedRecordsRemoved += beforeHistoryCount - data.history.length;
    }

    return removedIds;
}

function removeExistingHistoryEntriesForEpisode(showId,season,episode){
    if(!Array.isArray(DATA.history)){
        DATA.history = [];
        return [];
    }

    const targetKey = getEpisodeIdentityKey(showId,season,episode);

    if(!targetKey){
        return [];
    }

    const removedIds = [];

    DATA.history = DATA.history.filter(entry=>{
        const matches = getHistoryEntryEpisodeKey(entry) === targetKey;

        if(matches && entry && entry.id){
            removedIds.push(String(entry.id));
        }

        return !matches;
    });

    return removedIds;
}

function getHistoryDeleteIdsFromAddedEntries(entries){
    return Array.isArray(entries) && Array.isArray(entries._deletedHistoryIds)
    ? entries._deletedHistoryIds.map(String)
    : [];
}

function combineHistoryDeleteIds(){
    const seen = new Set();
    const output = [];

    Array.from(arguments).forEach(values=>{
        (Array.isArray(values) ? values : []).forEach(value=>{
            const id = String(value || "");

            if(id && !seen.has(id)){
                seen.add(id);
                output.push(id);
            }
        });
    });

    return output;
}


function getAdminAccountUsername(){
    return String(adminAccountState.username || "");
}

async function loadAdminAccountIntoSettings(force=false){
    if(adminAccountState.loading){
        return;
    }

    if(adminAccountState.loaded && !force){
        const existingInput = document.getElementById("admin-username-input");
        if(existingInput && existingInput.dataset.userEdited !== "true"){
            existingInput.value = adminAccountState.username;
        }
        return;
    }

    adminAccountState.loading = true;
    adminAccountState.error = "";

    try{
        const response = await fetch("/api/admin/account",{
            method:"GET",
            credentials:"same-origin",
            cache:"no-store",
            headers:{"Accept":"application/json"}
        });
        const payload = await parseAPIResponse(response);
        adminAccountState.username = String(payload.username || "");
        adminAccountState.loaded = true;

        const input = document.getElementById("admin-username-input");
        if(input && input.dataset.userEdited !== "true"){
            input.value = adminAccountState.username;
        }
        const status = document.getElementById("admin-account-status");
        if(status){
            status.textContent = "";
        }
    }catch(error){
        console.error("Could not load admin account",error);
        adminAccountState.error = error && error.message
        ? error.message
        : "Could not load the admin account";
        const status = document.getElementById("admin-account-status");
        if(status){
            status.textContent = adminAccountState.error;
        }
    }finally{
        adminAccountState.loading = false;
    }
}

async function saveAdminAccountChanges(){
    const usernameInput = document.getElementById("admin-username-input");
    const currentPasswordInput = document.getElementById("admin-current-password-input");
    const newPasswordInput = document.getElementById("admin-new-password-input");
    const confirmPasswordInput = document.getElementById("admin-confirm-password-input");
    const saveButton = document.getElementById("save-admin-account");
    const status = document.getElementById("admin-account-status");

    if(!usernameInput || !currentPasswordInput || !newPasswordInput || !confirmPasswordInput){
        return;
    }

    const username = usernameInput.value.trim();
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if(!username){
        showToast("Admin username cannot be blank");
        usernameInput.focus();
        return;
    }
    if(!currentPassword){
        showToast("Enter your current password");
        currentPasswordInput.focus();
        return;
    }
    if(newPassword !== confirmPassword){
        showToast("New passwords do not match");
        confirmPasswordInput.focus();
        return;
    }
    if(newPassword && newPassword.length < 16){
        showToast("New password must contain at least 16 characters");
        newPasswordInput.focus();
        return;
    }

    if(saveButton){
        saveButton.disabled = true;
    }
    if(status){
        status.textContent = "Saving account changes...";
    }

    try{
        const response = await fetch("/api/admin/account",{
            method:"POST",
            credentials:"same-origin",
            cache:"no-store",
            headers:{
                "Accept":"application/json",
                "Content-Type":"application/json",
                "X-CSRF-Token":csrfToken()
            },
            body:JSON.stringify({
                username,
                currentPassword,
                newPassword,
                confirmPassword
            })
        });
        await parseAPIResponse(response);
        location.assign("/login");
    }catch(error){
        console.error("Could not update admin account",error);
        const message = typeof friendlyRequestError === "function"
        ? friendlyRequestError(error,"Could not update the admin account")
        : (error && error.message ? error.message : "Could not update the admin account");
        if(status){
            status.textContent = message;
        }
        showToast(message);
        if(saveButton){
            saveButton.disabled = false;
        }
    }
}


function waitForNextPaint(){
    return new Promise(resolve=>{
        if(typeof requestAnimationFrame === "function"){
            requestAnimationFrame(()=>resolve());
        }else{
            setTimeout(resolve,0);
        }
    });
}

function prepareModalForOpen(type){
    const modal = document.getElementById("show-modal");
    const content = document.getElementById("show-modal-content");

    if(!modal || !content){
        return;
    }

    modal.classList.toggle("show-detail-overlay",type === "show");
    modal.classList.toggle("episode-detail-overlay",type === "episode");
    modal.classList.add("modal-preparing");
    content.innerHTML = "";
    modal.style.display = "flex";
}

async function revealPreparedModal(){
    const modal = document.getElementById("show-modal");

    if(!modal){
        return;
    }

    await waitForNextPaint();
    await waitForNextPaint();
    modal.classList.remove("modal-preparing");
}

function refreshAfterLocalShowChange(showId,historyChanged=false,stateChanged=false){
    if(typeof refreshInterfaceForDataChanges !== "function"){
        renderAll();
        return;
    }

    refreshInterfaceForDataChanges({
        showIds:[String(showId)],
        historyChanged:historyChanged === true,
        stateChanged:stateChanged === true,
        remote:false
    });
}

function historyEntryIds(entries){
    return (Array.isArray(entries) ? entries : [])
    .map(entry=>entry && entry.id ? String(entry.id) : "")
    .filter(Boolean);
}

async function saveShowMutation(showId,addedEntries=[],deletedHistoryIds=[]){
    const combinedDeletedHistoryIds = combineHistoryDeleteIds(
        deletedHistoryIds,
        getHistoryDeleteIdsFromAddedEntries(addedEntries)
    );

    return saveData({
        showIds:[String(showId)],
        historyUpsertIds:historyEntryIds(addedEntries),
        historyDeleteIds:combinedDeletedHistoryIds
    });
}

function getHistoryIdsForSeason(showId,seasonNumber){
    return (Array.isArray(DATA.history) ? DATA.history : [])
    .filter(entry=>{
        return (
            String(entry.tmdb_id) === String(showId) &&
            Number(entry.season) === Number(seasonNumber)
        );
    })
    .map(entry=>String(entry.id || ""))
    .filter(Boolean);
}




function isMainSeasonNumber(seasonNumber){

    const number = Number(seasonNumber);

    return Number.isFinite(number) && number >= 1;

}



function hasAvailableUnwatchedEpisode(show){

    return getNextMissedAiredEpisode(show) !== null;

}



function hasFutureScheduledEpisode(show){

    return getFutureScheduleEpisodes(show).length > 0;

}





async function init(){
    await initDatabase();

    const saved = await getStoredData();

    if(saved && saved.shows){
        DATA = saved;
    }

    normalizeExistingData();
    if(typeof tmdbWarmImageConfiguration === "function"){
        tmdbWarmImageConfiguration();
    }
    setupEvents();
    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.initialize === "function"){
        window.TVTrackerReleaseTiming.initialize({
            onRefresh:()=>{
                if(activePage === "shows"){
                    if(activeShowsTab === "upcoming"){
                        renderUpcoming(false);
                        return;
                    }
                    if(activeShowsTab === "watchlist"){
                        renderWatchlist();
                        return;
                    }
                }
                if(activePage === "show-detail" && typeof renderActiveShowDetailPage === "function"){
                    renderActiveShowDetailPage();
                    return;
                }
                if(activePage === "episode-detail" && typeof renderActiveEpisodeDetailPage === "function"){
                    renderActiveEpisodeDetailPage();
                }
            }
        }).then(()=>window.TVTrackerReleaseTiming.prefetchShows(DATA.shows)).catch(()=>{});
    }
    renderAll();
    appDataReady = true;

    if(window.TVTrackerRouter && typeof window.TVTrackerRouter.applyRoute === "function"){
        setTimeout(()=>window.TVTrackerRouter.applyRoute(),0);
    }

    startDataSync();
    scheduleInitialBackgroundMaintenance();

    // Migration metadata sync is intentionally not auto-started.
    // It can slow down search/rendering, and migration work is on hold for now.
}

function scheduleInitialBackgroundMaintenance(){
    const runMaintenance = async function(){
        try{
            const before = new Map(
                Object.entries(DATA.shows || {}).map(([id,show])=>[
                    String(id),
                    JSON.stringify([
                        show.status || "",
                        show.completed_at || "",
                        show.was_unreleased_when_added === true
                    ])
                ])
            );

            await autoUpdateStatuses(false,false);

            const changedShowIds = Object.entries(DATA.shows || {})
            .filter(([id,show])=>{
                return before.get(String(id)) !== JSON.stringify([
                    show.status || "",
                    show.completed_at || "",
                    show.was_unreleased_when_added === true
                ]);
            })
            .map(([id])=>String(id));

            if(changedShowIds.length > 0){
                refreshInterfaceForDataChanges({
                    showIds:changedShowIds,
                    historyChanged:false,
                    stateChanged:false,
                    remote:false
                });
                await saveData({showIds:changedShowIds});
            }
        }catch(error){
            console.error("TV Tracker startup maintenance failed",error);
        }
    };

    if(typeof requestIdleCallback === "function"){
        requestIdleCallback(()=>runMaintenance(),{timeout:10000});
        return;
    }

    setTimeout(runMaintenance,6000);
}


function setupEvents(){

    document.querySelectorAll(".app-primary-nav button[data-page]").forEach(button=>{

        button.addEventListener("click",function(){
            showPage(this.dataset.page);
        });

    });



    document.querySelectorAll(".top-tabs button").forEach(button=>{

        button.addEventListener("click",function(){

            document.querySelectorAll(".top-tabs button").forEach(btn=>{
                btn.classList.remove("active");
            });

            this.classList.add("active");

            activeShowsTab = this.dataset.tab;

            updateShellTitle();
            renderShowsPage();

        });

    });



    document.querySelectorAll(".filters button").forEach(button=>{

        button.addEventListener("click",function(){

            document.querySelectorAll(".filters button").forEach(btn=>{
                btn.classList.remove("active");
            });

            this.classList.add("active");

            activeFilter = this.dataset.filter;

            renderWatchlist();

        });

    });



    const globalSearchInput = document.getElementById("search");

    if(globalSearchInput){
        globalSearchInput.addEventListener("input",function(){

            clearTimeout(searchTimer);

            const query = this.value.trim();

            searchTimer = setTimeout(()=>{
                searchShows(query,{skipRoute:activePage !== "search"});
            },SEARCH_TYPING_DELAY_MS);

        });

        globalSearchInput.addEventListener("keydown",function(event){
            if(event.key !== "Enter"){
                return;
            }
            event.preventDefault();
            const query = this.value.trim();
            openSearchPage(query,{
                media:normalizeSearchMediaType(discoverSearchState.media || searchRouteState.media || "tv"),
                replaceRoute:false
            });
        });
    }



    document.querySelectorAll(".popup-buttons button").forEach(button=>{

        button.addEventListener("click",function(){
            addPendingShow(this.dataset.status);
        });

    });



    document.getElementById("close-popup").addEventListener("click",function(){
        closeStatusPopup();
    });



    document.getElementById("status-popup").addEventListener("click",function(event){

        if(event.target.id === "status-popup"){
            closeStatusPopup();
        }

    });



    document.getElementById("close-show-modal").addEventListener("click",function(){
        closeShowModal();
    });



    document.getElementById("show-modal").addEventListener("click",function(event){
        // Full-screen episode windows should not close from accidental outside clicks.
    });

    document.addEventListener("keydown",function(event){
        if(event.key === "Escape" && selectedEpisodeContext){
            closeEpisodeDetailsPage();
        }
    });

    document.addEventListener("click",function(event){
        const link = event.target && event.target.closest ? event.target.closest(".v2-person-link[data-person-role][data-person-id]") : null;
        if(!link || typeof openPersonPage !== "function" || (typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event))){
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        openPersonPage(link.dataset.personRole,link.dataset.personId,{
            personName:link.dataset.personName || link.textContent || "",
            media:link.dataset.personMedia || "tv"
        });
    });



    if(typeof setupFavoritesPopupEvents === "function"){
        setupFavoritesPopupEvents();
    }



    setInterval(function(){

        if(activePage === "shows" && activeShowsTab === "upcoming"){
            renderUpcoming();
        }

    },300000);

}



function normalizeExistingData(){

    if(!DATA.history || !Array.isArray(DATA.history)){
        DATA.history = [];
    }

    if(!DATA.shows){
        DATA.shows = {};
    }

    cleanLegacyMetadata(DATA);
    normalizeTrackerDataForEpisodeIntegrity(DATA);

    ensureProfileData();
    ensureMovieTrackingData();

    ensureMetadataSyncData();
    ensureNetworkMetadataSyncData();

    const latestHistoryByShow = getLatestHistoryTimestampMap();

    Object.values(DATA.shows).forEach(show=>{

        if(!show.episodes_watched){
            show.episodes_watched = {};
        }

        if(!show._season_episodes){
            show._season_episodes = {};
        }

        if(!show._episode_details){
            show._episode_details = {};
        }

        if(!show._episode_list){
            show._episode_list = {};
        }

        if(typeof show.was_unreleased_when_added === "undefined"){
            show.was_unreleased_when_added = false;
        }

        if(show.status === "completed"){
            show.status = "finished";
        }

        if(typeof show.last_episode_to_air === "undefined"){
            show.last_episode_to_air = null;
        }

        if(typeof show.source === "undefined"){
            show.source = "app";
        }

        if(!show._imported_progress || typeof show._imported_progress !== "object"){
            show._imported_progress = null;
        }

        if(typeof show.completed_at === "undefined"){
            show.completed_at = show.status === "finished"
            ? new Date().toISOString()
            : "";
        }

        if(typeof show.last_tmdb_refresh === "undefined"){
            show.last_tmdb_refresh = "";
        }

        if(typeof show._tmdb_external_ids === "undefined"){
            show._tmdb_external_ids = null;
        }

        if(!Array.isArray(show._tmdb_cast)){
            show._tmdb_cast = [];
        }

        if(typeof show._v2_cast_loaded_at === "undefined"){
            show._v2_cast_loaded_at = "";
        }

        if(!show._episode_actor_credits || typeof show._episode_actor_credits !== "object"){
            show._episode_actor_credits = {};
        }

        if(!show._episode_guest_stars || typeof show._episode_guest_stars !== "object"){
            show._episode_guest_stars = {};
        }

        if(!show._episode_cast_credits || typeof show._episode_cast_credits !== "object"){
            show._episode_cast_credits = {};
        }

        if(!show._episode_v2_details || typeof show._episode_v2_details !== "object"){
            show._episode_v2_details = {};
        }

        delete show.date_only_episode_time_override;
        cleanLegacyMetadata(show);

        syncNextEpisodeFromTMDB(show);
        normalizeEpisodeReleaseFields(show);

        const latestWatchedAt = latestHistoryByShow.get(String(show.tmdb_id)) || "";

        if(latestWatchedAt){
            setShowActivityFromTimestamp(show,latestWatchedAt);
        }else{
            updateShowLastWatchedFromHistory(show,{preserveLegacyDate:true});
        }

    });

}




function ensureMetadataSyncData(){

    if(!DATA.metadata_sync || typeof DATA.metadata_sync !== "object"){
        DATA.metadata_sync = createEmptyMetadataSyncData();
    }

    if(!Array.isArray(DATA.metadata_sync.pending)){
        DATA.metadata_sync.pending = [];
    }

    if(!Array.isArray(DATA.metadata_sync.failed)){
        DATA.metadata_sync.failed = [];
    }

    if(typeof DATA.metadata_sync.total === "undefined"){
        DATA.metadata_sync.total = DATA.metadata_sync.pending.length;
    }

    if(typeof DATA.metadata_sync.completed === "undefined"){
        DATA.metadata_sync.completed = 0;
    }

    if(typeof DATA.metadata_sync.paused === "undefined"){
        DATA.metadata_sync.paused = false;
    }

    if(typeof DATA.metadata_sync.active === "undefined"){
        DATA.metadata_sync.active = DATA.metadata_sync.pending.length > 0;
    }

    if(typeof DATA.metadata_sync.current === "undefined"){
        DATA.metadata_sync.current = "";
    }

    if(typeof DATA.metadata_sync.lastRun === "undefined"){
        DATA.metadata_sync.lastRun = "";
    }

    if(typeof DATA.metadata_sync.lastError === "undefined"){
        DATA.metadata_sync.lastError = "";
    }

}



function createEmptyMetadataSyncData(){

    return {
        active:false,
        paused:false,
        total:0,
        completed:0,
        pending:[],
        failed:[],
        current:"",
        lastRun:"",
        lastError:"",
        startedAt:"",
        completedAt:""
    };

}



function queueCompatibleMetadataSync(targetData){

    if(!targetData || !targetData.shows){
        return createEmptyMetadataSyncData();
    }

    const pending = Object.values(targetData.shows)
    .filter(show=>{
        return show && show.source === "compatible-json-import";
    })
    .map(show=>String(show.tmdb_id));

    return {
        active:pending.length > 0,
        paused:false,
        total:pending.length,
        completed:0,
        pending:pending,
        failed:[],
        current:"",
        lastRun:"",
        lastError:"",
        startedAt:new Date().toISOString(),
        completedAt:""
    };

}



function getMetadataSyncSummary(){

    ensureMetadataSyncData();

    const sync = DATA.metadata_sync;
    const total = Number(sync.total || 0);
    const completed = Number(sync.completed || 0);
    const pending = Array.isArray(sync.pending) ? sync.pending.length : 0;
    const failed = Array.isArray(sync.failed) ? sync.failed.length : 0;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
        active:sync.active === true,
        paused:sync.paused === true,
        running:metadataSyncRunning === true,
        total:total,
        completed:completed,
        pending:pending,
        failed:failed,
        current:sync.current || "",
        percent:Math.max(0,Math.min(100,percent)),
        lastRun:sync.lastRun || "",
        lastError:sync.lastError || ""
    };

}



async function startMetadataSync(showToastMessage=true){

    ensureMetadataSyncData();

    if(!DATA.metadata_sync.active || DATA.metadata_sync.paused){
        return;
    }

    if(metadataSyncRunning){
        return;
    }

    metadataSyncRunning = true;

    if(showToastMessage){
        showToast("Metadata sync started");
    }

    try{
        await processMetadataSyncQueue();
    }finally{
        metadataSyncRunning = false;
        if(activePage === "settings"){
            renderSettings();
        }
    }

}



async function pauseMetadataSync(){

    ensureMetadataSyncData();
    DATA.metadata_sync.paused = true;
    DATA.metadata_sync.current = "";
    await saveData();
    showToast("Metadata sync paused");
    renderAll();

}



async function continueMetadataSync(){

    ensureMetadataSyncData();
    DATA.metadata_sync.paused = false;
    DATA.metadata_sync.active = (DATA.metadata_sync.pending.length > 0 || DATA.metadata_sync.failed.length > 0);
    await saveData();
    renderAll();
    startMetadataSync(true);

}



async function retryMetadataSyncFailures(){

    ensureMetadataSyncData();

    const failed = Array.isArray(DATA.metadata_sync.failed) ? DATA.metadata_sync.failed : [];

    if(failed.length === 0){
        showToast("No failed metadata items");
        return;
    }

    const retryIds = failed.map(item=>String(item.showId || item.id || "")).filter(Boolean);

    DATA.metadata_sync.pending = Array.from(new Set(DATA.metadata_sync.pending.concat(retryIds)));
    DATA.metadata_sync.failed = [];
    DATA.metadata_sync.active = DATA.metadata_sync.pending.length > 0;
    DATA.metadata_sync.paused = false;
    DATA.metadata_sync.total = Math.max(DATA.metadata_sync.total || 0, DATA.metadata_sync.completed + DATA.metadata_sync.pending.length);
    DATA.metadata_sync.lastError = "";

    await saveData();
    renderAll();
    startMetadataSync(true);

}



async function processMetadataSyncQueue(){

    ensureMetadataSyncData();

    const sync = DATA.metadata_sync;

    while(sync.active && !sync.paused && Array.isArray(sync.pending) && sync.pending.length > 0){

        const showId = String(sync.pending.shift());
        const show = DATA.shows && DATA.shows[showId] ? DATA.shows[showId] : null;

        if(!show){
            sync.completed += 1;
            continue;
        }

        sync.current = show.title || showId;
        sync.lastRun = new Date().toISOString();

        if(activePage === "settings"){
            renderSettings();
        }

        try{
            await hydrateOneMetadataSyncShow(showId);
            sync.completed += 1;
            sync.lastError = "";
        }catch(error){
            sync.completed += 1;
            sync.failed.push({
                showId:showId,
                title:show.title || showId,
                error:error && error.message ? error.message : "Metadata sync failed"
            });
            sync.lastError = show.title || showId;
        }

        if(sync.pending.length === 0){
            sync.active = false;
            sync.current = "";
            sync.completedAt = new Date().toISOString();
        }

        normalizeExistingData();
        await autoUpdateStatuses(false,false);
        await saveData();

        if(activePage === "settings"){
            renderSettings();
        }

        await waitForImportTick(80);

    }

    DATA.metadata_sync.current = "";
    await saveData();

    if(activePage === "shows"){
        renderShowsPage();
    }

}



async function hydrateOneMetadataSyncShow(showId){

    let show = DATA.shows[String(showId)];

    if(!show){
        return;
    }

    if(show.source !== "compatible-json-import"){
        return;
    }

    if(show.local_only === true || !canUseTMDBShow(show)){
        const fakeCompatibleShow = {
            title:show.title || "",
            uuid:show.import_uuid || (show.compatible_import && show.compatible_import.uuid) || "",
            status:show.original_status || (show.compatible_import && show.compatible_import.original_status) || "",
            id:{
                tvdb:show.tvdb_id || (show.compatible_import && show.compatible_import.tvdb_id) || null,
                imdb:show.imdb_id || (show.compatible_import && show.compatible_import.imdb_id) || null
            }
        };

        const match = await resolveCompatibleTMDBDetails(fakeCompatibleShow,{});

        if(match && match.details){
            const oldId = String(show.tmdb_id);
            applyTMDBDetailsToImportedShow(show,match.details,match.method || "metadata-sync");
            const newId = String(show.tmdb_id);

            if(newId !== oldId){
                moveShowStorageKey(oldId,newId,show);
                show = DATA.shows[newId];
                showId = newId;
            }
        }
    }

    if(canUseTMDBShow(show)){
        await refreshShowDetails(show);

        const seasonsToLoad = getCompatibleImportHydrationSeasons(show);
        seasonsToLoad.sort((a,b)=>a-b);

        for(let i = 0; i < seasonsToLoad.length; i++){
            await loadSeasonData(show,seasonsToLoad[i]);
        }

        syncNextEpisodeFromTMDB(show);
        normalizeEpisodeReleaseFields(show);
    }

    reapplyImportedWatchedProgress(show);

}



function normalizeTMDBNetworks(details){

    const networks = Array.isArray(details && details.networks)
    ? details.networks
    : [];

    const seen = new Set();

    return networks
    .map(network=>{

        if(!network || !network.name){
            return null;
        }

        return {
            id:Number(network.id || 0),
            name:String(network.name || "").trim(),
            logo_path:network.logo_path || "",
            origin_country:network.origin_country || ""
        };

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

function applyTMDBDetailsToImportedShow(show,details,matchMethod){

    if(!show || !details){
        return;
    }

    show.tmdb_id = details.id;
    show.title = details.name || show.title;
    show.poster_path = details.poster_path || show.poster_path || "";
    show.backdrop_path = details.backdrop_path || show.backdrop_path || "";
    show.overview = details.overview || show.overview || "";
    show.first_air_date = details.first_air_date || show.first_air_date || "";
    show.genres = (details.genres || []).map(genre=>genre.name);
    show.networks = normalizeTMDBNetworks(details);
    show._network_metadata_version = 1;
    show.tmdb_status = details.status || show.tmdb_status || "";
    show.tmdb_rating = details.vote_average || show.tmdb_rating || 0;
    show.tmdb_vote_count = details.vote_count || show.tmdb_vote_count || 0;
    show.number_of_seasons = details.number_of_seasons || show.number_of_seasons || 0;
    show.number_of_episodes = details.number_of_episodes || show.number_of_episodes || 0;
    show.next_episode_to_air = details.next_episode_to_air || null;
    show.last_episode_to_air = details.last_episode_to_air || null;
    applyV2TMDBDetails(show,details);
    show.local_only = false;
    show.last_tmdb_refresh = new Date().toISOString();

    if(!show._tmdb_external_ids){
        show._tmdb_external_ids = null;
    }

    if(show.compatible_import){
        show.compatible_import.match_method = matchMethod || "metadata-sync";
    }

}



function moveShowStorageKey(oldId,newId,show){

    if(!oldId || !newId || oldId === newId){
        return;
    }

    if(DATA.shows[String(newId)] && DATA.shows[String(newId)] !== show){
        // Keep both if there is an unexpected ID conflict.
        show.tmdb_id = oldId;
        show.local_only = true;
        if(show.compatible_import){
            show.compatible_import.match_method = "metadata-conflict";
        }
        return;
    }

    delete DATA.shows[String(oldId)];
    DATA.shows[String(newId)] = show;

    ensureProfileData();

    if(DATA.profile && Array.isArray(DATA.profile.favorite_shows)){
        DATA.profile.favorite_shows = DATA.profile.favorite_shows.map(id=>{
            return String(id) === String(oldId) ? String(newId) : id;
        });
    }

    if(DATA.metadata_sync && Array.isArray(DATA.metadata_sync.pending)){
        DATA.metadata_sync.pending = DATA.metadata_sync.pending.map(id=>{
            return String(id) === String(oldId) ? String(newId) : id;
        });
    }

}






function syncNextEpisodeFromTMDB(show){

    if(
        !show ||
        !show.next_episode_to_air ||
        !show.next_episode_to_air.season_number ||
        !show.next_episode_to_air.episode_number ||
        !show.next_episode_to_air.air_date
    ){
        return;
    }

    const next = show.next_episode_to_air;
    const seasonKey = String(next.season_number);
    const episodeNumber = Number(next.episode_number);

    const list = show._episode_list && show._episode_list[seasonKey];

    if(Array.isArray(list)){

        const target = list.find(ep=>{
            return Number(ep.episode_number) === episodeNumber;
        });

        if(target){
            target.air_date = next.air_date || target.air_date || "";
            target.name = next.name || target.name || "";
            target.still_path = next.still_path || target.still_path || "";
        }

    }

    if(show._episode_details){

        const detailKey = seasonKey + "-" + String(episodeNumber);
        const detail = show._episode_details[detailKey];

        if(detail){
            detail.air_date = next.air_date || detail.air_date || "";
            detail.name = next.name || detail.name || "";
            detail.still_path = next.still_path || detail.still_path || "";
        }

    }

}



async function refreshShowDetails(show){

    try{

        if(!canUseTMDBShow(show)){
            return false;
        }

        const details = await tmdbGetShowDetails(show.tmdb_id);

        if(!details){
            return false;
        }

        show.title = details.name || show.title || "";
        show.original_name = details.original_name || show.original_name || "";
        show.poster_path = details.poster_path || show.poster_path || "";
        show.backdrop_path = details.backdrop_path || show.backdrop_path || "";
        show.overview = details.overview || show.overview || "";
        show.first_air_date = details.first_air_date || show.first_air_date || "";
        show.last_air_date = details.last_air_date || show.last_air_date || "";
        show.episode_run_time = Array.isArray(details.episode_run_time) ? details.episode_run_time : (show.episode_run_time || []);
        show.genres = (details.genres || []).map(genre=>genre.name);
        show.genre_items = (details.genres || []).map(genre=>({id:Number(genre.id || 0),name:String(genre.name || "")})).filter(genre=>genre.id && genre.name);
        show.networks = normalizeTMDBNetworks(details);
        show._network_metadata_version = 1;
        show.tmdb_status = details.status || show.tmdb_status || "";
        show.tmdb_rating = details.vote_average || show.tmdb_rating || 0;
        show.tmdb_vote_count = details.vote_count || show.tmdb_vote_count || 0;
        show.number_of_seasons = details.number_of_seasons || show.number_of_seasons || 0;
        show.number_of_episodes = details.number_of_episodes || show.number_of_episodes || 0;
        show.next_episode_to_air = details.next_episode_to_air || null;
        show.last_episode_to_air = details.last_episode_to_air || null;
        applyV2TMDBDetails(show,details);
        syncNextEpisodeFromTMDB(show);
        show.last_tmdb_refresh = new Date().toISOString();
        return true;

    }catch(error){
        return false;
    }

}

function getTrackedShowExternalMetadataFingerprint(show){
    if(!show){ return ""; }
    const snapshot = {
        title:show.title || "",
        poster_path:show.poster_path || "",
        backdrop_path:show.backdrop_path || "",
        overview:show.overview || "",
        first_air_date:show.first_air_date || "",
        last_air_date:show.last_air_date || "",
        genres:Array.isArray(show.genres) ? show.genres : [],
        genre_items:Array.isArray(show.genre_items) ? show.genre_items : [],
        networks:Array.isArray(show.networks) ? show.networks : [],
        tmdb_status:show.tmdb_status || "",
        tmdb_rating:Number(show.tmdb_rating || 0),
        tmdb_vote_count:Number(show.tmdb_vote_count || 0),
        number_of_seasons:Number(show.number_of_seasons || 0),
        number_of_episodes:Number(show.number_of_episodes || 0),
        next_episode_to_air:show.next_episode_to_air || null,
        last_episode_to_air:show.last_episode_to_air || null,
        content_rating:show.content_rating || "",
        production_companies:Array.isArray(show._tmdb_production_companies) ? show._tmdb_production_companies : [],
        cast:Array.isArray(show._tmdb_cast) ? show._tmdb_cast : [],
        crew:show._tmdb_crew || {},
        themes:Array.isArray(show._tmdb_keywords) ? show._tmdb_keywords : []
    };
    try{ return JSON.stringify(snapshot); }catch(error){ return String(Date.now()); }
}

async function refreshOpenTrackedShowMetadata(showId){
    const id = String(showId || "");
    const show = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;
    if(!show || !shouldRefreshShow(show)){ return false; }
    const before = getTrackedShowExternalMetadataFingerprint(show);
    const refreshed = await refreshShowDetails(show);
    if(!refreshed){ return false; }
    await saveData({showIds:[id]});
    const changed = before !== getTrackedShowExternalMetadataFingerprint(show);
    if(changed && String(selectedShowId || "") === id && selectedEpisodeContext === null){
        renderShowDetailsPagePreservingScroll(show);
        if(typeof updateShellTitle === "function"){ updateShellTitle(); }
    }
    return changed;
}

function shouldRefreshShow(show){

    if(!show || !show.last_tmdb_refresh){
        return true;
    }

    const lastRefresh = new Date(show.last_tmdb_refresh);

    if(Number.isNaN(lastRefresh.getTime())){
        return true;
    }

    const twelveHours = 12 * 60 * 60 * 1000;

    return Date.now() - lastRefresh.getTime() >= twelveHours;

}


async function tmdbGetExternalIds(showId){

    const response = await fetch(
        `${TMDB_API_BASE}/tv/${showId}/external_ids`
    );

    if(!response.ok){
        throw new Error("TMDB external IDs error: " + response.status);
    }

    return await response.json();

}













function normalizeEpisodeReleaseFields(show){

    if(!show){
        return;
    }

    if(!show._episode_list){
        show._episode_list = {};
    }

    if(!show._episode_details){
        show._episode_details = {};
    }

    cleanLegacyMetadata(show._episode_list);
    cleanLegacyMetadata(show._episode_details);

}



async function refreshShowForSchedule(show,forceRefresh=false){

    if(!show){
        return;
    }

    if(!canUseTMDBShow(show)){
        return;
    }

    const needsTMDBRefresh = forceRefresh || shouldRefreshShow(show);

    if(!needsTMDBRefresh){
        return;
    }

    await refreshShowDetails(show);

    await ensureSeasonLoaded(show,1,true);

    const lastSeason = Math.max(show.number_of_seasons || 1,1);

    await ensureSeasonLoaded(show,lastSeason,true);

    if(
        show.next_episode_to_air &&
        show.next_episode_to_air.season_number
    ){

        await ensureSeasonLoaded(
            show,
            Number(show.next_episode_to_air.season_number),
            true
        );

    }

}





async function autoUpdateStatuses(forceRefresh=false,allowRemoteRefresh=true){

    const shows = Object.values(DATA.shows);

    for(let i = 0; i < shows.length; i++){

        const show = shows[i];

        if(show.status === "dropped"){
            continue;
        }

        if(allowRemoteRefresh){

            if(
                forceRefresh ||
                shouldRefreshShow(show)
            ){

                await refreshShowForSchedule(show,forceRefresh);

            }else{

                await ensureSeasonLoaded(show,1);

            }

        }else if(!hasLoadedEpisodeData(show) && !show.first_air_date){

            continue;

        }

        const released = hasAnyAiredEpisode(show);
        const availableUnwatched = hasAvailableUnwatchedEpisode(show);

        if(!released){

            show.status = "plan";
            show.was_unreleased_when_added = true;
            show.completed_at = "";
            continue;

        }

        if(
            show.was_unreleased_when_added === true &&
            show.status === "plan" &&
            availableUnwatched
        ){

            show.status = "watching";
            show.was_unreleased_when_added = false;

        }

        if(
            show.status === "finished" &&
            availableUnwatched
        ){

            show.status = "watching";
            show.completed_at = "";

        }

    }

}





function getStaticWatchRegion(){
    return "US";
}

function normalizeCreatedBy(details){
    return (Array.isArray(details && details.created_by) ? details.created_by : [])
    .map(person=>{
        return person && person.name ? String(person.name).trim() : "";
    })
    .filter(Boolean)
    .slice(0,5);
}

function normalizeSpokenLanguages(details){
    return (Array.isArray(details && details.spoken_languages) ? details.spoken_languages : [])
    .map(language=>{
        if(!language){
            return null;
        }
        const code = String(language.iso_639_1 || language.iso_639_2 || "").trim().toLowerCase();
        const englishName = String(language.english_name || language.name || code || "").trim();
        const localName = String(language.name || "").trim();
        if(!englishName && !code){
            return null;
        }
        return {
            iso_639_1:code,
            english_name:englishName,
            name:localName
        };
    })
    .filter(Boolean)
    .slice(0,5);
}

function pickUSContentRating(contentRatings){
    const results = contentRatings && Array.isArray(contentRatings.results)
    ? contentRatings.results
    : [];

    const us = results.find(item=>String(item.iso_3166_1 || "").toUpperCase() === "US" && item.rating);

    if(us && us.rating){
        return String(us.rating).trim();
    }

    const fallback = results.find(item=>item && item.rating);
    return fallback && fallback.rating ? String(fallback.rating).trim() : "";
}

function normalizeTMDBVideos(videos){
    const results = videos && Array.isArray(videos.results) ? videos.results : [];

    return results
    .filter(video=>{
        return video &&
        String(video.site || "").toLowerCase() === "youtube" &&
        video.key &&
        (String(video.type || "").toLowerCase() === "trailer" || String(video.type || "").toLowerCase() === "teaser");
    })
    .sort((a,b)=>{
        const aOfficial = a.official === true ? 0 : 1;
        const bOfficial = b.official === true ? 0 : 1;
        if(aOfficial !== bOfficial){
            return aOfficial - bOfficial;
        }
        const typeOrder = {trailer:0,teaser:1};
        return (typeOrder[String(a.type || "").toLowerCase()] ?? 9) - (typeOrder[String(b.type || "").toLowerCase()] ?? 9);
    })
    .slice(0,4)
    .map(video=>({
        name:String(video.name || video.type || "Video"),
        key:String(video.key || ""),
        site:String(video.site || "YouTube"),
        type:String(video.type || "Video"),
        official:video.official === true,
        published_at:video.published_at || ""
    }));
}

function normalizeTMDBKeywords(keywords){
    const results = keywords && Array.isArray(keywords.results)
    ? keywords.results
    : (keywords && Array.isArray(keywords.keywords) ? keywords.keywords : (Array.isArray(keywords) ? keywords : []));
    const seen = new Set();

    return results
    .map(keyword=>{
        if(typeof keyword === "string"){
            const name = keyword.trim();
            return name ? {id:0,name:name} : null;
        }
        if(!keyword){
            return null;
        }
        const name = String(keyword.name || "").trim();
        const id = Number(keyword.id || 0);
        return name ? {id:Number.isFinite(id) ? id : 0,name:name} : null;
    })
    .filter(Boolean)
    .filter(keyword=>{
        const key = keyword.id > 0 ? `id:${keyword.id}` : `name:${keyword.name.toLowerCase()}`;
        if(seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    })
    .slice(0,20);
}

function normalizeTMDBSimilarShows(similar,limit=10){
    const results = similar && Array.isArray(similar.results) ? similar.results : [];

    return results
    .filter(show=>show && show.id && (show.name || show.original_name))
    .slice(0,Number(limit || 10))
    .map(show=>({
        id:show.id,
        name:show.name || show.original_name || "Untitled",
        poster_path:show.poster_path || "",
        backdrop_path:show.backdrop_path || "",
        overview:show.overview || "",
        first_air_date:show.first_air_date || "",
        vote_average:Number(show.vote_average || 0),
        popularity:Number(show.popularity || 0)
    }));
}

function normalizeTMDBSimilarMovies(similar,limit=10){
    const results = similar && Array.isArray(similar.results) ? similar.results : [];
    return results
    .filter(movie=>movie && movie.id && (movie.title || movie.original_title))
    .slice(0,Number(limit || 10))
    .map(movie=>({
        id:Number(movie.id || 0),
        title:movie.title || movie.original_title || "Untitled",
        poster_path:movie.poster_path || "",
        backdrop_path:movie.backdrop_path || "",
        overview:movie.overview || "",
        release_date:movie.release_date || "",
        vote_average:Number(movie.vote_average || 0),
        popularity:Number(movie.popularity || 0),
        adult:movie.adult === true
    }));
}

function normalizeTMDBContentRatings(contentRatings){
    const results = contentRatings && Array.isArray(contentRatings.results) ? contentRatings.results : [];

    return results
    .map(item=>({
        iso_3166_1:String(item && item.iso_3166_1 ? item.iso_3166_1 : "").toUpperCase(),
        rating:String(item && item.rating ? item.rating : "").trim()
    }))
    .filter(item=>item.iso_3166_1 && item.rating);
}

function normalizeTMDBAlternativeTitles(alternativeTitles){
    const results = alternativeTitles && Array.isArray(alternativeTitles.results) ? alternativeTitles.results : [];
    const seen = new Set();

    return results
    .map(item=>({
        iso_3166_1:String(item && item.iso_3166_1 ? item.iso_3166_1 : "").toUpperCase(),
        title:String(item && item.title ? item.title : "").trim(),
        type:String(item && item.type ? item.type : "").trim()
    }))
    .filter(item=>{
        if(!item.title){
            return false;
        }
        const key = [item.iso_3166_1,item.title.toLowerCase()].join(":");
        if(seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    })
    .slice(0,20);
}

function normalizeCrewJob(value){
    return String(value || "").trim();
}

function normalizeTMDBAggregateCrew(aggregateCredits){
    const crew = aggregateCredits && Array.isArray(aggregateCredits.crew) ? aggregateCredits.crew : [];
    const rows = [];
    const seen = new Set();

    crew.forEach(person=>{
        if(!person || !person.name){
            return;
        }
        const jobs = Array.isArray(person.jobs) && person.jobs.length
        ? person.jobs
        : [{job:person.job || "Crew",episode_count:person.episode_count || person.total_episode_count || 0}];

        jobs.forEach(jobItem=>{
            const job = normalizeCrewJob(jobItem && jobItem.job) || "Crew";
            const key = [person.id || person.name,String(job).toLowerCase()].join(":");
            if(seen.has(key)){
                return;
            }
            seen.add(key);
            rows.push({
                id:Number(person.id || 0),
                name:String(person.name || "").trim(),
                job,
                department:String(person.department || person.known_for_department || "Crew").trim() || "Crew",
                profile_path:person.profile_path || "",
                episode_count:Number(jobItem && jobItem.episode_count || person.total_episode_count || person.episode_count || 0)
            });
        });
    });

    return rows.sort((a,b)=>{
        const jobDiff = String(a.job || "").localeCompare(String(b.job || ""));
        if(jobDiff){ return jobDiff; }
        const episodeDiff = Number(b.episode_count || 0) - Number(a.episode_count || 0);
        return episodeDiff || String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function normalizeTMDBExternalIds(details){
    const ids = details && details.external_ids ? details.external_ids : details;

    return {
        imdb_id:ids && ids.imdb_id ? String(ids.imdb_id) : "",
        tvdb_id:ids && ids.tvdb_id ? String(ids.tvdb_id) : ""
    };
}

function normalizeActorCharacter(value){
    const text = String(value || "").trim();
    return text || "Unknown Role";
}

function normalizeAggregateCastMember(person){
    if(!person || !person.name){
        return null;
    }

    const roles = Array.isArray(person.roles) ? person.roles : [];
    const characters = roles
    .map(role=>normalizeActorCharacter(role && role.character))
    .filter(Boolean);

    const uniqueCharacters = Array.from(new Set(characters)).slice(0,3);
    const episodeCount = Number(
        person.total_episode_count ||
        roles.reduce((total,role)=>total + Number(role && role.episode_count || 0),0) ||
        person.episode_count ||
        0
    );

    return {
        id:Number(person.id || 0),
        name:String(person.name || "").trim(),
        character:uniqueCharacters.length ? uniqueCharacters.join(" / ") : normalizeActorCharacter(person.character),
        profile_path:person.profile_path || "",
        episode_count:episodeCount,
        order:Number.isFinite(Number(person.order)) ? Number(person.order) : 9999
    };
}

function normalizeTMDBAggregateCast(aggregateCredits){
    const cast = aggregateCredits && Array.isArray(aggregateCredits.cast) ? aggregateCredits.cast : [];

    return cast
    .map(normalizeAggregateCastMember)
    .filter(Boolean)
    .sort((a,b)=>{
        if(a.order !== b.order){
            return a.order - b.order;
        }
        return Number(b.episode_count || 0) - Number(a.episode_count || 0);
    })
    .slice(0,12);
}

function normalizeEpisodeActorMember(person){
    if(!person || !person.name){
        return null;
    }

    return {
        id:Number(person.id || 0),
        name:String(person.name || "").trim(),
        character:normalizeActorCharacter(person.character),
        profile_path:person.profile_path || "",
        order:Number.isFinite(Number(person.order)) ? Number(person.order) : 9999
    };
}

function getEpisodeActorIdentity(actor){
    if(!actor){
        return "";
    }
    return actor.id ? String(actor.id) : String(actor.name || "").trim().toLowerCase();
}

function normalizeTMDBEpisodeCreditList(people){
    const seen = new Set();

    return (Array.isArray(people) ? people : [])
    .map(normalizeEpisodeActorMember)
    .filter(actor=>{
        if(!actor){
            return false;
        }
        const key = getEpisodeActorIdentity(actor);
        if(!key || seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    })
    .sort((a,b)=>a.order - b.order);
}

function normalizeTMDBEpisodeCreditGroups(credits){
    const guestStars = normalizeTMDBEpisodeCreditList(credits && credits.guest_stars);
    const guestKeys = new Set(guestStars.map(getEpisodeActorIdentity).filter(Boolean));
    const cast = normalizeTMDBEpisodeCreditList(credits && credits.cast)
    .filter(actor=>!guestKeys.has(getEpisodeActorIdentity(actor)));

    return {
        guest_stars:guestStars,
        cast:cast
    };
}

function normalizeTMDBEpisodeActors(credits){
    const groups = normalizeTMDBEpisodeCreditGroups(credits);
    return groups.guest_stars.concat(groups.cast);
}


function normalizeTMDBEpisodeExternalIds(details){
    const ids = details && details.external_ids ? details.external_ids : details;

    return {
        imdb_id:ids && ids.imdb_id ? String(ids.imdb_id) : "",
        tvdb_id:ids && ids.tvdb_id ? String(ids.tvdb_id) : ""
    };
}

function normalizeV2EpisodeDetails(details){
    if(!details || typeof details !== "object"){
        return null;
    }

    return {
        episode_number:Number(details.episode_number || 0),
        season_number:Number(details.season_number || 0),
        name:details.name || "",
        overview:details.overview || "",
        air_date:details.air_date || "",
        runtime:details.runtime || null,
        still_path:details.still_path || "",
        vote_average:Number(details.vote_average || 0),
        vote_count:Number(details.vote_count || 0),
        external_ids:normalizeTMDBEpisodeExternalIds(details),
        loaded_at:new Date().toISOString()
    };
}

function mergeV2EpisodeDetails(show,seasonNumber,episodeNumber,details){
    if(!show || !details){
        return false;
    }

    const key = getEpisodeActorCreditsKey(seasonNumber,episodeNumber);
    const normalized = normalizeV2EpisodeDetails(details);

    if(!normalized){
        return false;
    }

    if(!show._episode_v2_details || typeof show._episode_v2_details !== "object"){
        show._episode_v2_details = {};
    }

    if(!show._episode_details || typeof show._episode_details !== "object"){
        show._episode_details = {};
    }

    const existing = show._episode_details[key] || {};

    show._episode_details[key] = {
        ...existing,
        name:normalized.name || existing.name || "",
        air_date:normalized.air_date || existing.air_date || "",
        runtime:normalized.runtime || existing.runtime || null,
        still_path:normalized.still_path || existing.still_path || "",
        overview:normalized.overview || existing.overview || "",
        vote_average:Number(normalized.vote_average || existing.vote_average || 0),
        vote_count:Number(normalized.vote_count || existing.vote_count || 0),
        external_ids:normalized.external_ids,
        air_time:existing.air_time || "",
        air_timestamp:existing.air_timestamp || "",
        _v2_episode_loaded_at:normalized.loaded_at
    };

    if(show._episode_list && Array.isArray(show._episode_list[String(seasonNumber)])){
        show._episode_list[String(seasonNumber)] = show._episode_list[String(seasonNumber)].map(ep=>{
            if(Number(ep.episode_number) !== Number(episodeNumber)){
                return ep;
            }

            return {
                ...ep,
                name:normalized.name || ep.name || "",
                air_date:normalized.air_date || ep.air_date || "",
                runtime:normalized.runtime || ep.runtime || null,
                still_path:normalized.still_path || ep.still_path || "",
                overview:normalized.overview || ep.overview || "",
                vote_average:Number(normalized.vote_average || ep.vote_average || 0),
                vote_count:Number(normalized.vote_count || ep.vote_count || 0),
                external_ids:normalized.external_ids,
                _v2_episode_loaded_at:normalized.loaded_at
            };
        });
    }

    show._episode_v2_details[key] = normalized;

    if(details.credits && typeof details.credits === "object"){
        if(!show._episode_actor_credits || typeof show._episode_actor_credits !== "object"){
            show._episode_actor_credits = {};
        }
        if(!show._episode_guest_stars || typeof show._episode_guest_stars !== "object"){
            show._episode_guest_stars = {};
        }
        if(!show._episode_cast_credits || typeof show._episode_cast_credits !== "object"){
            show._episode_cast_credits = {};
        }

        const creditGroups = normalizeTMDBEpisodeCreditGroups(details.credits);
        show._episode_guest_stars[key] = creditGroups.guest_stars;
        show._episode_cast_credits[key] = creditGroups.cast;
        show._episode_actor_credits[key] = creditGroups.guest_stars.concat(creditGroups.cast);
    }

    return true;
}

function getEpisodeActorCreditsKey(seasonNumber,episodeNumber){
    return `${Number(seasonNumber)}-${Number(episodeNumber)}`;
}

function getV2EpisodeDetailCacheKey(showId,seasonNumber,episodeNumber){
    return [
        String(showId || "").trim(),
        String(Number(seasonNumber)),
        String(Number(episodeNumber))
    ].join(":");
}

function readCachedV2EpisodeDetails(showId,seasonNumber,episodeNumber){
    if(typeof sessionStorage === "undefined"){
        return null;
    }

    const key = getV2EpisodeDetailCacheKey(showId,seasonNumber,episodeNumber);

    if(!key || key.indexOf("::") === 0){
        return null;
    }

    try{
        const raw = sessionStorage.getItem(V2_EPISODE_DETAIL_CACHE_PREFIX + key);

        if(!raw){
            return null;
        }

        const cached = JSON.parse(raw);

        if(!cached || !cached.data || Date.now() - Number(cached.savedAt || 0) > V2_EPISODE_DETAIL_CACHE_TTL){
            sessionStorage.removeItem(V2_EPISODE_DETAIL_CACHE_PREFIX + key);
            return null;
        }

        return cached.data;
    }catch(error){
        return null;
    }
}

function writeCachedV2EpisodeDetails(showId,seasonNumber,episodeNumber,details){
    if(typeof sessionStorage === "undefined" || !details){
        return;
    }

    const key = getV2EpisodeDetailCacheKey(showId,seasonNumber,episodeNumber);

    if(!key || key.indexOf("::") === 0){
        return;
    }

    try{
        sessionStorage.setItem(
            V2_EPISODE_DETAIL_CACHE_PREFIX + key,
            JSON.stringify({savedAt:Date.now(),data:details})
        );
    }catch(error){}
}

function hasLoadedV2EpisodeDetails(show,seasonNumber,episodeNumber){
    if(!show || !show._episode_v2_details){
        return false;
    }

    const key = getEpisodeActorCreditsKey(seasonNumber,episodeNumber);
    const hasDetails = !!show._episode_v2_details[key];
    const hasGuestStars = !!(show._episode_guest_stars && Array.isArray(show._episode_guest_stars[key]));
    const hasCast = !!(show._episode_cast_credits && Array.isArray(show._episode_cast_credits[key]));

    return hasDetails && hasGuestStars && hasCast;
}

function applyV2TMDBDetails(show,details){
    if(!show || !details){
        return show;
    }

    show.original_name = details.original_name || show.original_name || "";
    show.type = details.type || show.type || "";
    show.last_air_date = details.last_air_date || show.last_air_date || "";
    show.episode_run_time = Array.isArray(details.episode_run_time) ? details.episode_run_time : (Array.isArray(show.episode_run_time) ? show.episode_run_time : []);
    show.homepage = details.homepage || show.homepage || "";
    show.tagline = details.tagline || show.tagline || "";
    show.original_language = details.original_language || show.original_language || "";
    show.origin_country = Array.isArray(details.origin_country) ? details.origin_country.slice(0,4) : (Array.isArray(show.origin_country) ? show.origin_country : []);
    show.spoken_languages = normalizeSpokenLanguages(details).length ? normalizeSpokenLanguages(details) : (Array.isArray(show.spoken_languages) ? show.spoken_languages : []);
    show.created_by = normalizeCreatedBy(details).length ? normalizeCreatedBy(details) : (Array.isArray(show.created_by) ? show.created_by : []);
    show.created_by_people = Array.isArray(details.created_by) ? details.created_by.map(person=>({id:Number(person && person.id || 0),name:String(person && person.name || "").trim()})).filter(person=>person.id && person.name).slice(0,5) : (Array.isArray(show.created_by_people) ? show.created_by_people : []);
    show.popularity = Number(details.popularity || show.popularity || 0);
    show.in_production = typeof details.in_production === "boolean" ? details.in_production : show.in_production === true;
    show._tmdb_production_companies = Array.isArray(details.production_companies) ? details.production_companies : (Array.isArray(show._tmdb_production_companies) ? show._tmdb_production_companies : []);
    show.content_rating = pickUSContentRating(details.content_ratings) || show.content_rating || "";
    show._tmdb_content_ratings = normalizeTMDBContentRatings(details.content_ratings);
    show._tmdb_alternative_titles = normalizeTMDBAlternativeTitles(details.alternative_titles);
    show._tmdb_external_ids = normalizeTMDBExternalIds(details);
    show._tmdb_videos = normalizeTMDBVideos(details.videos);
    const normalizedKeywords = normalizeTMDBKeywords(details.keywords);
    if(normalizedKeywords.length || !Array.isArray(show._tmdb_keywords)){
        show._tmdb_keywords = normalizedKeywords;
    }
    if(normalizedKeywords.length){
        show._v2_keywords_loaded_at = new Date().toISOString();
        if(normalizedKeywords.some(keyword=>keyword && Number(keyword.id || 0) > 0)){
            show._v2_keyword_ids_loaded_at = new Date().toISOString();
        }
    }
    show._tmdb_watch_providers = details["watch/providers"] || show._tmdb_watch_providers || null;
    show._tmdb_similar = normalizeTMDBSimilarShows(details.similar,10);
    show._tmdb_cast = normalizeTMDBAggregateCast(details.aggregate_credits);
    show._tmdb_crew = normalizeTMDBAggregateCrew(details.aggregate_credits);
    show._v2_cast_loaded_at = new Date().toISOString();
    show._v2_bundle7_loaded_at = new Date().toISOString();
    show._v2_bundle7_2_loaded_at = new Date().toISOString();
    if(!show._episode_actor_credits || typeof show._episode_actor_credits !== "object"){
        show._episode_actor_credits = {};
    }
    if(!show._episode_guest_stars || typeof show._episode_guest_stars !== "object"){
        show._episode_guest_stars = {};
    }
    if(!show._episode_cast_credits || typeof show._episode_cast_credits !== "object"){
        show._episode_cast_credits = {};
    }
    show._v2_api_loaded_at = new Date().toISOString();

    return show;
}

function showHasV2APIDetails(show){
    if(!show){
        return false;
    }

    if(
        Array.isArray(show.created_by) &&
        show.created_by.length > 0 &&
        (!Array.isArray(show.created_by_people) || show.created_by_people.length === 0)
    ){
        return false;
    }

    if(!show._v2_cast_loaded_at || !show._v2_bundle7_loaded_at || !show._v2_bundle7_2_loaded_at){
        return false;
    }

    return !!(
        show._v2_api_loaded_at ||
        show.content_rating ||
        (show._tmdb_external_ids && (show._tmdb_external_ids.imdb_id || show._tmdb_external_ids.tvdb_id)) ||
        (Array.isArray(show._tmdb_videos) && show._tmdb_videos.length) ||
        (show._tmdb_watch_providers && show._tmdb_watch_providers.results) ||
        (Array.isArray(show._tmdb_similar) && show._tmdb_similar.length) ||
        (Array.isArray(show._tmdb_cast) && show._tmdb_cast.length)
    );
}

async function ensureShowV2APIDetails(show,{skipSave=false}={}){
    if(!show || !canUseTMDBShow(show)){
        return false;
    }

    if(showHasV2APIDetails(show)){
        return false;
    }

    const details = await tmdbGetShowDetails(show.tmdb_id);

    if(!details){
        return false;
    }

    show.title = details.name || show.title || "";
    show.poster_path = details.poster_path || show.poster_path || "";
    show.backdrop_path = details.backdrop_path || show.backdrop_path || "";
    show.overview = details.overview || show.overview || "";
    show.first_air_date = details.first_air_date || show.first_air_date || "";
    show.genres = (details.genres || []).map(genre=>genre.name);
    show.networks = normalizeTMDBNetworks(details);
    show._network_metadata_version = 1;
    show.tmdb_status = details.status || show.tmdb_status || "";
    show.tmdb_rating = details.vote_average || show.tmdb_rating || 0;
    show.tmdb_vote_count = details.vote_count || show.tmdb_vote_count || 0;
    show.number_of_seasons = details.number_of_seasons || show.number_of_seasons || 0;
    show.number_of_episodes = details.number_of_episodes || show.number_of_episodes || 0;
    show.next_episode_to_air = details.next_episode_to_air || null;
    show.last_episode_to_air = details.last_episode_to_air || null;
    applyV2TMDBDetails(show,details);
    syncNextEpisodeFromTMDB(show);
    show.last_tmdb_refresh = new Date().toISOString();

    if(!skipSave){
        await saveData({showIds:[String(show.tmdb_id)]});
    }

    return true;
}

async function ensureShowV2Keywords(show,{skipSave=false}={}){
    if(!show || !canUseTMDBShow(show)){
        return false;
    }

    const existingKeywords = Array.isArray(show._tmdb_keywords) ? show._tmdb_keywords : [];
    const hasClickableKeywords = existingKeywords.some(keyword=>keyword && typeof keyword === "object" && Number(keyword.id || 0) > 0 && keyword.name);

    if(hasClickableKeywords){
        return false;
    }

    if(show._v2_keyword_ids_loaded_at){
        return false;
    }

    if(typeof tmdbGetShowKeywords !== "function"){
        return false;
    }

    const payload = await tmdbGetShowKeywords(show.tmdb_id);
    show._tmdb_keywords = normalizeTMDBKeywords(payload);
    show._v2_keywords_loaded_at = new Date().toISOString();
    show._v2_keyword_ids_loaded_at = new Date().toISOString();

    if(!skipSave){
        await saveData({showIds:[String(show.tmdb_id)]});
    }

    return true;
}

async function refreshOpenShowV2Details(showId){
    const id = String(showId || "");
    const show = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;

    if(!show){
        return;
    }

    try{
        const changed = await ensureShowV2APIDetails(show);
        const keywordsChanged = await ensureShowV2Keywords(show);
        if((changed || keywordsChanged) && selectedShowId === id && selectedEpisodeContext === null){
            renderShowDetailsPagePreservingScroll(show);
        }
    }catch(error){
        if(selectedShowId === id){
            showToast(error && error.message ? error.message : "Could not load extra show info");
        }
    }
}

async function ensureEpisodeActorCredits(show,seasonNumber,episodeNumber,{skipSave=false}={}){
    return await ensureEpisodeV2Details(show,seasonNumber,episodeNumber,{skipSave});
}

async function ensureEpisodeV2Details(show,seasonNumber,episodeNumber,{skipSave=false}={}){
    if(!show || !canUseTMDBShow(show)){
        return false;
    }

    if(!show._episode_actor_credits || typeof show._episode_actor_credits !== "object"){
        show._episode_actor_credits = {};
    }

    if(!show._episode_guest_stars || typeof show._episode_guest_stars !== "object"){
        show._episode_guest_stars = {};
    }

    if(!show._episode_cast_credits || typeof show._episode_cast_credits !== "object"){
        show._episode_cast_credits = {};
    }

    if(!show._episode_v2_details || typeof show._episode_v2_details !== "object"){
        show._episode_v2_details = {};
    }

    const key = getEpisodeActorCreditsKey(seasonNumber,episodeNumber);

    if(hasLoadedV2EpisodeDetails(show,seasonNumber,episodeNumber)){
        return false;
    }

    const loadKey = getV2EpisodeDetailCacheKey(show.tmdb_id,seasonNumber,episodeNumber);

    if(v2EpisodeDetailPendingLoads.has(loadKey)){
        return await v2EpisodeDetailPendingLoads.get(loadKey);
    }

    const cachedDetails = readCachedV2EpisodeDetails(show.tmdb_id,seasonNumber,episodeNumber);

    if(cachedDetails){
        const changedFromCache = mergeV2EpisodeDetails(show,seasonNumber,episodeNumber,cachedDetails);

        if(changedFromCache && !skipSave && DATA.shows && DATA.shows[String(show.tmdb_id)]){
            await saveData({showIds:[String(show.tmdb_id)]});
        }

        return changedFromCache;
    }

    const loadPromise = (async()=>{
        const details = await tmdbGetEpisodeDetails(show.tmdb_id,seasonNumber,episodeNumber);
        writeCachedV2EpisodeDetails(show.tmdb_id,seasonNumber,episodeNumber,details);

        const changed = mergeV2EpisodeDetails(show,seasonNumber,episodeNumber,details);

        if(changed && !skipSave && DATA.shows && DATA.shows[String(show.tmdb_id)]){
            await saveData({showIds:[String(show.tmdb_id)]});
        }

        return changed;
    })();

    v2EpisodeDetailPendingLoads.set(loadKey,loadPromise);

    try{
        return await loadPromise;
    }finally{
        v2EpisodeDetailPendingLoads.delete(loadKey);
    }
}

function prefetchEpisodeV2Details(showId,seasonNumber,episodeNumber,options={}){
    const id = String(showId || "");
    const show = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;

    if(!show || hasLoadedV2EpisodeDetails(show,seasonNumber,episodeNumber)){
        return;
    }

    ensureEpisodeV2Details(show,seasonNumber,episodeNumber,{
        skipSave:!!(options && options.discoverPreview)
    }).catch(()=>{});
}

async function waitBrieflyForEpisodeV2Details(loadPromise,maxWait=450){
    if(!loadPromise || typeof loadPromise.then !== "function"){
        return false;
    }

    try{
        return await Promise.race([
            loadPromise.then(()=>true).catch(()=>false),
            new Promise(resolve=>setTimeout(()=>resolve(false),maxWait))
        ]);
    }catch(error){
        return false;
    }
}

function isStillSelectedEpisode(show,seasonNumber,episodeNumber){
    return !!(
        selectedEpisodeContext &&
        String(selectedEpisodeContext.showId) === String(show && show.tmdb_id) &&
        Number(selectedEpisodeContext.season) === Number(seasonNumber) &&
        Number(selectedEpisodeContext.episode) === Number(episodeNumber)
    );
}

async function refreshOpenEpisodeActors(show,seasonNumber,episodeNumber,context={}){
    try{
        const changed = await ensureEpisodeV2Details(show,seasonNumber,episodeNumber,{
            skipSave:!!(context && context.discoverPreview)
        });

        if(changed && isStillSelectedEpisode(show,seasonNumber,episodeNumber)){
            renderEpisodeModal(show,seasonNumber,episodeNumber,selectedEpisodeContext);
        }
    }catch(error){
        if(isStillSelectedEpisode(show,seasonNumber,episodeNumber)){
            showToast(error && error.message ? error.message : "Could not load episode details");
        }
    }
}


function createShowObject(details,status){

    const showObject = {
        tmdb_id:details.id,
        title:details.name,
        original_name:details.original_name || "",
        poster_path:details.poster_path,
        backdrop_path:details.backdrop_path,
        overview:details.overview || "",
        first_air_date:details.first_air_date || "",
        last_air_date:details.last_air_date || "",
        episode_run_time:Array.isArray(details.episode_run_time) ? details.episode_run_time : [],
        genres:(details.genres || []).map(genre=>genre.name),
        genre_items:(details.genres || []).map(genre=>({id:Number(genre.id || 0),name:String(genre.name || "")})).filter(genre=>genre.id && genre.name),
        networks:normalizeTMDBNetworks(details),
        _network_metadata_version:1,
        status:status,
        tmdb_status:details.status || "",
        tmdb_rating:details.vote_average || 0,
        tmdb_vote_count:details.vote_count || 0,
        rating:0,
        episodes_watched:{},
        notes:"",
        last_watched:"",
        last_activity_at:"",
        date_added:new Date().toISOString(),
        number_of_seasons:details.number_of_seasons || 0,
        number_of_episodes:details.number_of_episodes || 0,
        next_episode_to_air:details.next_episode_to_air || null,
        last_episode_to_air:details.last_episode_to_air || null,
        was_unreleased_when_added:false,
        completed_at:"",
        _season_episodes:{},
        _episode_details:{},
        _episode_list:{},
        _tmdb_external_ids:null,
        _tmdb_videos:[],
        _tmdb_keywords:[],
        _tmdb_similar:[],
        _tmdb_content_ratings:[],
        _tmdb_alternative_titles:[],
        _tmdb_watch_providers:null,
        _tmdb_production_companies:[],
        created_by_people:[],
        _tmdb_cast:[],
        _tmdb_crew:[],
        _v2_cast_loaded_at:"",
        _v2_bundle7_loaded_at:"",
        _v2_bundle7_2_loaded_at:"",
        _episode_actor_credits:{},
        _episode_guest_stars:{},
        _episode_cast_credits:{},
        _episode_v2_details:{}
    };

    applyV2TMDBDetails(showObject,details);
    return showObject;

}





async function openDiscoverShowModal(searchShow){
    if(!searchShow || !searchShow.id){
        return;
    }

    await openShowDetailsPage(searchShow.id,{
        showName:searchShow.name || searchShow.title || searchShow.original_name || ""
    });
}

async function loadDiscoverPreviewSeason(show,seasonNumber){
    if(!show || !canUseTMDBShow(show)){
        return;
    }

    const previewId = String(show.tmdb_id);

    try{
        await ensureSeasonLoaded(show,seasonNumber,false,{skipSave:true});

        if(
            discoverPreviewShow &&
            String(discoverPreviewShow.tmdb_id) === previewId
        ){
            renderDiscoverShowModalPreservingScroll(show);
        }
    }catch(error){
        if(
            discoverPreviewShow &&
            String(discoverPreviewShow.tmdb_id) === previewId
        ){
            showToast("Could not load that season");
            renderDiscoverShowModalPreservingScroll(show);
        }
    }
}

async function toggleDiscoverPreviewSeason(show,seasonNumber){
    if(!show || !Number.isFinite(Number(seasonNumber))){
        return;
    }

    const previewKey = "discover-" + String(show.tmdb_id || "preview");

    if(!expandedSeasons[previewKey]){
        expandedSeasons[previewKey] = {};
    }

    const key = String(seasonNumber);
    const willOpen = !expandedSeasons[previewKey][key];
    expandedSeasons[previewKey][key] = willOpen;
    renderDiscoverShowModalPreservingScroll(show);

    if(willOpen && !seasonDataAlreadyLoaded(show,seasonNumber,false)){
        await loadDiscoverPreviewSeason(show,seasonNumber);
    }
}



async function addDiscoverPreviewShow(status){

    if(!discoverPreviewShow){
        return;
    }

    try{

        const showObject = discoverPreviewShow;

        await savePreparedShow(showObject,status);

    }catch(error){

        showToast(error.message || "Network error");

    }

}



async function addDiscoverSeasonAsWatched(showId,season){
    const show = discoverPreviewShow;
    const seasonNumber = Number(season);

    if(
        !show ||
        String(show.tmdb_id) !== String(showId) ||
        !Number.isFinite(seasonNumber)
    ){
        return;
    }

    try{
        await ensureSeasonLoaded(show,seasonNumber,false,{skipSave:true});

        const newlyMarkedEpisodes = getAiredUnwatchedEpisodesInSeason(
            show,
            seasonNumber
        );

        if(newlyMarkedEpisodes.length === 0){
            showToast("No aired episodes to log");
            return;
        }

        show.status = "watching";
        show.was_unreleased_when_added = false;
        show.completed_at = "";
        DATA.shows[String(show.tmdb_id)] = show;

        markEpisodesWatchedInSeason(show,seasonNumber,newlyMarkedEpisodes);
        const addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);
        await autoCompleteShowAfterLogging(show);

        discoverPreviewShow = null;
        selectedShowId = String(show.tmdb_id);
        selectedEpisodeContext = null;
        expandedSeasons[selectedShowId] = {[String(seasonNumber)]:true};

        refreshAfterLocalShowChange(show.tmdb_id,true);
        renderShowModalPreservingScroll(show);
        showToast(
            "Marked " + newlyMarkedEpisodes.length +
            (newlyMarkedEpisodes.length === 1 ? " episode" : " episodes") +
            " watched in Season " + seasonNumber
        );

        await waitForNextPaint();
        await saveShowMutation(show.tmdb_id,addedEntries,[]);
    }catch(error){
        showToast(error.message || "Could not log season");
    }
}


async function addDiscoverEpisodeAsWatched(showId,season,episode){
    const show = discoverPreviewShow;
    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);

    if(
        !show ||
        String(show.tmdb_id) !== String(showId) ||
        !Number.isFinite(seasonNumber) ||
        !Number.isFinite(episodeNumber)
    ){
        return;
    }

    try{
        for(let seasonToLoad = 1; seasonToLoad <= seasonNumber; seasonToLoad++){
            await ensureSeasonLoaded(show,seasonToLoad,false,{skipSave:true});
        }

        const episodeData = getEpisodeData(show,seasonNumber,episodeNumber);

        if(!isEpisodeAired(episodeData.air_date,episodeData,show)){
            showToast("This episode has not aired yet");
            return;
        }

        const newlyMarkedEpisodes = await getEpisodesToBeMarked(
            show,
            seasonNumber,
            episodeNumber
        );

        show.status = "watching";
        show.was_unreleased_when_added = false;
        show.completed_at = "";
        DATA.shows[String(show.tmdb_id)] = show;

        markEpAndPrevious(show.tmdb_id,seasonNumber,episodeNumber);
        const addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);
        await autoCompleteShowAfterLogging(show);

        discoverPreviewShow = null;
        selectedShowId = String(show.tmdb_id);
        selectedEpisodeContext = null;
        expandedSeasons[selectedShowId] = {[String(seasonNumber)]:true};

        refreshAfterLocalShowChange(show.tmdb_id,true);
        renderShowModalPreservingScroll(show);
        showToast(
            newlyMarkedEpisodes.length > 0
            ? getWatchedMessage(show,newlyMarkedEpisodes)
            : show.title + " added to Watching"
        );

        await waitForNextPaint();
        await saveShowMutation(show.tmdb_id,addedEntries,[]);
    }catch(error){
        showToast(error.message || "Could not add and mark episode");
    }
}


async function handleAddShowClick(searchShow){

    try{

        if(DATA.shows[String(searchShow.id)]){

            showToast("Already added");
            return;

        }
        const details = await tmdbGetShowDetails(searchShow.id);
        const showObject = createShowObject(details,"plan");
        await loadSeasonData(showObject,1);

        const released = hasAnyAiredEpisode(showObject);

        if(!released){

            showObject.was_unreleased_when_added = true;

            await savePreparedShow(showObject,"plan");

            return;

        }

        pendingShow = showObject;

        openStatusPopup(showObject);

    }catch(error){

        showToast(error.message || "Network error");

    }

}





async function savePreparedShow(showObject,status){

    const released = hasAnyAiredEpisode(showObject);

    showObject.was_unreleased_when_added = !released;

    showObject.status = normalizeStatusForShow(showObject,status);

    let completedHistoryEntries = [];

    if(showObject.status === "finished"){
        completedHistoryEntries = await completeShow(showObject);
    }else{
        showObject.completed_at = "";
    }

    DATA.shows[String(showObject.tmdb_id)] = showObject;

    refreshAfterLocalShowChange(
        showObject.tmdb_id,
        completedHistoryEntries.length > 0
    );
    await waitForNextPaint();
    await saveShowMutation(showObject.tmdb_id,completedHistoryEntries,[]);

    closeStatusPopup();

    if(
        discoverPreviewShow &&
        String(discoverPreviewShow.tmdb_id) === String(showObject.tmdb_id)
    ){
        discoverPreviewShow = null;
        closeShowModal();
    }

    if(showObject.status === "plan" && !released){

        showToast(showObject.title + " added to Plan To Watch");

    }else{

        showToast(showObject.title + " added!");

    }

}





async function addShowDetailPreviewWithStatus(showId,status){
    const id = String(showId || "");
    const showObject = getShowForDetailPage(id);

    if(!showObject){
        showToast("Could not add show");
        return;
    }

    if(DATA.shows && DATA.shows[id]){
        await updateShowStatus(id,status);
        return;
    }

    try{
        await savePreparedShow(showObject,status);
        showObject._preview_only = false;
        showDetailPreview = null;
        selectedShowId = id;
        if(activePage === "show-detail"){
            const savedShow = DATA.shows[id] || showObject;
            renderShowDetailsPage(savedShow,{preview:false});
        }
    }catch(error){
        showToast(error && error.message ? error.message : "Could not add show");
    }
}

function hasAnyAiredEpisode(show){

    const episodeLists = show._episode_list || {};

    const seasonKeys = Object.keys(episodeLists);

    for(let i = 0; i < seasonKeys.length; i++){

        const seasonNumber = Number(seasonKeys[i]);

        if(!isMainSeasonNumber(seasonNumber)){
            continue;
        }

        const seasonList = episodeLists[seasonKeys[i]];

        if(!Array.isArray(seasonList)){
            continue;
        }

        for(let j = 0; j < seasonList.length; j++){

            const ep = seasonList[j];

            if(isEpisodeAired(ep.air_date,ep,show)){
                return true;
            }

        }

    }

    if(show.first_air_date && isEpisodeAired(show.first_air_date,null,show)){
        return true;
    }

    return false;

}





function hasLoadedEpisodeData(show){

    const episodeLists = show._episode_list || {};

    return Object.values(episodeLists).some(list=>{
        return Array.isArray(list) && list.length > 0;
    });

}



function isShowActuallyEnded(show){

    const status = String(show.tmdb_status || "").toLowerCase();

    return (
        status === "ended" ||
        status === "canceled" ||
        status === "cancelled"
    );

}





function isStatusAllowedForShow(show,status){

    const released = hasAnyAiredEpisode(show);

    if(!released){
        return status === "plan";
    }

    return true;

}




function normalizeStatusForShow(show,status){

    if(!isStatusAllowedForShow(show,status)){

        if(!hasAnyAiredEpisode(show)){
            return "plan";
        }

        return "watching";

    }

    return status;

}


function getSearchCacheKey(query){

    return String(query || "").trim().toLowerCase();

}



function cancelActiveSearchRequest(){

    if(currentSearchController){
        try{
            currentSearchController.abort();
        }catch(error){}
    }

    currentSearchController = null;

}



function normalizeSearchMediaType(media){
    const clean = String(media || "tv").trim().toLowerCase();
    return SEARCH_MEDIA_TYPES.has(clean) ? clean : "tv";
}


function normalizeNavContext(value){
    const clean = String(value || "").trim().toLowerCase();
    return ["shows","discover","profile","settings"].includes(clean) ? clean : "";
}

function getRouteNavContextMap(){
    try{
        const raw = sessionStorage.getItem(APP_ROUTE_NAV_CONTEXT_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }catch(error){
        return {};
    }
}

function setRouteNavContextMap(map){
    try{
        sessionStorage.setItem(APP_ROUTE_NAV_CONTEXT_KEY,JSON.stringify(map || {}));
    }catch(error){}
}

function normalizeContextRouteKey(route){
    const clean = String(route || "").trim();
    if(!clean){
        return "";
    }
    try{
        const parsed = new URL(clean,window.location.origin || "http://localhost");
        return parsed.pathname + parsed.search;
    }catch(error){
        return clean;
    }
}

function rememberRouteNavContext(route,context){
    const routeKey = normalizeContextRouteKey(route);
    const cleanContext = normalizeNavContext(context);
    if(!routeKey || !cleanContext){
        return;
    }
    const map = getRouteNavContextMap();
    map[routeKey] = cleanContext;
    const keys = Object.keys(map);
    if(keys.length > 80){
        keys.slice(0,keys.length - 80).forEach(key=>delete map[key]);
    }
    setRouteNavContextMap(map);
}

function getRememberedRouteNavContext(route){
    const routeKey = normalizeContextRouteKey(route);
    if(!routeKey){
        return "";
    }
    const map = getRouteNavContextMap();
    return normalizeNavContext(map[routeKey]);
}

function getCurrentPrimaryNavContext(){
    const active = document.querySelector(".app-primary-nav [data-page].active");
    return normalizeNavContext(active && active.dataset ? active.dataset.page : "");
}

function inferNavContextFromActivePage(defaultContext="shows"){
    const currentContext = getCurrentPrimaryNavContext();
    if(["show-detail","movie-detail","episode-detail","person-detail"].includes(activePage) && currentContext){
        return currentContext;
    }
    if(activePage === "profile"){
        return "profile";
    }
    if(activePage === "settings"){
        return "settings";
    }
    if(["discover","search","genre-detail","discovery-detail","person-detail","collections-index","collection-detail"].includes(activePage)){
        return "discover";
    }
    if(activePage === "shows" || activePage === "show-detail" || activePage === "movie-detail" || activePage === "episode-detail"){
        return "shows";
    }
    return normalizeNavContext(defaultContext) || "shows";
}

function getDetailNavContext(kind,options={},route=""){
    const explicit = normalizeNavContext(options && options.navigationContext);
    if(explicit){
        return explicit;
    }

    if(options && options.fromRoute === true){
        const remembered = getRememberedRouteNavContext(route || getCurrentAppRoute());
        if(remembered){
            return remembered;
        }
        return kind === "person" ? "discover" : "shows";
    }

    return inferNavContextFromActivePage(kind === "person" ? "discover" : "shows");
}

function getDiscoveryNavContext(options={},route=""){
    const explicit = normalizeNavContext(options && options.navigationContext);
    if(explicit){
        return explicit;
    }

    if(options && options.fromRoute === true){
        const remembered = getRememberedRouteNavContext(route || getCurrentAppRoute());
        if(remembered){
            return remembered;
        }
        return "discover";
    }

    return inferNavContextFromActivePage("discover");
}

function activatePrimaryNavContext(context){
    if(typeof setAppPrimaryNavActive === "function"){
        setAppPrimaryNavActive(normalizeNavContext(context) || "shows");
    }
}

function setSearchMediaType(media){
    const nextMedia = normalizeSearchMediaType(media);
    discoverSearchState.media = nextMedia;
    searchRouteState.media = nextMedia;

    const input = document.getElementById("search");
    const query = String(discoverSearchState.query || (input ? input.value : "") || "").trim();

    if(activePage === "search"){
        setAppHashRoute(getSearchRoute(query,nextMedia,searchRouteState),true);
    }

    if(query.length >= 2){
        searchShows(query,{skipRoute:activePage !== "search"});
    }else if(activePage === "discover"){
        if(typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
        loadDiscoverHub(false);
    }else{
        renderSearchIntro();
    }
}

function renderSearchIntro(){
    lastDiscoverSearchQuery = "";
    lastDiscoverSearchResults = [];
    discoverSearchState = Object.assign({},discoverSearchState,{
        query:"",
        media:normalizeSearchMediaType(discoverSearchState.media || searchRouteState.media || "tv"),
        page:1,
        totalPages:1,
        visibleLimit:SEARCH_RESULT_BATCH_SIZE,
        loading:false
    });
    if(typeof renderSearchResults === "function"){
        renderSearchResults([]);
    }
}

function renderSearchLoading(query){
    if(typeof renderSearchResults === "function"){
        renderSearchResults(lastDiscoverSearchResults || []);
    }
}

function renderSearchError(){
    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    results.innerHTML = `
        <div class="search-page-shell">
            <div class="empty-state search-empty-state">
                <h2>Search failed</h2>
                <p>Couldn’t load this page. Try again later.</p>
            </div>
        </div>
    `;
}

function normalizeSearchResultItem(item,forcedMediaType=""){
    if(!item || !item.id){
        return null;
    }
    const mediaType = normalizeSearchMediaType(forcedMediaType || item.media_type || "tv");
    const title = mediaType === "tv"
    ? (item.name || item.original_name || "Untitled")
    : mediaType === "movie"
    ? (item.title || item.original_title || "Untitled")
    : (item.name || "Unknown Person");
    const date = mediaType === "tv" ? (item.first_air_date || "") : (item.release_date || "");
    return {
        id:Number(item.id || 0),
        media_type:mediaType,
        name:title,
        title:title,
        poster_path:mediaType === "person" ? (item.profile_path || "") : (item.poster_path || ""),
        profile_path:item.profile_path || "",
        backdrop_path:item.backdrop_path || "",
        overview:item.overview || "",
        first_air_date:mediaType === "tv" ? date : "",
        release_date:mediaType === "movie" ? date : "",
        date:date,
        vote_average:Number(item.vote_average || 0),
        popularity:Number(item.popularity || 0),
        adult:mediaType === "movie" && item.adult === true,
        known_for_department:item.known_for_department || ""
    };
}

function getSearchEndpointForMedia(media){
    const cleanMedia = normalizeSearchMediaType(media);
    if(cleanMedia === "movie"){
        return "search/movie";
    }
    if(cleanMedia === "person"){
        return "search/person";
    }
    if(cleanMedia === "collection"){
        return "search/collection";
    }
    return "search/tv";
}

function normalizeSearchCollectionSummary(raw){
    const collection = normalizeTMDBCollectionSummary(raw);
    if(collection){
        collection.media_type = "collection";
        collection.original_name = String(raw && (raw.original_name || raw.original_title) || "").trim();
        return collection;
    }
    const id = normalizeCollectionId(raw && raw.id);
    const name = String(raw && (raw.name || raw.title || raw.original_name) || "").trim();
    if(!id || !name){
        return null;
    }
    return {
        id:Number(id),
        media_type:"collection",
        name,
        title:name,
        original_name:String(raw && (raw.original_name || raw.original_title) || "").trim(),
        overview:String(raw && raw.overview || ""),
        poster_path:String(raw && raw.poster_path || ""),
        backdrop_path:String(raw && raw.backdrop_path || ""),
        poster_paths:raw && raw.poster_path ? [String(raw.poster_path)] : [],
        poster_slots:raw && raw.poster_path ? [{poster_path:String(raw.poster_path),title:name,name,release_date:"",date:""}] : [],
        movie_count:Number(raw && raw.movie_count || 0),
        route:getCollectionDetailRoute(id,name)
    };
}

async function tmdbSearchCollectionSummariesPage(query,page=1,options={}){
    const cleanQuery = String(query || "").trim();
    const pageNumber = Math.max(1,Number(page || 1));
    if(!cleanQuery){
        return {results:[],page:1,total_pages:1,total_results:0};
    }
    const data = await tmdbFetchJSON("search/collection",{
        query:cleanQuery,
        page:pageNumber
    },options);
    const results = (Array.isArray(data && data.results) ? data.results : [])
    .map((raw,index)=>{
        const summary = normalizeSearchCollectionSummary(raw);
        if(!summary){ return null; }
        return Object.assign({},summary,{
            live_search_summary:true,
            tmdb_search_index:index
        });
    })
    .filter(Boolean);
    return {
        results,
        page:Number(data && data.page || pageNumber),
        total_pages:Number(data && data.total_pages || pageNumber || 1),
        total_results:Number(data && data.total_results || results.length || 0)
    };
}

async function tmdbSearchCollectionsPage(query,page=1,options={}){
    const cleanQuery = String(query || "").trim();
    const pageNumber = Math.max(1,Number(page || 1));
    if(!cleanQuery){
        return {results:[],page:1,total_pages:1,total_results:0};
    }
    const data = await tmdbFetchJSON("search/collection",{
        query:cleanQuery,
        page:pageNumber
    },options);
    const rawResults = Array.isArray(data && data.results) ? data.results : [];
    const summaryResults = rawResults.map(normalizeSearchCollectionSummary).filter(Boolean);
    const detailResults = await loadCollectionSummaries(summaryResults.map(item=>item.id),{limit:summaryResults.length});
    const results = mergeCollectionLists(detailResults,summaryResults)
    .filter(collection=>typeof isPromotableCollection === "function" ? isPromotableCollection(collection) : collection && collection.id && collection.name)
    .map(collection=>Object.assign({},collection,{media_type:"collection"}));
    return {
        results:results,
        page:Number(data.page || pageNumber),
        total_pages:Number(data.total_pages || pageNumber || 1),
        total_results:Number(data.total_results || results.length || 0)
    };
}

async function tmdbSearchMediaPage(query,media,page=1,options={}){
    const cleanQuery = String(query || "").trim();
    const cleanMedia = normalizeSearchMediaType(media);
    const pageNumber = Math.max(1,Number(page || 1));
    if(cleanMedia === "collection"){
        return tmdbSearchCollectionsPage(cleanQuery,pageNumber,options);
    }
    if(!cleanQuery){
        return {results:[],page:1,total_pages:1,total_results:0};
    }
    const data = await tmdbFetchJSON(getSearchEndpointForMedia(cleanMedia),{
        query:cleanQuery,
        include_adult:cleanMedia === "movie" ? "true" : "false",
        page:pageNumber
    },options);
    const results = (Array.isArray(data && data.results) ? data.results : [])
    .map(item=>normalizeSearchResultItem(item,cleanMedia))
    .filter(Boolean);
    return {
        results:results,
        page:Number(data.page || pageNumber),
        total_pages:Number(data.total_pages || pageNumber || 1),
        total_results:Number(data.total_results || results.length || 0)
    };
}

async function tmdbSearchMediaBatch(query,media,startPage=1,batchSize=SEARCH_RESULT_BATCH_SIZE,options={}){
    const cleanMedia = normalizeSearchMediaType(media);
    const seen = new Set();
    const results = [];
    let page = Math.max(1,Number(startPage || 1));
    let totalPages = page;
    let totalResults = 0;

    while(results.length < batchSize){
        const payload = await tmdbSearchMediaPage(query,cleanMedia,page,options);
        totalPages = Number(payload.total_pages || page || 1);
        totalResults = Number(payload.total_results || totalResults || 0);
        (payload.results || []).forEach(item=>{
            const key = item ? `${item.media_type}:${item.id}` : "";
            if(!item || !item.id || seen.has(key)){
                return;
            }
            seen.add(key);
            results.push(item);
        });
        if(page >= totalPages){
            break;
        }
        page += 1;
    }

    return {
        results:results,
        page:page,
        total_pages:totalPages,
        total_results:totalResults
    };
}

function showSearchPageShell(){
    activePage = "search";
    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });
    activatePrimaryNavContext("discover");
    const pageElement = document.getElementById("discover-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function openSearchPage(query="",options={}){
    const cleanQuery = String(query || "").trim();
    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const media = normalizeSearchMediaType(options && options.media || searchRouteState.media || discoverSearchState.media || "tv");
    const eyeState = createEyeFilterState(options && options.eyeState ? options.eyeState : searchRouteState || {});
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedPersonContext = null;
    selectedDiscoveryContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;
    searchRouteState.query = cleanQuery;
    searchRouteState.media = media;
    applyEyeFilterState(searchRouteState,eyeState);
    discoverSearchState = Object.assign({
        query:cleanQuery,
        media:media,
        page:1,
        totalPages:1,
        visibleLimit:SEARCH_RESULT_BATCH_SIZE,
        loading:false
    },eyeState);
    showSearchPageShell();
    const input = document.getElementById("search");
    if(input){
        input.value = cleanQuery;
        input.setAttribute("placeholder","Search shows, movies, people, collections");
    }
    if(!fromRoute){
        setAppHashRoute(getSearchRoute(cleanQuery,media,searchRouteState),replaceRoute);
    }
    searchShows(cleanQuery,{skipRoute:true});
}

function openDiscoverHomePage(options={}){
    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    cancelActiveSearchRequest();
    searchRequestId += 1;
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedPersonContext = null;
    selectedDiscoveryContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;
    searchRouteState.query = "";
    searchRouteState.media = "tv";
    applyEyeFilterState(searchRouteState,{});
    discoverSearchState = {query:"",media:normalizeSearchMediaType(discoverSearchState.media || "tv"),page:1,totalPages:1,visibleLimit:SEARCH_RESULT_BATCH_SIZE,loading:false};
    lastDiscoverSearchQuery = "";
    lastDiscoverSearchResults = [];
    const input = document.getElementById("search");
    if(input){
        input.value = "";
        input.setAttribute("placeholder","Search shows, movies, people, collections");
    }
    showPage("discover");
    if(!fromRoute){
        setAppHashRoute("/app/discover",replaceRoute);
    }
    if(typeof renderDiscoverHub === "function"){
        renderDiscoverHub();
    }
    ensureBrowseReferenceData(discoverGenreMedia || "tv").then(()=>{
        if(activePage === "discover" && shouldShowDiscoverHub() && typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
    }).catch(()=>{});
    loadDiscoverHub(false);
}

function shouldShowDiscoverHub(){
    const input = document.getElementById("search");
    const query = String(discoverSearchState && discoverSearchState.query || (input ? input.value : "") || "").trim();
    return activePage === "discover" && query.length < 2;
}

function getLocalDateKey(date){

    const value = date instanceof Date ? date : new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2,"0");
    const day = String(value.getDate()).padStart(2,"0");

    return year + "-" + month + "-" + day;

}

function readDiscoverHubCache(){

    try{

        const raw = sessionStorage.getItem(DISCOVER_HUB_CACHE_KEY);

        if(!raw){
            return null;
        }

        const cached = JSON.parse(raw);

        if(!cached || !Array.isArray(cached.sections)){
            return null;
        }

        if(Date.now() - Number(cached.savedAt || 0) > DISCOVER_HUB_CACHE_TTL){
            sessionStorage.removeItem(DISCOVER_HUB_CACHE_KEY);
            return null;
        }

        return {
            sections:cached.sections,
            genres:normalizeDiscoverGenreState(cached.genres),
            collections:Array.isArray(cached.collections) ? cached.collections : []
        };

    }catch(error){
        return null;
    }

}

function writeDiscoverHubCache(state){

    if(!state || !Array.isArray(state.sections)){
        return;
    }

    try{
        sessionStorage.setItem(
            DISCOVER_HUB_CACHE_KEY,
            JSON.stringify({
                savedAt:Date.now(),
                sections:state.sections,
                genres:normalizeDiscoverGenreState(state.genres),
                collections:Array.isArray(state.collections) ? state.collections : []
            })
        );
    }catch(error){}

}

async function tmdbGetDiscoverPage(path,params={}){

    const searchParams = new URLSearchParams();
    const pageNumber = Math.max(1,Number(params.page || 1));
    searchParams.set("page",String(pageNumber));

    Object.keys(params || {}).forEach(key=>{

        if(key === "page"){
            return;
        }

        if(params[key] !== undefined && params[key] !== null && params[key] !== ""){
            searchParams.set(key,String(params[key]));
        }

    });

    const response = await fetch(
        TMDB_API_BASE + "/" + path + "?" + searchParams.toString()
    );

    if(!response.ok){
        throw new Error("TMDB error: " + response.status);
    }

    const data = await response.json();

    return {
        results:data.results || [],
        page:Number(data.page || pageNumber),
        total_pages:Number(data.total_pages || pageNumber || 1),
        total_results:Number(data.total_results || 0),
        dates:data && data.dates && typeof data.dates === "object" ? {
            minimum:String(data.dates.minimum || ""),
            maximum:String(data.dates.maximum || "")
        } : null
    };

}

async function tmdbGetDiscoverList(path,params={}){
    const payload = await tmdbGetDiscoverPage(path,params);
    return payload.results || [];
}

const tmdbCollectionMemoryCache = new Map();
let tmdbCollectionIndexMemoryCache = null;

function normalizeCollectionId(value){
    const clean = String(value || "").trim();
    return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

function getCollectionDetailRoute(collectionId,label=""){
    const key = buildRouteKey(collectionId,label);
    return key && key.includes("-") ? "/app/collection/" + encodeURIComponent(key) : "/app/list/watching";
}

function readCachedTMDBCollectionDetails(collectionId){
    const id = normalizeCollectionId(collectionId);
    if(!id){ return null; }

    const memory = tmdbCollectionMemoryCache.get(id);
    if(memory && Date.now() - Number(memory.savedAt || 0) <= TMDB_COLLECTION_DETAIL_CACHE_TTL){
        return memory.collection;
    }
    if(memory){ tmdbCollectionMemoryCache.delete(id); }

    try{
        const raw = sessionStorage.getItem(TMDB_COLLECTION_DETAIL_CACHE_PREFIX + id);
        if(!raw){ return null; }
        const cached = JSON.parse(raw);
        if(!cached || !cached.collection || Date.now() - Number(cached.savedAt || 0) > TMDB_COLLECTION_DETAIL_CACHE_TTL){
            sessionStorage.removeItem(TMDB_COLLECTION_DETAIL_CACHE_PREFIX + id);
            return null;
        }
        tmdbCollectionMemoryCache.set(id,cached);
        return cached.collection;
    }catch(error){
        return null;
    }
}

function writeCachedTMDBCollectionDetails(collection){
    const id = normalizeCollectionId(collection && collection.id);
    if(!id){ return; }
    const cached = {savedAt:Date.now(),collection};
    tmdbCollectionMemoryCache.set(id,cached);
    try{
        sessionStorage.setItem(TMDB_COLLECTION_DETAIL_CACHE_PREFIX + id,JSON.stringify(cached));
    }catch(error){}
}

function normalizeCollectionGenreIds(value){
    const source = Array.isArray(value) ? value : [];
    const output = [];
    const seen = new Set();
    source.forEach(item=>{
        const id = normalizeCollectionId(item);
        if(!id || seen.has(id)){
            return;
        }
        seen.add(id);
        output.push(id);
    });
    return output;
}

function getCollectionPartReleaseYear(movie){
    const date = String(movie && (movie.release_date || movie.date) || "").trim();
    const match = date.match(/^(18|19|20|21)[0-9]{2}/);
    return match ? Number(match[0]) : 0;
}

function normalizeCollectionMoviePart(raw){
    const item = normalizeBrowseResultItem(raw,"movie");
    if(!item || !item.id){
        return null;
    }
    return Object.assign({},item,{
        media_type:"movie",
        genre_ids:normalizeCollectionGenreIds(raw && raw.genre_ids),
        original_language:normalizeLanguageCode(raw && raw.original_language || "")
    });
}

function computeCollectionMetadata(parts){
    const movies = Array.isArray(parts) ? parts : [];
    const genreIds = [];
    const genreSeen = new Set();
    const decades = [];
    const decadeSeen = new Set();
    const releaseYears = [];
    let popularityTotal = 0;
    let popularityCount = 0;
    let ratingTotal = 0;
    let ratingCount = 0;

    movies.forEach(movie=>{
        normalizeCollectionGenreIds(movie && movie.genre_ids).forEach(id=>{
            if(genreSeen.has(id)){ return; }
            genreSeen.add(id);
            genreIds.push(id);
        });

        const year = getCollectionPartReleaseYear(movie);
        if(year){
            releaseYears.push(year);
            const decade = String(Math.floor(year / 10) * 10);
            if(!decadeSeen.has(decade)){
                decadeSeen.add(decade);
                decades.push(decade);
            }
        }

        const popularity = Number(movie && movie.popularity || 0);
        if(Number.isFinite(popularity) && popularity > 0){
            popularityTotal += popularity;
            popularityCount += 1;
        }

        const rating = Number(movie && movie.vote_average || 0);
        if(Number.isFinite(rating) && rating > 0){
            ratingTotal += rating;
            ratingCount += 1;
        }
    });

    return {
        genre_ids:genreIds.sort((a,b)=>Number(a) - Number(b)),
        decades:decades.sort((a,b)=>Number(b) - Number(a)),
        average_popularity:popularityCount ? popularityTotal / popularityCount : 0,
        average_rating:ratingCount ? ratingTotal / ratingCount : 0,
        newest_release_year:releaseYears.length ? Math.max.apply(null,releaseYears) : 0,
        oldest_release_year:releaseYears.length ? Math.min.apply(null,releaseYears) : 0
    };
}

function normalizeCollectionPosterSlot(raw){
    if(!raw || typeof raw !== "object"){
        const posterPath = String(raw || "").trim();
        return posterPath ? {poster_path:posterPath,title:"",name:"",release_date:"",date:""} : null;
    }
    const title = String(raw.title || raw.name || raw.original_title || raw.original_name || "").trim();
    const date = String(raw.release_date || raw.date || raw.first_air_date || "").trim();
    return {
        poster_path:String(raw.poster_path || raw.path || "").trim(),
        title,
        name:title,
        release_date:date,
        date
    };
}

function getCollectionPosterSlots(collection){
    const slots = [];
    const push = raw=>{
        const slot = normalizeCollectionPosterSlot(raw);
        if(slot){ slots.push(slot); }
    };
    if(Array.isArray(collection && collection.poster_slots) && collection.poster_slots.length){
        collection.poster_slots.slice(0,3).forEach(push);
    }else if(Array.isArray(collection && collection.parts) && collection.parts.length){
        collection.parts.slice(0,3).forEach(push);
    }else if(Array.isArray(collection && collection.poster_paths) && collection.poster_paths.length){
        collection.poster_paths.slice(0,3).forEach(path=>push({poster_path:path,title:collection && (collection.name || collection.title) || ""}));
    }else if(collection && collection.poster_path){
        push({poster_path:collection.poster_path,title:collection.name || collection.title || ""});
    }
    return slots.slice(0,3);
}

function normalizeTMDBCollectionSummary(raw){
    const id = normalizeCollectionId(raw && raw.id);
    const name = String(raw && (raw.name || raw.title) || "").trim();
    if(!id || !name){
        return null;
    }
    const parts = (Array.isArray(raw && raw.parts) ? raw.parts : [])
    .map(normalizeCollectionMoviePart)
    .filter(Boolean);
    const rawSlots = Array.isArray(raw && raw.poster_slots) ? raw.poster_slots.map(normalizeCollectionPosterSlot).filter(Boolean) : [];
    const partSlots = parts.map(normalizeCollectionPosterSlot).filter(Boolean);
    const posterPaths = Array.isArray(raw && raw.poster_paths)
    ? raw.poster_paths.map(path=>String(path || "").trim()).filter(Boolean).slice(0,3)
    : [];
    if(!posterPaths.length && parts.length){
        parts.map(movie=>String(movie.poster_path || "").trim()).filter(Boolean).slice(0,3).forEach(path=>posterPaths.push(path));
    }
    if(!posterPaths.length && raw && raw.poster_path){
        posterPaths.push(String(raw.poster_path));
    }
    const fallbackSlots = posterPaths.map(path=>normalizeCollectionPosterSlot({poster_path:path,title:name})).filter(Boolean);
    const posterSlots = (rawSlots.length ? rawSlots : (partSlots.length ? partSlots : fallbackSlots)).slice(0,3);
    const computed = computeCollectionMetadata(parts);
    const collection = {
        id:Number(id),
        name,
        title:name,
        overview:String(raw && raw.overview || ""),
        poster_path:String(raw && raw.poster_path || ""),
        backdrop_path:String(raw && raw.backdrop_path || ""),
        poster_paths:posterPaths,
        poster_slots:posterSlots,
        movie_count:Number(raw && raw.movie_count || parts.length || 0),
        genre_ids:Array.isArray(raw && raw.genre_ids) ? normalizeCollectionGenreIds(raw.genre_ids) : computed.genre_ids,
        decades:Array.isArray(raw && raw.decades) ? raw.decades.map(normalizeCollectionsIndexDecade).filter(Boolean) : computed.decades,
        average_popularity:Number(raw && raw.average_popularity || computed.average_popularity || 0),
        average_rating:Number(raw && raw.average_rating || computed.average_rating || 0),
        newest_release_year:Number(raw && raw.newest_release_year || computed.newest_release_year || 0),
        oldest_release_year:Number(raw && raw.oldest_release_year || computed.oldest_release_year || 0),
        route:getCollectionDetailRoute(id,name)
    };
    if(parts.length){
        collection.parts = parts;
    }
    return collection.movie_count > 0 ? collection : null;
}

function getCollectionMovieCount(collection){
    return Number(collection && collection.movie_count || (Array.isArray(collection && collection.parts) ? collection.parts.length : 0) || 0);
}

function getCollectionPosterPaths(collection){
    const posters = Array.isArray(collection && collection.poster_paths) ? collection.poster_paths.filter(Boolean) : [];
    if(!posters.length && collection && collection.poster_path){
        posters.push(collection.poster_path);
    }
    return posters;
}

function isPromotableCollection(collection){
    return !!(collection && collection.id && collection.name && getCollectionMovieCount(collection) >= 2 && getCollectionPosterSlots(collection).length >= 1);
}

function normalizeTMDBCollectionDetails(raw){
    const collection = normalizeTMDBCollectionSummary(raw);
    if(!collection || !Array.isArray(collection.parts) || !collection.parts.length){
        return null;
    }
    return collection;
}

function readCachedTMDBCollectionIndex(){
    if(tmdbCollectionIndexMemoryCache && Date.now() - Number(tmdbCollectionIndexMemoryCache.savedAt || 0) <= TMDB_COLLECTION_INDEX_CACHE_TTL){
        return tmdbCollectionIndexMemoryCache.payload;
    }
    try{
        const raw = sessionStorage.getItem(TMDB_COLLECTION_INDEX_CACHE_KEY);
        if(!raw){ return null; }
        const cached = JSON.parse(raw);
        if(!cached || !cached.payload || Date.now() - Number(cached.savedAt || 0) > TMDB_COLLECTION_INDEX_CACHE_TTL){
            sessionStorage.removeItem(TMDB_COLLECTION_INDEX_CACHE_KEY);
            return null;
        }
        tmdbCollectionIndexMemoryCache = cached;
        return cached.payload;
    }catch(error){
        return null;
    }
}

function writeCachedTMDBCollectionIndex(payload){
    const cached = {savedAt:Date.now(),payload};
    tmdbCollectionIndexMemoryCache = cached;
    try{
        sessionStorage.setItem(TMDB_COLLECTION_INDEX_CACHE_KEY,JSON.stringify(cached));
    }catch(error){}
}

function normalizeTMDBCollectionIndexPayload(raw){
    const source = raw && typeof raw === "object" ? raw : {};
    return {
        collections:(Array.isArray(source.collections) ? source.collections : []).map(normalizeTMDBCollectionSummary).filter(Boolean),
        building:source.building === true,
        sourceDate:String(source.source_date || source.sourceDate || ""),
        indexedCount:Number(source.indexed_count || source.indexedCount || 0),
        totalIds:Number(source.total_ids || source.totalIds || 0),
        cursor:Number(source.cursor || 0)
    };
}

async function tmdbGetCollectionIndex(options={}){
    const force = options && options.force === true;
    const cached = force ? null : readCachedTMDBCollectionIndex();
    if(cached){
        return cached;
    }
    const response = await fetch("/api/tmdb/collections",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok){
        const requestError = new Error("Collections are temporarily unavailable.");
        requestError.status = response.status;
        throw requestError;
    }
    const payload = normalizeTMDBCollectionIndexPayload(await response.json());
    if(Array.isArray(payload.collections) && payload.collections.length){
        writeCachedTMDBCollectionIndex(payload);
    }else{
        tmdbCollectionIndexMemoryCache = null;
        try{ sessionStorage.removeItem(TMDB_COLLECTION_INDEX_CACHE_KEY); }catch(error){}
    }
    return payload;
}

async function loadCollectionSummaries(collectionIds,options={}){
    const ids = (Array.isArray(collectionIds) ? collectionIds : [])
    .map(normalizeCollectionId)
    .filter(Boolean);
    const limit = Math.max(0,Number(options && options.limit || 0));
    const sourceIds = limit ? ids.slice(0,limit) : ids;
    const output = [];
    const concurrency = Math.min(6,sourceIds.length || 1);
    let cursor = 0;

    async function worker(){
        while(cursor < sourceIds.length){
            const index = cursor;
            cursor += 1;
            try{
                const collection = await tmdbGetCollectionDetails(sourceIds[index]);
                if(collection){
                    output[index] = collection;
                }
            }catch(error){
                output[index] = null;
            }
        }
    }

    await Promise.all(Array.from({length:concurrency},worker));
    return output.filter(Boolean);
}

async function loadCuratedCollectionFallback(options={}){
    return loadCollectionSummaries(DISCOVER_COLLECTION_IDS,options);
}

function getCollectionSlotTargetCount(collection){
    return Math.min(3,Math.max(0,Number(collection && collection.movie_count || 0),Array.isArray(collection && collection.parts) ? collection.parts.length : 0));
}

function getCollectionPosterSlotCoverage(collection){
    const slots = getCollectionPosterSlots(collection);
    const target = getCollectionSlotTargetCount(collection) || slots.length;
    const titledSlots = slots.filter(slot=>String(slot && (slot.title || slot.name || slot.poster_path) || "").trim()).length;
    return {slots:slots.length,target,titledSlots};
}

function chooseRicherCollectionSummary(current,next){
    if(!current){ return next; }
    if(!next){ return current; }
    const currentCoverage = getCollectionPosterSlotCoverage(current);
    const nextCoverage = getCollectionPosterSlotCoverage(next);
    const currentParts = Array.isArray(current.parts) ? current.parts.length : 0;
    const nextParts = Array.isArray(next.parts) ? next.parts.length : 0;
    if(nextCoverage.slots > currentCoverage.slots){
        return Object.assign({},current,next);
    }
    if(nextCoverage.slots === currentCoverage.slots && nextCoverage.titledSlots > currentCoverage.titledSlots){
        return Object.assign({},current,next);
    }
    if(nextParts > currentParts){
        return Object.assign({},current,next);
    }
    return current;
}

function mergeCollectionLists(primary,secondary){
    const output = [];
    const indexById = new Map();
    [primary,secondary].forEach(list=>{
        (Array.isArray(list) ? list : []).forEach(collection=>{
            const id = normalizeCollectionId(collection && collection.id);
            if(!id){
                return;
            }
            if(indexById.has(id)){
                const index = indexById.get(id);
                output[index] = chooseRicherCollectionSummary(output[index],collection);
                return;
            }
            indexById.set(id,output.length);
            output.push(collection);
        });
    });
    return output;
}

function collectionNeedsPosterSlotHydration(collection){
    const target = getCollectionSlotTargetCount(collection);
    if(!target){
        return false;
    }
    const slots = getCollectionPosterSlots(collection);
    if(slots.length < target){
        return true;
    }
    return slots.slice(0,target).some(slot=>!String(slot && (slot.title || slot.name || slot.poster_path) || "").trim());
}

async function hydrateIncompleteCollectionSlots(collections,options={}){
    const list = (Array.isArray(collections) ? collections : []).slice();
    const limit = Math.max(0,Number(options && options.limit || list.length || 0));
    const candidates = list
    .map((collection,index)=>({collection,index}))
    .filter(item=>collectionNeedsPosterSlotHydration(item.collection))
    .slice(0,limit || undefined);
    if(!candidates.length){
        return list;
    }
    const concurrency = Math.min(4,candidates.length);
    let cursor = 0;

    async function worker(){
        while(cursor < candidates.length){
            const item = candidates[cursor];
            cursor += 1;
            const id = normalizeCollectionId(item && item.collection && item.collection.id);
            if(!id){
                continue;
            }
            try{
                const detail = await tmdbGetCollectionDetails(id);
                if(detail){
                    list[item.index] = chooseRicherCollectionSummary(item.collection,detail);
                }
            }catch(error){}
        }
    }

    await Promise.all(Array.from({length:concurrency},worker));
    return list;
}

function mergeHydratedCollectionsIntoList(collections,hydratedCollections){
    const byId = new Map();
    (Array.isArray(hydratedCollections) ? hydratedCollections : []).forEach(collection=>{
        const id = normalizeCollectionId(collection && collection.id);
        if(id){
            byId.set(id,collection);
        }
    });
    if(!byId.size){
        return Array.isArray(collections) ? collections : [];
    }
    return (Array.isArray(collections) ? collections : []).map(collection=>{
        const id = normalizeCollectionId(collection && collection.id);
        return byId.has(id) ? chooseRicherCollectionSummary(collection,byId.get(id)) : collection;
    });
}

async function hydrateVisibleCollectionsForIndex(){
    if(activePage !== "collections-index" || !collectionsPageState || collectionsPageState.loading){
        return;
    }
    const visible = Array.isArray(collectionsPageState.visibleCollections) ? collectionsPageState.visibleCollections : [];
    if(!visible.some(collectionNeedsPosterSlotHydration)){
        return;
    }
    const runId = ++collectionIndexHydrationRun;
    const hydratedVisible = await hydrateIncompleteCollectionSlots(visible,{limit:visible.length});
    if(runId !== collectionIndexHydrationRun || activePage !== "collections-index"){
        return;
    }
    const collections = mergeHydratedCollectionsIntoList(collectionsPageState.collections || [],hydratedVisible);
    const built = buildCollectionsIndexState(collections,collectionsPageState);
    collectionsPageState = Object.assign({},collectionsPageState,built,{collections});
    renderActiveCollectionsPage();
}

async function loadCollectionIndexWithFallback(options={}){
    let payload = null;
    try{
        payload = await tmdbGetCollectionIndex(options);
    }catch(error){
        payload = null;
    }
    const indexedCollections = Array.isArray(payload && payload.collections) ? payload.collections : [];
    const needsFallback = !indexedCollections.length || payload && payload.building === true || indexedCollections.length < DISCOVER_COLLECTION_IDS.length;
    const fallbackCollections = needsFallback ? await loadCuratedCollectionFallback() : [];
    return {
        collections:mergeCollectionLists(indexedCollections,fallbackCollections),
        building:payload && payload.building === true,
        sourceDate:payload && payload.sourceDate || "",
        indexedCount:Number(payload && payload.indexedCount || indexedCollections.length || 0),
        totalIds:Number(payload && payload.totalIds || 0),
        cursor:Number(payload && payload.cursor || 0),
        usingFallback:needsFallback && fallbackCollections.length > 0
    };
}

async function tmdbGetCollectionDetails(collectionId,options={}){
    const id = normalizeCollectionId(collectionId);
    if(!id){
        throw new Error("Collection not found.");
    }
    const cached = readCachedTMDBCollectionDetails(id);
    if(cached && Array.isArray(cached.parts) && cached.parts.length){
        return cached;
    }
    const response = await fetch("/api/tmdb/collections/" + encodeURIComponent(id),{
        credentials:"same-origin",
        signal:options && options.signal ? options.signal : undefined
    });
    if(!response.ok){
        const requestError = new Error(response.status === 404 ? "Collection not found." : "Collection is temporarily unavailable.");
        requestError.status = response.status;
        throw requestError;
    }
    const collection = normalizeTMDBCollectionDetails(await response.json());
    if(!collection){
        const requestError = new Error("Collection not found.");
        requestError.status = 404;
        throw requestError;
    }
    writeCachedTMDBCollectionDetails(collection);
    return collection;
}

async function loadDiscoverCollectionRow(){
    let indexedCollections = [];
    try{
        const payload = await tmdbGetCollectionIndex();
        indexedCollections = Array.isArray(payload.collections) ? payload.collections : [];
    }catch(error){}
    const promotableIndexedCollections = indexedCollections.filter(isPromotableCollection);
    if(promotableIndexedCollections.length >= DISCOVER_COLLECTION_ROW_LIMIT){
        const rowCollections = sortCollectionsForIndex(promotableIndexedCollections,"popularity.desc").slice(0,DISCOVER_COLLECTION_ROW_LIMIT);
        return hydrateIncompleteCollectionSlots(rowCollections,{limit:rowCollections.length});
    }
    const fallbackCollections = await loadCuratedCollectionFallback({limit:DISCOVER_COLLECTION_ROW_LIMIT * 4});
    const rowCollections = sortCollectionsForIndex(mergeCollectionLists(promotableIndexedCollections,fallbackCollections).filter(isPromotableCollection),"popularity.desc").slice(0,DISCOVER_COLLECTION_ROW_LIMIT);
    return hydrateIncompleteCollectionSlots(rowCollections,{limit:rowCollections.length});
}

function scheduleCollectionIndexPoll(){
    if(collectionIndexPollTimer && typeof window.clearTimeout === "function"){
        window.clearTimeout(collectionIndexPollTimer);
        collectionIndexPollTimer = null;
    }else if(collectionIndexPollTimer){
        collectionIndexPollTimer = null;
    }
    if(activePage !== "collections-index"){
        return;
    }
    collectionIndexPollTimer = window.setTimeout(function(){
        collectionIndexPollTimer = null;
        if(activePage === "collections-index"){
            loadCollectionsIndexResults({force:true,poll:true}).catch(()=>{});
        }
    },TMDB_COLLECTION_INDEX_POLL_DELAY);
}

function normalizeCollectionsIndexSort(value){
    const clean = String(value || "").trim().toLowerCase();
    return COLLECTION_SORT_VALUES.has(clean) ? clean : COLLECTIONS_DEFAULT_SORT;
}

function normalizeCollectionsIndexDecade(value){
    const clean = String(value || "").trim();
    if(!/^(18|19|20|21)[0-9]0$/.test(clean)){
        return "";
    }
    const decade = Number(clean);
    const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
    return decade >= 1870 && decade <= currentDecade ? String(decade) : "";
}

function createCollectionsIndexState(input={}){
    const source = input && typeof input === "object" ? input : {};
    const pageNumber = Math.max(1,Math.floor(Number(source.page || 1)));
    return {
        query:String(source.query || source.q || "").trim().slice(0,120),
        genre:normalizeCollectionId(source.genre),
        decade:normalizeCollectionsIndexDecade(source.decade),
        sort:normalizeCollectionsIndexSort(source.sort),
        page:pageNumber
    };
}

function serializeCollectionsIndexSearch(input={}){
    const state = createCollectionsIndexState(input);
    const parts = [];
    if(state.query){ parts.push("q=" + encodeURIComponent(state.query)); }
    if(state.genre){ parts.push("genre=" + encodeURIComponent(state.genre)); }
    if(state.decade){ parts.push("decade=" + encodeURIComponent(state.decade)); }
    if(state.sort !== COLLECTIONS_DEFAULT_SORT){ parts.push("sort=" + encodeURIComponent(state.sort)); }
    if(state.page > 1){ parts.push("page=" + encodeURIComponent(String(state.page))); }
    return parts.length ? "?" + parts.join("&") : "";
}

function getCollectionsRoute(input={}){
    return "/app/collections" + serializeCollectionsIndexSearch(input || collectionsPageState || {});
}

function getCollectionGenreIds(collection){
    if(collection && Array.isArray(collection.genre_ids)){
        return normalizeCollectionGenreIds(collection.genre_ids);
    }
    const metadata = computeCollectionMetadata(collection && collection.parts);
    return metadata.genre_ids;
}

function getCollectionDecades(collection){
    if(collection && Array.isArray(collection.decades)){
        return collection.decades.map(normalizeCollectionsIndexDecade).filter(Boolean);
    }
    const metadata = computeCollectionMetadata(collection && collection.parts);
    return metadata.decades;
}

function getCollectionSortValue(collection,sort){
    const movies = Array.isArray(collection && collection.parts) ? collection.parts : [];
    const metadata = collection && (collection.average_rating !== undefined || collection.average_popularity !== undefined || collection.newest_release_year !== undefined)
    ? collection
    : computeCollectionMetadata(movies);
    if(sort === "size.desc"){
        return Number(collection && collection.movie_count || movies.length || 0);
    }
    if(sort === "date.desc" || sort === "date.asc"){
        return Number(metadata.newest_release_year || 0);
    }
    if(sort === "rating.desc" || sort === "rating.asc"){
        return Number(metadata.average_rating || 0);
    }
    if(sort === "popularity.desc" || sort === "popularity.asc"){
        return Number(metadata.average_popularity || 0);
    }
    return String(collection && (collection.name || collection.title) || "").trim().toLowerCase();
}

function sortCollectionsForIndex(collections,sort){
    const cleanSort = normalizeCollectionsIndexSort(sort);
    const list = (Array.isArray(collections) ? collections : []).slice();
    list.sort((a,b)=>{
        const aName = String(a && (a.name || a.title) || "").trim().toLowerCase();
        const bName = String(b && (b.name || b.title) || "").trim().toLowerCase();
        if(cleanSort === "name.asc"){
            return aName.localeCompare(bName) || Number(a && a.id || 0) - Number(b && b.id || 0);
        }
        const av = getCollectionSortValue(a,cleanSort);
        const bv = getCollectionSortValue(b,cleanSort);
        const direction = cleanSort.endsWith(".asc") ? 1 : -1;
        const numericCompare = (Number(av) - Number(bv)) * direction;
        if(numericCompare){ return numericCompare; }
        return aName.localeCompare(bName) || Number(a && a.id || 0) - Number(b && b.id || 0);
    });
    return list;
}

function getCollectionGenreLabel(genreId){
    const id = String(genreId || "");
    const fromBrowse = typeof browseGenreNameById === "function" ? browseGenreNameById("movie",id) : "";
    return fromBrowse || "Genre " + id;
}

function buildCollectionsIndexOptions(collections){
    const genreIds = new Set();
    const decadeIds = new Set();
    (Array.isArray(collections) ? collections : []).forEach(collection=>{
        getCollectionGenreIds(collection).forEach(id=>genreIds.add(id));
        getCollectionDecades(collection).forEach(decade=>decadeIds.add(decade));
    });
    return {
        genres:Array.from(genreIds).map(id=>({id,name:getCollectionGenreLabel(id)})).sort((a,b)=>a.name.localeCompare(b.name)),
        decades:Array.from(decadeIds).sort((a,b)=>Number(b) - Number(a))
    };
}

function normalizeCollectionSearchText(value){
    return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim()
    .replace(/\s+/g," ");
}

function collectionMatchesSearchQuery(collection,query){
    const cleanQuery = normalizeCollectionSearchText(query);
    if(!cleanQuery){ return true; }
    const names = [
        collection && collection.name,
        collection && collection.title,
        collection && collection.original_name,
        collection && collection.original_title
    ].map(normalizeCollectionSearchText).filter(Boolean);
    const terms = cleanQuery.split(" ").filter(Boolean);
    if(names.some(name=>name.includes(cleanQuery))){
        return true;
    }
    if(terms.length && names.some(name=>terms.every(term=>name.includes(term)))){
        return true;
    }
    return collection && collection.live_search_summary === true;
}

function getCollectionSearchRelevance(collection,query){
    const cleanQuery = normalizeCollectionSearchText(query);
    if(!cleanQuery){ return 999; }
    const names = [
        collection && collection.name,
        collection && collection.title,
        collection && collection.original_name,
        collection && collection.original_title
    ].map(normalizeCollectionSearchText).filter(Boolean);
    const terms = cleanQuery.split(" ").filter(Boolean);
    let best = 900;

    names.forEach(name=>{
        let score = 800;
        if(name === cleanQuery){
            score = 0;
        }else if(name.startsWith(cleanQuery)){
            score = 100;
        }else if(name.includes(cleanQuery)){
            score = 200;
        }else if(terms.length && terms.every(term=>name.split(" ").some(word=>word.startsWith(term)))){
            score = 300;
        }else if(terms.length && terms.every(term=>name.includes(term))){
            score = 400;
        }else if(terms.length){
            const matched = terms.filter(term=>name.includes(term)).length;
            score = 600 - Math.round((matched / terms.length) * 100);
        }
        best = Math.min(best,score);
    });

    return best;
}

function sortCollectionsForSearchRelevance(collections,query){
    const cleanQuery = String(query || "").trim();
    const list = (Array.isArray(collections) ? collections : []).slice();
    list.sort((a,b)=>{
        const relevance = getCollectionSearchRelevance(a,cleanQuery) - getCollectionSearchRelevance(b,cleanQuery);
        if(relevance){ return relevance; }
        const popularity = Number(getCollectionSortValue(b,"popularity.desc") || 0) - Number(getCollectionSortValue(a,"popularity.desc") || 0);
        if(popularity){ return popularity; }
        const searchOrder = Number(a && a.tmdb_search_index !== undefined ? a.tmdb_search_index : Number.MAX_SAFE_INTEGER)
        - Number(b && b.tmdb_search_index !== undefined ? b.tmdb_search_index : Number.MAX_SAFE_INTEGER);
        if(searchOrder){ return searchOrder; }
        const aName = String(a && (a.name || a.title) || "");
        const bName = String(b && (b.name || b.title) || "");
        return aName.localeCompare(bName,undefined,{sensitivity:"base"});
    });
    return list;
}

function isCollectionIndexCandidate(collection,filters){
    if(isPromotableCollection(collection)){
        return true;
    }
    return !!(
        filters && filters.query &&
        collection && collection.live_search_summary === true &&
        collection.id && collection.name &&
        getCollectionPosterSlots(collection).length >= 1
    );
}

function getFilteredCollectionsForIndex(collections,state){
    const filters = createCollectionsIndexState(state);
    const query = String(filters.query || "").trim();
    return (Array.isArray(collections) ? collections : []).filter(collection=>{
        if(query && !collectionMatchesSearchQuery(collection,query)){
            return false;
        }
        if(filters.genre && !getCollectionGenreIds(collection).includes(filters.genre)){
            return false;
        }
        if(filters.decade && !getCollectionDecades(collection).includes(filters.decade)){
            return false;
        }
        return true;
    });
}

function buildCollectionsIndexState(collections,state){
    const filters = createCollectionsIndexState(state);
    const liveQuery = String(state && state.liveSearchQuery || "").trim();
    const liveResults = filters.query && liveQuery.toLowerCase() === filters.query.toLowerCase() && Array.isArray(state && state.liveSearchResults)
    ? state.liveSearchResults
    : [];
    const sourceCollections = liveResults.length ? mergeCollectionLists(collections,liveResults) : collections;
    const candidateCollections = (Array.isArray(sourceCollections) ? sourceCollections : []).filter(collection=>isCollectionIndexCandidate(collection,filters));
    const options = buildCollectionsIndexOptions(candidateCollections.filter(isPromotableCollection));
    const matchedCollections = getFilteredCollectionsForIndex(candidateCollections,filters);
    const filtered = filters.query
    ? sortCollectionsForSearchRelevance(matchedCollections,filters.query)
    : sortCollectionsForIndex(matchedCollections,filters.sort);
    const totalPages = Math.max(1,Math.ceil(filtered.length / COLLECTIONS_PAGE_SIZE));
    const page = Math.min(filters.page,totalPages);
    const visibleLimit = page * COLLECTIONS_PAGE_SIZE;
    return Object.assign({},filters,{
        page,
        totalPages,
        totalResults:filtered.length,
        filteredCollections:filtered,
        visibleCollections:filtered.slice(0,visibleLimit),
        availableGenres:options.genres,
        availableDecades:options.decades,
        searchDraft:state && typeof state.searchDraft === "string" ? state.searchDraft : filters.query,
        liveSearchQuery:state && state.liveSearchQuery || "",
        liveSearchResults:Array.isArray(state && state.liveSearchResults) ? state.liveSearchResults : [],
        liveSearchLoading:state && state.liveSearchLoading === true,
        liveSearchComplete:state && state.liveSearchComplete === true,
        liveSearchError:String(state && state.liveSearchError || "")
    });
}

function shouldRunCollectionsLiveSearch(state){
    const query = String(state && state.query || "").trim();
    if(query.length < 2 || state && state.liveSearchLoading === true){
        return false;
    }
    const liveQuery = String(state && state.liveSearchQuery || "").trim();
    if(liveQuery.toLowerCase() === query.toLowerCase() && state && state.liveSearchComplete === true){
        return false;
    }
    return true;
}

function cancelCollectionsLiveSearchRequest(){
    if(collectionSearchController){
        try{ collectionSearchController.abort(); }catch(error){}
        if(collectionsPageState && collectionsPageState.liveSearchLoading === true){
            collectionsPageState.liveSearchLoading = false;
            collectionsPageState.liveSearchComplete = false;
        }
    }
    collectionSearchController = null;
    collectionSearchRequestId += 1;
}

function isCurrentCollectionsSearchRequest(requestId,query){
    return requestId === collectionSearchRequestId &&
    activePage === "collections-index" &&
    String(collectionsPageState && collectionsPageState.query || "").trim().toLowerCase() === String(query || "").trim().toLowerCase();
}

async function hydrateCollectionsLiveSearchResults(query,summaryResults,requestId,controller){
    const results = Array.isArray(summaryResults) ? summaryResults.slice() : [];
    if(!results.length){ return; }
    let cursor = 0;
    const concurrency = Math.min(4,results.length);

    async function worker(){
        while(cursor < results.length){
            const index = cursor;
            cursor += 1;
            if(!isCurrentCollectionsSearchRequest(requestId,query)){ return; }
            const summary = results[index];
            try{
                const details = await tmdbGetCollectionDetails(summary.id,{signal:controller ? controller.signal : undefined});
                if(!isCurrentCollectionsSearchRequest(requestId,query)){ return; }
                const hydrated = Object.assign({},summary,details,{
                    live_search_summary:false,
                    tmdb_search_index:Number(summary.tmdb_search_index || index)
                });
                const currentResults = Array.isArray(collectionsPageState.liveSearchResults) ? collectionsPageState.liveSearchResults : [];
                const nextResults = currentResults.map(item=>String(item && item.id || "") === String(summary.id) ? hydrated : item);
                const built = buildCollectionsIndexState(collectionsPageState.collections || [],Object.assign({},collectionsPageState,{liveSearchResults:nextResults}));
                collectionsPageState = Object.assign({},collectionsPageState,built,{liveSearchResults:nextResults});
                renderActiveCollectionsPage();
            }catch(error){
                if(error && error.name === "AbortError"){ return; }
            }
        }
    }

    await Promise.all(Array.from({length:concurrency},worker));
}

async function runCollectionsLiveSearch(query){
    const cleanQuery = String(query || "").trim();
    if(cleanQuery.length < 2 || activePage !== "collections-index"){
        return;
    }
    cancelCollectionsLiveSearchRequest();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    collectionSearchController = controller;
    const requestId = ++collectionSearchRequestId;
    collectionsPageState = Object.assign({},collectionsPageState,{
        liveSearchQuery:cleanQuery,
        liveSearchResults:[],
        liveSearchLoading:true,
        liveSearchComplete:false,
        liveSearchError:""
    });
    renderActiveCollectionsPage();
    try{
        const payload = await tmdbSearchCollectionSummariesPage(cleanQuery,1,{signal:controller ? controller.signal : undefined});
        if(!isCurrentCollectionsSearchRequest(requestId,cleanQuery)){
            return;
        }
        const results = Array.isArray(payload && payload.results) ? payload.results : [];
        const built = buildCollectionsIndexState(collectionsPageState.collections || [],Object.assign({},collectionsPageState,{
            liveSearchQuery:cleanQuery,
            liveSearchResults:results,
            liveSearchLoading:results.length > 0,
            liveSearchComplete:results.length === 0,
            liveSearchError:""
        }));
        collectionsPageState = Object.assign({},collectionsPageState,built,{
            liveSearchQuery:cleanQuery,
            liveSearchResults:results,
            liveSearchLoading:results.length > 0,
            liveSearchComplete:results.length === 0,
            liveSearchError:""
        });
        renderActiveCollectionsPage();

        if(results.length){
            await hydrateCollectionsLiveSearchResults(cleanQuery,results,requestId,controller);
            if(!isCurrentCollectionsSearchRequest(requestId,cleanQuery)){
                return;
            }
            const finalBuilt = buildCollectionsIndexState(collectionsPageState.collections || [],Object.assign({},collectionsPageState,{
                liveSearchLoading:false,
                liveSearchComplete:true
            }));
            collectionsPageState = Object.assign({},collectionsPageState,finalBuilt,{
                liveSearchLoading:false,
                liveSearchComplete:true
            });
        }
    }catch(error){
        if(error && error.name === "AbortError"){
            return;
        }
        if(!isCurrentCollectionsSearchRequest(requestId,cleanQuery)){
            return;
        }
        const built = buildCollectionsIndexState(collectionsPageState.collections || [],Object.assign({},collectionsPageState,{
            liveSearchQuery:cleanQuery,
            liveSearchResults:[],
            liveSearchLoading:false,
            liveSearchComplete:true,
            liveSearchError:error && error.message ? error.message : ""
        }));
        collectionsPageState = Object.assign({},collectionsPageState,built,{
            liveSearchQuery:cleanQuery,
            liveSearchResults:[],
            liveSearchLoading:false,
            liveSearchComplete:true,
            liveSearchError:error && error.message ? error.message : ""
        });
    }
    if(requestId === collectionSearchRequestId){
        collectionSearchController = null;
    }
    renderActiveCollectionsPage();
}

function runCollectionsLiveFallbackSearch(query){
    const cleanQuery = String(query || "").trim();
    if(cleanQuery.length < 2){
        return Promise.resolve({results:[],page:1,total_pages:1,total_results:0});
    }
    return tmdbSearchCollectionsPage(cleanQuery,1);
}

function maybeRunCollectionsLiveSearch(){
    if(shouldRunCollectionsLiveSearch(collectionsPageState)){
        runCollectionsLiveSearch(collectionsPageState.query).catch(()=>{});
    }
}

function applyCollectionsIndexState(nextState={},options={}){
    const currentQuery = String(collectionsPageState && collectionsPageState.query || "").trim();
    const merged = createCollectionsIndexState(Object.assign({},collectionsPageState,nextState));
    const queryChanged = String(merged.query || "").trim().toLowerCase() !== currentQuery.toLowerCase();
    if(queryChanged){
        cancelCollectionsLiveSearchRequest();
    }
    const hasDraft = Object.prototype.hasOwnProperty.call(nextState,"searchDraft");
    const searchDraft = hasDraft
    ? String(nextState.searchDraft || "")
    : queryChanged
    ? String(merged.query || "")
    : String(collectionsPageState && collectionsPageState.searchDraft !== undefined ? collectionsPageState.searchDraft : merged.query || "");
    const liveState = queryChanged
    ? {liveSearchQuery:"",liveSearchResults:[],liveSearchLoading:false,liveSearchComplete:false,liveSearchError:""}
    : {
        liveSearchQuery:collectionsPageState.liveSearchQuery || "",
        liveSearchResults:Array.isArray(collectionsPageState.liveSearchResults) ? collectionsPageState.liveSearchResults : [],
        liveSearchLoading:collectionsPageState.liveSearchLoading === true,
        liveSearchComplete:collectionsPageState.liveSearchComplete === true,
        liveSearchError:collectionsPageState.liveSearchError || ""
    };
    const built = buildCollectionsIndexState(collectionsPageState.collections || [],Object.assign({},merged,liveState,{searchDraft}));
    collectionsPageState = Object.assign({},collectionsPageState,built,liveState,{searchDraft});
    if(options && options.updateRoute !== false && activePage === "collections-index"){
        setAppHashRoute(getCollectionsRoute(collectionsPageState),options.replaceRoute === true);
    }
    renderActiveCollectionsPage();
    hydrateVisibleCollectionsForIndex().catch(()=>{});
    maybeRunCollectionsLiveSearch();
}

function normalizeCollectionDetailSort(value){
    const clean = String(value || "").trim().toLowerCase();
    return COLLECTION_DETAIL_SORT_VALUES.has(clean) ? clean : COLLECTION_DETAIL_DEFAULT_SORT;
}

function normalizeCollectionDetailYear(value){
    const clean = String(value || "").trim();
    return /^(18|19|20|21)[0-9]{2}$/.test(clean) ? clean : "";
}

function normalizeCollectionDetailDecade(value){
    return normalizeCollectionsIndexDecade(value);
}

function normalizeCollectionDetailGenres(value){
    return normalizeCollectionGenreIds(Array.isArray(value) ? value : String(value || "").split(","));
}

function createCollectionDetailFilterState(input={}){
    const source = input && typeof input === "object" ? input : {};
    const year = normalizeCollectionDetailYear(source.year);
    return {
        media:"movie",
        year,
        decade:year ? "" : normalizeCollectionDetailDecade(source.decade),
        upcoming:false,
        genres:normalizeCollectionDetailGenres(source.genres || source.genre),
        country:"",
        language:normalizeLanguageCode(source.language),
        themes:[],
        companies:[],
        network:"",
        providers:[],
        runtime:"",
        statuses:[],
        certification:"",
        fadeWatched:source.fadeWatched === true || String(source.fadeWatched || "") === "1",
        hideWatched:source.hideWatched === true || String(source.hideWatched || "") === "1",
        hidePlan:source.hidePlan === true || String(source.hidePlan || "") === "1",
        hideFavorites:source.hideFavorites === true || String(source.hideFavorites || "") === "1",
        sort:normalizeCollectionDetailSort(source.sort)
    };
}

function serializeCollectionDetailSearch(input={}){
    const state = createCollectionDetailFilterState(input);
    const parts = [];
    if(state.genres.length){ parts.push("genre=" + state.genres.map(value=>encodeURIComponent(String(value))).join(",")); }
    if(state.language){ parts.push("language=" + encodeURIComponent(state.language)); }
    if(state.year){ parts.push("year=" + encodeURIComponent(state.year)); }
    else if(state.decade){ parts.push("decade=" + encodeURIComponent(state.decade)); }
    if(state.fadeWatched){ parts.push("fadeWatched=1"); }
    if(state.hideWatched){ parts.push("hideWatched=1"); }
    if(state.hidePlan){ parts.push("hidePlan=1"); }
    if(state.hideFavorites){ parts.push("hideFavorites=1"); }
    if(state.sort !== COLLECTION_DETAIL_DEFAULT_SORT){ parts.push("sort=" + encodeURIComponent(state.sort)); }
    return parts.length ? "?" + parts.join("&") : "";
}

function getCollectionDetailRouteWithFilters(collectionId,label="",filters={}){
    const base = getCollectionDetailRoute(collectionId,label);
    if(base === "/app/list/watching"){
        return base;
    }
    return base + serializeCollectionDetailSearch(filters);
}

function getCollectionMovieReleaseYear(movie){
    return getCollectionPartReleaseYear(movie);
}

function getCollectionMovieLanguage(movie){
    return normalizeLanguageCode(movie && movie.original_language || "");
}

function sortCollectionDetailMovies(movies,sort){
    const cleanSort = normalizeCollectionDetailSort(sort);
    const list = (Array.isArray(movies) ? movies : []).slice();
    if(cleanSort === "collection-order"){
        return list;
    }
    list.sort((a,b)=>{
        const aTitle = String(a && (a.title || a.name) || "").trim().toLowerCase();
        const bTitle = String(b && (b.title || b.name) || "").trim().toLowerCase();
        if(cleanSort === "title-asc"){
            return aTitle.localeCompare(bTitle) || Number(a && a.id || 0) - Number(b && b.id || 0);
        }
        if(cleanSort === "title-desc"){
            return bTitle.localeCompare(aTitle) || Number(a && a.id || 0) - Number(b && b.id || 0);
        }
        let av = 0;
        let bv = 0;
        if(cleanSort === "date-desc" || cleanSort === "date-asc"){
            av = getCollectionMovieReleaseYear(a);
            bv = getCollectionMovieReleaseYear(b);
        }else if(cleanSort === "rating-desc" || cleanSort === "rating-asc"){
            av = Number(a && a.vote_average || 0);
            bv = Number(b && b.vote_average || 0);
        }else if(cleanSort === "popularity-desc" || cleanSort === "popularity-asc"){
            av = Number(a && a.popularity || 0);
            bv = Number(b && b.popularity || 0);
        }
        const direction = cleanSort.endsWith("asc") ? 1 : -1;
        const compare = (av - bv) * direction;
        if(compare){ return compare; }
        return aTitle.localeCompare(bTitle) || Number(a && a.id || 0) - Number(b && b.id || 0);
    });
    return list;
}

function filterCollectionDetailMovies(movies,filters){
    const state = createCollectionDetailFilterState(filters);
    return (Array.isArray(movies) ? movies : []).filter(movie=>{
        const year = getCollectionMovieReleaseYear(movie);
        if(state.year && String(year) !== state.year){
            return false;
        }
        if(!state.year && state.decade){
            const decade = year ? String(Math.floor(year / 10) * 10) : "";
            if(decade !== state.decade){ return false; }
        }
        if(state.genres.length){
            const genres = normalizeCollectionGenreIds(movie && movie.genre_ids);
            if(!state.genres.every(id=>genres.includes(id))){ return false; }
        }
        if(state.language && getCollectionMovieLanguage(movie) !== state.language){
            return false;
        }
        return true;
    });
}

function buildCollectionDetailOptions(movies){
    const genreIds = new Set();
    const languageIds = new Set();
    (Array.isArray(movies) ? movies : []).forEach(movie=>{
        normalizeCollectionGenreIds(movie && movie.genre_ids).forEach(id=>genreIds.add(id));
        const language = getCollectionMovieLanguage(movie);
        if(language){ languageIds.add(language); }
    });
    return {
        genres:Array.from(genreIds).map(id=>({id,name:getCollectionGenreLabel(id)})).sort((a,b)=>a.name.localeCompare(b.name)),
        languages:Array.from(languageIds).map(code=>({code,name:getLanguageName(code)})).sort((a,b)=>a.name.localeCompare(b.name))
    };
}

function buildCollectionDetailState(collection,movies,filters,labels={}){
    const cleanMovies = Array.isArray(movies) ? movies : [];
    const filterState = createCollectionDetailFilterState(filters || {});
    const filtered = filterCollectionDetailMovies(cleanMovies,filterState);
    const sorted = sortCollectionDetailMovies(filtered,filterState.sort);
    const options = buildCollectionDetailOptions(cleanMovies);
    return {
        filters:filterState,
        labels:createBrowseLabelState(labels || {}),
        visibleMovies:applyEyeFiltersToItems(sorted,"movie",filterState),
        totalResults:sorted.length,
        availableGenres:options.genres,
        availableLanguages:options.languages
    };
}

function applyCollectionDetailFilterState(nextState={},options={}){
    const current = createCollectionDetailFilterState(collectionDetailPageState && collectionDetailPageState.filters || {});
    const merged = createCollectionDetailFilterState(Object.assign({},current,nextState));
    const built = buildCollectionDetailState(collectionDetailPageState.collection,collectionDetailPageState.movies,merged,collectionDetailPageState.labels);
    collectionDetailPageState = Object.assign({},collectionDetailPageState,built);
    if(options && options.updateRoute !== false && activePage === "collection-detail"){
        const collection = collectionDetailPageState.collection || {};
        setAppHashRoute(getCollectionDetailRouteWithFilters(collectionDetailPageState.collectionId,collection.name || collectionDetailPageState.routeSlug || "collection",collectionDetailPageState.filters),options.replaceRoute === true);
    }
    renderActiveCollectionDetailPage();
}

function getCollectionDetailEmptyMessage(state){
    const filters = createCollectionDetailFilterState(state && state.filters || {});
    const normalFilteredCount = Number(state && state.totalResults || 0);
    if(hasEyeHideOptions(filters) && normalFilteredCount > 0){
        return "There are no movies visible with the current eye filters.";
    }
    if(filters.year){
        return `There are no movies in this collection released in ${filters.year}`;
    }
    if(filters.decade){
        return `There are no movies in this collection released in the ${filters.decade}s`;
    }
    if(filters.genres.length){
        const label = filters.genres.map(id=>getCollectionGenreLabel(id)).join(", ");
        return `There are no movies in this collection matching ${label}`;
    }
    if(filters.language){
        return `There are no movies in this collection in ${getLanguageName(filters.language)}`;
    }
    return "This collection has no movies available right now.";
}

function getDiscoverCategoryKey(media,category){
    const cleanMedia = normalizeBrowseMediaType(media);
    const cleanCategory = buildRouteSlug(category);
    const key = cleanMedia + "/" + cleanCategory;
    return DISCOVER_CATEGORY_ROUTES[key] ? key : "";
}

function getDiscoverCategoryConfig(mediaOrKey,category=""){
    const key = category ? getDiscoverCategoryKey(mediaOrKey,category) : String(mediaOrKey || "").trim().toLowerCase();
    return DISCOVER_CATEGORY_ROUTES[key] || null;
}

function getDiscoverCategoryDetailRoute(media,category){
    const config = getDiscoverCategoryConfig(media,category);
    return config ? `/app/discover/${encodeURIComponent(config.media)}/${encodeURIComponent(config.category)}` : "/app/discover";
}

function addDaysToDateString(dateString,days){
    const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match){
        return "";
    }
    const date = new Date(Number(match[1]),Number(match[2]) - 1,Number(match[3]) + Number(days || 0),12,0,0,0);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2,"0");
    const day = String(date.getDate()).padStart(2,"0");
    return `${year}-${month}-${day}`;
}

function validDiscoverCategoryDateRange(value){
    const minimum = String(value && value.minimum || "");
    const maximum = String(value && value.maximum || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(minimum) && /^\d{4}-\d{2}-\d{2}$/.test(maximum)
    ? {minimum,maximum}
    : null;
}

async function ensureDiscoverCategoryDateRange(config){
    if(!config || config.media !== "movie" || (config.category !== "now-playing" && config.category !== "upcoming")){
        return null;
    }
    const existing = validDiscoverCategoryDateRange(discoveryPageState && discoveryPageState.categoryDates);
    if(existing){
        return existing;
    }
    const payload = await tmdbGetDiscoverPage(config.path,{page:1});
    const dates = validDiscoverCategoryDateRange(payload && payload.dates);
    if(dates){
        discoveryPageState.categoryDates = dates;
    }
    return dates;
}

function buildDiscoverCategoryBrowseRequest(config,browseState,page,dateRange=null){
    if(!config){
        return null;
    }
    const params = buildBrowseDiscoverParams(browseState,page);
    const path = config.media === "movie" ? "discover/movie" : "discover/tv";
    const category = config.category;

    if(category === "popular"){
        params.sort_by = "popularity.desc";
    }else if(category === "top-rated"){
        params.sort_by = "vote_average.desc";
        params["vote_count.gte"] = 200;
        if(config.media === "movie"){
            params.without_genres = "99,10755";
        }
    }else if(config.media === "tv" && category === "airing-today"){
        const today = getTodayDateString();
        params["air_date.gte"] = today;
        params["air_date.lte"] = today;
    }else if(config.media === "tv" && category === "on-the-air"){
        const today = getTodayDateString();
        params["air_date.gte"] = today;
        params["air_date.lte"] = addDaysToDateString(today,6);
    }else if(config.media === "movie" && (category === "now-playing" || category === "upcoming")){
        const dates = validDiscoverCategoryDateRange(dateRange);
        if(!dates){
            return null;
        }
        params.with_release_type = "2|3";
        params["release_date.gte"] = dates.minimum;
        params["release_date.lte"] = dates.maximum;
    }else{
        return null;
    }

    return {path,params};
}

function normalizeDiscoverMediaResultItem(raw,media){
    if(!raw || !raw.id){
        return null;
    }
    const cleanMedia = normalizeBrowseMediaType(media);
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

function normalizeDiscoverHubShow(show){
    return normalizeDiscoverMediaResultItem(show,"tv");
}

function buildDiscoverHubSection(key,config,payload){
    const seen = new Set();
    const items = (Array.isArray(payload && payload.results) ? payload.results : [])
    .map(raw=>normalizeDiscoverMediaResultItem(raw,config.media))
    .filter(item=>{
        if(!item || !item.id || seen.has(String(item.id))){
            return false;
        }
        seen.add(String(item.id));
        return true;
    })
    .slice(0,DISCOVER_ROW_LIMIT);

    return {
        key:key,
        media:config.media,
        category:config.category,
        title:config.rowTitle,
        section:config.section,
        route:getDiscoverCategoryDetailRoute(config.media,config.category),
        items:items,
        shows:items,
        page:Number(payload && payload.page || 1),
        totalPages:Number(payload && payload.total_pages || 1),
        hasMore:true,
        loadingMore:false
    };
}

function getDiscoverSectionRequestConfig(key){
    return getDiscoverCategoryConfig(key);
}

async function loadMoreDiscoverSection(sectionKey){
    const config = getDiscoverCategoryConfig(sectionKey);
    if(!config){
        return;
    }
    await openDiscoverCategoryPage(config.media,config.category);
}

async function loadDiscoverHub(force=false){

    if(!shouldShowDiscoverHub()){
        return;
    }

    if(discoverHubState.loading){
        if(typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
        return;
    }

    if(!force){
        const cached = readDiscoverHubCache();
        if(cached){
            discoverHubState = {
                loaded:true,
                loading:false,
                error:"",
                sections:cached.sections,
                genres:normalizeDiscoverGenreState(cached.genres),
                collections:Array.isArray(cached.collections) ? cached.collections : []
            };
            if(typeof renderDiscoverHub === "function"){
                renderDiscoverHub();
            }
            return;
        }
    }

    discoverHubState = Object.assign({},discoverHubState,{loading:true,error:""});

    if(typeof renderDiscoverHub === "function"){
        renderDiscoverHub();
    }

    try{
        const categoryEntries = Object.entries(DISCOVER_CATEGORY_ROUTES);
        const sectionResults = await Promise.allSettled(
            categoryEntries.map(([key,config])=>tmdbGetDiscoverPage(config.path,{page:1}))
        );

        const sections = sectionResults.map((result,index)=>{
            if(result.status !== "fulfilled"){
                return null;
            }
            const [key,config] = categoryEntries[index];
            const section = buildDiscoverHubSection(key,config,result.value);
            return section.items.length ? section : null;
        }).filter(Boolean);

        const genreResults = await Promise.allSettled([tmdbGetTVGenreList(),tmdbGetMovieGenreList()]);
        const genres = {
            tv:genreResults[0].status === "fulfilled" && Array.isArray(genreResults[0].value) ? genreResults[0].value : [],
            movie:genreResults[1].status === "fulfilled" && Array.isArray(genreResults[1].value) ? genreResults[1].value : []
        };

        const collections = await loadDiscoverCollectionRow().catch(()=>[]);

        discoverHubState = {
            loaded:true,
            loading:false,
            error:sections.length ? "" : "Couldn’t load this page. Try again later.",
            sections:sections,
            genres:genres,
            collections:collections
        };

        if(collections.length){
            writeDiscoverHubCache(discoverHubState);
        }

        if(shouldShowDiscoverHub() && typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }

    }catch(error){
        discoverHubState = {
            loaded:false,
            loading:false,
            error:"Couldn’t load this page. Try again later.",
            sections:[],
            genres:{tv:[],movie:[]},
            collections:[]
        };

        if(shouldShowDiscoverHub() && typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
    }
}


function readCollectionReturnPositionMap(){
    try{
        const raw = sessionStorage.getItem(COLLECTION_RETURN_POSITION_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }catch(error){
        return {};
    }
}

function writeCollectionReturnPositionMap(map){
    try{
        sessionStorage.setItem(COLLECTION_RETURN_POSITION_KEY,JSON.stringify(map || {}));
    }catch(error){}
}

function getCollectionReturnPageElement(source){
    const cleanSource = String(source || activePage || "");
    if(cleanSource === "discover"){
        return document.getElementById("discover-page");
    }
    if(cleanSource === "collections-index"){
        return document.getElementById("genre-detail-page");
    }
    return null;
}

function saveCollectionReturnPosition(){
    if(activePage !== "collections-index" && activePage !== "discover"){
        return;
    }
    const route = normalizeContextRouteKey(getCurrentAppRoute());
    if(!route){
        return;
    }
    const pageElement = getCollectionReturnPageElement(activePage);
    const row = activePage === "discover" ? document.querySelector(".discover-collection-row") : null;
    const map = readCollectionReturnPositionMap();
    map[route] = {
        source:activePage,
        scrollTop:pageElement ? Number(pageElement.scrollTop || 0) : 0,
        rowScrollLeft:row ? Number(row.scrollLeft || 0) : 0,
        savedAt:Date.now()
    };
    Object.keys(map).forEach(key=>{
        if(Date.now() - Number(map[key] && map[key].savedAt || 0) > 1000 * 60 * 60){
            delete map[key];
        }
    });
    writeCollectionReturnPositionMap(map);
}

function restoreCollectionReturnPositionSoon(route="",attempt=0){
    const routeKey = normalizeContextRouteKey(route || getCurrentAppRoute());
    if(!routeKey){
        return;
    }
    const map = readCollectionReturnPositionMap();
    const saved = map[routeKey];
    if(!saved){
        return;
    }
    const source = String(saved.source || "");
    const expectedSource = routeKey.startsWith("/app/collections") ? "collections-index" : routeKey === "/app/discover" ? "discover" : source;
    const pageElement = getCollectionReturnPageElement(expectedSource);
    if(!pageElement){
        return;
    }
    const targetTop = Math.max(0,Number(saved.scrollTop || 0));
    const targetRowLeft = Math.max(0,Number(saved.rowScrollLeft || 0));
    const apply = ()=>{
        const row = expectedSource === "discover" ? document.querySelector(".discover-collection-row") : null;
        if(row){
            row.scrollLeft = targetRowLeft;
        }
        pageElement.scrollTop = targetTop;
        const topRestored = targetTop === 0 || Math.abs(Number(pageElement.scrollTop || 0) - targetTop) <= 6;
        const rowRestored = !row || targetRowLeft === 0 || Math.abs(Number(row.scrollLeft || 0) - targetRowLeft) <= 6;
        if(topRestored && rowRestored){
            const latest = readCollectionReturnPositionMap();
            delete latest[routeKey];
            writeCollectionReturnPositionMap(latest);
            return;
        }
        if(attempt < 10){
            window.setTimeout(()=>restoreCollectionReturnPositionSoon(routeKey,attempt + 1),80);
        }
    };
    if(typeof window.requestAnimationFrame === "function"){
        window.requestAnimationFrame(apply);
    }else{
        window.setTimeout(apply,0);
    }
}

function handleCollectionReturnPositionClick(event){
    const target = event && event.target;
    const anchor = target && target.closest ? target.closest('a.collection-card[href^="/app/collection/"]') : null;
    if(!anchor){
        return;
    }
    if(
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ){
        return;
    }
    saveCollectionReturnPosition();
}

if(typeof document !== "undefined" && document && !document.__tvTrackerCollectionReturnPositionBound){
    document.__tvTrackerCollectionReturnPositionBound = true;
    document.addEventListener("click",handleCollectionReturnPositionClick,true);
}

function showCollectionsPageShell(navigationContext="discover"){
    activePage = "collections-index";
    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });
    activatePrimaryNavContext(navigationContext || "discover");
    const pageElement = document.getElementById("genre-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function showCollectionDetailPageShell(navigationContext="discover"){
    activePage = "collection-detail";
    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });
    activatePrimaryNavContext(navigationContext || "discover");
    const pageElement = document.getElementById("genre-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function renderActiveCollectionsPage(){
    if(typeof renderCollectionsIndexPage === "function"){
        const activeInput = typeof document !== "undefined" ? document.querySelector("[data-collection-search]") : null;
        const shouldRestoreSearchFocus = !!(activeInput && document.activeElement === activeInput);
        const searchFocusState = shouldRestoreSearchFocus ? {
            value:String(activeInput.value || ""),
            start:typeof activeInput.selectionStart === "number" ? activeInput.selectionStart : null,
            end:typeof activeInput.selectionEnd === "number" ? activeInput.selectionEnd : null
        } : null;
        if(searchFocusState){
            collectionsPageState.searchDraft = searchFocusState.value;
        }
        renderCollectionsIndexPage(collectionsPageState);
        attachCollectionsPageEvents();
        if(searchFocusState){
            const nextInput = document.querySelector("[data-collection-search]");
            if(nextInput){
                nextInput.value = searchFocusState.value;
                if(typeof nextInput.focus === "function"){
                    try{ nextInput.focus({preventScroll:true}); }catch(error){ nextInput.focus(); }
                }
                if(searchFocusState.start !== null && typeof nextInput.setSelectionRange === "function"){
                    const max = nextInput.value.length;
                    nextInput.setSelectionRange(Math.min(searchFocusState.start,max),Math.min(searchFocusState.end === null ? searchFocusState.start : searchFocusState.end,max));
                }
            }
        }
        restoreCollectionReturnPositionSoon(getCollectionsRoute(collectionsPageState));
    }
}

function renderActiveCollectionDetailPage(){
    if(typeof renderCollectionDetailPage === "function"){
        renderCollectionDetailPage(collectionDetailPageState);
        attachCollectionDetailPageEvents();
    }
}

async function loadCollectionsIndexResults(options={}){
    collectionsPageState = Object.assign({},collectionsPageState,{loading:true,error:""});
    renderActiveCollectionsPage();
    try{
        await ensureBrowseReferenceData("movie").catch(()=>{});
        const payload = await loadCollectionIndexWithFallback({force:options && options.force === true});
        let collections = Array.isArray(payload.collections) ? payload.collections : [];
        let built = buildCollectionsIndexState(collections,collectionsPageState);
        if(Array.isArray(built.visibleCollections) && built.visibleCollections.some(collectionNeedsPosterSlotHydration)){
            const hydratedVisible = await hydrateIncompleteCollectionSlots(built.visibleCollections,{limit:built.visibleCollections.length});
            collections = mergeHydratedCollectionsIntoList(collections,hydratedVisible);
            built = buildCollectionsIndexState(collections,collectionsPageState);
        }
        collectionsPageState = Object.assign({},collectionsPageState,built,{
            loaded:collections.length > 0 || payload.building !== true,
            loading:payload.building === true && !collections.length,
            error:"",
            collections,
            building:payload.building === true,
            sourceDate:payload.sourceDate || "",
            indexedCount:Number(payload.indexedCount || collections.length || 0),
            totalIds:Number(payload.totalIds || 0),
            cursor:Number(payload.cursor || 0),
            usingFallback:payload.usingFallback === true,
            liveSearchQuery:collectionsPageState.liveSearchQuery || "",
            liveSearchResults:Array.isArray(collectionsPageState.liveSearchResults) ? collectionsPageState.liveSearchResults : [],
            liveSearchLoading:collectionsPageState.liveSearchLoading === true,
            liveSearchComplete:collectionsPageState.liveSearchComplete === true,
            liveSearchError:collectionsPageState.liveSearchError || ""
        });
        if(activePage === "collections-index"){
            setAppHashRoute(getCollectionsRoute(collectionsPageState),true);
            if(collectionsPageState.building){
                scheduleCollectionIndexPoll();
            }
        }
        renderActiveCollectionsPage();
        maybeRunCollectionsLiveSearch();
    }catch(error){
        collectionsPageState = Object.assign({},collectionsPageState,{
            loaded:false,
            loading:false,
            building:false,
            error:"Couldn’t load collections. Try again later.",
            collections:[],
            filteredCollections:[],
            visibleCollections:[],
            totalPages:1,
            totalResults:0
        });
        renderActiveCollectionsPage();
    }
}

async function openCollectionsPage(options={}){
    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const requestedFilters = createCollectionsIndexState(options && options.filters ? options.filters : options || {});
    const navigationContext = getDiscoveryNavContext(options,fromRoute ? getCurrentAppRoute() : getCollectionsRoute(requestedFilters));

    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedDiscoveryContext = null;
    selectedPersonContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    collectionsPageState = Object.assign({},collectionsPageState,requestedFilters,{
        searchDraft:requestedFilters.query || "",
        liveSearchQuery:"",
        liveSearchResults:[],
        liveSearchLoading:false,
        liveSearchComplete:false,
        liveSearchError:""
    });
    if(collectionsPageState.collections && collectionsPageState.collections.length){
        collectionsPageState = Object.assign({},collectionsPageState,buildCollectionsIndexState(collectionsPageState.collections,collectionsPageState));
    }

    showCollectionsPageShell(navigationContext);

    const targetRoute = getCollectionsRoute(collectionsPageState);
    if(!fromRoute){
        setAppHashRoute(targetRoute,replaceRoute);
        rememberRouteNavContext(targetRoute,navigationContext);
    }

    if(collectionsPageState.loaded && collectionsPageState.collections.length){
        renderActiveCollectionsPage();
        maybeRunCollectionsLiveSearch();
        return;
    }

    await loadCollectionsIndexResults();
}

async function openCollectionDetailPage(collectionId,options={}){
    const id = normalizeCollectionId(collectionId);
    if(!id){
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const routeSlug = buildRouteSlug(options && options.routeSlug || "");
    const routeLabel = String(options && (options.collectionName || options.routeLabel) || "").trim();
    const initialRoute = getCollectionDetailRoute(id,routeLabel || "collection");
    const navigationContext = getDiscoveryNavContext(options,fromRoute ? getCurrentAppRoute() : initialRoute);

    selectedCollectionId = id;
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedDiscoveryContext = null;
    selectedPersonContext = null;
    selectedMovieId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    const requestedFilters = createCollectionDetailFilterState(options && options.filters ? options.filters : options || {});
    collectionDetailPageState = {
        collectionId:id,
        routeSlug:routeSlug,
        loading:true,
        error:"",
        collection:null,
        movies:[],
        filters:requestedFilters,
        labels:createBrowseLabelState(),
        visibleMovies:[],
        totalResults:0,
        availableGenres:[],
        availableLanguages:[]
    };

    if(!fromRoute && options && options.backRoute){
        pushExplicitDetailBackRoute(options.backRoute);
    }

    showCollectionDetailPageShell(navigationContext);
    renderActiveCollectionDetailPage();

    if(!fromRoute){
        setAppHashRoute(initialRoute,replaceRoute);
        rememberRouteNavContext(initialRoute,navigationContext);
    }

    try{
        const collection = await tmdbGetCollectionDetails(id);
        if(String(selectedCollectionId || "") !== id){
            return;
        }
        const canonicalRoute = getCollectionDetailRoute(id,collection.name);
        await ensureBrowseReferenceData("movie").catch(()=>{});
        const movies = Array.isArray(collection.parts) ? collection.parts : [];
        const detailBuilt = buildCollectionDetailState(collection,movies,requestedFilters,collectionDetailPageState.labels);
        collectionDetailPageState = Object.assign({
            collectionId:id,
            routeSlug:buildRouteSlug(collection.name),
            loading:false,
            error:"",
            collection,
            movies
        },detailBuilt);
        const filteredRoute = getCollectionDetailRouteWithFilters(id,collection.name,collectionDetailPageState.filters);
        if(filteredRoute && filteredRoute !== "/app/list/watching"){
            setAppHashRoute(filteredRoute,true);
            rememberRouteNavContext(filteredRoute,navigationContext);
        }
        renderActiveCollectionDetailPage();
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
    }catch(error){
        if(isTMDBNotFoundError(error)){
            renderAppRouteNotFoundPage();
            return;
        }
        collectionDetailPageState.loading = false;
        collectionDetailPageState.error = "Couldn’t load this collection. Try again later.";
        renderActiveCollectionDetailPage();
    }
}

function attachCollectionsPageEvents(){
    if(typeof ensureBrowseGlobalInteractionEvents === "function"){
        ensureBrowseGlobalInteractionEvents();
    }
    const backButton = document.getElementById("collections-page-back-button");
    if(backButton){
        backButton.addEventListener("click",function(){
            navigateBackOrRouteFallback("/app/discover");
        });
    }

    const collectionSearchInput = document.querySelector("[data-collection-search]");
    if(collectionSearchInput){
        collectionSearchInput.addEventListener("input",function(){
            const value = String(this.value || "");
            collectionsPageState.searchDraft = value;
            cancelCollectionsLiveSearchRequest();
            if(collectionSearchTimer && typeof window.clearTimeout === "function"){
                window.clearTimeout(collectionSearchTimer);
            }
            collectionSearchTimer = window.setTimeout(function(){
                applyCollectionsIndexState({query:value,searchDraft:value,page:1},{replaceRoute:true});
            },360);
        });
        collectionSearchInput.addEventListener("keydown",function(event){
            if(event && event.key === "Enter"){
                event.preventDefault();
                if(collectionSearchTimer && typeof window.clearTimeout === "function"){
                    window.clearTimeout(collectionSearchTimer);
                }
                const value = String(collectionSearchInput.value || "");
                collectionsPageState.searchDraft = value;
                applyCollectionsIndexState({query:value,searchDraft:value,page:1},{replaceRoute:true});
            }
        });
    }

    document.querySelectorAll("[data-collection-filter]").forEach(button=>{
        button.addEventListener("click",function(){
            const filter = String(button.dataset.collectionFilter || "");
            const value = String(button.dataset.collectionValue || "");
            if(filter === "genre"){
                applyCollectionsIndexState({genre:normalizeCollectionId(value),page:1});
            }else if(filter === "decade"){
                applyCollectionsIndexState({decade:normalizeCollectionsIndexDecade(value),page:1});
            }else if(filter === "sort"){
                applyCollectionsIndexState({sort:normalizeCollectionsIndexSort(value),page:1});
            }
            if(typeof closeBrowseMenus === "function"){ closeBrowseMenus(); }
        });
    });

    document.querySelectorAll("[data-collection-clear]").forEach(button=>{
        button.addEventListener("click",function(){
            const filter = String(button.dataset.collectionClear || "");
            if(filter === "query"){
                applyCollectionsIndexState({query:"",page:1});
            }else if(filter === "genre"){
                applyCollectionsIndexState({genre:"",page:1});
            }else if(filter === "decade"){
                applyCollectionsIndexState({decade:"",page:1});
            }else if(filter === "all"){
                applyCollectionsIndexState({genre:"",decade:"",sort:COLLECTIONS_DEFAULT_SORT,page:1});
            }
            if(typeof closeBrowseMenus === "function"){ closeBrowseMenus(); }
        });
    });

    document.querySelectorAll("[data-collection-view-more]").forEach(button=>{
        button.addEventListener("click",function(){
            const currentPage = Math.max(1,Math.floor(Number(collectionsPageState && collectionsPageState.page || 1)));
            applyCollectionsIndexState({page:currentPage + 1});
        });
    });
}

function attachCollectionDetailPageEvents(){
    const backButton = document.getElementById("collection-detail-page-back-button");
    if(backButton){
        backButton.addEventListener("click",function(){
            navigateBackOrRouteFallback("/app/collections");
        });
    }

    document.querySelectorAll("[data-collection-detail-set]").forEach(button=>{
        button.addEventListener("click",function(){
            const key = String(button.dataset.collectionDetailSet || "");
            const value = String(button.dataset.collectionDetailValue || "");
            const current = createCollectionDetailFilterState(collectionDetailPageState && collectionDetailPageState.filters || {});
            if(key === "year"){
                applyCollectionDetailFilterState({year:normalizeCollectionDetailYear(value),decade:""});
            }else if(key === "decade"){
                applyCollectionDetailFilterState({year:"",decade:normalizeCollectionDetailDecade(value)});
            }else if(key === "language"){
                applyCollectionDetailFilterState({language:normalizeLanguageCode(value)});
            }else if(key === "sort"){
                applyCollectionDetailFilterState({sort:normalizeCollectionDetailSort(value)});
            }else if(key === "genre"){
                const genre = normalizeCollectionId(value);
                const genres = genre && current.genres.includes(genre) ? current.genres.filter(id=>id !== genre) : (genre ? current.genres.concat(genre) : []);
                applyCollectionDetailFilterState({genres});
            }
        });
    });

    document.querySelectorAll("[data-collection-detail-remove]").forEach(button=>{
        button.addEventListener("click",function(){
            const key = String(button.dataset.collectionDetailRemove || "");
            const value = String(button.dataset.collectionDetailValue || "");
            const current = createCollectionDetailFilterState(collectionDetailPageState && collectionDetailPageState.filters || {});
            if(key === "year"){
                applyCollectionDetailFilterState({year:""});
            }else if(key === "decade"){
                applyCollectionDetailFilterState({decade:""});
            }else if(key === "language"){
                applyCollectionDetailFilterState({language:""});
            }else if(key === "genres"){
                applyCollectionDetailFilterState({genres:current.genres.filter(id=>id !== normalizeCollectionId(value))});
            }else if(key === "sort"){
                applyCollectionDetailFilterState({sort:COLLECTION_DETAIL_DEFAULT_SORT});
            }
        });
    });

    document.querySelectorAll("[data-collection-detail-clear]").forEach(button=>{
        button.addEventListener("click",function(){
            applyCollectionDetailFilterState(createCollectionDetailFilterState());
        });
    });

    document.querySelectorAll(".collection-movie-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const movieId = Number(this.dataset.mediaId || 0);
            if(!movieId){ return; }
            const collection = collectionDetailPageState && collectionDetailPageState.collection ? collectionDetailPageState.collection : {};
            const backRoute = getCollectionDetailRouteWithFilters(collectionDetailPageState.collectionId,collection.name || collectionDetailPageState.routeSlug || "collection",collectionDetailPageState.filters);
            await openMoviePage(movieId,{movieName:this.dataset.mediaName || "",navigationContext:"discover",backRoute});
        });
    });
}

function isTMDBNotFoundError(error){
    const status = Number(error && error.status || 0);
    const message = String(error && error.message ? error.message : "").trim().toLowerCase();
    return status === 404 || message.includes("not found") || message.includes("no matching");
}

function friendlyTMDBSearchError(error){
    const message = String(error && error.message ? error.message : "").trim();
    const lower = message.toLowerCase();

    if(lower.includes("api key") || lower.includes("invalid api key") || lower.includes("401")){
        return "TMDB access is unavailable. Check the server configuration.";
    }

    if(lower.includes("not found") || lower.includes("404")){
        return "No matching page found.";
    }

    if(lower.includes("failed to fetch") || lower.includes("network")){
        return "TMDB search could not connect. Check your connection.";
    }

    return message || "TMDB search failed.";
}

async function searchShows(query,options={}){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    const cleanQuery = String(query || "").trim();
    const cleanMedia = normalizeSearchMediaType(discoverSearchState.media || searchRouteState.media || "tv");
    const cacheKey = getSearchCacheKey(cleanQuery) + ":" + cleanMedia;
    const skipRoute = options && options.skipRoute === true;
    const replaceRoute = options && options.replaceRoute !== false;

    searchRouteState.query = cleanQuery;
    searchRouteState.media = cleanMedia;
    applyEyeFilterState(searchRouteState,searchRouteState);

    if(!skipRoute && activePage === "search"){
        setAppHashRoute(getSearchRoute(cleanQuery,cleanMedia,searchRouteState),replaceRoute);
    }

    if(cleanQuery.length < 2){
        cancelActiveSearchRequest();
        searchRequestId += 1;
        lastDiscoverSearchQuery = "";
        lastDiscoverSearchResults = [];
        discoverSearchState = Object.assign({query:"",media:cleanMedia,page:1,totalPages:1,visibleLimit:SEARCH_RESULT_BATCH_SIZE,loading:false},createEyeFilterState(searchRouteState));
        if(activePage === "discover"){
            if(typeof renderDiscoverHub === "function"){
                renderDiscoverHub();
            }
            loadDiscoverHub(false);
        }else{
            renderSearchIntro();
        }
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
        return;
    }

    cancelActiveSearchRequest();

    const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;

    currentSearchController = controller;
    const requestId = ++searchRequestId;

    lastDiscoverSearchQuery = "";
    lastDiscoverSearchResults = [];
    discoverSearchState = Object.assign({query:cleanQuery,media:cleanMedia,page:1,totalPages:1,visibleLimit:SEARCH_RESULT_BATCH_SIZE,loading:true},createEyeFilterState(searchRouteState));
    renderSearchLoading(cleanQuery);

    try{

        const payload = await tmdbSearchMediaBatch(cleanQuery,cleanMedia,1,SEARCH_RESULT_BATCH_SIZE,{signal:controller ? controller.signal : undefined});

        if(requestId !== searchRequestId){
            return;
        }

        let searchResults = payload.results || [];
        let searchPage = Number(payload.page || 1);
        let searchTotalPages = Number(payload.total_pages || 1);

        if(cleanMedia !== "person" && cleanMedia !== "collection" && hasEyeHideOptions(searchRouteState)){
            const existing = new Set(searchResults.map(item=>item ? `${item.media_type}:${item.id}` : ""));
            let extraPages = 0;
            let nextPage = searchPage + 1;
            while(countEyeVisibleItems(searchResults,cleanMedia,searchRouteState) < SEARCH_RESULT_BATCH_SIZE && extraPages < 2 && nextPage <= searchTotalPages){
                const extraPayload = await tmdbSearchMediaPage(cleanQuery,cleanMedia,nextPage,{signal:controller ? controller.signal : undefined});
                if(requestId !== searchRequestId){
                    return;
                }
                searchPage = Number(extraPayload.page || nextPage);
                searchTotalPages = Number(extraPayload.total_pages || searchTotalPages || nextPage);
                (extraPayload.results || []).forEach(item=>{
                    const key = item ? `${item.media_type}:${item.id}` : "";
                    if(!item || !item.id || existing.has(key)){
                        return;
                    }
                    existing.add(key);
                    searchResults.push(item);
                });
                nextPage = searchPage + 1;
                extraPages += 1;
            }
        }

        lastDiscoverSearchQuery = cacheKey;
        lastDiscoverSearchResults = searchResults;
        discoverSearchState = Object.assign({
            query:cleanQuery,
            media:cleanMedia,
            page:searchPage,
            totalPages:searchTotalPages,
            visibleLimit:SEARCH_RESULT_BATCH_SIZE,
            loading:false
        },createEyeFilterState(searchRouteState));

        renderSearchResults(lastDiscoverSearchResults);

    }catch(error){

        if(error && error.name === "AbortError"){
            return;
        }

        if(requestId !== searchRequestId){
            return;
        }

        discoverSearchState.loading = false;
        renderSearchError();
        showToast(friendlyTMDBSearchError(error));

    }finally{

        if(requestId === searchRequestId){
            currentSearchController = null;
        }

    }

}

async function loadMoreSearchResults(){
    const state = discoverSearchState || {};
    const query = String(state.query || "").trim();
    const media = normalizeSearchMediaType(state.media || searchRouteState.media || "tv");

    if(!query || state.loading){
        return;
    }

    const currentLimit = Math.max(SEARCH_RESULT_BATCH_SIZE,Number(state.visibleLimit || SEARCH_RESULT_BATCH_SIZE));
    const targetLimit = currentLimit + SEARCH_RESULT_BATCH_SIZE;
    const totalPages = Number(state.totalPages || 1);
    let nextPage = Number(state.page || 1) + 1;

    if((lastDiscoverSearchResults || []).length >= targetLimit || nextPage > totalPages){
        discoverSearchState = Object.assign({},state,{
            media:media,
            visibleLimit:targetLimit,
            loading:false
        },createEyeFilterState(searchRouteState));
        if(typeof renderSearchResults === "function"){
            renderSearchResults(lastDiscoverSearchResults || []);
        }
        return;
    }

    state.loading = true;
    state.media = media;
    discoverSearchState = state;

    if(typeof renderSearchResults === "function"){
        renderSearchResults(lastDiscoverSearchResults || []);
    }

    try{
        let latestPage = Number(state.page || 1);
        let latestTotalPages = totalPages;
        const existing = new Set((lastDiscoverSearchResults || []).map(item=>`${item.media_type}:${item.id}`));
        const fresh = [];

        while((lastDiscoverSearchResults.length + fresh.length) < targetLimit && nextPage <= latestTotalPages){
            const payload = await tmdbSearchMediaPage(query,media,nextPage);
            latestPage = Number(payload.page || nextPage);
            latestTotalPages = Number(payload.total_pages || latestTotalPages || nextPage);

            (payload.results || []).forEach(item=>{
                const key = item ? `${item.media_type}:${item.id}` : "";
                if(!item || !item.id || existing.has(key)){
                    return;
                }
                existing.add(key);
                fresh.push(item);
            });

            nextPage += 1;
        }

        lastDiscoverSearchResults = (lastDiscoverSearchResults || []).concat(fresh);
        discoverSearchState = Object.assign({
            query:query,
            media:media,
            page:latestPage,
            totalPages:latestTotalPages,
            visibleLimit:targetLimit,
            loading:false
        },createEyeFilterState(searchRouteState));

        if(typeof renderSearchResults === "function"){
            renderSearchResults(lastDiscoverSearchResults);
        }
    }catch(error){
        discoverSearchState.loading = false;
        showToast(error && error.message ? error.message : "Could not load more results");

        if(typeof renderSearchResults === "function"){
            renderSearchResults(lastDiscoverSearchResults || []);
        }
    }
}

async function openDiscoverCategoryPage(media,category,options={}){
    const config = getDiscoverCategoryConfig(media,category);
    if(!config){
        showAppNotFound();
        return;
    }
    await openDiscoveryFilterPage("discover-category",config.media + "/" + config.category,options);
}

async function addPendingShow(status){

    if(!pendingShow){
        return;
    }

    try{

        let showObject = null;

        if(pendingShow.tmdb_id && pendingShow.title){

            showObject = pendingShow;

        }else{

            const details = await tmdbGetShowDetails(pendingShow.id);

            showObject = createShowObject(details,status);

            await loadSeasonData(showObject,1);

        }

        await savePreparedShow(showObject,status);

    }catch(error){

        showToast(error.message || "Network error");

    }

}





async function loadSeasonData(show,seasonNumber){

    if(!canUseTMDBShow(show)){
        return false;
    }

    if(!isMainSeasonNumber(seasonNumber)){
        return false;
    }

    try{

        if(seasonNumber < 1){
            return false;
        }

        const season = await tmdbGetSeason(show.tmdb_id,seasonNumber);

        if(!season || !Array.isArray(season.episodes)){
            return false;
        }

        if(!show._season_episodes){
            show._season_episodes = {};
        }

        if(!show._episode_details){
            show._episode_details = {};
        }

        if(!show._episode_list){
            show._episode_list = {};
        }

        const existingEpisodes =
        Array.isArray(show._episode_list[String(seasonNumber)])
        ? show._episode_list[String(seasonNumber)]
        : [];

        const cleanEpisodes = season.episodes
        .filter(ep=>ep.episode_number > 0)
        .map(ep=>{

            const existingEpisode = existingEpisodes.find(item=>{
                return Number(item.episode_number) === Number(ep.episode_number);
            }) || {};

            return {
                episode_number:ep.episode_number,
                name:ep.name || existingEpisode.name || "",
                air_date:ep.air_date || existingEpisode.air_date || "",
                runtime:ep.runtime || existingEpisode.runtime || null,
                still_path:ep.still_path || existingEpisode.still_path || "",
                overview:ep.overview || existingEpisode.overview || "",
                vote_average:Number(ep.vote_average || existingEpisode.vote_average || 0),
                vote_count:Number(ep.vote_count || existingEpisode.vote_count || 0),
                air_time:"",
                air_timestamp:"",
            };

        });

        show._season_episodes[String(seasonNumber)] = cleanEpisodes.length;

        if(!show._season_details){
            show._season_details = {};
        }

        show._season_details[String(seasonNumber)] = {
            name:season.name || "Season " + seasonNumber,
            overview:season.overview || "",
            air_date:season.air_date || "",
            poster_path:season.poster_path || "",
            vote_average:Number(season.vote_average || 0),
            external_ids:season.external_ids || null
        };

        show._episode_list[String(seasonNumber)] = cleanEpisodes;

        cleanEpisodes.forEach(ep=>{

            show._episode_details[`${seasonNumber}-${ep.episode_number}`] = {
                name:ep.name || "",
                air_date:ep.air_date || "",
                runtime:ep.runtime || null,
                still_path:ep.still_path || "",
                overview:ep.overview || "",
                vote_average:Number(ep.vote_average || 0),
                vote_count:Number(ep.vote_count || 0),
                air_time:"",
                air_timestamp:"",
            };

        });

        return true;

    }catch(error){
        return false;
    }

}





function getCurrentAppRoute(){
    if(window.TVTrackerRouter && typeof window.TVTrackerRouter.currentRoute === "function"){
        return window.TVTrackerRouter.currentRoute();
    }

    const path = String(window.location.pathname || "");
    const search = String(window.location.search || "");
    const cleanPath = path.startsWith("/app") ? path : "/app/list/watching";
    return cleanPath === "/app/search" && search ? cleanPath + search : cleanPath;
}

function setAppHashRoute(route,replace=false){
    const cleanRoute = String(route || "/app/list/watching");
    const currentRoute = String(window.location.pathname || "") + String(window.location.search || "");

    if(currentRoute === cleanRoute && !window.location.hash){
        return;
    }

    if(replace){
        history.replaceState({tvTrackerRoute:true},"",cleanRoute);
    }else{
        history.pushState({tvTrackerRoute:true},"",cleanRoute);
    }
}


function getShowsFallbackRoute(){
    if(activeShowsTab === "history"){
        return "/app/history";
    }
    if(activeShowsTab === "upcoming"){
        return "/app/upcoming";
    }
    const map = {
        watching:"watching",
        paused:"paused",
        finished:"completed",
        plan:"plan-to-watch",
        dropped:"dropped"
    };
    const slug = map[String(activeFilter || "watching")] || "watching";
    const query = String(typeof librarySearchQuery !== "undefined" ? librarySearchQuery || "" : "").trim();
    return "/app/list/" + slug + (query ? "?q=" + encodeURIComponent(query) : "");
}

function getNavigationFallbackRoute(defaultRoute="/app"){
    const context = typeof getCurrentPrimaryNavContext === "function" ? getCurrentPrimaryNavContext() : "";
    if(context === "profile"){
        return "/app/profile";
    }
    if(context === "settings"){
        return "/app/settings";
    }
    if(context === "discover"){
        return "/app/discover";
    }
    if(context === "shows"){
        return getShowsFallbackRoute();
    }
    return defaultRoute || "/app";
}

function navigateToRouteFallback(route){
    const fallback = String(route || getNavigationFallbackRoute("/app") || "/app");
    setAppHashRoute(fallback,false);
    if(window.TVTrackerRouter && typeof window.TVTrackerRouter.applyRoute === "function"){
        window.TVTrackerRouter.applyRoute();
    }else if(fallback === "/app/profile"){
        showPage("profile");
    }else if(fallback === "/app/discover"){
        showPage("discover");
    }else if(fallback === "/app/settings"){
        showPage("settings");
    }else{
        showPage("shows");
    }
}

function navigateBackOrRouteFallback(fallbackRoute=""){
    if(window.history.length > 1){
        window.history.back();
        return;
    }
    navigateToRouteFallback(fallbackRoute || getNavigationFallbackRoute("/app"));
}

function pushExplicitDetailBackRoute(route){
    const cleanRoute = String(route || "").trim();
    const current = getCurrentAppRoute();
    if(!cleanRoute || !cleanRoute.startsWith("/app") || cleanRoute === current){
        return;
    }
    if(showDetailBackStack[showDetailBackStack.length - 1] === cleanRoute){
        return;
    }
    showDetailBackStack.push(cleanRoute);
    if(showDetailBackStack.length > 20){
        showDetailBackStack = showDetailBackStack.slice(-20);
    }
}

function pushDetailBackRoute(routeToAvoid=""){
    const current = getCurrentAppRoute();
    const avoid = String(routeToAvoid || "");
    if(!current || current === avoid){
        return;
    }
    pushExplicitDetailBackRoute(current);
}

function popDetailBackRoute(){
    const current = getCurrentAppRoute();
    while(Array.isArray(showDetailBackStack) && showDetailBackStack.length){
        const route = String(showDetailBackStack.pop() || "").trim();
        if(route && route !== current && route.startsWith("/app")){
            return route;
        }
    }
    return "";
}

function navigateBackToStoredRouteOrFallback(fallbackRoute=""){
    const storedRoute = popDetailBackRoute();
    if(storedRoute){
        navigateToRouteFallback(storedRoute);
        return;
    }
    navigateBackOrRouteFallback(fallbackRoute || getNavigationFallbackRoute("/app"));
}

function buildRouteSlug(value){
    return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .replace(/-{2,}/g,"-");
}

function buildRouteKey(value,label=""){
    const rawValue = String(value || "").trim();
    const baseMatch = rawValue.match(/^([1-9][0-9]{0,11})/);
    const id = baseMatch ? baseMatch[1] : "";
    const slug = buildRouteSlug(label);
    return id ? (slug ? `${id}-${slug}` : id) : "";
}

function parseRouteKey(value){
    const clean = String(value || "").trim().toLowerCase();
    const match = clean.match(/^([1-9][0-9]{0,11})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
    if(!match){
        return {id:"",slug:"",hasSlug:false,valid:false};
    }
    return {id:match[1],slug:match[2] || "",hasSlug:!!match[2],valid:true};
}

const ROUTE_ERROR_GRADIENT_COUNT = 8;

function getRouteErrorGradientClass(){
    let previousIndex = -1;
    try{
        const storedValue = sessionStorage.getItem("tv-tracker-404-gradient-index");
        const stored = storedValue === null ? -1 : Number(storedValue);
        if(Number.isInteger(stored)){
            previousIndex = stored;
        }
    }catch(_error){}
    let index = Math.floor(Math.random() * ROUTE_ERROR_GRADIENT_COUNT);
    if(ROUTE_ERROR_GRADIENT_COUNT > 1 && index === previousIndex){
        index = (index + 1 + Math.floor(Math.random() * (ROUTE_ERROR_GRADIENT_COUNT - 1))) % ROUTE_ERROR_GRADIENT_COUNT;
    }
    try{
        sessionStorage.setItem("tv-tracker-404-gradient-index",String(index));
    }catch(_error){}
    return `route-error-gradient-${index + 1}`;
}

function renderAppRouteNotFoundPage(){
    activePage = "route-error";
    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });
    activatePrimaryNavContext(inferNavContextFromActivePage("shows"));
    const page = document.getElementById("show-detail-page");
    const content = document.getElementById("show-detail-content");
    if(page){
        page.classList.add("active-page");
        page.scrollTop = 0;
    }
    if(content){
        content.innerHTML = `
            <div class="show-detail-page-inner route-error-page-inner">
                <section class="route-error-hero" aria-label="Page not found">
                    <div class="route-error-copy">
                        <p>404</p>
                        <h1>Are you lost?</h1>
                        <a class="view-more-button route-error-app-button" id="route-error-app-button" href="/app">BACK TO APP</a>
                    </div>
                </section>
            </div>
        `;
        const errorHero = content.querySelector(".route-error-hero");
        if(errorHero){
            errorHero.classList.add(getRouteErrorGradientClass());
        }
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function showAppNotFound(routeLabel="page"){
    showToast("Page not found.");
    if(activePage === "show-detail"){
        renderShowDetailNotFound();
    }else if(activePage === "person-detail"){
        personPageState.error = "Page not found.";
        personPageState.loading = false;
        renderActivePersonPage();
    }else if(activePage === "genre-detail"){
        genrePageState.error = "Page not found.";
        genrePageState.loading = false;
        renderActiveGenrePage();
    }else if(activePage === "discovery-detail"){
        discoveryPageState.error = "Page not found.";
        discoveryPageState.loading = false;
        renderActiveDiscoveryFilterPage();
    }else{
        renderAppRouteNotFoundPage();
    }
}

function getKnownShowRouteLabel(showId,showInfo=""){
    if(typeof showInfo === "string" && showInfo.trim()){
        return showInfo.trim();
    }
    if(showInfo && typeof showInfo === "object"){
        return String(showInfo.title || showInfo.name || showInfo.original_name || "").trim();
    }
    const id = String(showId || "");
    if(DATA && DATA.shows && DATA.shows[id]){
        return String(DATA.shows[id].title || DATA.shows[id].name || "").trim();
    }
    if(showDetailPreview && String(showDetailPreview.tmdb_id || showDetailPreview.id || "") === id){
        return String(showDetailPreview.title || showDetailPreview.name || "").trim();
    }
    return "";
}

function getShowDetailRoute(showId,showInfo=""){
    const key = buildRouteKey(showId,getKnownShowRouteLabel(showId,showInfo));
    return key && key.includes("-") ? "/app/show/" + encodeURIComponent(key) : "/app/list/watching";
}

function getEpisodeDetailRoute(showId,seasonNumber,episodeNumber,showInfo=""){
    return getShowDetailRoute(showId,showInfo) +
    "/season/" + encodeURIComponent(String(Number(seasonNumber))) +
    "/episode/" + encodeURIComponent(String(Number(episodeNumber)));
}

function normalizeGenreSlug(value){
    return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g," ")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

function normalizeGenreMediaType(media){
    const clean = String(media || "tv").trim().toLowerCase();
    return GENRE_MEDIA_TYPES.has(clean) ? clean : "tv";
}

function normalizeDiscoverGenreState(genres){
    if(Array.isArray(genres)){
        return {tv:genres,movie:[]};
    }
    return {
        tv:Array.isArray(genres && genres.tv) ? genres.tv : [],
        movie:Array.isArray(genres && genres.movie) ? genres.movie : []
    };
}

function getGenreSlugSet(media){
    return normalizeGenreMediaType(media) === "movie" ? MOVIE_GENRE_SLUGS : TV_GENRE_SLUGS;
}

function getSmartGenreEquivalentSlug(slug,currentMedia,targetMedia){
    const cleanSlug = normalizeGenreSlug(slug);
    const fromMedia = normalizeGenreMediaType(currentMedia);
    const toMedia = normalizeGenreMediaType(targetMedia);

    if(!cleanSlug){
        return "";
    }
    if(fromMedia === toMedia){
        return getGenreSlugSet(toMedia).has(cleanSlug) ? cleanSlug : "";
    }
    if(getGenreSlugSet(toMedia).has(cleanSlug)){
        return cleanSlug;
    }
    const mapped = fromMedia === "tv" ? TV_TO_MOVIE_GENRE_SLUGS[cleanSlug] : MOVIE_TO_TV_GENRE_SLUGS[cleanSlug];
    return mapped && getGenreSlugSet(toMedia).has(mapped) ? mapped : "";
}

function getKnownGenreOptions(media="tv"){
    const cleanMedia = normalizeGenreMediaType(media);
    const fromBrowse = typeof browseOptionState !== "undefined" && browseOptionState && browseOptionState.genres ? browseOptionState.genres[cleanMedia] : [];
    if(Array.isArray(fromBrowse) && fromBrowse.length){ return fromBrowse; }
    const fromDiscover = typeof discoverHubState !== "undefined" && discoverHubState && discoverHubState.genres ? discoverHubState.genres[cleanMedia] : [];
    return Array.isArray(fromDiscover) ? fromDiscover : [];
}

function getKnownGenreByName(name,media="tv"){
    const slug = normalizeGenreSlug(name);
    if(!slug){ return null; }
    return getKnownGenreOptions(media).find(item=>normalizeGenreSlug(item && item.name) === slug) || null;
}

function getKnownGenreById(genreId,media="tv"){
    const id = String(genreId || "").trim();
    if(!/^[1-9][0-9]{0,11}$/.test(id)){ return null; }
    return getKnownGenreOptions(media).find(item=>String(item && item.id || "") === id) || null;
}

function getGenreRouteFromName(name,media="tv"){
    const genre = getKnownGenreByName(name,media);
    return genre && genre.id ? getGenreDetailRoute(genre.id,genre.name,media) : "";
}

function getGenreDetailRoute(genreId,label="",media="tv"){
    const id = String(genreId || "").trim();
    const cleanMedia = normalizeGenreMediaType(media);
    if(!/^[1-9][0-9]{0,11}$/.test(id)){ return "/app/list/watching"; }
    const known = getKnownGenreById(id,cleanMedia);
    const key = buildRouteKey(id,label || (known && known.name) || "genre");
    return key && key.includes("-") ? `/app/genre/${encodeURIComponent(cleanMedia)}/${encodeURIComponent(key)}` : "/app/list/watching";
}

function getGenreMediaSwitchRoute(genreId,currentMedia,targetMedia){
    const fromMedia = normalizeGenreMediaType(currentMedia);
    const cleanTarget = normalizeGenreMediaType(targetMedia);
    const source = getKnownGenreById(genreId,fromMedia);
    if(!source || !source.name){ return ""; }
    const equivalentSlug = getSmartGenreEquivalentSlug(source.name,fromMedia,cleanTarget);
    const target = equivalentSlug ? getKnownGenreByName(equivalentSlug,cleanTarget) : null;
    return target && target.id ? getGenreDetailRoute(target.id,target.name,cleanTarget) : "";
}

function getGenreDisplayNameFromSlug(slug){
    return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map(part=>part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}


function normalizeRouteId(value){
    const clean = String(value || "").trim();
    return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

function getMovieDetailRoute(movieId,label=""){
    const key = buildRouteKey(movieId,label);
    return key && key.includes("-") ? "/app/movie/" + encodeURIComponent(key) : "/app/list/watching";
}

function getCompanyDetailRoute(companyId,label="",media="tv"){
    const key = buildRouteKey(companyId,label);
    const cleanMedia = normalizeBrowseMediaType(media);
    return key && key.includes("-") ? `/app/company/${encodeURIComponent(cleanMedia)}/${encodeURIComponent(key)}` : "/app/list/watching";
}

function getProviderDetailRoute(providerId,label="",media="tv"){
    const key = buildRouteKey(providerId,label);
    const cleanMedia = normalizeBrowseMediaType(media);
    return key && key.includes("-") ? `/app/provider/${encodeURIComponent(cleanMedia)}/${encodeURIComponent(key)}` : "/app/list/watching";
}

function normalizeBrowseMediaType(media){
    const clean = String(media || "tv").trim().toLowerCase();
    return BROWSE_MEDIA_TYPES.has(clean) ? clean : "tv";
}

function normalizeYearValue(value){
    const clean = String(value || "").trim();
    return /^((?:18|19|20|21)[0-9]{2})$/.test(clean) ? clean : "";
}

function getYearDetailRoute(year,media="tv"){
    const clean = normalizeYearValue(year);
    const cleanMedia = normalizeBrowseMediaType(media);
    return clean ? `/app/year/${encodeURIComponent(cleanMedia)}/${encodeURIComponent(clean)}` : "/app/list/watching";
}

function normalizeStatusSlug(value){
    const clean = buildRouteSlug(value);
    return TV_STATUS_ROUTES[clean] ? clean : "";
}

function getStatusDetailRoute(status){
    const clean = normalizeStatusSlug(status);
    return clean ? "/app/status/" + encodeURIComponent(clean) : "/app/list/watching";
}

function getStatusRouteLabel(status){
    const clean = normalizeStatusSlug(status);
    return clean && TV_STATUS_ROUTES[clean] ? TV_STATUS_ROUTES[clean].label : "";
}

function normalizeCertificationSlug(value){
    return buildRouteSlug(value);
}

function denormalizeCertificationSlug(slug){
    return String(slug || "").trim().toUpperCase().replace(/-/g,"-");
}

function normalizeCertificationValue(value){
    const clean = String(value || "").trim().toLowerCase();
    const match = clean.match(/^(tv|movie)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if(!match){
        return "";
    }
    return `${match[1]}/${match[2]}`;
}

function getCertificationDetailRoute(media,certification){
    if(normalizeBrowseMediaType(media) !== "movie"){
        return "";
    }
    const slug = normalizeCertificationSlug(certification);
    return slug ? `/app/certification/movie/${encodeURIComponent(slug)}` : "";
}

function getSearchRoute(query="",media="tv"){
    const eyeOptions = arguments.length > 2 ? arguments[2] : null;
    const clean = String(query || "").trim();
    const cleanMedia = normalizeSearchMediaType(media || searchRouteState.media || discoverSearchState.media || "tv");
    if(!clean){
        return "/app/search";
    }
    const eyeParts = cleanMedia !== "person" && cleanMedia !== "collection"
    ? getEyeFilterQueryParts(eyeOptions || searchRouteState || {})
    : [];
    const eyeSuffix = eyeParts.length ? `&${eyeParts.join("&")}` : "";
    return `/app/search?q=${encodeURIComponent(clean)}&type=${encodeURIComponent(cleanMedia)}${eyeSuffix}`;
}

function getLibraryListRoute(filter=activeFilter,query=librarySearchQuery){
    const routeMap = {
        watching:"watching",
        paused:"paused",
        finished:"completed",
        plan:"plan-to-watch",
        dropped:"dropped"
    };
    const routeSlug = routeMap[String(filter || "watching")] || "watching";
    const params = [];
    const cleanQuery = String(query || "").trim();
    const genre = String(typeof libraryGenreFilter !== "undefined" ? libraryGenreFilter : "all").trim();
    const network = String(typeof libraryNetworkFilter !== "undefined" ? libraryNetworkFilter : "all").trim();
    const year = String(typeof libraryYearFilter !== "undefined" ? libraryYearFilter : "all").trim();
    const sort = String(typeof librarySortMode !== "undefined" ? librarySortMode : "default").trim();

    if(cleanQuery){
        params.push("q=" + encodeURIComponent(cleanQuery));
    }
    if(genre && genre !== "all"){
        params.push("genre=" + encodeURIComponent(genre));
    }
    if(network && network !== "all"){
        params.push("network=" + encodeURIComponent(network));
    }
    if(/^\d{4}$/.test(year)){
        params.push("year=" + encodeURIComponent(year));
    }
    if(sort && sort !== "default"){
        params.push("sort=" + encodeURIComponent(sort));
    }

    return "/app/list/" + routeSlug + (params.length ? "?" + params.join("&") : "");
}

function scheduleLibrarySearchRouteUpdate(){
    clearTimeout(librarySearchRouteTimer);
    librarySearchRouteTimer = setTimeout(()=>{
        if(
            activePage === "shows" &&
            activeShowsTab === "watchlist" &&
            window.TVTrackerRouter &&
            typeof window.TVTrackerRouter.updateRouteFromState === "function"
        ){
            window.TVTrackerRouter.updateRouteFromState(false);
        }
    },220);
}

function getAppWatchRegion(){
    return "US";
}

function normalizeDiscoveryFilterType(type){
    const clean = String(type || "").trim().toLowerCase();
    return DISCOVERY_PAGE_TYPES.has(clean) ? clean : "";
}

function normalizeLanguageCode(code){
    const clean = String(code || "").trim().toLowerCase();
    return /^[a-z]{2,3}$/.test(clean) ? clean : "";
}

function normalizeCountryCode(code){
    const clean = String(code || "").trim().toLowerCase();
    return /^[a-z]{2}$/.test(clean) ? clean : "";
}

function normalizeDiscoveryFilterValue(type,value){
    const cleanType = normalizeDiscoveryFilterType(type);
    if(cleanType === "network" || cleanType === "theme" || cleanType === "company" || cleanType === "provider"){
        return normalizeRouteId(value);
    }
    if(cleanType === "language"){
        return normalizeLanguageCode(value);
    }
    if(cleanType === "country"){
        return normalizeCountryCode(value);
    }
    if(cleanType === "year"){
        return normalizeYearValue(value);
    }
    if(cleanType === "status"){
        return normalizeStatusSlug(value);
    }
    if(cleanType === "certification"){
        return normalizeCertificationValue(value);
    }
    if(cleanType === "discover-category"){
        const clean = String(value || "").trim().toLowerCase();
        const match = clean.match(/^(tv|movie)\/(popular|top-rated|airing-today|on-the-air|now-playing|upcoming)$/);
        if(!match){
            return "";
        }
        return getDiscoverCategoryKey(match[1],match[2]);
    }
    return "";
}

function getDiscoveryEntityRouteLabel(type,value,label=""){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    const supplied = String(label || "").trim();
    if(cleanType === "discover-category"){
        const config = getDiscoverCategoryConfig(cleanValue);
        return config ? config.title : "Discover";
    }
    if(cleanType === "language"){
        return getLanguageName(cleanValue);
    }
    if(cleanType === "country"){
        return getDiscoveryCountryName(cleanValue);
    }
    if(cleanType === "year"){
        return cleanValue;
    }
    if(cleanType === "status"){
        return getStatusRouteLabel(cleanValue);
    }
    if(cleanType === "certification"){
        const parts = cleanValue.split("/");
        return parts[1] ? denormalizeCertificationSlug(parts[1]) : "";
    }
    if(supplied){
        return supplied
        .replace(/^Shows\s+from\s+/i,"")
        .replace(/^Movies\s+from\s+/i,"")
        .replace(/^Shows\s+about\s+/i,"")
        .replace(/^Movies\s+about\s+/i,"")
        .trim();
    }
    return "";
}

function getDiscoveryFilterDetailRoute(type,value,label="",media="tv"){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    if(!cleanType || !cleanValue){
        return "/app/list/watching";
    }
    if(cleanType === "discover-category"){
        const config = getDiscoverCategoryConfig(cleanValue);
        return config ? getDiscoverCategoryDetailRoute(config.media,config.category) : "/app/discover";
    }
    if(cleanType === "year"){
        return getYearDetailRoute(cleanValue,media);
    }
    if(cleanType === "status"){
        return getStatusDetailRoute(cleanValue);
    }
    if(cleanType === "certification"){
        const parts = cleanValue.split("/");
        return getCertificationDetailRoute(parts[0],parts[1]);
    }
    const routeLabel = getDiscoveryEntityRouteLabel(cleanType,cleanValue,label);
    const cleanMedia = normalizeBrowseMediaType(media);
    if(cleanType === "network"){
        const key = buildRouteKey(cleanValue,routeLabel);
        return key && key.includes("-") ? `/app/network/${encodeURIComponent(key)}` : "/app/list/watching";
    }
    if(cleanType === "theme" || cleanType === "company" || cleanType === "provider"){
        const key = buildRouteKey(cleanValue,routeLabel);
        return key && key.includes("-") ? `/app/${encodeURIComponent(cleanType)}/${encodeURIComponent(cleanMedia)}/${encodeURIComponent(key)}` : "/app/list/watching";
    }
    const slug = buildRouteSlug(routeLabel);
    if(!slug){
        return "/app/list/watching";
    }
    const key = `${cleanValue}-${slug}`;
    return `/app/${encodeURIComponent(cleanType)}/${encodeURIComponent(cleanMedia)}/${encodeURIComponent(key)}`;
}

function getLanguageName(code){
    const clean = normalizeLanguageCode(code);
    if(!clean){
        return "Unknown";
    }
    try{
        if(typeof Intl !== "undefined" && Intl.DisplayNames){
            const names = new Intl.DisplayNames(["en"],{type:"language"});
            return names.of(clean) || clean.toUpperCase();
        }
    }catch(error){}
    return clean.toUpperCase();
}

function getDiscoveryCountryName(code){
    const clean = normalizeCountryCode(code);
    if(!clean){
        return "Unknown";
    }
    try{
        if(typeof Intl !== "undefined" && Intl.DisplayNames){
            const names = new Intl.DisplayNames(["en"],{type:"region"});
            return names.of(clean.toUpperCase()) || clean.toUpperCase();
        }
    }catch(error){}
    return clean.toUpperCase();
}

function getDiscoveryFilterFallbackName(type,value,media="tv"){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    const mediaWord = getBrowseTitleMediaWord(media);
    if(cleanType === "discover-category"){
        const config = getDiscoverCategoryConfig(cleanValue);
        return config ? config.title : "Discover";
    }
    if(cleanType === "language"){
        return `${getLanguageName(cleanValue)} ${mediaWord}`;
    }
    if(cleanType === "country"){
        return `${mediaWord} from ${getDiscoveryCountryName(cleanValue)}`;
    }
    if(cleanType === "network"){
        return cleanValue ? `Shows from Network ${cleanValue}` : "Network Shows";
    }
    if(cleanType === "theme"){
        return cleanValue ? `${mediaWord} about Theme ${cleanValue}` : `Theme ${mediaWord}`;
    }
    if(cleanType === "company"){
        return cleanValue ? `${mediaWord} from Company ${cleanValue}` : `Company ${mediaWord}`;
    }
    if(cleanType === "provider"){
        return cleanValue ? `${mediaWord} from Provider ${cleanValue}` : `Provider ${mediaWord}`;
    }
    if(cleanType === "year"){
        return cleanValue ? `${mediaWord} from ${cleanValue}` : `${mediaWord} by Year`;
    }
    if(cleanType === "status"){
        const label = getStatusRouteLabel(cleanValue);
        return label ? `${label} Shows` : "Shows by Status";
    }
    if(cleanType === "certification"){
        const parts = cleanValue.split("/");
        const rating = parts[1] ? denormalizeCertificationSlug(parts[1]) : "Certification";
        return parts[0] === "movie" ? `${rating} Movies` : `${rating} Shows`;
    }
    return mediaWord;
}

async function tmdbGetNetworkDetails(networkId){
    return await tmdbFetchJSON("network/" + encodeURIComponent(String(networkId)));
}

async function tmdbGetKeywordDetails(keywordId){
    return await tmdbFetchJSON("keyword/" + encodeURIComponent(String(keywordId)));
}


async function tmdbGetCompanyDetails(companyId){
    return await tmdbFetchJSON("company/" + encodeURIComponent(String(companyId)));
}

function normalizeProviderDetails(provider){
    if(!provider){
        return null;
    }
    const id = Number(provider.provider_id || provider.id || 0);
    const name = String(provider.provider_name || provider.name || "").trim();
    if(!id || !name){
        return null;
    }
    return {
        id:id,
        name:name,
        logo_path:provider.logo_path || "",
        display_priority:Number(provider.display_priority || 0)
    };
}

async function tmdbGetWatchProviderDetails(providerId){
    const cleanId = normalizeRouteId(providerId);
    if(!cleanId){
        return null;
    }
    const region = getAppWatchRegion();
    const lists = await Promise.all([
        typeof tmdbGetWatchProviderCatalog === "function" ? tmdbGetWatchProviderCatalog("tv",region).catch(()=>[]) : [],
        typeof tmdbGetWatchProviderCatalog === "function" ? tmdbGetWatchProviderCatalog("movie",region).catch(()=>[]) : []
    ]);
    for(const list of lists){
        const match = (Array.isArray(list) ? list : [])
        .map(normalizeProviderDetails)
        .find(provider=>provider && String(provider.id) === cleanId);
        if(match){
            return match;
        }
    }
    return null;
}

function getBrowseTitleMediaWord(media){
    return normalizeBrowseMediaType(media) === "movie" ? "Movies" : "Shows";
}


function getBrowseStateAPI(){
    return window.TVTrackerBrowse || null;
}

function createBrowseFilterState(media="tv",source={}){
    const api = getBrowseStateAPI();
    if(api && typeof api.normalizeState === "function"){
        return api.normalizeState(source,normalizeBrowseMediaType(media));
    }
    return Object.assign({
        media:normalizeBrowseMediaType(media),year:"",decade:"",upcoming:false,genres:[],country:"",language:"",
        themes:[],companies:[],network:"",providers:[],runtime:"",statuses:[],certification:"",sort:"popularity-desc"
    },source || {});
}

function createBrowseLabelState(source={}){
    const input = source && typeof source === "object" ? source : {};
    const map = key=>Object.assign({},input[key] && typeof input[key] === "object" ? input[key] : {});
    return {
        genres:map("genres"),
        themes:map("themes"),
        companies:map("companies"),
        networks:map("networks"),
        providers:map("providers")
    };
}

function setBrowseLabel(labels,group,value,label){
    const cleanValue = String(value || "").trim();
    const cleanLabel = String(label || "").trim();
    if(!labels || !cleanValue || !cleanLabel){
        return;
    }
    if(!labels[group] || typeof labels[group] !== "object"){
        labels[group] = {};
    }
    labels[group][cleanValue] = cleanLabel;
}

function getBrowseLabel(labels,group,value,fallback=""){
    const cleanValue = String(value || "").trim();
    if(labels && labels[group] && labels[group][cleanValue]){
        return String(labels[group][cleanValue]);
    }
    return String(fallback || cleanValue);
}

function legacyDiscoverySortToBrowseSort(sort){
    const clean = String(sort || "").trim();
    if(clean === "vote_average.desc"){
        return "rating-desc";
    }
    if(clean === "first_air_date.desc" || clean === "primary_release_date.desc"){
        return "date-desc";
    }
    return "popularity-desc";
}

function browseSortToLegacySort(sort){
    const clean = String(sort || "").trim();
    if(clean === "rating-desc"){
        return "vote_average.desc";
    }
    if(clean === "date-desc"){
        return "first_air_date.desc";
    }
    return "popularity.desc";
}

function getBrowseQueryStateFromOptions(options,media){
    const api = getBrowseStateAPI();
    const supplied = options && options.browseState ? options.browseState : null;
    if(supplied){
        return createBrowseFilterState(media,supplied);
    }
    if(api && options && typeof options.search === "string" && typeof api.parseSearch === "function"){
        return api.parseSearch(options.search,media).state;
    }
    return createBrowseFilterState(media);
}

function addBrowseBaseFilter(state,group,value){
    const api = getBrowseStateAPI();
    let next = createBrowseFilterState(state && state.media,state);
    const cleanValue = String(value || "").trim();
    if(!cleanValue){
        return next;
    }
    if(group === "genres" || group === "themes" || group === "companies" || group === "providers" || group === "statuses"){
        if(!next[group].includes(cleanValue)){
            next[group] = next[group].concat(cleanValue);
        }
        return createBrowseFilterState(next.media,next);
    }
    if(api && typeof api.setSingle === "function"){
        return api.setSingle(next,group,cleanValue);
    }
    next[group] = cleanValue;
    return createBrowseFilterState(next.media,next);
}

function getGenreBrowseState(){
    const media = normalizeBrowseMediaType(genrePageState && genrePageState.media || "tv");
    let state = createBrowseFilterState(media,genrePageState && genrePageState.browse ? genrePageState.browse : {
        year:genrePageState && genrePageState.year || "",
        sort:legacyDiscoverySortToBrowseSort(genrePageState && genrePageState.sort)
    });
    const genreId = String(genrePageState && genrePageState.genreId || "").trim();
    if(genreId){
        state = addBrowseBaseFilter(state,"genres",genreId);
    }
    return state;
}

function stripDiscoveryBaseFromBrowseExtras(type,value,state,media="tv"){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    const output = createBrowseFilterState(media,state || {});
    if(cleanType === "network"){
        output.network = "";
    }else if(cleanType === "language"){
        output.language = "";
    }else if(cleanType === "country"){
        output.country = "";
    }else if(cleanType === "provider"){
        output.providers = output.providers.filter(id=>id !== cleanValue);
    }else if(cleanType === "year"){
        output.year = "";
        output.decade = "";
        output.upcoming = false;
    }else if(cleanType === "theme"){
        output.themes = output.themes.filter(id=>id !== cleanValue);
    }else if(cleanType === "company"){
        output.companies = output.companies.filter(id=>id !== cleanValue);
    }else if(cleanType === "status"){
        output.statuses = output.statuses.filter(status=>status !== cleanValue);
    }else if(cleanType === "certification"){
        const parts = cleanValue.split("/");
        if(parts[0] === "movie"){
            output.certification = "";
        }
    }else if(cleanType === "discover-category"){
        const config = getDiscoverCategoryConfig(cleanValue);
        if(config && (config.category === "popular" || config.category === "top-rated")){
            output.sort = "popularity-desc";
        }
    }
    return createBrowseFilterState(media,output);
}

function getDiscoveryBrowseState(){
    const media = getDiscoveryPageMediaFromState();
    let state = createBrowseFilterState(media,discoveryPageState && discoveryPageState.browse ? discoveryPageState.browse : {
        year:discoveryPageState && discoveryPageState.year || "",
        sort:legacyDiscoverySortToBrowseSort(discoveryPageState && discoveryPageState.sort)
    });
    const type = normalizeDiscoveryFilterType(discoveryPageState && discoveryPageState.type);
    const value = normalizeDiscoveryFilterValue(type,discoveryPageState && discoveryPageState.value);
    if(!type || !value || type === "discover-category"){
        return state;
    }
    if(type === "network"){
        state = addBrowseBaseFilter(state,"network",value);
    }else if(type === "language"){
        state = addBrowseBaseFilter(state,"language",value);
    }else if(type === "country"){
        state = addBrowseBaseFilter(state,"country",value);
    }else if(type === "theme"){
        state = addBrowseBaseFilter(state,"themes",value);
    }else if(type === "company"){
        state = addBrowseBaseFilter(state,"companies",value);
    }else if(type === "provider"){
        state = addBrowseBaseFilter(state,"providers",value);
    }else if(type === "year"){
        state = addBrowseBaseFilter(state,"year",value);
    }else if(type === "status"){
        state = addBrowseBaseFilter(state,"statuses",value);
    }else if(type === "certification"){
        const parts = value.split("/");
        if(parts[0] === "movie"){
            state = addBrowseBaseFilter(state,"certification",parts[1] || "");
        }
    }
    return createBrowseFilterState(media,state);
}

function getCurrentBrowseState(){
    if(activePage === "browse-detail"){
        return createBrowseFilterState(browsePageState && browsePageState.media,browsePageState && browsePageState.filters || {});
    }
    if(activePage === "collection-detail"){
        return createCollectionDetailFilterState(collectionDetailPageState && collectionDetailPageState.filters || {});
    }
    if(activePage === "genre-detail"){
        return getGenreBrowseState();
    }
    if(activePage === "discovery-detail"){
        return getDiscoveryBrowseState();
    }
    if(activePage === "discover"){
        return createBrowseFilterState(discoverGenreMedia || "tv");
    }
    return createBrowseFilterState("tv");
}

function getCurrentBrowseLabels(){
    if(activePage === "browse-detail"){
        return createBrowseLabelState(browsePageState && browsePageState.labels);
    }
    if(activePage === "genre-detail"){
        return createBrowseLabelState(genrePageState && genrePageState.browseLabels);
    }
    if(activePage === "discovery-detail"){
        return createBrowseLabelState(discoveryPageState && discoveryPageState.browseLabels);
    }
    if(activePage === "collection-detail"){
        return createBrowseLabelState(collectionDetailPageState && collectionDetailPageState.labels);
    }
    return createBrowseLabelState();
}


const EYE_FILTER_KEYS = Object.freeze(["fadeWatched","hideWatched","hidePlan","hideFavorites"]);

function normalizeEyeFilterFlag(value){
    return value === true || String(value || "").trim() === "1";
}

function createEyeFilterState(input={}){
    const source = input && typeof input === "object" ? input : {};
    return {
        fadeWatched:normalizeEyeFilterFlag(source.fadeWatched),
        hideWatched:normalizeEyeFilterFlag(source.hideWatched),
        hidePlan:normalizeEyeFilterFlag(source.hidePlan),
        hideFavorites:normalizeEyeFilterFlag(source.hideFavorites)
    };
}

function shouldKeepEyeFilterMenuOpen(){
    return keepEyeFilterMenuOpen === true;
}

function hasEyeFilterOptions(input={}){
    const state = createEyeFilterState(input);
    return EYE_FILTER_KEYS.some(key=>state[key] === true);
}

function hasEyeHideOptions(input={}){
    const state = createEyeFilterState(input);
    return !!(state.hideWatched || state.hidePlan || state.hideFavorites);
}

function toggleEyeFilterOption(input,key){
    const state = createEyeFilterState(input);
    if(!EYE_FILTER_KEYS.includes(key)){
        return state;
    }
    state[key] = !state[key];
    return state;
}

function getEyeFilterQueryParts(input={}){
    const state = createEyeFilterState(input);
    const parts = [];
    if(state.fadeWatched){ parts.push("fadeWatched=1"); }
    if(state.hideWatched){ parts.push("hideWatched=1"); }
    if(state.hidePlan){ parts.push("hidePlan=1"); }
    if(state.hideFavorites){ parts.push("hideFavorites=1"); }
    return parts;
}

function applyEyeFilterState(target,input={}){
    const state = createEyeFilterState(input);
    if(!target || typeof target !== "object"){
        return state;
    }
    EYE_FILTER_KEYS.forEach(key=>{ target[key] = state[key]; });
    return target;
}

function isTrackedTVShowWatched(show){
    if(!show){ return false; }
    const status = String(show.status || "").trim().toLowerCase();
    if(status === "finished" || status === "completed"){
        return true;
    }
    const total = typeof getTotalEpisodeCount === "function" ? Number(getTotalEpisodeCount(show) || 0) : Number(show.number_of_episodes || 0);
    const watched = typeof getWatchedEpisodeCount === "function" ? Number(getWatchedEpisodeCount(show) || 0) : Number(countWatchedProgressEntries(show) || 0);
    return total > 0 && watched >= total;
}

function getTrackedTVShowRecord(mediaId){
    const id = String(mediaId || "").trim();
    return id && DATA && DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;
}

function getTrackedMediaState(item,media="tv"){
    const cleanMedia = normalizeBrowseMediaType(media || (item && item.media_type) || "tv");
    const id = String(item && (item.id || item.tmdb_id || item.movie_id) || "").trim();
    if(!id){
        return {watched:false,plan:false,favorite:false,tracked:false};
    }
    if(cleanMedia === "movie"){
        const state = typeof getMovieTrackingState === "function" ? getMovieTrackingState(id) : {watched:false,plan:false,favorite:false};
        return {
            watched:!!(state && state.watched),
            plan:!!(state && state.plan),
            favorite:!!(state && state.favorite),
            tracked:!!(state && (state.watched || state.plan || state.favorite))
        };
    }
    const show = getTrackedTVShowRecord(id);
    if(!show){
        return {watched:false,plan:false,favorite:false,tracked:false};
    }
    const watched = isTrackedTVShowWatched(show);
    const plan = String(show.status || "").trim().toLowerCase() === "plan";
    const favorite = typeof isShowFavorite === "function" ? isShowFavorite(id) : false;
    return {watched,plan,favorite,tracked:true};
}

function isMediaItemHiddenByEyeFilters(item,media="tv",eyeState={}){
    const state = createEyeFilterState(eyeState);
    if(!hasEyeHideOptions(state)){
        return false;
    }
    const tracked = getTrackedMediaState(item,media || (item && item.media_type) || "tv");
    return !!(
        (state.hideWatched && tracked.watched) ||
        (state.hidePlan && tracked.plan) ||
        (state.hideFavorites && tracked.favorite)
    );
}

function shouldFadeMediaItemByEyeFilters(item,media="tv",eyeState={}){
    const state = createEyeFilterState(eyeState);
    if(!state.fadeWatched || state.hideWatched){
        return false;
    }
    const tracked = getTrackedMediaState(item,media || (item && item.media_type) || "tv");
    return !!tracked.watched;
}

function applyEyeFiltersToItems(items,media="tv",eyeState={}){
    const cleanMedia = normalizeBrowseMediaType(media || "tv");
    const state = createEyeFilterState(eyeState);
    return (Array.isArray(items) ? items : [])
    .filter(item=>!isMediaItemHiddenByEyeFilters(item,cleanMedia,state))
    .map(item=>{
        const faded = shouldFadeMediaItemByEyeFilters(item,cleanMedia,state);
        return faded ? Object.assign({},item,{_eyeFaded:true}) : Object.assign({},item,{_eyeFaded:false});
    });
}

function countEyeVisibleItems(items,media="tv",eyeState={}){
    return applyEyeFiltersToItems(items,media,eyeState).length;
}

function getPersonProgressSummary(){
    const state = personPageState || {};
    const media = normalizePersonMediaType(state.media || "tv");
    const credits = Array.isArray(state.credits) ? state.credits : [];
    const watched = credits.filter(item=>getTrackedMediaState(item,media).watched).length;
    const total = credits.length;
    const percent = total > 0 ? Math.round((watched / total) * 100) : 0;
    return {media,watched,total,percent};
}

function normalizeBrowseCountryOptions(payload){
    return (Array.isArray(payload) ? payload : [])
    .map(item=>{
        const code = normalizeCountryCode(item && item.iso_3166_1 || "");
        const name = String(item && (item.english_name || item.native_name) || "").trim();
        return code && name ? {code,name} : null;
    })
    .filter(Boolean)
    .sort((a,b)=>a.name.localeCompare(b.name));
}

function normalizeBrowseLanguageOptions(payload){
    return (Array.isArray(payload) ? payload : [])
    .map(item=>{
        const code = normalizeLanguageCode(item && item.iso_639_1 || "");
        const name = String(item && (item.english_name || item.name) || "").trim();
        return code && name ? {code,name} : null;
    })
    .filter(Boolean)
    .sort((a,b)=>a.name.localeCompare(b.name));
}

function normalizeMovieCertificationOptions(payload){
    const source = payload && payload.certifications && Array.isArray(payload.certifications.US)
    ? payload.certifications.US
    : [];
    const seen = new Set();
    return source
    .map(item=>String(item && item.certification || "").trim())
    .filter(value=>{
        const key = value.toLowerCase();
        if(!value || seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function ensureBrowseReferenceData(media="tv"){
    const cleanMedia = normalizeBrowseMediaType(media);
    const tasks = [];

    if(!browseOptionState.loaded.common){
        if(!browseReferencePromises.common){
            browseReferencePromises.common = Promise.all([
                tmdbFetchJSON("configuration/countries"),
                tmdbFetchJSON("configuration/languages")
            ]).then(([countries,languages])=>{
                browseOptionState.countries = normalizeBrowseCountryOptions(countries);
                browseOptionState.languages = normalizeBrowseLanguageOptions(languages);
                browseOptionState.loaded.common = true;
            }).catch(()=>{}).finally(()=>{
                browseReferencePromises.common = null;
            });
        }
        tasks.push(browseReferencePromises.common);
    }

    const genreKey = cleanMedia === "movie" ? "movieGenres" : "tvGenres";
    if(!browseOptionState.loaded[genreKey]){
        if(!browseReferencePromises[cleanMedia]){
            browseReferencePromises[cleanMedia] = tmdbGetGenreList(cleanMedia).then(genres=>{
                browseOptionState.genres[cleanMedia] = Array.isArray(genres) ? genres.slice() : [];
                browseOptionState.loaded[genreKey] = true;
            }).catch(()=>{}).finally(()=>{
                browseReferencePromises[cleanMedia] = null;
            });
        }
        tasks.push(browseReferencePromises[cleanMedia]);
    }

    if(cleanMedia === "movie" && !browseOptionState.loaded.certifications){
        if(!browseReferencePromises.certifications){
            browseReferencePromises.certifications = tmdbFetchJSON("certification/movie/list").then(payload=>{
                browseOptionState.movieCertifications = normalizeMovieCertificationOptions(payload);
                browseOptionState.loaded.certifications = true;
            }).catch(()=>{}).finally(()=>{
                browseReferencePromises.certifications = null;
            });
        }
        tasks.push(browseReferencePromises.certifications);
    }

    const providerLoadedKey = cleanMedia === "movie" ? "movieProviders" : "tvProviders";
    if(!browseOptionState.loaded[providerLoadedKey] && typeof tmdbGetWatchProviderCatalog === "function"){
        const providerPromiseKey = cleanMedia === "movie" ? "movieProviders" : "tvProviders";
        if(!browseReferencePromises[providerPromiseKey]){
            browseReferencePromises[providerPromiseKey] = tmdbGetWatchProviderCatalog(cleanMedia,getAppWatchRegion()).then(items=>{
                browseOptionState.providers[cleanMedia] = Array.isArray(items) ? items.map(normalizeProviderDetails).filter(Boolean) : [];
                browseOptionState.loaded[providerLoadedKey] = true;
            }).catch(()=>{}).finally(()=>{
                browseReferencePromises[providerPromiseKey] = null;
            });
        }
        tasks.push(browseReferencePromises[providerPromiseKey]);
    }

    if(tasks.length){
        await Promise.allSettled(tasks);
    }
    return browseOptionState;
}

function browseGenreNameById(media,genreId){
    const cleanId = String(genreId || "");
    const list = Array.isArray(browseOptionState.genres[normalizeBrowseMediaType(media)]) ? browseOptionState.genres[normalizeBrowseMediaType(media)] : [];
    const match = list.find(item=>String(item && item.id || "") === cleanId);
    return match ? String(match.name || "").trim() : "";
}

async function resolveBrowseLabels(state,labels={}){
    const cleanState = createBrowseFilterState(state && state.media,state);
    const output = createBrowseLabelState(labels);
    await ensureBrowseReferenceData(cleanState.media);

    cleanState.genres.forEach(id=>{
        const name = browseGenreNameById(cleanState.media,id);
        if(name){ setBrowseLabel(output,"genres",id,name); }
    });

    const asyncTasks = [];
    cleanState.themes.forEach(id=>{
        if(output.themes[id]){ return; }
        asyncTasks.push(tmdbGetKeywordDetails(id).then(item=>{
            if(item && item.name){ setBrowseLabel(output,"themes",id,item.name); }
        }).catch(()=>{}));
    });
    cleanState.companies.forEach(id=>{
        if(output.companies[id]){ return; }
        asyncTasks.push(tmdbGetCompanyDetails(id).then(item=>{
            if(item && item.name){ setBrowseLabel(output,"companies",id,item.name); }
        }).catch(()=>{}));
    });
    if(cleanState.network && !output.networks[cleanState.network]){
        asyncTasks.push(tmdbGetNetworkDetails(cleanState.network).then(item=>{
            if(item && item.name){ setBrowseLabel(output,"networks",cleanState.network,item.name); }
        }).catch(()=>{}));
    }
    cleanState.providers.forEach(id=>{
        if(output.providers[id]){ return; }
        asyncTasks.push(tmdbGetWatchProviderDetails(id).then(item=>{
            if(item && item.name){ setBrowseLabel(output,"providers",id,item.name); }
        }).catch(()=>{}));
    });
    if(asyncTasks.length){
        await Promise.allSettled(asyncTasks);
    }
    return output;
}

function getBrowsePickerResultsHTML(items,type,selectedValues=[]){
    const selected = new Set((Array.isArray(selectedValues) ? selectedValues : []).map(String));
    if(!Array.isArray(items) || !items.length){
        return `<div class="browse-picker-empty">No matches found.</div>`;
    }
    const cleanType = type === "theme" ? "theme" : (type === "network" ? "network" : "company");
    const group = cleanType === "theme" ? "themes" : "companies";
    const nameCounts = new Map();
    items.forEach(item=>{
        const name = String(item && item.name || "").trim().toLocaleLowerCase();
        if(name){ nameCounts.set(name,(nameCounts.get(name) || 0) + 1); }
    });
    return items.slice(0,10).map(item=>{
        const id = String(item && item.id || "");
        const name = String(item && item.name || "").trim();
        if(!id || !name){ return ""; }
        const active = selected.has(id);
        const duplicateName = (nameCounts.get(name.toLocaleLowerCase()) || 0) > 1;
        const originCountry = String(item && item.origin_country || "").trim().toUpperCase();
        const countryLabel = duplicateName && originCountry
        ? (typeof getDiscoveryCountryName === "function" ? getDiscoveryCountryName(originCountry) : originCountry)
        : "";
        const displayLabel = countryLabel ? `${name} · ${countryLabel}` : name;
        const logoPath = cleanType === "company" ? String(item && item.logo_path || "").trim() : "";
        const logo = logoPath
        ? `<img class="browse-picker-logo" src="${escapeHTML("https://image.tmdb.org/t/p/w92" + logoPath)}" alt="" loading="lazy">`
        : "";
        const copy = `<span class="browse-picker-copy"><span class="browse-picker-name">${escapeHTML(name)}</span>${countryLabel ? `<span class="browse-picker-meta">${escapeHTML(countryLabel)}</span>` : ""}</span>`;
        const content = `<span class="browse-picker-main">${logo}${copy}</span>${active && typeof renderBrowseCheckIcon === "function" ? renderBrowseCheckIcon() : ""}`;
        if(cleanType === "network"){
            return `<button type="button" class="browse-picker-result ${active ? "selected" : ""}" data-browse-set-single="network" data-browse-value="${escapeHTML(id)}" data-browse-label="${escapeHTML(displayLabel)}">${content}</button>`;
        }
        return `<button type="button" class="browse-picker-result ${active ? "selected" : ""}" data-browse-toggle-multi="${group}" data-browse-value="${escapeHTML(id)}" data-browse-label="${escapeHTML(displayLabel)}">${content}</button>`;
    }).join("");
}

async function searchBrowsePicker(type,query){
    const cleanType = type === "theme" ? "theme" : (type === "company" ? "company" : (type === "network" ? "network" : ""));
    const cleanQuery = String(query || "").trim();
    if(!cleanType || cleanQuery.length < 2){
        return [];
    }
    if(cleanType === "network"){
        const response = await fetch("/api/tmdb/network-search?q=" + encodeURIComponent(cleanQuery),{
            headers:{"Accept":"application/json"}
        });
        if(!response.ok){
            throw new Error("Network search error: " + response.status);
        }
        const payload = await response.json();
        const seenIds = new Set();
        return (Array.isArray(payload && payload.results) ? payload.results : []).filter(item=>{
            const id = Number(item && item.id || 0);
            const name = String(item && item.name || "").trim();
            if(!id || !name || seenIds.has(id)){ return false; }
            seenIds.add(id);
            return true;
        }).slice(0,10).map(item=>({
            id:Number(item.id),
            name:String(item.name || "").trim(),
            origin_country:String(item.origin_country || "").trim().toUpperCase()
        }));
    }
    const endpoint = cleanType === "theme" ? "search/keyword" : "search/company";
    const payload = await tmdbFetchJSON(endpoint,{query:cleanQuery,page:1});
    const seenIds = new Set();
    const output = [];
    (Array.isArray(payload && payload.results) ? payload.results : []).forEach(item=>{
        const id = Number(item && item.id || 0);
        const name = String(item && item.name || "").trim();
        if(!id || !name || seenIds.has(id)){
            return;
        }
        seenIds.add(id);
        output.push({
            id,
            name,
            logo_path:String(item && item.logo_path || "").trim(),
            origin_country:String(item && item.origin_country || "").trim().toUpperCase()
        });
    });
    return output.slice(0,10);
}

async function mapBrowseGenresForMedia(state,targetMedia,labels={}){
    const current = createBrowseFilterState(state && state.media,state);
    const toMedia = normalizeBrowseMediaType(targetMedia);
    const outputLabels = createBrowseLabelState(labels);

    if(current.media === toMedia){
        return {state:createBrowseFilterState(toMedia,current),labels:outputLabels};
    }

    await Promise.allSettled([ensureBrowseReferenceData(current.media),ensureBrowseReferenceData(toMedia)]);

    const targetGenres = Array.isArray(browseOptionState.genres[toMedia]) ? browseOptionState.genres[toMedia] : [];
    const mappedIds = [];
    current.genres.forEach(id=>{
        const sourceName = browseGenreNameById(current.media,id) || getBrowseLabel(labels,"genres",id,"");
        const sourceSlug = normalizeGenreSlug(sourceName);
        const targetSlug = getSmartGenreEquivalentSlug(sourceSlug,current.media,toMedia);
        const match = targetGenres.find(genre=>normalizeGenreSlug(genre && genre.name) === targetSlug);
        if(match && match.id && !mappedIds.includes(String(match.id))){
            mappedIds.push(String(match.id));
            setBrowseLabel(outputLabels,"genres",String(match.id),match.name || sourceName);
        }
    });

    let next = getBrowseStateAPI() && typeof getBrowseStateAPI().switchMedia === "function"
    ? getBrowseStateAPI().switchMedia(current,toMedia)
    : createBrowseFilterState(toMedia,current);
    next.genres = mappedIds;

    const supportedProviderIds = new Set(
        (Array.isArray(browseOptionState.providers[toMedia]) ? browseOptionState.providers[toMedia] : [])
        .map(item=>String(item && item.id || ""))
        .filter(Boolean)
    );
    next.providers = current.providers.filter(id=>supportedProviderIds.has(String(id)));
    next = createBrowseFilterState(toMedia,next);
    return {state:next,labels:outputLabels};
}

function getBrowseRoute(state){
    const api = getBrowseStateAPI();
    return api && typeof api.routeForState === "function"
    ? api.routeForState(state)
    : `/app/browse/${encodeURIComponent(normalizeBrowseMediaType(state && state.media))}`;
}

function getTodayDateString(){
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2,"0");
    const day = String(now.getDate()).padStart(2,"0");
    return `${year}-${month}-${day}`;
}

function buildBrowseDiscoverParams(state,page){
    const api = getBrowseStateAPI();
    const cleanState = createBrowseFilterState(state && state.media,state);
    if(api && typeof api.buildTMDBParams === "function"){
        return api.buildTMDBParams(cleanState,page,{watchRegion:getAppWatchRegion(),today:getTodayDateString()});
    }
    return {page:Math.max(1,Number(page || 1)),sort_by:"popularity.desc",include_adult:"false"};
}

function getRuntimeBrowseRangeKey(runtimeMinutes,media="tv"){
    const minutes = Number(runtimeMinutes || 0);
    const cleanMedia = normalizeBrowseMediaType(media);
    const api = getBrowseStateAPI();
    const ranges = api && api.RUNTIME_RANGES ? api.RUNTIME_RANGES[cleanMedia] : null;
    if(!Number.isFinite(minutes) || minutes <= 0 || !ranges){
        return "";
    }
    return Object.keys(ranges).find(key=>{
        const range = ranges[key];
        const min = Number(range && range.min || 0);
        const max = range && Number.isFinite(range.max) ? Number(range.max) : null;
        return minutes >= min && (max === null || minutes <= max);
    }) || "";
}

function getRuntimeBrowseRoute(runtimeMinutes,media="tv"){
    const cleanMedia = normalizeBrowseMediaType(media);
    const runtime = getRuntimeBrowseRangeKey(runtimeMinutes,cleanMedia);
    if(!runtime){
        return "";
    }
    return getBrowseRoute(createBrowseFilterState(cleanMedia,{runtime}));
}

function sortBrowseResultsForDisplay(items,state,media="tv"){
    const api = getBrowseStateAPI();
    const cleanState = createBrowseFilterState(media,state || {});
    if(api && typeof api.sortDisplayItems === "function"){
        return api.sortDisplayItems(items,cleanState.sort,cleanState.media);
    }
    return Array.isArray(items) ? items.slice() : [];
}

function getBrowseStateHasAnyChoice(state){
    const api = getBrowseStateAPI();
    const clean = createBrowseFilterState(state && state.media,state);
    return !!((api && typeof api.hasFilters === "function" && api.hasFilters(clean)) || clean.sort !== "popularity-desc");
}


function normalizePersonRoleSlug(role){
    const raw = String(role || "").trim().toLowerCase();
    if(!raw || raw === "person" || raw === "all" || raw === "all-roles"){
        return "";
    }
    if(raw === "actor"){
        return "acting";
    }
    const slug = typeof buildRouteSlug === "function" ? buildRouteSlug(raw) : raw.replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function normalizePersonRoleLabel(value){
    const label = String(value || "").trim();
    return label || "Crew";
}

function getPersonRoleKeyFromLabel(value){
    const label = normalizePersonRoleLabel(value);
    return normalizePersonRoleSlug(label);
}

function normalizePersonMediaType(media){
    const clean = String(media || "tv").trim().toLowerCase();
    return PERSON_MEDIA_TYPES.has(clean) ? clean : "tv";
}

function normalizePersonId(personId){
    const clean = String(personId || "").trim();
    return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
}

function getKnownPersonRouteLabel(personId,label=""){
    const supplied = String(label || "").trim();
    if(supplied){
        return supplied;
    }
    const cleanId = normalizePersonId(personId);
    if(personPageState && personPageState.person && String(personPageState.person.id || "") === cleanId){
        return String(personPageState.person.name || "").trim();
    }
    return "";
}

function getPersonDetailRoute(role,personId,label="",media="tv",eyeOptions=null){
    const cleanId = normalizePersonId(personId);
    const key = buildRouteKey(cleanId,getKnownPersonRouteLabel(cleanId,label));
    const cleanMedia = normalizePersonMediaType(media);
    const cleanRole = normalizePersonRoleSlug(role);
    if(!key || !key.includes("-")){
        return "/app/list/watching";
    }
    const params = [];
    if(cleanMedia === "movie"){
        params.push("media=movie");
    }
    if(cleanRole){
        params.push("role=" + encodeURIComponent(cleanRole));
    }
    getEyeFilterQueryParts(eyeOptions || {}).forEach(part=>params.push(part));
    return `/app/person/${encodeURIComponent(key)}${params.length ? "?" + params.join("&") : ""}`;
}

function getPersonRoleDisplayLabel(role,person=null,media=""){
    const cleanRole = normalizePersonRoleSlug(role);
    if(!cleanRole){
        return "All Roles";
    }
    if(cleanRole === "acting"){
        return "Acting";
    }
    const targetPerson = person || (personPageState && personPageState.person) || null;
    const targetMedia = normalizePersonMediaType(media || (personPageState && personPageState.media) || "tv");
    const match = getPersonAvailableRoles(targetPerson,targetMedia).find(item=>item.key === cleanRole);
    if(match){
        return match.label;
    }
    return cleanRole.split("-").filter(Boolean).map(word=>word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function getPersonAvailableRoles(person,media="tv"){
    const cleanMedia = normalizePersonMediaType(media);
    const combined = person && person.combined_credits ? person.combined_credits : {};
    const cast = Array.isArray(combined.cast) ? combined.cast : [];
    const crew = Array.isArray(combined.crew) ? combined.crew : [];
    const roles = new Map();

    if(cast.some(credit=>credit && String(credit.media_type || "") === cleanMedia)){
        roles.set("acting",{key:"acting",label:"Acting"});
    }

    crew.forEach(credit=>{
        if(!credit || String(credit.media_type || "") !== cleanMedia){
            return;
        }
        const label = normalizePersonRoleLabel(credit.job || credit.department || "Crew");
        const key = getPersonRoleKeyFromLabel(label);
        if(key && !roles.has(key)){
            roles.set(key,{key,label});
        }
    });

    const values = Array.from(roles.values());
    return values.sort((a,b)=>{
        if(a.key === "acting"){ return -1; }
        if(b.key === "acting"){ return 1; }
        return a.label.localeCompare(b.label);
    });
}

function personHasRole(person,role,media="tv"){
    const cleanRole = normalizePersonRoleSlug(role);
    if(!cleanRole){
        return true;
    }
    return getPersonAvailableRoles(person,media).some(item=>item.key === cleanRole);
}

function getPersonCreditRoleLabel(credit){
    if(!credit){
        return "";
    }
    const character = String(credit.character || "").trim();
    const job = String(credit.job || "").trim();
    const department = String(credit.department || "").trim();
    if(character){
        return "Actor: " + character;
    }
    if(job){
        return job;
    }
    if(department){
        return department;
    }
    return "";
}

function normalizePersonCreditItem(credit,media){
    if(!credit || !credit.id){
        return null;
    }

    const cleanMedia = normalizePersonMediaType(media || credit.media_type);
    const title = cleanMedia === "movie"
    ? (credit.title || credit.original_title || "Untitled")
    : (credit.name || credit.original_name || "Untitled");
    const date = cleanMedia === "movie"
    ? (credit.release_date || "")
    : (credit.first_air_date || "");
    const roleLabel = getPersonCreditRoleLabel(credit);

    return {
        id:Number(credit.id || 0),
        media_type:cleanMedia,
        title:title,
        poster_path:credit.poster_path || "",
        backdrop_path:credit.backdrop_path || "",
        overview:credit.overview || "",
        date:date,
        first_air_date:cleanMedia === "tv" ? date : "",
        release_date:cleanMedia === "movie" ? date : "",
        vote_average:Number(credit.vote_average || 0),
        popularity:Number(credit.popularity || 0),
        character:credit.character || "",
        job:credit.job || "",
        role_labels:roleLabel ? [roleLabel] : [],
        person_role_label:roleLabel
    };
}

function mergePersonCreditRole(target,source){
    if(!target || !source){
        return target;
    }
    const labels = Array.isArray(target.role_labels) ? target.role_labels.slice() : [];
    (Array.isArray(source.role_labels) ? source.role_labels : [])
    .concat(source.person_role_label ? [source.person_role_label] : [])
    .forEach(label=>{
        const cleanLabel = String(label || "").trim();
        if(cleanLabel && !labels.includes(cleanLabel)){
            labels.push(cleanLabel);
        }
    });
    target.role_labels = labels;
    target.person_role_label = labels.join(" • ");
    if(!target.character && source.character){
        target.character = source.character;
    }
    if(!target.job && source.job){
        target.job = source.job;
    }
    return target;
}

function getPersonCreditsForRole(person,role,media){
    const cleanRole = normalizePersonRoleSlug(role);
    const cleanMedia = normalizePersonMediaType(media);
    const combined = person && person.combined_credits ? person.combined_credits : {};
    const cast = Array.isArray(combined.cast) ? combined.cast : [];
    const crew = Array.isArray(combined.crew) ? combined.crew : [];
    const source = !cleanRole ? cast.concat(crew) : cleanRole === "acting" ? cast : crew;
    const merged = new Map();

    source
    .filter(credit=>{
        if(!credit || String(credit.media_type || "") !== cleanMedia){
            return false;
        }
        if(!cleanRole || cleanRole === "acting"){
            return true;
        }
        return getPersonRoleKeyFromLabel(credit.job || credit.department || "Crew") === cleanRole;
    })
    .forEach(credit=>{
        const item = normalizePersonCreditItem(credit,cleanMedia);
        if(!item){
            return;
        }
        const key = `${item.media_type}:${item.id}`;
        if(merged.has(key)){
            mergePersonCreditRole(merged.get(key),item);
            return;
        }
        merged.set(key,item);
    });

    return Array.from(merged.values())
    .sort((a,b)=>{
        if(Number(b.popularity || 0) !== Number(a.popularity || 0)){
            return Number(b.popularity || 0) - Number(a.popularity || 0);
        }
        return String(b.date || "").localeCompare(String(a.date || ""));
    });
}

function normalizePersonDetails(person){
    if(!person || !person.id){
        return null;
    }

    return {
        id:Number(person.id || 0),
        name:person.name || "Unknown Person",
        biography:person.biography || "",
        birthday:person.birthday || "",
        deathday:person.deathday || "",
        place_of_birth:person.place_of_birth || "",
        profile_path:person.profile_path || "",
        known_for_department:person.known_for_department || "",
        homepage:person.homepage || "",
        external_ids:person.external_ids || null,
        combined_credits:person.combined_credits || {cast:[],crew:[]}
    };
}

async function tmdbGetPersonDetailsWithCredits(personId){
    return await tmdbFetchJSON(
        "person/" + encodeURIComponent(String(personId)),
        {append_to_response:"combined_credits,external_ids"}
    );
}

function showPersonDetailPageShell(navigationContext=""){
    activePage = "person-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    activatePrimaryNavContext(navigationContext || "shows");

    const pageElement = document.getElementById("person-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function renderActivePersonPage(){
    if(typeof renderPersonDetailPage === "function"){
        renderPersonDetailPage(personPageState);
        attachPersonDetailPageEvents();
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

async function loadPersonPageResults(){
    const requestedRole = normalizePersonRoleSlug(personPageState && personPageState.role);
    const cleanId = normalizePersonId(personPageState && personPageState.personId);
    const media = normalizePersonMediaType(personPageState && personPageState.media);

    if(!cleanId){
        personPageState.error = "Person not found.";
        personPageState.loading = false;
        renderActivePersonPage();
        return;
    }

    personPageState.loading = true;
    personPageState.error = "";
    personPageState.credits = [];
    renderActivePersonPage();

    try{
        const rawPerson = await tmdbGetPersonDetailsWithCredits(cleanId);
        const person = normalizePersonDetails(rawPerson);

        if(!person){
            throw new Error("Person not found.");
        }

        const role = personHasRole(person,requestedRole,media) ? requestedRole : "";
        const canonicalPersonRoute = getPersonDetailRoute(role,cleanId,person.name,media,personPageState);
        if(canonicalPersonRoute && canonicalPersonRoute !== "/app/list/watching"){
            setAppHashRoute(canonicalPersonRoute,true);
            rememberRouteNavContext(canonicalPersonRoute,"discover");
        }

        selectedPersonContext = {role,personId:cleanId};
        personPageState = Object.assign({},personPageState,{
            role,
            personId:cleanId,
            media,
            person,
            credits:getPersonCreditsForRole(person,role,media),
            loading:false,
            error:""
        });

        renderActivePersonPage();
    }catch(error){
        if(isTMDBNotFoundError(error)){
            renderAppRouteNotFoundPage();
            return;
        }
        personPageState.loading = false;
        personPageState.error = "Couldn’t load this page. Try again later.";
        renderActivePersonPage();
    }
}

async function openPersonPage(role,personId,options={}){
    const cleanRole = normalizePersonRoleSlug(role);
    const cleanId = normalizePersonId(personId);

    if(!cleanId){
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const routeSlug = buildRouteSlug(options && options.routeSlug || "");
    const routeLabel = String(options && (options.personName || options.routeLabel) || "").trim();
    const media = normalizePersonMediaType(options && options.media || (personPageState && personPageState.media) || "tv");
    const eyeState = createEyeFilterState(options && options.eyeState ? options.eyeState : personPageState || {});
    const initialPersonRoute = getPersonDetailRoute(cleanRole,cleanId,routeLabel,media,eyeState);
    const navigationContext = getDetailNavContext("person",options,fromRoute ? getCurrentAppRoute() : initialPersonRoute);
    const isSamePerson = activePage === "person-detail" &&
    selectedPersonContext &&
    String(selectedPersonContext.personId || "") === cleanId;

    selectedPersonContext = {role:cleanRole,personId:cleanId};
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedDiscoveryContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    if(!isSamePerson){
        personPageState = {
            role:cleanRole,
            personId:cleanId,
            routeSlug,
            media,
            loading:false,
            error:"",
            person:null,
            credits:[],
            fadeWatched:eyeState.fadeWatched,
            hideWatched:eyeState.hideWatched,
            hidePlan:eyeState.hidePlan,
            hideFavorites:eyeState.hideFavorites
        };
    }else{
        personPageState.role = cleanRole;
        personPageState.personId = cleanId;
        personPageState.routeSlug = routeSlug;
        personPageState.media = media;
        applyEyeFilterState(personPageState,eyeState);
    }

    if(!fromRoute && options && options.backRoute){
        pushExplicitDetailBackRoute(options.backRoute);
    }

    showPersonDetailPageShell(navigationContext);

    if(!fromRoute){
        setAppHashRoute(initialPersonRoute,replaceRoute);
        rememberRouteNavContext(initialPersonRoute,navigationContext);
    }

    if(!isSamePerson || !personPageState.person){
        await loadPersonPageResults();
    }else{
        const nextRole = personHasRole(personPageState.person,cleanRole,media) ? cleanRole : "";
        personPageState.role = nextRole;
        selectedPersonContext.role = nextRole;
        personPageState.credits = getPersonCreditsForRole(personPageState.person,nextRole,media);
        const personName = personPageState.person ? personPageState.person.name : routeLabel;
        const nextRoute = getPersonDetailRoute(nextRole,cleanId,personName,media,personPageState);
        if(nextRoute && nextRoute !== "/app/list/watching" && nextRoute !== getCurrentAppRoute()){
            setAppHashRoute(nextRoute,true);
        }
        renderActivePersonPage();
    }
}

function attachPersonDetailPageEvents(){
    if(typeof ensureBrowseGlobalInteractionEvents === "function"){
        ensureBrowseGlobalInteractionEvents();
    }
    const backButton = document.getElementById("person-page-back-button");
    if(backButton){
        backButton.addEventListener("click",function(){
            navigateBackOrRouteFallback("/app/discover");
        });
    }

    document.querySelectorAll("[data-person-media]").forEach(button=>{
        button.addEventListener("click",function(event){
            if(this.tagName === "A" && typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){
                return;
            }
            const nextMedia = normalizePersonMediaType(this.dataset.personMedia || "tv");
            if(this.tagName === "A" && event){
                event.preventDefault();
            }
            if(nextMedia === personPageState.media){
                return;
            }
            const nextRole = personPageState.person && personHasRole(personPageState.person,personPageState.role,nextMedia)
            ? normalizePersonRoleSlug(personPageState.role)
            : "";
            personPageState.media = nextMedia;
            personPageState.role = nextRole;
            if(selectedPersonContext){ selectedPersonContext.role = nextRole; }
            const personName = personPageState.person ? personPageState.person.name : (personPageState.routeSlug || "");
            const nextRoute = getPersonDetailRoute(nextRole,personPageState.personId,personName,nextMedia,personPageState);
            if(nextRoute && nextRoute !== "/app/list/watching"){
                setAppHashRoute(nextRoute,false);
                rememberRouteNavContext(nextRoute,"discover");
            }
            if(personPageState.person){
                personPageState.credits = getPersonCreditsForRole(personPageState.person,nextRole,nextMedia);
                renderActivePersonPage();
            }else{
                loadPersonPageResults();
            }
        });
    });

    document.querySelectorAll("[data-person-role-filter]").forEach(button=>{
        button.addEventListener("click",function(event){
            event.preventDefault();
            const requestedRole = normalizePersonRoleSlug(this.dataset.personRoleFilter || "");
            const nextRole = personPageState.person && personHasRole(personPageState.person,requestedRole,personPageState.media) ? requestedRole : "";
            if(nextRole === normalizePersonRoleSlug(personPageState.role)){
                return;
            }
            personPageState.role = nextRole;
            if(selectedPersonContext){ selectedPersonContext.role = nextRole; }
            personPageState.credits = getPersonCreditsForRole(personPageState.person,nextRole,personPageState.media);
            const personName = personPageState.person ? personPageState.person.name : (personPageState.routeSlug || "");
            const nextRoute = getPersonDetailRoute(nextRole,personPageState.personId,personName,personPageState.media,personPageState);
            if(nextRoute && nextRoute !== "/app/list/watching"){
                setAppHashRoute(nextRoute,false);
                rememberRouteNavContext(nextRoute,"discover");
            }
            renderActivePersonPage();
        });
    });

    document.querySelectorAll(".person-bio-more-button").forEach(button=>{
        button.addEventListener("click",function(){
            const wrap = this.closest(".person-profile-bio-wrap");
            if(wrap){
                wrap.classList.remove("is-collapsed");
                wrap.classList.add("is-expanded");
            }
            this.remove();
        });
    });

    document.querySelectorAll(".person-result-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaType = normalizePersonMediaType(this.dataset.mediaType || "tv");
            const mediaId = Number(this.dataset.mediaId || 0);

            if(!mediaId){
                return;
            }

            if(mediaType === "movie"){
                await openMoviePage(mediaId,{movieName:this.dataset.mediaName || ""});
                return;
            }

            await openDiscoverShowModal({
                id:mediaId,
                name:this.dataset.mediaName || "",
                poster_path:this.dataset.posterPath || "",
                overview:this.dataset.overview || "",
                first_air_date:this.dataset.firstAirDate || ""
            });
        });
    });
}

function getGenreSortLabel(sort){
    if(sort === "vote_average.desc"){
        return "Rating";
    }
    if(sort === "first_air_date.desc"){
        return "First Air Date";
    }
    return "Popularity";
}


function showGenreDetailPageShell(navigationContext=""){
    activePage = "genre-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    activatePrimaryNavContext(navigationContext || "discover");

    const pageElement = document.getElementById("genre-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function renderActiveGenrePage(){
    if(typeof renderGenreDetailPage === "function"){
        renderGenreDetailPage(genrePageState);
        attachGenreDetailPageEvents();
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function readTMDBGenreCache(media){
    const cleanMedia = normalizeGenreMediaType(media);
    const cacheKey = cleanMedia === "movie" ? TMDB_MOVIE_GENRE_CACHE_KEY : TMDB_TV_GENRE_CACHE_KEY;
    try{
        const raw = sessionStorage.getItem(cacheKey);
        if(!raw){
            return null;
        }
        const cached = JSON.parse(raw);
        if(!cached || !Array.isArray(cached.genres)){
            return null;
        }
        if(Date.now() - Number(cached.savedAt || 0) > TMDB_TV_GENRE_CACHE_TTL){
            sessionStorage.removeItem(cacheKey);
            return null;
        }
        return cached.genres;
    }catch(error){
        return null;
    }
}

function writeTMDBGenreCache(media,genres){
    if(!Array.isArray(genres)){
        return;
    }
    const cleanMedia = normalizeGenreMediaType(media);
    const cacheKey = cleanMedia === "movie" ? TMDB_MOVIE_GENRE_CACHE_KEY : TMDB_TV_GENRE_CACHE_KEY;
    try{
        sessionStorage.setItem(
            cacheKey,
            JSON.stringify({savedAt:Date.now(),genres:genres})
        );
    }catch(error){}
}

function readTMDBTVGenreCache(){
    return readTMDBGenreCache("tv");
}

function writeTMDBTVGenreCache(genres){
    writeTMDBGenreCache("tv",genres);
}

async function tmdbGetGenreList(media){
    const cleanMedia = normalizeGenreMediaType(media);
    const cached = readTMDBGenreCache(cleanMedia);
    if(cached){
        return cached;
    }

    const response = await fetch(TMDB_API_BASE + "/genre/" + cleanMedia + "/list");
    if(!response.ok){
        throw new Error("TMDB error: " + response.status);
    }
    const data = await response.json();
    const genres = Array.isArray(data && data.genres) ? data.genres : [];
    writeTMDBGenreCache(cleanMedia,genres);
    return genres;
}

async function tmdbGetTVGenreList(){
    return tmdbGetGenreList("tv");
}

async function tmdbGetMovieGenreList(){
    return tmdbGetGenreList("movie");
}

async function resolveGenreById(genreId,media="tv"){
    const id = String(genreId || "").trim();
    const cleanMedia = normalizeGenreMediaType(media);
    if(!/^[1-9][0-9]{0,11}$/.test(id)){ return null; }
    const genres = await tmdbGetGenreList(cleanMedia);
    return genres.find(genre=>String(genre && genre.id || "") === id) || null;
}

async function resolveTVGenreFromSlug(slug){
    const genre = getKnownGenreByName(slug,"tv");
    return genre && genre.id ? resolveGenreById(genre.id,"tv") : null;
}

function getGenrePageFiltersFromState(){
    const media = normalizeGenreMediaType(genrePageState && genrePageState.media || "tv");
    const extras = createBrowseFilterState(media,genrePageState && genrePageState.browse ? genrePageState.browse : {
        year:genrePageState && genrePageState.year || "",
        sort:legacyDiscoverySortToBrowseSort(genrePageState && genrePageState.sort)
    });
    const browse = getGenreBrowseState();
    return {
        media:browse.media,
        year:browse.year,
        sort:browseSortToLegacySort(browse.sort),
        browse,
        extras
    };
}

function getGenreDiscoverSort(sort,media){
    const cleanMedia = normalizeGenreMediaType(media);
    if(cleanMedia === "movie" && sort === "first_air_date.desc"){
        return "primary_release_date.desc";
    }
    return GENRE_PAGE_SORTS.has(String(sort || "")) ? String(sort) : "popularity.desc";
}

async function loadGenrePageResults(options={}){
    const append = options && options.append === true;
    const genreId = String(genrePageState && genrePageState.genreId || "").trim();
    const media = normalizeGenreMediaType(genrePageState && genrePageState.media);

    if(!/^[1-9][0-9]{0,11}$/.test(genreId)){
        genrePageState.error = "Genre not found.";
        genrePageState.loading = false;
        renderActiveGenrePage();
        return;
    }

    const filters = getGenrePageFiltersFromState();
    const nextPage = append ? Number(genrePageState.page || 1) + 1 : 1;
    const requestId = ++genrePageRequestId;
    const requestIsCurrent = ()=>requestId === genrePageRequestId && activePage === "genre-detail" && String(genrePageState && genrePageState.genreId || "") === genreId && normalizeGenreMediaType(selectedGenreMedia) === media;

    genrePageState.loading = true;
    genrePageState.error = "";
    if(!append){
        genrePageState.shows = [];
        genrePageState.page = 1;
        genrePageState.totalPages = 1;
    }
    renderActiveGenrePage();

    try{
        const genre = await resolveGenreById(genreId,media);
        if(!requestIsCurrent()){
            return;
        }
        if(!genre || !genre.id){
            renderAppRouteNotFoundPage();
            return;
        }

        const genreExtras = createBrowseFilterState(media,filters.extras || {});
        genreExtras.genres = genreExtras.genres.filter(id=>id !== String(genre.id));
        genrePageState.browse = createBrowseFilterState(media,genreExtras);
        const browseApi = getBrowseStateAPI();
        const genreBrowseSearch = browseApi && typeof browseApi.serializeSearch === "function" ? browseApi.serializeSearch(genrePageState.browse) : "";
        const canonicalGenreRoute = getGenreDetailRoute(genre.id,genre.name,media) + genreBrowseSearch;
        setAppHashRoute(canonicalGenreRoute,true);
        rememberRouteNavContext(canonicalGenreRoute,"discover");

        let browseFilters = createBrowseFilterState(media,genrePageState.browse || {});
        browseFilters = addBrowseBaseFilter(browseFilters,"genres",String(genre.id));
        const params = buildBrowseDiscoverParams(browseFilters,nextPage);

        const existing = new Set((append ? genrePageState.shows : []).map(show=>String(show.id)));
        const fresh = [];
        let totalPages = Number(genrePageState.totalPages || 1);
        let currentPage = nextPage;
        let lastPage = nextPage;

        const shouldAutoRefillForEye = hasEyeHideOptions(browseFilters);
        let eyeRefillPagesFetched = 0;
        while((shouldAutoRefillForEye ? countEyeVisibleItems(fresh,media,browseFilters) : fresh.length) < DISCOVERY_GRID_PAGE_SIZE){
            const payload = await tmdbGetDiscoverPage("discover/" + media,Object.assign({},params,{page:currentPage}));
            if(!requestIsCurrent()){
                return;
            }
            totalPages = Number(payload.total_pages || currentPage || 1);
            lastPage = Number(payload.page || currentPage);

            (payload.results || []).forEach(raw=>{
                const show = normalizeDiscoverMediaResultItem(raw,media);
                if(!show || existing.has(String(show.id)) || fresh.length >= DISCOVERY_GRID_PAGE_SIZE){
                    return;
                }
                existing.add(String(show.id));
                fresh.push(show);
            });

            eyeRefillPagesFetched += 1;
            const visibleTargetReached = (shouldAutoRefillForEye ? countEyeVisibleItems(fresh,media,browseFilters) : fresh.length) >= DISCOVERY_GRID_PAGE_SIZE;
            if(lastPage >= totalPages || visibleTargetReached || (shouldAutoRefillForEye && eyeRefillPagesFetched >= 3)){
                break;
            }
            currentPage = lastPage + 1;
        }

        genrePageState = Object.assign({},genrePageState,{
            media:media,
            slug:normalizeGenreSlug(genre.name),
            routeKey:buildRouteKey(genre.id,genre.name),
            name:genre.name || genrePageState.name || "Genre",
            genreId:genre.id,
            year:browseFilters.year,
            sort:browseSortToLegacySort(browseFilters.sort),
            browse:createBrowseFilterState(media,genrePageState.browse || {}),
            browseLabels:(()=>{
                const labels = createBrowseLabelState(genrePageState.browseLabels);
                setBrowseLabel(labels,"genres",String(genre.id),genre.name || genrePageState.name || "Genre");
                return labels;
            })(),
            page:lastPage,
            totalPages:totalPages,
            loading:false,
            error:"",
            shows:sortBrowseResultsForDisplay(append ? (genrePageState.shows || []).concat(fresh) : fresh,browseFilters,media)
        });

        renderActiveGenrePage();
    }catch(error){
        if(!requestIsCurrent()){
            return;
        }
        genrePageState.loading = false;
        genrePageState.error = "Couldn’t load this page. Try again later.";
        renderActiveGenrePage();
    }
}

async function openGenrePage(genreKey,options={}){
    const media = normalizeGenreMediaType(options && options.media || (genrePageState && genrePageState.media) || "tv");
    const rawKey = String(genreKey || "").trim().toLowerCase();
    const match = rawKey.match(/^([1-9][0-9]{0,11})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
    let genreId = match ? match[1] : "";
    let routeSlug = match ? (match[2] || normalizeGenreSlug(options && options.routeSlug || "")) : "";
    if(!genreId){
        const fallback = getKnownGenreByName(rawKey,media);
        genreId = fallback && fallback.id ? String(fallback.id) : "";
        routeSlug = fallback ? normalizeGenreSlug(fallback.name) : routeSlug;
    }
    if(!genreId){
        renderAppRouteNotFoundPage();
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const knownGenre = getKnownGenreById(genreId,media);
    const routeLabel = knownGenre && knownGenre.name ? knownGenre.name : (routeSlug || "genre");
    const genreRoute = getGenreDetailRoute(genreId,routeLabel,media);
    const navigationContext = getDiscoveryNavContext(options,fromRoute ? getCurrentAppRoute() : genreRoute);
    const isSameGenre = activePage === "genre-detail" && String(genrePageState && genrePageState.genreId || "") === genreId && String(selectedGenreMedia || "tv") === media;

    selectedGenreSlug = buildRouteKey(genreId,routeLabel) || genreId;
    selectedGenreMedia = media;
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedPersonContext = null;
    selectedDiscoveryContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    if(!isSameGenre){
        const routeBrowseState = getBrowseQueryStateFromOptions(options,media);
        genrePageState = {
            media,
            slug:routeSlug,
            routeKey:rawKey,
            name:knownGenre && knownGenre.name || "",
            genreId,
            year:routeBrowseState.year || "",
            sort:browseSortToLegacySort(routeBrowseState.sort),
            browse:routeBrowseState,
            browseLabels:createBrowseLabelState(options && options.browseLabels),
            categoryDates:null,
            page:1,
            totalPages:1,
            loading:false,
            error:"",
            shows:[]
        };
    }else{
        genrePageState.media = media;
        genrePageState.genreId = genreId;
        if(options && options.browseState){ genrePageState.browse = getBrowseQueryStateFromOptions(options,media); }
    }

    showGenreDetailPageShell(navigationContext);
    if(!fromRoute){
        setAppHashRoute(genreRoute,replaceRoute);
        rememberRouteNavContext(genreRoute,navigationContext);
    }

    await ensureBrowseReferenceData(media);
    if(activePage !== "genre-detail" || String(genrePageState && genrePageState.genreId || "") !== genreId || selectedGenreMedia !== media){ return; }
    const resolved = await resolveGenreById(genreId,media);
    if(!resolved){
        renderAppRouteNotFoundPage();
        return;
    }
    genrePageState.name = resolved.name || genrePageState.name || "Genre";
    genrePageState.slug = normalizeGenreSlug(resolved.name);
    genrePageState.routeKey = buildRouteKey(resolved.id,resolved.name);
    selectedGenreSlug = genrePageState.routeKey;
    const labels = await resolveBrowseLabels(getGenreBrowseState(),genrePageState.browseLabels);
    genrePageState.browseLabels = labels;
    const browseApi = getBrowseStateAPI();
    const search = browseApi && typeof browseApi.serializeSearch === "function" ? browseApi.serializeSearch(genrePageState.browse || {media}) : "";
    const canonicalRoute = getGenreDetailRoute(resolved.id,resolved.name,media) + search;
    setAppHashRoute(canonicalRoute,true);
    rememberRouteNavContext(canonicalRoute,navigationContext);

    if(!isSameGenre || !genrePageState.shows.length){
        await loadGenrePageResults({append:false});
    }else{
        renderActiveGenrePage();
    }
}

function attachGenreDetailPageEvents(){
    const backButton = document.getElementById("genre-page-back-button");
    if(backButton){
        backButton.addEventListener("click",function(){
            navigateBackOrRouteFallback("/app/discover");
        });
    }


    attachBrowseControlsEvents({source:"genre"});

    document.querySelectorAll(".genre-result-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaType = normalizeBrowseMediaType(this.dataset.mediaType || "tv");
            const mediaId = Number(this.dataset.mediaId || 0);
            if(!mediaId){
                return;
            }
            if(mediaType === "movie"){
                await openMoviePage(mediaId,{movieName:this.dataset.mediaName || ""});
                return;
            }
            await openDiscoverShowModal({
                id:mediaId,
                name:this.dataset.mediaName || this.dataset.showName || "",
                poster_path:this.dataset.posterPath || "",
                overview:this.dataset.overview || "",
                first_air_date:this.dataset.firstAirDate || ""
            });
        });
    });

    const moreButton = document.getElementById("genre-load-more-button");
    if(moreButton){
        moreButton.addEventListener("click",function(){
            if(!genrePageState.loading){
                loadGenrePageResults({append:true});
            }
        });
    }
}

function showDiscoveryFilterPageShell(navigationContext=""){
    activePage = "discovery-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    activatePrimaryNavContext(navigationContext || "discover");

    const pageElement = document.getElementById("genre-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function renderActiveDiscoveryFilterPage(){
    if(typeof renderDiscoveryFilterDetailPage === "function"){
        renderDiscoveryFilterDetailPage(discoveryPageState);
        attachDiscoveryFilterPageEvents();
    }
}

function discoveryFilterSupportsMediaSwitch(type){
    const cleanType = normalizeDiscoveryFilterType(type);
    return cleanType === "language" || cleanType === "country" || cleanType === "company" || cleanType === "provider" || cleanType === "year";
}

function discoveryFilterForcedMedia(type,value){
    const cleanType = normalizeDiscoveryFilterType(type);
    if(cleanType === "certification"){
        const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
        const parts = cleanValue.split("/");
        return normalizeBrowseMediaType(parts[0] || "tv");
    }
    if(cleanType === "discover-category"){
        const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
        const config = getDiscoverCategoryConfig(cleanValue);
        return config ? config.media : "tv";
    }
    return "tv";
}

function getDiscoveryPageMediaFromState(){
    const cleanType = normalizeDiscoveryFilterType(discoveryPageState && discoveryPageState.type);
    if(discoveryFilterSupportsMediaSwitch(cleanType) || cleanType === "theme"){
        return normalizeBrowseMediaType(discoveryPageState && discoveryPageState.media);
    }
    return discoveryFilterForcedMedia(cleanType,discoveryPageState && discoveryPageState.value);
}

function getDiscoveryPageFiltersFromState(){
    const media = getDiscoveryPageMediaFromState();
    const extras = createBrowseFilterState(media,discoveryPageState && discoveryPageState.browse ? discoveryPageState.browse : {
        year:discoveryPageState && discoveryPageState.year || "",
        sort:legacyDiscoverySortToBrowseSort(discoveryPageState && discoveryPageState.sort)
    });
    const browse = getDiscoveryBrowseState();
    return {
        media:browse.media,
        year:browse.year,
        sort:browseSortToLegacySort(browse.sort),
        browse,
        extras
    };
}

function normalizeBrowseResultItem(raw,media){
    if(!raw || !raw.id){
        return null;
    }
    const cleanMedia = normalizeBrowseMediaType(media || raw.media_type || "tv");
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

function buildDiscoveryFilterRequest(type,value,filters,page){
    const cleanType = normalizeDiscoveryFilterType(type);
    if(cleanType === "discover-category"){
        return {page:page};
    }
    const browse = filters && filters.browse
    ? createBrowseFilterState(filters.media,filters.browse)
    : getDiscoveryBrowseState();
    return buildBrowseDiscoverParams(browse,page);
}

async function resolveDiscoveryFilterPageName(type,value,existingName="",media="tv"){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    const cleanMedia = normalizeBrowseMediaType(media);
    const fallback = getDiscoveryFilterFallbackName(cleanType,cleanValue,cleanMedia);
    const supplied = String(existingName || "").trim();
    const mediaWord = getBrowseTitleMediaWord(cleanMedia);

    if(cleanType === "discover-category"){
        const config = getDiscoverCategoryConfig(cleanValue);
        return supplied || (config ? config.title : fallback);
    }

    if(cleanType === "network"){
        if(supplied && !/^Shows from Network \d+$/i.test(supplied)){
            return supplied;
        }
        try{
            const network = await tmdbGetNetworkDetails(cleanValue);
            if(network && network.name){
                return `Shows from ${network.name}`;
            }
            throw new Error("Network not found.");
        }catch(error){
            if(isTMDBNotFoundError(error)){
                throw error;
            }
        }
    }

    if(cleanType === "theme"){
        if(supplied && !/^(Shows|Movies) about Theme \d+$/i.test(supplied)){
            return supplied;
        }
        try{
            const keyword = await tmdbGetKeywordDetails(cleanValue);
            if(keyword && keyword.name){
                return `${mediaWord} about ${keyword.name}`;
            }
            throw new Error("Theme not found.");
        }catch(error){
            if(isTMDBNotFoundError(error)){
                throw error;
            }
        }
    }

    if(cleanType === "company"){
        if(supplied && !/^Shows from Company \d+$/i.test(supplied) && !/^Movies from Company \d+$/i.test(supplied)){
            return supplied;
        }
        try{
            const company = await tmdbGetCompanyDetails(cleanValue);
            if(company && company.name){
                return `${mediaWord} from ${company.name}`;
            }
            throw new Error("Company not found.");
        }catch(error){
            if(isTMDBNotFoundError(error)){
                throw error;
            }
        }
    }

    if(cleanType === "provider"){
        if(supplied && !/^Shows from Provider \d+$/i.test(supplied) && !/^Movies from Provider \d+$/i.test(supplied)){
            return supplied;
        }
        try{
            const provider = await tmdbGetWatchProviderDetails(cleanValue);
            if(provider && provider.name){
                return `${mediaWord} from ${provider.name}`;
            }
            throw new Error("Provider not found.");
        }catch(error){
            if(isTMDBNotFoundError(error)){
                throw error;
            }
        }
    }

    return supplied || fallback;
}

function getDiscoveryRouteValidationLabel(type,value,pageName){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    const name = String(pageName || "").trim();
    if(cleanType === "discover-category"){
        const config = getDiscoverCategoryConfig(cleanValue);
        return config ? config.title : name;
    }
    if(cleanType === "language"){
        return getLanguageName(cleanValue);
    }
    if(cleanType === "country"){
        return getDiscoveryCountryName(cleanValue);
    }
    if(cleanType === "network" || cleanType === "company" || cleanType === "provider"){
        return name
        .replace(/^Shows\s+from\s+/i,"")
        .replace(/^Movies\s+from\s+/i,"")
        .trim();
    }
    if(cleanType === "theme"){
        return name
        .replace(/^Shows\s+about\s+/i,"")
        .replace(/^Movies\s+about\s+/i,"")
        .trim();
    }
    return name;
}

async function loadDiscoveryFilterPageResults(options={}){
    const append = options && options.append === true;
    const cleanType = normalizeDiscoveryFilterType(discoveryPageState && discoveryPageState.type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,discoveryPageState && discoveryPageState.value);

    if(!cleanType || !cleanValue){
        discoveryPageState.error = "Page not found.";
        discoveryPageState.loading = false;
        renderActiveDiscoveryFilterPage();
        return;
    }

    const filters = getDiscoveryPageFiltersFromState();
    const media = filters.media;
    const nextPage = append ? Number(discoveryPageState.page || 1) + 1 : 1;
    const requestId = ++discoveryPageRequestId;
    const requestIsCurrent = ()=>requestId === discoveryPageRequestId && activePage === "discovery-detail" && selectedDiscoveryContext && String(selectedDiscoveryContext.type || "") === cleanType && String(selectedDiscoveryContext.value || "") === cleanValue && normalizeBrowseMediaType(discoveryPageState && discoveryPageState.media) === media;

    discoveryPageState.loading = true;
    discoveryPageState.error = "";
    if(!append){
        discoveryPageState.shows = [];
        discoveryPageState.page = 1;
        discoveryPageState.totalPages = 1;
    }
    renderActiveDiscoveryFilterPage();

    try{
        const existing = new Set((append ? discoveryPageState.shows : []).map(item=>`${item.media_type || media}:${item.id}`));
        const fresh = [];
        let totalPages = Number(discoveryPageState.totalPages || 1);
        let currentPage = nextPage;
        let lastPage = nextPage;

        const resolvedName = await resolveDiscoveryFilterPageName(cleanType,cleanValue,discoveryPageState.name,media);
        if(!requestIsCurrent()){
            return;
        }
        const validationLabel = getDiscoveryRouteValidationLabel(cleanType,cleanValue,resolvedName);

        if(cleanType !== "discover-category"){
            const canonicalDiscoveryRoute = getDiscoveryFilterDetailRoute(cleanType,cleanValue,validationLabel,media);
            if(canonicalDiscoveryRoute && canonicalDiscoveryRoute !== "/app/list/watching"){
                const browseApi = getBrowseStateAPI();
                const browseSearch = browseApi && typeof browseApi.serializeSearch === "function"
                ? browseApi.serializeSearch(createBrowseFilterState(media,discoveryPageState.browse || {}))
                : "";
                const canonicalRouteWithBrowse = canonicalDiscoveryRoute + browseSearch;
                setAppHashRoute(canonicalRouteWithBrowse,true);
                rememberRouteNavContext(canonicalRouteWithBrowse,"discover");
                discoveryPageState.routeSlug = buildRouteSlug(validationLabel);
            }
        }

        const categoryConfig = cleanType === "discover-category" ? getDiscoverCategoryConfig(cleanValue) : null;
        const categoryHasBrowseChanges = !!(categoryConfig && getBrowseStateHasAnyChoice(filters.browse));
        let categoryDateRange = null;
        if(categoryHasBrowseChanges && categoryConfig && categoryConfig.media === "movie" && (categoryConfig.category === "now-playing" || categoryConfig.category === "upcoming")){
            categoryDateRange = await ensureDiscoverCategoryDateRange(categoryConfig);
            if(!requestIsCurrent()){
                return;
            }
            if(!categoryDateRange){
                throw new Error("Could not resolve the category release window.");
            }
        }

        const shouldAutoRefillForEye = hasEyeHideOptions(filters.browse);
        let eyeRefillPagesFetched = 0;
        while((shouldAutoRefillForEye ? countEyeVisibleItems(fresh,media,filters.browse) : fresh.length) < DISCOVERY_GRID_PAGE_SIZE){
            let requestPath = categoryConfig ? categoryConfig.path : (media === "movie" ? "discover/movie" : "discover/tv");
            let params = buildDiscoveryFilterRequest(cleanType,cleanValue,filters,currentPage);
            if(categoryHasBrowseChanges){
                const categoryRequest = buildDiscoverCategoryBrowseRequest(categoryConfig,filters.browse,currentPage,categoryDateRange);
                if(!categoryRequest){
                    throw new Error("This category cannot be filtered accurately.");
                }
                requestPath = categoryRequest.path;
                params = categoryRequest.params;
            }
            const payload = await tmdbGetDiscoverPage(requestPath,params);
            if(!requestIsCurrent()){
                return;
            }
            if(categoryConfig && payload && payload.dates){
                const dates = validDiscoverCategoryDateRange(payload.dates);
                if(dates){
                    discoveryPageState.categoryDates = dates;
                }
            }
            totalPages = Number(payload.total_pages || currentPage || 1);
            lastPage = Number(payload.page || currentPage);

            (payload.results || []).forEach(raw=>{
                const item = normalizeBrowseResultItem(raw,media);
                const key = item ? `${item.media_type}:${item.id}` : "";
                if(!item || existing.has(key) || fresh.length >= DISCOVERY_GRID_PAGE_SIZE){
                    return;
                }
                existing.add(key);
                fresh.push(item);
            });

            eyeRefillPagesFetched += 1;
            const visibleTargetReached = (shouldAutoRefillForEye ? countEyeVisibleItems(fresh,media,filters.browse) : fresh.length) >= DISCOVERY_GRID_PAGE_SIZE;
            if(lastPage >= totalPages || visibleTargetReached || (shouldAutoRefillForEye && eyeRefillPagesFetched >= 3)){
                break;
            }
            currentPage = lastPage + 1;
        }

        discoveryPageState = Object.assign({},discoveryPageState,{
            type:cleanType,
            value:cleanValue,
            name:resolvedName,
            media:media,
            year:filters.browse.year,
            sort:browseSortToLegacySort(filters.browse.sort),
            browse:createBrowseFilterState(media,filters.extras || {}),
            page:lastPage,
            totalPages:totalPages,
            loading:false,
            error:"",
            shows:sortBrowseResultsForDisplay(append ? (discoveryPageState.shows || []).concat(fresh) : fresh,filters.browse,media)
        });

        renderActiveDiscoveryFilterPage();
    }catch(error){
        if(!requestIsCurrent()){
            return;
        }
        if(isTMDBNotFoundError(error)){
            renderAppRouteNotFoundPage();
            return;
        }
        discoveryPageState.loading = false;
        discoveryPageState.error = "Couldn’t load this page. Try again later.";
        renderActiveDiscoveryFilterPage();
    }
}

async function openDiscoveryFilterPage(type,value,options={}){
    const cleanType = normalizeDiscoveryFilterType(type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,value);
    if(!cleanType || !cleanValue){
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const suppliedName = String(options && options.name || "").trim();
    const routeLabel = String(options && options.routeLabel || "").trim();
    const routeSlug = buildRouteSlug(options && options.routeSlug || "");
    const requestedMedia = normalizeBrowseMediaType(options && options.media || "tv");
    const initialDiscoveryRoute = getDiscoveryFilterDetailRoute(cleanType,cleanValue,routeLabel || suppliedName,requestedMedia);
    const navigationContext = getDiscoveryNavContext(options,fromRoute ? getCurrentAppRoute() : initialDiscoveryRoute);
    const media = discoveryFilterSupportsMediaSwitch(cleanType)
    ? normalizeBrowseMediaType(options && options.media || (discoveryPageState && discoveryPageState.media) || "tv")
    : (cleanType === "theme" ? requestedMedia : discoveryFilterForcedMedia(cleanType,cleanValue));
    const isSamePage = activePage === "discovery-detail" &&
    selectedDiscoveryContext &&
    String(selectedDiscoveryContext.type || "") === cleanType &&
    String(selectedDiscoveryContext.value || "") === cleanValue &&
    normalizeBrowseMediaType(discoveryPageState && discoveryPageState.media) === media;

    selectedDiscoveryContext = {type:cleanType,value:cleanValue};
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedPersonContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    if(!isSamePage){
        const routeBrowseState = stripDiscoveryBaseFromBrowseExtras(cleanType,cleanValue,getBrowseQueryStateFromOptions(options,media),media);
        discoveryPageState = {
            type:cleanType,
            value:cleanValue,
            name:suppliedName || getDiscoveryFilterFallbackName(cleanType,cleanValue,media),
            routeSlug:routeSlug,
            media:media,
            year:routeBrowseState.year || "",
            sort:browseSortToLegacySort(routeBrowseState.sort),
            browse:routeBrowseState,
            browseLabels:createBrowseLabelState(options && options.browseLabels),
            page:1,
            totalPages:1,
            loading:false,
            error:"",
            shows:[]
        };
    }else{
        discoveryPageState.type = cleanType;
        discoveryPageState.value = cleanValue;
        discoveryPageState.routeSlug = routeSlug;
        discoveryPageState.media = media;
        if(options && options.browseState){
            discoveryPageState.browse = stripDiscoveryBaseFromBrowseExtras(cleanType,cleanValue,getBrowseQueryStateFromOptions(options,media),media);
        }
        if(suppliedName){
            discoveryPageState.name = suppliedName;
        }
    }

    showDiscoveryFilterPageShell(navigationContext);

    if(!(cleanType === "certification" && media === "tv")){
        ensureBrowseReferenceData(media).then(async()=>{
            const labels = await resolveBrowseLabels(getDiscoveryBrowseState(),discoveryPageState.browseLabels);
            if(activePage === "discovery-detail" && selectedDiscoveryContext && String(selectedDiscoveryContext.type || "") === cleanType && String(selectedDiscoveryContext.value || "") === cleanValue){
                discoveryPageState.browseLabels = labels;
                renderActiveDiscoveryFilterPage();
            }
        }).catch(()=>{});
    }

    if(!fromRoute){
        setAppHashRoute(initialDiscoveryRoute,replaceRoute);
        rememberRouteNavContext(initialDiscoveryRoute,navigationContext);
    }

    if(!isSamePage || !discoveryPageState.shows.length){
        await loadDiscoveryFilterPageResults({append:false});
    }else{
        renderActiveDiscoveryFilterPage();
    }
}

function attachDiscoveryFilterPageEvents(){
    const backButton = document.getElementById("discovery-filter-page-back-button");
    if(backButton){
        backButton.addEventListener("click",function(){
            navigateBackOrRouteFallback("/app/discover");
        });
    }

    attachBrowseControlsEvents({source:"discovery"});

    const mediaSelect = document.getElementById("discovery-filter-media-filter");
    if(mediaSelect){
        mediaSelect.addEventListener("change",function(){
            const nextMedia = normalizeBrowseMediaType(this.value);
            if(nextMedia === normalizeBrowseMediaType(discoveryPageState.media)){
                return;
            }
            discoveryPageState.media = nextMedia;
            discoveryPageState.name = getDiscoveryFilterFallbackName(discoveryPageState.type,discoveryPageState.value,discoveryPageState.media);
            const routeLabel = discoveryPageState.routeSlug || getDiscoveryRouteValidationLabel(discoveryPageState.type,discoveryPageState.value,discoveryPageState.name);
            const nextRoute = getDiscoveryFilterDetailRoute(discoveryPageState.type,discoveryPageState.value,routeLabel,discoveryPageState.media);
            if(nextRoute && nextRoute !== "/app/list/watching"){
                setAppHashRoute(nextRoute,false);
                rememberRouteNavContext(nextRoute,"discover");
            }
            loadDiscoveryFilterPageResults({append:false});
        });
    }

    const yearInput = document.getElementById("discovery-filter-year-filter");
    if(yearInput){
        yearInput.addEventListener("change",function(){
            const value = String(this.value || "").trim();
            discoveryPageState.year = /^\d{4}$/.test(value) ? value : "";
            this.value = discoveryPageState.year;
            loadDiscoveryFilterPageResults({append:false});
        });
    }

    const sortSelect = document.getElementById("discovery-filter-sort-filter");
    if(sortSelect){
        sortSelect.addEventListener("change",function(){
            discoveryPageState.sort = GENRE_PAGE_SORTS.has(this.value) ? this.value : "popularity.desc";
            loadDiscoveryFilterPageResults({append:false});
        });
    }

    document.querySelectorAll(".discovery-filter-result-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaType = normalizeBrowseMediaType(this.dataset.mediaType || "tv");
            const mediaId = Number(this.dataset.mediaId || 0);
            if(!mediaId){
                return;
            }
            if(mediaType === "movie"){
                await openMoviePage(mediaId,{movieName:this.dataset.mediaName || ""});
                return;
            }
            await openDiscoverShowModal({
                id:mediaId,
                name:this.dataset.mediaName || "",
                poster_path:this.dataset.posterPath || "",
                overview:this.dataset.overview || "",
                first_air_date:this.dataset.firstAirDate || ""
            });
        });
    });

    const moreButton = document.getElementById("discovery-filter-load-more-button");
    if(moreButton){
        moreButton.addEventListener("click",function(){
            if(!discoveryPageState.loading){
                loadDiscoveryFilterPageResults({append:true});
            }
        });
    }
}


function showBrowsePageShell(navigationContext=""){
    activePage = "browse-detail";
    document.querySelectorAll(".page").forEach(section=>section.classList.remove("active-page"));
    activatePrimaryNavContext(navigationContext || "discover");
    const pageElement = document.getElementById("genre-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function renderActiveBrowsePage(){
    if(typeof renderBrowseDetailPage === "function"){
        renderBrowseDetailPage(browsePageState);
        attachBrowsePageEvents();
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

async function loadBrowsePageResults(options={}){
    const append = options && options.append === true;
    const filters = createBrowseFilterState(browsePageState && browsePageState.media,browsePageState && browsePageState.filters || {});
    const media = filters.media;
    const nextPage = append ? Number(browsePageState.page || 1) + 1 : 1;
    const requestRoute = getBrowseRoute(filters);
    const requestId = ++browsePageRequestId;
    const requestIsCurrent = ()=>requestId === browsePageRequestId && activePage === "browse-detail" && getBrowseRoute(browsePageState && browsePageState.filters || {media}) === requestRoute;

    browsePageState.loading = true;
    browsePageState.error = "";
    browsePageState.filters = filters;
    browsePageState.media = media;
    if(!append){
        browsePageState.shows = [];
        browsePageState.page = 1;
        browsePageState.totalPages = 1;
    }
    renderActiveBrowsePage();

    try{
        const existing = new Set((append ? browsePageState.shows : []).map(item=>`${item.media_type || media}:${item.id}`));
        const fresh = [];
        let totalPages = Number(browsePageState.totalPages || 1);
        let currentPage = nextPage;
        let lastPage = nextPage;
        const path = media === "movie" ? "discover/movie" : "discover/tv";

        const shouldAutoRefillForEye = hasEyeHideOptions(filters);
        let eyeRefillPagesFetched = 0;
        while((shouldAutoRefillForEye ? countEyeVisibleItems(fresh,media,filters) : fresh.length) < DISCOVERY_GRID_PAGE_SIZE){
            const params = buildBrowseDiscoverParams(filters,currentPage);
            const payload = await tmdbGetDiscoverPage(path,params);
            if(!requestIsCurrent()){
                return;
            }
            totalPages = Number(payload.total_pages || currentPage || 1);
            lastPage = Number(payload.page || currentPage);

            (payload.results || []).forEach(raw=>{
                const item = normalizeBrowseResultItem(raw,media);
                const key = item ? `${item.media_type}:${item.id}` : "";
                if(!item || existing.has(key) || fresh.length >= DISCOVERY_GRID_PAGE_SIZE){
                    return;
                }
                existing.add(key);
                fresh.push(item);
            });

            eyeRefillPagesFetched += 1;
            const visibleTargetReached = (shouldAutoRefillForEye ? countEyeVisibleItems(fresh,media,filters) : fresh.length) >= DISCOVERY_GRID_PAGE_SIZE;
            if(lastPage >= totalPages || visibleTargetReached || (shouldAutoRefillForEye && eyeRefillPagesFetched >= 3)){
                break;
            }
            currentPage = lastPage + 1;
        }

        browsePageState = Object.assign({},browsePageState,{
            media,
            filters,
            page:lastPage,
            totalPages,
            loading:false,
            error:"",
            shows:sortBrowseResultsForDisplay(append ? (browsePageState.shows || []).concat(fresh) : fresh,filters,media)
        });
        renderActiveBrowsePage();
    }catch(error){
        if(!requestIsCurrent()){
            return;
        }
        browsePageState.loading = false;
        browsePageState.error = "Couldn’t load this page. Try again later.";
        renderActiveBrowsePage();
    }
}

async function openBrowsePage(state,options={}){
    const filters = createBrowseFilterState(options && options.media || state && state.media,state || {});
    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const navigationContext = getDiscoveryNavContext(options,fromRoute ? getCurrentAppRoute() : getBrowseRoute(filters));
    const route = getBrowseRoute(filters);
    const currentRoute = activePage === "browse-detail" && browsePageState && browsePageState.filters
    ? getBrowseRoute(browsePageState.filters)
    : "";
    const isSamePage = currentRoute === route;

    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedDiscoveryContext = null;
    selectedPersonContext = null;
    selectedMovieId = null;
    selectedCollectionId = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    if(!isSamePage){
        browsePageState = {
            media:filters.media,
            filters,
            labels:createBrowseLabelState(options && options.labels),
            page:1,
            totalPages:1,
            loading:false,
            error:"",
            shows:[]
        };
    }else{
        browsePageState.media = filters.media;
        browsePageState.filters = filters;
        browsePageState.labels = createBrowseLabelState(options && options.labels || browsePageState.labels);
    }

    showBrowsePageShell(navigationContext);

    if(!fromRoute){
        setAppHashRoute(route,replaceRoute);
        rememberRouteNavContext(route,navigationContext);
    }

    ensureBrowseReferenceData(filters.media).then(async()=>{
        const labels = await resolveBrowseLabels(filters,browsePageState.labels);
        if(activePage === "browse-detail" && getBrowseRoute(browsePageState.filters) === route){
            browsePageState.labels = labels;
            renderActiveBrowsePage();
        }
    }).catch(()=>{});

    if(!isSamePage || !browsePageState.shows.length){
        await loadBrowsePageResults({append:false});
    }else{
        renderActiveBrowsePage();
    }
}

async function navigateToBrowseState(nextState,labels={},options={}){
    if(activePage === "collection-detail"){
        const current = createCollectionDetailFilterState(collectionDetailPageState && collectionDetailPageState.filters || {});
        const next = createCollectionDetailFilterState(Object.assign({},current,nextState || {}));
        applyCollectionDetailFilterState(next,{replaceRoute:options && options.replaceRoute === true});
        return;
    }
    let cleanState = createBrowseFilterState(nextState && nextState.media,nextState || {});
    const cleanType = normalizeDiscoveryFilterType(discoveryPageState && discoveryPageState.type);
    const cleanValue = normalizeDiscoveryFilterValue(cleanType,discoveryPageState && discoveryPageState.value);

    if(activePage === "discovery-detail" && cleanType === "discover-category" && cleanValue){
        const config = getDiscoverCategoryConfig(cleanValue);
        if(config){
            cleanState = stripDiscoveryBaseFromBrowseExtras(cleanType,cleanValue,cleanState,config.media);
            discoveryPageState.browse = cleanState;
            discoveryPageState.browseLabels = createBrowseLabelState(labels);
            discoveryPageState.year = cleanState.year || "";
            discoveryPageState.sort = browseSortToLegacySort(cleanState.sort);
            const api = getBrowseStateAPI();
            const search = api && typeof api.serializeSearch === "function" ? api.serializeSearch(cleanState) : "";
            const route = getDiscoverCategoryDetailRoute(config.media,config.category) + search;
            setAppHashRoute(route,options && options.replaceRoute === true);
            rememberRouteNavContext(route,"discover");
            await loadDiscoveryFilterPageResults({append:false});
            return;
        }
    }

    await openBrowsePage(cleanState,{
        labels:createBrowseLabelState(labels),
        replaceRoute:options && options.replaceRoute === true,
        navigationContext:"discover"
    });
}

function updateBrowsePickerResults(type,query,results,error="",container=null){
    const targetId = type === "theme"
    ? "browse-theme-picker-results"
    : (type === "network" ? "browse-network-picker-results" : "browse-company-picker-results");
    const target = container || document.getElementById(targetId);
    if(!target){
        return;
    }
    const cleanQuery = String(query || "").trim();
    if(error){
        target.innerHTML = `<div class="browse-picker-empty">Couldn’t load matches.</div>`;
        return;
    }
    if(cleanQuery.length < 2){
        target.innerHTML = `<div class="browse-picker-empty">Type at least 2 characters.</div>`;
        return;
    }
    const state = getCurrentBrowseState();
    const selected = type === "theme" ? state.themes : (type === "network" ? [state.network].filter(Boolean) : state.companies);
    target.innerHTML = getBrowsePickerResultsHTML(results,type,selected);
}

function closeBrowseMenus(except=null){
    document.querySelectorAll(".browse-menu[open]").forEach(menu=>{
        if(menu !== except){
            menu.open = false;
        }
    });
}

function resetBrowseYearDropdown(){
    document.querySelectorAll("[data-browse-year-secondary-bar]").forEach(item=>item.remove());
}

function shiftBrowseYearDecade(button,delta){
    const strip = button && typeof button.closest === "function" ? button.closest(".browse-year-strip") : null;
    if(!strip){ return; }
    const currentYear = new Date().getFullYear();
    const currentDecade = Math.floor(currentYear / 10) * 10;
    const minDecade = Number(strip.dataset.browseMinDecade || 1870);
    const visibleDecade = Number(strip.dataset.browseYearDecade || currentDecade);
    const shift = Number(delta || 0);
    const nextDecade = Math.max(minDecade,Math.min(currentDecade,visibleDecade + shift));
    if(nextDecade === visibleDecade){ return; }

    strip.dataset.browseYearDecade = String(nextDecade);
    strip.dataset.browseCurrentDecade = String(currentDecade);
    const heading = strip.querySelector("[data-browse-decade-current]");
    const years = strip.querySelector("[data-browse-decade-years]");
    if(heading){ heading.textContent = `${nextDecade}s`; }
    if(years && typeof renderBrowseDecadeYearsHTML === "function"){
        years.innerHTML = renderBrowseDecadeYearsHTML(nextDecade,getCurrentBrowseState());
    }
    const previous = strip.querySelector('[data-browse-year-shift="-10"]');
    const next = strip.querySelector('[data-browse-year-shift="10"]');
    if(previous){ previous.disabled = nextDecade <= minDecade; }
    if(next){ next.disabled = nextDecade >= currentDecade; }
}

function filterBrowseListFromInput(input){
    const type = String(input && input.dataset && input.dataset.browseListSearch || "");
    const menu = input && typeof input.closest === "function" ? input.closest(".browse-menu") : null;
    if(!type || !menu){
        return;
    }
    const query = String(input.value || "").trim().toLowerCase();
    menu.querySelectorAll(`[data-browse-list="${type}"] [data-browse-option-label]`).forEach(option=>{
        const searchable = String(option.dataset.browseOptionSearch || option.dataset.browseOptionLabel || "").toLowerCase();
        option.hidden = !!query && !searchable.includes(query);
    });
}

function scheduleBrowsePickerSearch(input){
    clearTimeout(browsePickerSearchTimer);
    const type = String(input && input.dataset && input.dataset.browsePickerSearch || "");
    const query = String(input && input.value || "").trim();
    const section = input && typeof input.closest === "function" ? input.closest(".browse-other-section") : null;
    const container = section ? section.querySelector(".browse-picker-results") : null;
    const requestId = ++browsePickerSearchRequestId;

    updateBrowsePickerResults(type,query,[],"",container);
    if(query.length < 2){
        return;
    }
    if(container){
        container.innerHTML = `<div class="browse-picker-empty">Searching…</div>`;
    }

    browsePickerSearchTimer = setTimeout(async()=>{
        try{
            const results = await searchBrowsePicker(type,query);
            if(requestId !== browsePickerSearchRequestId || !input.isConnected || String(input.value || "").trim() !== query){
                return;
            }
            updateBrowsePickerResults(type,query,results,"",container);
        }catch(error){
            if(requestId !== browsePickerSearchRequestId || !input.isConnected || String(input.value || "").trim() !== query){
                return;
            }
            updateBrowsePickerResults(type,query,[],"error",container);
        }
    },220);
}


async function handleEyeFilterToggle(key){
    const cleanKey = String(key || "").trim();
    if(!EYE_FILTER_KEYS.includes(cleanKey)){
        return;
    }

    if(activePage === "search"){
        const next = toggleEyeFilterOption(searchRouteState || {},cleanKey);
        applyEyeFilterState(searchRouteState,next);
        if(discoverSearchState){
            applyEyeFilterState(discoverSearchState,next);
        }
        const query = String(searchRouteState && searchRouteState.query || "").trim();
        const media = normalizeSearchMediaType(searchRouteState && searchRouteState.media || "tv");
        if(typeof setAppHashRoute === "function"){
            setAppHashRoute(getSearchRoute(query,media,searchRouteState),false);
        }
        if(query.length >= 2 && media !== "person" && hasEyeHideOptions(searchRouteState)){
            await searchShows(query,{skipRoute:true});
            return;
        }
        if(typeof renderSearchResults === "function"){
            renderSearchResults(lastDiscoverSearchResults || []);
        }
        return;
    }

    if(activePage === "person-detail"){
        const next = toggleEyeFilterOption(personPageState || {},cleanKey);
        applyEyeFilterState(personPageState,next);
        const personName = personPageState && personPageState.person ? personPageState.person.name : (personPageState && personPageState.routeSlug || "");
        const route = getPersonDetailRoute(personPageState && personPageState.role || "",personPageState && personPageState.personId || "",personName,personPageState && personPageState.media || "tv",personPageState);
        if(route && route !== "/app/list/watching" && typeof setAppHashRoute === "function"){
            setAppHashRoute(route,false);
            rememberRouteNavContext(route,"discover");
        }
        renderActivePersonPage();
        return;
    }

    if(activePage === "collection-detail"){
        const current = createCollectionDetailFilterState(collectionDetailPageState && collectionDetailPageState.filters || {});
        const nextEye = toggleEyeFilterOption(current,cleanKey);
        applyCollectionDetailFilterState(Object.assign({},current,nextEye));
        return;
    }

    const api = getBrowseStateAPI();
    if(api && typeof api.toggleEyeOption === "function"){
        const next = api.toggleEyeOption(getCurrentBrowseState(),cleanKey);
        await navigateToBrowseState(next,getCurrentBrowseLabels());
    }
}

function ensureBrowseGlobalInteractionEvents(){
    if(browseGlobalEventsBound){
        return;
    }
    browseGlobalEventsBound = true;

    document.addEventListener("pointerdown",function(event){
        const target = event && event.target;
        if(target && typeof target.closest === "function" && target.closest(".browse-menu")){
            return;
        }
        keepEyeFilterMenuOpen = false;
        closeBrowseMenus();
    });

    document.addEventListener("keydown",function(event){
        if(event && event.key === "Escape"){
            closeBrowseMenus();
        }
    });

    document.addEventListener("input",function(event){
        const target = event && event.target;
        if(!target || !target.dataset){
            return;
        }
        if(target.dataset.browseListSearch){
            filterBrowseListFromInput(target);
            return;
        }
        if(target.dataset.browsePickerSearch){
            scheduleBrowsePickerSearch(target);
        }
    });

    document.addEventListener("click",async function(event){
        const target = event && event.target;
        if(!target || typeof target.closest !== "function"){
            return;
        }

        const summary = target.closest(".browse-menu > summary");
        if(summary){
            const menu = summary.parentElement;
            if(menu && menu.classList && menu.classList.contains("eye-filter-menu")){
                keepEyeFilterMenuOpen = !menu.open;
            }else{
                keepEyeFilterMenuOpen = false;
            }
            if(menu && !menu.open){
                resetBrowseYearDropdown(menu);
            }
            closeBrowseMenus(menu);
            return;
        }

        const eyeToggleButton = target.closest("[data-eye-toggle]");
        if(eyeToggleButton){
            event.preventDefault();
            event.stopPropagation();
            keepEyeFilterMenuOpen = true;
            await handleEyeFilterToggle(eyeToggleButton.dataset.eyeToggle || "");
            return;
        }

        const decadeShiftButton = target.closest("[data-browse-year-shift]");
        if(decadeShiftButton){
            event.preventDefault();
            event.stopPropagation();
            shiftBrowseYearDecade(decadeShiftButton,decadeShiftButton.dataset.browseYearShift);
            return;
        }

        const decadeOpenButton = target.closest("[data-browse-year-open-decade]");
        if(decadeOpenButton){
            event.preventDefault();
            event.stopPropagation();
            const decade = Number(decadeOpenButton.dataset.browseYearOpenDecade || 0);
            const api = getBrowseStateAPI();
            if(decade && api && typeof api.setSingle === "function"){
                const next = api.setSingle(getCurrentBrowseState(),"decade",String(decade));
                await navigateToBrowseState(next,getCurrentBrowseLabels());
            }else{
                const controls = decadeOpenButton.closest(".browse-controls");
                const bar = controls ? controls.querySelector(".browse-bar") : null;
                if(decade && controls && bar && typeof renderBrowseYearSecondaryBarHTML === "function"){
                    controls.querySelectorAll("[data-browse-year-secondary-bar]").forEach(item=>item.remove());
                    bar.insertAdjacentHTML("afterend",renderBrowseYearSecondaryBarHTML(decade,getCurrentBrowseState()));
                    closeBrowseMenus();
                }
            }
            return;
        }

        const showDecadesButton = target.closest("[data-browse-year-show-decades]");
        if(showDecadesButton){
            event.preventDefault();
            event.stopPropagation();
            const controls = showDecadesButton.closest(".browse-controls");
            if(controls){
                controls.querySelectorAll("[data-browse-year-secondary-bar]").forEach(item=>item.remove());
                const yearMenu = controls.querySelector(".browse-menu-year");
                if(yearMenu){ yearMenu.open = true; }
            }
            return;
        }

        const mediaButton = target.closest("[data-browse-media]");
        if(mediaButton){
            if(mediaButton.tagName === "A" && typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){
                return;
            }
            if(mediaButton.tagName === "A"){
                event.preventDefault();
            }
            const targetMedia = normalizeBrowseMediaType(mediaButton.dataset.browseMedia || "tv");
            if(activePage === "discover"){
                discoverGenreMedia = targetMedia;
                await ensureBrowseReferenceData(targetMedia);
                if(typeof renderDiscoverHub === "function"){
                    renderDiscoverHub();
                }
                return;
            }
            const current = getCurrentBrowseState();
            if(current.media === targetMedia){
                return;
            }
            const mapped = await mapBrowseGenresForMedia(current,targetMedia,getCurrentBrowseLabels());
            await navigateToBrowseState(mapped.state,mapped.labels);
            return;
        }

        const singleButton = target.closest("[data-browse-set-single]");
        if(singleButton){
            const api = getBrowseStateAPI();
            if(!api || typeof api.setSingle !== "function"){
                return;
            }
            const key = String(singleButton.dataset.browseSetSingle || "");
            const value = String(singleButton.dataset.browseValue || "");
            const next = api.setSingle(getCurrentBrowseState(),key,key === "upcoming" ? value === "1" : value);
            const labels = getCurrentBrowseLabels();
            const label = String(singleButton.dataset.browseLabel || "");
            if(key === "network" && value && label){
                setBrowseLabel(labels,"networks",value,label);
            }
            await navigateToBrowseState(next,labels);
            return;
        }

        const sortButton = target.closest("[data-browse-set-sort]");
        if(sortButton){
            const api = getBrowseStateAPI();
            if(!api || typeof api.setSingle !== "function"){
                return;
            }
            const next = api.setSingle(getCurrentBrowseState(),"sort",sortButton.dataset.browseSetSort || "popularity-desc");
            await navigateToBrowseState(next,getCurrentBrowseLabels());
            return;
        }

        const multiButton = target.closest("[data-browse-toggle-multi]");
        if(multiButton){
            const api = getBrowseStateAPI();
            if(!api || typeof api.toggleMulti !== "function"){
                return;
            }
            const group = String(multiButton.dataset.browseToggleMulti || "");
            const value = String(multiButton.dataset.browseValue || "");
            const label = String(multiButton.dataset.browseLabel || "");
            const labels = getCurrentBrowseLabels();
            const next = api.toggleMulti(getCurrentBrowseState(),group,value);
            const labelGroup = group === "themes" ? "themes" : (group === "companies" ? "companies" : (group === "genres" ? "genres" : (group === "providers" ? "providers" : "")));
            if(labelGroup && label){
                setBrowseLabel(labels,labelGroup,value,label);
            }
            await navigateToBrowseState(next,labels);
            return;
        }

        const removeButton = target.closest("[data-browse-remove]");
        if(removeButton){
            const api = getBrowseStateAPI();
            if(!api || typeof api.removeValue !== "function"){
                return;
            }
            const key = String(removeButton.dataset.browseRemove || "");
            const value = String(removeButton.dataset.browseValue || "");
            const next = api.removeValue(getCurrentBrowseState(),key,value);
            await navigateToBrowseState(next,getCurrentBrowseLabels());
            return;
        }

        const clearButton = target.closest("[data-browse-clear]");
        if(clearButton){
            const api = getBrowseStateAPI();
            const current = getCurrentBrowseState();
            const next = api && typeof api.clearFilters === "function" ? api.clearFilters(current) : createBrowseFilterState(current.media);
            await navigateToBrowseState(next,createBrowseLabelState());
        }
    });
}

function attachBrowseControlsEvents(){
    ensureBrowseGlobalInteractionEvents();
}

function attachBrowsePageEvents(){
    const backButton = document.getElementById("browse-page-back-button");
    if(backButton){
        backButton.addEventListener("click",function(){
            navigateBackOrRouteFallback("/app/discover");
        });
    }
    attachBrowseControlsEvents({source:"browse"});

    document.querySelectorAll(".browse-result-card[data-media-id]").forEach(card=>{
        card.addEventListener("click",async function(event){
            if(typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){ return; }
            event.preventDefault();
            const mediaType = normalizeBrowseMediaType(this.dataset.mediaType || "tv");
            const mediaId = Number(this.dataset.mediaId || 0);
            if(!mediaId){ return; }
            const backRoute = getBrowseRoute(getCurrentBrowseState());
            if(mediaType === "movie"){
                await openMoviePage(mediaId,{movieName:this.dataset.mediaName || "",navigationContext:"discover",backRoute});
                return;
            }
            await openShowDetailsPage(mediaId,{showName:this.dataset.mediaName || "",navigationContext:"discover",backRoute});
        });
    });

    const moreButton = document.getElementById("browse-load-more-button");
    if(moreButton){
        moreButton.addEventListener("click",function(){
            if(!browsePageState.loading){
                loadBrowsePageResults({append:true});
            }
        });
    }
}

function restoreShowDetailScrollPositionIfNeeded(){
    if(!showDetailScrollRestorePending){
        return;
    }

    showDetailScrollRestorePending = false;

    requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
            const page = document.getElementById("show-detail-page");
            if(page){
                page.scrollTop = Math.max(0,Number(showDetailScrollTopBeforeEpisode || 0));
            }
        });
    });
}

function getShowForDetailPage(showId){
    const id = String(showId || selectedShowId || "");

    if(DATA && DATA.shows && DATA.shows[id]){
        return DATA.shows[id];
    }

    if(showDetailPreview && String(showDetailPreview.tmdb_id) === id){
        return showDetailPreview;
    }

    return null;
}

function showShowDetailPageShell(navigationContext=""){
    activePage = "show-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    activatePrimaryNavContext(navigationContext || "shows");

    const pageElement = document.getElementById("show-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }

}

function renderShowDetailLoading(showId){
    const content = document.getElementById("show-detail-content");
    if(!content){
        return;
    }

    content.innerHTML = typeof renderTrackerDetailSkeletonHTML === "function"
    ? renderTrackerDetailSkeletonHTML("show","show-page-back-button")
    : `
        <div class="show-detail-page-inner">
            <button type="button" class="show-page-back-button" id="show-page-back-button" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <div class="empty-state show-detail-loading-state">
                <h2>Loading show</h2>
                <p>Getting details.</p>
            </div>
        </div>
    `;

    const backButton = document.getElementById("show-page-back-button");
    if(backButton){
        backButton.addEventListener("click",closeShowDetailsPage);
    }
}

function resetShowDetailScrollPosition(){
    const page = document.getElementById("show-detail-page");

    if(page){
        page.scrollTop = 0;
    }
}



function renderShowDetailError(message){
    const content = document.getElementById("show-detail-content");
    if(!content){
        return;
    }

    content.innerHTML = `
        <div class="show-detail-page-inner">
            <button type="button" class="show-page-back-button" id="show-page-back-button" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <div class="empty-state show-detail-loading-state">
                <h2>Show details failed to load</h2>
                <p>Try again later.</p>
            </div>
        </div>
    `;

    const backButton = document.getElementById("show-page-back-button");
    if(backButton){
        backButton.addEventListener("click",closeShowDetailsPage);
    }
}

function renderShowDetailNotFound(){
    renderAppRouteNotFoundPage();
}

function normalizeMovieDetails(movie){
    if(!movie || !movie.id){
        return null;
    }
    const releaseDate = String(movie.release_date || "");
    const watchProviders = movie["watch/providers"] || movie._tmdb_watch_providers || null;
    const releaseDates = movie.release_dates || movie._tmdb_release_dates || null;
    const credits = movie.credits || movie._tmdb_credits || {cast:[],crew:[]};

    return {
        id:Number(movie.id || 0),
        tmdb_id:Number(movie.id || 0),
        title:movie.title || movie.original_title || "Untitled",
        original_title:movie.original_title || "",
        overview:movie.overview || "",
        poster_path:movie.poster_path || "",
        backdrop_path:movie.backdrop_path || "",
        release_date:releaseDate,
        year:releaseDate ? releaseDate.slice(0,4) : "",
        runtime:Number(movie.runtime || 0),
        budget:Number(movie.budget || 0),
        revenue:Number(movie.revenue || 0),
        status:movie.status || "",
        original_language:movie.original_language || "",
        tagline:movie.tagline || "",
        homepage:movie.homepage || "",
        vote_average:Number(movie.vote_average || 0),
        vote_count:Number(movie.vote_count || 0),
        adult:movie.adult === true,
        genres:Array.isArray(movie.genres) ? movie.genres.map(genre=>genre && genre.name).filter(Boolean) : [],
        genre_items:Array.isArray(movie.genres) ? movie.genres : [],
        production_companies:Array.isArray(movie.production_companies) ? movie.production_companies : [],
        production_countries:Array.isArray(movie.production_countries) ? movie.production_countries : [],
        spoken_languages:Array.isArray(movie.spoken_languages) ? movie.spoken_languages : [],
        external_ids:movie.external_ids || {},
        videos:movie.videos || {results:[]},
        credits:credits,
        cast:Array.isArray(credits.cast) ? credits.cast : [],
        crew:Array.isArray(credits.crew) ? credits.crew : [],
        release_dates:releaseDates,
        watch_providers:watchProviders,
        similar:normalizeTMDBSimilarMovies(movie.similar,10),
        keywords:movie.keywords || {keywords:[]}
    };
}

async function tmdbGetMovieDetails(movieId){
    return await tmdbFetchJSON(
        "movie/" + encodeURIComponent(String(movieId)),
        {append_to_response:"external_ids,videos,release_dates,watch/providers,credits,similar,keywords"}
    );
}

function showMovieDetailPageShell(navigationContext=""){
    activePage = "movie-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    activatePrimaryNavContext(navigationContext || "shows");

    const pageElement = document.getElementById("show-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
        pageElement.scrollTop = 0;
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function closeMoviePage(){
    selectedMovieId = null;
    moviePageState = {
        movieId:"",
        routeSlug:"",
        loading:false,
        error:"",
        movie:null
    };

    navigateBackToStoredRouteOrFallback(getNavigationFallbackRoute("/app/discover"));
}

function renderMovieDetailLoading(){
    const content = document.getElementById("show-detail-content");
    if(!content){
        return;
    }
    content.innerHTML = typeof renderTrackerDetailSkeletonHTML === "function"
    ? renderTrackerDetailSkeletonHTML("movie","movie-page-back-button")
    : `
        <div class="show-detail-page-inner">
            <button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <div class="empty-state show-detail-loading-state">
                <h2>Loading movie</h2>
                <p>Getting details.</p>
            </div>
        </div>
    `;
    const backButton = document.getElementById("movie-page-back-button");
    if(backButton){
        backButton.addEventListener("click",closeMoviePage);
    }
}

function renderMovieDetailNotFound(){
    renderAppRouteNotFoundPage();
}

function renderMovieDetailError(){
    const content = document.getElementById("show-detail-content");
    if(!content){
        return;
    }
    content.innerHTML = `
        <div class="show-detail-page-inner">
            <button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <div class="empty-state show-detail-loading-state">
                <h2>Movie details failed to load</h2>
                <p>Couldn’t load this page. Try again later.</p>
            </div>
        </div>
    `;
    const backButton = document.getElementById("movie-page-back-button");
    if(backButton){
        backButton.addEventListener("click",closeMoviePage);
    }
}

function renderActiveMoviePage(){
    if(typeof renderMovieDetailPage === "function"){
        renderMovieDetailPage(moviePageState);
        attachMovieDetailPageEvents();
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function attachMovieDetailPageEvents(){
    const backButton = document.getElementById("movie-page-back-button");
    if(backButton){
        backButton.addEventListener("click",closeMoviePage);
    }

    document.querySelectorAll("[data-movie-detail-tab]").forEach(button=>{
        button.addEventListener("click",function(){
            activeMovieDetailsTab = this.dataset.movieDetailTab || "Info";
            renderActiveMoviePage();
        });
    });

    document.querySelectorAll("[data-movie-tracking-action]").forEach(button=>{
        button.addEventListener("click",async function(){
            if(this.disabled || !moviePageState || !moviePageState.movie){
                return;
            }
            this.disabled = true;
            try{
                await updateMovieTracking(moviePageState.movie,this.dataset.movieTrackingAction || "");
            }finally{
                if(this.isConnected){
                    this.disabled = false;
                }
            }
        });
    });

    const closeMovieReleaseSortMenus = function(exceptMenu){
        document.querySelectorAll("[data-movie-release-sort-menu]").forEach(menu=>{
            if(menu === exceptMenu){
                return;
            }
            menu.hidden = true;
            const wrap = menu.closest(".movie-release-sort-menu-wrap");
            if(wrap){
                wrap.classList.remove("open");
                const toggle = wrap.querySelector("[data-movie-release-sort-toggle]");
                if(toggle){
                    toggle.setAttribute("aria-expanded","false");
                }
            }
        });
    };

    document.querySelectorAll("[data-movie-release-sort-toggle]").forEach(button=>{
        button.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();
            const wrap = this.closest(".movie-release-sort-menu-wrap");
            const menu = wrap ? wrap.querySelector("[data-movie-release-sort-menu]") : null;
            if(!menu){
                return;
            }
            const willOpen = menu.hidden;
            closeMovieReleaseSortMenus(willOpen ? menu : null);
            menu.hidden = !willOpen;
            wrap.classList.toggle("open",willOpen);
            this.setAttribute("aria-expanded",willOpen ? "true" : "false");
        });
    });

    document.querySelectorAll("[data-movie-release-sort-option]").forEach(button=>{
        button.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();
            const nextSort = String(this.dataset.movieReleaseSortOption || "date").toLowerCase();
            if(nextSort !== "country" && nextSort !== "date"){
                return;
            }
            activeMovieReleaseSort = nextSort;
            renderActiveMoviePage();
        });
    });

    if(typeof window !== "undefined" && !window.tvTrackerMovieReleaseSortOutsideBound){
        window.tvTrackerMovieReleaseSortOutsideBound = true;
        document.addEventListener("click",function(){
            document.querySelectorAll("[data-movie-release-sort-menu]").forEach(menu=>{
                menu.hidden = true;
                const wrap = menu.closest(".movie-release-sort-menu-wrap");
                if(wrap){
                    wrap.classList.remove("open");
                    const toggle = wrap.querySelector("[data-movie-release-sort-toggle]");
                    if(toggle){
                        toggle.setAttribute("aria-expanded","false");
                    }
                }
            });
        });
    }

    document.querySelectorAll(".show-genre-link[data-genre-name]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openGenrePage !== "function" || (typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event))){
                return;
            }
            event.preventDefault();
            openGenrePage(this.dataset.genreKey || this.dataset.genreName || this.textContent || "",{media:this.dataset.genreMedia || "movie"});
        });
    });

    document.querySelectorAll("[data-discovery-type][data-discovery-value]").forEach(link=>{
        link.addEventListener("click",function(event){
            if(typeof openDiscoveryFilterPage !== "function" || (typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event))){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openDiscoveryFilterPage(this.dataset.discoveryType,this.dataset.discoveryValue,{name:this.dataset.discoveryName || "",routeLabel:this.dataset.discoveryLabel || "",media:this.dataset.discoveryMedia || ""});
        });
    });

    document.querySelectorAll("[data-movie-similar-open]").forEach(link=>{
        link.addEventListener("click",async function(event){
            if(typeof isPlainAppLinkClick === "function" && !isPlainAppLinkClick(event)){
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const id = Number(this.dataset.movieSimilarOpen || 0);
            if(!id){
                return;
            }
            const backRoute = moviePageState && moviePageState.movie
            ? getMovieDetailRoute(moviePageState.movie.id,moviePageState.movie.title || "")
            : "";
            await openMoviePage(id,{movieName:this.dataset.movieSimilarName || "",backRoute});
        });
    });

    if(typeof attachV2RailScrollEvents === "function"){
        attachV2RailScrollEvents();
    }
}

async function openMoviePage(movieId,options={}){
    const id = normalizeRouteId(movieId);
    if(!id){
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const routeSlug = buildRouteSlug(options && options.routeSlug || "");
    const routeLabel = String(options && (options.movieName || options.routeLabel) || "").trim();
    const initialMovieRoute = getMovieDetailRoute(id,routeLabel);
    const navigationContext = getDetailNavContext("movie",options,fromRoute ? getCurrentAppRoute() : initialMovieRoute);

    selectedMovieId = id;
    selectedShowId = null;
    selectedEpisodeContext = null;
    selectedGenreSlug = null;
    selectedGenreMedia = "tv";
    selectedDiscoveryContext = null;
    selectedPersonContext = null;
    showDetailPreview = null;
    discoverPreviewShow = null;

    if(!fromRoute){
        if(options && options.backRoute){
            pushExplicitDetailBackRoute(options.backRoute);
        }else{
            pushDetailBackRoute(getMovieDetailRoute(id,routeLabel));
        }
    }

    activeMovieDetailsTab = "Info";
    activeMovieReleaseSort = "date";

    moviePageState = {
        movieId:id,
        routeSlug:routeSlug,
        loading:true,
        error:"",
        movie:null
    };

    showMovieDetailPageShell(navigationContext);
    renderMovieDetailLoading();

    if(!fromRoute){
        setAppHashRoute(initialMovieRoute,replaceRoute);
        rememberRouteNavContext(initialMovieRoute,navigationContext);
    }

    try{
        const details = await tmdbGetMovieDetails(id);
        if(String(selectedMovieId || "") !== id){
            return;
        }
        const movie = normalizeMovieDetails(details);
        if(!movie){
            renderMovieDetailNotFound();
            return;
        }
        const canonicalMovieRoute = getMovieDetailRoute(id,movie.title);
        moviePageState = {
            movieId:id,
            routeSlug:buildRouteSlug(movie.title),
            loading:false,
            error:"",
            movie:movie
        };
        if(canonicalMovieRoute && canonicalMovieRoute !== "/app/list/watching"){
            setAppHashRoute(canonicalMovieRoute,true);
            rememberRouteNavContext(canonicalMovieRoute,navigationContext);
        }
        renderActiveMoviePage();
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
    }catch(error){
        if(isTMDBNotFoundError(error)){
            renderAppRouteNotFoundPage();
            return;
        }
        moviePageState.loading = false;
        moviePageState.error = "Couldn’t load this page. Try again later.";
        renderMovieDetailError();
    }
}

function pushShowDetailBackRoute(showId,showInfo=""){
    pushDetailBackRoute(getShowDetailRoute(showId,showInfo));
}

async function openShowDetailsPage(showId,options={}){
    const id = String(showId || "");

    if(!id){
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const routeSlug = buildRouteSlug(options && options.routeSlug || "");
    const initialShowRoute = getShowDetailRoute(id,options && options.showName || "");
    const navigationContext = getDetailNavContext("show",options,fromRoute ? getCurrentAppRoute() : initialShowRoute);
    const returningEpisodeContext = selectedEpisodeContext && String(selectedEpisodeContext.showId) === id
    ? selectedEpisodeContext
    : null;
    const shouldResetShowScroll = !returningEpisodeContext;

    if(returningEpisodeContext){
        expandedSeasons[id] = expandedSeasons[id] || {};
        expandedSeasons[id][String(returningEpisodeContext.season)] = true;
        showDetailScrollRestorePending = true;
    }else{
        activeShowDetailsTabs[id] = "Info";
        activeShowInfoTabs[id] = "Cast";
    }

    selectedEpisodeContext = null;
    selectedPersonContext = null;
    selectedMovieId = null;
    selectedShowId = id;
    discoverPreviewShow = null;

    if(!fromRoute){
        if(options && options.backRoute){
            pushExplicitDetailBackRoute(options.backRoute);
        }else{
            pushShowDetailBackRoute(id,options && options.showName || "");
        }
    }

    showShowDetailPageShell(navigationContext);

    if(shouldResetShowScroll){
        resetShowDetailScrollPosition();
    }

    renderShowDetailLoading(id);

    if(shouldResetShowScroll){
        resetShowDetailScrollPosition();
    }

    if(!fromRoute){
        setAppHashRoute(initialShowRoute,replaceRoute);
        rememberRouteNavContext(initialShowRoute,navigationContext);
    }

    const trackedShow = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;

    if(trackedShow){
        showDetailPreview = null;
        expandedSeasons[id] = expandedSeasons[id] || {};
        const canonicalShowRoute = getShowDetailRoute(id,trackedShow);
        if(canonicalShowRoute && canonicalShowRoute !== "/app/list/watching"){
            setAppHashRoute(canonicalShowRoute,true);
            rememberRouteNavContext(canonicalShowRoute,navigationContext);
        }
        renderShowDetailsPage(trackedShow,{preview:false});
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
        if(shouldResetShowScroll){
            resetShowDetailScrollPosition();
        }
        restoreShowDetailScrollPositionIfNeeded();
        if((!Array.isArray(trackedShow.genre_items) || !trackedShow.genre_items.length) && Array.isArray(trackedShow.genres) && trackedShow.genres.length && typeof ensureBrowseReferenceData === "function"){
            ensureBrowseReferenceData("tv").then(()=>{
                if(String(selectedShowId || "") === id && DATA.shows && DATA.shows[id] === trackedShow){
                    renderShowDetailsPagePreservingScroll(trackedShow);
                }
            }).catch(()=>{});
        }
        refreshOpenTrackedShowMetadata(id).catch(()=>{});
        return;
    }

    if(showDetailPreview && String(showDetailPreview.tmdb_id) === id){
        expandedSeasons[id] = expandedSeasons[id] || {};
        const canonicalShowRoute = getShowDetailRoute(id,showDetailPreview);
        if(canonicalShowRoute && canonicalShowRoute !== "/app/list/watching"){
            setAppHashRoute(canonicalShowRoute,true);
            rememberRouteNavContext(canonicalShowRoute,navigationContext);
        }
        renderShowDetailsPage(showDetailPreview,{preview:true});
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
        if(shouldResetShowScroll){
            resetShowDetailScrollPosition();
        }
        restoreShowDetailScrollPositionIfNeeded();
        return;
    }

    try{
        const details = await tmdbGetShowDetails(id);
        if(String(selectedShowId || "") !== id){
            return;
        }
        const showObject = createShowObject(details,"");
        showObject.status = "";
        showObject._preview_only = true;
        showDetailPreview = showObject;
        expandedSeasons[id] = expandedSeasons[id] || {};
        const canonicalShowRoute = getShowDetailRoute(id,showObject);
        if(canonicalShowRoute && canonicalShowRoute !== "/app/list/watching"){
            setAppHashRoute(canonicalShowRoute,true);
            rememberRouteNavContext(canonicalShowRoute,navigationContext);
        }
        renderShowDetailsPage(showObject,{preview:true});
        if(typeof updateShellTitle === "function"){
            updateShellTitle();
        }
        ensureShowV2Keywords(showObject,{skipSave:true}).then(changed=>{
            if(changed && showDetailPreview && String(showDetailPreview.tmdb_id) === id && selectedEpisodeContext === null){
                renderShowDetailsPagePreservingScroll(showDetailPreview);
            }
        }).catch(()=>{});
        if(shouldResetShowScroll){
            resetShowDetailScrollPosition();
        }
        restoreShowDetailScrollPositionIfNeeded();
    }catch(error){
        if(isTMDBNotFoundError(error)){
            renderAppRouteNotFoundPage();
            return;
        }
        renderShowDetailError(friendlyTMDBSearchError(error));
        showToast(friendlyTMDBSearchError(error));
    }
}

async function openShowModal(showId){
    return openShowDetailsPage(showId);
}

function renderActiveShowDetailPage(){
    const show = getShowForDetailPage(selectedShowId);

    if(show){
        renderShowDetailsPage(show,{preview:!(DATA.shows && DATA.shows[String(show.tmdb_id)])});
    }else if(selectedShowId){
        renderShowDetailLoading(selectedShowId);
    }
    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }
}

function closeShowDetailsPage(){
    selectedShowId = null;
    selectedEpisodeContext = null;
    showDetailPreview = null;

    navigateBackToStoredRouteOrFallback(getNavigationFallbackRoute("/app/list/watching"));
}

function closeShowModal(){
    selectedEpisodeContext = null;

    const modal = document.getElementById("show-modal");
    if(modal){
        modal.classList.remove("episode-detail-overlay");
        modal.classList.remove("show-detail-overlay");
        modal.classList.remove("modal-preparing");
        modal.style.display = "none";
    }

    const modalContent = document.getElementById("show-modal-content");
    if(modalContent){
        modalContent.innerHTML = "";
    }

    const episodeContent = document.getElementById("episode-detail-content");
    if(episodeContent){
        episodeContent.innerHTML = "";
    }
}

function showEpisodeDetailPageShell(navigationContext=""){
    activePage = "episode-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    activatePrimaryNavContext(navigationContext || "shows");

    const pageElement = document.getElementById("episode-detail-page");
    if(pageElement){
        pageElement.classList.add("active-page");
    }

    if(typeof updateShellTitle === "function"){
        updateShellTitle();
    }

}

function renderEpisodeDetailLoading(showId,seasonNumber,episodeNumber){
    const content = document.getElementById("episode-detail-content");
    if(!content){
        return;
    }

    content.innerHTML = typeof renderTrackerEpisodeSkeletonHTML === "function"
    ? renderTrackerEpisodeSkeletonHTML(seasonNumber,episodeNumber)
    : `
        <div class="episode-detail-page-inner">
            <button class="episode-detail-back-button" id="episode-open-show-button" type="button" aria-label="Back">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <div class="empty-state episode-detail-loading-state">
                <h2>Loading episode</h2>
                <p>S${Number(seasonNumber)}E${String(Number(episodeNumber)).padStart(2,"0")}</p>
            </div>
        </div>
    `;

    const backButton = document.getElementById("episode-open-show-button");
    if(backButton){
        backButton.addEventListener("click",closeEpisodeDetailsPage);
    }
}

function renderEpisodeDetailError(message){
    const content = document.getElementById("episode-detail-content");
    if(!content){
        return;
    }

    content.innerHTML = `
        <div class="episode-detail-page-inner">
            <button class="episode-detail-back-button" id="episode-open-show-button" type="button" aria-label="Back to show">
                <img src="/static/assets/icons/arrow-narrow-left.svg" alt="">
            </button>
            <div class="empty-state episode-detail-loading-state">
                <h2>Episode details failed to load</h2>
                <p>Try again later.</p>
            </div>
        </div>
    `;

    const backButton = document.getElementById("episode-open-show-button");
    if(backButton){
        backButton.addEventListener("click",closeEpisodeDetailsPage);
    }
}

function closeEpisodeDetailsPage(){
    const context = selectedEpisodeContext;
    const showId = context ? String(context.showId || selectedShowId || "") : "";
    const seasonNumber = context ? Number(context.season) : 0;
    const fallbackRoute = context && context.backToShow !== false && showId ? getShowDetailRoute(showId) : getNavigationFallbackRoute("/app/list/watching");

    if(showId){
        expandedSeasons[showId] = expandedSeasons[showId] || {};
        expandedSeasons[showId][String(seasonNumber)] = true;
        showDetailScrollRestorePending = true;
    }

    navigateBackToStoredRouteOrFallback(fallbackRoute || "/app/list/watching");
}

function renderActiveEpisodeDetailPage(){
    if(!selectedEpisodeContext){
        return;
    }

    const id = String(selectedEpisodeContext.showId || "");
    const show = (DATA.shows && DATA.shows[id]) ||
    (showDetailPreview && String(showDetailPreview.tmdb_id) === id ? showDetailPreview : null) ||
    (discoverPreviewShow && String(discoverPreviewShow.tmdb_id) === id ? discoverPreviewShow : null);

    if(show){
        selectedEpisodeContext.discoverPreview = !(DATA.shows && DATA.shows[id]);
        renderEpisodeModal(
            show,
            selectedEpisodeContext.season,
            selectedEpisodeContext.episode,
            selectedEpisodeContext
        );
    }else{
        renderEpisodeDetailLoading(id,selectedEpisodeContext.season,selectedEpisodeContext.episode);
    }
}

async function openEpisodeModal(showId,season,episode,options={}){
    const id = String(showId || "");
    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);

    if(!id || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)){
        return;
    }

    const fromRoute = typeof options === "object" && options.fromRoute === true;
    const replaceInPlace = typeof options === "object" && options.replaceInPlace === true;
    const replaceRoute = typeof options === "object" && options.replaceRoute === true;
    const requestedPreview = typeof options === "object" && options.discoverPreview === true;
    const backToShow = typeof options === "object" ? options.backToShow !== false : true;
    const episodeRoute = getEpisodeDetailRoute(id,seasonNumber,episodeNumber);
    const navigationContext = getDetailNavContext("show",options,fromRoute ? getCurrentAppRoute() : episodeRoute);

    if(activePage === "show-detail"){
        const showPage = document.getElementById("show-detail-page");
        showDetailScrollTopBeforeEpisode = showPage ? showPage.scrollTop : 0;
    }else if(activePage !== "episode-detail"){
        showDetailScrollTopBeforeEpisode = 0;
    }

    selectedShowId = id;
    selectedEpisodeContext = {
        showId:id,
        season:seasonNumber,
        episode:episodeNumber,
        backToShow:backToShow,
        discoverPreview:requestedPreview
    };

    showEpisodeDetailPageShell(navigationContext);
    renderEpisodeDetailLoading(id,seasonNumber,episodeNumber);

    if(!fromRoute){
        if(!replaceInPlace){
            pushDetailBackRoute(episodeRoute);
        }
        setAppHashRoute(
            episodeRoute,
            replaceInPlace || replaceRoute
        );
        rememberRouteNavContext(episodeRoute,navigationContext);
    }

    let show = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;

    if(!show && showDetailPreview && String(showDetailPreview.tmdb_id) === id){
        show = showDetailPreview;
    }

    if(!show && discoverPreviewShow && String(discoverPreviewShow.tmdb_id) === id){
        show = discoverPreviewShow;
    }

    if(!show){
        try{
            const details = await tmdbGetShowDetails(id);
            if(!selectedEpisodeContext || String(selectedEpisodeContext.showId) !== id){
                return;
            }
            const previewShow = createShowObject(details,"");
            previewShow.status = "";
            previewShow._preview_only = true;
            showDetailPreview = previewShow;
            discoverPreviewShow = previewShow;
            show = previewShow;
        }catch(error){
            if(selectedEpisodeContext && String(selectedEpisodeContext.showId) === id){
                if(isTMDBNotFoundError(error)){
                    renderAppRouteNotFoundPage();
                }else{
                    renderEpisodeDetailError(friendlyTMDBSearchError(error));
                    showToast(friendlyTMDBSearchError(error));
                }
            }
            return;
        }
    }

    if(DATA.shows && DATA.shows[id]){
        show = DATA.shows[id];
    }

    const isDiscoverPreview = !(DATA.shows && DATA.shows[id]);
    selectedEpisodeContext.discoverPreview = isDiscoverPreview;

    const canonicalEpisodeRoute = getEpisodeDetailRoute(id,seasonNumber,episodeNumber,show);
    if(canonicalEpisodeRoute && !canonicalEpisodeRoute.startsWith("/app/list/")){
        setAppHashRoute(canonicalEpisodeRoute,true);
        rememberRouteNavContext(canonicalEpisodeRoute,navigationContext);
    }

    const forceRefresh = episodeNeedsDetailRefresh(show,seasonNumber,episodeNumber);
    const neededLoad = !seasonDataAlreadyLoaded(show,seasonNumber,forceRefresh);
    const needsEpisodeV2Details = !hasLoadedV2EpisodeDetails(show,seasonNumber,episodeNumber);
    const episodeDetailsPromise = needsEpisodeV2Details
    ? ensureEpisodeV2Details(show,seasonNumber,episodeNumber,{skipSave:isDiscoverPreview})
    : Promise.resolve(false);

    try{
        await ensureSeasonLoaded(show,seasonNumber,forceRefresh,{skipSave:true});
        await waitBrieflyForEpisodeV2Details(episodeDetailsPromise,450);
    }catch(error){
        if(isStillSelectedEpisode(show,seasonNumber,episodeNumber)){
            renderEpisodeDetailError(error && error.message ? error.message : "Could not load episode details");
        }
        return;
    }

    if(!isStillSelectedEpisode(show,seasonNumber,episodeNumber)){
        return;
    }

    renderEpisodeModal(show,seasonNumber,episodeNumber,selectedEpisodeContext);

    if(neededLoad && !isDiscoverPreview){
        saveData({showIds:[id]});
    }

    if(needsEpisodeV2Details){
        episodeDetailsPromise.then(changed=>{
            if(changed && isStillSelectedEpisode(show,seasonNumber,episodeNumber)){
                renderEpisodeModal(show,seasonNumber,episodeNumber,selectedEpisodeContext);
            }
        }).catch(error=>{
            if(isStillSelectedEpisode(show,seasonNumber,episodeNumber)){
                showToast(error && error.message ? error.message : "Could not load episode details");
            }
        });
    }
}

async function openDiscoverEpisodeModal(showId,season,episode){
    return openEpisodeModal(showId,season,episode,{
        backToShow:true,
        discoverPreview:true
    });
}


async function removeShow(showId){

    const show = DATA.shows[String(showId)];

    if(!show){
        return;
    }

    const confirmRemove = await showAppConfirm({
        title:"Remove Show",
        message:"Remove " + show.title + " from your tracker?",
        confirmLabel:"Remove",
        cancelLabel:"Cancel",
        danger:true
    });

    if(!confirmRemove){
        return;
    }

    const id = String(showId);
    const deletedHistoryIds = (Array.isArray(DATA.history) ? DATA.history : [])
    .filter(entry=>String(entry.tmdb_id) === id)
    .map(entry=>String(entry.id || ""))
    .filter(Boolean);

    delete DATA.shows[id];
    DATA.history = (Array.isArray(DATA.history) ? DATA.history : []).filter(entry=>{
        return String(entry.tmdb_id) !== id;
    });

    closeShowDetailsPage();
    refreshInterfaceForDataChanges({
        showIds:[id],
        historyChanged:deletedHistoryIds.length > 0,
        stateChanged:false,
        remote:false
    });
    showToast(show.title + " removed");

    await waitForNextPaint();
    await saveData({
        showDeleteIds:[id],
        historyDeleteIds:deletedHistoryIds
    });

}





async function toggleSeason(showId,seasonNumber){
    const id = String(showId);
    const show = getShowForDetailPage(id);

    if(!show){
        return;
    }

    if(!expandedSeasons[id]){
        expandedSeasons[id] = {};
    }

    const key = String(seasonNumber);
    const willOpen = !expandedSeasons[id][key];
    expandedSeasons[id][key] = willOpen;
    renderShowDetailsPagePreservingScroll(show);

    if(willOpen && !seasonDataAlreadyLoaded(show,seasonNumber,false)){
        await ensureSeasonLoaded(show,seasonNumber,false,{skipSave:true});
        renderShowDetailsPagePreservingScroll(show);
        if(DATA.shows && DATA.shows[id]){
            saveData({showIds:[id]});
        }
    }
}


async function updateShowStatus(showId,status){
    const id = String(showId);
    const show = DATA.shows[id];

    if(!show){
        return;
    }

    if(!isStatusAllowedForShow(show,status)){
        showToast("This status is not available for this show");
        return;
    }

    let addedEntries = [];

    if(status === "finished"){
        addedEntries = await completeShow(show);
    }else{
        show.status = status;
        show.completed_at = "";
    }

    refreshAfterLocalShowChange(id,addedEntries.length > 0);
    showToast("Status updated");
    await waitForNextPaint();
    await saveShowMutation(id,addedEntries,[]);
}


async function confirmEpisodeUnwatch(show,season,episode){
    if(typeof showAppConfirm !== "function"){
        return true;
    }

    const label = "Season " + Number(season) + ", Episode " + Number(episode);

    return await showAppConfirm({
        title:"Mark Episode Unwatched",
        message:
        "Mark " +
        label +
        " as unwatched? This will remove that entry from History.",
        confirmLabel:"Mark Unwatched",
        cancelLabel:"Cancel",
        danger:true
    });
}


async function confirmSeasonWatch(seasonNumber){
    if(typeof showAppConfirm !== "function"){
        return true;
    }

    return await showAppConfirm({
        title:"Mark Season Watched",
        message:
        "Mark every aired episode in Season " +
        seasonNumber +
        " as watched? This will add those entries to History.",
        confirmLabel:"Mark Watched",
        cancelLabel:"Cancel"
    });
}



async function updateEpisodeWatched(showId,season,episode,isWatched){
    const id = String(showId);
    const show = DATA.shows[id];

    if(!show){
        return;
    }

    await ensureSeasonLoaded(show,season,false,{skipSave:true});

    const episodeData = getEpisodeData(show,season,episode);
    const wasWatched = isEpisodeWatched(show,season,episode);

    if(isWatched && !isEpisodeLoggable(episodeData,show,season)){
        showToast("This episode has not aired yet");
        return;
    }

    if(!isWatched && wasWatched){
        const confirmed = await confirmEpisodeUnwatch(show,season,episode);

        if(!confirmed){
            return;
        }
    }

    let newlyMarkedEpisodes = [];
    let addedEntries = [];
    let deletedHistoryIds = [];

    if(isWatched){
        newlyMarkedEpisodes = await getEpisodesToBeMarked(show,season,episode);

        if(newlyMarkedEpisodes.length === 0){
            showToast("No aired episodes to log");
            return;
        }

        markEpAndPrevious(id,season,episode);
        addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);
        await autoCompleteShowAfterLogging(show);
    }else{
        if(show.episodes_watched && show.episodes_watched[String(season)]){
            show.episodes_watched[String(season)] =
            show.episodes_watched[String(season)].filter(ep=>ep !== episode);
        }

        deletedHistoryIds = removeHistoryEntry(id,season,episode);
        updateShowLastWatchedFromHistory(show);

        if(wasWatched){
            reopenCompletedShowAfterUnwatch(show,season);
        }
    }

    refreshAfterLocalShowChange(id,true);

    if(isWatched){
        showToast(getWatchedMessage(show,newlyMarkedEpisodes));
    }

    await waitForNextPaint();
    await saveShowMutation(id,addedEntries,deletedHistoryIds);
}


async function markSeasonWatched(showId,seasonNumber){
    const id = String(showId);
    const show = DATA.shows[id];

    if(!show){
        return;
    }

    await ensureSeasonLoaded(show,seasonNumber,false,{skipSave:true});

    const airedEpisodeNumbers = getAiredEpisodeNumbersInSeason(show,seasonNumber);

    if(airedEpisodeNumbers.length === 0){
        showToast("No aired episodes to log");
        return;
    }

    const seasonIsFullyWatched = isSeasonFullyWatched(
        show,
        seasonNumber,
        airedEpisodeNumbers
    );

    if(seasonIsFullyWatched){
        const confirmed = await showAppConfirm({
            title:"Mark Season Unwatched",
            message:
            "Mark every watched episode in Season " +
            seasonNumber +
            " as unwatched? This will remove those entries from History.",
            confirmLabel:"Mark Unwatched",
            cancelLabel:"Cancel",
            danger:true
        });

        if(!confirmed){
            return;
        }

        const deletedHistoryIds = getHistoryIdsForSeason(id,seasonNumber);
        delete show.episodes_watched[String(seasonNumber)];
        DATA.history = (Array.isArray(DATA.history) ? DATA.history : []).filter(entry=>{
            return !(
                String(entry.tmdb_id) === id &&
                Number(entry.season) === Number(seasonNumber)
            );
        });
        updateShowLastWatchedFromHistory(show);
        reopenCompletedShowAfterUnwatch(show,seasonNumber);

        refreshAfterLocalShowChange(id,true);
        showToast("Marked Season " + seasonNumber + " as unwatched");
        await waitForNextPaint();
        await saveShowMutation(id,[],deletedHistoryIds);
        return;
    }

    const newlyMarkedEpisodes = getAiredUnwatchedEpisodesInSeason(show,seasonNumber);

    if(newlyMarkedEpisodes.length === 0){
        showToast("No aired episodes to log");
        return;
    }

    const confirmed = await confirmSeasonWatch(seasonNumber);

    if(!confirmed){
        return;
    }

    markEpisodesWatchedInSeason(show,seasonNumber,newlyMarkedEpisodes);
    const addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);

    if(show.status === "plan"){
        show.status = "watching";
    }

    await autoCompleteShowAfterLogging(show);

    refreshAfterLocalShowChange(id,true);
    showToast("Marked aired episodes in Season " + seasonNumber);
    await waitForNextPaint();
    await saveShowMutation(id,addedEntries,[]);
}


function getWatchedMessage(show,episodes){

    const count = episodes && episodes.length ? episodes.length : 1;

    if(count === 1){

        const ep = episodes[0];

        return "Marked " + (show.title || "Show") + " S" + ep.season + "E" + ep.episode + " watched";

    }

    return "Marked " + count + " episodes watched";

}



function getLatestHistoryTimestampMap(){

    const latestByShow = new Map();

    (Array.isArray(DATA.history) ? DATA.history : []).forEach(entry=>{

        if(!entry || !entry.watched_at){
            return;
        }

        const watchedAt = new Date(entry.watched_at);

        if(Number.isNaN(watchedAt.getTime())){
            return;
        }

        const showId = String(entry.tmdb_id);
        const existing = latestByShow.get(showId);

        if(!existing || watchedAt.getTime() > new Date(existing).getTime()){
            latestByShow.set(showId,watchedAt.toISOString());
        }

    });

    return latestByShow;

}



function getLatestHistoryEntryForShow(show){

    if(!show || !Array.isArray(DATA.history)){
        return null;
    }

    return DATA.history
    .filter(entry=>{
        return (
            entry &&
            String(entry.tmdb_id) === String(show.tmdb_id) &&
            entry.watched_at &&
            !Number.isNaN(new Date(entry.watched_at).getTime())
        );
    })
    .slice()
    .sort((a,b)=>{
        return new Date(b.watched_at) - new Date(a.watched_at);
    })[0] || null;

}



function setShowActivityFromTimestamp(show,watchedAt){

    if(!show){
        return;
    }

    const value = String(watchedAt || "");
    const parsed = value ? new Date(value) : null;

    if(!parsed || Number.isNaN(parsed.getTime())){
        show.last_activity_at = "";
        show.last_watched = "";
        return;
    }

    show.last_activity_at = parsed.toISOString();
    show.last_watched = show.last_activity_at.slice(0,10);

}



function updateShowLastWatchedFromHistory(show,options={}){

    if(!show){
        return;
    }

    const latestEntry = getLatestHistoryEntryForShow(show);

    if(latestEntry){
        setShowActivityFromTimestamp(show,latestEntry.watched_at);
        return;
    }

    show.last_activity_at = "";

    if(!options.preserveLegacyDate){
        show.last_watched = "";
    }else if(typeof show.last_watched !== "string"){
        show.last_watched = String(show.last_watched || "");
    }

}



function getAiredEpisodeNumbersInSeason(show,seasonNumber){

    const seasonList =
    show &&
    show._episode_list &&
    Array.isArray(show._episode_list[String(seasonNumber)])
    ? show._episode_list[String(seasonNumber)]
    : [];

    return seasonList
    .filter(ep=>isEpisodeLoggable(ep,show,seasonNumber))
    .map(ep=>Number(ep.episode_number))
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);

}



function isSeasonFullyWatched(show,seasonNumber,airedEpisodeNumbers=null){

    const aired = Array.isArray(airedEpisodeNumbers)
    ? airedEpisodeNumbers
    : getAiredEpisodeNumbersInSeason(show,seasonNumber);

    if(aired.length === 0){
        return false;
    }

    const watchedEpisodes =
    show &&
    show.episodes_watched &&
    Array.isArray(show.episodes_watched[String(seasonNumber)])
    ? show.episodes_watched[String(seasonNumber)]
    : [];

    return aired.every(episodeNumber=>{
        return watchedEpisodes.includes(Number(episodeNumber));
    });

}



function getAiredUnwatchedEpisodesInSeason(show,seasonNumber){

    const watchedEpisodes =
    show &&
    show.episodes_watched &&
    Array.isArray(show.episodes_watched[String(seasonNumber)])
    ? show.episodes_watched[String(seasonNumber)]
    : [];

    return getAiredEpisodeNumbersInSeason(show,seasonNumber)
    .filter(episodeNumber=>!watchedEpisodes.includes(episodeNumber))
    .map(episodeNumber=>({
        season:Number(seasonNumber),
        episode:episodeNumber
    }));

}



function markEpisodesWatchedInSeason(show,seasonNumber,episodes){

    if(!show){
        return;
    }

    if(!show.episodes_watched){
        show.episodes_watched = {};
    }

    const key = String(seasonNumber);

    if(!Array.isArray(show.episodes_watched[key])){
        show.episodes_watched[key] = [];
    }

    (Array.isArray(episodes) ? episodes : []).forEach(item=>{

        const episodeNumber = Number(
            item && typeof item === "object"
            ? item.episode
            : item
        );

        if(
            Number.isFinite(episodeNumber) &&
            !show.episodes_watched[key].includes(episodeNumber)
        ){
            show.episodes_watched[key].push(episodeNumber);
        }

    });

    show.episodes_watched[key].sort((a,b)=>a-b);

}



function isKnownFutureRegularEpisode(show,seasonNumber,episodeInfo){

    if(!show || !isMainSeasonNumber(seasonNumber) || !episodeInfo){
        return false;
    }

    const episodeNumber = Number(episodeInfo.episode_number);

    if(!Number.isFinite(episodeNumber) || episodeNumber < 1){
        return false;
    }

    if(episodeInfo.air_date){
        return !isEpisodeAired(episodeInfo.air_date,episodeInfo,show);
    }

    const last = show.last_episode_to_air || null;

    if(last && Number.isFinite(Number(last.season_number))){
        const lastSeason = Number(last.season_number);
        const lastEpisode = Number(last.episode_number || 0);

        if(
            Number(seasonNumber) > lastSeason ||
            (Number(seasonNumber) === lastSeason && episodeNumber > lastEpisode)
        ){
            return true;
        }
    }

    return !isEpisodeLoggable(episodeInfo,show,seasonNumber);

}


function hasKnownFutureRegularEpisode(show){

    if(!show){
        return false;
    }

    const next = show.next_episode_to_air || null;

    if(
        next &&
        isMainSeasonNumber(next.season_number) &&
        !isEpisodeAired(next.air_date || "",next,show)
    ){
        return true;
    }

    const episodeLists = show._episode_list || {};
    const seasonKeys = Object.keys(episodeLists);

    for(let i = 0; i < seasonKeys.length; i++){
        const seasonNumber = Number(seasonKeys[i]);

        if(!isMainSeasonNumber(seasonNumber)){
            continue;
        }

        const episodes = episodeLists[seasonKeys[i]];

        if(!Array.isArray(episodes)){
            continue;
        }

        for(let j = 0; j < episodes.length; j++){
            if(isKnownFutureRegularEpisode(show,seasonNumber,episodes[j])){
                return true;
            }
        }
    }

    return false;

}


function hasAnyLoggableRegularEpisode(show){

    if(!show){
        return false;
    }

    const episodeLists = show._episode_list || {};
    const seasonKeys = Object.keys(episodeLists);

    for(let i = 0; i < seasonKeys.length; i++){
        const seasonNumber = Number(seasonKeys[i]);

        if(!isMainSeasonNumber(seasonNumber)){
            continue;
        }

        const episodes = episodeLists[seasonKeys[i]];

        if(
            Array.isArray(episodes) &&
            episodes.some(ep=>isEpisodeLoggable(ep,show,seasonNumber))
        ){
            return true;
        }
    }

    return false;

}


async function verifyRegularEpisodeCompletionData(show){

    if(!show || !canUseTMDBShow(show)){
        return false;
    }

    const refreshed = await refreshShowDetails(show);

    if(!refreshed){
        return false;
    }

    const totalSeasons = Math.max(Number(show.number_of_seasons || 1),1);
    const concurrency = 6;

    for(let start = 1; start <= totalSeasons; start += concurrency){
        const seasons = [];

        for(
            let season = start;
            season <= totalSeasons && season < start + concurrency;
            season++
        ){
            seasons.push(season);
        }

        const loaded = await Promise.all(
            seasons.map(season=>loadSeasonData(show,season))
        );

        if(loaded.some(result=>result !== true)){
            return false;
        }
    }

    for(let season = 1; season <= totalSeasons; season++){
        if(!seasonDataAlreadyLoaded(show,season,false)){
            return false;
        }
    }

    return true;

}


async function autoCompleteShowAfterLogging(show){

    if(
        !show ||
        show.status === "finished" ||
        show.status === "paused" ||
        show.status === "dropped"
    ){
        return false;
    }

    if(show.status !== "watching" && show.status !== "plan"){
        return false;
    }

    if(getAllAiredUnwatchedEpisodes(show).length > 0){
        return false;
    }

    const verified = await verifyRegularEpisodeCompletionData(show);

    if(!verified){
        return false;
    }

    if(
        !hasAnyLoggableRegularEpisode(show) ||
        getAllAiredUnwatchedEpisodes(show).length > 0 ||
        hasKnownFutureRegularEpisode(show)
    ){
        return false;
    }

    show.status = "finished";
    show.completed_at = new Date().toISOString();
    return true;

}


function reopenCompletedShowAfterUnwatch(show,seasonNumber){

    if(
        !show ||
        show.status !== "finished" ||
        !isMainSeasonNumber(seasonNumber)
    ){
        return false;
    }

    show.status = "watching";
    show.completed_at = "";
    return true;

}


async function completeShow(show){

    if(!show){
        return [];
    }

    await ensureAllSeasonsLoaded(show);

    const newlyMarkedEpisodes = getAllAiredUnwatchedEpisodes(show);

    if(!show.episodes_watched){
        show.episodes_watched = {};
    }

    newlyMarkedEpisodes.forEach(ep=>{

        if(!show.episodes_watched[String(ep.season)]){
            show.episodes_watched[String(ep.season)] = [];
        }

        if(!show.episodes_watched[String(ep.season)].includes(ep.episode)){
            show.episodes_watched[String(ep.season)].push(ep.episode);
        }

    });

    Object.keys(show.episodes_watched).forEach(seasonKey=>{
        show.episodes_watched[seasonKey].sort((a,b)=>a-b);
    });

    const addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);

    show.status = "finished";
    show.completed_at = new Date().toISOString();

    return addedEntries;

}



function getAllAiredUnwatchedEpisodes(show){

    const result = [];
    const watched = show.episodes_watched || {};
    const episodeLists = show._episode_list || {};

    Object.keys(episodeLists).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);

        if(!isMainSeasonNumber(seasonNumber)){
            return;
        }

        const episodeList = episodeLists[seasonKey];

        if(!Array.isArray(episodeList)){
            return;
        }

        episodeList.forEach(ep=>{

            if(!isEpisodeLoggable(ep,show,seasonNumber)){
                return;
            }

            const watchedEpisodes = watched[String(seasonNumber)] || [];

            if(watchedEpisodes.includes(ep.episode_number)){
                return;
            }

            result.push({
                season:seasonNumber,
                episode:ep.episode_number
            });

        });

    });

    result.sort((a,b)=>{

        if(a.season !== b.season){
            return a.season - b.season;
        }

        return a.episode - b.episode;

    });

    return result;

}



async function markNextEpisode(showId){
    const id = String(showId);
    const show = DATA.shows[id];

    if(!show){
        return;
    }

    let nextEp = getNextEpisode(show);

    if(!nextEp){
        showToast("All episodes watched!");
        return;
    }

    if(nextEp.needsLoad){
        await ensureSeasonLoaded(show,nextEp.season,false,{skipSave:true});
        nextEp = getNextEpisode(show);

        if(!nextEp || nextEp.needsLoad){
            showToast("Could not load episode data");
            return;
        }
    }

    const newlyMarkedEpisodes = await getEpisodesToBeMarked(
        show,
        nextEp.season,
        nextEp.episode
    );

    if(newlyMarkedEpisodes.length === 0){
        showToast("No aired episodes to log");
        return;
    }

    markEpAndPrevious(id,nextEp.season,nextEp.episode);
    const addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);
    await autoCompleteShowAfterLogging(show);

    refreshAfterLocalShowChange(id,true);
    showToast(getWatchedMessage(show,newlyMarkedEpisodes));
    await waitForNextPaint();
    await saveShowMutation(id,addedEntries,[]);
}


function seasonDataAlreadyLoaded(show,seasonNumber,forceRefresh=false){

    if(!show || !show._episode_list){
        return false;
    }

    const seasonKey = String(seasonNumber);
    const list = show._episode_list[seasonKey];
    const hasKnownSeasonCount = (
        show._season_episodes &&
        Object.prototype.hasOwnProperty.call(show._season_episodes,seasonKey)
    );

    const hasSeasonDetails = !!(
        show._season_details &&
        show._season_details[seasonKey] &&
        typeof show._season_details[seasonKey] === "object" &&
        (
            Object.prototype.hasOwnProperty.call(show._season_details[seasonKey],"overview") ||
            Object.prototype.hasOwnProperty.call(show._season_details[seasonKey],"air_date") ||
            Object.prototype.hasOwnProperty.call(show._season_details[seasonKey],"vote_average")
        )
    );

    return (
        !forceRefresh &&
        Array.isArray(list) &&
        hasSeasonDetails &&
        (
            (
                list.length === 0 &&
                hasKnownSeasonCount &&
                Number(show._season_episodes[seasonKey] || 0) === 0
            ) ||
            (
                list.length > 0 &&
                list.every(ep=>{
                    return "still_path" in ep && "air_date" in ep;
                })
            )
        )
    );

}



async function ensureAllSeasonsLoaded(show,forceRefresh=false,options={}){

    const totalSeasons = Math.max(show.number_of_seasons || 1,1);
    const startSeason = Math.max(Number(options.startSeason || 1),1);
    const concurrency = Math.max(Number(options.concurrency || 6),1);
    const onSeasonLoaded = typeof options.onSeasonLoaded === "function"
    ? options.onSeasonLoaded
    : null;

    if(!show._episode_list){
        show._episode_list = {};
    }

    const seasonsToLoad = [];

    for(let season = startSeason; season <= totalSeasons; season++){

        if(!seasonDataAlreadyLoaded(show,season,forceRefresh)){
            seasonsToLoad.push(season);
        }

    }

    for(let i = 0; i < seasonsToLoad.length; i += concurrency){

        const batch = seasonsToLoad.slice(i,i + concurrency);

        await Promise.all(batch.map(async season=>{

            await loadSeasonData(show,season);

            if(onSeasonLoaded){
                onSeasonLoaded(season,show);
            }

        }));

    }


}





async function ensureSeasonLoaded(show,seasonNumber,forceRefresh=false,options={}){

    if(!show._episode_list){
        show._episode_list = {};
    }

    if(seasonDataAlreadyLoaded(show,seasonNumber,forceRefresh)){
        return;
    }

    await loadSeasonData(show,seasonNumber);


    if(!options.skipSave){
        await saveData({showIds:[String(show.tmdb_id)]});
    }

}





function markEpAndPrevious(showId,season,episode){

    const show = DATA.shows[String(showId)];

    if(!show){
        return;
    }

    if(!show.episodes_watched){
        show.episodes_watched = {};
    }

    const episodeLists = show._episode_list || {};

    for(let s = 1; s <= season; s++){

        if(!show.episodes_watched[String(s)]){
            show.episodes_watched[String(s)] = [];
        }

        const seasonList = episodeLists[String(s)];

        if(Array.isArray(seasonList) && seasonList.length > 0){

            seasonList.forEach(ep=>{

                const shouldInclude =
                s < season ||
                ep.episode_number <= episode;

                const alreadyWatched =
                show.episodes_watched[String(s)].includes(ep.episode_number);

                if(
                    shouldInclude &&
                    isEpisodeLoggable(ep,show,s) &&
                    !alreadyWatched
                ){

                    show.episodes_watched[String(s)].push(ep.episode_number);

                }

            });

        }

        show.episodes_watched[String(s)].sort((a,b)=>a-b);

    }

    if(show.status === "plan"){
        show.status = "watching";
    }

}





function filterShow(show){

    if(activeFilter === "watching"){

        const nextEpisode = getNextEpisode(show);

        return (
            show.status === "watching" &&
            nextEpisode !== null &&
            nextEpisode.needsLoad !== true
        );

    }

    if(activeFilter === "paused"){
        return show.status === "paused";
    }

    if(activeFilter === "finished"){
        return show.status === "finished";
    }

    if(activeFilter === "plan"){
        return show.status === "plan";
    }

    if(activeFilter === "dropped"){
        return show.status === "dropped";
    }

    return false;

}





function getNextEpisode(show){

    const watched = show.episodes_watched || {};
    const details = show._episode_details || {};
    const episodeLists = show._episode_list || {};

    const maxSeasons = Math.max(show.number_of_seasons || 1,1);

    for(let season = 1; season <= maxSeasons; season++){

        const episodeList = episodeLists[String(season)];

        if(!Array.isArray(episodeList) || episodeList.length === 0){

            return {
                season:season,
                episode:1,
                name:"",
                air_date:"",
                needsLoad:true
            };

        }

        for(let i = 0; i < episodeList.length; i++){

            const ep = episodeList[i];

            if(!isEpisodeAired(ep.air_date,ep,show)){
                continue;
            }

            const episodeNumber = ep.episode_number;

            const watchedEpisodes = watched[String(season)] || [];

            if(!watchedEpisodes.includes(episodeNumber)){

                const detail = details[`${season}-${episodeNumber}`] || ep || {};

                return {
                    season:season,
                    episode:episodeNumber,
                    name:detail.name || "",
                    air_date:detail.air_date || "",
                    air_time:detail.air_time || "",
                    air_timestamp:detail.air_timestamp || "",
                    needsLoad:false
                };

            }

        }

    }

    return null;

}





function getWatchedEpisodeCount(show){

    let count = 0;

    const watched = show && show.episodes_watched ? show.episodes_watched : {};

    Object.values(watched).forEach(episodes=>{
        count += normalizeWatchedEpisodeArray(episodes).length;
    });

    return count;

}





function getTotalEpisodeCount(show){

    if(show.number_of_episodes){
        return show.number_of_episodes;
    }

    let count = 0;

    Object.values(show._season_episodes || {}).forEach(total=>{
        count += total;
    });

    return count;

}





function getSeasonWatchedCount(show,seasonNumber){

    if(!show || !show.episodes_watched){
        return 0;
    }

    const watched = normalizeWatchedEpisodeArray(show.episodes_watched[String(seasonNumber)] || []);
    const episodeList = show._episode_list && Array.isArray(show._episode_list[String(seasonNumber)])
    ? show._episode_list[String(seasonNumber)]
    : null;

    if(Array.isArray(episodeList) && episodeList.length > 0){
        const knownEpisodes = new Set(
            episodeList
            .map(ep=>Number(ep.episode_number))
            .filter(Number.isFinite)
        );

        if(knownEpisodes.size > 0){
            return watched.filter(episode=>knownEpisodes.has(Number(episode))).length;
        }
    }

    return watched.length;

}





function isCaughtUp(show){

    const returningStatuses = [
        "Returning Series",
        "In Production",
        "Planned"
    ];

    if(!returningStatuses.includes(show.tmdb_status)){
        return false;
    }

    const nextEp = getNextEpisode(show);

    if(!nextEp){
        return true;
    }

    if(!nextEp.air_date){
        return false;
    }

    const releaseDate = makeEpisodeReleaseDate(
        nextEp.air_date,
        nextEp,
        show
    );

    if(!releaseDate){
        return false;
    }

    return releaseDate > new Date();

}


async function getEpisodesToBeMarked(show,targetSeason,targetEpisode){

    const result = [];

    if(!isMainSeasonNumber(targetSeason)){
        return result;
    }

    if(!show.episodes_watched){
        show.episodes_watched = {};
    }

    for(let s = 1; s <= targetSeason; s++){

        await ensureSeasonLoaded(show,s,false,{skipSave:true});

        const watchedEpisodes = show.episodes_watched[String(s)] || [];

        const seasonList =
        show._episode_list &&
        Array.isArray(show._episode_list[String(s)])
        ? show._episode_list[String(s)]
        : [];

        seasonList.forEach(ep=>{

            const shouldInclude =
            s < targetSeason ||
            ep.episode_number <= targetEpisode;

            const alreadyWatched =
            watchedEpisodes.includes(ep.episode_number);

            if(
                shouldInclude &&
                isEpisodeLoggable(ep,show,s) &&
                !alreadyWatched
            ){

                result.push({
                    season:s,
                    episode:ep.episode_number
                });

            }

        });

    }

    return result;

}





function addHistoryEntries(show,episodes){

    if(!DATA.history || !Array.isArray(DATA.history)){
        DATA.history = [];
    }

    if(!episodes || episodes.length === 0){
        return [];
    }

    const addedEntries = [];
    const deletedHistoryIds = [];
    const watchedAt = new Date().toISOString();

    episodes.forEach((ep,index)=>{

        const episodeData = getEpisodeData(
            show,
            ep.season,
            ep.episode
        );

        if(!isEpisodeLoggable(episodeData,show,ep.season)){
            return;
        }

        deletedHistoryIds.push(...removeExistingHistoryEntriesForEpisode(
            show.tmdb_id,
            ep.season,
            ep.episode
        ));

        const historyEntry = {
            id:getDeterministicHistoryId(show.tmdb_id,ep.season,ep.episode) || (
                String(show.tmdb_id) + "-" +
                String(ep.season) + "-" +
                String(ep.episode) + "-" +
                String(Date.now()) + "-" +
                String(index)
            ),

            tmdb_id:show.tmdb_id,
            title:show.title,
            poster_path:show.poster_path || "",
            season:ep.season,
            episode:ep.episode,
            episode_title:episodeData.name || "",
            episode_still_path:episodeData.still_path || "",
            air_date:episodeData.air_date || "",
            watched_at:watchedAt,
            action:"watched"
        };

        DATA.history.push(historyEntry);
        addedEntries.push(historyEntry);

    });

    addedEntries._deletedHistoryIds = Array.from(new Set(deletedHistoryIds));

    if(addedEntries.length > 0){
        setShowActivityFromTimestamp(show,watchedAt);
    }

    return addedEntries;

}



function removeHistoryEntry(showId,season,episode){
    if(!DATA.history || !Array.isArray(DATA.history)){
        DATA.history = [];
        return [];
    }

    const removedIds = [];

    DATA.history = DATA.history.filter(entry=>{
        const matches = (
            String(entry.tmdb_id) === String(showId) &&
            Number(entry.season) === Number(season) &&
            Number(entry.episode) === Number(episode)
        );

        if(matches && entry.id){
            removedIds.push(String(entry.id));
        }

        return !matches;
    });

    return removedIds;
}


function getEpisodeData(show,season,episode){

    const details = show._episode_details || {};
    const fromDetails = details[`${season}-${episode}`] || {};

    const episodeList =
    show._episode_list &&
    Array.isArray(show._episode_list[String(season)])
    ? show._episode_list[String(season)]
    : [];

    const fromList = episodeList.find(ep=>{
        return Number(ep.episode_number) === Number(episode);
    }) || {};

    return {
        name:fromList.name || fromDetails.name || "",
        air_date:fromList.air_date || fromDetails.air_date || "",
        still_path:fromList.still_path || fromDetails.still_path || "",
        overview:fromList.overview || fromDetails.overview || "",
        runtime:fromList.runtime || fromDetails.runtime || null,
        vote_average:Number(fromList.vote_average || fromDetails.vote_average || 0),
        vote_count:Number(fromList.vote_count || fromDetails.vote_count || 0),
        air_time:fromList.air_time || fromDetails.air_time || "",
        air_timestamp:fromList.air_timestamp || fromDetails.air_timestamp || "",
    };

}




function getEpisodeTitle(show,season,episode){

    return getEpisodeData(show,season,episode).name || "";

}




function episodeNeedsDetailRefresh(show,season,episode){

    const episodeList =
    show._episode_list &&
    Array.isArray(show._episode_list[String(season)])
    ? show._episode_list[String(season)]
    : [];

    const fromList = episodeList.find(ep=>{
        return Number(ep.episode_number) === Number(episode);
    });

    if(
        fromList &&
        (
            !Object.prototype.hasOwnProperty.call(fromList,"overview") ||
            !Object.prototype.hasOwnProperty.call(fromList,"vote_average")
        )
    ){
        return true;
    }

    const details = show._episode_details || {};
    const fromDetails = details[`${season}-${episode}`];

    if(
        fromDetails &&
        (
            !Object.prototype.hasOwnProperty.call(fromDetails,"overview") ||
            !Object.prototype.hasOwnProperty.call(fromDetails,"vote_average")
        )
    ){
        return true;
    }

    return false;

}



function getEpisodeHistoryEntry(showId,season,episode){

    if(!DATA.history || !Array.isArray(DATA.history)){
        return null;
    }

    return DATA.history
    .filter(entry=>{
        return (
            String(entry.tmdb_id) === String(showId) &&
            Number(entry.season) === Number(season) &&
            Number(entry.episode) === Number(episode)
        );
    })
    .sort((a,b)=>{
        return new Date(b.watched_at || 0).getTime() -
        new Date(a.watched_at || 0).getTime();
    })[0] || null;

}





function makeLocalDate(dateString){

    return TVTrackerAuditUtils.parseStrictLocalDate(dateString);

}





function getEpisodeExactTimestamp(episodeInfo){

    return "";

}



function getEpisodeCalendarDateString(airDateString,episodeInfo=null){

    return TVTrackerAuditUtils.chooseEpisodeCalendarDate(
        String(airDateString || ""),
        ""
    );

}



function makeDateOnlyEpisodeReleaseDate(dateString){

    return TVTrackerAuditUtils.makeDateOnlyEpisodeReleaseDate(dateString);

}



function getEpisodeReleaseInfo(airDateString,episodeInfo=null,showInfo=null){

    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.getReleaseInfo === "function"){
        const canonical = window.TVTrackerReleaseTiming.getReleaseInfo(airDateString,episodeInfo,showInfo);
        if(canonical){
            return canonical;
        }
    }

    const baseDateString = getEpisodeCalendarDateString(airDateString,episodeInfo);
    if(!baseDateString){ return null; }
    const releaseDate = makeDateOnlyEpisodeReleaseDate(baseDateString);
    if(!releaseDate){ return null; }
    return {date:releaseDate,hasTime:false,precision:"date_only",source:"date-only"};

}



function makeEpisodeReleaseDate(airDateString,episodeInfo=null,showInfo=null){

    const releaseInfo = getEpisodeReleaseInfo(
        airDateString,
        episodeInfo,
        showInfo
    );

    return releaseInfo ? releaseInfo.date : null;

}



function isEpisodeAired(airDateString,episodeInfo=null,showInfo=null){

    const releaseDate = makeEpisodeReleaseDate(
        airDateString,
        episodeInfo,
        showInfo
    );

    if(!releaseDate){
        return false;
    }

    return new Date() >= releaseDate;

}


function getEpisodeNumberFromInfo(episodeInfo){
    if(!episodeInfo || typeof episodeInfo !== "object"){
        return NaN;
    }

    return Number(
        episodeInfo.episode_number !== undefined
        ? episodeInfo.episode_number
        : episodeInfo.episode
    );
}

function isUnknownDateEpisodeInReleasedSeason(showInfo,seasonNumber,episodeInfo=null){
    if(!showInfo || !Number.isFinite(Number(seasonNumber))){
        return false;
    }

    const season = Number(seasonNumber);
    const episode = getEpisodeNumberFromInfo(episodeInfo);
    const last = showInfo.last_episode_to_air || null;

    if(last && Number.isFinite(Number(last.season_number))){
        const lastSeason = Number(last.season_number);
        const lastEpisode = Number(last.episode_number || 0);

        if(season < lastSeason){
            return true;
        }

        if(season === lastSeason && Number.isFinite(episode) && episode <= lastEpisode){
            return true;
        }
    }

    const next = showInfo.next_episode_to_air || null;

    if(next && Number.isFinite(Number(next.season_number)) && season < Number(next.season_number)){
        return true;
    }

    const totalSeasons = Number(showInfo.number_of_seasons || 0);

    if(totalSeasons > 0 && season < totalSeasons){
        return true;
    }

    const statusText = String(showInfo.tmdb_status || showInfo.status_text || showInfo.status || "").toLowerCase();

    if(statusText === "ended" || statusText === "finished"){
        return true;
    }

    return false;
}

function isEpisodeLoggable(episodeInfo=null,showInfo=null,seasonNumber=null){
    const airDate = episodeInfo && typeof episodeInfo === "object"
    ? episodeInfo.air_date
    : "";

    if(isEpisodeAired(airDate,episodeInfo,showInfo)){
        return true;
    }

    if(airDate){
        return false;
    }

    return isUnknownDateEpisodeInReleasedSeason(showInfo,seasonNumber,episodeInfo);
}





function getHistoryEntries(){

    if(!DATA.history || !Array.isArray(DATA.history)){
        DATA.history = [];
    }

    return DATA.history
    .filter(entry=>!isMovieHistoryEntry(entry))
    .slice()
    .sort((a,b)=>{

        const timeDifference =
        new Date(b.watched_at).getTime() -
        new Date(a.watched_at).getTime();

        if(timeDifference !== 0){
            return timeDifference;
        }

        const seasonDifference =
        Number(b.season || 0) - Number(a.season || 0);

        if(seasonDifference !== 0){
            return seasonDifference;
        }

        return Number(b.episode || 0) - Number(a.episode || 0);

    });

}





function getLatestWatchedEpisode(show){

    const watched = show.episodes_watched || {};

    let latestSeason = null;
    let latestEpisode = null;

    Object.keys(watched).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);
        const episodes = watched[seasonKey] || [];

        episodes.forEach(episodeNumber=>{

            if(
                latestSeason === null ||
                seasonNumber > latestSeason ||
                (
                    seasonNumber === latestSeason &&
                    episodeNumber > latestEpisode
                )
            ){

                latestSeason = seasonNumber;
                latestEpisode = episodeNumber;

            }

        });

    });

    if(latestSeason === null){
        return null;
    }

    return {
        season:latestSeason,
        episode:latestEpisode
    };

}


async function prepareUpcomingData(forceRefresh=false){

    const shows = Object.values(DATA.shows)
    .filter(show=>{
        return show.status !== "dropped";
    });

    for(let i = 0; i < shows.length; i++){

        if(
            forceRefresh ||
            shouldRefreshShow(shows[i])
        ){
            await refreshShowForSchedule(shows[i],forceRefresh);
        }

    }

    await autoUpdateStatuses(forceRefresh);

    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.prefetchShows === "function"){
        await window.TVTrackerReleaseTiming.prefetchShows(DATA.shows);
    }

    await saveData();

}



async function refreshUpcomingDataInBackground(){

    if(isRefreshingUpcoming){
        return;
    }

    isRefreshingUpcoming = true;

    try{

        await prepareUpcomingData(false);

    }finally{

        isRefreshingUpcoming = false;

    }

    if(activePage === "shows" && activeShowsTab === "upcoming"){
        renderUpcoming(false);
    }

}





function getUpcomingShows(){

    const items = [];

    Object.values(DATA.shows)
    .filter(show=>{

        if(show.status === "dropped" || show.status === "paused"){
            return false;
        }

        if(
            show.status === "plan" &&
            show.was_unreleased_when_added !== true &&
            !hasFutureScheduledEpisode(show)
        ){
            return false;
        }

        return true;

    })
    .forEach(show=>{

        const scheduleItems = getUpcomingScheduleItems(show);

        scheduleItems.forEach(item=>{
            items.push(item);
        });

    });

    return items.sort((a,b)=>{

        const aRelease = makeEpisodeReleaseDate(a.episode.air_date,a.episode,a.show);
        const bRelease = makeEpisodeReleaseDate(b.episode.air_date,b.episode,b.show);

        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){
            return aRelease - bRelease;
        }

        const dateCompare = compareEpisodeCalendarDates(
            a.episode.air_date,
            a.episode,
            b.episode.air_date,
            b.episode
        );
        if(dateCompare !== 0){ return dateCompare; }

        const titleA = String(a.show.title || "");
        const titleB = String(b.show.title || "");

        if(titleA !== titleB){
            return titleA.localeCompare(titleB);
        }

        if(Number(a.episode.season_number) !== Number(b.episode.season_number)){
            return Number(a.episode.season_number) - Number(b.episode.season_number);
        }

        return Number(a.episode.episode_number) - Number(b.episode.episode_number);

    });

}





function getPersonalScheduleEpisode(show){

    const missedEpisode = getNextMissedAiredEpisode(show);

    if(missedEpisode){
        return missedEpisode;
    }

    const futureEpisode = getNextFutureEpisode(show);

    if(futureEpisode){
        return futureEpisode;
    }

    return null;

}





function getUpcomingScheduleItems(show){

    const items = [];

    const missedEpisode = getNextMissedAiredEpisode(show);

    if(missedEpisode){

        const group = getUpcomingGroup(missedEpisode.air_date,missedEpisode,show);

        if(group){

            items.push({
                show:show,
                episode:missedEpisode,
                group:group,
                timeLabel:getUpcomingTimeLabel(missedEpisode.air_date,missedEpisode,show),
                isNew:isNewUpcomingEpisode(show,missedEpisode),
                behindEpisodes:getBehindEpisodes(show,missedEpisode),
                behindCount:getBehindCount(show,missedEpisode)
            });

        }

    }


    const futureEpisodes = getFutureScheduleEpisodes(show);

    const missedEpisodeKey = missedEpisode
    ? [
        Number(missedEpisode.season_number),
        Number(missedEpisode.episode_number)
    ].join("-")
    : "";

    futureEpisodes.forEach(ep=>{

        const episodeKey = [
            Number(ep.season_number),
            Number(ep.episode_number)
        ].join("-");

        // When the user is already caught up, the newest released episode can
        // be both the personal missed episode and the release-schedule episode.
        // Keep only one card in that case. When the user has an older backlog,
        // keep the older CATCH UP card and the new release card independently.
        if(missedEpisodeKey && episodeKey === missedEpisodeKey){
            return;
        }

        const group = getUpcomingGroup(ep.air_date,ep,show);

        if(!group){
            return;
        }

        items.push({
            show:show,
            episode:ep,
            group:group,
            timeLabel:getUpcomingTimeLabel(ep.air_date,ep,show),
            isNew:false,
            behindCount:0
        });

    });


    return items;

}


function getNextMissedAiredEpisode(show){

    const watched = show.episodes_watched || {};
    const episodeLists = show._episode_list || {};

    const maxSeasons = Math.max(show.number_of_seasons || 1,1);

    for(let season = 1; season <= maxSeasons; season++){

        const episodeList = episodeLists[String(season)];

        if(!Array.isArray(episodeList) || episodeList.length === 0){
            continue;
        }

        for(let i = 0; i < episodeList.length; i++){

            const ep = episodeList[i];

            if(!ep.air_date){
                continue;
            }

            if(!isEpisodeAired(ep.air_date,ep,show)){
                continue;
            }

            const watchedEpisodes = watched[String(season)] || [];

            if(!watchedEpisodes.includes(ep.episode_number)){

                return {
                    season_number:season,
                    episode_number:ep.episode_number,
                    name:ep.name || "",
                    air_date:ep.air_date || "",
                    still_path:ep.still_path || "",
                    air_time:ep.air_time || "",
                    air_timestamp:ep.air_timestamp || "",
                    type:"missed"
                };

            }

        }

    }

    return null;

}





function getNextFutureEpisode(show){

    const futureEpisodes = getFutureScheduleEpisodes(show);

    if(futureEpisodes.length === 0){
        return null;
    }

    return futureEpisodes[0];

}





function getFutureScheduleEpisodes(show){

    const watched = show.episodes_watched || {};
    const episodeLists = show._episode_list || {};

    const futureEpisodes = [];
    const seen = {};

    function addFutureEpisode(seasonNumber,episodeNumber,name,airDate,stillPath,sourceEpisode={}){

        if(!isMainSeasonNumber(seasonNumber)){
            return;
        }

        if(!airDate){
            return;
        }

        if(isEpisodeAired(airDate,sourceEpisode,show)){

            const dayDifference = getDayDiffFromToday(airDate,sourceEpisode,show);

            // Keep a newly released episode visible in its real schedule group
            // even when the user still has older episodes in CATCH UP.
            // Older missed episodes remain represented by the single backlog card.
            if(dayDifference === null || dayDifference < 0 || dayDifference > 1){
                return;
            }

        }

        const watchedEpisodes = watched[String(seasonNumber)] || [];

        if(watchedEpisodes.includes(Number(episodeNumber))){
            return;
        }

        const key = String(seasonNumber) + "-" + String(episodeNumber);

        if(seen[key]){
            return;
        }

        seen[key] = true;

        futureEpisodes.push({
            season_number:Number(seasonNumber),
            episode_number:Number(episodeNumber),
            name:name || "",
            air_date:airDate || "",
            still_path:stillPath || "",
            air_time:sourceEpisode.air_time || "",
            air_timestamp:sourceEpisode.air_timestamp || "",
            type:"future"
        });

    }


    Object.keys(episodeLists).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);

        if(!isMainSeasonNumber(seasonNumber)){
            return;
        }

        const episodeList = episodeLists[seasonKey];

        if(!Array.isArray(episodeList)){
            return;
        }

        episodeList.forEach(ep=>{

            addFutureEpisode(
                seasonNumber,
                ep.episode_number,
                ep.name || "",
                ep.air_date || "",
                ep.still_path || "",
                ep
            );

        });

    });


    if(
        show.next_episode_to_air &&
        show.next_episode_to_air.air_date
    ){

        const next = show.next_episode_to_air;

        addFutureEpisode(
            next.season_number,
            next.episode_number,
            next.name || "",
            next.air_date || "",
            next.still_path || "",
            next
        );

    }


    futureEpisodes.sort((a,b)=>{

        const aRelease = makeEpisodeReleaseDate(a.air_date,a,show);
        const bRelease = makeEpisodeReleaseDate(b.air_date,b,show);

        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){
            return aRelease - bRelease;
        }

        const dateCompare = compareEpisodeCalendarDates(a.air_date,a,b.air_date,b);
        if(dateCompare !== 0){ return dateCompare; }

        if(Number(a.season_number) !== Number(b.season_number)){
            return Number(a.season_number) - Number(b.season_number);
        }

        return Number(a.episode_number) - Number(b.episode_number);

    });


    return futureEpisodes;

}






function getBehindEpisodes(show,currentEpisode){

    if(!currentEpisode){
        return [];
    }

    if(currentEpisode.type !== "missed"){
        return [];
    }

    const watched = show.episodes_watched || {};
    const episodeLists = show._episode_list || {};

    const episodes = [];

    Object.keys(episodeLists).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);

        if(!isMainSeasonNumber(seasonNumber)){
            return;
        }

        const episodeList = episodeLists[seasonKey];

        if(!Array.isArray(episodeList)){
            return;
        }

        episodeList.forEach(ep=>{

            if(!ep.air_date){
                return;
            }

            if(!isEpisodeAired(ep.air_date,ep,show)){
                return;
            }

            const watchedEpisodes = watched[String(seasonNumber)] || [];

            if(watchedEpisodes.includes(ep.episode_number)){
                return;
            }

            const isCurrentEpisode =
            seasonNumber === Number(currentEpisode.season_number) &&
            Number(ep.episode_number) === Number(currentEpisode.episode_number);

            if(isCurrentEpisode){
                return;
            }

            episodes.push({
                season_number:seasonNumber,
                episode_number:ep.episode_number,
                name:ep.name || "",
                air_date:ep.air_date || "",
                still_path:ep.still_path || "",
                air_time:ep.air_time || "",
                air_timestamp:ep.air_timestamp || "",
                type:"missed"
            });

        });

    });

    episodes.sort((a,b)=>{

        const dateCompare = compareEpisodeCalendarDates(
            a.air_date,
            a,
            b.air_date,
            b
        );

        if(dateCompare !== 0){
            return dateCompare;
        }

        if(Number(a.season_number) !== Number(b.season_number)){
            return Number(a.season_number) - Number(b.season_number);
        }

        return Number(a.episode_number) - Number(b.episode_number);

    });

    return episodes;

}




function getBehindCount(show,currentEpisode){

    if(!currentEpisode){
        return 0;
    }

    if(currentEpisode.type !== "missed"){
        return 0;
    }

    const watched = show.episodes_watched || {};
    const episodeLists = show._episode_list || {};

    let count = 0;

    Object.keys(episodeLists).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);

        if(!isMainSeasonNumber(seasonNumber)){
            return;
        }

        const episodeList = episodeLists[seasonKey];

        if(!Array.isArray(episodeList)){
            return;
        }

        episodeList.forEach(ep=>{

            if(!ep.air_date){
                return;
            }

            if(!isEpisodeAired(ep.air_date,ep,show)){
                return;
            }

            const watchedEpisodes = watched[String(seasonNumber)] || [];

            if(watchedEpisodes.includes(ep.episode_number)){
                return;
            }

            const isCurrentEpisode =
            seasonNumber === Number(currentEpisode.season_number) &&
            Number(ep.episode_number) === Number(currentEpisode.episode_number);

            if(!isCurrentEpisode){
                count++;
            }

        });

    });

    return count;

}






function compareDateStrings(dateA,dateB){

    const a = makeLocalDate(dateA);
    const b = makeLocalDate(dateB);

    if(!a && !b){
        return 0;
    }

    if(!a){
        return 1;
    }

    if(!b){
        return -1;
    }

    return a - b;

}





function compareEpisodeCalendarDates(dateA,episodeA,dateB,episodeB){

    return compareDateStrings(
        getEpisodeCalendarDateString(dateA,episodeA),
        getEpisodeCalendarDateString(dateB,episodeB)
    );

}



function getUpcomingGroup(airDateString,episodeInfo=null,showInfo=null){

    const diffDays = getDayDiffFromToday(airDateString,episodeInfo,showInfo);

    if(diffDays === null){
        return null;
    }

    if(diffDays > 1){
        return "Catch Up";
    }

    if(diffDays === 1){
        return "Yesterday";
    }

    if(diffDays === 0){
        return "Today";
    }

    if(diffDays === -1){
        return "Tomorrow";
    }

    if(diffDays < -1 && diffDays >= -7){
        return "This Week";
    }

    const canonicalDateString = window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.calendarDate === "function"
        ? window.TVTrackerReleaseTiming.calendarDate(airDateString,episodeInfo,showInfo)
        : getEpisodeCalendarDateString(airDateString,episodeInfo);
    const airDate = makeLocalDate(canonicalDateString);
    const effectiveTimezone = window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.getStatus === "function"
        ? String(window.TVTrackerReleaseTiming.getStatus().timezone || "")
        : "";
    let today = new Date();
    if(effectiveTimezone){
        try{
            const todayString = new Intl.DateTimeFormat("en-CA",{timeZone:effectiveTimezone,year:"numeric",month:"2-digit",day:"2-digit"})
                .formatToParts(today)
                .reduce((parts,part)=>{ if(part.type !== "literal"){ parts[part.type] = part.value; } return parts; },{});
            today = makeLocalDate(`${todayString.year}-${todayString.month}-${todayString.day}`) || today;
        }catch(error){ /* local-device fallback */ }
    }
    today.setHours(0,0,0,0);

    if(airDate && airDate.getFullYear() === today.getFullYear() && airDate.getMonth() === today.getMonth()){
        return "This Month";
    }

    return "Later";

}





function getUpcomingTimeLabel(airDateString,episodeInfo=null,showInfo=null){

    const diffDays = getDayDiffFromToday(airDateString,episodeInfo,showInfo);

    if(diffDays === null){
        return "";
    }

    const releaseTime = getEpisodeReleaseTimeText(airDateString,episodeInfo,showInfo);

    if(diffDays > 6){
        return "Aired";
    }

    if(diffDays > 1){
        return diffDays + " days ago";
    }

    if(diffDays === 1){
        return "Yesterday";
    }

    if(diffDays === 0){
        return releaseTime ? "Today • " + releaseTime : "Today";
    }

    if(diffDays < 0){

        const daysUntil = Math.abs(diffDays);
        const baseLabel = daysUntil === 1
        ? "1 day"
        : daysUntil + " days";

        return releaseTime ? baseLabel + " • " + releaseTime : baseLabel;

    }

    return "";

}



function getEpisodeReleaseTimeText(airDateString,episodeInfo=null,showInfo=null){

    const releaseInfo = getEpisodeReleaseInfo(
        airDateString,
        episodeInfo,
        showInfo
    );

    if(!releaseInfo || !releaseInfo.hasTime){
        return "";
    }

    return releaseInfo.date.toLocaleTimeString(
        undefined,
        {
            hour:"numeric",
            minute:"2-digit",
            hour12:true
        }
    );

}



function getDayDiffFromToday(dateString,episodeInfo=null,showInfo=null){

    if(window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.getDayDiff === "function"){
        const canonicalDiff = window.TVTrackerReleaseTiming.getDayDiff(dateString,episodeInfo,showInfo);
        if(canonicalDiff !== null){ return canonicalDiff; }
    }

    const date = makeLocalDate(
        getEpisodeCalendarDateString(dateString,episodeInfo)
    );

    if(!date){
        return null;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    date.setHours(0,0,0,0);

    return Math.round(
        (today - date) / (1000 * 60 * 60 * 24)
    );

}





function isNewUpcomingEpisode(show,episode){

    if(!show || !episode || !episode.air_date){
        return false;
    }

    if(!isShowCurrentlyAiring(show)){
        return false;
    }

    if(!isEpisodeAired(episode.air_date,episode,show)){
        return false;
    }

    const diffDays = getDayDiffFromToday(episode.air_date,episode,show);

    if(diffDays === null || diffDays < 0 || diffDays > 4){
        return false;
    }

    if(
        isEpisodeWatched(
            show,
            episode.season_number,
            episode.episode_number
        )
    ){
        return false;
    }

    const latest = getLatestAiredEpisode(show);

    if(!latest){
        return false;
    }

    /*
    Batch-release rule:
    If a show drops multiple episodes at the same time, every unwatched
    episode in that newest release batch should show NEW. This keeps a
    full-season Friday drop marked as NEW while the Watchlist moves from
    S1E01 to S1E02, S1E03, etc. after each quick-log.
    */
    const episodeReleaseDate = makeEpisodeReleaseDate(episode.air_date,episode,show);
    const latestReleaseDate = makeEpisodeReleaseDate(latest.air_date,latest,show);

    if(!episodeReleaseDate || !latestReleaseDate){
        return false;
    }

    return episodeReleaseDate.getTime() === latestReleaseDate.getTime();

}


function isShowCurrentlyAiring(show){

    const status = String(show.tmdb_status || "").toLowerCase();

    return (
        status === "returning series" ||
        status === "in production"
    );

}


function getLatestAiredEpisode(show){

    const episodeLists = show._episode_list || {};

    let latest = null;

    Object.keys(episodeLists).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);

        if(!isMainSeasonNumber(seasonNumber)){
            return;
        }

        const episodeList = episodeLists[seasonKey];

        if(!Array.isArray(episodeList)){
            return;
        }

        episodeList.forEach(ep=>{

            if(!ep.air_date){
                return;
            }

            if(!isEpisodeAired(ep.air_date,ep,show)){
                return;
            }

            if(!latest){

                latest = {
                    season_number:seasonNumber,
                    episode_number:ep.episode_number,
                    air_date:ep.air_date,
                    air_time:ep.air_time || "",
                    air_timestamp:ep.air_timestamp || "",
                };

                return;

            }

            const currentDate = makeEpisodeReleaseDate(ep.air_date,ep,show);
            const latestDate = makeEpisodeReleaseDate(latest.air_date,latest,show);

            if(currentDate > latestDate){

                latest = {
                    season_number:seasonNumber,
                    episode_number:ep.episode_number,
                    air_date:ep.air_date,
                    air_time:ep.air_time || "",
                    air_timestamp:ep.air_timestamp || "",
                };

                return;

            }

            if(
                currentDate.getTime() === latestDate.getTime() &&
                (
                    seasonNumber > latest.season_number ||
                    (
                        seasonNumber === latest.season_number &&
                        ep.episode_number > latest.episode_number
                    )
                )
            ){

                latest = {
                    season_number:seasonNumber,
                    episode_number:ep.episode_number,
                    air_date:ep.air_date,
                    air_time:ep.air_time || "",
                    air_timestamp:ep.air_timestamp || "",
                };

            }

        });

    });

    return latest;

}





function isEpisodeWatched(show,season,episode){

    const watchedEpisodes =
    show.episodes_watched &&
    show.episodes_watched[String(season)]
    ? show.episodes_watched[String(season)]
    : [];

    return watchedEpisodes.includes(Number(episode));

}





function hasNewAiredEpisodeAfterCompleted(show){

    if(!show || show.status !== "finished"){
        return false;
    }

    if(!show.completed_at){
        show.completed_at = new Date().toISOString();
        return false;
    }

    const completedDate = new Date(show.completed_at);

    if(Number.isNaN(completedDate.getTime())){
        return false;
    }

    completedDate.setHours(0,0,0,0);

    const episodeLists = show._episode_list || {};

    const seasonKeys = Object.keys(episodeLists);

    for(let i = 0; i < seasonKeys.length; i++){

        const seasonNumber = Number(seasonKeys[i]);

        if(!isMainSeasonNumber(seasonNumber)){
            continue;
        }

        const episodeList = episodeLists[seasonKeys[i]];

        if(!Array.isArray(episodeList)){
            continue;
        }

        for(let j = 0; j < episodeList.length; j++){

            const ep = episodeList[j];

            if(!ep.air_date || !isEpisodeAired(ep.air_date,ep,show)){
                continue;
            }

            if(isEpisodeWatched(show,seasonNumber,ep.episode_number)){
                continue;
            }

            const airDate = makeEpisodeReleaseDate(ep.air_date,ep,show);

            if(!airDate){
                continue;
            }

            airDate.setHours(0,0,0,0);

            if(airDate >= completedDate){
                return true;
            }

        }

    }

    return false;

}




function getNoNextEpisodeText(show){

    if(show.status === "finished"){
        return "Completed";
    }

    if(show.status === "plan"){
        return "Plan To Watch";
    }

    if(show.status === "paused"){
        return "Paused";
    }

    if(show.status === "dropped"){
        return "Dropped";
    }

    return "";

}





function getCountdownText(airDateString,episodeInfo=null,showInfo=null){

    const diffDays = getDayDiffFromToday(
        airDateString,
        episodeInfo,
        showInfo
    );

    if(diffDays === null){
        return "";
    }

    const days = -diffDays;

    if(days <= 0){
        return "Airing today!";
    }

    if(days === 1){
        return "1 day remaining";
    }

    return days + " days remaining";

}





function formatAirDate(dateString,episodeInfo=null,showInfo=null){

    const calendarDate = window.TVTrackerReleaseTiming && typeof window.TVTrackerReleaseTiming.calendarDate === "function"
    ? window.TVTrackerReleaseTiming.calendarDate(dateString,episodeInfo,showInfo)
    : getEpisodeCalendarDateString(dateString,episodeInfo);

    if(!calendarDate){
        return "";
    }

    const date = makeLocalDate(calendarDate);

    if(!date){
        return "";
    }

    const dateText = date.toLocaleDateString(undefined,{
        year:"numeric",
        month:"short",
        day:"numeric"
    });
    const releaseTime = getEpisodeReleaseTimeText(
        dateString,
        episodeInfo,
        showInfo
    );

    return releaseTime ? dateText + " • " + releaseTime : dateText;

}





function updateTrackedLabels(){

    const searchInput = document.getElementById("search");

    if(!searchInput){
        return;
    }

    if(activePage === "discover"){
        searchInput.setAttribute("placeholder","Search shows, movies, people");
        const discoverQuery = searchInput.value.trim();
        if(discoverQuery.length >= 2){
            searchShows(discoverQuery,{skipRoute:true});
        }else{
            if(typeof renderDiscoverHub === "function"){
                renderDiscoverHub();
            }
            loadDiscoverHub(false);
        }
        return;
    }

    const query = searchInput.value.trim();
    const cacheKey = getSearchCacheKey(query);

    if(query.length < 2){
        renderSearchIntro();
        return;
    }

    if(lastDiscoverSearchQuery === cacheKey && lastDiscoverSearchResults.length){
        renderSearchResults(lastDiscoverSearchResults);
        return;
    }

    searchShows(query,{skipRoute:activePage !== "search"});

}



function normalizeMovieTrackingId(value){
    return normalizeRouteId(value);
}

function getMovieRecordFromDetails(movie){
    if(!movie || typeof movie !== "object"){
        return null;
    }

    const id = normalizeMovieTrackingId(movie.id || movie.tmdb_id || movie.movie_id || "");
    if(!id){
        return null;
    }

    const releaseDate = String(movie.release_date || movie.date || "").trim();
    return {
        id:id,
        tmdb_id:id,
        title:String(movie.title || movie.name || movie.original_title || "Untitled").trim() || "Untitled",
        poster_path:String(movie.poster_path || "").trim(),
        backdrop_path:String(movie.backdrop_path || "").trim(),
        release_date:releaseDate,
        year:String(movie.year || (releaseDate ? releaseDate.slice(0,4) : "")).trim()
    };
}

function normalizeMovieTrackingRecord(rawRecord,recordId=""){
    if(!rawRecord || typeof rawRecord !== "object"){
        return null;
    }

    const id = normalizeMovieTrackingId(recordId || rawRecord.id || rawRecord.tmdb_id || rawRecord.movie_id || "");
    if(!id){
        return null;
    }

    const releaseDate = String(rawRecord.release_date || "").trim();
    const watched = rawRecord.watched === true || rawRecord.status === "watched";
    const plan = !watched && (rawRecord.plan === true || rawRecord.plan_to_watch === true || rawRecord.status === "plan");
    const favorite = rawRecord.favorite === true;
    const watchedAt = typeof rawRecord.watched_at === "string" ? rawRecord.watched_at : "";
    const updatedAt = typeof rawRecord.updated_at === "string" ? rawRecord.updated_at : "";

    if(!watched && !plan && !favorite){
        return null;
    }

    return {
        id:id,
        tmdb_id:id,
        title:String(rawRecord.title || rawRecord.name || rawRecord.original_title || "Untitled").trim() || "Untitled",
        poster_path:String(rawRecord.poster_path || "").trim(),
        backdrop_path:String(rawRecord.backdrop_path || "").trim(),
        release_date:releaseDate,
        year:String(rawRecord.year || (releaseDate ? releaseDate.slice(0,4) : "")).trim(),
        watched:watched,
        plan:plan,
        favorite:favorite,
        watched_at:watched ? watchedAt : "",
        updated_at:updatedAt
    };
}

function ensureMovieTrackingData(){
    if(!DATA.movies || typeof DATA.movies !== "object" || Array.isArray(DATA.movies)){
        DATA.movies = {};
    }

    const normalized = {};
    Object.entries(DATA.movies).forEach(([key,value])=>{
        const record = normalizeMovieTrackingRecord(value,key);
        if(record){
            normalized[record.id] = record;
        }
    });
    DATA.movies = normalized;
}

function getMovieTrackingRecord(movieId){
    ensureMovieTrackingData();
    const id = normalizeMovieTrackingId(movieId);
    return id && DATA.movies[id] ? DATA.movies[id] : null;
}

function getMovieTrackingState(movieId){
    const record = getMovieTrackingRecord(movieId);
    return {
        watched:!!(record && record.watched),
        plan:!!(record && record.plan),
        favorite:typeof isMovieFavorite === "function" ? isMovieFavorite(movieId) : !!(record && record.favorite)
    };
}

function upsertMovieTrackingRecord(movie,updates={}){
    ensureMovieTrackingData();

    const base = getMovieRecordFromDetails(movie) || normalizeMovieTrackingRecord(movie) || null;
    const id = normalizeMovieTrackingId((base && base.id) || (movie && (movie.id || movie.tmdb_id || movie.movie_id)) || "");
    if(!id){
        return null;
    }

    const existing = DATA.movies[id] || {};
    const record = Object.assign({
        id:id,
        tmdb_id:id,
        title:"Untitled",
        poster_path:"",
        backdrop_path:"",
        release_date:"",
        year:"",
        watched:false,
        plan:false,
        favorite:false,
        watched_at:"",
        updated_at:""
    },existing,base || {},updates || {});

    record.id = id;
    record.tmdb_id = id;
    record.title = String(record.title || "Untitled").trim() || "Untitled";
    record.poster_path = String(record.poster_path || "").trim();
    record.backdrop_path = String(record.backdrop_path || "").trim();
    record.release_date = String(record.release_date || "").trim();
    record.year = String(record.year || (record.release_date ? record.release_date.slice(0,4) : "")).trim();
    record.watched = record.watched === true;
    record.plan = record.watched ? false : record.plan === true;
    record.favorite = record.favorite === true;
    record.watched_at = record.watched ? String(record.watched_at || "").trim() : "";
    record.updated_at = String(record.updated_at || new Date().toISOString()).trim();

    if(!record.watched && !record.plan && !record.favorite){
        delete DATA.movies[id];
        return null;
    }

    DATA.movies[id] = record;
    return record;
}

function getMovieHistoryId(movieId){
    const id = normalizeMovieTrackingId(movieId);
    return id ? "movie-watched-" + id : "";
}

function isMovieHistoryEntry(entry,movieId=""){
    if(!entry || typeof entry !== "object"){
        return false;
    }
    const mediaType = String(entry.media_type || entry.type || "").toLowerCase();
    const id = normalizeMovieTrackingId(movieId);
    const entryId = normalizeMovieTrackingId(entry.movie_id || (mediaType === "movie" ? entry.tmdb_id : ""));
    if(mediaType !== "movie" && !entry.movie_id){
        return false;
    }
    return id ? entryId === id : !!entryId;
}

function removeMovieHistoryEntries(movieId){
    if(!Array.isArray(DATA.history)){
        DATA.history = [];
        return [];
    }

    const removedIds = [];
    DATA.history = DATA.history.filter(entry=>{
        const matches = isMovieHistoryEntry(entry,movieId);
        if(matches && entry && entry.id){
            removedIds.push(String(entry.id));
        }
        return !matches;
    });
    return removedIds;
}

function createMovieHistoryEntry(movie,watchedAt){
    const base = getMovieRecordFromDetails(movie);
    if(!base){
        return null;
    }

    const timestamp = watchedAt || new Date().toISOString();
    return {
        id:getMovieHistoryId(base.id),
        media_type:"movie",
        movie_id:base.id,
        tmdb_id:base.id,
        title:base.title,
        poster_path:base.poster_path,
        backdrop_path:base.backdrop_path,
        release_date:base.release_date,
        year:base.year,
        watched_at:timestamp,
        date:timestamp.slice(0,10),
        action:"watched"
    };
}

function addMovieHistoryEntry(movie,watchedAt){
    if(!Array.isArray(DATA.history)){
        DATA.history = [];
    }

    const entry = createMovieHistoryEntry(movie,watchedAt);
    if(!entry){
        return {entry:null,deletedIds:[]};
    }

    const deletedIds = removeMovieHistoryEntries(entry.movie_id);
    DATA.history.push(entry);
    return {entry,deletedIds};
}

async function saveMovieTrackingMutation(movieId,historyUpsertIds=[],historyDeleteIds=[],stateKeys=["movies"]){
    return saveData({
        stateKeys:Array.from(new Set(Array.isArray(stateKeys) && stateKeys.length ? stateKeys : ["movies"])),
        historyUpsertIds:historyUpsertIds,
        historyDeleteIds:historyDeleteIds,
        historyOrder:true
    });
}

async function updateMovieTracking(movie,action){
    const base = getMovieRecordFromDetails(movie);
    if(!base){
        showToast("Movie details are not loaded yet");
        return;
    }

    const current = getMovieTrackingRecord(base.id) || upsertMovieTrackingRecord(base,{updated_at:new Date().toISOString()}) || {
        id:base.id,
        watched:false,
        plan:false,
        favorite:false
    };
    const currentState = getMovieTrackingState(base.id);
    const now = new Date().toISOString();
    let historyResult = {entry:null,deletedIds:[]};
    let historyDeleteIds = [];
    let message = "Movie updated";

    if(action === "watched"){
        if(current.watched){
            const confirmed = await showAppConfirm({
                title:"Remove Watched Movie",
                message:"Remove " + base.title + " from Watched? This will delete its movie History entry.",
                confirmLabel:"Remove Watched",
                cancelLabel:"Cancel",
                danger:true
            });
            if(!confirmed){
                return;
            }
            historyDeleteIds = removeMovieHistoryEntries(base.id);
            upsertMovieTrackingRecord(base,{watched:false,watched_at:"",updated_at:now});
            message = "Removed from Watched";
        }else{
            historyResult = addMovieHistoryEntry(base,now);
            upsertMovieTrackingRecord(base,{watched:true,plan:false,watched_at:now,updated_at:now});
            message = current.plan ? "Moved to Watched" : "Added to Watched";
        }
    }else if(action === "plan"){
        if(current.plan){
            upsertMovieTrackingRecord(base,{plan:false,updated_at:now});
            message = "Removed from Plan to Watch";
        }else if(current.watched){
            const confirmed = await showAppConfirm({
                title:"Move to Plan to Watch",
                message:"Move " + base.title + " from Watched to Plan to Watch? This will delete its movie History entry.",
                confirmLabel:"Move to Plan",
                cancelLabel:"Cancel",
                danger:true
            });
            if(!confirmed){
                return;
            }
            historyDeleteIds = removeMovieHistoryEntries(base.id);
            upsertMovieTrackingRecord(base,{watched:false,plan:true,watched_at:"",updated_at:now});
            message = "Moved to Plan to Watch";
        }else{
            upsertMovieTrackingRecord(base,{plan:true,updated_at:now});
            message = "Added to Plan to Watch";
        }
    }else if(action === "favorite"){
        const result = await setMovieFavoriteState(base,!currentState.favorite,{showMessage:true});
        if(!result || result.success !== true){
            return;
        }
        return;
    }else if(action === "remove"){
        const confirmed = await showAppConfirm({
            title:"Remove Movie",
            message:"Clear Watched, Plan to Watch, Favorite, and movie History for " + base.title + "?",
            confirmLabel:"Remove",
            cancelLabel:"Cancel",
            danger:true
        });
        if(!confirmed){
            return;
        }
        historyDeleteIds = removeMovieHistoryEntries(base.id);
        ensureProfileData();
        DATA.profile.favorite_movies = DATA.profile.favorite_movies.filter(item=>{
            return String(item && (item.id || item.tmdb_id)) !== base.id;
        });
        delete DATA.movies[base.id];
        message = "Movie tracking removed";
    }else{
        return;
    }

    if(typeof renderActiveMoviePage === "function"){
        renderActiveMoviePage();
    }else{
        renderAll();
    }
    showToast(message);
    await waitForNextPaint();
    await saveMovieTrackingMutation(
        base.id,
        historyResult.entry ? [historyResult.entry.id] : [],
        combineHistoryDeleteIds(historyResult.deletedIds,historyDeleteIds),
        action === "remove" ? ["movies","profile"] : ["movies"]
    );
}

function isShowFavorite(showId){
    ensureProfileData();
    const id = String(showId || "");
    return !!id && DATA.profile.favorite_shows.map(String).includes(id);
}

async function toggleFavoriteShow(showId){
    ensureProfileData();
    const id = String(showId || "");
    if(!id || !DATA.shows[id]){
        return;
    }

    if(isShowFavorite(id)){
        DATA.profile.favorite_shows = DATA.profile.favorite_shows.filter(item=>String(item) !== id);
        showToast("Removed from Favorite Shows");
    }else{
        if(DATA.profile.favorite_shows.length >= 8){
            showToast("You can only choose 8 favorite shows");
            return;
        }
        DATA.profile.favorite_shows.push(id);
        showToast("Added to Favorite Shows");
    }

    renderAll();
    if(typeof renderFavoritesPopup === "function"){
        renderFavoritesPopup("show");
    }
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});
}




function ensureProfileData(){

    if(!DATA.profile || typeof DATA.profile !== "object"){
        DATA.profile = {};
    }

    if(!DATA.profile.username){
        DATA.profile.username = "Username";
    }

    DATA.profile.username = String(DATA.profile.username || "Username").trim().slice(0,30) || "Username";

    delete DATA.profile.date_only_episode_time;

    if(!DATA.profile.favorite_shows || !Array.isArray(DATA.profile.favorite_shows)){
        DATA.profile.favorite_shows = [];
    }

    if(!DATA.profile.favorite_movies || !Array.isArray(DATA.profile.favorite_movies)){
        DATA.profile.favorite_movies = [];
    }

    const allowedAvatarTypes = ["initial","preset","upload"];

    if(!allowedAvatarTypes.includes(DATA.profile.avatar_type)){
        DATA.profile.avatar_type = "initial";
    }

    if(!DATA.profile.avatar_preset){
        DATA.profile.avatar_preset = "silhouette-1";
    }

    if(typeof DATA.profile.avatar_data !== "string"){
        DATA.profile.avatar_data = "";
    }

    if(
        DATA.profile.avatar_type === "upload" &&
        !DATA.profile.avatar_data.startsWith("data:image/webp")
    ){
        DATA.profile.avatar_type = "initial";
        DATA.profile.avatar_data = "";
    }

    const allowedHeaderTypes = ["preset","upload"];
    const allowedHeaderPresets = ["default","blue","purple","green","amber","monochrome"];

    if(!allowedHeaderTypes.includes(DATA.profile.header_type)){
        DATA.profile.header_type = "preset";
    }

    if(!allowedHeaderPresets.includes(DATA.profile.header_preset)){
        DATA.profile.header_preset = "default";
    }

    if(typeof DATA.profile.header_image !== "string"){
        DATA.profile.header_image = "";
    }

    if(
        DATA.profile.header_type === "upload" &&
        !DATA.profile.header_image.startsWith("data:image/webp")
    ){
        DATA.profile.header_type = "preset";
        DATA.profile.header_preset = "default";
        DATA.profile.header_image = "";
    }

    DATA.profile.favorite_shows = DATA.profile.favorite_shows
    .map(id=>String(id))
    .filter((id,index,array)=>{
        return DATA.shows[String(id)] && array.indexOf(id) === index;
    })
    .slice(0,8);

    const seenFavoriteMovieIds = new Set();
    DATA.profile.favorite_movies = DATA.profile.favorite_movies
    .map(movie=>normalizeFavoriteMovieRecord(movie))
    .filter(movie=>{
        const id = String(movie && movie.id || "");
        if(!id || seenFavoriteMovieIds.has(id)){
            return false;
        }
        seenFavoriteMovieIds.add(id);
        return true;
    })
    .slice(0,8);

}


function createEmptyNetworkMetadataSyncData(){

    return {
        active:false,
        total:0,
        completed:0,
        pending:[],
        failed:[],
        current:"",
        lastRun:"",
        completedAt:""
    };

}


function ensureNetworkMetadataSyncData(){

    if(!DATA.network_sync || typeof DATA.network_sync !== "object"){
        DATA.network_sync = createEmptyNetworkMetadataSyncData();
    }

    if(!Array.isArray(DATA.network_sync.pending)){
        DATA.network_sync.pending = [];
    }

    if(!Array.isArray(DATA.network_sync.failed)){
        DATA.network_sync.failed = [];
    }

    if(typeof DATA.network_sync.total !== "number"){
        DATA.network_sync.total = DATA.network_sync.pending.length;
    }

    if(typeof DATA.network_sync.completed !== "number"){
        DATA.network_sync.completed = 0;
    }

    if(typeof DATA.network_sync.active !== "boolean"){
        DATA.network_sync.active = DATA.network_sync.pending.length > 0;
    }

    if(typeof DATA.network_sync.current !== "string"){
        DATA.network_sync.current = "";
    }

}


function showNeedsNetworkMetadata(show){

    if(!show || show.status === "plan" || !canUseTMDBShow(show)){
        return false;
    }

    if(show._network_metadata_version === 1){
        return false;
    }

    if(show._network_metadata_failed_at){

        const failedAt = new Date(show._network_metadata_failed_at).getTime();
        const sixHours = 6 * 60 * 60 * 1000;

        if(Number.isFinite(failedAt) && Date.now() - failedAt < sixHours){
            return false;
        }

    }

    return true;

}


async function queueNetworkMetadataSync(){

    ensureNetworkMetadataSyncData();

    const sync = DATA.network_sync;
    const missingIds = Object.values(DATA.shows || {})
    .filter(showNeedsNetworkMetadata)
    .map(show=>String(show.tmdb_id));

    const pending = Array.from(new Set([
        ...sync.pending.map(String),
        ...missingIds
    ])).filter(id=>DATA.shows[id]);

    sync.pending = pending;
    sync.failed = [];
    sync.active = pending.length > 0;

    if(sync.active && sync.completed >= sync.total){
        sync.total = sync.completed + pending.length;
    }else{
        sync.total = Math.max(sync.total || 0,sync.completed + pending.length);
    }

    await saveData();

}


async function startNetworkMetadataSync(){

    if(networkMetadataSyncRunning){
        return;
    }

    await queueNetworkMetadataSync();

    const sync = DATA.network_sync;

    if(!sync.active || sync.pending.length === 0){
        return;
    }

    networkMetadataSyncRunning = true;

    try{

        while(sync.pending.length > 0){

            const showId = String(sync.pending.shift());
            const show = DATA.shows[showId];

            if(!show || !showNeedsNetworkMetadata(show)){
                sync.completed += 1;
                continue;
            }

            sync.current = show.title || showId;
            sync.lastRun = new Date().toISOString();

            try{

                const details = await tmdbGetShowDetails(show.tmdb_id);

                if(!details){
                    throw new Error("No TMDB details returned");
                }

                show.networks = normalizeTMDBNetworks(details);
                show._network_metadata_version = 1;
                show._network_metadata_failed_at = "";
                sync.completed += 1;

            }catch(error){

                sync.completed += 1;
                show._network_metadata_failed_at = new Date().toISOString();
                sync.failed.push({
                    showId:showId,
                    title:show.title || showId,
                    error:error && error.message ? error.message : "Network metadata sync failed"
                });

            }

            await saveData();
            await waitForImportTick(100);

        }

        sync.active = false;
        sync.current = "";
        sync.completedAt = new Date().toISOString();
        await saveData();

    }finally{

        networkMetadataSyncRunning = false;

        if(activePage === "profile" && activeProfileView === "stats"){
            renderProfile();
        }

    }

}


function getNetworkMetadataSyncSummary(){

    ensureNetworkMetadataSyncData();

    const sync = DATA.network_sync;
    const total = Number(sync.total || 0);
    const completed = Number(sync.completed || 0);

    return {
        running:networkMetadataSyncRunning === true,
        active:sync.active === true,
        total:total,
        completed:completed,
        pending:sync.pending.length,
        failed:sync.failed.length,
        current:sync.current || "",
        percent:total > 0 ? Math.min(100,Math.round((completed / total) * 100)) : 100
    };

}



async function saveProfileSettings(settings){

    ensureProfileData();

    const next = settings && typeof settings === "object" ? settings : {};
    const username = String(next.username || "").trim().slice(0,30) || "Username";
    const allowedTypes = ["initial","preset","upload"];
    const avatarType = allowedTypes.includes(next.avatar_type) ? next.avatar_type : "initial";
    const avatarPreset = ["silhouette-1","silhouette-2","silhouette-3","silhouette-4"].includes(next.avatar_preset)
    ? next.avatar_preset
    : "silhouette-1";
    const avatarData = avatarType === "upload" && typeof next.avatar_data === "string" && next.avatar_data.startsWith("data:image/webp")
    ? next.avatar_data
    : "";
    const allowedHeaderTypes = ["preset","upload"];
    const headerType = allowedHeaderTypes.includes(next.header_type) ? next.header_type : "preset";
    const allowedHeaderPresets = ["default","blue","purple","green","amber","monochrome"];
    const headerPreset = allowedHeaderPresets.includes(next.header_preset)
    ? next.header_preset
    : "default";
    const headerImage = headerType === "upload" && typeof next.header_image === "string" && next.header_image.startsWith("data:image/webp")
    ? next.header_image
    : "";

    DATA.profile.username = username;
    DATA.profile.avatar_type = avatarType === "upload" && !avatarData ? "initial" : avatarType;
    DATA.profile.avatar_preset = avatarPreset;
    DATA.profile.avatar_data = avatarData;
    DATA.profile.header_type = headerType === "upload" && !headerImage ? "preset" : headerType;
    DATA.profile.header_preset = headerPreset;
    DATA.profile.header_image = headerImage;

    refreshInterfaceForDataChanges({
        showIds:[],
        historyChanged:false,
        stateChanged:true,
        remote:false
    });
    showToast("Profile saved");
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});

}


function getEligibleStatsShows(){

    return Object.values(DATA.shows || {}).filter(show=>{
        return show && show.status !== "plan";
    });

}


function getTopShowGenres(shows,limit=10){

    const counts = new Map();

    shows.forEach(show=>{

        const seen = new Set();

        (Array.isArray(show.genres) ? show.genres : []).forEach(genre=>{

            const name = String(genre || "").trim();
            const key = name.toLowerCase();

            if(!name || seen.has(key)){
                return;
            }

            seen.add(key);
            counts.set(name,(counts.get(name) || 0) + 1);

        });

    });

    return Array.from(counts.entries())
    .map(([name,count])=>({
        name:name,
        count:count,
        percentage:shows.length ? Math.round((count / shows.length) * 100) : 0
    }))
    .sort((a,b)=>b.count - a.count || a.name.localeCompare(b.name))
    .slice(0,limit);

}


function getTopShowNetworks(shows,limit=10){

    const counts = new Map();

    shows.forEach(show=>{

        const seen = new Set();
        const networks = Array.isArray(show.networks) ? show.networks : [];

        networks.forEach(network=>{

            const name = typeof network === "string"
            ? String(network).trim()
            : network && network.name
            ? String(network.name).trim()
            : "";

            const key = name.toLowerCase();

            if(!name || seen.has(key)){
                return;
            }

            seen.add(key);

            const current = counts.get(key) || {
                name:name,
                count:0,
                logo_path:""
            };

            current.count += 1;

            if(!current.logo_path && network && typeof network === "object"){
                current.logo_path = network.logo_path || "";
            }

            counts.set(key,current);

        });

    });

    return Array.from(counts.values())
    .map(item=>({
        name:item.name,
        count:item.count,
        logo_path:item.logo_path || "",
        percentage:shows.length ? Math.round((item.count / shows.length) * 100) : 0
    }))
    .sort((a,b)=>b.count - a.count || a.name.localeCompare(b.name))
    .slice(0,limit);

}


function getProfileStats(){

    ensureProfileData();

    const shows = Object.values(DATA.shows || {});
    const eligibleStatsShows = getEligibleStatsShows();
    const historyEntries = getHistoryEntries();
    const episodesWatched = historyEntries.length;
    const specialEpisodesWatched = historyEntries.filter(entry=>{
        return Number(entry.season) === 0 || entry.special === true;
    }).length;
    const regularEpisodesWatched = Math.max(episodesWatched - specialEpisodesWatched,0);
    const watchMinutes = getTotalWatchMinutes(historyEntries);

    const statusCounts = {
        watching:0,
        finished:0,
        plan:0,
        paused:0,
        dropped:0
    };

    shows.forEach(show=>{
        const status = String(show.status || "plan");
        if(statusCounts[status] === undefined){
            statusCounts[status] = 0;
        }
        statusCounts[status] += 1;
    });

    return {
        username:DATA.profile.username || "Username",
        avatar_type:DATA.profile.avatar_type || "initial",
        avatar_preset:DATA.profile.avatar_preset || "silhouette-1",
        avatar_data:DATA.profile.avatar_data || "",
        header_type:DATA.profile.header_type || "preset",
        header_preset:DATA.profile.header_preset || "default",
        header_image:DATA.profile.header_image || "",
        watchMinutes:watchMinutes,
        watchTimeText:formatWatchTime(watchMinutes),
        watchHoursRounded:Math.round(watchMinutes / 60),
        episodesWatched:episodesWatched,
        regularEpisodesWatched:regularEpisodesWatched,
        specialEpisodesWatched:specialEpisodesWatched,
        showsTracked:shows.length,
        completedShows:statusCounts.finished || 0,
        watchingShows:statusCounts.watching || 0,
        planShows:statusCounts.plan || 0,
        pausedShows:statusCounts.paused || 0,
        droppedShows:statusCounts.dropped || 0,
        eligibleStatsShows:eligibleStatsShows.length,
        topGenres:getTopShowGenres(eligibleStatsShows,10),
        topNetworks:getTopShowNetworks(eligibleStatsShows,10),
        favoriteShows:getFavoriteShows()
    };

}

function getTotalWatchMinutes(entries){

    let total = 0;

    entries.forEach(entry=>{
        total += getHistoryEpisodeRuntime(entry);
    });

    return total;

}



function getHistoryEpisodeRuntime(entry){

    const show = DATA.shows[String(entry.tmdb_id)];

    if(show){

        const episodeList =
        show._episode_list &&
        Array.isArray(show._episode_list[String(entry.season)])
        ? show._episode_list[String(entry.season)]
        : [];

        const episode = episodeList.find(ep=>{
            return Number(ep.episode_number) === Number(entry.episode);
        });

        if(episode && Number(episode.runtime) > 0){
            return Number(episode.runtime);
        }

        const details = show._episode_details || {};
        const detail = details[`${entry.season}-${entry.episode}`];

        if(detail && Number(detail.runtime) > 0){
            return Number(detail.runtime);
        }

    }

    return 45;

}



function formatWatchTime(totalMinutes){

    const safeMinutes = Math.max(Number(totalMinutes) || 0,0);
    const totalHours = Math.floor(safeMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    const hours = totalHours % 24;

    const parts = [];

    if(months > 0){
        parts.push(months + "mo");
    }

    if(days > 0){
        parts.push(days + "d");
    }

    if(hours > 0 || parts.length === 0){
        parts.push(hours + "h");
    }

    return parts.join(" ");

}





function normalizeFavoriteMovieRecord(movie){

    if(!movie || typeof movie !== "object"){
        return null;
    }

    const id = normalizeRouteId(movie.id || movie.tmdb_id || "");
    if(!id){
        return null;
    }

    const releaseDate = String(movie.release_date || "").trim();
    const year = String(movie.year || (releaseDate ? releaseDate.slice(0,4) : "")).trim();

    return {
        id:id,
        tmdb_id:id,
        title:String(movie.title || movie.name || movie.original_title || "Untitled").trim() || "Untitled",
        poster_path:String(movie.poster_path || "").trim(),
        backdrop_path:String(movie.backdrop_path || "").trim(),
        release_date:releaseDate,
        year:year
    };

}

function isMovieFavorite(movieId){

    ensureProfileData();

    const id = normalizeRouteId(movieId);
    if(!id){
        return false;
    }

    return DATA.profile.favorite_movies.some(item=>{
        return String(item && (item.id || item.tmdb_id)) === id;
    });

}

async function setMovieFavoriteState(movie,shouldFavorite,options={}){

    ensureProfileData();
    ensureMovieTrackingData();

    const record = normalizeFavoriteMovieRecord(movie);
    if(!record){
        return {success:false,changed:false};
    }

    const id = record.id;
    const favorite = shouldFavorite === true;
    const alreadyFavorite = isMovieFavorite(id);

    if(favorite && !alreadyFavorite && DATA.profile.favorite_movies.length >= 8){
        showToast("You can only choose 8 favorite movies");
        return {success:false,changed:false,limit:true};
    }

    if(favorite){
        if(!alreadyFavorite){
            DATA.profile.favorite_movies.push(record);
        }else{
            DATA.profile.favorite_movies = DATA.profile.favorite_movies.map(item=>{
                return String(item && (item.id || item.tmdb_id)) === id ? record : item;
            });
        }
        upsertMovieTrackingRecord(record,{favorite:true,updated_at:new Date().toISOString()});
    }else{
        DATA.profile.favorite_movies = DATA.profile.favorite_movies.filter(item=>{
            return String(item && (item.id || item.tmdb_id)) !== id;
        });
        const tracked = getMovieTrackingRecord(id);
        if(tracked){
            upsertMovieTrackingRecord(tracked,{favorite:false,updated_at:new Date().toISOString()});
        }
    }

    if(typeof renderAll === "function"){
        renderAll();
    }
    if(typeof renderFavoritesPopup === "function"){
        const popup = document.getElementById("favorites-popup");
        if(popup && popup.style.display === "flex"){
            renderFavoritesPopup("movie");
        }
    }

    if(options.showMessage === true){
        showToast(favorite ? "Added to Favorites" : "Removed from Favorites");
    }

    await waitForNextPaint();
    await saveData({stateKeys:["profile","movies"]});

    return {success:true,changed:alreadyFavorite !== favorite};

}


function normalizeFavoriteMovieFromSearch(item){

    return normalizeFavoriteMovieRecord({
        id:item && item.id,
        tmdb_id:item && item.id,
        title:item && (item.title || item.name),
        poster_path:item && item.poster_path,
        backdrop_path:item && item.backdrop_path,
        release_date:item && (item.release_date || item.date),
        year:item && (item.year || (item.release_date ? String(item.release_date).slice(0,4) : ""))
    });

}

function getFavoriteShows(){

    ensureProfileData();

    return DATA.profile.favorite_shows
    .map(id=>DATA.shows[String(id)])
    .filter(show=>show);

}



function getAvailableFavoriteShows(){

    ensureProfileData();

    const favoriteIds = DATA.profile.favorite_shows.map(id=>String(id));

    return Object.values(DATA.shows)
    .filter(show=>{
        return !favoriteIds.includes(String(show.tmdb_id));
    })
    .sort((a,b)=>{
        return String(a.title || "").localeCompare(String(b.title || ""));
    });

}




function getFavoriteMovies(){

    ensureProfileData();

    return DATA.profile.favorite_movies
    .map(movie=>normalizeFavoriteMovieRecord(movie))
    .filter(Boolean);

}



function getFavoriteMovieById(movieId){

    const id = normalizeRouteId(movieId);
    if(!id){
        return null;
    }

    return getFavoriteMovies().find(movie=>String(movie.id) === id) || null;

}



async function addFavoriteMovie(movie){

    return setMovieFavoriteState(movie,true,{showMessage:false});

}



async function removeFavoriteMovie(movieId){

    const id = normalizeRouteId(movieId);
    if(!id){
        return {success:false,changed:false};
    }

    const existing = getFavoriteMovieById(id) || getMovieTrackingRecord(id);
    if(!existing){
        return {success:true,changed:false};
    }

    return setMovieFavoriteState(existing,false,{showMessage:false});

}



async function saveFavoriteMoviesOrder(movieIds){

    ensureProfileData();

    const current = getFavoriteMovies();
    const requested = Array.isArray(movieIds)
    ? movieIds.map(id=>normalizeRouteId(id)).filter(Boolean)
    : [];

    const sameMembers = requested.length === current.length && requested.every(id=>current.some(movie=>String(movie.id) === id));
    if(!sameMembers){
        return false;
    }

    DATA.profile.favorite_movies = requested.map(id=>current.find(movie=>String(movie.id) === id)).filter(Boolean);
    renderAll();
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});
    return true;

}



async function addFavoriteShow(showId){

    ensureProfileData();

    const id = String(showId);

    if(!DATA.shows[id]){
        return;
    }

    if(DATA.profile.favorite_shows.includes(id)){
        return;
    }

    if(DATA.profile.favorite_shows.length >= 8){
        showToast("You can only choose 8 favorite shows");
        return;
    }

    DATA.profile.favorite_shows.push(id);

    renderAll();
    renderFavoritesPopup();
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});

}



async function removeFavoriteShow(showId){

    ensureProfileData();

    const id = String(showId);

    DATA.profile.favorite_shows = DATA.profile.favorite_shows.filter(item=>{
        return String(item) !== id;
    });

    renderAll();
    renderFavoritesPopup();
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});

}



async function moveFavoriteShow(showId,direction){

    ensureProfileData();

    const id = String(showId);
    const index = DATA.profile.favorite_shows.indexOf(id);

    if(index === -1){
        return;
    }

    const newIndex = index + direction;

    if(newIndex < 0 || newIndex >= DATA.profile.favorite_shows.length){
        return;
    }

    const temp = DATA.profile.favorite_shows[index];
    DATA.profile.favorite_shows[index] = DATA.profile.favorite_shows[newIndex];
    DATA.profile.favorite_shows[newIndex] = temp;

    renderAll();
    renderFavoritesPopup();
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});

}



async function reorderFavoriteShows(draggedShowId,targetShowId){

    ensureProfileData();

    const draggedId = String(draggedShowId || "");
    const targetId = String(targetShowId || "");

    if(!draggedId || !targetId || draggedId === targetId){
        return;
    }

    const favorites = DATA.profile.favorite_shows.map(String);
    const draggedIndex = favorites.indexOf(draggedId);
    const targetIndex = favorites.indexOf(targetId);

    if(draggedIndex === -1 || targetIndex === -1){
        return;
    }

    favorites.splice(draggedIndex,1);
    favorites.splice(targetIndex,0,draggedId);

    DATA.profile.favorite_shows = favorites;

    renderAll();
    renderFavoritesPopup();
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});

}



async function saveFavoriteShowsOrder(showIds){

    ensureProfileData();

    const current = DATA.profile.favorite_shows.map(String);
    const requested = Array.isArray(showIds)
    ? showIds.map(id=>String(id || "")).filter(Boolean)
    : [];

    const uniqueRequested = requested.filter((id,index,array)=>{
        return array.indexOf(id) === index;
    });

    const sameMembers = (
        uniqueRequested.length === current.length &&
        uniqueRequested.every(id=>current.includes(id))
    );

    if(!sameMembers){
        return false;
    }

    const changed = uniqueRequested.some((id,index)=>{
        return id !== current[index];
    });

    if(!changed){
        return true;
    }

    DATA.profile.favorite_shows = uniqueRequested;

    renderAll();
    await waitForNextPaint();
    await saveData({stateKeys:["profile"]});

    return true;

}




function getBackupSummary(){

    ensureProfileData();

    const shows = Object.values(DATA.shows || {});
    const history = Array.isArray(DATA.history) ? DATA.history : [];
    const favorites = DATA.profile && Array.isArray(DATA.profile.favorite_shows)
    ? DATA.profile.favorite_shows
    : [];
    const favoriteMovies = DATA.profile && Array.isArray(DATA.profile.favorite_movies)
    ? DATA.profile.favorite_movies
    : [];

    const specialHistoryEntries = history.filter(entry=>{
        return Number(entry.season) === 0 || entry.special === true;
    }).length;

    return {
        shows:shows.length,
        historyEntries:history.length,
        regularHistoryEntries:history.length - specialHistoryEntries,
        specialHistoryEntries:specialHistoryEntries,
        favorites:favorites.length,
        favoriteMovies:favoriteMovies.length
    };

}



async function prepareAndCommitTrackerData(data,backupTemplate=null,options={}){
    const previousData = DATA;
    const shouldUpdateStatuses = options && options.updateStatuses === true;

    try{
        DATA = getCleanTrackerDataCopy(data || {});
        normalizeExistingData();

        if(shouldUpdateStatuses){
            await autoUpdateStatuses(false,false);
        }

        const preparedData = JSON.parse(JSON.stringify(DATA));
        DATA = previousData;
        return await commitTrackerDataTransactionally(preparedData,backupTemplate);
    }catch(error){
        DATA = previousData;
        throw error;
    }
}


async function commitTrackerDataTransactionally(data,backupTemplate=null){
    const replacement = getCleanTrackerDataCopy(data || {});
    ensureHistoryIds(replacement);

    const backup = backupTemplate && typeof backupTemplate === "object"
    ? JSON.parse(JSON.stringify(backupTemplate))
    : {
        app:"TV Tracker",
        backupType:"native-app-backup",
        backupVersion:2,
        schemaVersion:4,
        exportedAt:new Date().toISOString(),
        summary:null,
        data:null
    };

    backup.data = replacement;
    backup.summary = {
        shows:Object.keys(replacement.shows || {}).length,
        historyEntries:Array.isArray(replacement.history) ? replacement.history.length : 0,
        favorites:replacement.profile && Array.isArray(replacement.profile.favorite_shows)
        ? replacement.profile.favorite_shows.length
        : 0,
        favoriteMovies:replacement.profile && Array.isArray(replacement.profile.favorite_movies)
        ? replacement.profile.favorite_movies.length
        : 0
    };

    const response = await fetch("/api/backup/import",{
        method:"POST",
        credentials:"same-origin",
        cache:"no-store",
        headers:{
            "Accept":"application/json",
            "Content-Type":"application/json",
            "X-CSRF-Token":csrfToken()
        },
        body:JSON.stringify(backup)
    });
    const payload = await parseAPIResponse(response);
    adoptTransactionalTrackerData(replacement,payload.revision);
    return payload;
}


function getNativeBackupObject(){

    ensureProfileData();

    return {
        app:"TV Tracker",
        backupType:"native-app-backup",
        backupVersion:2,
        schemaVersion:4,
        exportedAt:new Date().toISOString(),
        summary:getBackupSummary(),
        data:getCleanTrackerDataCopy(DATA)
    };

}



function exportNativeBackupJSON(){

    try{

        const backup = getNativeBackupObject();
        const json = JSON.stringify(backup,null,2);
        const date = getExportDateString();
        const fileName = `tv-tracker-app-backup-${date}.json`;

        downloadTextFile(fileName,json,"application/json;charset=utf-8");

        showToast("App backup exported");

    }catch(error){

        console.error(error);
        showToast("Could not export backup");

    }

}




async function showImportCompleteSummary(summary,cleanup){
    const cleanSummary = summary || {};
    const clean = cleanup || createDuplicateCleanupSummary();
    const duplicateShows = Number(clean.duplicateShowsRemoved || 0);
    const duplicateHistory = Number(clean.duplicateWatchedRecordsRemoved || 0);
    const duplicateProgress = Number(clean.duplicateProgressEntriesRemoved || 0);
    const fixedTotal = duplicateShows + duplicateHistory + duplicateProgress;

    const lines = [
        `Shows imported: ${Number(cleanSummary.shows || 0).toLocaleString()}`,
        `History entries imported: ${Number(cleanSummary.historyEntries || 0).toLocaleString()}`,
        `Favorite shows imported: ${Number(cleanSummary.favorites || 0).toLocaleString()}`,
        `Favorite movies imported: ${Number(cleanSummary.favoriteMovies || 0).toLocaleString()}`,
        ""
    ];

    if(fixedTotal > 0){
        lines.push(`Duplicate shows removed: ${duplicateShows.toLocaleString()}`);
        lines.push(`Duplicate watched records removed: ${duplicateHistory.toLocaleString()}`);
        lines.push(`Duplicate progress entries removed: ${duplicateProgress.toLocaleString()}`);
    }else{
        lines.push("No duplicate records found.");
    }

    if(typeof showAppAlert === "function"){
        await showAppAlert({
            title:"Import Complete",
            message:lines.join(String.fromCharCode(10)),
            confirmLabel:"OK"
        });
        return;
    }

    showToast("Import complete");
}

function importNativeBackupJSON(){

    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener("change",async function(){

        const file = input.files && input.files[0];

        if(!file){
            return;
        }

        try{

            const text = await readTextFile(file);
            const backup = JSON.parse(text);
            const validation = validateNativeBackupObject(backup);

            if(!validation.valid){
                showToast(validation.message || "Invalid app backup file");
                return;
            }

            const incomingSummary = validation.summary;
            const currentSummary = getBackupSummary();

            const confirmed = await showAppConfirm({
                title:"Import App Backup JSON",
                message:[
                    "This will replace your current tracker data.",
                    "Native backups are restored exactly; statuses are not recalculated during restore.",
                    "The server validates the complete backup before changing anything.",
                    "",
                    "Current data:",
                    `Shows: ${Number(currentSummary.shows).toLocaleString()}`,
                    `History entries: ${Number(currentSummary.historyEntries).toLocaleString()}`,
                    `Favorites: ${Number(currentSummary.favorites).toLocaleString()}`,
                    "",
                    "Backup file:",
                    `Shows: ${Number(incomingSummary.shows).toLocaleString()}`,
                    `History entries: ${Number(incomingSummary.historyEntries).toLocaleString()}`,
                    `Favorites: ${Number(incomingSummary.favorites).toLocaleString()}`,
                    "",
                    "Continue?"
                ].join(String.fromCharCode(10)),
                confirmLabel:"Import",
                cancelLabel:"Cancel",
                danger:true
            });

            if(!confirmed){
                return;
            }

            showToast("Validating and importing backup...");

            const importCleanupSummary = createDuplicateCleanupSummary();
            const preparedImportData = JSON.parse(JSON.stringify(backup.data || {}));
            normalizeTrackerDataForEpisodeIntegrity(preparedImportData,importCleanupSummary);

            const preparedBackup = JSON.parse(JSON.stringify(backup));
            preparedBackup.data = preparedImportData;
            preparedBackup.summary = {
                shows:Object.keys(preparedImportData.shows || {}).length,
                historyEntries:Array.isArray(preparedImportData.history) ? preparedImportData.history.length : 0,
                favorites:preparedImportData.profile && Array.isArray(preparedImportData.profile.favorite_shows)
                ? preparedImportData.profile.favorite_shows.length
                : 0,
                favoriteMovies:preparedImportData.profile && Array.isArray(preparedImportData.profile.favorite_movies)
                ? preparedImportData.profile.favorite_movies.length
                : 0
            };

            await prepareAndCommitTrackerData(
                preparedImportData,
                preparedBackup,
                {updateStatuses:false}
            );
                    renderAll();
            await showImportCompleteSummary(preparedBackup.summary,importCleanupSummary);

        }catch(error){

            console.error(error);
            const message = typeof friendlyRequestError === "function"
            ? friendlyRequestError(error,"Could not import backup")
            : (error && error.message ? error.message : "Could not import backup");
            showToast(message);

        }

    });

    input.click();

}


function getEmptyTrackerData(){

    return {
        shows:{},
        movies:{},
        history:[],
        profile:{
            username:"Username",
            favorite_shows:[],
            favorite_movies:[],
            avatar_type:"initial",
            avatar_preset:"silhouette-1",
            avatar_data:""
        },
        metadata_sync:createEmptyMetadataSyncData(),
        network_sync:createEmptyNetworkMetadataSyncData()
    };

}



async function resetTrackerData(){

    const firstConfirm = await showAppConfirm({
        title:"Reset All Tracker Data",
        message:[
            "This will delete all shows, watched episodes, history, favorites, and profile data.",
            "",
            "This cannot be undone unless you already exported an App Backup JSON.",
            "",
            "Continue?"
        ].join(String.fromCharCode(10)),
        confirmLabel:"Continue",
        cancelLabel:"Cancel",
        danger:true
    });

    if(!firstConfirm){
        return;
    }

    const typed = await showAppPrompt({
        title:"Type RESET",
        message:"Type RESET to permanently delete all tracker data.",
        confirmLabel:"Reset",
        cancelLabel:"Cancel",
        placeholder:"RESET",
        danger:true
    });

    if(typed !== "RESET"){
        showToast("Reset cancelled");
        return;
    }

    const replacementData = getEmptyTrackerData();

    pendingShow = null;
    selectedShowId = null;
    expandedSeasons = {};
    expandedUpcomingBatches = {};
    lastCompatibleImportPreview = null;
    lastCompatibleCSVPreview = null;

    await prepareAndCommitTrackerData(replacementData);

    renderAll();
    showToast("Tracker data reset");

}



function readTextFile(file){

    return new Promise((resolve,reject)=>{

        const reader = new FileReader();

        reader.onload = function(){
            resolve(String(reader.result || ""));
        };

        reader.onerror = function(){
            reject(reader.error || new Error("Could not read file"));
        };

        reader.readAsText(file);

    });

}



function validateNativeBackupObject(backup){

    if(!backup || typeof backup !== "object"){
        return {valid:false,message:"Invalid app backup file"};
    }

    if(backup.app !== "TV Tracker" || backup.backupType !== "native-app-backup"){
        return {valid:false,message:"This is not a TV Tracker app backup"};
    }

    const backupVersion = Number(backup.backupVersion || 1);
    const schemaVersion = Number(backup.schemaVersion || 1);

    if(![1,2].includes(backupVersion)){
        return {valid:false,message:"This backup version is not supported"};
    }

    if(!Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > 4){
        return {valid:false,message:"This backup was created by an unsupported TV Tracker version"};
    }

    if(!backup.data || typeof backup.data !== "object"){
        return {valid:false,message:"Backup is missing app data"};
    }

    if(!backup.data.shows || typeof backup.data.shows !== "object" || Array.isArray(backup.data.shows)){
        return {valid:false,message:"Backup is missing shows data"};
    }

    if(backup.data.history && !Array.isArray(backup.data.history)){
        return {valid:false,message:"Backup history data is invalid"};
    }

    const profile = backup.data.profile && typeof backup.data.profile === "object"
    ? backup.data.profile
    : {};

    const favorites = Array.isArray(profile.favorite_shows)
    ? profile.favorite_shows
    : [];
    const favoriteMovies = Array.isArray(profile.favorite_movies)
    ? profile.favorite_movies
    : [];

    const history = Array.isArray(backup.data.history)
    ? backup.data.history
    : [];

    const duplicateIds = new Set();
    const seenIds = new Set();
    history.forEach(entry=>{
        const id = entry && entry.id ? String(entry.id) : "";
        if(id && seenIds.has(id)){
            duplicateIds.add(id);
        }
        if(id){
            seenIds.add(id);
        }
    });

    return {
        valid:true,
        summary:{
            shows:Object.keys(backup.data.shows).length,
            historyEntries:history.length,
            favorites:favorites.length,
            favoriteMovies:favoriteMovies.length,
            backupVersion:backupVersion,
            schemaVersion:schemaVersion
        }
    };

}


function getLastCompatibleImportPreview(){

    return lastCompatibleImportPreview;

}


function getLastCompatibleCSVPreview(){

    return lastCompatibleCSVPreview;

}


function previewCompatibleBackupCSV(){

    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".csv,text/csv";
    input.multiple = true;

    input.addEventListener("change",async function(){

        const files = Array.from(input.files || []);

        if(files.length === 0){
            return;
        }

        try{

            const csvFiles = [];

            for(const file of files){
                const text = await readTextFile(file);
                csvFiles.push({fileName:file.name,text:text});
            }

            const preview = analyzeCompatibleCSVBackup(csvFiles);
            lastCompatibleCSVPreview = preview;
            renderSettings();
            showToast("Compatible CSV preview ready");

        }catch(error){

            console.error(error);
            showToast(error && error.message ? error.message : "Could not preview CSV file");

        }

    });

    input.click();

}


function analyzeCompatibleCSVBackup(csvFiles){

    if(!Array.isArray(csvFiles) || csvFiles.length === 0){
        throw new Error("Select one or both compatible CSV files");
    }

    const parsedFiles = csvFiles.map(file=>{
        const table = parseCSVTable(file.text || "");
        const type = detectCompatibleCSVType(table.headers);
        return {
            fileName:file.fileName || "CSV file",
            type:type,
            headers:table.headers,
            rows:table.rows
        };
    });

    const seriesFiles = parsedFiles.filter(file=>file.type === "series");
    const episodeFiles = parsedFiles.filter(file=>file.type === "episodes");

    if(seriesFiles.length === 0 && episodeFiles.length === 0){
        throw new Error("These CSV files do not look like compatible series/episodes exports");
    }

    const seriesRows = seriesFiles.flatMap(file=>file.rows.map(row=>Object.assign({_fileName:file.fileName},row)));
    const episodeRows = episodeFiles.flatMap(file=>file.rows.map(row=>Object.assign({_fileName:file.fileName},row)));

    const showsByKey = {};

    seriesRows.forEach(row=>{
        const key = getCompatibleCSVSeriesKey(row);
        if(!key){
            return;
        }
        if(!showsByKey[key]){
            showsByKey[key] = {
                key:key,
                title:csvValue(row.title) || "Untitled",
                uuid:csvValue(row.uuid),
                tvdb_id:csvValue(row.tvdb_id),
                imdb_id:csvValue(row.imdb_id),
                status:csvValue(row.status) || "unknown",
                created_at:csvValue(row.created_at),
                regularEpisodes:0,
                watchedRegularEpisodes:0,
                specialEpisodes:0,
                watchedSpecialEpisodes:0,
                watchedWithoutDate:0,
                episodeRows:0,
                fromSeriesFile:true,
                fromEpisodeFile:false
            };
        }else{
            showsByKey[key].fromSeriesFile = true;
            showsByKey[key].status = showsByKey[key].status || csvValue(row.status) || "unknown";
        }
    });

    episodeRows.forEach(row=>{
        const key = getCompatibleCSVEpisodeSeriesKey(row);
        if(!key){
            return;
        }
        if(!showsByKey[key]){
            showsByKey[key] = {
                key:key,
                title:csvValue(row.title) || "Untitled",
                uuid:csvValue(row.series_uuid),
                tvdb_id:csvValue(row.series_tvdb_id),
                imdb_id:csvValue(row.series_imdb_id),
                status:"unknown",
                created_at:"",
                regularEpisodes:0,
                watchedRegularEpisodes:0,
                specialEpisodes:0,
                watchedSpecialEpisodes:0,
                watchedWithoutDate:0,
                episodeRows:0,
                fromSeriesFile:false,
                fromEpisodeFile:true
            };
        }

        const show = showsByKey[key];
        show.fromEpisodeFile = true;
        show.episodeRows += 1;

        if(!show.title || show.title === "Untitled"){
            show.title = csvValue(row.title) || show.title;
        }
        if(!show.tvdb_id){
            show.tvdb_id = csvValue(row.series_tvdb_id);
        }
        if(!show.imdb_id){
            show.imdb_id = csvValue(row.series_imdb_id);
        }

        const isSpecial = parseCompatibleCSVBoolean(row.special) || Number(row.season) === 0;
        const isWatched = parseCompatibleCSVBoolean(row.is_watched) || Number(row.watched_count || row.rewatch_count || 0) > 0;
        const watchedAt = csvValue(row.watched_at);

        if(isSpecial){
            show.specialEpisodes += 1;
            if(isWatched){
                show.watchedSpecialEpisodes += 1;
            }
        }else{
            show.regularEpisodes += 1;
            if(isWatched){
                show.watchedRegularEpisodes += 1;
            }
        }

        if(isWatched && !watchedAt){
            show.watchedWithoutDate += 1;
        }
    });

    const shows = Object.values(showsByKey);

    const preview = {
        fileName:parsedFiles.map(file=>file.fileName).join(" + "),
        files:parsedFiles.length,
        seriesFiles:seriesFiles.length,
        episodeFiles:episodeFiles.length,
        seriesRows:seriesRows.length,
        episodeRows:episodeRows.length,
        shows:shows.length,
        tvdbIds:0,
        imdbIds:0,
        favorites:0,
        regularEpisodes:0,
        watchedRegularEpisodes:0,
        specialEpisodes:0,
        watchedSpecialEpisodes:0,
        watchedWithoutDate:0,
        unmatchedEpisodeSeries:0,
        missingEpisodeDataShows:0,
        statusCounts:{},
        mappedStatusCounts:{
            completed:0,
            watching:0,
            plan:0,
            dropped:0,
            review:0
        },
        warnings:[]
    };

    shows.forEach(show=>{
        if(show.tvdb_id){
            preview.tvdbIds += 1;
        }
        if(show.imdb_id){
            preview.imdbIds += 1;
        }

        const status = show.status || "unknown";
        preview.statusCounts[status] = (preview.statusCounts[status] || 0) + 1;

        preview.regularEpisodes += show.regularEpisodes;
        preview.watchedRegularEpisodes += show.watchedRegularEpisodes;
        preview.specialEpisodes += show.specialEpisodes;
        preview.watchedSpecialEpisodes += show.watchedSpecialEpisodes;
        preview.watchedWithoutDate += show.watchedWithoutDate;

        if(!show.fromSeriesFile && show.fromEpisodeFile){
            preview.unmatchedEpisodeSeries += 1;
        }

        if(show.fromSeriesFile && !show.fromEpisodeFile){
            preview.missingEpisodeDataShows += 1;
        }

        const mappedStatus = estimateCompatibleMappedStatusFromCSV(show);
        preview.mappedStatusCounts[mappedStatus] = (preview.mappedStatusCounts[mappedStatus] || 0) + 1;
    });

    if(seriesFiles.length === 0){
        preview.warnings.push("Series CSV not selected. The preview can estimate episode counts, but statuses and created_at data are incomplete.");
    }

    if(episodeFiles.length === 0){
        preview.warnings.push("Episodes CSV not selected. The preview can read shows/statuses, but watched episode totals and specials cannot be verified.");
    }

    if(seriesFiles.length > 1 || episodeFiles.length > 1){
        preview.warnings.push("Multiple series or episode CSV files were selected. Rows were combined for preview.");
    }

    if(preview.specialEpisodes > 0){
        preview.warnings.push("Specials / Season 0 found. They should be preserved internally and counted in history/stats, while normal Upcoming ignores them for now.");
    }

    if(preview.unmatchedEpisodeSeries > 0){
        preview.warnings.push("Some episode rows did not have a matching row in the series CSV. They are still counted by TVDB/UUID/title for preview.");
    }

    if(preview.missingEpisodeDataShows > 0){
        preview.warnings.push("Some series rows have no matching episode rows. They may be shows with empty/missing episode data in the source export.");
    }

    if(preview.watchedWithoutDate > 0){
        preview.warnings.push("Some watched episodes have no watched_at date. They can be counted as watched, but history dates would need a fallback during import.");
    }

    preview.warnings.push("Preview only: no current tracker data was changed.");

    return preview;

}


function parseCSVTable(text){

    const rows = parseCSVRows(String(text || ""));

    if(rows.length === 0){
        return {headers:[],rows:[]};
    }

    const headers = rows[0].map(header=>normalizeCSVHeader(header));
    const dataRows = rows.slice(1).filter(row=>row.some(cell=>String(cell || "").trim() !== ""));

    return {
        headers:headers,
        rows:dataRows.map(row=>{
            const obj = {};
            headers.forEach((header,index)=>{
                obj[header] = row[index] !== undefined ? row[index] : "";
            });
            return obj;
        })
    };

}


function parseCSVRows(text){

    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for(let i = 0; i < text.length; i++){
        const char = text[i];
        const next = text[i + 1];

        if(char === '"'){
            if(insideQuotes && next === '"'){
                cell += '"';
                i += 1;
            }else{
                insideQuotes = !insideQuotes;
            }
            continue;
        }

        if(char === "," && !insideQuotes){
            row.push(cell);
            cell = "";
            continue;
        }

        if((char === "\n" || char === "\r") && !insideQuotes){
            if(char === "\r" && next === "\n"){
                i += 1;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    row.push(cell);
    rows.push(row);

    return rows;

}


function normalizeCSVHeader(header){

    return String(header || "")
        .replace(/^\uFEFF/,"")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g,"_")
        .replace(/^_+|_+$/g,"");

}


function detectCompatibleCSVType(headers){

    const set = new Set(headers || []);

    if(set.has("series_uuid") && set.has("season") && set.has("episode") && set.has("is_watched")){
        return "episodes";
    }

    if(set.has("uuid") && set.has("title") && set.has("status") && (set.has("tvdb_id") || set.has("imdb_id"))){
        return "series";
    }

    return "unknown";

}


function csvValue(value){

    return String(value === undefined || value === null ? "" : value).trim();

}


function parseCompatibleCSVBoolean(value){

    const text = csvValue(value).toLowerCase();

    return text === "true" || text === "1" || text === "yes" || text === "y";

}


function getCompatibleCSVSeriesKey(row){

    const uuid = csvValue(row.uuid);
    if(uuid){
        return "uuid:" + uuid;
    }

    const tvdb = csvValue(row.tvdb_id);
    if(tvdb){
        return "tvdb:" + tvdb;
    }

    const title = csvValue(row.title).toLowerCase();
    if(title){
        return "title:" + title;
    }

    return "";

}


function getCompatibleCSVEpisodeSeriesKey(row){

    const uuid = csvValue(row.series_uuid);
    if(uuid){
        return "uuid:" + uuid;
    }

    const tvdb = csvValue(row.series_tvdb_id);
    if(tvdb){
        return "tvdb:" + tvdb;
    }

    const title = csvValue(row.title).toLowerCase();
    if(title){
        return "title:" + title;
    }

    return "";

}


function estimateCompatibleMappedStatusFromCSV(show){

    const status = String(show && show.status ? show.status : "unknown");

    if(status === "up_to_date"){
        return "completed";
    }

    if(status === "continuing"){
        return "watching";
    }

    if(status === "not_started_yet"){
        return "plan";
    }

    if(status === "stopped"){
        if(show.regularEpisodes > 0 && show.watchedRegularEpisodes >= show.regularEpisodes){
            return "completed";
        }
        return "dropped";
    }

    return "review";

}


function previewCompatibleBackupJSON(){

    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener("change",async function(){

        const file = input.files && input.files[0];

        if(!file){
            return;
        }

        try{

            const text = await readTextFile(file);
            const parsed = JSON.parse(text);
            const preview = analyzeCompatibleJSONBackup(parsed,file.name);

            lastCompatibleImportPreview = preview;

            renderSettings();
            showToast("Compatible JSON preview ready");

        }catch(error){

            console.error(error);
            showToast(error && error.message ? error.message : "Could not preview JSON file");

        }

    });

    input.click();

}



function analyzeCompatibleJSONBackup(parsed,fileName){

    const shows = getCompatibleShowsArray(parsed);

    if(!shows){
        throw new Error("This JSON does not look like a compatible series export");
    }

    const preview = {
        fileName:fileName || "Selected JSON file",
        shows:shows.length,
        tvdbIds:0,
        imdbIds:0,
        favorites:0,
        noEpisodeDataShows:0,
        regularEpisodes:0,
        watchedRegularEpisodes:0,
        specialEpisodes:0,
        watchedSpecialEpisodes:0,
        watchedWithoutDate:0,
        showsWithSpecials:0,
        showsWithoutEpisodes:0,
        statusCounts:{},
        mappedStatusCounts:{
            completed:0,
            watching:0,
            plan:0,
            dropped:0,
            review:0
        },
        warnings:[]
    };

    shows.forEach(show=>{

        if(!show || typeof show !== "object"){
            return;
        }

        const ids = show.id && typeof show.id === "object" ? show.id : {};

        if(ids.tvdb || show.tvdb_id){
            preview.tvdbIds += 1;
        }

        if(ids.imdb || show.imdb_id){
            preview.imdbIds += 1;
        }

        if(show.is_favorite === true){
            preview.favorites += 1;
        }

        if(show._noEpisodeData === true){
            preview.noEpisodeDataShows += 1;
        }

        const status = String(show.status || "unknown");
        preview.statusCounts[status] = (preview.statusCounts[status] || 0) + 1;

        const showStats = analyzeCompatibleShowEpisodes(show);

        preview.regularEpisodes += showStats.regularEpisodes;
        preview.watchedRegularEpisodes += showStats.watchedRegularEpisodes;
        preview.specialEpisodes += showStats.specialEpisodes;
        preview.watchedSpecialEpisodes += showStats.watchedSpecialEpisodes;
        preview.watchedWithoutDate += showStats.watchedWithoutDate;

        if(showStats.specialEpisodes > 0){
            preview.showsWithSpecials += 1;
        }

        if(showStats.totalEpisodes === 0){
            preview.showsWithoutEpisodes += 1;
        }

        const mappedStatus = estimateCompatibleMappedStatus(show,showStats);
        preview.mappedStatusCounts[mappedStatus] = (preview.mappedStatusCounts[mappedStatus] || 0) + 1;

    });

    if(preview.specialEpisodes > 0){
        preview.warnings.push("Specials / Season 0 found. They will be preserved internally and included in history/stats, but normal Upcoming logic will ignore them for now.");
    }

    if(preview.tvdbIds > 0){
        preview.warnings.push("Most matching will use TVDB ID → TMDB ID. Unmatched shows will be kept as local-only records instead of being deleted.");
    }

    if(preview.watchedWithoutDate > 0){
        preview.warnings.push("Some watched episodes have no watched_at date. They can be imported as watched, but history dates will need a fallback.");
    }

    if(preview.noEpisodeDataShows > 0 || preview.showsWithoutEpisodes > 0){
        preview.warnings.push("Some shows have missing or empty episode data. The full import will keep the show, but may need TMDB data to rebuild episodes.");
    }

    preview.warnings.push("Preview only: no current tracker data was changed.");

    return preview;

}



function getCompatibleShowsArray(parsed){

    if(Array.isArray(parsed)){
        return parsed;
    }

    if(!parsed || typeof parsed !== "object"){
        return null;
    }

    if(Array.isArray(parsed.shows)){
        return parsed.shows;
    }

    if(Array.isArray(parsed.series)){
        return parsed.series;
    }

    if(parsed.data && Array.isArray(parsed.data.shows)){
        return parsed.data.shows;
    }

    if(parsed.data && Array.isArray(parsed.data.series)){
        return parsed.data.series;
    }

    return null;

}



function analyzeCompatibleShowEpisodes(show){

    const stats = {
        regularEpisodes:0,
        watchedRegularEpisodes:0,
        specialEpisodes:0,
        watchedSpecialEpisodes:0,
        watchedWithoutDate:0,
        totalEpisodes:0
    };

    const seasons = Array.isArray(show.seasons) ? show.seasons : [];

    seasons.forEach(season=>{

        const seasonNumber = Number(season && season.number);
        const seasonIsSpecial = season && (season.is_specials === true || seasonNumber === 0);
        const episodes = season && Array.isArray(season.episodes) ? season.episodes : [];

        episodes.forEach(episode=>{

            if(!episode || typeof episode !== "object"){
                return;
            }

            const episodeIsSpecial = seasonIsSpecial || episode.special === true;
            const isWatched = episode.is_watched === true || Number(episode.watched_count || 0) > 0;
            const hasWatchedDate = Boolean(episode.watched_at);

            stats.totalEpisodes += 1;

            if(episodeIsSpecial){
                stats.specialEpisodes += 1;
                if(isWatched){
                    stats.watchedSpecialEpisodes += 1;
                }
            }else{
                stats.regularEpisodes += 1;
                if(isWatched){
                    stats.watchedRegularEpisodes += 1;
                }
            }

            if(isWatched && !hasWatchedDate){
                stats.watchedWithoutDate += 1;
            }

        });

    });

    return stats;

}



function estimateCompatibleMappedStatus(show,stats){

    const status = String(show && show.status ? show.status : "unknown");

    if(status === "up_to_date"){
        return "completed";
    }

    if(status === "continuing"){
        return "watching";
    }

    if(status === "not_started_yet"){
        return "plan";
    }

    if(status === "stopped"){

        if(stats.regularEpisodes > 0 && stats.watchedRegularEpisodes >= stats.regularEpisodes){
            return "completed";
        }

        return "dropped";

    }

    return "review";

}


function canUseTMDBShow(show){

    if(!show || show.local_only === true){
        return false;
    }

    const id = Number(show.tmdb_id);

    return Number.isFinite(id) && id > 0;

}



function getAppStatusFromCompatibleMappedStatus(mappedStatus){

    if(mappedStatus === "completed"){
        return "finished";
    }

    if(mappedStatus === "watching"){
        return "watching";
    }

    if(mappedStatus === "plan"){
        return "plan";
    }

    if(mappedStatus === "dropped"){
        return "dropped";
    }

    return "paused";

}



function importCompatibleBackupJSON(){

    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json,application/json";

    input.addEventListener("change",async function(){

        const file = input.files && input.files[0];

        if(!file){
            return;
        }

        try{

            const text = await readTextFile(file);
            const parsed = JSON.parse(text);
            const preview = analyzeCompatibleJSONBackup(parsed,file.name);

            lastCompatibleImportPreview = preview;
            renderSettings();

            const currentSummary = getBackupSummary();

            const confirmed = await showAppConfirm({
                title:"Import Compatible JSON",
                message:[
                    "This will REPLACE your current tracker data with the imported file.",
                    "",
                    "Current tracker:",
                    `Shows: ${Number(currentSummary.shows).toLocaleString()}`,
                    `History entries: ${Number(currentSummary.historyEntries).toLocaleString()}`,
                    `Favorites: ${Number(currentSummary.favorites).toLocaleString()}`,
                    "",
                    "Imported file:",
                    `Shows: ${Number(preview.shows).toLocaleString()}`,
                    `Regular watched: ${Number(preview.watchedRegularEpisodes).toLocaleString()}`,
                    `Specials watched: ${Number(preview.watchedSpecialEpisodes).toLocaleString()}`,
                    "",
                    "This import uses your JSON as the source of truth for progress/history. The selected metadata source adds posters, air dates, and schedule data.",
                    "",
                    "Continue?"
                ].join(String.fromCharCode(10)),
                confirmLabel:"Import",
                cancelLabel:"Cancel",
                danger:true
            });

            if(!confirmed){
                showToast("Import cancelled");
                return;
            }

            showToast("Importing compatible JSON locally...");

            const importResult = await buildDataFromCompatibleJSON(parsed,file.name);

            pendingShow = null;
            selectedShowId = null;
            expandedSeasons = {};
            expandedUpcomingBatches = {};

            await prepareAndCommitTrackerData(
                importResult.data,
                null,
                {updateStatuses:true}
            );
        
            lastCompatibleImportPreview = importResult.preview;

            renderAll();

            await showAppAlert({
                title:"Compatible JSON Imported",
                message:[
                    `Shows imported: ${Number(importResult.report.showsImported).toLocaleString()}`,
                    `Saved immediately: ${Number(importResult.report.showsImported).toLocaleString()} shows`,
                    `Queued for metadata sync: ${Number((DATA.metadata_sync && DATA.metadata_sync.total) || 0).toLocaleString()}`,
                    `History entries: ${Number(importResult.report.historyEntries).toLocaleString()}`,
                    `Regular watched: ${Number(importResult.report.regularWatched).toLocaleString()}`,
                    `Specials preserved: ${Number(importResult.report.specialsPreserved).toLocaleString()}`,
                    "",
                    "You can close or switch tabs. Metadata sync will continue when the app is open and resume from Settings."
                ].join(String.fromCharCode(10)),
                confirmLabel:"OK"
            });

            showToast("Compatible JSON imported");
            startMetadataSync(false);

        }catch(error){

            console.error(error);
            showToast(
                typeof friendlyRequestError === "function"
                ? friendlyRequestError(error,"Could not import compatible JSON")
                : (error && error.message ? error.message : "Could not import compatible JSON")
            );

        }

    });

    input.click();

}



async function buildDataFromCompatibleJSON(parsed,fileName){

    const shows = getCompatibleShowsArray(parsed);

    if(!shows){
        throw new Error("This JSON does not look like a compatible series export");
    }

    const newData = getEmptyTrackerData();

    newData.import_info = {
        source:"compatible-json",
        fileName:fileName || "compatible.json",
        importedAt:new Date().toISOString(),
        dataModel:"source-of-truth-progress-v1"
    };

    const report = {
        showsImported:0,
        matchedToTMDB:0,
        localOnly:0,
        historyEntries:0,
        specialsPreserved:0,
        regularWatched:0,
        failedMatches:[],
        scheduleHydrated:0
    };

    for(let i = 0; i < shows.length; i++){

        const compatibleShow = shows[i];

        if(!compatibleShow || typeof compatibleShow !== "object"){
            continue;
        }

        const stats = analyzeCompatibleShowEpisodes(compatibleShow);
        const mappedStatus = estimateCompatibleMappedStatus(compatibleShow,stats);
        const appStatus = getAppStatusFromCompatibleMappedStatus(mappedStatus);
        const appShow = createAppShowFromCompatibleShow(compatibleShow,appStatus,null,"queued");
        appShow.compatible_mapped_status = mappedStatus;

        const importStats = importCompatibleEpisodesIntoShow(appShow,compatibleShow,newData);

        report.localOnly += 1;

        report.historyEntries += importStats.historyEntries;
        report.specialsPreserved += importStats.specialsPreserved;
        report.regularWatched += importStats.regularWatched;

        if(appShow.status === "finished"){
            appShow.completed_at = appShow.last_watched
            ? makeImportedCompletedAt(appShow.last_watched)
            : new Date().toISOString();
        }

        newData.shows[String(appShow.tmdb_id)] = appShow;
        report.showsImported += 1;

        if(i % 25 === 0 && i > 0){
            showToast(`Importing... ${i}/${shows.length}`);
            await waitForImportTick(30);
        }

    }

    newData.metadata_sync = queueCompatibleMetadataSync(newData);
    report.scheduleHydrated = 0;

    applyCompatibleImportStatusRefresh(newData);

    newData.history.sort((a,b)=>{
        return new Date(b.watched_at) - new Date(a.watched_at);
    });

    const preview = analyzeCompatibleJSONBackup(parsed,fileName);

    preview.warnings = preview.warnings || [];
    preview.warnings.push(
        `Imported ${Number(report.showsImported).toLocaleString()} shows. ` +
        `${Number(report.matchedToTMDB).toLocaleString()} matched to TMDB and ` +
        `${Number(report.localOnly).toLocaleString()} were preserved as local-only.`
    );
    preview.warnings.push(
        "Import logic reset: imported progress/history is the source of truth; TMDB metadata enhances availability."
    );

    if(newData.metadata_sync && newData.metadata_sync.total){
        preview.warnings.push(
            `Queued ${Number(newData.metadata_sync.total).toLocaleString()} shows for resumable metadata sync. You can close the tab; sync resumes later.`
        );
    }

    if(report.localOnly > 0){
        preview.warnings.push("Shows import instantly from your compatible file. Posters, release dates, and metadata are filled later by Metadata Sync.");
    }

    return {
        data:newData,
        report:report,
        preview:preview
    };

}



async function hydrateCompatibleImportScheduleData(importData,report){

    if(!importData || !importData.shows){
        return;
    }

    const shows = Object.values(importData.shows).filter(show=>{
        return canUseTMDBShow(show) && show.status !== "dropped";
    });

    let hydrated = 0;

    for(let i = 0; i < shows.length; i++){

        const show = shows[i];

        try{

            await refreshShowDetails(show);

            const seasonsToLoad = getCompatibleImportHydrationSeasons(show);
            seasonsToLoad.sort((a,b)=>a-b);

            for(let j = 0; j < seasonsToLoad.length; j++){
                await loadSeasonData(show,seasonsToLoad[j]);
            }

            syncNextEpisodeFromTMDB(show);
            normalizeEpisodeReleaseFields(show);
            reapplyImportedWatchedProgress(show);

            hydrated += 1;

            if(report){
                report.scheduleHydrated = hydrated;
            }

        }catch(error){
            // Import must not fail just because metadata hydration failed for one show.
        }

        if(hydrated > 0 && hydrated % 10 === 0){
            showToast(`Hydrating schedules... ${hydrated}`);
            await waitForImportTick(40);
        }

    }

}



function getCompatibleImportHydrationSeasons(show){

    const seasons = new Set();

    function addSeason(seasonNumber){
        const number = Number(seasonNumber);
        if(isMainSeasonNumber(number)){
            seasons.add(number);
        }
    }

    const nextImported = getImportedNextUnwatchedRegularEpisode(show);

    if(nextImported && (show.status === "watching" || show.status === "finished" || show.status === "plan")){
        addSeason(nextImported.season);
    }

    if(show.last_episode_to_air){
        addSeason(show.last_episode_to_air.season_number);
    }

    if(show.next_episode_to_air){
        addSeason(show.next_episode_to_air.season_number);
    }

    const latestWatched = getLatestWatchedEpisode(show);
    if(latestWatched){
        addSeason(latestWatched.season);
        addSeason(Number(latestWatched.season) + 1);
    }

    addSeason(1);

    return Array.from(seasons).slice(0,6);

}



function getImportedNextUnwatchedRegularEpisode(show){

    const watched = show.episodes_watched || {};
    const episodeLists = show._episode_list || {};

    const seasonKeys = Object.keys(episodeLists)
    .map(Number)
    .filter(isMainSeasonNumber)
    .sort((a,b)=>a-b);

    for(let i = 0; i < seasonKeys.length; i++){

        const seasonNumber = seasonKeys[i];
        const episodeList = episodeLists[String(seasonNumber)];

        if(!Array.isArray(episodeList)){
            continue;
        }

        const watchedEpisodes = watched[String(seasonNumber)] || [];

        const sorted = episodeList.slice().sort((a,b)=>{
            return Number(a.episode_number) - Number(b.episode_number);
        });

        for(let j = 0; j < sorted.length; j++){

            const ep = sorted[j];

            if(!ep || ep.special === true){
                continue;
            }

            const episodeNumber = Number(ep.episode_number);

            if(!watchedEpisodes.includes(episodeNumber)){
                return {
                    season:seasonNumber,
                    episode:episodeNumber
                };
            }

        }

    }

    return null;

}



function applyCompatibleImportStatusRefresh(importData){

    if(!importData || !importData.shows){
        return;
    }

    Object.values(importData.shows).forEach(show=>{

        if(!show || show.status === "dropped" || show.status === "paused"){
            return;
        }

        const availableUnwatched = hasAvailableUnwatchedEpisode(show);

        if(show.status === "plan" && availableUnwatched){
            show.status = "watching";
            show.was_unreleased_when_added = false;
        }

        if(show.status === "finished" && availableUnwatched){
            show.status = "watching";
            show.completed_at = "";
        }

    });

}



async function resolveCompatibleTMDBDetails(compatibleShow,matchCache){

    const ids = getCompatibleShowIds(compatibleShow);
    const cacheKey = ids.tvdb ? "tvdb:" + ids.tvdb : ids.imdb ? "imdb:" + ids.imdb : "title:" + String(compatibleShow.title || "");

    if(matchCache[cacheKey]){
        return matchCache[cacheKey];
    }

    const result = {
        details:null,
        method:"none"
    };

    try{

        if(ids.tvdb){
            result.details = await findTMDBTVDetailsByExternalId(ids.tvdb,"tvdb_id");
            result.method = result.details ? "tvdb_id" : "none";
        }

        if(!result.details && ids.imdb){
            result.details = await findTMDBTVDetailsByExternalId(ids.imdb,"imdb_id");
            result.method = result.details ? "imdb_id" : "none";
        }

        if(!result.details){
            result.details = await findTMDBTVDetailsByTitle(compatibleShow.title || "");
            result.method = result.details ? "title" : "none";
        }

    }catch(error){

        result.details = null;
        result.method = "none";

    }

    matchCache[cacheKey] = result;

    await waitForImportTick(25);

    return result;

}



async function findTMDBTVDetailsByExternalId(externalId,externalSource){

    if(!externalId){
        return null;
    }

    const response = await fetch(
        `${TMDB_API_BASE}/find/${encodeURIComponent(externalId)}?external_source=${encodeURIComponent(externalSource)}`
    );

    if(!response.ok){
        return null;
    }

    const data = await response.json();
    const result = data && Array.isArray(data.tv_results) && data.tv_results.length > 0
    ? data.tv_results[0]
    : null;

    if(!result || !result.id){
        return null;
    }

    return await tmdbGetShowDetails(result.id);

}



async function findTMDBTVDetailsByTitle(title){

    const cleanTitle = cleanCompatibleSearchTitle(title);

    if(!cleanTitle || cleanTitle.length < 2){
        return null;
    }

    try{

        const results = await tmdbSearchShows(cleanTitle);

        if(!Array.isArray(results) || results.length === 0){
            return null;
        }

        const normalizedTarget = normalizeComparableTitle(cleanTitle);

        let selected = results.find(show=>{
            return normalizeComparableTitle(show.name || "") === normalizedTarget;
        });

        if(!selected){
            selected = results[0];
        }

        if(!selected || !selected.id){
            return null;
        }

        return await tmdbGetShowDetails(selected.id);

    }catch(error){
        return null;
    }

}



function createAppShowFromCompatibleShow(compatibleShow,mappedStatus,tmdbDetails,matchMethod){

    const ids = getCompatibleShowIds(compatibleShow);
    const title = String(compatibleShow.title || "Untitled Show");
    const importedAt = new Date().toISOString();

    let show;

    if(tmdbDetails){

        show = createShowObject(tmdbDetails,mappedStatus);

    }else{

        const localId = getCompatibleLocalShowId(compatibleShow,ids);

        show = {
            tmdb_id:localId,
            title:title,
            poster_path:"",
            backdrop_path:"",
            overview:"Imported local-only show. TMDB metadata was not matched yet.",
            first_air_date:"",
            genres:[],
            status:mappedStatus,
            tmdb_status:"",
            tmdb_rating:0,
            tmdb_vote_count:0,
            rating:0,
            episodes_watched:{},
            notes:"",
            last_watched:"",
            last_activity_at:"",
            date_added:compatibleShow.created_at || importedAt,
            number_of_seasons:0,
            number_of_episodes:0,
            next_episode_to_air:null,
            last_episode_to_air:null,
            was_unreleased_when_added:mappedStatus === "plan",
            completed_at:"",
            _season_episodes:{},
            _episode_details:{},
            _episode_list:{},
            _tmdb_external_ids:null,
            local_only:true
        };

    }

    show.status = mappedStatus;
    show.date_added = compatibleShow.created_at || show.date_added || importedAt;
    show.source = "compatible-json-import";
    show.imported_at = importedAt;
    show.tvdb_id = ids.tvdb || null;
    show.imdb_id = ids.imdb || null;
    show.import_uuid = compatibleShow.uuid || "";
    show.original_status = compatibleShow.status || "";
    show.local_only = tmdbDetails ? false : true;
    show.compatible_import = {
        uuid:compatibleShow.uuid || "",
        tvdb_id:ids.tvdb || null,
        imdb_id:ids.imdb || null,
        original_status:compatibleShow.status || "",
        mapped_status:mappedStatus,
        match_method:matchMethod || "none",
        imported_at:importedAt
    };
    show._imported_progress = {
        source:"compatible-json",
        imported_at:importedAt,
        watched:{},
        specials:{},
        original_status:compatibleShow.status || ""
    };

    show.episodes_watched = {};
    show._season_episodes = {};
    show._episode_details = {};
    show._episode_list = {};

    return show;

}



function importCompatibleEpisodesIntoShow(show,compatibleShow,targetData){

    const seasons = Array.isArray(compatibleShow.seasons) ? compatibleShow.seasons : [];
    const stats = {
        historyEntries:0,
        specialsPreserved:0,
        regularWatched:0
    };

    let maxRegularSeason = 0;
    let regularEpisodeCount = 0;
    let latestWatchedAt = "";

    if(!targetData.history || !Array.isArray(targetData.history)){
        targetData.history = [];
    }

    seasons.forEach(season=>{

        if(!season || typeof season !== "object"){
            return;
        }

        const seasonNumber = Number(season.number);

        if(!Number.isFinite(seasonNumber)){
            return;
        }

        const seasonIsSpecial = season.is_specials === true || seasonNumber === 0;
        const episodes = Array.isArray(season.episodes) ? season.episodes : [];
        const seasonKey = String(seasonNumber);

        show._episode_list[seasonKey] = [];
        show._season_episodes[seasonKey] = episodes.length;

        if(!seasonIsSpecial && seasonNumber > maxRegularSeason){
            maxRegularSeason = seasonNumber;
        }

        episodes
        .slice()
        .sort((a,b)=>Number(a.number || 0) - Number(b.number || 0))
        .forEach((episode,index)=>{

            if(!episode || typeof episode !== "object"){
                return;
            }

            const episodeNumber = Number(episode.number || index + 1);

            if(!Number.isFinite(episodeNumber) || episodeNumber < 1){
                return;
            }

            const episodeIsSpecial = seasonIsSpecial || episode.special === true;
            const isWatched = episode.is_watched === true || Number(episode.watched_count || 0) > 0;
            const watchedAt = isWatched ? getCompatibleWatchedAt(episode,compatibleShow) : "";
            const tvdbEpisodeId = episode.id && episode.id.tvdb ? episode.id.tvdb : null;
            const episodeName = episode.name || `Episode ${episodeNumber}`;
            const episodeKey = String(seasonNumber) + "-" + String(episodeNumber);

            const episodeObject = {
                episode_number:episodeNumber,
                name:episodeName,
                air_date:"",
                runtime:null,
                still_path:"",
                air_time:"",
                air_timestamp:"",
                special:episodeIsSpecial,
                source_tvdb_episode_id:tvdbEpisodeId,
                watched_count:Number(episode.watched_count || 0),
                rewatch_count:Number(episode.rewatch_count || 0),
                imported_from_source:true
            };

            show._episode_list[seasonKey].push(episodeObject);
            show._episode_details[episodeKey] = {
                name:episodeName,
                air_date:"",
                runtime:null,
                still_path:"",
                air_time:"",
                air_timestamp:"",
                special:episodeIsSpecial,
                source_tvdb_episode_id:tvdbEpisodeId,
                watched_count:Number(episode.watched_count || 0),
                rewatch_count:Number(episode.rewatch_count || 0),
                imported_from_source:true
            };

            if(episodeIsSpecial){
                if(show._imported_progress){
                    show._imported_progress.specials[episodeKey] = {
                        watched:isWatched,
                        watched_at:watchedAt || null,
                        name:episodeName,
                        source_tvdb_episode_id:tvdbEpisodeId
                    };
                }
            }else{
                regularEpisodeCount += 1;
            }

            if(isWatched){

                if(!show.episodes_watched[seasonKey]){
                    show.episodes_watched[seasonKey] = [];
                }

                if(!show.episodes_watched[seasonKey].includes(episodeNumber)){
                    show.episodes_watched[seasonKey].push(episodeNumber);
                }

                if(show._imported_progress){
                    show._imported_progress.watched[episodeKey] = {
                        watched_at:watchedAt || null,
                        special:episodeIsSpecial,
                        name:episodeName,
                        source_tvdb_episode_id:tvdbEpisodeId
                    };
                }

                if(watchedAt && (!latestWatchedAt || new Date(watchedAt) > new Date(latestWatchedAt))){
                    latestWatchedAt = watchedAt;
                }

                targetData.history.push({
                    id:createCompatibleHistoryId(show,seasonNumber,episodeNumber,watchedAt,stats.historyEntries),
                    tmdb_id:show.tmdb_id,
                    title:show.title,
                    poster_path:show.poster_path || "",
                    season:seasonNumber,
                    episode:episodeNumber,
                    episode_title:episodeName,
                    episode_still_path:"",
                    air_date:"",
                    air_time:"",
                    air_timestamp:"",
                    watched_at:watchedAt,
                    action:"watched",
                    imported:true,
                    special:episodeIsSpecial,
                    source:"compatible-json-import",
                    source_tvdb_episode_id:tvdbEpisodeId,
                    watched_count:Number(episode.watched_count || 0),
                    rewatch_count:Number(episode.rewatch_count || 0)
                });

                stats.historyEntries += 1;

                if(episodeIsSpecial){
                    stats.specialsPreserved += 1;
                }else{
                    stats.regularWatched += 1;
                }

            }

        });

        if(show.episodes_watched[seasonKey]){
            show.episodes_watched[seasonKey].sort((a,b)=>a-b);
        }

    });

    show.number_of_seasons = Math.max(Number(show.number_of_seasons || 0),maxRegularSeason);
    show.number_of_episodes = Math.max(Number(show.number_of_episodes || 0),regularEpisodeCount);
    show.last_watched = latestWatchedAt ? latestWatchedAt.slice(0,10) : "";
    show.last_activity_at = latestWatchedAt || "";

    return stats;

}



function reapplyImportedWatchedProgress(show){

    if(!show || !show._imported_progress || !show._imported_progress.watched){
        return;
    }

    Object.keys(show._imported_progress.watched).forEach(key=>{

        const parts = key.split("-").map(Number);
        const season = parts[0];
        const episode = parts[1];

        if(!Number.isFinite(season) || !Number.isFinite(episode)){
            return;
        }

        const seasonKey = String(season);

        if(!show.episodes_watched[seasonKey]){
            show.episodes_watched[seasonKey] = [];
        }

        if(!show.episodes_watched[seasonKey].includes(episode)){
            show.episodes_watched[seasonKey].push(episode);
        }

        show.episodes_watched[seasonKey].sort((a,b)=>a-b);

    });

}



function getCompatibleShowIds(compatibleShow){

    const ids = compatibleShow && compatibleShow.id && typeof compatibleShow.id === "object"
    ? compatibleShow.id
    : {};

    return {
        tvdb:ids.tvdb || compatibleShow.tvdb_id || null,
        imdb:ids.imdb || compatibleShow.imdb_id || null
    };

}



function getCompatibleLocalShowId(compatibleShow,ids){

    if(ids.tvdb){
        return "local-tvdb-" + String(ids.tvdb);
    }

    if(ids.imdb){
        return "local-imdb-" + String(ids.imdb);
    }

    if(compatibleShow.uuid){
        return "local-uuid-" + String(compatibleShow.uuid);
    }

    return "local-title-" + cleanCompatibleSearchTitle(compatibleShow.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g,"-");

}



function getCompatibleWatchedAt(episode,compatibleShow){

    if(episode && episode.watched_at){
        return String(episode.watched_at);
    }

    if(compatibleShow && compatibleShow.created_at){
        return String(compatibleShow.created_at);
    }

    return new Date().toISOString();

}



function createCompatibleHistoryId(show,season,episode,watchedAt,index){

    return [
        "import",
        String(show.tmdb_id),
        String(season),
        String(episode),
        String(watchedAt || "unknown").replace(/[^0-9A-Za-z]+/g,""),
        String(index)
    ].join("-");

}



function makeImportedCompletedAt(lastWatchedDate){

    if(!lastWatchedDate){
        return new Date().toISOString();
    }

    if(lastWatchedDate.length === 10){
        return lastWatchedDate + "T00:00:00.000Z";
    }

    return lastWatchedDate;

}



function cleanCompatibleSearchTitle(title){

    return String(title || "")
    .replace(/\s*\((19|20)\d{2}\)\s*$/, " ")
    .replace(/\s+/g," ")
    .trim();

}



function normalizeComparableTitle(title){

    return String(title || "")
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();

}



function waitForImportTick(ms){

    return new Promise(resolve=>{
        setTimeout(resolve,ms || 0);
    });

}



function getExportDateString(){

    return new Date().toISOString().slice(0,10);

}



function downloadTextFile(fileName,text,mimeType){

    const blob = new Blob([text],{type:mimeType || "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function(){
        URL.revokeObjectURL(url);
    },1000);

}




function reportEscapeHTML(value){

    return String(value === null || typeof value === "undefined" ? "" : value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

}



function getReportStatusLabel(status){

    const value = String(status || "");

    if(value === "finished"){
        return "Completed";
    }

    if(value === "plan"){
        return "Plan To Watch";
    }

    if(value === "watching"){
        return "Watching";
    }

    if(value === "paused"){
        return "Paused";
    }

    if(value === "dropped"){
        return "Dropped";
    }

    return value || "Unknown";

}



function getReportShowId(show){

    return String(show && typeof show.tmdb_id !== "undefined" ? show.tmdb_id : "");

}



function isReportFavorite(show){

    ensureProfileData();

    const favorites = DATA.profile && Array.isArray(DATA.profile.favorite_shows)
    ? DATA.profile.favorite_shows.map(String)
    : [];

    return favorites.includes(getReportShowId(show));

}



function getReportRegularWatchedCount(show){

    const watched = show && show.episodes_watched ? show.episodes_watched : {};
    let total = 0;

    Object.keys(watched).forEach(seasonKey=>{

        const seasonNumber = Number(seasonKey);

        if(!Number.isFinite(seasonNumber) || seasonNumber < 1){
            return;
        }

        if(Array.isArray(watched[seasonKey])){
            total += new Set(watched[seasonKey].map(Number)).size;
        }

    });

    return total;

}



function getReportSpecialWatchedCount(show){

    const watched = show && show.episodes_watched ? show.episodes_watched : {};
    const seasonZero = Array.isArray(watched["0"]) ? new Set(watched["0"].map(Number)).size : 0;

    let importedWatchedSpecials = 0;

    if(show && show._imported_progress && show._imported_progress.specials){

        Object.values(show._imported_progress.specials).forEach(special=>{

            if(!special || typeof special !== "object"){
                return;
            }

            if(special.watched === true || special.watched_at){
                importedWatchedSpecials += 1;
            }

        });

    }

    return Math.max(seasonZero,importedWatchedSpecials);

}



function getReportKnownRegularEpisodeTotal(show){

    if(!show){
        return 0;
    }

    let episodeListTotal = 0;

    if(show._episode_list && typeof show._episode_list === "object"){

        Object.keys(show._episode_list).forEach(seasonKey=>{

            const seasonNumber = Number(seasonKey);

            if(!Number.isFinite(seasonNumber) || seasonNumber < 1){
                return;
            }

            if(Array.isArray(show._episode_list[seasonKey])){
                episodeListTotal += show._episode_list[seasonKey].length;
            }

        });

    }

    let seasonEpisodeTotal = 0;

    if(show._season_episodes && typeof show._season_episodes === "object"){

        Object.keys(show._season_episodes).forEach(seasonKey=>{

            const seasonNumber = Number(seasonKey);

            if(!Number.isFinite(seasonNumber) || seasonNumber < 1){
                return;
            }

            const count = Number(show._season_episodes[seasonKey]);

            if(Number.isFinite(count) && count > 0){
                seasonEpisodeTotal += count;
            }

        });

    }

    const tmdbTotal = Number(show.number_of_episodes || 0);

    return Math.max(episodeListTotal,seasonEpisodeTotal,tmdbTotal,0);

}



function getReportShowHistoryEntries(show){

    const showId = getReportShowId(show);

    if(!Array.isArray(DATA.history)){
        return [];
    }

    return DATA.history.filter(entry=>{
        return String(entry.tmdb_id) === showId;
    });

}



function getReportLastWatchedAt(show){

    const entries = getReportShowHistoryEntries(show)
    .filter(entry=>entry && entry.watched_at)
    .slice()
    .sort((a,b)=>new Date(b.watched_at) - new Date(a.watched_at));

    return entries[0] ? entries[0].watched_at : "";

}



function formatReportDateTime(dateString){

    if(!dateString){
        return "—";
    }

    const date = new Date(dateString);

    if(Number.isNaN(date.getTime())){
        return "—";
    }

    return date.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});

}



function getReportProgressText(show){

    const watched = getReportRegularWatchedCount(show);
    const total = getReportKnownRegularEpisodeTotal(show);

    if(total > 0){
        return `${watched}/${total}`;
    }

    return `${watched}/?`;

}



function getReportProgressPercent(show){

    const watched = getReportRegularWatchedCount(show);
    const total = getReportKnownRegularEpisodeTotal(show);

    if(!total){
        return 0;
    }

    return Math.max(0,Math.min(100,Math.round((watched / total) * 100)));

}



function getReportShowIssues(show){

    const issues = [];
    const watched = getReportRegularWatchedCount(show);
    const total = getReportKnownRegularEpisodeTotal(show);

    if(show && show.local_only){
        issues.push("Local only");
    }

    if(show && show.source === "compatible-json-import"){
        issues.push("Imported");
    }

    if(show && show.status === "dropped"){
        issues.push("Dropped");
    }

    if(total === 0){
        issues.push("No episode data");
    }

    if(total > 0 && watched > total){
        issues.push("Progress mismatch");
    }

    if(show && show.status !== "dropped" && hasAvailableUnwatchedEpisode(show)){
        issues.push("Available unwatched");
    }

    return issues;

}



function getReportShowNotes(show){

    const notes = [];

    if(show && show.compatible_import){
        notes.push(`Source: ${show.compatible_import.match_method || "compatible import"}`);
    }else if(show && show.source){
        notes.push(`Source: ${show.source}`);
    }

    if(show && show.original_status){
        notes.push(`Original status: ${show.original_status}`);
    }

    if(show && show.tmdb_status){
        notes.push(`TMDB: ${show.tmdb_status}`);
    }

    const nextAvailable = show && show.status !== "dropped" ? getNextMissedAiredEpisode(show) : null;

    if(nextAvailable){
        notes.push(`Next available: S${nextAvailable.season_number}E${nextAvailable.episode_number}`);
    }else{
        const nextFuture = show && show.status !== "dropped" ? getNextFutureEpisode(show) : null;

        if(nextFuture){
            notes.push(`Next scheduled: S${nextFuture.season_number}E${nextFuture.episode_number}`);
        }
    }

    return notes.join(" · ");

}



function getReportSummary(shows){

    const summary = {
        shows:shows.length,
        watching:0,
        paused:0,
        finished:0,
        plan:0,
        dropped:0,
        favorites:0,
        regularWatched:0,
        specialWatched:0,
        totalKnownEpisodes:0,
        localOnly:0,
        imported:0,
        historyEntries:Array.isArray(DATA.history) ? DATA.history.length : 0
    };

    shows.forEach(show=>{

        if(summary.hasOwnProperty(show.status)){
            summary[show.status] += 1;
        }

        if(isReportFavorite(show)){
            summary.favorites += 1;
        }

        if(show.local_only){
            summary.localOnly += 1;
        }

        if(show.source === "compatible-json-import"){
            summary.imported += 1;
        }

        summary.regularWatched += getReportRegularWatchedCount(show);
        summary.specialWatched += getReportSpecialWatchedCount(show);
        summary.totalKnownEpisodes += getReportKnownRegularEpisodeTotal(show);

    });

    return summary;

}



function buildReportShowRow(show,index){

    const watched = getReportRegularWatchedCount(show);
    const total = getReportKnownRegularEpisodeTotal(show);
    const progressText = getReportProgressText(show);
    const progressPercent = getReportProgressPercent(show);
    const status = getReportStatusLabel(show.status);
    const issues = getReportShowIssues(show);
    const issueText = issues.join(" ");
    const title = show.title || "Untitled";
    const year = show.first_air_date ? String(show.first_air_date).slice(0,4) : "";
    const tvdb = show.tvdb_id || (show.compatible_import && show.compatible_import.tvdb_id) || "";
    const imdb = show.imdb_id || (show.compatible_import && show.compatible_import.imdb_id) || "";
    const tmdb = show.local_only ? "—" : show.tmdb_id;
    const favorite = isReportFavorite(show) ? "★" : "";
    const specials = getReportSpecialWatchedCount(show);
    const lastWatched = formatReportDateTime(getReportLastWatchedAt(show));
    const notes = getReportShowNotes(show);

    let rowClass = "";

    if(show.status === "finished"){
        rowClass = "row-green";
    }else if(show.status === "dropped"){
        rowClass = "row-red";
    }else if(show.status === "plan"){
        rowClass = "row-orange";
    }

    const issueBadges = issues.length
    ? issues.map(issue=>`<span class="badge">${reportEscapeHTML(issue)}</span>`).join(" ")
    : `<span class="na">—</span>`;

    const progressBar = total > 0
    ? `<span class="bar-wrap"><span class="bar-fill" style="width:${progressPercent}%"></span></span>`
    : "";

    return `
        <tr class="${rowClass}" data-search="${reportEscapeHTML((title + " " + status + " " + issueText + " " + notes).toLowerCase())}" title="${reportEscapeHTML(notes || "")}">
            <td class="td-num">${index}</td>
            <td class="td-title"><strong>${reportEscapeHTML(title)}</strong>${year ? ` <span class="year-badge">${reportEscapeHTML(year)}</span>` : ""}</td>
            <td class="td-fav">${favorite ? `<span class="fav-star">${favorite}</span>` : `<span class="na">—</span>`}</td>
            <td class="td-id">${reportEscapeHTML(tvdb || "—")}</td>
            <td class="td-id">${reportEscapeHTML(imdb || "—")}</td>
            <td class="td-id">${reportEscapeHTML(tmdb || "—")}</td>
            <td class="td-status">${reportEscapeHTML(status)}</td>
            <td class="td-eps">${reportEscapeHTML(progressText)} ${progressBar}</td>
            <td class="td-specials">${Number(specials).toLocaleString()}</td>
            <td class="td-date">${reportEscapeHTML(lastWatched)}</td>
            <td class="td-issues">${issueBadges}</td>
            <td class="td-notes">${reportEscapeHTML(notes || "")}</td>
        </tr>`;

}



function buildHTMLReport(){

    normalizeExistingData();

    const shows = Object.values(DATA.shows || {})
    .slice()
    .sort((a,b)=>String(a.title || "").localeCompare(String(b.title || "")));

    const summary = getReportSummary(shows);
    const exportDate = getExportDateString();
    const rows = shows.map((show,index)=>buildReportShowRow(show,index + 1)).join("\n");
    const watchedPercent = summary.totalKnownEpisodes
    ? Math.round((summary.regularWatched / summary.totalKnownEpisodes) * 100)
    : 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TV Tracker — Export Report ${reportEscapeHTML(exportDate)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a1a;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;padding:24px 16px 48px}.header{max-width:1260px;margin:0 auto 20px;border-bottom:2px solid #f5c518;padding-bottom:20px}.header h1{font-size:22px;font-weight:800;color:#f5c518;letter-spacing:.5px;margin-bottom:16px}.stats{display:flex;flex-wrap:wrap;gap:12px 36px;margin-bottom:10px}.stat{display:flex;flex-direction:column;gap:2px}.stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#888}.stat-value{font-size:20px;font-weight:800;color:#f5c518}.notice,.summary-stats{max-width:1260px;margin:0 auto 20px;border-radius:6px;padding:12px 16px;font-size:13px;color:#ccc;line-height:1.6}.notice{background:rgba(107,45,139,.18);border:1px solid #6b2d8b;border-left:4px solid #6b2d8b}.notice strong{color:#c084fc;display:block;margin-bottom:4px}.summary-stats{background:rgba(245,197,24,.06);border:1px solid rgba(245,197,24,.25);border-left:4px solid #f5c518;font-size:12px}.ss-section{margin-bottom:4px}.ss-label{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-right:6px}.ss-hi{color:#f5c518;font-weight:700}.ss-dim{color:#888}.legend{max-width:1260px;margin:0 auto 14px;display:flex;flex-wrap:wrap;gap:8px 20px;font-size:12px;color:#aaa}.legend-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}.section-title{max-width:1260px;margin:0 auto 10px;font-size:16px;font-weight:700;color:#f5c518;padding-top:8px}.tools{max-width:1260px;margin:0 auto 12px;display:flex;gap:10px;align-items:center}.tools input{background:#111;border:1px solid #252525;border-radius:4px;color:#ddd;padding:8px 10px;min-width:280px;outline:none}.tools input:focus{border-color:#6b2d8b}.filter-count{font-size:12px;color:#777}.tbl-wrap{max-width:1260px;margin:0 auto 36px;overflow-x:hidden;border-radius:6px;border:1px solid #2e2e2e}table{width:100%;border-collapse:collapse;table-layout:fixed}thead tr{background:#111}th{padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:#777;border-bottom:1px solid #2e2e2e;white-space:nowrap}tbody tr{height:46px}td{padding:8px 12px;border-bottom:1px solid #222;vertical-align:middle;height:46px;max-height:46px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}tbody tr:last-child td{border-bottom:none}tbody tr:hover td{background:rgba(255,255,255,.03)}.td-num{width:52px;text-align:right;color:#777;font-size:11px;padding-right:10px!important;overflow:visible!important;text-overflow:clip!important}.td-title{width:240px;color:#fff;overflow:hidden}.year-badge{font-size:10px;color:#888;font-weight:400;margin-left:3px;white-space:nowrap}.td-id{font-size:12px;color:#777;overflow:hidden;font-family:monospace}.td-status{color:#bbb;overflow:hidden}.td-eps{overflow:hidden}.td-specials{white-space:nowrap;color:#c084fc}.td-date{font-size:12px;color:#999;overflow:hidden}.td-issues{text-align:left;overflow:hidden;white-space:nowrap}.td-notes,.th-notes{display:none}.td-fav{text-align:center}.fav-star{color:#e74c3c;font-size:14px;line-height:1}.na{color:#444}.bar-wrap{display:inline-block;vertical-align:middle;width:72px;height:4px;background:#2a2a2a;border-radius:2px;margin-left:8px;overflow:hidden}.bar-fill{display:block;height:100%;background:#f5c518;border-radius:2px}.badge{display:inline-block;margin:1px 3px 1px 0;padding:1px 5px;background:rgba(107,45,139,.45);color:#c084fc;border-radius:3px;font-size:11px;font-weight:700}.row-green td{background:rgba(34,197,94,.09)}.row-red td{background:rgba(239,68,68,.11)}.row-orange td{background:rgba(249,115,22,.09)}.row-green:hover td{background:rgba(34,197,94,.16)}.row-red:hover td{background:rgba(239,68,68,.18)}.row-orange:hover td{background:rgba(249,115,22,.16)}.footer{max-width:1260px;margin:32px auto 0;font-size:11px;color:#555;text-align:center}
</style>
</head>
<body>
<div class="header">
<h1>📺 TV TRACKER — Export Report</h1>
<div class="stats">
<div class="stat"><span class="stat-label">Export date</span><span class="stat-value">${reportEscapeHTML(exportDate)}</span></div>
<div class="stat"><span class="stat-label">Shows</span><span class="stat-value">${Number(summary.shows).toLocaleString()}</span></div>
<div class="stat"><span class="stat-label">History entries</span><span class="stat-value">${Number(summary.historyEntries).toLocaleString()}</span></div>
<div class="stat"><span class="stat-label">Regular watched</span><span class="stat-value">${Number(summary.regularWatched).toLocaleString()}</span></div>
<div class="stat"><span class="stat-label">Specials watched</span><span class="stat-value">${Number(summary.specialWatched).toLocaleString()}</span></div>
</div>
</div>
<div class="summary-stats">
<div class="ss-section"><span class="ss-label">Library</span><span class="ss-hi">${Number(summary.finished).toLocaleString()}</span> completed &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.watching).toLocaleString()}</span> watching &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.paused).toLocaleString()}</span> paused &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.plan).toLocaleString()}</span> plan to watch &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.dropped).toLocaleString()}</span> dropped</div>
<div class="ss-section"><span class="ss-label">Progress</span><span class="ss-hi">${Number(summary.regularWatched).toLocaleString()}</span> regular episodes watched &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.totalKnownEpisodes).toLocaleString()}</span> known regular episodes <span class="ss-dim">(${watchedPercent}% watched)</span> &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.specialWatched).toLocaleString()}</span> specials watched</div>
<div class="ss-section"><span class="ss-label">Import</span><span class="ss-hi">${Number(summary.imported).toLocaleString()}</span> imported shows &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.localOnly).toLocaleString()}</span> local-only records &nbsp;·&nbsp; <span class="ss-hi">${Number(summary.favorites).toLocaleString()}</span> favorites</div>
</div>
<div class="legend"><span><span class="legend-dot" style="background:rgba(34,197,94,.6)"></span>Completed</span><span><span class="legend-dot" style="background:rgba(239,68,68,.6)"></span>Dropped</span><span><span class="legend-dot" style="background:rgba(249,115,22,.6)"></span>Plan To Watch</span><span style="color:#6b2d8b">Badges show import/schedule/data notes</span></div>
<p class="section-title">Shows &amp; Anime (<span id="filter-count">${Number(summary.shows).toLocaleString()}</span>)</p>
<div class="tools"><input id="table-filter" type="search" placeholder="Filter by title, status, issue, note…"><span class="filter-count" id="visible-count"></span></div>
<div class="tbl-wrap">
<table id="shows-table">
<thead>
<tr>
<th style="width:52px">#</th>
<th style="width:240px">Title</th>
<th style="width:50px">Fav</th>
<th style="width:70px">TVDB</th>
<th style="width:70px">IMDb</th>
<th style="width:70px">TMDB</th>
<th style="width:95px">Status</th>
<th style="width:95px">Episodes</th>
<th style="width:70px">Specials</th>
<th style="width:145px">Last Watched</th>
<th style="width:165px">Issues</th>
<th class="th-notes">Notes</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</div>
<div class="footer">Generated by TV Tracker on ${reportEscapeHTML(new Date().toLocaleString())}</div>
<script>
(function(){
var input=document.getElementById('table-filter');
var rows=Array.prototype.slice.call(document.querySelectorAll('#shows-table tbody tr'));
var filterCount=document.getElementById('filter-count');
var visibleCount=document.getElementById('visible-count');
function update(){
 var q=(input.value||'').toLowerCase().trim();
 var shown=0;
 rows.forEach(function(row){
  var text=row.getAttribute('data-search')||row.textContent.toLowerCase();
  var ok=!q || text.indexOf(q)!==-1;
  row.style.display=ok?'':'none';
  if(ok){shown++;}
 });
 filterCount.textContent=shown.toLocaleString();
 visibleCount.textContent=q ? shown.toLocaleString()+' visible' : '';
}
if(input){input.addEventListener('input',update);}
update();
})();
</script>
</body>
</html>`;

}



function exportHTMLReport(){

    try{

        const html = buildHTMLReport();
        const date = getExportDateString();
        const fileName = `tv-tracker-report-${date}.html`;

        downloadTextFile(fileName,html,"text/html;charset=utf-8");
        showToast("HTML report exported");

    }catch(error){

        console.error(error);
        showToast("Could not export HTML report");

    }

}


init();
