Warning: truncated output (original token count: 136631)
Total output lines: 17352

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
        avatar_data:"",
        adult_filter:true
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
var personDetailRequestId = 0;
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
var collectionSearchController = null;
var collectionSearchRequestId = 0;
var collectionIndexPollTimer = null;
var collectionIndexHydrationRun = 0;
var collectionDetailPageState = {collectionId:"",routeSlug:"",loading:false,error:"",collection:null,movies:[],filters:null,labels:null,visibleMovies:[],totalResults:0,availableGenres:[],availableLanguages:[]};
var selectedCollectionId = null;
var collectionDetailRequestId = 0;
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
    const id = cleanString(showId);
    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    if(!id || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)){
        return "";
    }
    return id + "::regular::" + String(seasonNumber) + "::" + String(episodeNumber);
}

function getHistoryEntryEpisodeKey(entry){
    if(!entry || typeof entry !== "object" || isMovieHistoryRecord(entry)){
        return "";
    }

    const showId = cleanString(entry.tmdb_id || entry.show_id);
    const season = Number(entry.season);
    const episode = Number(entry.episode);
    if(!showId || !Number.isFinite(season) || !Number.isFinite(episode)){
        return "";
    }

    if(isSpecialHistoryEntry(entry)){
        const sourceEpisodeId = cleanString(entry.source_tvdb_episode_id);
        if(sourceEpisodeId){
            return showId + "::special::tvdb::" + sourceEpisodeId;
        }
        return (
            showId + "::special::" + String(season) + "::" + String(episode) + "::" +
            normalizeIdentityTitle(entry.episode_title || entry.title || "special")
        );
    }

    return getEpisodeIdentityKey(showId,season,episode);
}

function cleanString(value){
    return String(value === null || typeof value === "undefined" ? "" : value).trim();
}

function isMovieHistoryRecord(entry){
    if(!entry || typeof entry !== "object"){
        return false;
    }
    const mediaType = cleanString(entry.media_type || entry.type).toLowerCase();
    return mediaType === "movie" || !!cleanString(entry.movie_id);
}

function isSpecialHistoryEntry(entry){
    if(!entry || typeof entry !== "object" || isMovieHistoryRecord(entry)){
        return false;
    }
    return entry.special === true || Number(entry.season) === 0;
}

