(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    let vueOwner = null;
    let loadPromise = null;
    let lastModel = null;
    let lastShow = null;
    let lastOptions = null;

    function showRoot(){
        return global.document && typeof global.document.getElementById === "function"
            ? global.document.getElementById("show-detail-content")
            : null;
    }

    function buildViewModel(show,options){
        const renderHTML = global.renderShowDetailsPageHTML;
        if(typeof renderHTML !== "function"){
            throw new Error("Show Details HTML renderer unavailable");
        }
        return Object.freeze({html:String(renderHTML(show,options || {}) || "")});
    }

    function isTracked(show){
        const shows = global.DATA && global.DATA.shows && typeof global.DATA.shows === "object"
            ? global.DATA.shows
            : {};
        return !!(show && shows[String(show.tmdb_id)]);
    }

    function attachInteractions(){
        if(!lastShow){ return; }
        if(typeof global.attachShowDetailsPageEvents === "function"){
            global.attachShowDetailsPageEvents(lastShow,isTracked(lastShow));
        }
        if(typeof global.attachV2ShowModalEvents === "function"){
            global.attachV2ShowModalEvents(lastShow);
        }
    }

    function renderLoading(){
        const root = showRoot();
        if(!root){ return; }
        if(typeof global.renderTrackerDetailSkeletonHTML === "function"){
            root.innerHTML = global.renderTrackerDetailSkeletonHTML("show","show-page-back-button");
            return;
        }
        root.innerHTML = '<div class="show-detail-page-inner"><div class="empty-state show-detail-loading-state"><h2>Loading show</h2><p>Getting details.</p></div></div>';
    }

    function renderLoadFailure(){
        if(vueOwner){ return; }
        const root = showRoot();
        if(!root){ return; }
        root.innerHTML = '<div class="show-detail-page-inner" data-tvtracker-show-details-vue-load-failed="true" role="alert"><button type="button" class="show-page-back-button" id="show-page-back-button" aria-label="Back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button><div class="empty-state show-detail-loading-state"><h2>Show details unavailable</h2><p>Reload the page to try again.</p></div></div>';
        attachInteractions();
    }

    function reportLoadFailure(){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"show-detail",code:"vue_show_details_load_failed"});
        }
    }

    function loadVueShowDetails(){
        if(vueOwner){ return Promise.resolve(true); }
        if(loadPromise){ return loadPromise; }
        if(typeof global.fetch !== "function"){
            renderLoadFailure();
            return Promise.resolve(false);
        }
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
            return import(new URL("/static/vue/" + file,base).href).then(()=>true);
        })
        .catch(()=>{
            reportLoadFailure();
            renderLoadFailure();
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function render(show,options={}){
        if(!show){ return; }
        lastShow = show;
        lastOptions = options;
        try{
            lastModel = buildViewModel(lastShow,lastOptions);
        }catch(error){
            reportLoadFailure();
            renderLoadFailure();
            return;
        }
        if(vueOwner){
            vueOwner.render(lastModel);
            attachInteractions();
            return;
        }
        renderLoading();
        void loadVueShowDetails();
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Show Details owner");
        }
        vueOwner = owner;
        if(lastModel){
            vueOwner.render(lastModel);
            attachInteractions();
        }
    }

    global.TVTrackerShowDetailsVueBridge = Object.freeze({
        attachVueOwner,
        render,
        renderLoadFailure,
        buildViewModel,
        ownership:"vue-dom"
    });
    global.renderShowDetailsPage = render;

    const currentPath = String(global.location && global.location.pathname || "");
    if(/^\/app\/show(?:\/|$)/.test(currentPath)){
        void loadVueShowDetails();
    }
})(window);
