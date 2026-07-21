let DATABASE = null;
let SERVER_REVISION = 0;
let LAST_SAVED_DATA = null;
let SAVE_CHAIN = Promise.resolve();

function cloneTrackerData(value){
    return JSON.parse(JSON.stringify(value));
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
        throw new Error("Your session has expired.");
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
        throw new Error(message);
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

async function initDatabase(){
    DATABASE = {type:"online"};
}

async function getStoredData(){
    const response = await fetch("/api/state",{
        method:"GET",
        credentials:"same-origin",
        cache:"no-store",
        headers:{"Accept":"application/json"}
    });

    const payload = await parseAPIResponse(response);
    const data = payload.data || null;

    SERVER_REVISION = Number(payload.revision || 0);

    if(data){
        ensureHistoryIds(data);
        LAST_SAVED_DATA = cloneTrackerData(data);
    }else{
        LAST_SAVED_DATA = null;
    }

    return data;
}

async function persistSnapshot(snapshot){
    ensureHistoryIds(snapshot);

    const delta = buildServerDelta(LAST_SAVED_DATA,snapshot);

    if(deltaIsEmpty(delta)){
        return true;
    }

    const response = await fetch("/api/state",{
        method:"PATCH",
        credentials:"same-origin",
        cache:"no-store",
        headers:{
            "Accept":"application/json",
            "Content-Type":"application/json",
            "X-CSRF-Token":csrfToken()
        },
        body:JSON.stringify(delta)
    });

    const payload = await parseAPIResponse(response);
    SERVER_REVISION = Number(payload.revision || SERVER_REVISION);
    LAST_SAVED_DATA = cloneTrackerData(snapshot);
    return true;
}

function saveData(){
    ensureHistoryIds(DATA);
    const snapshot = cloneTrackerData(DATA);

    SAVE_CHAIN = SAVE_CHAIN
    .catch(()=>false)
    .then(async()=>{
        try{
            return await persistSnapshot(snapshot);
        }catch(error){
            console.error("TV Tracker could not save online data",error);

            if(typeof showToast === "function"){
                showToast("Could not save online. Check your connection.");
            }

            return false;
        }
    });

    return SAVE_CHAIN;
}
