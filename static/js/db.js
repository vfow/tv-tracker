let DATABASE = null;
let SERVER_REVISION = 0;
let LAST_SAVED_DATA = null;
let SAVE_CHAIN = Promise.resolve();
let SAVE_IN_FLIGHT = 0;
let SYNC_STARTED = false;
let SYNC_TIMER = null;
let SYNC_IN_FLIGHT = false;
let SYNC_CHANNEL = null;
let SYNC_FAILURES = 0;
let SYNC_WARNING_SHOWN = false;
let LAST_USER_ACTIVITY_AT = Date.now();

const SYNC_ACTIVE_INTERVAL_MS = 2000;
const SYNC_IDLE_INTERVAL_MS = 5000;
const SYNC_ACTIVE_WINDOW_MS = 30000;
const SYNC_CHANNEL_NAME = "tv-tracker-sync-v1";
const MAX_SAVE_ATTEMPTS = 3;
const DELETE_VALUE = Symbol("delete-value");

function cloneTrackerData(value){
    return value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

function csrfToken(){
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? String(meta.content || "") : "";
}

function redirectToLogin(){
    const next = encodeURIComponent(location.pathname + location.search);
    location.assign("/login?next=" + next);
}

async function parseAPIResponse(response){
    if(response.status === 401){
        redirectToLogin();
        const sessionError = new Error("Your session has expired.");
        sessionError.status = 401;
        throw sessionError;
    }

    let payload = null;

    try{
        payload = await response.json();
    }catch(error){
        payload = null;
    }

    if(!response.ok){
        const message = payload && payload.error
        ? payload.error
        : "Server request failed (" + response.status + ")";
        const requestError = new Error(message);
        requestError.status = response.status;
        requestError.payload = payload || {};
        throw requestError;
    }

    return payload || {};
}

function createHistoryId(entry,index){
    const existing = entry && entry.id ? String(entry.id) : "";

    if(existing){
        return existing;
    }

    let randomPart = "";

    if(globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"){
        randomPart = globalThis.crypto.randomUUID();
    }else{
        randomPart = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    }

    return "online-" + randomPart + "-" + Number(index || 0);
}

function createOperationId(){
    if(globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"){
        return "operation-" + globalThis.crypto.randomUUID();
    }

    return (
        "operation-" +
        Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2) + "-" +
        Math.random().toString(36).slice(2)
    );
}

function ensureHistoryIds(data){
    if(!data || !Array.isArray(data.history)){
        return;
    }

    data.history.forEach((entry,index)=>{
        if(entry && typeof entry === "object" && !entry.id){
            entry.id = createHistoryId(entry,index);
        }
    });
}

