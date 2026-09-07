(function(global){
    "use strict";

    const DISCOVER_MEDIA_TYPES = new Set(["tv","movie"]);
    const manifestUrl = "/static/vue/manifest.json";
    const GENRE_TONES = Object.freeze({
        "action & adventure":"discover-genre-tone-action-adventure",
        "animation":"discover-genre-tone-animation",
        "comedy":"discover-genre-tone-comedy",
        "crime":"discover-genre-tone-crime",
        "documentary":"discover-genre-tone-documentary",
        "drama":"discover-genre-tone-drama",
        "family":"discover-genre-tone-family",
        "kids":"discover-genre-tone-kids",
        "mystery":"discover-genre-tone-mystery",
        "news":"discover-genre-tone-news",
        "reality":"discover-genre-tone-reality",
        "sci-fi & fantasy":"discover-genre-tone-sci-fi-fantasy",
        "soap":"discover-genre-tone-soap",
        "talk":"discover-genre-tone-talk",
        "war & politics":"discover-genre-tone-war-politics",
        "western":"discover-genre-tone-western",
        "action":"discover-genre-tone-action",
        "adventure":"discover-genre-tone-adventure",
        "fantasy":"discover-genre-tone-fantasy",
        "history":"discover-genre-tone-history",
        "horror":"discover-genre-tone-horror",
        "music":"discover-genre-tone-music",
        "romance":"discover-genre-tone-romance",
        "science fiction":"discover-genre-tone-science-fiction",
        "tv movie":"discover-genre-tone-tv-movie",
        "thriller":"discover-genre-tone-thriller",
        "war":"discover-genre-tone-war"
    });

    let personOwner = null;
    let lastPersonModel = null;
    let indexOwner = null;
    let lastIndexModel = null;
    let collectionOwner = null;
    let lastCollectionModel = null;
    let vueOwner = null;
    let loadPromise = null;
    let lastModel = null;
    let trendingOwner = null;
    let lastTrendingModel = null;

    function normalizeMedia(value){
        const media = String(value || "").trim().toLowerCase();
        return DISCOVER_MEDIA_TYPES.has(media) ? media : "tv";
    }

    function imageURL(path,size){
        const value = String(path || "").trim();
        if(!value){ return ""; }
        if(/^https?:\/\//i.test(value)){ return value; }
        if(typeof global.trackerImageURL === "function"){
            return global.trackerImageURL(value,size);
        }
        return "https://image.tmdb.org/t/p/" + String(size || "w500") + value;
    }

    function stateSnapshot(){
        const bridge = global.TVTrackerDiscoverStateBridge;
        if(bridge && typeof bridge.snapshot === "function"){
            return bridge.snapshot();
        }
        return global.discoverHubState && typeof global.discoverHubState === "object"
            ? global.discoverHubState
            : {loaded:false,loading:false,error:"",sections:[],genres:{tv:[],movie:[]},collections:[]};
    }

    function mediaRoute(item,media,title){
        if(media === "movie"){
            return typeof global.getMovieDetailRoute === "function"
                ? String(global.getMovieDetailRoute(item && item.id,title) || "")
                : "";
        }
        return typeof global.getShowDetailRoute === "function"
            ? String(global.getShowDetailRoute(item && item.id,title) || "")
            : "";
    }

    function mediaPlaceholderLabel(item,media,title,year){
        if(typeof global.getMediaPosterPlaceholderLabel === "function"){
            return String(global.getMediaPosterPlaceholderLabel(item,media) || title);
        }
        return year && year !== "Unknown" ? title + " (" + year + ")" : title;
    }

    function buildMediaItem(item,fallbackMedia){
        const media = normalizeMedia(item && item.media_type || fallbackMedia);
        const title = item && (item.title || item.name) ? String(item.title || item.name) : "Untitled";
        const date = item && (item.date || item.release_date || item.first_air_date)
            ? String(item.date || item.release_date || item.first_air_date)
            : "";
        const year = date ? date.slice(0,4) : "Unknown";
        return Object.freeze({
            id:Number(item && item.id || 0),
            media,
            name:title,
            route:mediaRoute(item,media,title),
            posterUrl:imageURL(item && item.poster_path,"w500"),
            placeholderLabel:mediaPlaceholderLabel(item,media,title,year),
            year,
            adult:media === "movie" && !!(item && item.adult === true),
            posterPath:String(item && item.poster_path || ""),
            overview:String(item && item.overview || ""),
            firstAirDate:String(item && item.first_air_date || ""),
            releaseDate:String(item && item.release_date || "")
        });
    }

    function buildRow(section){
        const media = normalizeMedia(section && section.media);
        const source = Array.isArray(section && section.items) && section.items.length
            ? section.items
            : Array.isArray(section && section.shows) ? section.shows : [];
        const items = source
        .filter(item=>item && Number(item.id || 0) > 0)
        .map(item=>buildMediaItem(item,media));
        return Object.freeze({
            key:String(section && (section.key || section.title) || "row"),
            title:String(section && section.title || "Browse"),
            route:String(section && section.route || "").trim(),
            media,
            items:Object.freeze(items)
        });
    }

    function collectionPosterSlots(collection){
        const source = typeof global.getCollectionPosterSlotsForRender === "function"
            ? global.getCollectionPosterSlotsForRender(collection)
            : [];
        return Object.freeze((Array.isArray(source) ? source : []).slice(0,3).map(slot=>{
            const title = typeof global.getCollectionPosterSlotTitle === "function"
                ? String(global.getCollectionPosterSlotTitle(slot,collection) || "Untitled Movie")
                : String(slot && (slot.title || slot.name) || collection && (collection.name || collection.title) || "Collection");
            const year = typeof global.getCollectionPosterSlotYear === "function"
                ? String(global.getCollectionPosterSlotYear(slot) || "")
                : String(slot && (slot.release_date || slot.date || "") || "").slice(0,4);
            return Object.freeze({
                imageUrl:imageURL(slot && slot.poster_path,"w500"),
                label:year ? title + " (" + year + ")" : title
            });
        }));
    }

    function isPromotableCollection(collection){
        if(typeof global.isPromotableCollection === "function"){
            return global.isPromotableCollection(collection) === true;
        }
        return !!(collection && collection.id && (collection.name || collection.title));
    }

    function buildCollectionItem(collection){
        const id = Number(collection && collection.id || 0);
        const name = String(collection && (collection.name || collection.title) || "Collection").trim() || "Collection";
        const count = typeof global.getCollectionMovieCount === "function"
            ? Number(global.getCollectionMovieCount(collection) || 0)
            : Number(collection && collection.movie_count || (Array.isArray(collection && collection.parts) ? collection.parts.length : 0));
        const countLabel = collection && collection.live_search_summary === true && !count
            ? "Loading details…"
            : count === 1 ? "1 movie" : String(count || 0) + " movies";
        return Object.freeze({
            id,
            name,
            route:typeof global.getCollectionDetailRoute === "function"
                ? String(global.getCollectionDetailRoute(id,name) || "")
                : "",
            countLabel,
            posterSlots:collectionPosterSlots(collection)
        });
    }

    function genreTone(name){
        return GENRE_TONES[String(name || "").trim().toLowerCase()] || "";
    }

    function buildGenreItems(source,media){
        const cleanMedia = normalizeMedia(media);
        return Object.freeze((Array.isArray(source) ? source : [])
        .map(genre=>{
            const id = Number(genre && genre.id || 0);
            const name = String(genre && genre.name || "").trim();
            if(!id || !name || (cleanMedia === "tv" && name.toLowerCase() === "soap")){
                return null;
            }
            const route = typeof global.getGenreDetailRoute === "function"
                ? String(global.getGenreDetailRoute(id,name,cleanMedia) || "")
                : "";
            if(!route || route === "/app/list/watching"){
                return null;
            }
            return Object.freeze({id,name,route,toneClass:genreTone(name)});
        })
        .filter(Boolean));
    }

    function buildViewModel(){
        const state = stateSnapshot();
        const sections = (Array.isArray(state && state.sections) ? state.sections : [])
        .map(buildRow)
        .filter(row=>row.items.length > 0);
        const tvRows = sections.filter(row=>row.media === "tv");
        const movieRows = sections.filter(row=>row.media === "movie");
        const collections = (Array.isArray(state && state.collections) ? state.collections : [])
        .filter(isPromotableCollection)
        .slice(0,12)
        .map(buildCollectionItem);
        const genres = state && state.genres && typeof state.genres === "object" ? state.genres : {};
        const hasSections = sections.length > 0;
        const bodyState = state && state.loading === true && !hasSections
            ? "loading"
            : state && state.error && !hasSections
                ? "error"
                : "ready";
        const activeGenreMedia = typeof global.normalizeGenreMediaType === "function"
            ? normalizeMedia(global.normalizeGenreMediaType(global.discoverGenreMedia || "tv"))
            : normalizeMedia(global.discoverGenreMedia || "tv");

        return Object.freeze({
            bodyState,
            error:String(state && state.error || ""),
            tvRows:Object.freeze(tvRows),
            movieRows:Object.freeze(movieRows),
            collections:Object.freeze(collections),
            genres:Object.freeze({
                tv:buildGenreItems(genres.tv,"tv"),
                movie:buildGenreItems(genres.movie,"movie")
            }),
            activeGenreMedia
        });
    }

    function isHubVisible(){
        if(typeof global.activePage === "string"){
            return global.activePage === "discover"
                && (typeof global.shouldShowDiscoverHub !== "function" || global.shouldShowDiscoverHub());
        }
        return /^\/app\/discover\/?$/.test(String(global.location && global.location.pathname || ""));
    }

    function renderLoading(){
        if(!isHubVisible()){ return; }
        lastModel = Object.freeze({...buildViewModel(),bodyState:"loading"});
        if(vueOwner){
            vueOwner.render(lastModel);
            return;
        }
        void loadVueDiscover();
    }

    function renderLoadFailure(){
        const listing = lastListingModel && listingKind();
        const person = lastPersonModel && isPersonVisible(lastPersonModel.id);
        const index = lastIndexModel && isIndexVisible();
        const collection = lastCollectionModel && isCollectionVisible(lastCollectionModel.id);
        const trending = lastTrendingModel && isTrendingVisible(lastTrendingModel.key);
        if(listing ? listingOwner : person ? personOwner : index ? indexOwner : collection ? collectionOwner : trending ? trendingOwner : (vueOwner || !isHubVisible())){ return; }
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.renderSurfaceFailure === "function"){
            const surface = listing ? "browse-listing" : person ? "person" : index ? "collections-index" : collection ? "collection" : trending ? "trending" : "discover";
            runtime.renderSurfaceFailure({
                rootId:listing ? "genre-detail-content" : person ? "person-detail-content" : index || collection || trending ? "genre-detail-content" : "search-results",
                marker:"data-tvtracker-" + surface + "-vue-load-failed",
                title:listing ? "Browse unavailable" : person ? "Person unavailable" : index ? "Collections unavailable" : collection ? "Collection unavailable" : trending ? "Trending unavailable" : "Discover unavailable",
                message:"Reload the page to try again."
            });
        }
    }

    function reportLoadFailure(){
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function"){
            runtime.report({category:"runtime",surface:"discover",code:"vue_discover_load_failed"});
        }
    }

    function loadVueDiscover(){
        if(vueOwner){ return Promise.resolve(true); }
        if(loadPromise){ return loadPromise; }
        if(typeof global.fetch !== "function"){
            reportLoadFailure();
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
            return import(new URL("/static/vue/" + file,base).href).then(()=>{
                if(!vueOwner){ throw new Error("Discover Vue owner unavailable"); }
                return true;
            });
        })
        .catch(()=>{
            reportLoadFailure();
            renderLoadFailure();
            loadPromise = null;
            return false;
        });
        return loadPromise;
    }

    function updateDiscoverShellAfterRender(){
        if(typeof global.ensureBrowseGlobalInteractionEvents === "function"){
            global.ensureBrowseGlobalInteractionEvents();
        }
        if(typeof global.restoreCollectionReturnPositionSoon === "function"){
            global.restoreCollectionReturnPositionSoon("/app/discover");
        }
        if(typeof global.updateShellTitle === "function"){
            global.updateShellTitle();
        }
    }

    function render(){
        if(!isHubVisible()){ return; }
        lastModel = buildViewModel();
        if(vueOwner){
            vueOwner.render(lastModel);
            updateDiscoverShellAfterRender();
            return;
        }
        updateDiscoverShellAfterRender();
        void loadVueDiscover();
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Discover owner");
        }
        vueOwner = owner;
        if(lastModel && isHubVisible()){
            vueOwner.render(lastModel);
            updateDiscoverShellAfterRender();
        }
    }

    function isTrendingVisible(key){
        const api = global.TVTrackerTrending;
        return global.activePage === "discovery-detail"
            && !!api && typeof api.parseRoute === "function"
            && api.parseRoute(global.location.pathname,global.location.search) === key;
    }

    function buildTrendingModel(config,items,loading,error){
        const cleanItems = (Array.isArray(items) ? items : [])
        .filter(item=>item && Number(item.id || 0) > 0)
        .map(item=>{
            const rating = Number(item.vote_average || 0);
            return Object.freeze({
                ...buildMediaItem(item,config.media),
                rating:rating > 0 ? rating.toFixed(1) : "",
                faded:!!item._eyeFaded,
                firstAirDate:String(item.first_air_date || item.date || "")
            });
        });
        return Object.freeze({
            key:String(config.key),
            title:String(config.title || "Trending"),
            bodyState:error ? "error" : cleanItems.length ? "ready" : loading ? "loading" : "empty",
            error:String(error || ""),
            items:Object.freeze(cleanItems)
        });
    }

    function renderTrending(config,items,loading,error=""){
        if(!config || !isTrendingVisible(config.key)){ return; }
        lastTrendingModel = buildTrendingModel(config,items,loading,error);
        if(trendingOwner){
            trendingOwner.render(lastTrendingModel);
        }else{
            void loadVueDiscover();
        }
    }

    function attachTrendingOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Trending owner");
        }
        trendingOwner = owner;
        if(lastTrendingModel && isTrendingVisible(lastTrendingModel.key)){
            trendingOwner.render(lastTrendingModel);
        }
    }

