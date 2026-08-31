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
            if(global.TVTrackerSettingsBridge && typeof global.TVTrackerSettingsBridge.renderLoadFailure === "function"){
                global.TVTrackerSettingsBridge.renderLoadFailure();
            }
            loadPromise = null;
            return null;
        });
        return loadPromise;
    }

    document.addEventListener("tvtracker:settings-vue-needed",loadVueSettings);
    const currentPath = String(global.location && global.location.pathname || "");
    const settingsRoute = /^\/app\/settings(?:\/(?:profile|auth|notifications|streaming|data|danger-zone))?\/?$/.test(currentPath);
    const episodeRoute = /^\/app\/show\/[1-9][0-9]{0,11}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\/season\/\d{1,5}\/episode\/[1-9][0-9]{0,5}\/?$/.test(currentPath);
    if(settingsRoute || episodeRoute){
        loadVueSettings();
    }
})(window);