function jsonEqual(left,right){
    return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value){
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function objectMapById(items){
    const map = new Map();

    (Array.isArray(items) ? items : []).forEach((entry,index)=>{
        if(!entry || typeof entry !== "object"){
            return;
        }

        const id = createHistoryId(entry,index);
        entry.id = id;
        map.set(id,entry);
    });

    return map;
}

function buildServerDelta(previous,current){
    const before = previous || {shows:{},history:[]};
    const after = current || {shows:{},history:[]};
    const beforeShows = before.shows || {};
    const afterShows = after.shows || {};
    const showsUpsert = {};
    const showsDelete = [];

    Object.keys(afterShows).forEach(id=>{
        if(!Object.prototype.hasOwnProperty.call(beforeShows,id) || !jsonEqual(beforeShows[id],afterShows[id])){
            showsUpsert[String(id)] = afterShows[id];
        }
    });

    Object.keys(beforeShows).forEach(id=>{
        if(!Object.prototype.hasOwnProperty.call(afterShows,id)){
            showsDelete.push(String(id));
        }
    });

    const beforeHistory = objectMapById(before.history);
    const afterHistory = objectMapById(after.history);
    const historyUpsert = {};
    const historyDelete = [];

    afterHistory.forEach((entry,id)=>{
        if(!beforeHistory.has(id) || !jsonEqual(beforeHistory.get(id),entry)){
            historyUpsert[id] = entry;
        }
    });

    beforeHistory.forEach((entry,id)=>{
        if(!afterHistory.has(id)){
            historyDelete.push(id);
        }
    });

    const beforeOrder = Array.from(beforeHistory.keys());
    const afterOrder = Array.from(afterHistory.keys());
    const historyOrderChanged = !jsonEqual(beforeOrder,afterOrder);
    const stateUpsert = {};
    const stateKeys = new Set([
        ...Object.keys(before),
        ...Object.keys(after)
    ]);

    stateKeys.delete("shows");
    stateKeys.delete("history");

    stateKeys.forEach(key=>{
        if(!jsonEqual(before[key],after[key])){
            stateUpsert[key] = after[key] === undefined ? null : after[key];
        }
    });

    return {
        showsUpsert,
        showsDelete,
        historyUpsert,
        historyDelete,
        historyOrder:historyOrderChanged ? afterOrder : null,
        stateUpsert
    };
}

function deltaIsEmpty(delta){
    return (
        Object.keys(delta.showsUpsert).length === 0 &&
        delta.showsDelete.length === 0 &&
        Object.keys(delta.historyUpsert).length === 0 &&
        delta.historyDelete.length === 0 &&
        delta.historyOrder === null &&
        Object.keys(delta.stateUpsert).length === 0
    );
}

function applyServerDelta(target,delta){
    if(!target || !delta){
        return target;
    }

    if(!target.shows || typeof target.shows !== "object"){
        target.shows = {};
    }

    Object.entries(delta.showsUpsert || {}).forEach(([id,show])=>{
        target.shows[String(id)] = cloneTrackerData(show);
    });

    (delta.showsDelete || []).forEach(id=>{
        delete target.shows[String(id)];
    });

    if(!Array.isArray(target.history)){
        target.history = [];
    }

    const oldOrder = target.history.map((entry,index)=>createHistoryId(entry,index));
    const historyMap = objectMapById(target.history);

    (delta.historyDelete || []).forEach(id=>{
        historyMap.delete(String(id));
    });

    Object.entries(delta.historyUpsert || {}).forEach(([id,entry])=>{
        const copy = cloneTrackerData(entry);
        copy.id = String(id);
        historyMap.set(String(id),copy);
    });

    const requestedOrder = Array.isArray(delta.historyOrder)
    ? delta.historyOrder.map(String)
    : oldOrder;
    const newHistory = [];
    const seen = new Set();

    requestedOrder.forEach(id=>{
        if(historyMap.has(id) && !seen.has(id)){
            newHistory.push(historyMap.get(id));
            seen.add(id);
        }
    });

    historyMap.forEach((entry,id)=>{
        if(!seen.has(id)){
            newHistory.push(entry);
        }
    });

    target.history = newHistory;

    Object.entries(delta.stateUpsert || {}).forEach(([key,value])=>{
        target[key] = cloneTrackerData(value);
    });

    ensureHistoryIds(target);
    return target;
}

function applyChangeList(target,changes){
    (Array.isArray(changes) ? changes : []).forEach(change=>{
        if(change && change.delta){
            applyServerDelta(target,change.delta);
        }
    });
    return target;
}

function presenceEquals(leftHas,leftValue,rightHas,rightValue){
    if(leftHas !== rightHas){
        return false;
    }
    return !leftHas || jsonEqual(leftValue,rightValue);
}

function mergePrimitiveArray(base,local,remote){
    const allPrimitive = [base,local,remote].every(list=>{
        return Array.isArray(list) && list.every(item=>{
            return item === null || ["string","number","boolean"].includes(typeof item);
        });
    });

    if(!allPrimitive){
        return cloneTrackerData(local);
    }

    const key = value=>JSON.stringify(value);
    const baseKeys = new Set(base.map(key));
    const localKeys = new Set(local.map(key));
    const removed = new Set(base.filter(item=>!localKeys.has(key(item))).map(key));
    const result = remote.filter(item=>!removed.has(key(item)));
    const resultKeys = new Set(result.map(key));

    local.forEach(item=>{
        const itemKey = key(item);
        if(!baseKeys.has(itemKey) && !resultKeys.has(itemKey)){
            result.push(cloneTrackerData(item));
            resultKeys.add(itemKey);
        }
    });

    return result;
}

function mergeValue(baseHas,baseValue,localHas,localValue,remoteHas,remoteValue){
    if(presenceEquals(localHas,localValue,baseHas,baseValue)){
        return remoteHas ? cloneTrackerData(remoteValue) : DELETE_VALUE;
    }

    if(presenceEquals(remoteHas,remoteValue,baseHas,baseValue)){
        return localHas ? cloneTrackerData(localValue) : DELETE_VALUE;
    }

    if(!localHas){
        return DELETE_VALUE;
    }

    if(!remoteHas){
        return cloneTrackerData(localValue);
    }

    if(isPlainObject(localValue) && isPlainObject(remoteValue)){
        return mergePlainObject(
            isPlainObject(baseValue) ? baseValue : {},
            localValue,
            remoteValue
        );
    }

    if(Array.isArray(localValue) && Array.isArray(remoteValue)){
        return mergePrimitiveArray(
            Array.isArray(baseValue) ? baseValue : [],
            localValue,
            remoteValue
        );
    }

    return cloneTrackerData(localValue);
}

function mergePlainObject(base,local,remote){
    const result = {};
    const keys = new Set([
        ...Object.keys(base || {}),
        ...Object.keys(local || {}),
        ...Object.keys(remote || {})
    ]);

    keys.forEach(key=>{
        const baseHas = Object.prototype.hasOwnProperty.call(base || {},key);
        const localHas = Object.prototype.hasOwnProperty.call(local || {},key);
        const remoteHas = Object.prototype.hasOwnProperty.call(remote || {},key);
        const merged = mergeValue(
            baseHas,base && base[key],
            localHas,local && local[key],
            remoteHas,remote && remote[key]
        );

        if(merged !== DELETE_VALUE){
            result[key] = merged;
        }
    });

    return result;
}

function mergeEntityMaps(baseMap,localMap,remoteMap){
    const result = {};
    const ids = new Set([
        ...Object.keys(baseMap || {}),
        ...Object.keys(localMap || {}),
        ...Object.keys(remoteMap || {})
    ]);

    ids.forEach(id=>{
        const baseHas = Object.prototype.hasOwnProperty.call(baseMap || {},id);
        const localHas = Object.prototype.hasOwnProperty.call(localMap || {},id);
        const remoteHas = Object.prototype.hasOwnProperty.call(remoteMap || {},id);
        const merged = mergeValue(
            baseHas,baseMap && baseMap[id],
            localHas,localMap && localMap[id],
            remoteHas,remoteMap && remoteMap[id]
        );

        if(merged !== DELETE_VALUE){
            result[id] = merged;
        }
    });

    return result;
}

function mergeHistory(baseHistory,localHistory,remoteHistory){
    const baseMap = objectMapById(cloneTrackerData(baseHistory || []));
    const localMap = objectMapById(cloneTrackerData(localHistory || []));
    const remoteMap = objectMapById(cloneTrackerData(remoteHistory || []));
    const mergedMap = new Map();
    const ids = new Set([
        ...baseMap.keys(),
        ...localMap.keys(),
        ...remoteMap.keys()
    ]);

    ids.forEach(id=>{
        const merged = mergeValue(
            baseMap.has(id),baseMap.get(id),
            localMap.has(id),localMap.get(id),
            remoteMap.has(id),remoteMap.get(id)
        );

        if(merged !== DELETE_VALUE){
            merged.id = id;
            mergedMap.set(id,merged);
        }
    });

    const order = [];
    const seen = new Set();

    (localHistory || []).forEach((entry,index)=>{
        const id = createHistoryId(entry,index);
        if(mergedMap.has(id) && !seen.has(id)){
            order.push(id);
            seen.add(id);
        }
    });

    (remoteHistory || []).forEach((entry,index)=>{
        const id = createHistoryId(entry,index);
        if(mergedMap.has(id) && !seen.has(id)){
            order.push(id);
            seen.add(id);
        }
    });

    mergedMap.forEach((entry,id)=>{
        if(!seen.has(id)){
            order.push(id);
        }
    });

    return order.map(id=>mergedMap.get(id));
}

function mergeTrackerSnapshots(base,local,remote){
    const safeBase = base || {shows:{},history:[]};
    const safeLocal = local || {shows:{},history:[]};
    const safeRemote = remote || {shows:{},history:[]};
    const result = mergePlainObject(safeBase,safeLocal,safeRemote);

    result.shows = mergeEntityMaps(
        safeBase.shows || {},
        safeLocal.shows || {},
        safeRemote.shows || {}
    );
    result.history = mergeHistory(
        safeBase.history || [],
        safeLocal.history || [],
        safeRemote.history || []
    );
    ensureHistoryIds(result);
    return result;
}

async function initDatabase(){
    DATABASE = {type:"online"};
}

async function fetchFullState(){
    const response = await fetch("/api/state",{
        method:"GET",
        credentials:"same-origin",
        cache:"no-store",
        headers:{"Accept":"application/json"}
    });

    const payload = await parseAPIResponse(response);
    const data = payload.data || null;

    if(data){
        ensureHistoryIds(data);
    }

    return {
        data,
        revision:Number(payload.revision || 0)
    };
}

async function getStoredData(){
    const result = await fetchFullState();
    SERVER_REVISION = result.revision;

    if(result.data){
        LAST_SAVED_DATA = cloneTrackerData(result.data);
    }else{
        LAST_SAVED_DATA = null;
    }

    return result.data;
}

function captureUIState(){
    const active = document.activeElement;
    const modalBox = document.querySelector("#show-modal .show-modal");
    return {
        windowX:window.scrollX,
        windowY:window.scrollY,
        modalScroll:modalBox ? modalBox.scrollTop : 0,
        activeId:active && active.id ? active.id : "",
        selectionStart:active && typeof active.selectionStart === "number" ? active.selectionStart : null,
        selectionEnd:active && typeof active.selectionEnd === "number" ? active.selectionEnd : null
    };
}

function restoreUIState(state){
    requestAnimationFrame(()=>{
        window.scrollTo(state.windowX,state.windowY);
        const modalBox = document.querySelector("#show-modal .show-modal");
        if(modalBox){
            modalBox.scrollTop = state.modalScroll;
        }

        if(state.activeId){
            const active = document.getElementById(state.activeId);
            if(active){
                active.focus({preventScroll:true});
                if(
                    state.selectionStart !== null &&
                    typeof active.setSelectionRange === "function"
                ){
                    active.setSelectionRange(state.selectionStart,state.selectionEnd);
                }
            }
        }
    });
}

function refreshUIAfterRemoteSync(){
    if(typeof renderAll !== "function"){
        return;
    }

    const state = captureUIState();
    renderAll();

    if(
        typeof selectedEpisodeContext !== "undefined" &&
        selectedEpisodeContext
    ){
        const context = selectedEpisodeContext;
        const show = context.discoverPreview
        ? (typeof discoverPreviewShow !== "undefined" ? discoverPreviewShow : null)
        : (DATA.shows && DATA.shows[String(context.showId)]);

        if(show && typeof renderEpisodeModal === "function"){
            renderEpisodeModal(show,context.season,context.episode,context);
        }
    }else if(
        typeof selectedShowId !== "undefined" &&
        selectedShowId &&
        DATA.shows &&
        DATA.shows[String(selectedShowId)] &&
        typeof renderShowModal === "function"
    ){
        renderShowModal(DATA.shows[String(selectedShowId)]);
    }else if(
        typeof discoverPreviewShow !== "undefined" &&
        discoverPreviewShow &&
        typeof updateTrackedLabels === "function"
    ){
        updateTrackedLabels();
    }

    restoreUIState(state);
}

function broadcastRevision(){
    if(SYNC_CHANNEL){
        SYNC_CHANNEL.postMessage({
            type:"revision",
            revision:SERVER_REVISION
        });
    }
}

async function getRemoteSnapshotFromConflict(payload,baseline){
    if(payload && payload.reset){
        const full = await fetchFullState();
        return full;
    }

    const remote = cloneTrackerData(baseline || {shows:{},history:[]});
    applyChangeList(remote,payload && payload.changes);
    return {
        data:remote,
        revision:Number(payload && payload.revision || SERVER_REVISION)
    };
}

function sleep(milliseconds){
    return new Promise(resolve=>setTimeout(resolve,milliseconds));
}

async function persistSnapshot(snapshot,capturedBase,operationId){
    let workingSnapshot = mergeTrackerSnapshots(
        capturedBase || LAST_SAVED_DATA || {shows:{},history:[]},
        snapshot,
        LAST_SAVED_DATA || capturedBase || {shows:{},history:[]}
    );
    let networkAttempt = 0;

    while(true){
        const baseline = cloneTrackerData(LAST_SAVED_DATA || {shows:{},history:[]});
        workingSnapshot = mergeTrackerSnapshots(
            capturedBase || baseline,
            workingSnapshot,
            baseline
        );
        capturedBase = baseline;
        ensureHistoryIds(workingSnapshot);

        const delta = buildServerDelta(baseline,workingSnapshot);

        if(deltaIsEmpty(delta)){
            return true;
        }

        const requestRevision = SERVER_REVISION;

        try{
            const response = await fetch("/api/state",{
                method:"PATCH",
                credentials:"same-origin",
                cache:"no-store",
                headers:{
                    "Accept":"application/json",
                    "Content-Type":"application/json",
                    "X-CSRF-Token":csrfToken()
                },
                body:JSON.stringify({
                    ...delta,
                    baseRevision:requestRevision,
                    operationId
                })
            });

            const payload = await parseAPIResponse(response);
            const remoteBeforeLocal = cloneTrackerData(baseline);
            applyChangeList(remoteBeforeLocal,payload.changes);

            let finalSaved = remoteBeforeLocal;

            if(!payload.duplicate){
                applyServerDelta(finalSaved,payload.appliedDelta || delta);
            }

            DATA = mergeTrackerSnapshots(baseline,DATA,finalSaved);
            LAST_SAVED_DATA = cloneTrackerData(finalSaved);
            SERVER_REVISION = Number(payload.revision || SERVER_REVISION);

            if((payload.changes || []).length > 0 || payload.duplicate){
                refreshUIAfterRemoteSync();
            }

            broadcastRevision();
            SYNC_FAILURES = 0;
            SYNC_WARNING_SHOWN = false;
            return true;
        }catch(error){
            if(error && error.status === 409){
                const remoteResult = await getRemoteSnapshotFromConflict(
                    error.payload || {},
                    baseline
                );
                const remoteSnapshot = remoteResult.data || baseline;

                workingSnapshot = mergeTrackerSnapshots(
                    baseline,
                    workingSnapshot,
                    remoteSnapshot
                );
                DATA = mergeTrackerSnapshots(baseline,DATA,remoteSnapshot);
                LAST_SAVED_DATA = cloneTrackerData(remoteSnapshot);
                SERVER_REVISION = Number(remoteResult.revision || SERVER_REVISION);
                capturedBase = remoteSnapshot;
                refreshUIAfterRemoteSync();
                continue;
            }

            networkAttempt += 1;

            if(networkAttempt >= MAX_SAVE_ATTEMPTS || (error && error.status)){
                throw error;
            }

            await sleep(networkAttempt === 1 ? 500 : 1500);
        }
    }
}

function saveData(){
    ensureHistoryIds(DATA);
    const snapshot = cloneTrackerData(DATA);
    const capturedBase = cloneTrackerData(LAST_SAVED_DATA || {shows:{},history:[]});
    const operationId = createOperationId();

    SAVE_CHAIN = SAVE_CHAIN
    .catch(()=>false)
    .then(async()=>{
        SAVE_IN_FLIGHT += 1;
        try{
            return await persistSnapshot(snapshot,capturedBase,operationId);
        }catch(error){
            console.error("TV Tracker could not save online data",error);

            if(typeof showToast === "function"){
                showToast("Could not save online. Check your connection.");
            }

            return false;
        }finally{
            SAVE_IN_FLIGHT = Math.max(0,SAVE_IN_FLIGHT - 1);
            if(SYNC_STARTED && document.visibilityState === "visible"){
                scheduleNextSync(250);
            }
        }
    });

    return SAVE_CHAIN;
}

function syncInterval(){
    return Date.now() - LAST_USER_ACTIVITY_AT <= SYNC_ACTIVE_WINDOW_MS
    ? SYNC_ACTIVE_INTERVAL_MS
    : SYNC_IDLE_INTERVAL_MS;
}

function scheduleNextSync(delay){
    if(!SYNC_STARTED){
        return;
    }

    clearTimeout(SYNC_TIMER);

    if(document.visibilityState !== "visible"){
        SYNC_TIMER = null;
        return;
    }

    SYNC_TIMER = setTimeout(async()=>{
        await syncFromServer("poll");
        scheduleNextSync(syncInterval());
    },Math.max(0,Number(delay || syncInterval())));
}

function recordSyncActivity(){
    LAST_USER_ACTIVITY_AT = Date.now();
}

function noteSyncFailure(error){
    if(error && error.status === 401){
        return;
    }

    SYNC_FAILURES += 1;

    if(SYNC_FAILURES >= 3 && !SYNC_WARNING_SHOWN){
        SYNC_WARNING_SHOWN = true;
        if(typeof showToast === "function"){
            showToast("Sync is temporarily unavailable. Retrying automatically.");
        }
    }
}

function noteSyncSuccess(){
    if(SYNC_WARNING_SHOWN && typeof showToast === "function"){
        showToast("Sync restored");
    }
    SYNC_FAILURES = 0;
    SYNC_WARNING_SHOWN = false;
}

async function syncFromServer(reason="poll",force=false){
    if(!SYNC_STARTED || SYNC_IN_FLIGHT || SAVE_IN_FLIGHT > 0){
        return false;
    }

    if(!force && document.visibilityState !== "visible"){
        return false;
    }

    SYNC_IN_FLIGHT = true;

    try{
        const revisionResponse = await fetch("/api/revision",{
            method:"GET",
            credentials:"same-origin",
            cache:"no-store",
            headers:{"Accept":"application/json"}
        });
        const revisionPayload = await parseAPIResponse(revisionResponse);
        const remoteRevision = Number(revisionPayload.revision || 0);

        if(remoteRevision === SERVER_REVISION){
            noteSyncSuccess();
            return true;
        }

        if(remoteRevision < SERVER_REVISION){
            const baseline = cloneTrackerData(LAST_SAVED_DATA || {shows:{},history:[]});
            const full = await fetchFullState();

            if(full.data){
                DATA = mergeTrackerSnapshots(baseline,DATA,full.data);
                LAST_SAVED_DATA = cloneTrackerData(full.data);
                SERVER_REVISION = full.revision;
                refreshUIAfterRemoteSync();
            }

            noteSyncSuccess();
            return true;
        }

        const response = await fetch(
            "/api/changes?since=" + encodeURIComponent(SERVER_REVISION),
            {
                method:"GET",
                credentials:"same-origin",
                cache:"no-store",
                headers:{"Accept":"application/json"}
            }
        );
        const payload = await parseAPIResponse(response);
        const baseline = cloneTrackerData(LAST_SAVED_DATA || {shows:{},history:[]});
        let remoteSnapshot = null;

        if(payload.reset){
            remoteSnapshot = payload.data || null;
            if(!remoteSnapshot){
                const full = await fetchFullState();
                remoteSnapshot = full.data;
                payload.revision = full.revision;
            }
        }else{
            remoteSnapshot = cloneTrackerData(baseline);
            applyChangeList(remoteSnapshot,payload.changes);
        }

        if(remoteSnapshot){
            ensureHistoryIds(remoteSnapshot);
            DATA = mergeTrackerSnapshots(baseline,DATA,remoteSnapshot);
            LAST_SAVED_DATA = cloneTrackerData(remoteSnapshot);
            SERVER_REVISION = Number(payload.revision || remoteRevision);
            refreshUIAfterRemoteSync();
        }

        noteSyncSuccess();
        return true;
    }catch(error){
        console.warn("TV Tracker synchronization failed",reason,error);
        noteSyncFailure(error);
        return false;
    }finally{
        SYNC_IN_FLIGHT = false;
    }
}

function startDataSync(){
    if(SYNC_STARTED){
        return;
    }

    SYNC_STARTED = true;
    LAST_USER_ACTIVITY_AT = Date.now();

    ["pointerdown","keydown","touchstart","scroll"].forEach(eventName=>{
        window.addEventListener(eventName,recordSyncActivity,{passive:true});
    });

    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState === "visible"){
            recordSyncActivity();
            syncFromServer("visible",true).finally(()=>{
                scheduleNextSync(syncInterval());
            });
        }else{
            clearTimeout(SYNC_TIMER);
            SYNC_TIMER = null;
        }
    });

    if(typeof BroadcastChannel === "function"){
        SYNC_CHANNEL = new BroadcastChannel(SYNC_CHANNEL_NAME);
        SYNC_CHANNEL.addEventListener("message",event=>{
            const message = event.data || {};
            if(
                message.type === "revision" &&
                Number(message.revision || 0) > SERVER_REVISION
            ){
                syncFromServer("broadcast",true);
            }
        });
    }

    window.addEventListener("beforeunload",()=>{
        if(SYNC_CHANNEL){
            SYNC_CHANNEL.close();
        }
    });

    scheduleNextSync(SYNC_ACTIVE_INTERVAL_MS);
}