const COLLECTION_DETAIL_SORT_OPTIONS = Object.freeze([
    {value:"collection-order",label:"Collection Order"},
    {value:"date-desc",label:"Release Date — Newest"},
    {value:"date-asc",label:"Release Date — Oldest"},
    {value:"popularity-desc",label:"Popularity — High to Low"},
    {value:"popularity-asc",label:"Popularity — Low to High"},
    {value:"rating-desc",label:"Rating — High to Low"},
    {value:"rating-asc",label:"Rating — Low to High"},
    {value:"title-asc",label:"Title — A to Z"},
    {value:"title-desc",label:"Title — Z to A"}
]);


const COLLECTION_INDEX_SORT_OPTIONS = Object.freeze([
    {value:"name.asc",label:"Collection Name"},
    {value:"size.desc",label:"Collection Size"},
    {value:"date.desc",label:"Newest First"},
    {value:"date.asc",label:"Oldest First"},
    {value:"rating.desc",label:"Highest Rated"},
    {value:"rating.asc",label:"Lowest Rated"},
    {value:"popularity.desc",label:"Most Popular"},
    {value:"popularity.asc",label:"Least Popular"}
]);



    function isPersonVisible(id){
        return global.activePage === "person-detail" && String(global.selectedPersonContext?.personId || "") === String(id);
    }

    function buildPersonModel(state){
        const person = state.person;
        const media = global.normalizePersonMediaType(state.media);
        const role = global.normalizePersonRoleSlug(state.role);
        const credits = Array.isArray(state.credits) ? state.credits : [];
        const visible = global.applyEyeFiltersToItems(credits,media,state);
        const items = Object.freeze(visible.map(item=>Object.freeze({
            ...buildTrendingModel({key:"person",media},[item],false,"").items[0],
            firstAirDate:String(item.first_air_date || ""),
            roleLabel:String(item.person_role_label || (item.character ? "Actor: "+item.character : item.job || ""))
        })));
        const name = String(person?.name || "Person");
        const routeLabel = String(person?.name || state.routeSlug || "");
        const route = nextMedia=>global.getPersonDetailRoute(person && !global.personHasRole(person,role,nextMedia) ? "" : role,state.personId,routeLabel,nextMedia,state);
        const roles = person ? global.getPersonAvailableRoles(person,media) : [];
        const biography = String(person?.biography || "").trim();
        const progress = global.getPersonProgressSummary(state);
        return Object.freeze({
            id:String(state.personId || ""),name,role,media,
            bodyState:state.error ? "error" : items.length ? "ready" : state.loading ? "loading" : "empty",
            error:String(state.error || ""),items,
            emptyTitle:credits.length ? "No results found" : media === "movie" ? "No movies found" : "No shows found",
            emptyMessage:credits.length ? "" : "Try switching the media filter.",
            tvRoute:route("tv"),movieRoute:route("movie"),
            roles:Object.freeze([Object.freeze({value:"",label:"All Roles",selected:!role}),...roles.map(item=>Object.freeze({value:item.key,label:item.label,selected:item.key===role}))]),
            eyes:Object.freeze(global.createEyeFilterState(state)),
            profile:person ? Object.freeze({photoUrl:imageURL(person.profile_path,"h632"),biography:biography || "No biography available yet.",longBio:biography.length>260,watched:progress.watched,total:progress.total,percent:Math.max(0,Math.min(100,progress.percent))}) : null
        });
    }

    function renderPerson(state){
        if(!state || !isPersonVisible(state.personId)){ return; }
        lastPersonModel = buildPersonModel(state);
        if(personOwner){ personOwner.render(lastPersonModel); }
        else{ void loadVueDiscover(); }
        global.ensureBrowseGlobalInteractionEvents();
    }

    function attachPersonOwner(owner){
        if(!owner || typeof owner.render!=="function" || typeof owner.unmount!=="function"){ throw new TypeError("Invalid Vue person owner"); }
        personOwner=owner;
        if(lastPersonModel && isPersonVisible(lastPersonModel.id)){ personOwner.render(lastPersonModel); }
    }

    let listingOwner = null;
    let listingMediaRequestId = 0;
    let lastListingModel = null;
    function listingKind(){ return ({'browse-detail':'browse','genre-detail':'genre','discovery-detail':'discovery'})[global.activePage] || ''; }
    function listingState(kind){ return kind === 'browse' ? global.browsePageState : kind === 'genre' ? global.genrePageState : global.discoveryPageState; }
    function buildBrowseControls(filters,labels,hideSort){
        const state=global.createBrowseFilterState(filters.media,filters), media=state.media;
        const references=global.browseOptionState || {};
        const choice=(key,value,label,multi=false,extra={})=>Object.freeze({key,value:String(value),label:String(label),multi,selected:multi ? state[key].includes(String(value)) : String(state[key] || '')===String(value),...extra});
        const named=(key,id,fallback)=>global.getBrowseLabel(labels,key,id,fallback);
        const menu=(key,label,choices,empty='',searchLabel='')=>Object.freeze({key,label,choices:Object.freeze(choices),empty,searchLabel});
        const genres=global.getBrowseGenreOptions(media);
        const menus=[menu('genre','GENRE',genres.map(item=>choice('genres',item.id,item.name,true)),'Genres are loading…')];
        for(const [key,label,items] of [['country','COUNTRY',references.countries],['language','LANGUAGE',references.languages]]){
            menus.push(menu(key,label,[choice(key,'','Any'),...(items || []).map(item=>choice(key,item.code,item.name,false,{search:`${item.name} ${item.code}${key==='country' && item.code.toLowerCase()==='gb' ? ' uk great britain britain' : ''}`}))],`${label==='COUNTRY' ? 'Countries' : 'Languages'} are loading…`,`Search ${key==='country' ? 'countries' : 'languages'}`));
        }
        menus.push(menu('service','SERVICE',global.getBrowseServiceOptions(media).filter(item=>(item.id || item.provider_id)&&(item.name || item.provider_name)).map(item=>{
            const id=String(item.id || item.provider_id), name=String(item.name || item.provider_name);
            return choice('providers',id,named('providers',id,name),true,{logo:imageURL(item.logo_path,'w92'),search:name});
        }),'Streaming services are loading…','Search streaming services'));
        const ranges=global.TVTrackerBrowse?.RUNTIME_RANGES?.[media] || {};
        menus.push(menu('runtime','RUNTIME',[choice('runtime','','Any'),...Object.entries(ranges).map(([key,value])=>choice('runtime',key,value.label || key))]));
        if(!hideSort){const date=media==='movie'?'Release Date':'First Air Date';menus.push(menu('sort','SORT',[
            ['popularity-desc','Popularity — High to Low'],['popularity-asc','Popularity — Low to High'],['rating-desc','Rating — High to Low'],['rating-asc','Rating — Low to High'],['date-desc',`${date} — Newest`],['date-asc',`${date} — Oldest`]
        ].map(([value,label])=>choice('sort',value,label))));}
        const selectedPickers=Object.freeze({
            theme:Object.freeze(state.themes.map(id=>choice('themes',id,named('themes',id,'Theme'),true))),
            company:Object.freeze(state.companies.map(id=>choice('companies',id,named('companies',id,'Production Company'),true))),
            network:Object.freeze(state.network ? [choice('network',state.network,named('networks',state.network,'Network'))] : [])
        });
        const otherChoices=media==='tv' ? [['returning-series','Returning Series'],['in-production','In Production'],['ended','Ended'],['canceled','Canceled']].map(([id,label])=>choice('statuses',id,label,true)) : [choice('certification','','Any'),...(references.movieCertifications || []).map(value=>choice('certification',String(value).toLowerCase(),value))];
        const chips=[];const push=(key,value,label)=>chips.push(choice(key,value,label,Array.isArray(state[key])));
        if(state.upcoming)push('upcoming','1','Upcoming');
        if(state.year)push('year',state.year,state.year);else if(state.decade)push('decade',state.decade,state.decade+'s');
        state.genres.forEach(id=>push('genres',id,named('genres',id,genres.find(item=>String(item.id)===id)?.name || 'Genre')));
        if(state.country)push('country',state.country,global.getDiscoveryCountryName(state.country));
        if(state.language)push('language',state.language,global.getLanguageName(state.language));
        for(const items of Object.values(selectedPickers))items.forEach(item=>chips.push(item));
        state.providers.forEach(id=>push('providers',id,named('providers',id,'Streaming Service')));
        if(state.runtime)push('runtime',state.runtime,ranges[state.runtime]?.label || state.runtime);
        state.statuses.forEach(value=>push('statuses',value,global.getStatusRouteLabel(value)));
        if(state.certification)push('certification',state.certification,'US '+state.certification.toUpperCase());
        return Object.freeze({media,menus:Object.freeze(menus),yearLabel:global.getBrowseYearControlLabel(state),currentDecade:Math.floor(new Date().getFullYear()/10)*10,selectedDecade:global.getBrowseSelectedDecade(state),year:state.year,upcoming:state.upcoming,eyes:Object.freeze(global.createEyeFilterState(state)),chips:Object.freeze(chips),showClear:chips.length>0 || state.sort!=='popularity-desc',selectedPickers,otherChoices:Object.freeze(otherChoices)});
    }
    function buildListingModel(kind,state){
        const media=kind==='discovery' ? global.getDiscoveryPageMediaFromState() : normalizeMedia(state.media);
        const filters=kind==='browse' ? global.createBrowseFilterState(media,state.filters) : kind==='genre' ? global.getGenreBrowseState() : global.getDiscoveryBrowseState();
        const labels=global.createBrowseLabelState(kind==='browse' ? state.labels : state.browseLabels);
        const category=kind==='discovery' && state.type==='discover-category';
        const config=category ? global.getDiscoverCategoryConfig(state.value) : null;
        const compatible=!(kind==='discovery' && state.type==='certification' && media==='tv');
        const shows=Array.isArray(state.shows) ? state.shows : [];
        const items=buildTrendingModel({key:kind,media},global.applyEyeFiltersToItems(shows,media,filters),false,'').items;
        const word=media==='movie' ? 'movies' : 'shows';
        const title=kind==='browse' ? `Browse ${media==='movie' ? 'Movies' : 'TV Shows'}` : String(state.name || (kind==='genre' ? global.getGenreDisplayNameFromSlug(state.slug) || 'Genre' : media==='movie' ? 'Movies' : 'Shows'));
        return Object.freeze({kind,identity:kind==='browse' ? 'browse' : kind+':'+(state.genreId || state.type+':'+state.value),route:global.getCurrentAppRoute(),media,title,
            showMedia:compatible && !category,controls:compatible ? buildBrowseControls(filters,labels,!!(config && ['popular','top-rated'].includes(config.category))) : null,
            bodyState:state.error ? 'error' : items.length ? 'ready' : state.loading ? 'loading' : 'empty',error:String(state.error || ''),errorTitle:kind==='browse' ? 'Browse could not load' : kind==='genre' ? 'Genre could not load' : 'Page could not load',
            emptyTitle:shows.length ? 'No results found' : `No ${word} found`,emptyMessage:category ? 'No titles are available for this category right now.' : 'Remove or change one or more filters.',
            loadingMore:!!state.loading && items.length>0,hasMore:!state.loading && Number(state.page || 1)<Number(state.totalPages || 1),items
        });
    }
    function renderListing(kind,state){
        if(listingKind()!==kind || !state)return;
        lastListingModel=buildListingModel(kind,state);
        if(listingOwner)listingOwner.render(lastListingModel);else void loadVueDiscover();
    }
    function attachListingOwner(owner){
        if(!owner || typeof owner.render!=='function' || typeof owner.unmount!=='function')throw new TypeError('Invalid Vue Browse listing owner');
        listingOwner=owner;
        const kind=listingKind();if(kind)renderListing(kind,listingState(kind));
    }
    const listingActions=Object.freeze({
        back(){if(listingKind())global.navigateBackOrRouteFallback('/app/discover');},
        async setMedia(media){
            if(!listingKind())return;const serial=++listingMediaRequestId,route=global.getCurrentAppRoute(),current=global.getCurrentBrowseState();
            if(current.media===media)return;
            const mapped=await global.mapBrowseGenresForMedia(current,media,global.getCurrentBrowseLabels());
            if(serial!==listingMediaRequestId || !listingKind() || global.getCurrentAppRoute()!==route)return;
            await global.navigateToBrowseState(mapped.state,mapped.labels);
        },
        async choose(choice){
            if(!listingKind())return;const api=global.getBrowseStateAPI(),current=global.getCurrentBrowseState(),labels=global.getCurrentBrowseLabels();
            const next=choice.multi ? api.toggleMulti(current,choice.key,choice.value) : api.setSingle(current,choice.key,choice.key==='upcoming' ? choice.value==='1' : choice.value);
            if(choice.label && ['genres','themes','companies','providers','network'].includes(choice.key))global.setBrowseLabel(labels,choice.key==='network'?'networks':choice.key,choice.value,choice.label);
            await global.navigateToBrowseState(next,labels);
        },
        async remove(choice){if(listingKind())await global.navigateToBrowseState(global.getBrowseStateAPI().removeValue(global.getCurrentBrowseState(),choice.key,choice.value),global.getCurrentBrowseLabels());},
        async clear(){if(listingKind())await global.navigateToBrowseState(global.getBrowseStateAPI().clearFilters(global.getCurrentBrowseState()),global.createBrowseLabelState());},
        async toggleEye(key){if(listingKind())await global.handleEyeFilterToggle(key);},
        async searchPicker(type,query){
            if(!listingKind())return [];const route=global.getCurrentAppRoute();const items=await global.searchBrowsePicker(type,query);
            if(!listingKind() || route!==global.getCurrentAppRoute())return [];
            const counts=new Map();items.forEach(item=>{const name=String(item.name || '').toLocaleLowerCase();counts.set(name,(counts.get(name)||0)+1);});
            return Object.freeze(items.slice(0,10).map(item=>{const name=String(item.name || ''),country=counts.get(name.toLocaleLowerCase())>1 && item.origin_country ? global.getDiscoveryCountryName(item.origin_country) : '';return Object.freeze({id:String(item.id),name,country,label:country?`${name} · ${country}`:name,logo:type==='company'?imageURL(item.logo_path,'w92'):''});}));
        },
        async viewMore(){const kind=listingKind();if(!kind || listingState(kind).loading)return;await (kind==='browse'?global.loadBrowsePageResults:kind==='genre'?global.loadGenrePageResults:global.loadDiscoveryFilterPageResults)({append:true});},
        async openMedia(item){
            const kind=listingKind();if(!kind || !item?.id)return;
            if(kind==='browse'){
                const backRoute=global.getBrowseRoute(global.getCurrentBrowseState());
                if(item.media==='movie')await global.openMoviePage(item.id,{movieName:item.name,navigationContext:'discover',backRoute});
                else await global.openShowDetailsPage(item.id,{showName:item.name,navigationContext:'discover',backRoute});
            }else if(item.media==='movie')await global.openMoviePage(item.id,{movieName:item.name});
            else await global.openDiscoverShowModal({id:item.id,name:item.name,poster_path:item.posterPath,overview:item.overview,first_air_date:item.firstAirDate});
        }
    });

    const personActions = Object.freeze({
        back(){ global.navigateBackOrRouteFallback("/app/discover"); },
        async setMedia(value){
            const state=global.personPageState;
            if(!isPersonVisible(state.personId)){ return; }
            const media=global.normalizePersonMediaType(value);
            if(media===state.media){ return; }
            const role=state.person && global.personHasRole(state.person,state.role,media) ? state.role : "";
            await global.openPersonPage(role,state.personId,{media,eyeState:global.createEyeFilterState(state),personName:state.person?.name || state.routeSlug || "",navigationContext:"discover"});
        },
        async setRole(value){
            const state=global.personPageState;
            if(!isPersonVisible(state.personId)){ return; }
            const requested=global.normalizePersonRoleSlug(value);
            const role=state.person && global.personHasRole(state.person,requested,state.media) ? requested : "";
            if(role===global.normalizePersonRoleSlug(state.role)){ return; }
            await global.openPersonPage(role,state.personId,{media:state.media,eyeState:global.createEyeFilterState(state),personName:state.person?.name || state.routeSlug || "",navigationContext:"discover"});
        },
        async toggleEye(key){
            if(global.activePage==="person-detail"){ await global.handleEyeFilterToggle(key); }
        },
        async openMedia(item){
            if(!item || !item.id){ return; }
            if(item.media==="movie"){ await global.openMoviePage(item.id,{movieName:item.name}); }
            else{ await global.openDiscoverShowModal({id:item.id,name:item.name,poster_path:item.posterPath,overview:item.overview,first_air_date:item.firstAirDate}); }
        }
    });

    function isIndexVisible(){ return global.activePage === "collections-index"; }

    function buildIndexModel(state){
        const visible = Array.isArray(state.visibleCollections) ? state.visibleCollections : (state.collections || []);
        const items = Object.freeze(visible.filter(isPromotableCollection).map(buildCollectionItem));
        const genres = (state.availableGenres || []).map(item=>Object.freeze({value:String(item.id),label:String(item.name || "Genre "+item.id),selected:String(state.genre || "")===String(item.id)}));
        const decades = (state.availableDecades || []).map(value=>Object.freeze({value:String(value),label:value+"s",selected:String(state.decade || "")===String(value)}));
        const sorts = COLLECTION_INDEX_SORT_OPTIONS.map(item=>Object.freeze({...item,selected:String(state.sort || "popularity.desc")===item.value}));
        const chips = [];
        if(state.genre){ chips.push(Object.freeze({key:"genre",value:String(state.genre),label:"Genre: "+(genres.find(item=>item.value===String(state.genre))?.label || "Genre "+state.genre)})); }
        if(state.decade){ chips.push(Object.freeze({key:"decade",value:String(state.decade),label:"Decade: "+state.decade+"s"})); }
        if(state.sort && state.sort!=="popularity.desc"){ chips.push(Object.freeze({key:"sort",value:String(state.sort),label:"Sort: "+(sorts.find(item=>item.value===state.sort)?.label || "Most Popular")})); }
        const any = selected=>Object.freeze({value:"",label:"Any",selected});
        const hasSearch = !!String(state.query || "").trim();
        const hasFilters = hasSearch || chips.length>0;
        return Object.freeze({
            bodyState:state.error ? "error" : items.length ? "ready" : state.loading || state.liveSearchLoading || state.building ? "loading" : "empty",
            error:String(state.error || ""),items,
            searchDraft:typeof state.searchDraft === "string" ? state.searchDraft : String(state.query || ""),
            genres:Object.freeze(genres.length ? [any(!state.genre),...genres] : []),
            decades:Object.freeze(decades.length ? [any(!state.decade),...decades] : []),
            sorts:Object.freeze(sorts),chips:Object.freeze(chips),
            hasMore:visible.length<Number(state.totalResults || visible.length || 0),
            emptyTitle:hasSearch ? "No matching collections found." : "No collections found",
            emptyMessage:hasFilters ? "Try another search or change one or more filters." : "Try again later."
        });
    }

    function afterIndexRender(){
        global.ensureBrowseGlobalInteractionEvents();
        global.restoreCollectionReturnPositionSoon(global.getCollectionsRoute(global.collectionsPageState));
    }

    function renderIndex(state){
        if(!isIndexVisible()){ return; }
        lastIndexModel = buildIndexModel(state || {});
        if(indexOwner){ indexOwner.render(lastIndexModel);afterIndexRender(); }
        else{ void loadVueDiscover(); }
    }

    function attachIndexOwner(owner){
        if(!owner || typeof owner.render!=="function" || typeof owner.unmount!=="function"){ throw new TypeError("Invalid Vue collections index owner"); }
        indexOwner = owner;
        if(lastIndexModel && isIndexVisible()){ indexOwner.render(lastIndexModel);afterIndexRender(); }
    }

    const indexActions = Object.freeze({
        back(){ global.navigateBackOrRouteFallback("/app/discover"); },
        searchDraft(value){
            if(!isIndexVisible()){ return; }
            global.collectionsPageState.searchDraft = String(value || "");
            global.cancelCollectionsLiveSearchRequest();
        },
        search(value){
            if(!isIndexVisible()){ return; }
            global.applyCollectionsIndexState({query:String(value || ""),searchDraft:String(value || ""),page:1},{replaceRoute:true});
        },
        setFilter(key,value){
            if(!isIndexVisible() || !["genre","decade","sort"].includes(key)){ return; }
            global.applyCollectionsIndexState({[key]:value,page:1});
        },
        clearFilter(key){
            if(!isIndexVisible()){ return; }
            if(key==="all"){ global.applyCollectionsIndexState({genre:"",decade:"",sort:"popularity.desc",page:1}); }
            else if(["query","genre","decade","sort"].includes(key)){ global.applyCollectionsIndexState({[key]:key==="sort"?"popularity.desc":"",page:1}); }
        },
        viewMore(){
            if(isIndexVisible()){ global.applyCollectionsIndexState({page:Math.max(1,Math.floor(Number(global.collectionsPageState.page || 1)))+1}); }
        }
    });

    function isCollectionVisible(id){
        return global.activePage === "collection-detail" && String(global.selectedCollectionId || "") === String(id);
    }

    function buildCollectionModel(state){
        const filters = global.createCollectionDetailFilterState(state.filters || {});
        const collection = state.collection || {};
        const title = String(collection.name || "Collection").trim() || "Collection";
        const source = Array.isArray(state.visibleMovies) ? state.visibleMovies : (state.movies || []);
        const items = buildTrendingModel({key:"collection",media:"movie"},source,state.loading,state.error).items;
        const options = (source, key, label, selected) => Object.freeze((source || []).map(item=>Object.freeze({value:String(item[key]),label:String(item[label]),selected:selected(String(item[key]))})));
        const genres = options(state.availableGenres,"id","name",id=>filters.genres.includes(id));
        const languages = options(state.availableLanguages,"code","name",code=>filters.language === code);
        const sorts = options(COLLECTION_DETAIL_SORT_OPTIONS,"value","label",value=>filters.sort === value);
        const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
        const selectedDecade = Number(filters.decade) || (filters.year ? Math.floor(Number(filters.year) / 10) * 10 : 0);
        const visibleDecade = selectedDecade ? Math.max(1870,Math.min(currentDecade,selectedDecade)) : 0;
        const decades = [];
        for(let decade=currentDecade;decade>=1870;decade-=10){
            decades.push(Object.freeze({value:String(decade),label:decade+"s",selected:decade===selectedDecade}));
        }
        const years = visibleDecade ? Array.from({length:10},(_,index)=>{
            const value = String(visibleDecade + index);
            return Object.freeze({value,label:value,selected:filters.year===value});
        }) : [];
        const chips = [];
        const push = (key,value,label)=>chips.push(Object.freeze({key,value,label}));
        if(filters.year){ push("year",filters.year,filters.year); }
        else if(filters.decade){ push("decade",filters.decade,filters.decade+"s"); }
        filters.genres.forEach(id=>push("genres",id,genres.find(item=>item.value===id)?.label || global.getCollectionGenreLabel(id)));
        if(filters.language){ push("language",filters.language,global.getLanguageName(filters.language)); }
        if(filters.sort !== "collection-order"){ push("sort",filters.sort,sorts.find(item=>item.value===filters.sort)?.label || "Collection Order"); }
        return Object.freeze({
            id:String(state.collectionId || ""),title,
            route:global.getCollectionDetailRouteWithFilters(state.collectionId,collection.name || state.routeSlug || "collection",filters),
            bodyState:state.error ? "error" : items.length ? "ready" : state.loading ? "loading" : "empty",
            error:String(state.error || ""),emptyMessage:global.getCollectionDetailEmptyMessage(state),
            showFilters:!state.loading && !state.error && !!state.collection,
            countLabel:items.length === 1 ? "1 movie" : items.length + " movies",
            filters:Object.freeze({...filters,genres:Object.freeze(filters.genres.slice())}),items,
            genres,languages:languages.length ? Object.freeze([Object.freeze({value:"",label:"Any",selected:!filters.language}),...languages]) : languages,
            sorts,decades:Object.freeze(decades),years:Object.freeze(years),chips:Object.freeze(chips),
            currentDecade,visibleDecade,yearLabel:global.getBrowseYearControlLabel(filters)
        });
    }

    function renderCollection(state){
        if(!state || !isCollectionVisible(state.collectionId)){ return; }
        lastCollectionModel = buildCollectionModel(state);
        if(collectionOwner){ collectionOwner.render(lastCollectionModel); }
        else{ void loadVueDiscover(); }
        if(typeof global.ensureBrowseGlobalInteractionEvents === "function"){ global.ensureBrowseGlobalInteractionEvents(); }
    }

    function attachCollectionOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Collection owner");
        }
        collectionOwner = owner;
        if(lastCollectionModel && isCollectionVisible(lastCollectionModel.id)){ collectionOwner.render(lastCollectionModel); }
    }

    const collectionActions = Object.freeze({
        back(){ global.navigateBackOrRouteFallback("/app/collections"); },
        setFilter(key,value){
            const current = global.createCollectionDetailFilterState(global.collectionDetailPageState.filters || {});
            if(key === "genre"){
                const genre = global.normalizeCollectionId(value);
                const genres = genre && current.genres.includes(genre) ? current.genres.filter(id=>id!==genre) : genre ? current.genres.concat(genre) : [];
                global.applyCollectionDetailFilterState({genres});
            }else if(key === "year" || key === "decade"){
                global.applyCollectionDetailFilterState({year:"",decade:"",[key]:value});
            }else if(key === "language" || key === "sort"){
                global.applyCollectionDetailFilterState({[key]:value});
            }
        },
        removeFilter(key,value){
            if(key === "genres"){
                const current = global.createCollectionDetailFilterState(global.collectionDetailPageState.filters || {});
                global.applyCollectionDetailFilterState({genres:current.genres.filter(id=>id!==value)});
            }else if(["year","decade","language","sort"].includes(key)){
                global.applyCollectionDetailFilterState({[key]:key === "sort" ? "collection-order" : ""});
            }
        },
        clearFilters(){ global.applyCollectionDetailFilterState(global.createCollectionDetailFilterState()); },
        toggleEye(key){
            if(!["fadeWatched","hideWatched","hidePlan","hideFavorites"].includes(key)){ return; }
            const current = global.createCollectionDetailFilterState(global.collectionDetailPageState.filters || {});
            global.applyCollectionDetailFilterState({[key]:!current[key]});
        },
        async openMedia(item,backRoute){
            if(item && item.id){ await global.openMoviePage(item.id,{movieName:item.name,navigationContext:"discover",backRoute}); }
        }
    });

    const trendingActions = Object.freeze({
        back(){
            if(typeof global.navigateBackOrRouteFallback === "function"){
                global.navigateBackOrRouteFallback("/app/discover");
            }
        },
        async openMedia(item,key){
            if(!item || !item.id){ return; }
            const api = global.TVTrackerTrending;
            const backRoute = api ? api.routeFor(key) : "/app/discover";
            if(item.media === "movie" && typeof global.openMoviePage === "function"){
                await global.openMoviePage(item.id,{movieName:item.name,navigationContext:"discover",backRoute});
            }else if(typeof global.openShowDetailsPage === "function"){
                await global.openShowDetailsPage(item.id,{showName:item.name,navigationContext:"discover",backRoute});
            }
        }
    });

    const actions = Object.freeze({
        setGenreMedia(media){
            const cleanMedia = normalizeMedia(media);
            global.discoverGenreMedia = cleanMedia;
            if(typeof global.renderDiscoverHub === "function"){
                global.renderDiscoverHub();
                return;
            }
            render();
        },
        async openMedia(item){
            const id = Number(item && item.id || 0);
            if(!id){ return; }
            const backRoute = typeof global.lockSearchRouteBeforeResultOpen === "function"
                ? String(global.lockSearchRouteBeforeResultOpen() || "")
                : "";
            if(item && item.media === "movie" && typeof global.openMoviePage === "function"){
                await global.openMoviePage(id,{movieName:String(item.name || ""),navigationContext:"discover",backRoute});
                return;
            }
            if(typeof global.openShowDetailsPage === "function"){
                await global.openShowDetailsPage(id,{showName:String(item && item.name || ""),navigationContext:"discover",backRoute});
            }
        }
    });

    global.TVTrackerDiscoverVueBridge = Object.freeze({
        attachListingOwner, renderListing, buildListingModel, buildBrowseControls, listingActions,
        attachPersonOwner,
        renderPerson,
        buildPersonModel,
        personActions,
        attachIndexOwner,
        renderIndex,
        buildIndexModel,
        indexActions,
        attachCollectionOwner,
        renderCollection,
        buildCollectionModel,
        collectionActions,
        attachVueOwner,
        attachTrendingOwner,
        renderTrending,
        buildTrendingModel,
        trendingActions,
        render,
        renderLoadFailure,
        renderLoading,
        actions,
        buildViewModel,
        ownership:"vue-content"
    });
    global.renderDiscoverHubContent = render;


