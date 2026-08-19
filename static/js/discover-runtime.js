(function(global){
    "use strict";

    const MAX_GATE_MS = 12000;
    const originalRender = global.renderDiscoverHub;
    let gateActive = false;
    let stableReady = false;
    let trendingSettled = false;
    let trendingPromise = null;
    let gateTimer = null;
    let cycleId = 0;

    if(typeof originalRender !== "function"){
        global.TVTrackerDiscoverStability = Object.freeze({available:false});
        return;
    }

    function isHubVisible(){
        if(global.activePage !== "discover"){
            return false;
        }
        if(typeof global.shouldShowDiscoverHub === "function"){
            return !!global.shouldShowDiscoverHub();
        }
        return true;
    }

    function baseSettled(){
        const state = global.discoverHubState && typeof global.discoverHubState === "object"
        ? global.discoverHubState
        : {};
        return state.loading !== true && (state.loaded === true || !!state.error);
    }

    function skeletonHTML(){
        if(typeof global.renderDiscoverHubSkeleton === "function"){
            return `
                <div class="discover-page-shell">
                    ${global.renderDiscoverHubSkeleton("TV Shows")}
                    ${global.renderDiscoverHubSkeleton("Movies")}
                    ${global.renderDiscoverHubSkeleton("Collections")}
                </div>
            `;
        }
        return `
            <div class="discover-page-shell">
                <div class="discover-section-group">
                    <div class="discover-card-row discover-card-row-loading"></div>
                </div>
            </div>
        `;
    }

    function renderSkeleton(){
        if(!global.document || typeof global.document.getElementById !== "function"){
            return;
        }
        const results = global.document.getElementById("search-results");
        if(!results){
            return;
        }
        if(results.dataset && results.dataset.discoverStableSkeleton === "1"){
            return;
        }
        results.innerHTML = skeletonHTML();
        if(results.dataset){
            results.dataset.discoverStableSkeleton = "1";
        }
    }

    function clearSkeletonMarker(){
        if(!global.document || typeof global.document.getElementById !== "function"){
            return;
        }
        const results = global.document.getElementById("search-results");
        if(results && results.dataset){
            delete results.dataset.discoverStableSkeleton;
        }
    }

    function clearGateTimer(){
        if(gateTimer){
            clearTimeout(gateTimer);
            gateTimer = null;
        }
    }

    function releaseGate(force=false){
        if(!gateActive || !isHubVisible()){
            return false;
        }
        if(!force && (!baseSettled() || !trendingSettled)){
            renderSkeleton();
            return false;
        }
        gateActive = false;
        stableReady = true;
        clearGateTimer();
        clearSkeletonMarker();
        originalRender.call(global);
        return true;
    }

    function ensureTrending(cycle){
        if(trendingPromise){
            return trendingPromise;
        }
        const api = global.TVTrackerTrending;
        if(!api || typeof api.loadHubRows !== "function"){
            trendingSettled = true;
            releaseGate(false);
            return Promise.resolve([]);
        }

        trendingSettled = false;
        trendingPromise = Promise.resolve()
        .then(()=>api.loadHubRows(false))
        .catch(()=>[])
        .finally(()=>{
            if(cycle === cycleId){
                trendingSettled = true;
                trendingPromise = null;
                releaseGate(false);
            }
        });
        return trendingPromise;
    }

    function beginGate(){
        if(!isHubVisible()){
            return false;
        }
        if(!gateActive){
            gateActive = true;
            stableReady = false;
            trendingSettled = false;
            cycleId += 1;
            clearGateTimer();
            const cycle = cycleId;
            gateTimer = setTimeout(()=>{
                if(cycle === cycleId){
                    trendingSettled = true;
                    releaseGate(true);
                }
            },MAX_GATE_MS);
            ensureTrending(cycle);
        }
        renderSkeleton();
        return true;
    }

    function guardedRender(){
        if(!isHubVisible()){
            return originalRender.apply(this,arguments);
        }

        const state = global.discoverHubState && typeof global.discoverHubState === "object"
        ? global.discoverHubState
        : {};

        if(state.loading === true){
            stableReady = false;
        }

        if(stableReady && state.loading !== true){
            clearSkeletonMarker();
            return originalRender.apply(this,arguments);
        }

        beginGate();
        if(baseSettled() && trendingSettled){
            releaseGate(false);
        }
        return undefined;
    }

    global.renderDiscoverHub = guardedRender;

    global.TVTrackerDiscoverStability = Object.freeze({
        available:true,
        begin:beginGate,
        release:releaseGate,
        isGateActive:()=>gateActive,
        isStableReady:()=>stableReady,
        baseSettled,
        MAX_GATE_MS
    });
})(window);
