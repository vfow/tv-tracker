(function(global){
    "use strict";

    const legacy = global.TVTrackerSettings;
    const VUE_CANARY_SECTIONS = new Set(["streaming"]);
    if(!legacy || typeof legacy.render !== "function" || typeof legacy.open !== "function"){
        return;
    }

    let vueOwner = null;

    function currentSection(){
        return typeof legacy.current === "function" ? legacy.current() : "profile";
    }

    function requestVue(section){
        if(
            !vueOwner &&
            VUE_CANARY_SECTIONS.has(section) &&
            global.document &&
            typeof global.document.dispatchEvent === "function" &&
            typeof global.CustomEvent === "function"
        ){
            global.document.dispatchEvent(new global.CustomEvent("tvtracker:settings-vue-needed",{detail:{section}}));
        }
    }

    function render(){
        const section = currentSection();
        if(vueOwner && typeof vueOwner.supports === "function" && vueOwner.supports(section)){
            return vueOwner.render(section);
        }
        if(vueOwner && typeof vueOwner.unmount === "function"){
            vueOwner.unmount();
        }
        requestVue(section);
        return legacy.render();
    }

    function open(section,options={}){
        const normalized = typeof legacy.normalizeSection === "function"
            ? legacy.normalizeSection(section)
            : String(section || "profile");
        requestVue(normalized);
        const nextOptions = Object.assign({},options);
        if(
            vueOwner &&
            typeof vueOwner.supports === "function" &&
            vueOwner.supports(normalized) &&
            nextOptions.skipShowPage === true
        ){
            nextOptions.skipShowPage = false;
        }
        return legacy.open(normalized,nextOptions);
    }

    function attachVueOwner(owner){
        if(!owner || typeof owner.supports !== "function" || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Vue Settings owner");
        }
        vueOwner = owner;
        if(global.activePage === "settings"){
            render();
        }
    }

    const bridge = Object.freeze({
        attachVueOwner,
        render,
        open,
        current:currentSection,
        normalizeSection:legacy.normalizeSection,
        routeFor:legacy.routeFor,
        sectionFromPath:legacy.sectionFromPath,
        sections:legacy.sections,
        legacy,
        vueCanarySections:Object.freeze(Array.from(VUE_CANARY_SECTIONS))
    });

    global.TVTrackerSettingsBridge = bridge;
    global.TVTrackerSettings = bridge;
    global.renderSettings = render;
})(window);