// --TVT-discover-gate-owner-begin--
const DISCOVER_GATE_MAX_MS = 12000;
let discoverGateActive = false;
let discoverGateStableReady = false;
let discoverGateTrendingSettled = false;
let discoverGateTrendingPromise = null;
let discoverGateTimer = null;
let discoverGateCycleId = 0;
let discoverGateExpired = false;

function discoverGateIsHubVisible(){
    if(window.activePage !== "discover"){
        return false;
    }
    if(typeof window.shouldShowDiscoverHub === "function"){
        return !!window.shouldShowDiscoverHub();
    }
    return true;
}

function discoverGateBaseSettled(){
    const state = window.discoverHubState && typeof window.discoverHubState === "object"
    ? window.discoverHubState
    : {};
    return state.loading !== true && (state.loaded === true || !!state.error);
}

function discoverGateRenderSkeleton(){
    const bridge = window.TVTrackerDiscoverVueBridge;
    if(bridge && typeof bridge.renderLoading === "function"){
        bridge.renderLoading();
    }
}

function discoverGateClearTimer(){
    if(discoverGateTimer){
        clearTimeout(discoverGateTimer);
        discoverGateTimer = null;
    }
}

function discoverGateRelease(force=false){
    if(!discoverGateActive || !discoverGateIsHubVisible()){
        return false;
    }
    if(!force && (!discoverGateBaseSettled() || !discoverGateTrendingSettled)){
        discoverGateRenderSkeleton();
        return false;
    }
    discoverGateActive = false;
    discoverGateStableReady = true;
    discoverGateClearTimer();
    window.renderDiscoverHubContent();
    return true;
}

