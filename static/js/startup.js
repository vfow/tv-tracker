(function(global){
    "use strict";

    function installStartupRecovery(){
        if(!global.document){
            return;
        }

        const status = global.document.getElementById("tv-tracker-startup-status");
        if(!status || status.querySelector("[data-startup-retry]")){
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
    .catch(error=>{
        let result;
        try{
            result = global.handleTVTrackerStartupFailure(error);
        }finally{
            installStartupRecovery();
        }
        return result;
    });
})(window);
