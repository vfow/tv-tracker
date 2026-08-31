(function(global){
    "use strict";

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

    global.TVTrackerStartupPromise = Promise.resolve()
    .then(()=>global.startTVTrackerApp())
    .catch(error=>global.handleTVTrackerStartupFailure(error))
    .then(result=>{
        installStartupRecovery();
        return result;
    });
})(window);
