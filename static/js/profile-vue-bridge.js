(function(global){
    "use strict";
    let owner = null;
    let currentModel = null;
    const text = value=>String(value == null ? "" : value);
    const count = value=>Number(value || 0).toLocaleString();
    const active = ()=>global.activePage === "profile";
    function slots(kind,items){
        return Object.freeze(Array.from({length:8},(_,index)=>{
            const item = (Array.isArray(items) ? items : [])[index];
            const id = item ? text(kind === "movie" ? item.id || item.tmdb_id : item.tmdb_id) : "";
            const title = text(item && item.title || `favorite ${kind}`);
            const route = !id ? "" : kind === "movie" ? global.getMovieDetailRoute(id,title) : global.getShowDetailRoute(id,title);
            return Object.freeze({kind,id,title,route,poster:item && item.poster_path ? global.trackerImageURL(item.poster_path,"w500") : ""});
        }));
    }
    function ranks(items,network=false){
        return Object.freeze((Array.isArray(items) ? items : []).map(item=>Object.freeze({
            name:text(item.name),count:count(item.count),percentage:text(Number(item.percentage)),
            logo:network && item.logo_path ? global.trackerImageURL(item.logo_path,"w92") : ""
        })));
    }
    function viewModel(stats,movies=[],sync=null){
        const cardFields = [
            ["WATCH HOURS","watchHoursRounded"],["EPISODES WATCHED","episodesWatched"],
            ["SHOWS TRACKED","showsTracked"],["COMPLETED SHOWS","completedShows"],
            ["WATCHING","watchingShows"],["PLAN TO WATCH","planShows"],
            ["PAUSED","pausedShows"],["DROPPED","droppedShows"],
            ["REGULAR EPISODES","regularEpisodesWatched"],["SPECIAL EPISODES","specialEpisodesWatched"]
        ];
        const updating = sync && (sync.running || sync.pending > 0);
        const warning = Boolean(!updating && sync && sync.failed > 0);
        const syncText = updating
            ? `Updating network metadata${sync.current ? ` • ${text(sync.current)}` : ""} • ${sync.percent}%`
            : warning ? `${sync.failed} network metadata item${sync.failed === 1 ? "" : "s"} will retry next time.` : "";
        return Object.freeze({
            view:global.activeProfileView === "stats" ? "stats" : "home",
            identity:Object.freeze({username:text(stats.username),avatar_type:text(stats.avatar_type),avatar_preset:text(stats.avatar_preset),avatar_data:text(stats.avatar_data)}),
            headerClass:global.getProfileHeaderClass(stats),
            headerImage:stats.header_type === "upload" ? text(stats.header_image) : "",
            watchTime:text(stats.watchTimeText),episodes:count(stats.episodesWatched),
            favorites:Object.freeze([
                Object.freeze({kind:"show",label:"FAVORITE SHOWS",slots:slots("show",stats.favoriteShows)}),
                Object.freeze({kind:"movie",label:"FAVORITE MOVIES",slots:slots("movie",movies)})
            ]),
            cards:Object.freeze([{label:"WATCH TIME",value:text(stats.watchTimeText)},...cardFields.map(([label,field])=>({label,value:count(stats[field])}))]),
            genres:ranks(stats.topGenres),networks:ranks(stats.topNetworks,true),syncText,syncWarning:warning
        });
    }
    function failure(){
        if(!active()) return;
        const runtime = global.TVTrackerClientRuntime;
        if(runtime && typeof runtime.report === "function") runtime.report({category:"runtime",surface:"app",code:"vue_profile_load_failed"});
        if(runtime && typeof runtime.renderSurfaceFailure === "function") runtime.renderSurfaceFailure({
            rootId:"profile-content",marker:"data-tvtracker-profile-vue-load-failed",title:"Profile unavailable",message:"Reload the page to try again."
        });
    }
    async function renderProfile(){
        if(!active()) return false;
        let model;
        try{
            const stats=global.getProfileStats();
            const sync=global.activeProfileView === "stats" ? global.getNetworkMetadataSyncSummary() : null;
            model=viewModel(stats,global.getFavoriteMovies(),sync);
            currentModel=model;
            if(!owner){
                const loader=global.TVTrackerVueLoader;
                if(loader && typeof loader.load === "function") await loader.load();
            }
            if(!active() || currentModel !== model) return false;
            if(!owner){failure();return false;}
            owner.render(model);
            if(model.view === "stats") void global.startNetworkMetadataSync();
            return true;
        }catch(error){failure();return false;}
    }
    const actions=Object.freeze({
        setView(view){global.activeProfileView=view === "stats" ? "stats" : "home";void renderProfile();},
        editFavorites:kind=>global.openFavoritesPopup(kind === "movie" ? "movie" : "show"),
        openFavorite(item){
            if(!item || !item.id) return;
            if(item.kind === "movie") global.openMoviePage(item.id,{movieName:item.title,navigationContext:"profile"});
            else global.openShowDetailsPage(item.id,{navigationContext:"profile"});
        }
    });
    global.TVTrackerProfileVueBridge=Object.freeze({
        actions,viewModel,render:renderProfile,
        attachVueOwner(value){
            if(!value || typeof value.render !== "function" || typeof value.unmount !== "function") throw new TypeError("Invalid Profile Vue owner");
            owner=value;
            if(currentModel && active()) owner.render(currentModel);
        }
    });
    global.renderProfile=renderProfile;
})(window);
