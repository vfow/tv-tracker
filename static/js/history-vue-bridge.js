(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    const HISTORY_BATCH_SIZE = 40;
    let visibleLimit = HISTORY_BATCH_SIZE;
    let vueOwner = null;
    let loadPromise = null;

    function root(){
        if(!global.document || typeof global.document.getElementById !== "function") return null;
        return global.document.getElementById("show-list");
    }

    function reportLoadFailure(){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"history",code:"vue_history_load_failed"});
        }
    }

    function loadVueOwner(){
        if(vueOwner) return Promise.resolve(true);
        if(loadPromise) return loadPromise;
        if(typeof global.fetch !== "function") return Promise.resolve(false);
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
            return import(new URL("/static/vue/" + file,base).href).then(()=>true);
        })
        .catch(()=>{
            reportLoadFailure();
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function buildModel(){
        const stateBridge = global.TVTrackerHistoryStateBridge;
        if(!stateBridge || stateBridge.ownership !== "legacy-read-only" || typeof stateBridge.viewModel !== "function") return null;
        try{
            return stateBridge.viewModel(visibleLimit);
        }catch(error){
            return null;
        }
    }

    function renderLoadFailure(){
        const liveRoot = root();
        if(!liveRoot) return;
        liveRoot.innerHTML = '<div class="empty-state" data-tvtracker-history-vue-load-failed="true" role="alert"><h2>History unavailable</h2><p>Reload the page to try again.</p></div>';
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid History Vue owner");
        }
        vueOwner = owner;
    }

    async function renderHistory(){
        const model = buildModel();
        if(!model){
            renderLoadFailure();
            return false;
        }
        if(!vueOwner){
            const loaded = await loadVueOwner();
            if(!loaded || !vueOwner){
                renderLoadFailure();
                return false;
            }
        }
        vueOwner.render(model);
        const liveRoot = root();
        if(liveRoot && liveRoot.dataset){
            delete liveRoot.dataset.tvtrackerTrackerListsOwner;
            delete liveRoot.dataset.tvtrackerUpcomingNotificationsOwner;
            liveRoot.dataset.tvtrackerHistoryOwner = "vue-history";
        }
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
