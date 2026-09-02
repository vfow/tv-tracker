(function(global){
    "use strict";

    const baseModel = global.TVTrackerMediaDetailsNodeModel;
    if(
        !baseModel ||
        baseModel.ownership !== "typed-node-model" ||
        typeof baseModel.text !== "function" ||
        typeof baseModel.element !== "function" ||
        typeof baseModel.fragment !== "function" ||
        typeof baseModel.freeze !== "function"
    ){
        return;
    }

    function text(value){
        return baseModel.text(value);
    }

    function element(tag,attrs={},children=[]){
        return baseModel.element(tag,attrs,children);
    }

    function freezeNodes(nodes){
        return Object.freeze((Array.isArray(nodes) ? nodes : []).filter(Boolean));
    }

    function isTypedNode(node){
        return !!node && typeof node === "object" && (node.kind === "text" || node.kind === "element");
    }

    function activeTab(){
        const requested = String(global.activeMovieDetailsTab || "Info");
        return ["Info","Cast","Crew","Details","Genres","Releases"].includes(requested) ? requested : "Info";
    }

    function imageURL(path,size){
        return typeof global.trackerImageURL === "function" ? String(global.trackerImageURL(path,size) || "") : "";
    }

    function emptyState(message){
        return element("div",{class:"v2-api-empty"},[text(message)]);
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
        const src = person && person.profile_path ? imageURL(person.profile_path,"w185") : "";
        return src ? element("img",{loading:"lazy",decoding:"async",src,alt:""},[]) : personPlaceholder();
    }

    function personRow(person,role,roleText,fallbackName="Unknown"){
        const personId = Number(person && person.id || 0);
        const personName = String(person && person.name || fallbackName);
        const cleanRole = String(role || "").trim();
        const route = cleanRole && personId > 0 && typeof global.getPersonDetailRoute === "function"
            ? global.getPersonDetailRoute(cleanRole,personId,personName,"movie")
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
                "data-person-media":"movie",
                "data-person-id":personId,
                "data-person-name":personName
            },children)
            : element("div",{class:"v2-actor-list-row"},children);
    }

    function buildCast(movie){
        const cast = Array.isArray(movie && movie.cast) ? movie.cast : [];
        const content = cast.length
            ? element("div",{class:"v2-actor-list show-info-actor-list"},cast.map(actor=>personRow(
                actor,
                "acting",
                String(actor && actor.character || "Unknown Role"),
                "Unknown Actor"
            )))
            : emptyState("Unknown");
        return freezeNodes([element("section",{class:"show-detail-section v2-show-info-section"},[content])]);
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

    function buildCrew(movie){
        const source = Array.isArray(movie && movie.crew) ? movie.crew : [];
        const groups = typeof global.collectCrewJobGroups === "function" ? global.collectCrewJobGroups(source) : [];
        const content = groups.length
            ? element("div",{class:"movie-crew-department-list crew-job-group-list"},groups.map(group=>{
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
            }))
            : emptyState("Unknown");
        return freezeNodes([element("section",{class:"show-detail-section v2-show-info-section"},[content])]);
    }

    function discoveryEntity(label,type,value,options={}){
        const cleanLabel = String(label || "").trim();
        if(!cleanLabel) return null;
        const media = options.media === "tv" ? "tv" : "movie";
        const routeLabel = String(options.routeLabel || cleanLabel).trim();
        const route = typeof global.getDiscoveryFilterDetailRoute === "function"
            ? global.getDiscoveryFilterDetailRoute(type,value,routeLabel,media)
            : "";
        if(!route || route === "/app/list/watching"){
            return element("span",{},[text(cleanLabel)]);
        }
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

    function runtimeNode(runtime){
        const minutes = Math.round(Number(runtime || 0));
        if(!Number.isFinite(minutes) || minutes <= 0) return null;
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        const label = !hours ? minutes + "m" : (remainder ? hours + "h " + remainder + "m" : hours + "h");
        const route = typeof global.getRuntimeBrowseRoute === "function" ? global.getRuntimeBrowseRoute(runtime,"movie") : "";
        return route
            ? element("a",{class:"show-detail-entity-link show-runtime-link",href:route,title:"Browse titles by runtime"},[text(label)])
            : text(label);
    }

    function languageNodes(movie){
        const originalLanguage = String(movie && movie.original_language || "").trim().toLowerCase();
        const languages = (Array.isArray(movie && movie.spoken_languages) ? movie.spoken_languages : [])
            .map(language=>({
                code:String(language && (language.iso_639_1 || language.iso_639_2) || "").trim().toLowerCase(),
                label:String(language && (language.english_name || language.name) || "").trim()
            }))
            .filter(language=>language.code || language.label);
        if(originalLanguage && !languages.some(language=>language.code === originalLanguage)){
            languages.unshift({
                code:originalLanguage,
                label:typeof global.getLanguageName === "function" ? global.getLanguageName(originalLanguage) : originalLanguage.toUpperCase()
            });
        }
        if(!languages.length) return freezeNodes([text("Unknown")]);
        return freezeNodes([inlineList(languages.map(language=>{
            const label = language.label || (typeof global.getLanguageName === "function" ? global.getLanguageName(language.code) : language.code.toUpperCase());
            return language.code && language.code === originalLanguage
                ? discoveryEntity(label,"language",language.code,{name:label + " Movies",media:"movie"})
                : element("span",{},[text(label)]);
        }))]);
    }

    function countryNodes(movie){
        const countries = (Array.isArray(movie && movie.production_countries) ? movie.production_countries : [])
            .map(country=>({
                code:String(country && country.iso_3166_1 || "").trim().toLowerCase(),
                name:String(country && country.name || "").trim()
            }))
            .filter(country=>country.code || country.name);
        if(!countries.length) return freezeNodes([text("Unknown")]);
        return freezeNodes([inlineList(countries.map(country=>{
            const label = country.code && typeof global.getCountryLabel === "function" ? global.getCountryLabel(country.code) : country.name;
            const countryName = country.code && typeof global.getCountryName === "function" ? global.getCountryName(country.code) : country.name;
            return country.code
                ? discoveryEntity(label,"country",country.code,{name:countryName + " Movies",media:"movie"})
                : element("span",{},[text(label)]);
        }))]);
    }

    function certificationNodes(movie){
        const certification = typeof global.getMovieCertification === "function"
            ? String(global.getMovieCertification(movie) || "").trim()
            : "";
        if(!certification) return freezeNodes([text("Unknown")]);
        const route = typeof global.getCertificationDetailRoute === "function"
            ? global.getCertificationDetailRoute("movie",certification)
            : "";
        return freezeNodes([route
            ? element("a",{class:"show-detail-entity-link show-detail-inline-link show-detail-certification-link",href:route},[text(certification)])
            : element("span",{},[text(certification)])
        ]);
    }

    function companyNodes(movie){
        const items = (Array.isArray(movie && movie.production_companies) ? movie.production_companies : [])
            .map(company=>{
                const id = Number(company && company.id || 0);
                const name = String(company && company.name || "").trim();
                const logoPath = String(company && company.logo_path || "").trim();
                if(!name) return null;
                const route = id > 0 && typeof global.getCompanyDetailRoute === "function"
                    ? global.getCompanyDetailRoute(id,name,"movie")
                    : "";
                const className = "movie-company-logo-link" + (logoPath ? "" : " movie-company-logo-link-name");
                const inner = logoPath
                    ? element("img",{class:"movie-company-logo",src:imageURL(logoPath,"w154"),alt:name},[])
                    : element("span",{class:"movie-company-name-fallback"},[text(name)]);
                return route
                    ? element("a",{href:route,class:className,title:name,"aria-label":name},[inner])
                    : element("span",{class:className,title:name,"aria-label":name},[inner]);
            })
            .filter(Boolean);
        return items.length ? freezeNodes([element("span",{class:"movie-company-logo-list"},items)]) : freezeNodes([]);
    }

    function factRow(label,nodes){
        return element("div",{class:"show-detail-fact-row"},[
            element("div",{class:"episode-detail-label"},[text(label)]),
            element("div",{class:"episode-detail-value"},nodes)
        ]);
    }

    function buildDetails(movie){
        const rows = [
            factRow("Original Title",[text(movie && movie.original_title || "Unknown")]),
            factRow("Status",[text(movie && movie.status || "Unknown")]),
            factRow("Release Date",[text(movie && movie.release_date || "Unknown")])
        ];
        const runtime = runtimeNode(movie && movie.runtime);
        if(runtime) rows.push(factRow("Runtime",[runtime]));
        rows.push(factRow("Language",languageNodes(movie)));
        rows.push(factRow("Country",countryNodes(movie)));
        rows.push(factRow("Certification",certificationNodes(movie)));
        const companies = companyNodes(movie);
        if(companies.length) rows.push(factRow("Production Companies",companies));
        return freezeNodes([
            element("section",{class:"show-detail-section v2-show-info-section"},[
                element("div",{class:"show-detail-fact-list"},rows)
            ])
        ]);
    }

    function genreChip(genre){
        const name = String(genre && typeof genre === "object" ? genre.name : genre || "").trim();
        if(!name) return null;
        const route = typeof global.getShowGenreRoute === "function" ? global.getShowGenreRoute(genre,"movie") : "";
        const key = genre && typeof genre === "object" && genre.id && typeof global.buildRouteKey === "function"
            ? global.buildRouteKey(genre.id,name)
            : "";
        return route && route !== "/app/list/watching"
            ? element("a",{
                href:route,
                class:"show-detail-genre-chip show-genre-link",
                "data-genre-key":key,
                "data-genre-name":name,
                "data-genre-media":"movie",
                "data-genre-route":route
            },[text(name)])
            : element("span",{},[text(name)]);
    }

    function themeChip(theme){
        const id = Number(theme && theme.id || 0);
        const name = String(theme && theme.name || "").trim();
        if(!name) return null;
        if(id <= 0) return element("span",{class:"show-detail-theme-chip"},[text(name)]);
        const route = typeof global.getDiscoveryFilterDetailRoute === "function"
            ? global.getDiscoveryFilterDetailRoute("theme",id,name,"movie")
            : "";
        return element("a",{
            class:"show-detail-theme-chip show-detail-theme-link",
            href:route,
            "data-discovery-type":"theme",
            "data-discovery-value":id,
            "data-discovery-media":"movie",
            "data-discovery-name":"Movies about " + name,
            "data-discovery-label":name
        },[text(name)]);
    }

    function buildGenres(movie){
        const genres = Array.isArray(movie && movie.genre_items) && movie.genre_items.length
            ? movie.genre_items
            : (Array.isArray(movie && movie.genres) ? movie.genres : []);
        const themes = typeof global.normalizeMovieThemeItems === "function" ? global.normalizeMovieThemeItems(movie) : [];
        const sections = [
            element("section",{class:"show-genres-tab-section"},[
                element("h3",{class:"modal-section-heading show-genres-tab-heading"},[text("Genres")]),
                genres.length
                    ? element("div",{class:"show-detail-genre-chips"},genres.map(genreChip).filter(Boolean))
                    : emptyState("No genres available.")
            ])
        ];
        if(Array.isArray(themes) && themes.length){
            sections.push(element("section",{class:"show-genres-tab-section"},[
                element("h3",{class:"modal-section-heading show-genres-tab-heading"},[text("Themes")]),
                element("div",{class:"show-detail-theme-list show-detail-theme-list-expanded"},themes.map(themeChip).filter(Boolean))
            ]));
        }
        return freezeNodes([
            element("section",{class:"show-detail-section v2-show-info-section"},[
                element("div",{class:"show-genres-tab-stack"},sections)
            ])
        ]);
    }

    function releaseSortControl(mode){
        const cleanMode = mode === "country" ? "country" : "date";
        const label = cleanMode === "country" ? "Country" : "Date";
        const options = ["date","country"].map(option=>{
            const optionLabel = option === "country" ? "Country" : "Date";
            const active = option === cleanMode;
            return element("button",{
                class:"movie-release-sort-menu-option" + (active ? " active" : ""),
                type:"button",
                "data-movie-release-sort-option":option,
                role:"menuitemradio",
                "aria-checked":active ? "true" : "false"
            },[text(optionLabel)]);
        });
        return element("div",{class:"movie-release-sort-note movie-release-sort-bar"},[
            element("span",{class:"movie-release-sort-static"},[text("Sort by")]),
            element("span",{class:"movie-release-sort-menu-wrap"},[
                element("button",{
                    class:"movie-release-sort-button",
                    type:"button",
                    "data-movie-release-sort-toggle":"",
                    "data-current-sort":cleanMode,
                    "aria-haspopup":"true",
                    "aria-expanded":"false",
                    "aria-label":"Choose movie release sort"
                },[
                    element("span",{class:"movie-release-sort-current"},[text(label)]),
                    element("span",{class:"movie-release-sort-chevron","aria-hidden":"true"},[
                        element("svg",{class:"browse-chevron movie-release-sort-chevron-icon",viewBox:"0 0 12 8","aria-hidden":"true",focusable:"false"},[
                            element("path",{d:"M1 1.5 6 6.5 11 1.5",fill:"none",stroke:"currentColor","stroke-width":"1.5","stroke-linecap":"round","stroke-linejoin":"round"},[])
                        ])
                    ])
                ]),
                element("span",{class:"movie-release-sort-menu","data-movie-release-sort-menu":"",role:"menu",hidden:true},options)
            ])
        ]);
    }

    function releaseEntry(release,withCountry){
        const certification = String(release && release.certification || "").trim();
        const note = String(release && release.note || "").trim();
        const main = [];
        if(withCountry){
            const flag = typeof global.getCountryFlag === "function" ? global.getCountryFlag(release && release.countryCode) : "";
            main.push(element("span",{class:"movie-release-date-country-label"},[
                ...(flag ? [element("span",{class:"movie-release-flag","aria-hidden":"true"},[text(flag)])] : []),
                element("span",{class:"movie-release-country-name"},[text(release && release.countryName || "Other")])
            ]));
        }else{
            const dateLabel = typeof global.formatMovieReleaseDate === "function" ? global.formatMovieReleaseDate(release && release.date) : String(release && release.date || "Unknown");
            main.push(element("span",{class:"movie-release-date"},[text(dateLabel)]));
        }
        main.push(element("span",{class:"modal-meta-separator"},[text("•")]));
        main.push(element("span",{class:"movie-release-type-label"},[text(release && release.typeLabel || "Release")]));
        if(certification) main.push(element("span",{class:"movie-release-certification-badge"},[text(certification)]));
        return element("div",{class:withCountry ? "movie-release-date-entry" : "movie-release-entry"},[
            element("div",{class:withCountry ? "movie-release-date-entry-main" : "movie-release-entry-main"},main),
            ...(note ? [element("div",{class:"movie-release-note"},[text(note)])] : [])
        ]);
    }

    function releaseCountryRow(country){
        const flag = typeof global.getCountryFlag === "function" ? global.getCountryFlag(country && country.countryCode) : "";
        return element("div",{class:"movie-release-country-row"},[
            element("div",{class:"movie-release-country-label"},[
                ...(flag ? [element("span",{class:"movie-release-flag","aria-hidden":"true"},[text(flag)])] : []),
                element("span",{class:"movie-release-country-name"},[text(country && country.countryName || "Other")])
            ]),
            element("div",{class:"movie-release-entry-list"},(Array.isArray(country && country.releases) ? country.releases : []).map(release=>releaseEntry(release,false)))
        ]);
    }

    function releaseDateRow(group){
        const label = typeof global.formatMovieReleaseDate === "function" ? global.formatMovieReleaseDate(group && group.date) : String(group && group.date || "Unknown");
        return element("div",{class:"movie-release-date-row"},[
            element("div",{class:"movie-release-date-label"},[text(label)]),
            element("div",{class:"movie-release-date-entry-list"},(Array.isArray(group && group.releases) ? group.releases : []).map(release=>releaseEntry(release,true)))
        ]);
    }

    function buildReleases(movie){
        const releases = typeof global.collectMovieReleaseRows === "function" ? global.collectMovieReleaseRows(movie) : [];
        let content;
        if(!releases.length){
            content = emptyState("Unknown");
        }else{
            const sortMode = typeof global.getMovieReleaseSortMode === "function" ? global.getMovieReleaseSortMode() : "date";
            if(sortMode === "country"){
                const groups = typeof global.groupMovieReleasesByCountry === "function" ? global.groupMovieReleasesByCountry(releases) : [];
                content = element("div",{class:"movie-release-country-list"},[
                    releaseSortControl(sortMode),
                    ...groups.map(releaseCountryRow)
                ]);
            }else{
                const groups = typeof global.groupMovieReleasesByDate === "function" ? global.groupMovieReleasesByDate(releases) : [];
                content = element("div",{class:"movie-release-date-list"},[
                    releaseSortControl(sortMode),
                    ...groups.map(releaseDateRow)
                ]);
            }
        }
        return freezeNodes([element("section",{class:"show-detail-section v2-show-info-section"},[content])]);
    }

    function railButton(direction,title){
        const left = direction === "left";
        return element("button",{
            type:"button",
            class:"v2-rail-button",
            "data-v2-rail-scroll":direction,
            "aria-label":"Scroll " + title + " " + direction
        },[
            element("svg",{class:"v2-rail-button-icon",viewBox:"0 0 12 12","aria-hidden":"true"},[
                element("path",{
                    d:left ? "M7.5 2 3.5 6l4 4" : "m4.5 2 4 4-4 4",
                    fill:"none",
                    stroke:"currentColor",
                    "stroke-width":"1.5",
                    "stroke-linecap":"round",
                    "stroke-linejoin":"round"
                },[])
            ])
        ]);
    }

    function similarPoster(item){
        const src = item && item.poster_path ? imageURL(item.poster_path,"w500") : "";
        if(src) return element("img",{loading:"lazy",decoding:"async",src,alt:""},[]);
        const label = (typeof global.getMediaPosterPlaceholderLabel === "function"
            ? String(global.getMediaPosterPlaceholderLabel(item,"movie") || "")
            : "") || String(item && item.title || "Untitled");
        return element("div",{class:"poster-placeholder media-title-placeholder v2-similar-poster-placeholder",title:label},[
            element("span",{},[text(label)])
        ]);
    }

    function similarCard(item){
        const title = String(item && item.title || "Untitled");
        const route = typeof global.getMovieDetailRoute === "function"
            ? global.getMovieDetailRoute(item && item.id,item && item.title || "")
            : "/app/discover";
        const children = [
            element("div",{class:"v2-similar-poster"},[similarPoster(item)]),
            element("div",{class:"v2-similar-title"},[text(title)])
        ];
        if(item && item.adult === true){
            const meta = [];
            const year = typeof global.getMediaPosterYear === "function"
                ? String(global.getMediaPosterYear(item,"movie") || "")
                : String(item.release_date || "").slice(0,4);
            const rating = Number(item.vote_average || 0);
            if(year) meta.push(text(year));
            if(rating > 0){
                if(meta.length) meta.push(text(" • "));
                meta.push(text(rating.toFixed(1)));
            }
            if(meta.length) meta.push(text(" • "));
            meta.push(element("span",{class:"adult-movie-badge"},[text("ADULT")]));
            children.push(element("div",{class:"v2-similar-meta"},meta));
        }
        return element("a",{
            href:route,
            class:"v2-similar-card",
            "data-movie-similar-open":item && item.id || "",
            "data-movie-similar-name":item && item.title || ""
        },children);
    }

    function buildMoreLike(movie){
        const similar = Array.isArray(movie && movie.similar) ? movie.similar.slice(0,10) : [];
        if(!similar.length) return null;
        const title = "YOU MAY ALSO LIKE";
        return element("div",{class:"modal-section v2-rail-section v2-more-like-section movie-more-like-section"},[
            element("div",{class:"v2-section-title-row v2-rail-heading-row"},[
                element("h3",{class:"modal-section-heading"},[text(title)]),
                element("div",{class:"v2-rail-controls","aria-hidden":"false"},[
                    railButton("left",title),
                    railButton("right",title)
                ])
            ]),
            element("div",{class:"v2-horizontal-rail"},similar.map(similarCard))
        ]);
    }

    function buildInfo(movie){
        const tagline = String(movie && movie.tagline || "").trim();
        const children = [
            element("section",{class:"show-detail-section v2-show-info-section"},[
                element("h2",{class:"modal-section-heading"},[text("Synopsis")]),
                ...(tagline ? [element("p",{class:"show-detail-tagline movie-info-tagline"},[text(tagline)])] : []),
                element("p",{class:"overview"},[text(movie && movie.overview || "Unknown")])
            ])
        ];
        const moreLike = buildMoreLike(movie);
        if(moreLike) children.push(moreLike);
        return freezeNodes([element("div",{class:"movie-info-tab-stack"},children)]);
    }

    function build(movie){
        const tab = activeTab();
        if(tab === "Cast") return buildCast(movie);
        if(tab === "Crew") return buildCrew(movie);
        if(tab === "Details") return buildDetails(movie);
        if(tab === "Genres") return buildGenres(movie);
        if(tab === "Releases") return buildReleases(movie);
        return buildInfo(movie);
    }

    const nativeNodeModel = Object.freeze({
        text:baseModel.text,
        element:baseModel.element,
        freeze:baseModel.freeze,
        fragment(value){
            if(Array.isArray(value) && value.every(isTypedNode)){
                return freezeNodes(value);
            }
            return baseModel.fragment(value);
        },
        ownership:"typed-node-model"
    });

    global.TVTrackerMediaDetailsNodeModel = nativeNodeModel;
    global.TVTrackerMovieDetailsNativePanels = Object.freeze({
        build,
        ownership:"typed-node-panels"
    });
    global.renderMovieActiveTabContentHTML = build;
})(window);
