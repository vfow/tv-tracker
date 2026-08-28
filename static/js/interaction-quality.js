(function(global){
    "use strict";

    const document = global.document;
    if(!document){
        return;
    }

    const OVERLAY_SELECTOR = "#status-popup,#favorites-popup,#show-modal,#behind-popup,.app-dialog-overlay";
    const FOCUSABLE_SELECTOR = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled]):not([type=hidden])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const CONFIG = Object.freeze({
        "status-popup":{box:".popup",close:"#close-popup",closeGlobal:"closeStatusPopup",label:"Choose show status"},
        "favorites-popup":{box:".popup",close:"#close-favorites-popup",closeGlobal:"closeFavoritesPopup",label:"Choose favorites"},
        "show-modal":{box:".show-modal",close:"#close-show-modal",closeGlobal:"closeShowModal",label:"Show details"},
        "behind-popup":{box:".behind-popup-box",close:".behind-popup-close",closeGlobal:"closeBehindEpisodesPopup",label:"Catch Up"}
    });

    const previousFocus = new WeakMap();
    let activeOverlay = null;
    let headingSequence = 0;
    let observer = null;
    let syncQueued = false;

    function requestFrame(callback){
        if(typeof global.requestAnimationFrame === "function"){
            global.requestAnimationFrame(callback);
        }else{
            global.setTimeout(callback,0);
        }
    }

    function getStyle(element){
        return typeof global.getComputedStyle === "function"
        ? global.getComputedStyle(element)
        : (element && element.style ? element.style : {});
    }

    function isVisible(element){
        if(!element || element.hidden || element.isConnected === false){
            return false;
        }
        const style = getStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
    }

    function getConfig(overlay){
        if(!overlay){ return {}; }
        if(overlay.id && CONFIG[overlay.id]){
            return CONFIG[overlay.id];
        }
        if(overlay.classList && overlay.classList.contains("app-dialog-overlay")){
            return {box:".app-dialog",label:"Dialog"};
        }
        return {};
    }

    function getDialogBox(overlay){
        const config = getConfig(overlay);
        return overlay && config.box ? overlay.querySelector(config.box) : null;
    }

    function ensureDialogSemantics(overlay){
        const box = getDialogBox(overlay);
        if(!box){ return null; }

        box.setAttribute("role","dialog");
        box.setAttribute("aria-modal","true");
        if(!box.hasAttribute("tabindex")){
            box.tabIndex = -1;
        }

        if(!box.hasAttribute("aria-labelledby") && !box.hasAttribute("aria-label")){
            const heading = box.querySelector("h1,h2,h3");
            if(heading){
                if(!heading.id){
                    heading.id = "tv-dialog-title-" + (++headingSequence);
                }
                box.setAttribute("aria-labelledby",heading.id);
            }else{
                box.setAttribute("aria-label",String(getConfig(overlay).label || "Dialog"));
            }
        }

        return box;
    }

    function getFocusableElements(box){
        if(!box){ return []; }
        return Array.from(box.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element=>{
            if(!isVisible(element) || element.disabled){
                return false;
            }
            return element.getAttribute("aria-hidden") !== "true";
        });
    }

    function focusDialog(overlay){
        const box = ensureDialogSemantics(overlay);
        if(!box){ return; }
        const focusable = getFocusableElements(box);
        const target = focusable[0] || box;
        requestFrame(()=>{
            if(isVisible(overlay) && target && typeof target.focus === "function"){
                target.focus({preventScroll:true});
            }
        });
    }

    function restorePreviousFocus(overlay,nextOverlay){
        const target = previousFocus.get(overlay);
        previousFocus.delete(overlay);
        if(!target || target.isConnected === false || typeof target.focus !== "function"){
            return;
        }
        if(nextOverlay && !nextOverlay.contains(target)){
            return;
        }
        target.focus({preventScroll:true});
    }

    function syncAll(){
        const overlays = Array.from(document.querySelectorAll(OVERLAY_SELECTOR));
        overlays.forEach(overlay=>{
            const visible = isVisible(overlay);
            overlay.setAttribute("aria-hidden",visible ? "false" : "true");
            if(visible){
                ensureDialogSemantics(overlay);
            }
        });

        const visibleOverlays = overlays.filter(isVisible);
        const nextOverlay = visibleOverlays.length ? visibleOverlays[visibleOverlays.length - 1] : null;
        const previousOverlay = activeOverlay;

        if(previousOverlay && previousOverlay !== nextOverlay && !isVisible(previousOverlay)){
            restorePreviousFocus(previousOverlay,nextOverlay);
        }

        if(nextOverlay !== activeOverlay){
            activeOverlay = nextOverlay;
            if(nextOverlay){
                if(!previousFocus.has(nextOverlay)){
                    previousFocus.set(nextOverlay,document.activeElement);
                }
                if(!nextOverlay.contains(document.activeElement)){
                    focusDialog(nextOverlay);
                }
            }
        }

        if(!nextOverlay && previousOverlay && previousOverlay === activeOverlay){
            restorePreviousFocus(previousOverlay,null);
            activeOverlay = null;
        }

        return activeOverlay;
    }

    function scheduleSync(){
        if(syncQueued){ return; }
        syncQueued = true;
        requestFrame(()=>{
            syncQueued = false;
            syncAll();
        });
    }

    function closeActiveDialog(){
        const overlay = activeOverlay;
        if(!overlay){ return false; }
        const config = getConfig(overlay);
        if(config.closeGlobal && typeof global[config.closeGlobal] === "function"){
            global[config.closeGlobal]();
            scheduleSync();
            return true;
        }
        if(config.close){
            const closeButton = overlay.querySelector(config.close);
            if(closeButton && typeof closeButton.click === "function"){
                closeButton.click();
                scheduleSync();
                return true;
            }
        }
        return false;
    }

    function handleKeydown(event){
        syncAll();
        if(!activeOverlay || !isVisible(activeOverlay)){
            return;
        }

        if(event.key === "Escape"){
            if(closeActiveDialog()){
                event.preventDefault();
            }
            return;
        }

        if(event.key !== "Tab"){
            return;
        }

        const box = getDialogBox(activeOverlay);
        const focusable = getFocusableElements(box);
        if(!focusable.length){
            event.preventDefault();
            if(box && typeof box.focus === "function"){
                box.focus({preventScroll:true});
            }
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;
        if(!activeOverlay.contains(current)){
            event.preventDefault();
            (event.shiftKey ? last : first).focus({preventScroll:true});
            return;
        }
        if(!event.shiftKey && current === last){
            event.preventDefault();
            first.focus({preventScroll:true});
        }else if(event.shiftKey && current === first){
            event.preventDefault();
            last.focus({preventScroll:true});
        }
    }

    function install(){
        document.addEventListener("keydown",handleKeydown);
        syncAll();

        if(typeof global.MutationObserver === "function" && document.body){
            observer = new global.MutationObserver(scheduleSync);
            observer.observe(document.body,{
                subtree:true,
                childList:true,
                attributes:true,
                attributeFilter:["style","class","hidden"]
            });
        }
    }

    global.TVTrackerInteractionQuality = Object.freeze({
        sync:syncAll,
        activeDialog:()=>activeOverlay
    });

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded",install,{once:true});
    }else{
        install();
    }
})(window);
