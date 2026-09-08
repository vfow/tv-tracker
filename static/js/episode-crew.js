(function(){
    const JOBS = ["Director","Writer","Teleplay","Story","Screenplay"];
    const JOB_RANK = new Map(JOBS.map((job,index)=>[job.toLowerCase(),index]));
    const pending = new Map();

    function episodeKey(season,episode){
        return typeof getEpisodeActorCreditsKey === "function"
        ? getEpisodeActorCreditsKey(season,episode)
        : `${Number(season)}-${Number(episode)}`;
    }

    function normalizeEpisodeCrew(credits){
        const seen = new Set();
        return (Array.isArray(credits && credits.crew) ? credits.crew : [])
        .filter(person=>{
            const job = String(person && person.job || "").trim().toLowerCase();
            const name = String(person && person.name || "").trim();
            if(!JOB_RANK.has(job) || !name){ return false; }
            const key = `${person && person.id || name.toLowerCase()}::${job}`;
            if(seen.has(key)){ return false; }
            seen.add(key);
            return true;
        })
        .map(person=>({
            id:Number(person.id || 0),
            name:String(person.name || "").trim(),
            job:String(person.job || "").trim(),
            department:String(person.department || "").trim(),
            profile_path:person.profile_path || ""
        }))
        .sort((a,b)=>{
            const rank = JOB_RANK.get(a.job.toLowerCase()) - JOB_RANK.get(b.job.toLowerCase());
            return rank || a.name.localeCompare(b.name);
        });
    }

    function crewFor(target){
        const store = target && target.show && target.show._episode_crew_credits;
        return store && Array.isArray(store[target.key]) ? store[target.key] : null;
    }

    async function ensureCrew(target){
        const existing = crewFor(target);
        if(existing){ return existing; }
        const requestKey = `${target.id}::${target.key}`;
        if(pending.has(requestKey)){ return pending.get(requestKey); }

        const task = (async()=>{
            let details = typeof readCachedV2EpisodeDetails === "function"
            ? readCachedV2EpisodeDetails(target.id,target.season,target.episode)
            : null;

            if(!(details && details.credits) && typeof ensureEpisodeV2Details === "function"){
                try{ await ensureEpisodeV2Details(target.show,target.season,target.episode,{skipSave:true}); }catch(error){}
                details = typeof readCachedV2EpisodeDetails === "function"
                ? readCachedV2EpisodeDetails(target.id,target.season,target.episode)
                : null;
            }

            if(!(details && details.credits) && typeof tmdbGetEpisodeDetails === "function"){
                try{
                    details = await tmdbGetEpisodeDetails(target.id,target.season,target.episode);
                    if(details && typeof writeCachedV2EpisodeDetails === "function"){
                        writeCachedV2EpisodeDetails(target.id,target.season,target.episode,details);
                    }
                }catch(error){
                    throw error;
                }
            }

            if(!(details && details.credits && typeof details.credits === "object")){ return []; }
            const crew = normalizeEpisodeCrew(details.credits);
            if(!target.show._episode_crew_credits || typeof target.show._episode_crew_credits !== "object"){
                target.show._episode_crew_credits = {};
            }
            target.show._episode_crew_credits[target.key] = crew;
            return crew;
        })();

        pending.set(requestKey,task);
        try{ return await task; }
        finally{ pending.delete(requestKey); }
    }

    window.TVTrackerEpisodeCrew = Object.freeze({
        jobs:JOBS.slice(),normalizeEpisodeCrew,
        load:(show,season,episode)=>ensureCrew({
            id:String(show.tmdb_id),season:Number(season),episode:Number(episode),show,
            key:episodeKey(season,episode)
        })
    });
})();
