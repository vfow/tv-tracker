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

    function buildPoster(movie){
        const factory = nodeModel();
        if(movie && movie.poster_path){
            const src = imageURL(movie.poster_path,"w500");
            if(src){
                return Object.freeze([
                    factory.element("img",{src,alt:String(movie.title || "Movie") + " poster"},[])
                ]);
            }
        }
        return fragment("renderPosterTitlePlaceholderHTML",movie,"movie");
    }

    function buildBackdrop(movie){
        if(movie && movie.backdrop_path){
            const background = callString("trackerBackgroundImage",movie.backdrop_path,"original");
            if(background){
                return "linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), " + background;
            }
        }
        return "linear-gradient(to top, #080808 0%, #141414 100%)";
    }

    function separatorNode(){
        const factory = nodeModel();
        return factory.element("span",{class:"modal-meta-separator"},[factory.text("•")]);
    }

    function ratingNodes(rating){
        const factory = nodeModel();
        if(!(rating > 0)){
            return Object.freeze([factory.element("span",{},[factory.text("Unknown")])]);
        }
        return Object.freeze([
            factory.element("span",{class:"tmdb-rating-group"},[
                factory.element("span",{class:"tmdb-rating-inline"},[factory.text(rating.toFixed(1))]),
                factory.element("span",{class:"tmdb-rating-slash"},[factory.text("/")]),
                factory.element("span",{class:"tmdb-rating-ten"},[factory.text("10")])
            ])
        ]);
    }

    function buildMeta(movie){
        const factory = nodeModel();
        const items = [];
        const add = function(nodes){
            const clean = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
            if(!clean.length) return;
            if(items.length) items.push(separatorNode());
            clean.forEach(node=>items.push(node));
        };
        const unknown = ()=>Object.freeze([factory.element("span",{},[factory.text("Unknown")])]);
        const certification = typeof global.getMovieCertification === "function"
            ? String(global.getMovieCertification(movie) || "")
            : "";
        const rating = Number(movie && movie.vote_average || 0);

        add(movie && movie.year ? fragment("renderYearLinkHTML",movie.year,"movie") : unknown());
        add(certification ? fragment("renderCertificationLinkHTML","movie",certification) : unknown());
        add(movie && movie.runtime ? fragment("renderRuntimeDetailLinkHTML",movie.runtime,"movie") : unknown());

        const directedBy = fragment("renderMovieDirectedByHTML",movie);
        if(directedBy.length) add(directedBy);
        const genres = fragment("renderMovieGenresHTML",movie);
        if(genres.length) add(genres);
        const adult = fragment("renderAdultMovieBadgeHTML",movie,"movie");
        if(adult.length) add(adult);
        add(ratingNodes(rating));

        return Object.freeze(items);
    }

    function buildViewModel(state){
        const pageState = state && typeof state === "object" ? state : currentState();
        const movie = pageState.movie && typeof pageState.movie === "object" ? pageState.movie : null;
        const factory = nodeModel();

        if(!movie){
            return factory.freeze({
                surface:"movie",
                state:pageState.loading ? "loading" : "error",
                title:"",
                message:String(pageState.error || "Getting details."),
                backdropStyle:"",
                poster:Object.freeze([]),
                meta:Object.freeze([]),
                externalLinks:Object.freeze([]),
                actions:Object.freeze([]),
                tabs:Object.freeze([]),
                tabContent:Object.freeze([])
            });
        }

        return factory.freeze({
            surface:"movie",
            state:"ready",
            title:String(movie.title || "Untitled"),
            message:"",
            backdropStyle:buildBackdrop(movie),
            poster:buildPoster(movie),
            meta:buildMeta(movie),
            externalLinks:fragment("renderMovieExternalLinksHTML",movie),
            actions:fragment("renderMovieActionButtonsHTML",movie),
            tabs:fragment("renderMovieTabsHTML"),
            tabContent:fragment("renderMovieActiveTabContentHTML",movie)
        });
    }

    function attachInteractions(){
        if(typeof global.attachMovieDetailPageEvents === "function"){
            global.attachMovieDetailPageEvents();
        }
        if(typeof global.updateShellTitle === "function"){
            global.updateShellTitle();
        }
    }

    function replaceWithStatus(title,message,failed){
        const root = movieRoot();
        if(!root || !global.document || typeof global.document.createElement !== "function") return;
        root.replaceChildren();
        const shell = global.document.createElement("div");
        shell.className = "show-detail-page-inner";
        if(failed){
            shell.dataset.tvtrackerMovieDetailsVueLoadFailed = "true";
            shell.setAttribute("role","alert");
        }
        const back = global.document.createElement("button");
        back.type = "button";
        back.className = "show-page-back-button";
        back.id = "movie-page-back-button";
        back.setAttribute("aria-label","Back");
        const icon = global.document.createElement("img");
        icon.src = "/static/assets/icons/arrow-narrow-left.svg";
        icon.alt = "";
        back.appendChild(icon);
        const status = global.document.createElement("div");
        status.className = "empty-state show-detail-loading-state";
        const heading = global.document.createElement("h2");
        heading.textContent = title;
        const detail = global.document.createElement("p");
        detail.textContent = message;
        status.append(heading,detail);
        shell.append(back,status);
        root.appendChild(shell);
    }

    function renderLoading(){
        replaceWithStatus("Loading movie","Getting details.",false);
    }

    function renderLoadFailure(){
        if(vueOwner){ return; }
        replaceWithStatus("Movie details unavailable","Reload the page to try again.",true);
        attachInteractions();
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
            attachInteractions();
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
            attachInteractions();
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
