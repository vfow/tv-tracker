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
        if(
            !model ||
            model.ownership !== "typed-node-model" ||
            typeof model.text !== "function" ||
            typeof model.element !== "function" ||
            typeof model.freeze !== "function"
        ){
            throw new Error("Media Details typed node model unavailable");
        }
        return model;
    }

    function text(value){
        return nodeModel().text(value);
    }

    function element(tag,attrs={},children=[]){
        return nodeModel().element(tag,attrs,children);
    }

    function buildTabContent(movie){
        const owner = global.TVTrackerMovieDetailsNativePanels;
        if(!owner || owner.ownership !== "typed-node-panels" || typeof owner.build !== "function"){
            throw new Error("Movie Details typed panel owner unavailable");
        }
        const nodes = owner.build(movie);
        return Array.isArray(nodes) ? nodes : Object.freeze([]);
    }

    function imageURL(path,size){
        return typeof global.trackerImageURL === "function"
            ? String(global.trackerImageURL(path,size) || "")
            : "";
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
        const label = (typeof global.getMediaPosterPlaceholderLabel === "function"
            ? String(global.getMediaPosterPlaceholderLabel(movie,"movie") || "")
            : "") || String(movie && (movie.title || movie.name || movie.original_title) || "Untitled Movie");
        return Object.freeze([
            factory.element("div",{class:"poster-placeholder media-title-placeholder",title:label},[
                factory.element("span",{},[factory.text(label)])
            ])
        ]);
    }

    function buildBackdrop(movie){
        if(movie && movie.backdrop_path){
            const background = typeof global.trackerBackgroundImage === "function"
                ? String(global.trackerBackgroundImage(movie.backdrop_path,"original") || "")
                : "";
            if(background){
                return "linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), " + background;
            }
        }
        return "linear-gradient(to top, #080808 0%, #141414 100%)";
    }

    function separatorNode(){
        return element("span",{class:"modal-meta-separator"},[text("•")]);
    }

    function appendGroup(target,nodes){
        const clean = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
        if(!clean.length) return;
        if(target.length) target.push(separatorNode());
        clean.forEach(node=>target.push(node));
    }

    function linkOrText(label,href,extraClass=""){
        const cleanLabel = String(label || "").trim();
        if(!cleanLabel) return null;
        return href
            ? element("a",{class:"show-detail-entity-link show-detail-inline-link " + extraClass,href},[text(cleanLabel)])
            : element("span",{},[text(cleanLabel)]);
    }

    function unknownNodes(){
        return Object.freeze([element("span",{},[text("Unknown")])]);
    }

    function getCertification(movie){
        const results = movie && movie.release_dates && Array.isArray(movie.release_dates.results)
            ? movie.release_dates.results
            : [];
        const us = results.find(item=>String(item && item.iso_3166_1 || "").toUpperCase() === "US");
        const release = us && Array.isArray(us.release_dates)
            ? us.release_dates.find(item=>String(item && item.certification || "").trim())
            : null;
        return release ? String(release.certification || "").trim() : "";
    }

    function buildYearNodes(movie){
        const year = String(movie && movie.year || "").trim();
        if(!year) return unknownNodes();
        const route = typeof global.getYearDetailRoute === "function" ? global.getYearDetailRoute(year,"movie") : "";
        return Object.freeze([linkOrText(year,route,"show-detail-year-link")]);
    }

    function buildCertificationNodes(movie){
        const certification = getCertification(movie);
        if(!certification) return unknownNodes();
        const route = typeof global.getCertificationDetailRoute === "function"
            ? global.getCertificationDetailRoute("movie",certification)
            : "";
        return Object.freeze([linkOrText(certification,route,"show-detail-certification-link")]);
    }

    function buildRuntimeNodes(movie){
        const runtime = Number(movie && movie.runtime || 0);
        const minutes = Math.round(runtime);
        if(!Number.isFinite(minutes) || minutes <= 0) return unknownNodes();
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        const label = !hours ? minutes + "m" : (remainder ? hours + "h " + remainder + "m" : hours + "h");
        const route = typeof global.getRuntimeBrowseRoute === "function" ? global.getRuntimeBrowseRoute(movie.runtime,"movie") : "";
        return Object.freeze([route
            ? element("a",{class:"show-detail-entity-link show-runtime-link",href:route,title:"Browse titles by runtime"},[text(label)])
            : text(label)
        ]);
    }

    function buildDirectorNodes(movie){
        const seen = new Set();
        const directors = (Array.isArray(movie && movie.crew) ? movie.crew : [])
            .filter(person=>String(person && person.job || "").toLowerCase() === "director")
            .filter(person=>{
                const key = String(person && (person.id || person.name) || "");
                if(!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        if(!directors.length) return Object.freeze([]);
        const children = [text("Directed by ")];
        directors.forEach((person,index)=>{
            if(index) children.push(element("span",{class:"show-detail-comma-separator"},[text(", ")]));
            const id = Number(person && person.id || 0);
            const name = String(person && person.name || "Unknown").trim();
            const route = id > 0 && typeof global.getPersonDetailRoute === "function"
                ? global.getPersonDetailRoute("director",id,name,"movie")
                : "";
            const link = linkOrText(name,route,"show-detail-person-link");
            if(link) children.push(link);
        });
        return children.length > 1 ? Object.freeze([element("span",{},children)]) : Object.freeze([]);
    }

    function buildGenreNodes(movie){
        const genres = (Array.isArray(movie && movie.genres) ? movie.genres : [])
            .map(genre=>({
                id:Number(genre && typeof genre === "object" ? genre.id || 0 : 0),
                name:String(genre && typeof genre === "object" ? genre.name || "" : genre || "").trim()
            }))
            .filter(genre=>genre.name);
        if(!genres.length) return Object.freeze([]);
        const children = [];
        genres.forEach((genre,index)=>{
            if(index) children.push(element("span",{class:"show-genre-separator"},[text("•")]));
            const route = typeof global.getShowGenreRoute === "function" ? global.getShowGenreRoute(genre,"movie") : "";
            const usableRoute = route && route !== "/app/list/watching" ? route : "";
            const key = genre.id > 0 && typeof global.buildRouteKey === "function" ? global.buildRouteKey(genre.id,genre.name) : "";
            children.push(usableRoute
                ? element("a",{
                    class:"show-genre-link",
                    href:route,
                    "data-genre-key":key,
                    "data-genre-name":genre.name,
                    "data-genre-media":"movie",
                    "data-genre-route":route
                },[text(genre.name)])
                : element("span",{class:"show-genre-link-disabled"},[text(genre.name)]));
        });
        return Object.freeze([element("span",{class:"show-genre-link-list"},children)]);
    }

    function buildAdultNodes(movie){
        return movie && movie.adult === true
            ? Object.freeze([element("span",{class:"adult-movie-badge"},[text("ADULT")])])
            : Object.freeze([]);
    }

    function ratingNodes(rating){
        if(!(rating > 0)){
            return unknownNodes();
        }
        return Object.freeze([
            element("span",{class:"tmdb-rating-group"},[
                element("span",{class:"tmdb-rating-inline"},[text(rating.toFixed(1))]),
                element("span",{class:"tmdb-rating-slash"},[text("/")]),
                element("span",{class:"tmdb-rating-ten"},[text("10")])
            ])
        ]);
    }

    function buildMeta(movie){
        const items = [];
        const rating = Number(movie && movie.vote_average || 0);

        appendGroup(items,buildYearNodes(movie));
        appendGroup(items,buildCertificationNodes(movie));
        appendGroup(items,buildRuntimeNodes(movie));
        appendGroup(items,buildDirectorNodes(movie));
        appendGroup(items,buildGenreNodes(movie));
        appendGroup(items,buildAdultNodes(movie));
        appendGroup(items,ratingNodes(rating));

        return Object.freeze(items);
    }

    function externalLink(label,href,className){
        return element("a",{class:className,href,target:"_blank",rel:"noopener noreferrer"},label === "Trailer"
            ? [element("img",{class:"v2-play-icon",src:"/static/assets/icons/ui-play.svg",alt:""},[]),text(label)]
            : [text(label)]);
    }

    function buildExternalLinks(movie){
        const ids = movie && movie.external_ids ? movie.external_ids : {};
        const videos = movie && movie.videos && Array.isArray(movie.videos.results) ? movie.videos.results : [];
        const trailer = videos.find(video=>
            String(video && video.site || "").toLowerCase() === "youtube" &&
            String(video && video.type || "").toLowerCase().includes("trailer")
        );
        const homepage = typeof global.safeExternalURL === "function" ? global.safeExternalURL(movie && movie.homepage) : "";
        const links = [];
        if(trailer && trailer.key) links.push(externalLink("Trailer","https://www.youtube.com/watch?v=" + trailer.key,"v2-clean-link v2-trailer-link"));
        if(ids.imdb_id) links.push(externalLink("IMDb","https://www.imdb.com/title/" + ids.imdb_id + "/","v2-clean-link v2-external-pill"));
        if(movie && movie.id) links.push(externalLink("TMDB","https://www.themoviedb.org/movie/" + movie.id,"v2-clean-link v2-external-pill"));
        if(homepage) links.push(externalLink("Official Site \u2197",homepage,"v2-clean-link v2-external-pill"));
        if(!links.length) return Object.freeze([]);
        const children = [];
        links.forEach((link,index)=>{
            if(index) children.push(separatorNode());
            children.push(link);
        });
        return Object.freeze([element("div",{class:"modal-meta modal-meta-under-status v2-show-info-links-line v2-show-action-line"},children)]);
    }

    function trackingButton(state,action,label){
        const active = !!state[action];
        return element("button",{
            class:"modal-status-button movie-page-status-button" + (active ? " active" : ""),
            type:"button",
            "data-movie-tracking-action":action,
            "aria-pressed":active ? "true" : "false"
        },[text(label)]);
    }

    function favoriteButton(active){
        const label = active ? "Remove from favorites" : "Add to favorites";
        return element("button",{
            class:"favorite-heart-button" + (active ? " active" : ""),
            type:"button",
            "data-movie-tracking-action":"favorite",
            "aria-pressed":active ? "true" : "false",
            "aria-label":label,
            title:label
        },[element("svg",{class:"favorite-heart-icon",viewBox:"0 0 24 24","aria-hidden":"true",focusable:"false"},[
            element("path",{d:"M12 20.4 4.35 13.2A5.25 5.25 0 0 1 11.7 5.7L12 6l.3-.3a5.25 5.25 0 0 1 7.35 7.5Z",fill:active ? "currentColor" : "none",stroke:"currentColor","stroke-width":"1.8","stroke-linecap":"round","stroke-linejoin":"round"},[])
        ])]);
    }

    function buildActions(movie){
        const rawState = typeof global.getMovieTrackingState === "function"
            ? global.getMovieTrackingState(movie && movie.id)
            : null;
        const state = {
            watched:!!(rawState && rawState.watched),
            plan:!!(rawState && rawState.plan),
            favorite:!!(rawState && rawState.favorite)
        };
        const children = [
            trackingButton(state,"watched","Watched"),
            trackingButton(state,"plan","Plan to Watch"),
            favoriteButton(state.favorite)
        ];
        if(state.watched || state.plan || state.favorite){
            children.push(element("button",{
                class:"remove-show-button remove-movie-button",
                type:"button",
                "data-movie-tracking-action":"remove"
            },[text("Remove")]));
        }
        return Object.freeze([element("div",{
            class:"modal-status-buttons show-page-status-buttons movie-page-status-buttons",
            "aria-label":"Movie tracking actions"
        },children)]);
    }

    function buildTabs(){
        const requested = String(global.activeMovieDetailsTab || "Info");
        const tabs = ["Info","Cast","Crew","Details","Genres","Releases"];
        const active = tabs.includes(requested) ? requested : "Info";
        return Object.freeze([element("div",{
            class:"show-detail-tabs movie-detail-tabs",
            role:"tablist",
            "aria-label":"Movie details sections"
        },tabs.map(tab=>element("button",{
            type:"button",
            class:"show-detail-tab" + (active === tab ? " active" : ""),
            "data-movie-detail-tab":tab,
            role:"tab",
            "aria-selected":active === tab ? "true" : "false"
        },[text(tab)])))]);
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
            externalLinks:buildExternalLinks(movie),
            actions:buildActions(movie),
            tabs:buildTabs(),
            tabContent:buildTabContent(movie)
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
