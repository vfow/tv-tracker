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

    function nodeModel(){
        const model = global.TVTrackerMediaDetailsNodeModel;
        if(!model || model.ownership !== "typed-node-model" || typeof model.fragment !== "function"){
            throw new Error("Media Details typed node model unavailable");
        }
        return model;
    }

    function callString(name,...args){
        const fn = global[name];
        return typeof fn === "function" ? String(fn(...args) || "") : "";
    }

    function fragment(name,...args){
        const factory = nodeModel();
        const fn = global[name];
        return typeof fn === "function" ? factory.fragment(fn(...args)) : Object.freeze([]);
    }

    function imageURL(path,size){
        return callString("trackerImageURL",path,size);
    }

    function isTracked(show){
        const shows = global.DATA && global.DATA.shows && typeof global.DATA.shows === "object"
            ? global.DATA.shows
            : {};
        return !!(show && shows[String(show.tmdb_id)]);
    }

    function buildPoster(show){
        const factory = nodeModel();
        if(show && show.poster_path){
            const src = imageURL(show.poster_path,"w500");
            if(src){
                return Object.freeze([
                    factory.element("img",{src,alt:String(show.title || "Show") + " poster"},[])
                ]);
            }
        }
        return fragment("renderPosterTitlePlaceholderHTML",show,"tv");
    }

    function buildBackdrop(show){
        if(show && show.backdrop_path){
            const background = callString("trackerBackgroundImage",show.backdrop_path,"original");
            if(background){
                return "linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), " + background;
            }
        }
        return "linear-gradient(to top, #080808 0%, #141414 100%)";
    }

    function buildViewModel(show,options){
        if(!show || typeof show !== "object"){
            throw new TypeError("Show Details requires a show");
        }
        const factory = nodeModel();
        const showId = String(show.tmdb_id || show.id || "");
        const tracked = isTracked(show);
        const year = show.first_air_date ? String(show.first_air_date).slice(0,4) : "Unknown";
        const genres = Array.isArray(show.genres) && show.genres.length ? show.genres.join(" • ") : "";
        const rating = Number(show.tmdb_rating || 0);
        const ratingHTML = rating > 0
            ? '<span class="modal-meta-separator">•</span><span class="tmdb-rating-group"><span class="tmdb-rating-inline">' + rating.toFixed(1) + '</span><span class="tmdb-rating-slash">/</span><span class="tmdb-rating-ten">10</span></span>'
            : "";

        global.selectedShowId = showId;
        if(global.activeShowDetailsTabs && typeof global.activeShowDetailsTabs === "object" && typeof global.getShowDetailActiveTab === "function"){
            global.activeShowDetailsTabs[showId] = global.getShowDetailActiveTab(show);
        }

        return factory.freeze({
            surface:"show",
            showId,
            title:String(show.title || show.name || "Untitled"),
            backdropStyle:buildBackdrop(show),
            poster:buildPoster(show),
            meta:fragment("getShowMetaHTML",show,year,genres,ratingHTML),
            externalLinks:fragment("renderV2ShowInfoLinksLineHTML",show),
            actions:fragment("renderShowDetailActionControlsHTML",show,tracked),
            tabs:fragment("renderShowDetailTabsHTML",show),
            tabContent:fragment("renderShowDetailTabContentHTML",show),
            similar:fragment("renderV2SimilarShowsHTML",show),
            preview:!!(options && options.preview)
        });
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

    function replaceWithStatus(title,message,failed){
        const root = showRoot();
        if(!root || !global.document || typeof global.document.createElement !== "function") return;
        root.replaceChildren();
        const shell = global.document.createElement("div");
        shell.className = "show-detail-page-inner";
        if(failed){
            shell.dataset.tvtrackerShowDetailsVueLoadFailed = "true";
            shell.setAttribute("role","alert");
        }
        const back = global.document.createElement("button");
        back.type = "button";
        back.className = "show-page-back-button";
        back.id = "show-page-back-button";
        back.setAttribute("aria-label","Back");
        const icon = global.document.createElement("img");
        icon.src = "/static/assets/icons/arrow-narrow-left.svg";
        icon.alt = "";
        back.appendChild(icon);
        const state = global.document.createElement("div");
        state.className = "empty-state show-detail-loading-state";
        const heading = global.document.createElement("h2");
        heading.textContent = title;
        const detail = global.document.createElement("p");
        detail.textContent = message;
        state.append(heading,detail);
        shell.append(back,state);
        root.appendChild(shell);
    }

    function renderLoading(){
        replaceWithStatus("Loading show","Getting details.",false);
    }

    function renderLoadFailure(){
        if(vueOwner){ return; }
        replaceWithStatus("Show details unavailable","Reload the page to try again.",true);
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
