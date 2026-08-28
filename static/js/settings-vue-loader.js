(function(global){
    "use strict";

    const document = global.document;
    if(!global.TVTrackerSettingsBridge || !document || typeof global.fetch !== "function"){
        return;
    }

    const manifestUrl = "/static/vue/manifest.json";
    let loadPromise = null;

    function reportFailure(code){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"settings",code});
        }
    }

    function loadVueSettings(){
        if(loadPromise){ return loadPromise; }
        loadPromise = global.fetch(manifestUrl,{credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}})
        .then(response=>{
            if(!response.ok){ throw new Error("manifest request failed"); }
            return response.json();
        })
        .then(manifest=>{
            const entry = manifest && manifest["frontend/src/main.ts"];
            const file = entry && typeof entry.file === "string" ? entry.file : "";
            if(!/^assets\/[A-Za-z0-9_-]+\.js$/.test(file)){
                throw new Error("invalid Vue manifest entry");
            }
            const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
            return import(new URL("/static/vue/" + file,base).href);
        })
        .catch(()=>{
            reportFailure("vue_settings_load_failed");
            loadPromise = null;
            return null;
        });
        return loadPromise;
    }

    document.addEventListener("tvtracker:settings-vue-needed",loadVueSettings);
    if(/^\/app\/settings\/streaming\/?$/.test(String(global.location && global.location.pathname || ""))){
        loadVueSettings();
    }
})(window);
