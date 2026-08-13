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

    function currentTarget(){
        if(typeof selectedEpisodeContext === "undefined" || !selectedEpisodeContext){ return null; }
        const id = String(selectedEpisodeContext.showId || "");
        const season = Number(selectedEpisodeContext.season);
        const episode = Number(selectedEpisodeContext.episode);
        if(!id || !Number.isFinite(season) || !Number.isFinite(episode)){ return null; }

        let show = typeof DATA !== "undefined" && DATA && DATA.shows ? DATA.shows[id] : null;
        if(!show && typeof discoverPreviewShow !== "undefined" && discoverPreviewShow && String(discoverPreviewShow.tmdb_id) === id){
            show = discoverPreviewShow;
        }
        if(!show && typeof showDetailPreview !== "undefined" && showDetailPreview && String(showDetailPreview.tmdb_id) === id){
            show = showDetailPreview;
        }
        return show ? {id,season,episode,show,key:episodeKey(season,episode)} : null;
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
                    return [];
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

    function renderCrew(target,crew){
        if(!crew.length || typeof renderCrewJobGroupsHTML !== "function" || typeof document === "undefined"){ return; }
        const content = document.getElementById("episode-detail-content");
        const body = content && content.querySelector ? content.querySelector(".episode-page-body") : null;
        if(!body){ return; }
        const current = body.querySelector(".episode-page-crew-section");
        if(current && current.dataset.episodeCrewKey === target.key){ return; }
        if(current){ current.remove(); }
        body.insertAdjacentHTML("beforeend",`
            <section class="modal-section episode-page-crew-section" data-episode-crew-key="${target.key}">
                <h3 class="modal-section-heading">Crew</h3>
                ${renderCrewJobGroupsHTML(crew,"tv","")}
            </section>
        `);
    }

    async function refresh(){
        const target = currentTarget();
        if(!target){ return; }
        const crew = crewFor(target) || await ensureCrew(target);
        const latest = currentTarget();
        if(latest && latest.id === target.id && latest.key === target.key){ renderCrew(latest,crew); }
    }

    let scheduled = false;
    function schedule(){
        if(scheduled){ return; }
        scheduled = true;
        setTimeout(()=>{ scheduled = false; refresh().catch(()=>{}); },0);
    }

    if(typeof document !== "undefined"){
        const content = document.getElementById("episode-detail-content");
        if(content && typeof MutationObserver !== "undefined"){
            new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
        }
    }
    if(typeof window !== "undefined"){
        window.TVTrackerEpisodeCrew = Object.freeze({jobs:JOBS.slice(),normalizeEpisodeCrew});
    }
    schedule();
})();

(function(){
    if(typeof document === "undefined" || document.querySelector('script[data-episode-tabs-loader="true"]')){ return; }
    const script = document.createElement("script");
    script.src = "/static/js/episode-tabs.js";
    script.async = false;
    script.dataset.episodeTabsLoader = "true";
    document.head.appendChild(script);
})();
