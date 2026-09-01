(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    let vueOwner = null;
    let loadPromise = null;

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
        if(typeof global.getHistoryViewModel !== "function") return null;
        return global.getHistoryViewModel();
    }

    async function renderHistory(){
        if(!vueOwner){
            const loaded = await loadVueOwner();
            if(!loaded || !vueOwner) return false;
        }
        const model = buildModel();
        if(!model) return false;
        vueOwner.render(model);
        return true;
    }

    const actions = Object.freeze({
        async loadMore(){
            if(typeof global.loadMoreHistory === "function"){
                await global.loadMoreHistory();
            }
        }
    });

    const bridge = Object.freeze({
        ownership:"vue-dom",
        actions,
        attachVueOwner(owner){
            vueOwner = owner && typeof owner.render === "function" ? owner : null;
        },
        renderHistory
    });

    global.TVTrackerHistoryVueBridge = bridge;
    global.renderHistory = renderHistory;
})(window);
