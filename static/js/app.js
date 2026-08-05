var DATA = {
    shows:{},
    history:[],
    profile:{
        username:"Username",
        favorite_shows:[],
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
var pendingShow = null;
var discoverPreviewShow = null;
var selectedShowId = null;
var selectedEpisodeContext = null;
var showDetailPreview = null;
var showDetailBackStack = [];
var showDetailOpeningFromRoute = false;
var showDetailScrollTopBeforeEpisode = 0;
var showDetailScrollRestorePending = false;
var appDataReady = false;
var activeShowDetailsTabs = {};
var expandedSeasons = {};
var expandedUpcomingBatches = {};
var searchTimer = null;
var currentSearchController = null;
var searchRequestId = 0;
var lastDiscoverSearchQuery = "";
var lastDiscoverSearchResults = [];
var discoverSearchState = {query:"",page:1,totalPages:1,loading:false};
var discoverHubState = {
    loaded:false,
    loading:false,
    error:"",
    sections:[]
};
var librarySearchQuery = "";
var v2EpisodeDetailPendingLoads = new Map();
var V2_EPISODE_DETAIL_CACHE_PREFIX = "tv-tracker-v2-episode-details:";
var V2_EPISODE_DETAIL_CACHE_TTL = 1000 * 60 * 60 * 24;
var libraryGenreFilter = "all";
var libraryNetworkFilter = "all";
var librarySortMode = "default";
var isRefreshingUpcoming = false;
var lastCompatibleImportPreview = null;
var lastCompatibleCSVPreview = null;
var metadataSyncRunning = false;
var networkMetadataSyncRunning = false;
var adminAccountState = {loaded:false,loading:false,username:"",error:""};


const DISCOVER_HUB_CACHE_KEY = "tv-tracker-discover-hub:v2";
const DISCOVER_HUB_CACHE_TTL = 1000 * 60 * 60 * 3;






















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









function canUseTMDBShow(show){
    if(!show){
        return false;
    }

    const id = Number(show.tmdb_id);
    return Number.isFinite(id) && id > 0;
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
    if(newPassword && newPassword.length < 8){
        showToast("New password must contain at least 8 characters");
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
    renderAll();
    appDataReady = true;

    if(window.TVTrackerV2Router && typeof window.TVTrackerV2Router.applyRoute === "function"){
        setTimeout(()=>window.TVTrackerV2Router.applyRoute(),0);
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



    document.getElementById("search").addEventListener("input",function(){

        clearTimeout(searchTimer);

        const query = this.value.trim();

        if(query.length < 2){
            searchShows(query);
            return;
        }

        searchTimer = setTimeout(()=>{
            searchShows(query);
        },220);

    });



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
            return;
        }

        const details = await tmdbGetShowDetails(show.tmdb_id);

        if(!details){
            return;
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

    }catch(error){

        return;

    }

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
        return language && (language.english_name || language.name)
        ? String(language.english_name || language.name).trim()
        : "";
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
    const results = keywords && Array.isArray(keywords.results) ? keywords.results : [];

    return results
    .map(keyword=>keyword && keyword.name ? String(keyword.name).trim() : "")
    .filter(Boolean)
    .slice(0,12);
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
    const grouped = {
        creators:[],
        directors:[],
        writers:[],
        producers:[],
        music:[],
        other:[]
    };
    const seen = new Set();

    crew.forEach(person=>{
        if(!person || !person.name){
            return;
        }

        const jobs = Array.isArray(person.jobs) ? person.jobs : [];
        const jobNames = jobs.map(job=>normalizeCrewJob(job && job.job)).filter(Boolean);
        const department = String(person.department || person.known_for_department || "").toLowerCase();
        const combined = jobNames.join(" / ") || normalizeCrewJob(person.job) || "Crew";
        const lowerJobs = combined.toLowerCase();
        let group = "other";

        if(lowerJobs.includes("creator") || lowerJobs.includes("created by")){
            group = "creators";
        }else if(lowerJobs.includes("director") || department === "directing"){
            group = "directors";
        }else if(lowerJobs.includes("writer") || lowerJobs.includes("screenplay") || lowerJobs.includes("teleplay") || department === "writing"){
            group = "writers";
        }else if(lowerJobs.includes("producer") || department === "production"){
            group = "producers";
        }else if(lowerJobs.includes("music") || lowerJobs.includes("composer") || department === "sound"){
            group = "music";
        }

        const key = [group,person.id || person.name,combined].join(":");
        if(seen.has(key)){
            return;
        }
        seen.add(key);

        grouped[group].push({
            id:Number(person.id || 0),
            name:String(person.name || "").trim(),
            job:combined,
            profile_path:person.profile_path || "",
            episode_count:Number(person.total_episode_count || jobs.reduce((total,job)=>total + Number(job && job.episode_count || 0),0) || person.episode_count || 0)
        });
    });

    Object.keys(grouped).forEach(key=>{
        grouped[key] = grouped[key]
        .sort((a,b)=>Number(b.episode_count || 0) - Number(a.episode_count || 0))
        .slice(0,12);
    });

    return grouped;
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

function normalizeTMDBEpisodeActors(credits){
    const combined = []
    .concat(Array.isArray(credits && credits.cast) ? credits.cast : [])
    .concat(Array.isArray(credits && credits.guest_stars) ? credits.guest_stars : []);

    const seen = new Set();

    return combined
    .map(normalizeEpisodeActorMember)
    .filter(actor=>{
        if(!actor){
            return false;
        }
        const key = actor.id ? String(actor.id) : actor.name.toLowerCase();
        if(seen.has(key)){
            return false;
        }
        seen.add(key);
        return true;
    })
    .sort((a,b)=>a.order - b.order);
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

    if(details.credits){
        if(!show._episode_actor_credits || typeof show._episode_actor_credits !== "object"){
            show._episode_actor_credits = {};
        }
        show._episode_actor_credits[key] = normalizeTMDBEpisodeActors(details.credits);
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

    return !!show._episode_v2_details[getEpisodeActorCreditsKey(seasonNumber,episodeNumber)];
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
    show.popularity = Number(details.popularity || show.popularity || 0);
    show.in_production = typeof details.in_production === "boolean" ? details.in_production : show.in_production === true;
    show.content_rating = pickUSContentRating(details.content_ratings) || show.content_rating || "";
    show._tmdb_content_ratings = normalizeTMDBContentRatings(details.content_ratings);
    show._tmdb_alternative_titles = normalizeTMDBAlternativeTitles(details.alternative_titles);
    show._tmdb_external_ids = normalizeTMDBExternalIds(details);
    show._tmdb_videos = normalizeTMDBVideos(details.videos);
    show._tmdb_keywords = normalizeTMDBKeywords(details.keywords);
    show._tmdb_watch_providers = details["watch/providers"] || show._tmdb_watch_providers || null;
    show._tmdb_recommendations = normalizeTMDBSimilarShows(details.recommendations,10);
    show._tmdb_similar = normalizeTMDBSimilarShows(details.similar,10);
    show._tmdb_cast = normalizeTMDBAggregateCast(details.aggregate_credits);
    show._tmdb_crew = normalizeTMDBAggregateCrew(details.aggregate_credits);
    show._v2_cast_loaded_at = new Date().toISOString();
    show._v2_bundle7_loaded_at = new Date().toISOString();
    show._v2_bundle7_2_loaded_at = new Date().toISOString();
    if(!show._episode_actor_credits || typeof show._episode_actor_credits !== "object"){
        show._episode_actor_credits = {};
    }
    show._v2_api_loaded_at = new Date().toISOString();

    return show;
}

function showHasV2APIDetails(show){
    if(!show){
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

async function refreshOpenShowV2Details(showId){
    const id = String(showId || "");
    const show = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;

    if(!show){
        return;
    }

    try{
        const changed = await ensureShowV2APIDetails(show);
        if(changed && selectedShowId === id && selectedEpisodeContext === null){
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

    if(!show._episode_v2_details || typeof show._episode_v2_details !== "object"){
        show._episode_v2_details = {};
    }

    const key = getEpisodeActorCreditsKey(seasonNumber,episodeNumber);

    if(show._episode_v2_details[key]){
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
        _tmdb_recommendations:[],
        _tmdb_similar:[],
        _tmdb_content_ratings:[],
        _tmdb_alternative_titles:[],
        _tmdb_watch_providers:null,
        _tmdb_cast:[],
        _tmdb_crew:{creators:[],directors:[],writers:[],producers:[],music:[],other:[]},
        _v2_cast_loaded_at:"",
        _v2_bundle7_loaded_at:"",
        _v2_bundle7_2_loaded_at:"",
        _episode_actor_credits:{},
        _episode_v2_details:{}
    };

    applyV2TMDBDetails(showObject,details);
    return showObject;

}





async function openDiscoverShowModal(searchShow){
    if(!searchShow || !searchShow.id){
        return;
    }

    await openShowDetailsPage(searchShow.id);
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



function renderSearchIntro(){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    results.innerHTML = "";

}

function renderSearchLoading(query){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    results.innerHTML = `
        <div class="empty-state">
            <h2>Searching</h2>
            <p>Looking for matches.</p>
        </div>
    `;

}

function renderSearchError(){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    results.innerHTML = `
        <div class="empty-state">
            <h2>Search failed</h2>
            <p>Try again in a moment.</p>
        </div>
    `;

}



function shouldShowDiscoverHub(){

    const searchInput = document.getElementById("search");
    const query = searchInput ? searchInput.value.trim() : "";
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

        return cached.sections;

    }catch(error){
        return null;
    }

}



function writeDiscoverHubCache(sections){

    if(!Array.isArray(sections)){
        return;
    }

    try{
        sessionStorage.setItem(
            DISCOVER_HUB_CACHE_KEY,
            JSON.stringify({
                savedAt:Date.now(),
                sections:sections
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
        total_results:Number(data.total_results || 0)
    };

}



async function tmdbGetDiscoverList(path,params={}){
    const payload = await tmdbGetDiscoverPage(path,params);
    return payload.results || [];
}




function normalizeDiscoverHubShow(show){

    if(!show || !show.id){
        return null;
    }

    return {
        id:show.id,
        name:show.name || show.original_name || "Untitled",
        poster_path:show.poster_path || "",
        backdrop_path:show.backdrop_path || "",
        overview:show.overview || "",
        first_air_date:show.first_air_date || "",
        vote_average:show.vote_average || 0,
        popularity:show.popularity || 0
    };

}



function buildDiscoverHubSection(key,title,subtitle,shows,usedIds,options={}){

    const output = [];

    (shows || []).forEach(raw=>{

        const show = normalizeDiscoverHubShow(raw);

        if(!show){
            return;
        }

        const id = String(show.id);

        if(usedIds.has(id)){
            return;
        }

        usedIds.add(id);
        output.push(show);

    });

    return {
        key:key,
        title:title,
        subtitle:subtitle,
        shows:output.slice(0,20),
        page:Number(options.page || 1),
        totalPages:Number(options.totalPages || 1),
        hasMore:Number(options.page || 1) < Number(options.totalPages || 1),
        loadingMore:false
    };

}

function getDiscoverSectionRequestConfig(key){
    const today = getLocalDateKey(new Date());

    if(key === "coming-soon"){
        return {
            path:"discover/tv",
            params:{
                "first_air_date.gte":today,
                "sort_by":"popularity.desc",
                "include_adult":"false",
                "include_null_first_air_dates":"false"
            },
            filter:show=>show && show.first_air_date && show.first_air_date >= today
        };
    }

    if(key === "trending-week"){
        return {path:"trending/tv/week",params:{},filter:null};
    }

    if(key === "airing-now"){
        return {path:"tv/on_the_air",params:{},filter:null};
    }

    if(key === "popular"){
        return {path:"tv/popular",params:{},filter:null};
    }

    return null;
}

async function loadMoreDiscoverSection(sectionKey){
    const key = String(sectionKey || "");
    const state = discoverHubState || {};
    const sections = Array.isArray(state.sections) ? state.sections : [];
    const section = sections.find(item=>String(item.key || "") === key);
    const config = getDiscoverSectionRequestConfig(key);

    if(!section || !config || section.loadingMore){
        return;
    }

    const currentPage = Number(section.page || 1);
    const totalPages = Number(section.totalPages || 1);

    if(totalPages > 0 && currentPage >= totalPages){
        section.hasMore = false;
        if(typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
        return;
    }

    section.loadingMore = true;

    if(typeof renderDiscoverHub === "function"){
        renderDiscoverHub();
    }

    try{
        const nextPage = currentPage + 1;
        const payload = await tmdbGetDiscoverPage(config.path,Object.assign({},config.params,{page:nextPage}));
        const existing = new Set((section.shows || []).map(show=>String(show.id)));
        const newShows = [];

        (payload.results || [])
        .filter(show=>config.filter ? config.filter(show) : true)
        .forEach(raw=>{
            const show = normalizeDiscoverHubShow(raw);

            if(!show || existing.has(String(show.id))){
                return;
            }

            existing.add(String(show.id));
            newShows.push(show);
        });

        section.shows = (section.shows || []).concat(newShows);
        section.page = Number(payload.page || nextPage);
        section.totalPages = Number(payload.total_pages || totalPages || section.page);
        section.hasMore = section.page < section.totalPages;
        section.loadingMore = false;
        writeDiscoverHubCache(sections);

        if(typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
    }catch(error){
        section.loadingMore = false;
        showToast(error && error.message ? error.message : "Could not load more shows");

        if(typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }
    }
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

        const cachedSections = readDiscoverHubCache();

        if(cachedSections){
            discoverHubState = {
                loaded:true,
                loading:false,
                error:"",
                sections:cachedSections
            };

            if(typeof renderDiscoverHub === "function"){
                renderDiscoverHub();
            }

            return;
        }

    }

    discoverHubState.loading = true;
    discoverHubState.error = "";

    if(typeof renderDiscoverHub === "function"){
        renderDiscoverHub();
    }

    try{

        const today = getLocalDateKey(new Date());

        const [comingSoon,trendingWeek,airingNow,popular] = await Promise.all([
            tmdbGetDiscoverPage("discover/tv",{
                "first_air_date.gte":today,
                "sort_by":"popularity.desc",
                "include_adult":"false",
                "include_null_first_air_dates":"false"
            }),
            tmdbGetDiscoverPage("trending/tv/week"),
            tmdbGetDiscoverPage("tv/on_the_air"),
            tmdbGetDiscoverPage("tv/popular")
        ]);

        const usedIds = new Set();

        const sections = [
            buildDiscoverHubSection(
                "coming-soon",
                "Coming Soon",
                "",
                comingSoon.results.filter(show=>show && show.first_air_date && show.first_air_date >= today),
                usedIds,
                {page:comingSoon.page,totalPages:comingSoon.total_pages}
            ),
            buildDiscoverHubSection(
                "trending-week",
                "Trending This Week",
                "",
                trendingWeek.results,
                usedIds,
                {page:trendingWeek.page,totalPages:trendingWeek.total_pages}
            ),
            buildDiscoverHubSection(
                "airing-now",
                "Airing Now",
                "",
                airingNow.results,
                usedIds,
                {page:airingNow.page,totalPages:airingNow.total_pages}
            ),
            buildDiscoverHubSection(
                "popular",
                "Popular",
                "",
                popular.results,
                usedIds,
                {page:popular.page,totalPages:popular.total_pages}
            )
        ];

        discoverHubState = {
            loaded:true,
            loading:false,
            error:"",
            sections:sections
        };

        writeDiscoverHubCache(sections);

        if(shouldShowDiscoverHub() && typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }

    }catch(error){

        discoverHubState.loading = false;
        discoverHubState.loaded = false;
        discoverHubState.error = error && error.message ? error.message : "Could not load Discover.";

        if(shouldShowDiscoverHub() && typeof renderDiscoverHub === "function"){
            renderDiscoverHub();
        }

    }

}




function friendlyTMDBSearchError(error){
    const message = String(error && error.message ? error.message : "").trim();
    const lower = message.toLowerCase();

    if(lower.includes("api key") || lower.includes("invalid api key") || lower.includes("401")){
        return "TMDB access is unavailable. Check the server configuration.";
    }

    if(lower.includes("not found") || lower.includes("404")){
        return "No matching TV show found.";
    }

    if(lower.includes("failed to fetch") || lower.includes("network")){
        return "TMDB search could not connect. Check your connection.";
    }

    return message || "TMDB search failed.";
}

async function searchShows(query){

    const results = document.getElementById("search-results");

    if(!results){
        return;
    }

    const cleanQuery = String(query || "").trim();
    const cacheKey = getSearchCacheKey(cleanQuery);

    if(cleanQuery.length < 2){

        cancelActiveSearchRequest();
        searchRequestId += 1;
        lastDiscoverSearchQuery = "";
        lastDiscoverSearchResults = [];
        discoverSearchState = {query:"",page:1,totalPages:1,loading:false};
        renderSearchIntro();

        return;

    }

    cancelActiveSearchRequest();

    const controller = typeof AbortController !== "undefined"
    ? new AbortController()
    : null;

    currentSearchController = controller;
    const requestId = ++searchRequestId;

    discoverSearchState = {query:cleanQuery,page:1,totalPages:1,loading:true};
    renderSearchLoading(cleanQuery);

    try{

        const payload = typeof tmdbSearchShowsPage === "function"
        ? await tmdbSearchShowsPage(cleanQuery,1,{signal:controller ? controller.signal : undefined})
        : {results:await tmdbSearchShows(cleanQuery,{signal:controller ? controller.signal : undefined}),page:1,total_pages:1};

        if(requestId !== searchRequestId){
            return;
        }

        lastDiscoverSearchQuery = cacheKey;
        lastDiscoverSearchResults = payload.results || [];
        discoverSearchState = {
            query:cleanQuery,
            page:Number(payload.page || 1),
            totalPages:Number(payload.total_pages || 1),
            loading:false
        };

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

    if(!query || state.loading){
        return;
    }

    const nextPage = Number(state.page || 1) + 1;
    const totalPages = Number(state.totalPages || 1);

    if(totalPages > 0 && nextPage > totalPages){
        return;
    }

    state.loading = true;
    discoverSearchState = state;

    if(typeof renderSearchResults === "function"){
        renderSearchResults(lastDiscoverSearchResults || []);
    }

    try{
        const payload = typeof tmdbSearchShowsPage === "function"
        ? await tmdbSearchShowsPage(query,nextPage)
        : {results:[],page:nextPage,total_pages:nextPage};
        const existing = new Set((lastDiscoverSearchResults || []).map(show=>String(show.id)));
        const fresh = (payload.results || []).filter(show=>{
            if(!show || !show.id || existing.has(String(show.id))){
                return false;
            }

            existing.add(String(show.id));
            return true;
        });

        lastDiscoverSearchResults = (lastDiscoverSearchResults || []).concat(fresh);
        discoverSearchState = {
            query:query,
            page:Number(payload.page || nextPage),
            totalPages:Number(payload.total_pages || totalPages || nextPage),
            loading:false
        };

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
        return;
    }

    if(!isMainSeasonNumber(seasonNumber)){
        return;
    }

    try{

        if(seasonNumber < 1){
            return;
        }

        const season = await tmdbGetSeason(show.tmdb_id,seasonNumber);

        if(!season || !season.episodes){
            return;
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

    }catch(error){
        return;
    }

}





function getCurrentAppRoute(){
    if(window.TVTrackerV2Router && typeof window.TVTrackerV2Router.currentRoute === "function"){
        return window.TVTrackerV2Router.currentRoute();
    }

    const path = String(window.location.pathname || "");
    return path.startsWith("/app") ? path : "/app/watchlist";
}

function setAppHashRoute(route,replace=false){
    const cleanRoute = String(route || "/app/watchlist");

    if(window.location.pathname === cleanRoute && !window.location.search && !window.location.hash){
        return;
    }

    if(replace){
        history.replaceState({tvTrackerRoute:true},"",cleanRoute);
    }else{
        history.pushState({tvTrackerRoute:true},"",cleanRoute);
    }
}

function getShowDetailRoute(showId){
    return "/app/show/" + encodeURIComponent(String(showId || ""));
}

function getEpisodeDetailRoute(showId,seasonNumber,episodeNumber){
    return getShowDetailRoute(showId) +
    "/season/" + encodeURIComponent(String(Number(seasonNumber))) +
    "/episode/" + encodeURIComponent(String(Number(episodeNumber)));
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

function showShowDetailPageShell(){
    activePage = "show-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    document.querySelectorAll(".app-primary-nav button[data-page]").forEach(button=>{
        button.classList.remove("active");
        button.removeAttribute("aria-current");
    });

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

    content.innerHTML = `
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

function pushShowDetailBackRoute(showId){
    const current = getCurrentAppRoute();
    const currentShow = getShowDetailRoute(showId);

    if(current && current !== currentShow){
        showDetailBackStack.push(current);
        if(showDetailBackStack.length > 20){
            showDetailBackStack = showDetailBackStack.slice(-20);
        }
    }
}

async function openShowDetailsPage(showId,options={}){
    const id = String(showId || "");

    if(!id){
        return;
    }

    const fromRoute = options && options.fromRoute === true;
    const replaceRoute = options && options.replaceRoute === true;
    const returningEpisodeContext = selectedEpisodeContext && String(selectedEpisodeContext.showId) === id
    ? selectedEpisodeContext
    : null;

    if(returningEpisodeContext){
        expandedSeasons[id] = expandedSeasons[id] || {};
        expandedSeasons[id][String(returningEpisodeContext.season)] = true;
        showDetailScrollRestorePending = true;
    }

    selectedEpisodeContext = null;
    selectedShowId = id;
    discoverPreviewShow = null;

    if(!fromRoute){
        pushShowDetailBackRoute(id);
    }

    showShowDetailPageShell();
    renderShowDetailLoading(id);

    if(!fromRoute){
        setAppHashRoute(getShowDetailRoute(id),replaceRoute);
    }

    const trackedShow = DATA.shows && DATA.shows[id] ? DATA.shows[id] : null;

    if(trackedShow){
        showDetailPreview = null;
        expandedSeasons[id] = expandedSeasons[id] || {};
        renderShowDetailsPage(trackedShow,{preview:false});
        restoreShowDetailScrollPositionIfNeeded();
        refreshOpenShowV2Details(id);
        return;
    }

    if(showDetailPreview && String(showDetailPreview.tmdb_id) === id){
        expandedSeasons[id] = expandedSeasons[id] || {};
        renderShowDetailsPage(showDetailPreview,{preview:true});
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
        renderShowDetailsPage(showObject,{preview:true});
        restoreShowDetailScrollPositionIfNeeded();
    }catch(error){
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
}

function closeShowDetailsPage(){
    const fallback = "/app/watchlist";
    const target = showDetailBackStack.length ? showDetailBackStack.pop() : fallback;

    selectedShowId = null;
    selectedEpisodeContext = null;
    showDetailPreview = null;

    setAppHashRoute(target || fallback,false);

    if(window.TVTrackerV2Router && typeof window.TVTrackerV2Router.applyRoute === "function"){
        window.TVTrackerV2Router.applyRoute();
    }else{
        showPage("shows");
    }
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

function showEpisodeDetailPageShell(){
    activePage = "episode-detail";

    document.querySelectorAll(".page").forEach(section=>{
        section.classList.remove("active-page");
    });

    document.querySelectorAll(".app-primary-nav button[data-page]").forEach(button=>{
        button.classList.remove("active");
        button.removeAttribute("aria-current");
    });

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

    content.innerHTML = `
        <div class="episode-detail-page-inner">
            <button class="episode-detail-back-button" id="episode-open-show-button" type="button" aria-label="Back to show">
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
    const targetRoute = showId ? getShowDetailRoute(showId) : "/app/watchlist";

    if(showId){
        expandedSeasons[showId] = expandedSeasons[showId] || {};
        expandedSeasons[showId][String(seasonNumber)] = true;
        showDetailScrollRestorePending = true;
    }

    setAppHashRoute(targetRoute,true);

    if(window.TVTrackerV2Router && typeof window.TVTrackerV2Router.applyRoute === "function"){
        window.TVTrackerV2Router.applyRoute();
    }else if(showId){
        openShowDetailsPage(showId,{fromRoute:true});
    }else{
        showPage("shows");
    }
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

    showEpisodeDetailPageShell();
    renderEpisodeDetailLoading(id,seasonNumber,episodeNumber);

    if(!fromRoute){
        setAppHashRoute(
            getEpisodeDetailRoute(id,seasonNumber,episodeNumber),
            replaceInPlace || replaceRoute
        );
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
                renderEpisodeDetailError(friendlyTMDBSearchError(error));
                showToast(friendlyTMDBSearchError(error));
            }
            return;
        }
    }

    if(DATA.shows && DATA.shows[id]){
        show = DATA.shows[id];
    }

    const isDiscoverPreview = !(DATA.shows && DATA.shows[id]);
    selectedEpisodeContext.discoverPreview = isDiscoverPreview;

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


async function updateEpisodeWatched(showId,season,episode,isWatched){
    const id = String(showId);
    const show = DATA.shows[id];

    if(!show){
        return;
    }

    await ensureSeasonLoaded(show,season,false,{skipSave:true});

    const episodeData = getEpisodeData(show,season,episode);

    if(isWatched && !isEpisodeLoggable(episodeData,show,season)){
        showToast("This episode has not aired yet");
        return;
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
    }else{
        if(show.episodes_watched && show.episodes_watched[String(season)]){
            show.episodes_watched[String(season)] =
            show.episodes_watched[String(season)].filter(ep=>ep !== episode);
        }

        deletedHistoryIds = removeHistoryEntry(id,season,episode);
        updateShowLastWatchedFromHistory(show);
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

    markEpisodesWatchedInSeason(show,seasonNumber,newlyMarkedEpisodes);
    const addedEntries = addHistoryEntries(show,newlyMarkedEpisodes);

    if(show.status === "plan"){
        show.status = "watching";
    }

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

    const today = new Date();
    today.setHours(0,0,0,0);

    const airDate = makeLocalDate(
        getEpisodeCalendarDateString(nextEp.air_date,nextEp)
    );

    if(!airDate){
        return false;
    }

    airDate.setHours(0,0,0,0);

    return airDate > today;

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
            air_time:episodeData.air_time || "",
            air_timestamp:episodeData.air_timestamp || "",
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

    const baseDateString = getEpisodeCalendarDateString(
        airDateString,
        episodeInfo
    );

    if(!baseDateString){
        return null;
    }

    const releaseDate = makeDateOnlyEpisodeReleaseDate(baseDateString);

    if(!releaseDate){
        return null;
    }

    return {
        date:releaseDate,
        hasTime:false,
        source:"date-only"
    };

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
    .filter(entry=>{

        if(!entry.air_date){
            return true;
        }

        return isEpisodeAired(
            entry.air_date,
            entry,
            DATA.shows[String(entry.tmdb_id)] || null
        );

    })
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

        /*
        Official TMDB calendar dates control schedule ordering and grouping.
        Local-time conversion is only a time display/refinement within the same
        official date and must never reorder July 28 ahead of July 27.
        */
        const dateCompare = compareEpisodeCalendarDates(
            a.episode.air_date,
            a.episode,
            b.episode.air_date,
            b.episode
        );

        if(dateCompare !== 0){
            return dateCompare;
        }

        const aRelease = makeEpisodeReleaseDate(a.episode.air_date,a.episode,a.show);
        const bRelease = makeEpisodeReleaseDate(b.episode.air_date,b.episode,b.show);

        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){
            return aRelease - bRelease;
        }

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

        const group = getUpcomingGroup(missedEpisode.air_date,missedEpisode);

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

        const group = getUpcomingGroup(ep.air_date,ep);

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

            const dayDifference = getDayDiffFromToday(airDate,sourceEpisode);

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

        const dateCompare = compareEpisodeCalendarDates(
            a.air_date,
            a,
            b.air_date,
            b
        );

        if(dateCompare !== 0){
            return dateCompare;
        }

        const aRelease = makeEpisodeReleaseDate(a.air_date,a,show);
        const bRelease = makeEpisodeReleaseDate(b.air_date,b,show);

        if(aRelease && bRelease && aRelease.getTime() !== bRelease.getTime()){
            return aRelease - bRelease;
        }

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



function getUpcomingGroup(airDateString,episodeInfo=null){

    const diffDays = getDayDiffFromToday(airDateString,episodeInfo);

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

    const airDate = makeLocalDate(
        getEpisodeCalendarDateString(airDateString,episodeInfo)
    );

    const today = new Date();
    today.setHours(0,0,0,0);

    if(
        airDate &&
        airDate.getFullYear() === today.getFullYear() &&
        airDate.getMonth() === today.getMonth()
    ){
        return "This Month";
    }

    return "Later";

}





function getUpcomingTimeLabel(airDateString,episodeInfo=null,showInfo=null){

    const diffDays = getDayDiffFromToday(airDateString,episodeInfo);

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



function getDayDiffFromToday(dateString,episodeInfo=null){

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

    const diffDays = getDayDiffFromToday(episode.air_date,episode);

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





function getCountdownText(airDateString,episodeInfo=null){

    const today = new Date();
    today.setHours(0,0,0,0);

    const airDate = makeLocalDate(
        getEpisodeCalendarDateString(airDateString,episodeInfo)
    );

    if(!airDate){
        return "";
    }

    airDate.setHours(0,0,0,0);

    const diff = airDate - today;

    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if(days <= 0){
        return "Airing today!";
    }

    if(days === 1){
        return "1 day remaining";
    }

    return days + " days remaining";

}





function formatAirDate(dateString,episodeInfo=null){

    const calendarDate = getEpisodeCalendarDateString(
        dateString,
        episodeInfo
    );

    if(!calendarDate){
        return "";
    }

    const date = makeLocalDate(calendarDate);

    if(!date){
        return "";
    }

    return date.toLocaleDateString(undefined,{
        year:"numeric",
        month:"short",
        day:"numeric"
    });

}





function updateTrackedLabels(){

    const searchInput = document.getElementById("search");

    if(!searchInput){
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

    const cachedResults = typeof tmdbGetCachedSearchShows === "function"
    ? tmdbGetCachedSearchShows(query)
    : null;

    if(cachedResults && cachedResults.length){
        lastDiscoverSearchQuery = cacheKey;
        lastDiscoverSearchResults = cachedResults.slice(0,10);
        renderSearchResults(lastDiscoverSearchResults);
        return;
    }

    searchShows(query);

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

    const specialHistoryEntries = history.filter(entry=>{
        return Number(entry.season) === 0 || entry.special === true;
    }).length;

    return {
        shows:shows.length,
        historyEntries:history.length,
        regularHistoryEntries:history.length - specialHistoryEntries,
        specialHistoryEntries:specialHistoryEntries,
        favorites:favorites.length
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
        `Favorites imported: ${Number(cleanSummary.favorites || 0).toLocaleString()}`,
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
        history:[],
        profile:{
            username:"Username",
            favorite_shows:[],
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