function normalizeIdentityTitle(value){
    return cleanString(value)
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

function summarizeHistory(history){
    const entries = Array.isArray(history) ? history : [];
    let regularHistoryEntries = 0;
    let specialHistoryEntries = 0;
    let movieHistoryEntries = 0;
    let otherHistoryEntries = 0;

    entries.forEach(entry=>{
        if(isMovieHistoryRecord(entry)){
            movieHistoryEntries += 1;
            return;
        }
        if(isSpecialHistoryEntry(entry)){
            specialHistoryEntries += 1;
            return;
        }
        if(
            entry &&
            typeof entry === "object" &&
            cleanString(entry.tmdb_id || entry.show_id) &&
            Number.isFinite(Number(entry.season)) &&
            Number.isFinite(Number(entry.episode))
        ){
            regularHistoryEntries += 1;
            return;
        }
        otherHistoryEntries += 1;
    });

    return {
        historyEntries:entries.length,
        regularHistoryEntries,
        specialHistoryEntries,
        movieHistoryEntries,
        otherHistoryEntries
    };
}

function titleHint(value){
    const raw = cleanString(value);
    const yearMatch = raw.match(/\(((?:19|20)\d{2})\)\s*$/);
    const year = yearMatch ? yearMatch[1] : "";
    const title = raw.replace(/\s*\((?:19|20)\d{2}\)\s*$/,"").replace(/\s+/g," ").trim();
    return {title,year};
}

function comparableTitle(value){
    if(typeof normalizeComparableTitle === "function"){
        return normalizeComparableTitle(value);
    }
    return cleanString(value)
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function selectStrictTMDBCandidate(results,requestedTitle){
    const hint = titleHint(requestedTitle);
    const target = comparableTitle(hint.title);
    if(!target){
        return null;
    }

    const byId = new Map();
    (Array.isArray(results) ? results : []).forEach(item=>{
        if(!item || !item.id){
            return;
        }
        const nameMatches = [item.name,item.original_name]
        .filter(Boolean)
        .some(name=>comparableTitle(name) === target);
        if(!nameMatches){
            return;
        }
        if(hint.year){
            const itemYear = cleanString(item.first_air_date).slice(0,4);
            if(itemYear !== hint.year){
                return;
            }
        }
        byId.set(String(item.id),item);
    });

    return byId.size === 1 ? Array.from(byId.values())[0] : null;
}

function scanCompatibleWatchedEpisodes(compatibleShow){
    const regular = new Map();
    const specials = [];
    const seasons = compatibleShow && Array.isArray(compatibleShow.seasons)
    ? compatibleShow.seasons
    : [];

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

        episodes.forEach((episode,index)=>{
            if(!episode || typeof episode !== "object"){
                return;
            }
            const episodeNumber = Number(episode.number || index + 1);
            if(!Number.isFinite(episodeNumber) || episodeNumber < 1){
                return;
            }
            const watched = episode.is_watched === true || Number(episode.watched_count || 0) > 0;
            if(!watched){
                return;
            }
            const special = seasonIsSpecial || episode.special === true;
            const sourceEpisodeId = episode.id && episode.id.tvdb ? cleanString(episode.id.tvdb) : "";
            const watchedAt = episode.watched_at ? cleanString(episode.watched_at) : "";
            const metadata = {
                watched_at:watchedAt || null,
                special,
                name:cleanString(episode.name || ("Episode " + episodeNumber)),
                source_tvdb_episode_id:sourceEpisodeId || null,
                source_season:seasonNumber,
                source_episode:episodeNumber
            };
            const coordinate = String(seasonNumber) + "-" + String(episodeNumber);
            if(special){
                specials.push({coordinate,metadata});
            }else{
                regular.set(coordinate,metadata);
            }
        });
    });

    return {regular,specials};
}

function removeSpecialOnlyProgress(show,scan){
    if(!show || !scan){
        return;
    }
    if(!show.episodes_watched || typeof show.episodes_watched !== "object"){
        show.episodes_watched = {};
    }

    const specialCoordinates = new Set(scan.specials.map(item=>item.coordinate));
    specialCoordinates.forEach(coordinate=>{
        if(scan.regular.has(coordinate)){
            return;
        }
        const parts = coordinate.split("-").map(Number);
        const season = parts[0];
        const episode = parts[1];
        const key = String(season);
        const watched = Array.isArray(show.episodes_watched[key]) ? show.episodes_watched[key] : [];
        const filtered = watched.filter(value=>Number(value) !== episode);
        if(filtered.length){
            show.episodes_watched[key] = filtered;
        }else{
            delete show.episodes_watched[key];
        }
    });

    if(!show._imported_progress || typeof show._imported_progress !== "object"){
        return;
    }

    const regularProgress = {};
    scan.regular.forEach((metadata,key)=>{
        regularProgress[key] = metadata;
    });
    const specialProgress = {};
    scan.specials.forEach((item,index)=>{
        const sourceId = cleanString(item.metadata.source_tvdb_episode_id);
        const key = sourceId
        ? "tvdb-" + sourceId
        : "source-" + item.coordinate + "-" + String(index);
        specialProgress[key] = Object.assign({watched:true},item.metadata);
    });
    show._imported_progress.watched = regularProgress;
    show._imported_progress.specials = specialProgress;
}

