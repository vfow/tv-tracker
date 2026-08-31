(function(global){
    "use strict";

    function removeLegacyPendingSaveNotice(){
        if(!global.document || typeof global.document.getElementById !== "function"){
            return;
        }
        const indicator = global.document.getElementById("tv-unsaved-status");
        if(indicator && typeof indicator.remove === "function"){
            indicator.remove();
        }
    }

    function installNeutralRequestErrorCopy(){
        if(typeof global.friendlyRequestError !== "function"){
            return;
        }
        const originalFriendlyRequestError = global.friendlyRequestError;
        global.friendlyRequestError = function(error,fallback){
            if(error instanceof TypeError){
                return "Could not reach the server. Check your connection.";
            }
            return originalFriendlyRequestError(error,fallback);
        };
    }

    function installStartupRecovery(){
        if(!global.document || !global.TVTrackerStartup || global.TVTrackerStartup.status !== "failed"){
            return;
        }

        const status = global.document.getElementById("tv-tracker-startup-status");
        if(
            !status ||
            typeof status.querySelector !== "function" ||
            typeof status.appendChild !== "function" ||
            typeof global.document.createElement !== "function" ||
            typeof global.document.createTextNode !== "function" ||
            status.querySelector("[data-startup-retry]")
        ){
            return;
        }

        const button = global.document.createElement("button");
        button.type = "button";
        button.className = "app-dialog-button primary";
        button.setAttribute("data-startup-retry","true");
        button.textContent = "RELOAD APP";
        button.addEventListener("click",()=>{
            if(global.location && typeof global.location.reload === "function"){
                global.location.reload();
            }
        });

        status.appendChild(global.document.createTextNode(" "));
        status.appendChild(button);
    }

    removeLegacyPendingSaveNotice();
    installNeutralRequestErrorCopy();

    global.TVTrackerStartupPromise = Promise.resolve()
    .then(()=>global.startTVTrackerApp())
    .catch(error=>global.handleTVTrackerStartupFailure(error))
    .then(result=>{
        removeLegacyPendingSaveNotice();
        installStartupRecovery();
        return result;
    });
})(window);
