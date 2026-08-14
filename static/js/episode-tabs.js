(function(){
    const active = new Map();
    const content = document.getElementById("episode-detail-content");
    if(!content){ return; }

    function key(){
        const c = typeof selectedEpisodeContext !== "undefined" ? selectedEpisodeContext : null;
        return c ? `${c.showId}::${c.season}-${c.episode}` : "";
    }

    function setTab(box,tab){
        box.querySelectorAll("[data-episode-tab]").forEach(b=>{
            const on = b.dataset.episodeTab === tab;
            b.classList.toggle("active",on);
            b.setAttribute("aria-selected",on ? "true" : "false");
        });
        box.querySelectorAll("[data-episode-panel]").forEach(p=>p.hidden = p.dataset.episodePanel !== tab);
    }

    function render(){
        const k = key();
        const body = content.querySelector(".episode-page-body");
        if(!k || !body){ return; }

        let box = body.querySelector(".episode-detail-tabs-section");
        if(!box){
            const tab = active.get(k) === "Crew" ? "Crew" : "Cast";
            const html = `<div class="modal-section show-detail-tabs-section episode-detail-tabs-section" data-key="${k}"><div class="show-detail-tabs episode-detail-tabs" role="tablist" aria-label="Episode cast and crew"><button type="button" class="show-detail-tab ${tab === "Cast" ? "active" : ""}" data-episode-tab="Cast" role="tab">Cast</button><button type="button" class="show-detail-tab ${tab === "Crew" ? "active" : ""}" data-episode-tab="Crew" role="tab">Crew</button></div><div class="show-detail-tab-panel"><div data-episode-panel="Cast"></div><div data-episode-panel="Crew" hidden></div></div></div>`;
            const anchor = body.querySelector(".v2-episode-guest-stars-section, .v2-episode-cast-section, .episode-page-crew-section");
            if(anchor){ anchor.insertAdjacentHTML("beforebegin",html); box = anchor.previousElementSibling; }
            else{ body.insertAdjacentHTML("beforeend",html); box = body.lastElementChild; }
        }
        if(!box || box.dataset.key !== k){ return; }

        const castPanel = box.querySelector('[data-episode-panel="Cast"]');
        const crewPanel = box.querySelector('[data-episode-panel="Crew"]');
        [body.querySelector(".v2-episode-guest-stars-section"),body.querySelector(".v2-episode-cast-section")].filter(Boolean).forEach(node=>{
            if(node.parentElement !== castPanel){ castPanel.appendChild(node); }
        });
        const crew = body.querySelector(".episode-page-crew-section");
        if(crew && crew.parentElement !== crewPanel){
            const heading = crew.querySelector(".modal-section-heading");
            if(heading){ heading.remove(); }
            crew.classList.remove("modal-section");
            crewPanel.appendChild(crew);
        }
        setTab(box,active.get(k) === "Crew" ? "Crew" : "Cast");
    }

    content.addEventListener("click",e=>{
        const b = e.target.closest && e.target.closest("[data-episode-tab]");
        if(!b){ return; }
        const box = b.closest(".episode-detail-tabs-section");
        const k = key();
        if(!box || box.dataset.key !== k){ return; }
        const tab = b.dataset.episodeTab === "Crew" ? "Crew" : "Cast";
        active.set(k,tab);
        setTab(box,tab);
    });

    let queued = false;
    new MutationObserver(()=>{
        if(queued){ return; }
        queued = true;
        setTimeout(()=>{ queued = false; render(); },0);
    }).observe(content,{childList:true,subtree:true});
    render();
})();