function discoverGateEnsureTrending(){
    if(discoverGateTrendingPromise){
        return discoverGateTrendingPromise;
    }
    const api = window.TVTrackerTrending;
    if(!api || typeof api.loadHubRows !== "function"){
        discoverGateTrendingSettled = true;
        discoverGateRelease(false);
        return Promise.resolve([]);
    }

    discoverGateTrendingSettled = false;
    discoverGateTrendingPromise = Promise.resolve()
    .then(()=>api.loadHubRows(false))
    .catch(()=>[])
    .finally(()=>{
        // A refresh can reuse a request started before the previous gate timed out.
        // Its completion settles the shared request for the current gate as well.
        discoverGateTrendingSettled = true;
        discoverGateTrendingPromise = null;
        discoverGateRelease(false);
    });
    return discoverGateTrendingPromise;
}

function discoverGateBegin(){
    if(!discoverGateIsHubVisible()){
        return false;
    }
    if(!discoverGateActive){
        discoverGateActive = true;
        discoverGateStableReady = false;
        discoverGateExpired = false;
        discoverGateTrendingSettled = false;
        discoverGateCycleId += 1;
        discoverGateClearTimer();
        const cycle = discoverGateCycleId;
        discoverGateTimer = setTimeout(()=>{
            if(cycle === discoverGateCycleId){
                discoverGateExpired = true;
                discoverGateTrendingSettled = true;
                discoverGateRelease(true);
            }
        },DISCOVER_GATE_MAX_MS);
        discoverGateRenderSkeleton();
        discoverGateEnsureTrending();
        return true;
    }
    discoverGateRenderSkeleton();
    return true;
}

