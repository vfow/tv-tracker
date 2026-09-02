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

    function callString(name,...args){
        const fn = global[name];
        return typeof fn === "function" ? String(fn(...args) || "") : "";
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

    function emptyState(message){
        return element("div",{class:"v2-api-empty"},[text(message)]);
    }

    function getInfoActiveTab(show){
        const showId = String(show && show.tmdb_id || global.selectedShowId || "");
        const tabs = global.activeShowInfoTabs && typeof global.activeShowInfoTabs === "object"
            ? global.activeShowInfoTabs
            : {};
        const active = tabs[showId] || "Cast";
        return ["Cast","Crew","Details","Genres","Releases"].includes(active) ? active : "Cast";
    }

    function buildInfoSubTabs(show){
        const active = getInfoActiveTab(show);
        return element("div",{class:"show-info-subtabs",role:"tablist","aria-label":"Show info sections"},
            ["Cast","Crew","Details","Genres","Releases"].map(tab=>element("button",{
                type:"button",
                class:"show-info-subtab" + (active === tab ? " active" : ""),
                "data-show-info-tab":tab,
                role:"tab",
                "aria-selected":active === tab ? "true" : "false"
            },[text(tab)]))
        );
    }

    function personPlaceholder(){
        return element("div",{class:"v2-actor-placeholder person-silhouette-placeholder","aria-hidden":"true"},[
            element("svg",{viewBox:"0 0 64 64",focusable:"false",role:"img"},[
                element("path",{class:"person-silhouette-head",d:"M32 30c7.18 0 13-5.82 13-13S39.18 4 32 4 19 9.82 19 17s5.82 13 13 13Z"},[]),
                element("path",{class:"person-silhouette-body",d:"M10 60c1.8-13.05 10.4-22 22-22s20.2 8.95 22 22H10Z"},[])
            ])
        ]);
    }

    function personPhoto(person){
        return person && person.profile_path
            ? element("img",{loading:"lazy",decoding:"async",src:imageURL(person.profile_path,"w185"),alt:""},[])
            : personPlaceholder();
    }

    function personRow(person,role,roleText,fallbackName="Unknown"){
        const personId = Number(person && person.id || 0);
        const personName = String(person && person.name || fallbackName);
        const cleanRole = String(role || "").trim();
        const route = cleanRole && personId > 0 && typeof global.getPersonDetailRoute === "function"
            ? global.getPersonDetailRoute(cleanRole,personId,personName,"tv")
            : "";
        const children = [
            element("div",{class:"v2-actor-list-photo"},[personPhoto(person)]),
            element("div",{class:"v2-actor-list-text"},[
                element("div",{class:"v2-actor-name"},[text(personName)]),
                element("div",{class:"v2-actor-role"},[text(roleText)])
            ])
        ];
        return route
            ? element("a",{
                class:"v2-actor-list-row v2-person-card-link",
                href:route,
                "data-person-role":cleanRole,
                "data-person-media":"tv",
                "data-person-id":personId,
                "data-person-name":personName
            },children)
            : element("div",{class:"v2-actor-list-row"},children);
    }

    function buildCast(show){
        const cast = Array.isArray(show && show._tmdb_cast) ? show._tmdb_cast : [];
        if(!cast.length) return Object.freeze([emptyState("No cast details available yet.")]);
        const rows = cast.map(person=>personRow(person,"acting",String(person && person.character || "Unknown Role"),"Unknown Actor"));
        return Object.freeze([element("div",{class:"v2-actor-list show-info-actor-list"},rows)]);
    }

    function crewRouteRole(person,fallbackRole){
        if(typeof global.getCrewRouteRole === "function"){
            return global.getCrewRouteRole(person,fallbackRole);
        }
        return String(person && person.job || fallbackRole || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g,"-")
            .replace(/^-+|-+$/g,"");
    }

    function buildCrew(show){
        const source = show && show._tmdb_crew ? show._tmdb_crew : [];
        const groups = typeof global.collectCrewJobGroups === "function" ? global.collectCrewJobGroups(source) : [];
        if(!groups.length) return Object.freeze([emptyState("No crew details available yet.")]);
        const groupNodes = groups.map(group=>{
            const people = Array.isArray(group && group.people) ? group.people : [];
            const rows = people.map(person=>{
                const role = crewRouteRole(person,group && group.jobKey);
                const job = String(person && person.job || "Crew");
                const episodeCount = Number(person && person.episode_count || 0);
                return personRow(person,role,job + (episodeCount ? " • " + episodeCount + " episodes" : ""));
            });
            return element("div",{class:"show-detail-crew-group movie-crew-department-group crew-job-group"},[
                element("h3",{class:"modal-section-heading movie-crew-department-heading crew-job-heading"},[text(group && group.label || "Crew")]),
                element("div",{class:"v2-actor-list movie-crew-list"},rows)
            ]);
        });
        return Object.freeze([element("div",{class:"movie-crew-department-list crew-job-group-list"},groupNodes)]);
    }

    function discoveryEntity(label,type,value,options={}){
        const cleanLabel = String(label || "").trim();
        if(!cleanLabel) return null;
        const routeLabel = String(options.routeLabel || cleanLabel).trim();
        const media = options.media === "movie" ? "movie" : "tv";
        const route = typeof global.getDiscoveryFilterDetailRoute === "function"
            ? global.getDiscoveryFilterDetailRoute(type,value,routeLabel,media)
            : "";
        if(!route || route === "/app/list/watching") return element("span",{},[text(cleanLabel)]);
        return element("a",{
            class:String(options.className || "show-detail-entity-link"),
            href:route,
            "data-discovery-type":type,
            "data-discovery-value":value,
            "data-discovery-media":media,
            "data-discovery-name":String(options.name || cleanLabel).trim(),
            "data-discovery-label":routeLabel
        },[text(cleanLabel)]);
    }

    function inlineList(items){
        const children = [];
        items.filter(Boolean).forEach((item,index)=>{
            if(index) children.push(element("span",{class:"show-detail-inline-separator"},[text("/")]));
            children.push(item);
        });
        return element("span",{class:"show-detail-inline-link-list"},children);
    }

    function buildNetworkDetails(show){
        const networks = typeof global.getShowNetworkItems === "function" ? global.getShowNetworkItems(show) : [];
        if(!networks.length) return Object.freeze([text("Unknown")]);
        const items = networks.map(network=>{
            const id = Number(network && network.id || 0);
            const label = String(network && network.name || "Network").trim() || "Network";
            const inner = network && network.logo_path
                ? element("span",{class:"network-logo-chip",title:label},[
                    element("img",{class:"network-logo-inline",src:imageURL(network.logo_path,"w92"),alt:label},[])
                ])
                : element("span",{class:"v2-provider-pill"},[text(label)]);
            if(id <= 0) return inner;
            const route = typeof global.getDiscoveryFilterDetailRoute === "function"
                ? global.getDiscoveryFilterDetailRoute("network",id,label)
                : "";
            return element("a",{
                class:"show-detail-entity-link show-detail-network-link",
                href:route,
                "data-discovery-type":"network",
                "data-discovery-value":id,
                "data-discovery-name":"Shows from " + label,
                "data-discovery-label":label,
                "aria-label":"Shows from " + label
            },[inner]);
        });
        return Object.freeze([element("div",{class:"v2-provider-list"},items)]);
    }

    function buildLanguageDetails(show){
        const languages = typeof global.getShowLanguageItems === "function" ? global.getShowLanguageItems(show) : [];
        if(!languages.length) return Object.freeze([text("Unknown")]);
        const original = String(show && show.original_language || "").trim().toLowerCase();
        const items = languages.map(language=>{
            const code = String(language && language.code || "");
            const label = String(language && language.label || (typeof global.getLanguageName === "function" ? global.getLanguageName(code) : code));
            return code && code === original
                ? discoveryEntity(label,"language",code,{name:label + " TV Shows",media:"tv"})
                : element("span",{},[text(label)]);
        });
        return Object.freeze([inlineList(items)]);
    }

    function buildCountryDetails(show){
        const seen = new Set();
        const countries = (Array.isArray(show && show.origin_country) ? show.origin_country : [])
            .map(code=>String(code || "").trim().toLowerCase())
            .filter(code=>code && !seen.has(code) && seen.add(code));
        if(!countries.length) return Object.freeze([text("Unknown")]);
        const items = countries.map(code=>{
            const label = typeof global.getCountryLabel === "function" ? global.getCountryLabel(code) : code.toUpperCase();
            const countryName = typeof global.getCountryName === "function" ? global.getCountryName(code) : code.toUpperCase();
            return discoveryEntity(label,"country",code,{name:"TV Shows from " + countryName});
        });
        return Object.freeze([inlineList(items)]);
    }

    function buildCompanyDetails(show){
        const companies = Array.isArray(show && show._tmdb_production_companies) ? show._tmdb_production_companies : [];
        const items = companies.map(company=>{
            const id = Number(company && company.id || 0);
            const name = String(company && company.name || "").trim();
            const logoPath = String(company && company.logo_path || "").trim();
            if(!name) return null;
            const route = id > 0 && typeof global.getCompanyDetailRoute === "function" ? global.getCompanyDetailRoute(id,name,"tv") : "";
            const className = "movie-company-logo-link" + (logoPath ? "" : " movie-company-logo-link-name");
            const inner = logoPath
                ? element("img",{class:"movie-company-logo",src:imageURL(logoPath,"w154"),alt:name},[])
                : element("span",{class:"movie-company-name-fallback"},[text(name)]);
            return route
                ? element("a",{href:route,class:className,title:name,"aria-label":name},[inner])
                : element("span",{class:className,title:name,"aria-label":name},[inner]);
        }).filter(Boolean);
        return items.length
            ? Object.freeze([element("span",{class:"movie-company-logo-list"},items)])
            : Object.freeze([text("Unknown")]);
    }

    function buildAlternativeTitles(show){
        const titles = Array.isArray(show && show._tmdb_alternative_titles) ? show._tmdb_alternative_titles : [];
        const filters = typeof global.getShowDetailFilters === "function"
            ? global.getShowDetailFilters()
            : {hiddenAlternativeTitleCountries:[],hiddenAlternativeTitleNames:[]};
        const hiddenCountries = Array.isArray(filters.hiddenAlternativeTitleCountries) ? filters.hiddenAlternativeTitleCountries : [];
        const hiddenNames = Array.isArray(filters.hiddenAlternativeTitleNames) ? filters.hiddenAlternativeTitleNames : [];
        const grouped = new Map();
        titles.filter(item=>{
            if(!item || !item.title) return false;
            if(hiddenNames.includes(String(item.title).trim().toLowerCase())) return false;
            return !(typeof global.alternativeTitleCountryMatchesFilter === "function" && global.alternativeTitleCountryMatchesFilter(item,hiddenCountries));
        }).slice(0,12).forEach(item=>{
            const country = item.iso_3166_1 && typeof global.getCountryLabel === "function"
                ? global.getCountryLabel(item.iso_3166_1)
                : "Other";
            const key = country || "Other";
            if(!grouped.has(key)) grouped.set(key,[]);
            const title = String(item.title || "").trim();
            if(title && !grouped.get(key).includes(title)) grouped.get(key).push(title);
        });
        if(!grouped.size) return Object.freeze([text("Unknown")]);
        const groups = Array.from(grouped.entries()).map(([country,countryTitles])=>element("div",{class:"v2-provider-group"},[
            element("div",{class:"v2-provider-group-title"},[text(country)]),
            element("div",{class:"show-detail-release-meta"},countryTitles.map(title=>element("span",{},[text(title)])))
        ]));
        return Object.freeze([element("div",{class:"show-release-provider-stack"},groups)]);
    }

    function inlineRoute(label,route,className){
        const cleanLabel = String(label || "").trim();
        return route
            ? element("a",{class:"show-detail-entity-link show-detail-inline-link " + className,href:route},[text(cleanLabel)])
            : element("span",{},[text(cleanLabel)]);
    }

    function statusDetails(show){
        const label = String(show && (show.tmdb_status || show.status) || "Unknown").trim() || "Unknown";
        const slugMap = {"returning series":"returning-series","ended":"ended","canceled":"canceled","cancelled":"canceled","in production":"in-production"};
        const slug = slugMap[label.toLowerCase()] || "";
        const route = slug && typeof global.getStatusDetailRoute === "function" ? global.getStatusDetailRoute(slug) : "";
        return Object.freeze([inlineRoute(label,route,"show-detail-status-link")]);
    }

    function runtimeDetails(show){
        const runtimes = Array.isArray(show && show.episode_run_time) ? show.episode_run_time : [];
        const runtime = runtimes.map(value=>Number(value || 0)).find(value=>Number.isFinite(value) && value > 0) || 0;
        if(!runtime) return null;
        const minutes = Math.round(runtime);
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        const label = !hours ? minutes + "m" : (remainder ? hours + "h " + remainder + "m" : hours + "h");
        const route = typeof global.getRuntimeBrowseRoute === "function" ? global.getRuntimeBrowseRoute(runtime,"tv") : "";
        return Object.freeze([route
            ? element("a",{class:"show-detail-entity-link show-runtime-link",href:route,title:"Browse titles by runtime"},[text(label)])
            : text(label)
        ]);
    }

    function factRow(label,valueNodes){
        return element("div",{class:"show-detail-fact-row"},[
            element("div",{class:"episode-detail-label"},[text(label)]),
            element("div",{class:"episode-detail-value"},valueNodes)
        ]);
    }

    function buildDetails(show){
        const rows = [factRow("Status",statusDetails(show))];
        const runtime = runtimeDetails(show);
        if(runtime) rows.push(factRow("Runtime",runtime));
        rows.push(
            factRow("Networks",buildNetworkDetails(show)),
            factRow("Language",buildLanguageDetails(show)),
            factRow("Country",buildCountryDetails(show)),
            factRow("Certification",[text(String(show && show.content_rating || "").trim() || "Unknown")]),
            factRow("Production Companies",buildCompanyDetails(show)),
            factRow("Alternative Titles",buildAlternativeTitles(show))
        );
        return Object.freeze([element("div",{class:"show-detail-fact-list"},rows)]);
    }

    function buildGenres(show){
        const genres = Array.isArray(show && show.genre_items) && show.genre_items.length
            ? show.genre_items
            : (Array.isArray(show && show.genres) ? show.genres : []);
        const genreContent = genres.length
            ? element("div",{class:"show-detail-genre-chips"},genres.map(genre=>{
                const name = String(genre && typeof genre === "object" ? genre.name : genre || "").trim();
                const route = typeof global.getShowGenreRoute === "function" ? global.getShowGenreRoute(genre,"tv") : "";
                const id = Number(genre && typeof genre === "object" ? genre.id || 0 : 0);
                const key = id > 0 && typeof global.buildRouteKey === "function" ? global.buildRouteKey(id,name) : "";
                return route && route !== "/app/list/watching"
                    ? element("a",{href:route,class:"show-detail-genre-chip show-genre-link","data-genre-key":key,"data-genre-name":name,"data-genre-media":"tv","data-genre-route":route},[text(name)])
                    : element("span",{},[text(name)]);
            }))
            : emptyState("No genres available.");
        const sections = [element("section",{class:"show-genres-tab-section"},[
            element("h3",{class:"modal-section-heading show-genres-tab-heading"},[text("Genres")]),
            genreContent
        ])];
        const themes = typeof global.normalizeThemeItems === "function" ? global.normalizeThemeItems(show) : [];
        if(themes.length){
            const themeNodes = themes.map(theme=>{
                const id = Number(theme && theme.id || 0);
                const name = String(theme && theme.name || "").trim();
                if(id <= 0) return element("span",{class:"show-detail-theme-chip"},[text(name)]);
                const route = typeof global.getDiscoveryFilterDetailRoute === "function"
                    ? global.getDiscoveryFilterDetailRoute("theme",id,name,"tv")
                    : "";
                return element("a",{
                    class:"show-detail-theme-chip show-detail-theme-link",
                    href:route,
                    "data-discovery-type":"theme",
                    "data-discovery-value":id,
                    "data-discovery-media":"tv",
                    "data-discovery-name":"Shows about " + name,
                    "data-discovery-label":name
                },[text(name)]);
            });
            sections.push(element("section",{class:"show-genres-tab-section"},[
                element("h3",{class:"modal-section-heading show-genres-tab-heading"},[text("Themes")]),
                element("div",{class:"show-detail-theme-list show-detail-theme-list-expanded"},themeNodes)
            ]));
        }
        return Object.freeze([element("div",{class:"show-genres-tab-stack"},sections)]);
    }

    function providerWatchLink(provider,providerRegion){
        const raw = provider && (provider.link || provider.url || provider.watch_url || provider.deep_link);
        const direct = typeof global.safeExternalURL === "function" ? global.safeExternalURL(raw) : "";
        if(direct) return direct;
        return typeof global.safeExternalURL === "function" ? global.safeExternalURL(providerRegion && providerRegion.link) : "";
    }

    function providerGroup(label,providers,providerRegion){
        if(!Array.isArray(providers) || !providers.length) return null;
        const items = providers.slice(0,10).map(provider=>{
            const name = String(provider && (provider.provider_name || provider.name) || "Provider");
            const id = Number(provider && (provider.provider_id || provider.id) || 0);
            const route = id > 0 && typeof global.getProviderDetailRoute === "function" ? global.getProviderDetailRoute(id,name) : "";
            const watchLink = providerWatchLink(provider,providerRegion);
            const children = [];
            if(provider && provider.logo_path){
                children.push(element("img",{class:"v2-provider-logo",src:imageURL(provider.logo_path,"w92"),alt:""},[]));
            }
            children.push(element("span",{},[text(name)]));
            if(route){
                return element("a",{class:"v2-provider-pill v2-provider-pill-link",href:route,title:"Browse " + name},children);
            }
            if(watchLink){
                return element("a",{class:"v2-provider-pill v2-provider-pill-link",href:watchLink,target:"_blank",rel:"noopener noreferrer",title:"Open " + name + " availability"},children);
            }
            return element("span",{class:"v2-provider-pill v2-provider-pill-muted",title:"No direct watch link available"},children);
        });
        return element("div",{class:"v2-provider-group"},[
            element("div",{class:"v2-provider-group-title"},[text(label)]),
            element("div",{class:"v2-provider-list"},items)
        ]);
    }

    function buildReleases(show){
        const streamingRegion = global.TVTrackerStreamingRegion;
        const requiredMessage = streamingRegion && streamingRegion.REGION_REQUIRED_MESSAGE
            ? streamingRegion.REGION_REQUIRED_MESSAGE
            : "Choose a streaming region in Settings.";
        const noProviderMessage = streamingRegion && streamingRegion.NO_PROVIDER_MESSAGE
            ? streamingRegion.NO_PROVIDER_MESSAGE
            : "No streaming provider data available for this region.";
        const region = streamingRegion && typeof streamingRegion.getStreamingRegion === "function"
            ? streamingRegion.getStreamingRegion()
            : "";
        if(!region) return Object.freeze([emptyState(requiredMessage)]);
        const providers = show && show._tmdb_watch_providers && show._tmdb_watch_providers.results
            ? show._tmdb_watch_providers.results[region]
            : null;
        if(!providers) return Object.freeze([emptyState(noProviderMessage)]);
        const groups = [
            providerGroup("Streaming",providers.flatrate,providers),
            providerGroup("Rent",providers.rent,providers),
            providerGroup("Buy",providers.buy,providers)
        ].filter(Boolean);
        return groups.length
            ? Object.freeze([element("div",{class:"show-release-provider-stack"},groups)])
            : Object.freeze([emptyState("No watch provider data available for the selected region yet.")]);
    }

    function buildInfoPanel(show){
        const active = getInfoActiveTab(show);
        let content = buildCast(show);
        if(active === "Crew") content = buildCrew(show);
        if(active === "Details") content = buildDetails(show);
        if(active === "Genres") content = buildGenres(show);
        if(active === "Releases") content = buildReleases(show);
        return Object.freeze([element("div",{class:"show-info-tab-stack"},[
            element("section",{class:"show-info-synopsis-section"},[
                element("h3",{class:"modal-section-heading"},[text("Synopsis")]),
                element("div",{class:"modal-overview"},[text(show && show.overview || "No overview available.")])
            ]),
            element("section",{class:"show-info-extra-section"},[
                buildInfoSubTabs(show),
                element("div",{class:"show-info-subtab-panel"},content)
            ])
        ])]);
    }

    function seasonIsLoadedEmpty(show,seasonNumber){
        const key = String(seasonNumber);
        return !!(
            show && show._episode_list && Array.isArray(show._episode_list[key]) && show._episode_list[key].length === 0 &&
            show._season_episodes && Object.prototype.hasOwnProperty.call(show._season_episodes,key) &&
            Number(show._season_episodes[key] || 0) === 0
        );
    }

    function episodeIsLoggable(episode,show,seasonNumber){
        return typeof global.isEpisodeLoggable === "function" && global.isEpisodeLoggable(episode,show,seasonNumber) === true;
    }

    function buildSeasonEpisodes(show,seasonNumber,tracked){
        const key = String(seasonNumber);
        const episodes = show && show._episode_list && Array.isArray(show._episode_list[key]) ? show._episode_list[key] : null;
        if(!episodes || !episodes.length){
            return Object.freeze([element("div",{class:"season-loading"},[
                text(seasonIsLoadedEmpty(show,seasonNumber) ? "Episode list not announced yet." : "Loading episode list...")
            ])]);
        }
        const watchedEpisodes = show && show.episodes_watched && Array.isArray(show.episodes_watched[key])
            ? show.episodes_watched[key]
            : [];
        return Object.freeze(episodes.map(episode=>{
            const episodeNumber = episode && episode.episode_number;
            const watched = watchedEpisodes.includes(episodeNumber);
            const aired = episodeIsLoggable(episode,show,seasonNumber);
            const canToggle = tracked && (aired || watched);
            const route = typeof global.getEpisodeDetailRoute === "function"
                ? global.getEpisodeDetailRoute(show.tmdb_id,seasonNumber,episodeNumber,show.title || show.name || "")
                : "/app/list/watching";
            return element("div",{
                class:watched ? "episode-row watched" : (aired ? "episode-row" : "episode-row future"),
                "data-season":seasonNumber,
                "data-episode":episodeNumber
            },[
                element("a",{class:"app-route-card-link",href:route,"aria-label":"Open " + String(show.title || show.name || "show") + " episode"},[]),
                element("div",{class:"episode-name"},[text("E" + episodeNumber + " — \"" + String(episode && episode.name || "Untitled Episode") + "\"")]),
                element("button",{
                    type:"button",
                    class:watched ? "episode-check-button checked" : "episode-check-button",
                    "data-season":seasonNumber,
                    "data-episode":episodeNumber,
                    "data-watched":watched ? "true" : "false",
                    disabled:!canToggle,
                    title:canToggle
                        ? (watched ? "Mark as unwatched" : "Mark as watched")
                        : (tracked ? "Not aired yet" : "Add this show before changing watched episodes")
                },[])
            ]);
        }));
    }

    function buildSeasons(show){
        const count = Math.max(Number(show && show.number_of_seasons || 1),1);
        const showId = String(show && show.tmdb_id);
        const expansion = global.expandedSeasons && global.expandedSeasons[showId] && typeof global.expandedSeasons[showId] === "object"
            ? global.expandedSeasons[showId]
            : {};
        const tracked = isTracked(show);
        const seasons = [];
        for(let seasonNumber = 1; seasonNumber <= count; seasonNumber++){
            const key = String(seasonNumber);
            const open = !!expansion[key];
            const episodeList = show && show._episode_list && Array.isArray(show._episode_list[key]) ? show._episode_list[key] : null;
            const total = episodeList ? episodeList.length : Number(show && show._season_episodes && show._season_episodes[key] || 0);
            const watched = typeof global.getSeasonWatchedCount === "function"
                ? global.getSeasonWatchedCount(show,seasonNumber)
                : (show && show.episodes_watched && Array.isArray(show.episodes_watched[key]) ? show.episodes_watched[key].length : 0);
            const airedEpisodes = typeof global.getAiredEpisodeNumbersInSeason === "function"
                ? global.getAiredEpisodeNumbersInSeason(show,seasonNumber)
                : (episodeList || []).filter(episode=>episodeIsLoggable(episode,show,seasonNumber)).map(episode=>Number(episode.episode_number));
            const fullyWatched = typeof global.isSeasonFullyWatched === "function"
                ? global.isSeasonFullyWatched(show,seasonNumber,airedEpisodes)
                : airedEpisodes.length > 0 && airedEpisodes.every(number=>show.episodes_watched && Array.isArray(show.episodes_watched[key]) && show.episodes_watched[key].includes(number));
            const toggleChildren = [
                element("span",{class:"season-left"},[
                    element("span",{class:"season-title-stack"},[
                        element("span",{class:"season-title"},[text("Season " + seasonNumber)])
                    ])
                ]),
                element("span",{class:"season-count"},total ? [text(watched + " / " + total)] : [])
            ];
            const boxChildren = [element("div",{class:"season-header collapse-title"},[
                element("button",{type:"button",class:"season-toggle-area","data-season":seasonNumber,"aria-expanded":open ? "true" : "false"},toggleChildren),
                element("button",{
                    type:"button",
                    class:"season-all-button" + (fullyWatched ? " checked" : ""),
                    "data-season":seasonNumber,
                    title:tracked
                        ? (fullyWatched ? "Mark season as unwatched" : "Mark aired episodes as watched")
                        : "Add this show before changing watched episodes",
                    disabled:!tracked
                },[])
            ])];
            if(open){
                boxChildren.push(element("div",{class:"season-episodes collapse-content"},buildSeasonEpisodes(show,seasonNumber,tracked)));
            }
            seasons.push(element("div",{
                class:"season-box collapse collapse-arrow bg-base-100 border-base-300 border " + (open ? "open collapse-open" : "collapse-close")
            },boxChildren));
        }
        return Object.freeze(seasons);
    }

    function buildEpisodesPanel(show){
        return Object.freeze([element("div",{class:"show-episodes-tab-stack"},[
            element("div",{class:"seasons-list"},buildSeasons(show))
        ])]);
    }

    function buildTabContent(show){
        const active = typeof global.getShowDetailActiveTab === "function" ? global.getShowDetailActiveTab(show) : "Info";
        return active === "Episodes" ? buildEpisodesPanel(show) : buildInfoPanel(show);
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
            tabContent:buildTabContent(show),
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
