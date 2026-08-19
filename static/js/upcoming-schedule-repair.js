/* Tracker-owned recovery for Watching shows missing an Upcoming schedule. */
(function(global){
    "use strict";

    if(global.TVTrackerUpcomingScheduleRepair) return;

    const UPCOMING_REPAIR_COOLDOWN_MS = 30 * 60 * 1000;
    const UPCOMING_REPAIR_MAX_PER_PASS = 8;
    const WRAPPER_MARK = "_tvtrackerTargetedRepair";
    const upcomingRepairAttempts = new Map();
    let upcomingRepairBusy = false;
    let installed = false;

    function watchedEpisodeCount(show){
        const watched = show && show.episodes_watched && typeof show.episodes_watched === "object" ? show.episodes_watched : {};
        return Object.values(watched).reduce((total,episodes)=>total + (Array.isArray(episodes) ? episodes.length : 0),0);
    }

    function hasCurrentOrFutureLastAirDate(show){
        const raw = String(show && show.last_air_date || "").trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
        const value = Date.parse(raw + "T23:59:59Z");
        return Number.isFinite(value) && value >= Date.now() - 24 * 60 * 60 * 1000;
    }

    function shouldRepairWatchingShow(show){
        if(!show || show.status !== "watching") return false;
        const tmdbStatus = String(show.tmdb_status || "").trim().toLowerCase();
        if(tmdbStatus === "canceled" || tmdbStatus === "cancelled") return false;
        const activeStatus = tmdbStatus === "returning series" || tmdbStatus === "in production" || tmdbStatus === "planned" || tmdbStatus === "pilot";
        const nextEpisode = show.next_episode_to_air && typeof show.next_episode_to_air === "object" ? show.next_episode_to_air : null;
        const knownUnwatched = Number(show.number_of_episodes || 0) > watchedEpisodeCount(show);
        return activeStatus || !!nextEpisode || hasCurrentOrFutureLastAirDate(show) || knownUnwatched;
    }

    function showHasUpcomingItems(show){
        if(typeof global.getUpcomingScheduleItems !== "function") return true;
        try{ const items = global.getUpcomingScheduleItems(show); return Array.isArray(items) && items.length > 0; }
        catch(error){ return true; }
    }

    async function repairMissingWatchingSchedules(){
        if(upcomingRepairBusy) return false;
        if(!global.DATA || !global.DATA.shows || typeof global.refreshShowForSchedule !== "function" || typeof global.getUpcomingScheduleItems !== "function") return false;
        const now = Date.now();
        const candidates = Object.values(global.DATA.shows)
            .filter(show=>shouldRepairWatchingShow(show) && !showHasUpcomingItems(show))
            .filter(show=>{ const id=String(show.tmdb_id||show.id||""); if(!id)return false; const last=Number(upcomingRepairAttempts.get(id)||0); return !last || now-last>=UPCOMING_REPAIR_COOLDOWN_MS; })
            .slice(0,UPCOMING_REPAIR_MAX_PER_PASS);
        if(!candidates.length) return false;
        upcomingRepairBusy = true;
        let refreshed = 0;
        try{
            for(const show of candidates){
                const id=String(show.tmdb_id||show.id||"");
                upcomingRepairAttempts.set(id,Date.now());
                try{ await global.refreshShowForSchedule(show,true); refreshed += 1; }
                catch(error){ console.warn("TV Tracker targeted Upcoming refresh failed",id,error); }
            }
            if(refreshed > 0){
                if(typeof global.saveData === "function"){ try{ await global.saveData(); }catch(error){ console.warn("TV Tracker could not save targeted Upcoming refresh",error); } }
                if(global.activePage === "shows" && global.activeShowsTab === "upcoming" && typeof global.renderUpcoming === "function") await global.renderUpcoming(false);
                return true;
            }
            return false;
        }finally{ upcomingRepairBusy = false; }
    }

    function install(){
        if(installed) return false;
        const original = global.refreshUpcomingDataInBackground;
        if(typeof original !== "function") return false;
        if(original[WRAPPER_MARK]){
            installed = true;
            return false;
        }
        const wrapped = async function(...args){ const result=await original.apply(this,args); await repairMissingWatchingSchedules(); return result; };
        wrapped[WRAPPER_MARK] = true;
        wrapped._tvtrackerOriginal = original;
        global.refreshUpcomingDataInBackground = wrapped;
        installed = true;
        global.setTimeout(()=>{
            if(global.activePage === "shows" && global.activeShowsTab === "upcoming"){
                repairMissingWatchingSchedules().catch(error=>{
                    console.warn("TV Tracker initial targeted Upcoming repair failed",error);
                });
            }
        },1200);
        return true;
    }

    global.TVTrackerUpcomingScheduleRepair = Object.freeze({install});
    install();
})(window);
