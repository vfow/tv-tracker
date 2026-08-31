(function(global){
    "use strict";

    const PENDING_SAVE_FEEDBACK_KEY = "pending-save-sync-state";
    const PENDING_SAVE_STORAGE_FEEDBACK_KEY = "pending-save-storage-state";

    function pendingSaveCount(){
        try{
            return Array.isArray(PENDING_SAVE_OPERATIONS) ? PENDING_SAVE_OPERATIONS.length : 0;
        }catch(error){
            return 0;
        }
    }

    function pendingSaveFailureCount(){
        try{
            return Number(PENDING_SAVE_FAILURES || 0);
        }catch(error){
            return 0;
        }
    }

    function pendingSaveStorageError(){
        try{
            return PENDING_SAVE_STORAGE_ERROR || null;
        }catch(error){
            return null;
        }
    }

    function syncPendingSaveFeedback(){
        const feedback = global.TVTrackerFeedback;
        if(!feedback || typeof feedback.notify !== "function" || typeof feedback.dismissByKey !== "function"){
            return;
        }

        if(pendingSaveStorageError()){
            feedback.notify(
                "TV Tracker cannot protect unsaved changes in browser storage. Keep this tab open until saving succeeds.",
                {
                    severity:"warning",
                    persistent:true,
                    dismissible:false,
                    key:PENDING_SAVE_STORAGE_FEEDBACK_KEY
                }
            );
        }else{
            feedback.dismissByKey(PENDING_SAVE_STORAGE_FEEDBACK_KEY);
        }

        const pending = pendingSaveCount();
        if(pending <= 0){
            feedback.dismissByKey(PENDING_SAVE_FEEDBACK_KEY);
            return;
        }

        const failures = pendingSaveFailureCount();
        feedback.notify(
            failures > 0
                ? "Changes are waiting to sync. TV Tracker will retry automatically; keep this tab open."
                : "Saving changes…",
            {
                severity:"info",
                persistent:true,
                dismissible:false,
                key:PENDING_SAVE_FEEDBACK_KEY
            }
        );
    }

    function installPendingSaveFeedback(){
        const original = typeof global.updateUnsavedStateIndicator === "function"
            ? global.updateUnsavedStateIndicator
            : null;

        if(original && original.__tvTrackerPendingSaveUX === true){
            syncPendingSaveFeedback();
            return;
        }

        const wrapped = function(){
            if(original){
                original.apply(this,arguments);
            }
            syncPendingSaveFeedback();
        };
        wrapped.__tvTrackerPendingSaveUX = true;
        global.updateUnsavedStateIndicator = wrapped;

        syncPendingSaveFeedback();
        if(global.addEventListener){
            global.addEventListener("online",syncPendingSaveFeedback);
            global.addEventListener("offline",syncPendingSaveFeedback);
        }
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

    installPendingSaveFeedback();

    global.TVTrackerStartupPromise = Promise.resolve()
    .then(()=>global.startTVTrackerApp())
    .catch(error=>global.handleTVTrackerStartupFailure(error))
    .then(result=>{
        installStartupRecovery();
        syncPendingSaveFeedback();
        return result;
    });
})(window);