function remapQueueIds(sync,oldId,newId){
    if(!sync || typeof sync !== "object"){
        return;
    }
    if(Array.isArray(sync.pending)){
        sync.pending = sync.pending.map(value=>String(value) === oldId ? newId : value);
    }
    if(Array.isArray(sync.failed)){
        sync.failed = sync.failed.map(item=>{
            if(typeof item === "string"){
                return item === oldId ? newId : item;
            }
            if(item && typeof item === "object" && String(item.showId || item.id || "") === oldId){
                const copy = Object.assign({},item);
                if(Object.prototype.hasOwnProperty.call(copy,"showId")) copy.showId = newId;
                if(Object.prototype.hasOwnProperty.call(copy,"id")) copy.id = newId;
                return copy;
            }
            return item;
        });
    }
}

function collectDuplicateProgress(data){
    const groups = new Map();

    if(!data || !data.shows || typeof data.shows !== "object" || Array.isArray(data.shows)){
        return groups;
    }

    Object.entries(data.shows).forEach(([key,show])=>{
        if(!show || typeof show !== "object"){
            return;
        }

        const id = String(show.tmdb_id || show.id || key || "").trim();
        if(!id){
            return;
        }

        if(!groups.has(id)){
            groups.set(id,{count:0,progress:{}});
        }

        const group = groups.get(id);
        group.count += 1;
        const watched = show.episodes_watched && typeof show.episodes_watched === "object"
        ? show.episodes_watched
        : {};

        Object.entries(watched).forEach(([seasonKey,values])=>{
            const season = Number(seasonKey);
            if(!Number.isFinite(season) || !Array.isArray(values)){
                return;
            }

            const canonicalSeason = String(season);
            if(!group.progress[canonicalSeason]){
                group.progress[canonicalSeason] = [];
            }
            group.progress[canonicalSeason].push(...values);
        });
    });

    return groups;
}

