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

    function text(value){
        return nodeModel().text(value);
    }

    function element(tag,attrs={},children=[]){
        return nodeModel().element(tag,attrs,children);
    }

    function separator(){
        return element("span",{class:"modal-meta-separator"},[text("•")]);
    }

    function appendGroup(target,nodes){
        const clean = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
        if(!clean.length) return;
        if(target.length) target.push(separator());
        clean.forEach(node=>target.push(node));
    }

    function linkOrText(label,href,attrs={}){
        const cleanLabel = String(label || "").trim();
        if(!cleanLabel) return null;
        return href
            ? element("a",Object.assign({href},attrs),[text(cleanLabel)])
            : element("span",attrs,[text(cleanLabel)]);
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
        const label = callString("getMediaPosterPlaceholderLabel",show,"tv") || String(show && (show.title || show.name) || "Untitled Show");
        return Object.freeze([
            factory.element("div",{class:"poster-placeholder media-title-placeholder",title:label},[
                factory.element("span",{},[factory.text(label)])
            ])
        ]);
    }

    function buildNetworkNodes(show){
        const networks = typeof global.getShowNetworkItems === "function"
            ? global.getShowNetworkItems(show)
            : [];
        if(!networks.length) return Object.freeze([]);
        const children = networks.map(network=>{
            const id = Number(network && network.id || 0);
            const label = String(network && network.name || "Network");
            const route = id > 0 && typeof global.getDiscoveryFilterDetailRoute === "function"
                ? global.getDiscoveryFilterDetailRoute("network",id,label)
                : "";
            const content = network && network.logo_path
                ? [element("span",{class:"network-logo-chip",title:label},[
                    element("img",{class:"network-logo-inline",src:imageURL(network.logo_path,"w92"),alt:label},[])
                ])]
                : [element("span",{class:route ? "v2-provider-pill" : "network-name-inline"},[text(label)])];
            if(!route) return content[0];
            return element("a",{
                class:"show-detail-entity-link show-detail-network-link",
                href:route,
                "data-discovery-type":"network",
                "data-discovery-value":id,
                "data-discovery-name":"Shows from " + label,
                "data-discovery-label":label,
                "aria-label":"Shows from " + label
            },content);
        });
        return Object.freeze([element("span",{class:"network-inline-group"},children)]);
    }

    function buildCreatorNodes(show){
        const people = Array.isArray(show && show.created_by_people) ? show.created_by_people.slice(0,3) : [];
        if(people.length){
            const children = [text("Created by ")];
            people.forEach((person,index)=>{
                if(index) children.push(element("span",{class:"show-detail-inline-separator"},[text("/")]));
                const id = Number(person && person.id || 0);
                const name = String(person && person.name || "").trim();
                const route = id > 0 && typeof global.getPersonDetailRoute === "function"
                    ? global.getPersonDetailRoute("creator",id,name)
                    : "";
                children.push(linkOrText(name,route,{class:"show-detail-entity-link show-detail-inline-link show-detail-person-link"}));
            });
            return Object.freeze([element("span",{},children.filter(Boolean))]);
        }
        const creators = (Array.isArray(show && show.created_by) ? show.created_by : [])
            .map(value=>String(value || "").trim())
            .filter(Boolean)
            .slice(0,3);
        return creators.length
            ? Object.freeze([element("span",{},[text("Created by " + creators.join(" • "))])])
            : Object.freeze([]);
    }

    function buildGenreNodes(show){
        const source = Array.isArray(show && show.genre_items) && show.genre_items.length
            ? show.genre_items
            : (Array.isArray(show && show.genres) ? show.genres : []);
        const genres = source.map(genre=>({
            id:Number(genre && typeof genre === "object" ? genre.id || 0 : 0),
            name:String(genre && typeof genre === "object" ? genre.name || "" : genre || "").trim(),
            source:genre
        })).filter(genre=>genre.name);
        if(!genres.length) return Object.freeze([]);
        const children = [];
        genres.forEach((genre,index)=>{
            if(index) children.push(element("span",{class:"show-genre-separator"},[text("•")]));
            const route = typeof global.getShowGenreRoute === "function" ? global.getShowGenreRoute(genre.source,"tv") : "";
            const usableRoute = route && route !== "/app/list/watching" ? route : "";
            const key = genre.id > 0 && typeof global.buildRouteKey === "function" ? global.buildRouteKey(genre.id,genre.name) : "";
            children.push(linkOrText(genre.name,usableRoute,usableRoute ? {
                class:"show-genre-link",
                "data-genre-key":key,
                "data-genre-name":genre.name,
                "data-genre-media":"tv",
                "data-genre-route":route
            } : {class:"show-genre-link-disabled"}));
        });
        return Object.freeze([element("span",{class:"show-genre-link-list"},children.filter(Boolean))]);
    }

    function buildMeta(show,year,rating){
        const items = [];
        if(year){
            const route = typeof global.getYearDetailRoute === "function" ? global.getYearDetailRoute(year,"tv") : "";
            appendGroup(items,[linkOrText(year,route,{class:"show-detail-entity-link show-detail-inline-link show-detail-year-link"})]);
        }
        const contentRating = String(show && show.content_rating || "").trim();
        if(contentRating) appendGroup(items,[element("span",{},[text(contentRating)])]);
        appendGroup(items,buildNetworkNodes(show));
        appendGroup(items,buildCreatorNodes(show));
        appendGroup(items,buildGenreNodes(show));
        if(rating > 0){
            appendGroup(items,[element("span",{class:"tmdb-rating-group"},[
                element("span",{class:"tmdb-rating-inline"},[text(rating.toFixed(1))]),
                element("span",{class:"tmdb-rating-slash"},[text("/")]),
                element("span",{class:"tmdb-rating-ten"},[text("10")])
            ])]);
        }
        return Object.freeze(items);
    }

    function externalLink(label,href,className){
        return element("a",{
            class:className,
            href,
            target:"_blank",
            rel:"noopener noreferrer"
        },label === "Trailer"
            ? [element("img",{class:"v2-play-icon",src:"/static/assets/icons/ui-play.svg",alt:""},[]),text(label)]
            : [text(label)]);
    }

    function buildExternalLinks(show){
        const ids = show && show._tmdb_external_ids ? show._tmdb_external_ids : {};
        const videos = Array.isArray(show && show._tmdb_videos) ? show._tmdb_videos : [];
        const trailer = videos.find(video=>String(video && video.type || "").toLowerCase() === "trailer") || videos[0] || null;
        const links = [];
        if(trailer && trailer.key) links.push(externalLink("Trailer","https://www.youtube.com/watch?v=" + trailer.key,"v2-clean-link v2-trailer-link"));
        if(ids.imdb_id) links.push(externalLink("IMDb","https://www.imdb.com/title/" + ids.imdb_id + "/","v2-clean-link v2-external-pill"));
        if(ids.tvdb_id) links.push(externalLink("TVDB","https://thetvdb.com/dereferrer/series/" + ids.tvdb_id,"v2-clean-link v2-external-pill"));
        if(show && show.tmdb_id) links.push(externalLink("TMDB","https://www.themoviedb.org/tv/" + show.tmdb_id,"v2-clean-link v2-external-pill"));
        const homepage = typeof global.safeExternalURL === "function" ? global.safeExternalURL(show && show.homepage) : "";
        if(homepage) links.push(externalLink("Official Site ↗",homepage,"v2-clean-link v2-external-pill"));
        if(!links.length) return Object.freeze([]);
        const children = [];
        links.forEach((link,index)=>{
            if(index) children.push(separator());
            children.push(link);
        });
        return Object.freeze([element("div",{class:"modal-meta modal-meta-under-status v2-show-info-links-line v2-show-action-line"},children)]);
    }

    function favoriteButton(show){
        const active = typeof global.isShowFavorite === "function" && global.isShowFavorite(show && show.tmdb_id);
        const label = active ? "Remove from favorites" : "Add to favorites";
        return element("button",{
            class:"favorite-heart-button" + (active ? " active" : ""),
            type:"button",
            "data-show-favorite-button":"true",
            "aria-pressed":active ? "true" : "false",
            "aria-label":label,
            title:label
        },[element("svg",{class:"favorite-heart-icon",viewBox:"0 0 24 24","aria-hidden":"true",focusable:"false"},[
            element("path",{d:"M12 20.4 4.35 13.2A5.25 5.25 0 0 1 11.7 5.7L12 6l.3-.3a5.25 5.25 0 0 1 7.35 7.5Z",fill:active ? "currentColor" : "none",stroke:"currentColor","stroke-width":"1.8","stroke-linecap":"round","stroke-linejoin":"round"},[])
        ])]);
    }

    function buildActions(show,tracked){
        const children = [];
        if(!tracked){
            [["watching","Add to Watching"],["plan","Add to Plan"],["finished","Add to Completed"],["dropped","Add to Dropped"]].forEach(([status,label])=>{
                children.push(element("button",{class:"modal-status-button show-page-add-status-button","data-add-status":status},[text(label)]));
            });
        }else{
            [["watching","Watching"],["plan","Plan to Watch"],["paused","Paused"],["finished","Completed"],["dropped","Dropped"]].forEach(([status,label])=>{
                if(typeof global.isStatusAllowedForShow !== "function" || global.isStatusAllowedForShow(show,status)){
                    children.push(element("button",{class:"modal-status-button" + (show.status === status ? " active" : ""),"data-status":status},[text(label)]));
                }
            });
            children.push(favoriteButton(show));
            children.push(element("button",{class:"remove-show-button",id:"remove-show-button"},[text("Remove")]));
        }
        return Object.freeze([element("div",{class:"modal-status-buttons show-page-status-buttons"},children)]);
    }

    function buildTabs(show){
        const active = typeof global.getShowDetailActiveTab === "function" ? global.getShowDetailActiveTab(show) : "Info";
        return Object.freeze([element("div",{class:"show-detail-tabs",role:"tablist","aria-label":"Show details sections"},
            ["Info","Episodes"].map(tab=>element("button",{
                type:"button",
                class:"show-detail-tab" + (active === tab ? " active" : ""),
                "data-show-detail-tab":tab,
                role:"tab",
                "aria-selected":active === tab ? "true" : "false"
            },[text(tab)]))
        )]);
    }

    function railButton(direction){
        const path = direction === "left" ? "M7.5 2 3.5 6l4 4" : "m4.5 2 4 4-4 4";
        return element("button",{type:"button",class:"v2-rail-button","data-v2-rail-scroll":direction,"aria-label":"Scroll YOU MAY ALSO LIKE " + direction},[
            element("svg",{class:"v2-rail-button-icon",viewBox:"0 0 12 12","aria-hidden":"true"},[
                element("path",{d:path,fill:"none",stroke:"currentColor","stroke-width":"1.5","stroke-linecap":"round","stroke-linejoin":"round"},[])
            ])
        ]);
    }

    function buildSimilar(show){
        const similar = Array.isArray(show && show._tmdb_similar) ? show._tmdb_similar.slice(0,10) : [];
        if(!similar.length) return Object.freeze([]);
        const cards = similar.map(item=>{
            const label = String(item && item.name || "Untitled");
            const placeholderLabel = callString("getMediaPosterPlaceholderLabel",item,"tv") || label;
            const route = typeof global.getShowDetailRoute === "function" ? global.getShowDetailRoute(item && item.id,label) : "/app/list/watching";
            const poster = item && item.poster_path
                ? element("img",{loading:"lazy",decoding:"async",src:imageURL(item.poster_path,"w500"),alt:""},[])
                : element("div",{class:"poster-placeholder media-title-placeholder v2-similar-poster-placeholder",title:placeholderLabel},[element("span",{},[text(placeholderLabel)])]);
            return element("a",{href:route,class:"v2-similar-card","data-v2-similar-open":item && item.id || "","data-v2-similar-name":label},[
                element("div",{class:"v2-similar-poster"},[poster]),
                element("div",{class:"v2-similar-title"},[text(label)])
            ]);
        });
        return Object.freeze([element("div",{class:"modal-section v2-rail-section v2-more-like-section"},[
            element("div",{class:"v2-section-title-row v2-rail-heading-row"},[
                element("h3",{class:"modal-section-heading"},[text("YOU MAY ALSO LIKE")]),
                element("div",{class:"v2-rail-controls","aria-hidden":"false"},[railButton("left"),railButton("right")])
            ]),
            element("div",{class:"v2-horizontal-rail"},cards)
        ])]);
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
        const rating = Number(show.tmdb_rating || 0);

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
            meta:buildMeta(show,year,rating),
            externalLinks:buildExternalLinks(show),
            actions:buildActions(show,tracked),
            tabs:buildTabs(show),
            tabContent:fragment("renderShowDetailTabContentHTML",show),
            similar:buildSimilar(show),
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
