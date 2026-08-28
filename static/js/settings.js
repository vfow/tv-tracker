(function(global){
    "use strict";

    const SECTIONS = Object.freeze([
        {id:"profile",label:"PROFILE"},
        {id:"auth",label:"AUTH"},
        {id:"notifications",label:"NOTIFICATIONS"},
        {id:"streaming",label:"STREAMING"},
        {id:"data",label:"DATA"},
        {id:"danger-zone",label:"DANGER ZONE"}
    ]);
    const VALID = new Set(SECTIONS.map(item=>item.id));
    let activeSection = "profile";

    function normalizeSection(value){
        const clean = String(value || "profile").trim().toLowerCase();
        return VALID.has(clean) ? clean : "profile";
    }

    function sectionFromPath(pathname){
        const match = String(pathname || "").match(/^\/app\/settings(?:\/([^/?#]+))?\/?$/);
        return normalizeSection(match && match[1] ? match[1] : "profile");
    }

    function routeFor(section){
        return "/app/settings/" + normalizeSection(section);
    }

    function open(section,options={}){
        activeSection = normalizeSection(section);
        global.activePage = "settings";
        if(typeof global.showPage === "function" && options.skipShowPage !== true){
            global.showPage("settings");
        }
        if(!options.fromRoute){
            const route = routeFor(activeSection);
            if(global.TVTrackerRouter && typeof global.TVTrackerRouter.setPathRoute === "function"){
                global.TVTrackerRouter.setPathRoute(route,options.replaceRoute === true);
            }
        }
    }

    function current(){
        return activeSection;
    }

    activeSection = sectionFromPath(global.location && global.location.pathname);
    global.TVTrackerSettings = Object.freeze({
        open,
        current,
        normalizeSection,
        routeFor,
        sectionFromPath,
        sections:SECTIONS
    });
})(window);