function restoreMergedProgress(data,groups){
    if(!data || !data.shows || typeof data.shows !== "object"){
        return data;
    }

    groups.forEach((group,id)=>{
        if(group.count < 2){
            return;
        }

        const preferred = data.shows[id];
        if(!preferred || typeof preferred !== "object"){
            return;
        }

        preferred.episodes_watched = Object.fromEntries(
            Object.entries(group.progress).map(([seasonKey,values])=>[
                seasonKey,
                values.slice()
            ])
        );
    });

    return data;
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
    const groups = collectDuplicateProgress(data);

    if(!data || !data.shows || typeof data.shows !== "object" || Array.isArray(data.shows)){
        restoreMergedProgress(data,groups);
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
    restoreMergedProgress(data,groups);
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
    const data = DATA && typeof DATA === "object" ? DATA : {};
    return (Array.isArray(data.history) ? data.history : [])
    .filter(entry=>{
        return (
            entry &&
            !isSpecialHistoryEntry(entry) &&
            !isMovieHistoryRecord(entry) &&
            String(entry.tmdb_id) === String(showId) &&
            Number(entry.season) === Number(seasonNumber)
        );
    })
    .map(entry=>cleanString(entry.id))
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

    startDataSync();
    scheduleInitialBackgroundMaintenance();

    // Migration metadata sync is intentionally not auto-started.
    // It can slow down search/rendering, and migration work is on hold for now.
}

const TV_TRACKER_STARTUP_FAILURE_MESSAGE = "TV Tracker could not start. Refresh the page to try again.";

function getTVTrackerStartupState(){
    if(window.TVTrackerStartup && typeof window.TVTrackerStartup === "object"){
        return window.TVTrackerStartup;
    }
    window.TVTrackerStartup = {status:"idle",error:null,promise:null};
    return window.TVTrackerStartup;
}

function setTVTrackerStartupDOMState(status){
    if(typeof document === "undefined" || !document.documentElement){
        return;
    }

    document.documentElement.setAttribute("data-tv-tracker-startup",status);
    if(status === "ready"){
        document.documentElement.setAttribute("data-tv-tracker-app-ready","true");
    }else{
        document.documentElement.removeAttribute("data-tv-tracker-app-ready");
    }

    const message = document.getElementById("tv-tracker-startup-status");
    if(message){
        message.hidden = status !== "failed";
        message.textContent = status === "failed" ? TV_TRACKER_STARTUP_FAILURE_MESSAGE : "";
    }

    if(status === "failed"){
        const skeleton = document.querySelector(".watchlist-initial-skeleton");
        if(skeleton){
            skeleton.remove();
        }
    }
}

function assertTVTrackerStartupOwnersLoaded(){
const missing = [];
    if(typeof getStoredData !== "function" || typeof cleanupDuplicateShows !== "function"){
        missing.push("data integrity");
    }
    if(typeof getEpisodeIdentityKey !== "function" || typeof getHistoryEntryEpisodeKey !== "function"){
        missing.push("data integrity");
    }
    if(!window.TVTrackerSettings || typeof window.TVTrackerSettings.render !== "function"){
        missing.push("settings");
    }
    if(!window.TVTrackerRouter || typeof window.TVTrackerRouter.applyRoute !== "function"){
        missing.push("router");
    }
    if(typeof startDataSync !== "function"){
        missing.push("data sync");
    }
    if(missing.length){
        throw new Error("TV Tracker startup dependencies unavailable: " + missing.join(", "));
    }
}

function startTVTrackerApp(){
    const startup = getTVTrackerStartupState();
    if(startup.promise){
        return startup.promise;
    }

    startup.status = "starting";
    startup.error = null;
    appDataReady = false;
    setTVTrackerStartupDOMState("starting");
    startup.promise = Promise.resolve()
    .then(assertTVTrackerStartupOwnersLoaded)
    .then(()=>init())
    .then(()=>{
        appDataReady = true;
        return window.TVTrackerRouter.applyRoute();
    })
    .then(()=>{
        startup.status = "ready";
        setTVTrackerStartupDOMState("ready");
        return true;
    });
    return startup.promise;
}

function handleTVTrackerStartupFailure(error){
    const startup = getTVTrackerStartupState();
    appDataReady = false;
    startup.status = "failed";
    startup.error = error;
    setTVTrackerStartupDOMState("failed");
    console.error("TV Tracker startup failed",error);
    return false;
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

    const oldKey = cleanString(oldId);
    const newKey = cleanString(newId);

    if(!oldKey || !newKey || oldKey === newKey){
        return;
    }

    if(DATA.shows[newKey] && DATA.shows[newKey] !== show){
        // Keep both if there is an unexpected ID conflict.
        show.tmdb_id = oldKey;
        show.local_only = true;
        if(show.compatible_import){
            show.compatible_import.match_method = "metadata-conflict";
        }
        return;
    }

    delete DATA.shows[oldKey];
    DATA.shows[newKey] = show;

    ensureProfileData();

    if(DATA.profile && Array.isArray(DATA.profile.favorite_shows)){
        DATA.profile.favorite_shows = DATA.profile.favorite_shows.map(id=>{
            return String(id) === oldKey ? newKey : id;
        });
    }

    if(DATA.metadata_sync && Array.isArray(DATA.metadata_sync.pending)){
        DATA.metadata_sync.pending = DATA.metadata_sync.pending.map(id=>{
            return String(id) === oldKey ? newKey : id;
        });
    }

    if(Array.isArray(DATA.history)){
        DATA.history.forEach(entry=>{
            if(!entry || typeof entry !== "object"){
                return;
            }
            if(String(entry.tmdb_id || "") === oldKey){
                entry.tmdb_id = newKey;
            }
            if(String(entry.show_id || "") === oldKey){
                entry.show_id = newKey;
            }
        });
    }

    remapQueueIds(DATA.metadata_sync,oldKey,newKey);
    remapQueueIds(DATA.network_sync,oldKey,newKey);

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
        episode_number:Number(details.ep…96631 tokens truncated…),
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
        schemaVersion:5,
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

    const schemaVersion = Number(backup.schemaVersion || 1);

    if(schemaVersion === 5){
        // Current-schema backups are validated through the compatibility
        // downgrade path the backend restore pipeline already understands.
        const compatibilityCopy = JSON.parse(JSON.stringify(backup));
        compatibilityCopy.schemaVersion = 4;
        const result = validateNativeBackupObject(compatibilityCopy);
        if(result && result.valid === true && result.summary){
            result.summary.schemaVersion = 5;
        }
        return result;
    }

    if(backup.app !== "TV Tracker" || backup.backupType !== "native-app-backup"){
        return {valid:false,message:"This is not a TV Tracker app backup"};
    }

    const backupVersion = Number(backup.backupVersion || 1);

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



async function findTMDBTVDetailsByTitle(requestedTitle){

    const hint = titleHint(requestedTitle);

    if(!hint.title || hint.title.length < 2 || typeof tmdbSearchShows !== "function"){
        return null;
    }

    try{

        const results = await tmdbSearchShows(hint.title);
        const selected = selectStrictTMDBCandidate(results,requestedTitle);

        if(!selected || !selected.id || typeof tmdbGetShowDetails !== "function"){
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

    removeSpecialOnlyProgress(show,scanCompatibleWatchedEpisodes(compatibleShow));

    return stats;

}



function reapplyImportedWatchedProgress(show){

    if(!show || !show._imported_progress || !show._imported_progress.watched){
        return;
    }

    Object.entries(show._imported_progress.watched).forEach(([key,metadata])=>{
        if(metadata && metadata.special === true){
            return;
        }
        const parts = String(key).split("-").map(Number);
        const season = parts[0];
        const episode = parts[1];
        if(!Number.isFinite(season) || season < 1 || !Number.isFinite(episode) || episode < 1){
            return;
        }
        const seasonKey = String(season);
        if(!show.episodes_watched || typeof show.episodes_watched !== "object"){
            show.episodes_watched = {};
        }
        if(!Array.isArray(show.episodes_watched[seasonKey])){
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

const FRONTEND_SCHEMA_VERSION = 5;

function suspiciousHistoryReferences(data){
    const source = data && typeof data === "object" ? data : {};
    const shows = source.shows && typeof source.shows === "object" ? source.shows : {};
    const history = Array.isArray(source.history) ? source.history : [];
    const suspicious = [];

    history.forEach(entry=>{
        if(!entry || typeof entry !== "object" || isMovieHistoryEntry(entry) || isSpecialHistoryEntry(entry)){
            return;
        }
        const show = shows[String(entry.tmdb_id || entry.show_id || "")];
        if(!show){
            suspicious.push({id:cleanString(entry.id),reason:"missing_show"});
            return;
        }
        const season = Number(entry.season);
        const episode = Number(entry.episode);
        const knownSeasons = Number(show.number_of_seasons || 0);
        if(knownSeasons > 0 && season > knownSeasons){
            suspicious.push({id:cleanString(entry.id),reason:"season_out_of_range"});
            return;
        }
        const seasonCount = show._season_episodes && Number(show._season_episodes[String(season)] || 0);
        if(seasonCount > 0 && episode > seasonCount){
            suspicious.push({id:cleanString(entry.id),reason:"episode_out_of_range"});
        }
    });

    return suspicious;
}

window.TVTrackerDataIntegrity = Object.freeze({
    installed:true,
    frontendSchemaVersion:FRONTEND_SCHEMA_VERSION,
    isMovieHistoryEntry,
    isSpecialHistoryEntry,
    regularEpisodeIdentity:getEpisodeIdentityKey,
    historyEpisodeIdentity:getHistoryEntryEpisodeKey,
    summarizeHistory,
    titleHint,
    selectStrictTMDBCandidate,
    scanCompatibleWatchedEpisodes,
    suspiciousHistoryReferences
});
