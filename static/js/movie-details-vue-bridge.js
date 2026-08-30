(function(global){
    "use strict";

    const manifestUrl = "/static/vue/manifest.json";
    let vueOwner = null;
    let loadPromise = null;
    let lastModel = null;

    function movieRoot(){
        return global.document && typeof global.document.getElementById === "function"
            ? global.document.getElementById("show-detail-content")
            : null;
    }

    function currentState(){
        return global.moviePageState && typeof global.moviePageState === "object"
            ? global.moviePageState
            : {movieId:"",routeSlug:"",loading:false,error:"",movie:null};
    }

    function buildViewModel(state){
        const pageState = state && typeof state === "object" ? state : currentState();
        const renderHTML = global.renderMovieDetailPageHTML;
        if(typeof renderHTML !== "function"){
            throw new Error("Movie Details HTML renderer unavailable");
        }
        return Object.freeze({html:String(renderHTML(pageState) || "")});
    }

    function renderLoading(){
        const root = movieRoot();
        if(!root){ return; }
        if(typeof global.renderTrackerDetailSkeletonHTML === "function"){
            root.innerHTML = global.renderTrackerDetailSkeletonHTML("movie","movie-page-back-button");
            return;
        }
        root.innerHTML = '<div class="show-detail-page-inner"><div class="empty-state show-detail-loading-state"><h2>Loading movie</h2><p>Getting details.</p></div></div>';
    }

    function renderLoadFailure(){
        if(vueOwner){ return; }
        const root = movieRoot();
        if(!root){ return; }
        root.innerHTML = '<div class="show-detail-page-inner" data-tvtracker-movie-details-vue-load-failed="true" role="alert"><button type="button" class="show-page-back-button" id="movie-page-back-button" aria-label="Back"><img src="/static/assets/icons/arrow-narrow-left.svg" alt=""></button><div class="empty-state show-detail-loading-state"><h2>Movie details unavailable</h2><p>Reload the page to try again.</p></div></div>';
        if(typeof global.attachMovieDetailPageEvents === "function"){
            global.attachMovieDetailPageEvents();
        }
    }

    function reportLoadFailure(){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"movie-detail",code:"vue_movie_details_load_failed"});
        }
    }

    function loadVueMovieDetails(){
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

    function render(state){
        try{
            lastModel = buildViewModel(state);
        }catch(error){
            reportLoadFailure();
            renderLoadFailure();
            return;
        }
        if(vueOwner){
            vueOwner.render(lastModel);
            return;
        }
        renderLoading();
        void loadVueMovieDetails();
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Movie Details owner");
        }
        vueOwner = owner;
        if(lastModel){
            vueOwner.render(lastModel);
            if(typeof global.attachMovieDetailPageEvents === "function"){
                global.attachMovieDetailPageEvents();
            }
            if(typeof global.updateShellTitle === "function"){
                global.updateShellTitle();
            }
        }
    }

    global.TVTrackerMovieDetailsVueBridge = Object.freeze({
        attachVueOwner,
        render,
        renderLoadFailure,
        buildViewModel,
        ownership:"vue-dom"
    });
    global.renderMovieDetailPage = render;

    const currentPath = String(global.location && global.location.pathname || "");
    if(/^\/app\/movie(?:\/|$)/.test(currentPath)){
        void loadVueMovieDetails();
    }
})(window);
