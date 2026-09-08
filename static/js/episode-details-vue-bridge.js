(function(global){
    "use strict";
    let owner = null;
    let currentModel = null;
    let requestVersion = 0;

    function text(value){ return String(value === null || typeof value === "undefined" ? "" : value); }
    function identity(id,season,episode){ return `${text(id)}::${Number(season)}-${Number(episode)}`; }
    function isCurrent(model){
        const selected = global.selectedEpisodeContext;
        return global.activePage === "episode-detail" && selected &&
            identity(selected.showId,selected.season,selected.episode) === model.key;
    }
    function report(code,category="runtime"){
        if(global.TVTrackerClientRuntime && typeof global.TVTrackerClientRuntime.report === "function"){
            global.TVTrackerClientRuntime.report({category,surface:"detail",code});
        }
    }
    function renderFailure(model){
        if(!isCurrent(model)) return;
        const runtime = global.TVTrackerClientRuntime;
        report("vue_episode_details_load_failed");
        if(runtime && typeof runtime.renderSurfaceFailure === "function") runtime.renderSurfaceFailure({
            rootId:"episode-detail-content", marker:"data-tvtracker-episode-vue-load-failed",
            title:"Episode details unavailable", message:"Reload the page to try again."
        });
    }
    async function paint(model){
        currentModel = model;
        if(!isCurrent(model)) return false;
        if(!owner){
            const loader = global.TVTrackerVueLoader;
            if(!loader || typeof loader.load !== "function") { renderFailure(model); return false; }
            try { await loader.load(); } catch(error) { /* The shared loader reports safe diagnostics. */ }
        }
        if(currentModel !== model || !isCurrent(model)) return false;
        if(!owner){ renderFailure(model); return false; }
        try { owner.render(model); return true; }
        catch(error){ report("vue_episode_details_render_failed"); renderFailure(model); return false; }
    }
    function baseModel(state,id,season,episode){
        return {
            key:identity(id,season,episode),state,showId:text(id),season:Number(season),number:Number(episode),
            code:`S${Number(season)}E${String(Number(episode)).padStart(2,"0")}`,
            title:"",showTitle:"",showRoute:"",backdrop:"",airDate:"",runtime:"",rating:"",overview:"",
            status:"",watchedText:"",watched:false,canToggle:false,preview:false,
            previous:null,next:null,links:[],guests:[],cast:[],crew:[]
        };
    }
    function people(source,crew=false){
        return (Array.isArray(source) ? source : []).map(person=>{
            const id = Number(person && person.id || 0);
            const name = text(person && person.name || (crew ? "Unknown" : "Unknown Actor"));
            const routeRole = crew ? global.getCrewRouteRole(person,person && person.job || "Crew") : "acting";
            return Object.freeze({
                id,name,routeRole,
                role:crew ? text(person.job || "Crew") + (person.episode_count ? ` • ${Number(person.episode_count)} episodes` : "") : text(person.character || "Unknown Role"),
                route:id > 0 && routeRole ? text(global.getPersonDetailRoute(routeRole,id,name,"tv")) : "",
                photo:person.profile_path ? text(global.trackerImageURL(person.profile_path,"w185")) : ""
            });
        });
    }
    function target(show,value){
        return value ? Object.freeze({season:value.season,episode:value.episode,
            route:text(global.getEpisodeDetailRoute(show.tmdb_id,value.season,value.episode,show.title || show.name || ""))}) : null;
    }
    function viewModel(show,season,episode,context={},crew=[]){
        const episodeData = global.v2GetEpisodeDetailsObject(show,season,episode);
        const history = global.getEpisodeHistoryEntry(show.tmdb_id,season,episode);
        const watched = global.isEpisodeWatched(show,season,episode);
        const aired = global.isEpisodeLoggable(episodeData,show,season);
        const preview = Boolean(context.discoverPreview);
        const imagePath = episodeData.still_path || show.backdrop_path || "";
        const credits = global.getV2EpisodeCreditGroups(show,season,episode);
        const ids = episodeData.external_ids || {};
        const links = [];
        if(ids.imdb_id) links.push({label:"IMDb",url:`https://www.imdb.com/title/${encodeURIComponent(text(ids.imdb_id))}/`});
        if(ids.tvdb_id) links.push({label:"TVDB",url:`https://thetvdb.com/dereferrer/episode/${encodeURIComponent(text(ids.tvdb_id))}`});
        if(show.tmdb_id) links.push({label:"TMDB",url:`https://www.themoviedb.org/tv/${encodeURIComponent(text(show.tmdb_id))}/season/${Number(season)}/episode/${Number(episode)}`});
        const rating = Number(episodeData.vote_average || 0);
        return Object.freeze({...baseModel("ready",show.tmdb_id,season,episode),
            title:text(episodeData.name || "Untitled Episode"),showTitle:text(show.title || "Untitled Show"),
            showRoute:text(global.getShowDetailRoute(show.tmdb_id,show.title || show.name || "")),
            backdrop:imagePath ? `linear-gradient(to top, #080808 0%, rgba(8,8,8,0.9) 13%, rgba(8,8,8,0.52) 46%, rgba(8,8,8,0.14) 100%), ${global.trackerBackgroundImage(imagePath,"original")}` : "linear-gradient(to top, #080808 0%, #141414 100%)",
            airDate:episodeData.air_date ? text(global.formatAirDate(episodeData.air_date,episodeData,show)) : "Unknown",
            runtime:episodeData.runtime ? `${episodeData.runtime} min` : "",rating:rating > 0 ? rating.toFixed(1) : "",
            overview:text(episodeData.overview || "No episode overview available."),watched,preview,
            status:preview ? "Preview" : watched ? "Watched" : aired ? "Unwatched" : "Not aired yet",
            watchedText:preview ? "Not in library" : history && history.watched_at ? text(global.formatEpisodeWatchedDate(history.watched_at)) : "Not watched",
            canToggle:!preview && (aired || watched),
            previous:target(show,global.getPreviousEpisodeTarget(show,season,episode)),
            next:target(show,global.getNextEpisodeTarget(show,season,episode)),
            links:Object.freeze(links),guests:Object.freeze(people(credits.guestStars)),cast:Object.freeze(people(credits.cast)),
            crew:Object.freeze(global.collectCrewJobGroups(crew).map(group=>Object.freeze({label:group.label,people:Object.freeze(people(group.people,true))})))
        });
    }
    function renderEpisodeDetails(show,season,episode,context={}){
        const version = ++requestVersion;
        const key = `${Number(season)}-${Number(episode)}`;
        const cached = show._episode_crew_credits && show._episode_crew_credits[key];
        const model = viewModel(show,season,episode,context,cached || []);
        void paint(model);
        const service = global.TVTrackerEpisodeCrew;
        if(!cached && service && typeof service.load === "function"){
            service.load(show,season,episode).then(crew=>{
                if(version === requestVersion && isCurrent(model)) void paint(viewModel(show,season,episode,context,crew));
            }).catch(()=>report("episode_crew_load_failed","provider"));
        }
    }
    function renderState(state,id,season,episode){
        requestVersion++;
        return paint(Object.freeze(baseModel(state,id,season,episode)));
    }
    const actions = Object.freeze({
        back:()=>global.closeEpisodeDetailsPage(),
        navigate:(model,destination)=>{
            if(!isCurrent(model)) return;
            global.openEpisodeModal(model.showId,destination.season,destination.episode,{
                backToShow:true,discoverPreview:model.preview,replaceInPlace:true,replaceRoute:true
            });
        }
    });
    global.TVTrackerEpisodeDetailsBridge = Object.freeze({
        actions,viewModel,renderState,
        release(){
            requestVersion++;
            currentModel = null;
            if(owner) owner.unmount();
        },
        attachVueOwner(value){
            if(!value || typeof value.render !== "function" || typeof value.unmount !== "function") throw new TypeError("Invalid Episode Details Vue owner");
            owner = value;
            if(currentModel && isCurrent(currentModel)) owner.render(currentModel);
        }
    });
    global.renderEpisodeDetails = renderEpisodeDetails;
})(window);
