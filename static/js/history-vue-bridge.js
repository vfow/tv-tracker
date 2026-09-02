(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    const HISTORY_BATCH_SIZE = 40;
    const emptyGroups = Object.freeze([]);
    const errorModel = Object.freeze({
        surface:"history",
        state:"error",
        groups:emptyGroups,
        emptyState:null,
        hasMore:false,
        failure:"model-projection"
    });
    let visibleLimit = HISTORY_BATCH_SIZE;
    let vueOwner = null;
    let loadPromise = null;

    function reportFailure(code){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"history",code});
        }
    }

    function loadingModel(){
        const mobile = typeof global.matchMedia === "function" && global.matchMedia("(max-width: 767.98px)").matches;
        return Object.freeze({
            surface:"history",
            state:"loading",
            groups:emptyGroups,
            emptyState:null,
            hasMore:false,
            failure:null,
            loadingRowCount:mobile ? 6 : 8
        });
    }

    function renderAssetLoadFailure(){
        const currentPath = String(global.location && global.location.pathname || "");
        const runtime = global.TVTrackerClientRuntime;
        if(currentPath !== "/app/history" || !runtime || typeof runtime.renderSurfaceFailure !== "function") return;
        runtime.renderSurfaceFailure({
            rootId:"show-list",
            marker:"data-tvtracker-history-vue-asset-load-failed",
            title:"History unavailable",
            message:"Reload the page to try again."
        });
    }

    function handleAssetLoadFailure(){
        reportFailure("vue_history_asset_load_failed");
        renderAssetLoadFailure();
    }

    function loadVueOwner(){
        if(vueOwner) return Promise.resolve(true);
        if(loadPromise) return loadPromise;
        if(typeof global.fetch !== "function"){
            handleAssetLoadFailure();
            return Promise.resolve(false);
        }
        loadPromise = global.fetch(manifestUrl,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}})
        .then(response=>{
            if(!response.ok) throw new Error("manifest request failed");
            return response.json();
        })
        .then(manifest=>{
            const entry = manifest && manifest["frontend/src/main.ts"];
            const file = entry && typeof entry.file === "string" ? entry.file : "";
            if(!/^assets\/[A-Za-z0-9_-]+\.js$/.test(file)) throw new Error("invalid Vue manifest entry");
            const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
            return import(new URL("/static/vue/" + file,base).href).then(()=>{
                if(!vueOwner) throw new Error("History Vue owner unavailable");
                return true;
            });
        })
        .catch(()=>{
            handleAssetLoadFailure();
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function buildModel(){
        const stateBridge = global.TVTrackerHistoryStateBridge;
        if(!stateBridge || stateBridge.ownership !== "legacy-read-only" || typeof stateBridge.viewModel !== "function"){
            throw new Error("History model projection unavailable");
        }
        const model = stateBridge.viewModel(visibleLimit);
        if(!model) throw new Error("History model projection failed");
        return model;
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid History Vue owner");
        }
        vueOwner = owner;
        const currentPath = String(global.location && global.location.pathname || "");
        if(currentPath === "/app/history" && global.appDataReady === false){
            vueOwner.render(loadingModel());
        }
    }

    async function renderHistory(){
        if(!vueOwner){
            const loaded = await loadVueOwner();
            if(!loaded || !vueOwner) return false;
        }
        let model;
        try{
            model = buildModel();
        }catch(error){
            reportFailure("history_model_projection_failed");
            model = errorModel;
        }
        vueOwner.render(model);
        return true;
    }

    async function loadMoreHistory(){
        visibleLimit += HISTORY_BATCH_SIZE;
        return renderHistory();
    }

    const actions = Object.freeze({loadMore:loadMoreHistory});
    const bridge = Object.freeze({
        ownership:"vue-dom",
        actions,
        attachVueOwner,
        renderHistory
    });

    global.TVTrackerHistoryVueBridge = bridge;
    global.renderHistory = renderHistory;
    global.loadMoreHistory = loadMoreHistory;

    const currentPath = String(global.location && global.location.pathname || "");
    if(currentPath === "/app/history"){
        void loadVueOwner();
    }
})(window);