function renderDiscoverHub(){
    if(!discoverGateIsHubVisible()){
        return;
    }

    const state = window.discoverHubState && typeof window.discoverHubState === "object"
    ? window.discoverHubState
    : {loaded:false,loading:false,error:"",sections:[],genres:[]};

    if(state.loading === true){
        discoverGateStableReady = false;
    }

    if(discoverGateStableReady && state.loading !== true){
        return window.renderDiscoverHubContent();
    }

    discoverGateBegin();
    if(discoverGateExpired || (discoverGateBaseSettled() && discoverGateTrendingSettled)){
        discoverGateRelease(discoverGateExpired);
    }
    return undefined;
}

window.TVTrackerDiscoverStability = Object.freeze({
    available:true,
    begin:discoverGateBegin,
    release:discoverGateRelease,
    isGateActive:()=>discoverGateActive,
    isStableReady:()=>discoverGateStableReady,
    baseSettled:discoverGateBaseSettled,
    MAX_GATE_MS:DISCOVER_GATE_MAX_MS
});
window.renderDiscoverHub = renderDiscoverHub;
// --TVT-discover-gate-owner-end--

    const currentPath = String(global.location && global.location.pathname || "");
    if(/^\/app\/discover(?:\/|$)/.test(currentPath)){
        void loadVueDiscover();
    }
})(window);
