(function(){

    "use strict";

    const MOBILE_BREAKPOINT = 992;
    let fallbackMode = false;
    let fallbackBackdrop = null;

    function getSidebar(){
        return document.getElementById("app-sidebar");
    }

    function bootstrapAssetsAreReady(){

        const jsReady = Boolean(
            window.bootstrap &&
            window.bootstrap.Offcanvas
        );

        const sentinel = document.createElement("span");
        sentinel.className = "d-none";
        sentinel.setAttribute("aria-hidden","true");
        document.body.appendChild(sentinel);

        const cssReady = window.getComputedStyle(sentinel).display === "none";
        sentinel.remove();

        return jsReady && cssReady;

    }

    function ensureFallbackBackdrop(){

        if(fallbackBackdrop){
            return fallbackBackdrop;
        }

        fallbackBackdrop = document.createElement("button");
        fallbackBackdrop.type = "button";
        fallbackBackdrop.className = "tt-sidebar-backdrop";
        fallbackBackdrop.setAttribute("aria-label","Close navigation");
        fallbackBackdrop.addEventListener("click",closeNavigation);
        document.body.appendChild(fallbackBackdrop);

        return fallbackBackdrop;

    }

    function openFallbackNavigation(){

        if(window.innerWidth >= MOBILE_BREAKPOINT){
            return;
        }

        const sidebar = getSidebar();

        if(!sidebar){
            return;
        }

        ensureFallbackBackdrop();
        document.body.classList.add("tt-nav-open");
        sidebar.classList.add("show");
        sidebar.setAttribute("aria-modal","true");

        const firstNavigationButton = sidebar.querySelector("button[data-page]");

        if(firstNavigationButton){
            window.setTimeout(()=>firstNavigationButton.focus(),40);
        }

    }

    function closeFallbackNavigation(){

        const sidebar = getSidebar();

        document.body.classList.remove("tt-nav-open");

        if(sidebar){
            sidebar.classList.remove("show");
            sidebar.removeAttribute("aria-modal");
        }

    }

    function closeNavigation(){

        const sidebar = getSidebar();

        if(!sidebar || window.innerWidth >= MOBILE_BREAKPOINT){
            return;
        }

        if(fallbackMode){
            closeFallbackNavigation();
            return;
        }

        if(window.bootstrap && window.bootstrap.Offcanvas){
            const instance = window.bootstrap.Offcanvas.getInstance(sidebar);

            if(instance){
                instance.hide();
            }
        }

    }

    function bindFallbackNavigation(){

        fallbackMode = true;
        document.body.classList.add("tt-bootstrap-fallback");

        const openButton = document.querySelector(".mobile-menu-button");
        const closeButton = document.querySelector(".sidebar-close");

        if(openButton){
            openButton.addEventListener("click",openFallbackNavigation);
        }

        if(closeButton){
            closeButton.addEventListener("click",closeFallbackNavigation);
        }

        document.addEventListener("keydown",event=>{
            if(event.key === "Escape"){
                closeFallbackNavigation();
            }
        });

        window.addEventListener("resize",()=>{
            if(window.innerWidth >= MOBILE_BREAKPOINT){
                closeFallbackNavigation();
            }
        });

    }

    function init(){

        if(!bootstrapAssetsAreReady()){
            bindFallbackNavigation();
        }

    }

    window.TVTrackerShell = {
        closeNavigation,
        isFallbackMode:()=>fallbackMode
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded",init,{once:true});
    }else{
        init();
    }

})();
