(function(global){
    "use strict";

    const TELEMETRY_PATH = "/api/client-errors";
    const originalFetch = typeof global.fetch === "function" ? global.fetch.bind(global) : null;
    const SAFE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
    const SAFE_REQUEST_ID = /^[0-9a-fA-F]{32}$/;
    const SURFACES = new Set([
        "app","detail","discover","history","notifications","search","settings","tracker","upcoming"
    ]);
    let activeSaveRequests = 0;
    let savedTimer = null;
    let storageWarningShown = false;

    function csrfToken(){
        if(!global.document || typeof global.document.querySelector !== "function"){
            return "";
        }
        const meta = global.document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.content || "") : "";
    }

    function makeEventId(){
        if(global.crypto && typeof global.crypto.randomUUID === "function"){
            return "client-" + global.crypto.randomUUID();
        }
        return "client-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,12);
    }

    function surfaceFromPath(pathname){
        const path = String(pathname || "");
        if(path.startsWith("/app/settings")){ return "settings"; }
        if(path.startsWith("/app/list/")){ return "tracker"; }
        if(path.startsWith("/app/history")){ return "history"; }
        if(path.startsWith("/app/discover") || path.startsWith("/app/browse/")){ return "discover"; }
        if(path.startsWith("/app/search")){ return "search"; }
        if(path.startsWith("/app/notifications")){ return "notifications"; }
        if(path.startsWith("/app/upcoming")){ return "upcoming"; }
        if(
            path.startsWith("/app/show/") ||
            path.startsWith("/app/movie/") ||
            path.startsWith("/app/episode/") ||
            path.startsWith("/app/person/") ||
            path.startsWith("/app/collection/")
        ){
            return "detail";
        }
        return "app";
    }

    function cleanStatus(value){
        const status = Number(value);
        return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
    }

    function cleanCode(value){
        const code = String(value || "").trim();
        return SAFE_CODE.test(code) ? code : undefined;
    }

    function cleanRequestId(value){
        const requestId = String(value || "").trim();
        return SAFE_REQUEST_ID.test(requestId) ? requestId.toLowerCase() : undefined;
    }

    function report(details={}){
        if(!originalFetch){ return Promise.resolve(null); }
        const category = ["api","promise","provider","runtime","save","session","storage"].includes(details.category)
            ? details.category
            : "runtime";
        const requestedSurface = String(details.surface || "").trim().toLowerCase();
        const surface = SURFACES.has(requestedSurface)
            ? requestedSurface
            : surfaceFromPath(global.location && global.location.pathname);
        const payload = {
            clientEventId:makeEventId(),
            category,
            surface
        };
        const status = cleanStatus(details.status);
        const code = cleanCode(details.code);
        const requestId = cleanRequestId(details.requestId);
        if(status !== undefined){ payload.status = status; }
        if(code !== undefined){ payload.code = code; }
        if(requestId !== undefined){ payload.requestId = requestId; }

        return originalFetch(TELEMETRY_PATH,{
            method:"POST",
            credentials:"same-origin",
            cache:"no-store",
            keepalive:true,
            headers:{
                "Accept":"application/json",
                "Content-Type":"application/json",
                "X-CSRF-Token":csrfToken()
            },
            body:JSON.stringify(payload)
        }).then(response=>{
            if(!response || !response.ok){ return null; }
            return response.json().catch(()=>null);
        }).catch(()=>null);
    }

    function ensureSaveStatus(){
        if(!global.document || !global.document.body){ return null; }
        let root = global.document.getElementById("tv-runtime-save-status");
        if(!root){
            root = global.document.createElement("div");
            root.id = "tv-runtime-save-status";
            root.className = "tv-runtime-save-status";
            root.setAttribute("role","status");
            root.setAttribute("aria-live","polite");
            root.hidden = true;
            global.document.body.appendChild(root);
        }
        return root;
    }

    function setSaveStatus(text,state,{autoHide=false}={}){
        const root = ensureSaveStatus();
        if(!root){ return; }
        if(savedTimer){
            global.clearTimeout(savedTimer);
            savedTimer = null;
        }
        root.textContent = String(text || "");
        root.dataset.state = String(state || "info");
        root.hidden = !root.textContent;
        if(autoHide && !root.hidden){
            savedTimer = global.setTimeout(()=>{
                root.hidden = true;
                root.textContent = "";
            },1400);
        }
    }

    function ensureRuntimeWarning(){
        if(!global.document || !global.document.body){ return null; }
        let root = global.document.getElementById("tv-runtime-warning");
        if(!root){
            root = global.document.createElement("div");
            root.id = "tv-runtime-warning";
            root.className = "tv-runtime-warning";
            root.setAttribute("role","alert");
            global.document.body.appendChild(root);
        }
        return root;
    }

    function storageIsWritable(storage){
        if(!storage || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function"){
            return false;
        }
        const key = "__tvtracker_storage_probe__";
        try{
            storage.setItem(key,"1");
            storage.removeItem(key);
            return true;
        }catch(error){
            return false;
        }
    }

    function checkPersistentStorage(){
        let writable = false;
        try{ writable = storageIsWritable(global.localStorage); }catch(error){ writable = false; }
        if(!writable){
            try{ writable = storageIsWritable(global.sessionStorage); }catch(error){ writable = false; }
        }
        if(writable || storageWarningShown){ return; }
        storageWarningShown = true;
        const warning = ensureRuntimeWarning();
        if(warning){
            warning.textContent = "Browser storage is unavailable. Unsaved changes may be lost if this tab closes before the server confirms them.";
        }
        report({category:"storage",code:"persistent_storage_unavailable"});
    }

    function requestMeta(input,init){
        const rawUrl = typeof input === "string"
            ? input
            : (input && typeof input.url === "string" ? input.url : "");
        const method = String(
            (init && init.method) ||
            (input && input.method) ||
            "GET"
        ).toUpperCase();
        try{
            const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
            const url = new URL(rawUrl,base);
            return {url,method};
        }catch(error){
            return {url:null,method};
        }
    }

    function categoryForRequest(meta,status){
        if(status === 401){ return "session"; }
        if(meta && meta.url && (
            meta.url.pathname.startsWith("/api/tmdb") ||
            meta.url.pathname.startsWith("/api/release-timing")
        )){
            return "provider";
        }
        if(meta && meta.url && meta.url.pathname === "/api/state" && meta.method === "PATCH"){
            return "save";
        }
        return "api";
    }

    function observeSaveStart(){
        activeSaveRequests += 1;
        setSaveStatus("Saving…","saving");
    }

    function observeSaveResponse(response){
        const status = Number(response && response.status || 0);
        if(response && response.ok){
            if(activeSaveRequests <= 1){
                setSaveStatus("Saved","saved",{autoHide:true});
            }
            return;
        }
        if(status === 409){
            setSaveStatus("Sync conflict — resolving…","warning");
        }else if(status === 401){
            setSaveStatus("Session expired — sign in again","error");
        }else{
            setSaveStatus("Save failed — retrying…","error");
        }
    }

    function observeSaveNetworkFailure(){
        if(global.navigator && global.navigator.onLine === false){
            setSaveStatus("Offline — waiting to save","warning");
        }else{
            setSaveStatus("Save failed — retrying…","error");
        }
    }

    function installFetchObservation(){
        if(!originalFetch){ return; }
        global.fetch = function(input,init){
            const meta = requestMeta(input,init);
            const sameOrigin = !!(
                meta.url &&
                global.location &&
                meta.url.origin === global.location.origin
            );
            const telemetryRequest = sameOrigin && meta.url.pathname === TELEMETRY_PATH;
            const saveRequest = sameOrigin && meta.url.pathname === "/api/state" && meta.method === "PATCH";

            if(saveRequest){ observeSaveStart(); }

            return originalFetch(input,init).then(response=>{
                if(sameOrigin && !telemetryRequest && response && !response.ok){
                    report({
                        category:categoryForRequest(meta,response.status),
                        status:response.status,
                        requestId:response.headers && response.headers.get
                            ? response.headers.get("X-Request-ID")
                            : ""
                    });
                }
                if(saveRequest){ observeSaveResponse(response); }
                return response;
            }).catch(error=>{
                if(sameOrigin && !telemetryRequest){
                    report({
                        category:saveRequest ? "save" : categoryForRequest(meta,0),
                        code:"network_failure"
                    });
                }
                if(saveRequest){ observeSaveNetworkFailure(); }
                throw error;
            }).finally(()=>{
                if(saveRequest){ activeSaveRequests = Math.max(0,activeSaveRequests - 1); }
            });
        };
    }

    function installGlobalErrorObservation(){
        if(typeof global.addEventListener !== "function"){ return; }
        global.addEventListener("error",()=>{
            report({category:"runtime",code:"uncaught_error"});
        });
        global.addEventListener("unhandledrejection",()=>{
            report({category:"promise",code:"unhandled_rejection"});
        });
        global.addEventListener("securitypolicyviolation",()=>{
            report({category:"runtime",code:"csp_violation"});
        });
    }

    function initialize(){
        installFetchObservation();
        installGlobalErrorObservation();
        if(global.document && global.document.readyState === "loading"){
            global.document.addEventListener("DOMContentLoaded",()=>{
                ensureSaveStatus();
                checkPersistentStorage();
            },{once:true});
        }else{
            ensureSaveStatus();
            checkPersistentStorage();
        }
    }

    global.TVTrackerClientRuntime = Object.freeze({
        report,
        surfaceFromPath,
        setSaveStatus
    });
    initialize();
})(window);
