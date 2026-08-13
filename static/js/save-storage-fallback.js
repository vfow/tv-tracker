(function(){
    "use strict";

    if(typeof persistPendingSaveQueue !== "function"){
        return;
    }

    const persistDurablePendingSaveQueue = persistPendingSaveQueue;

    persistPendingSaveQueue = function(){
        if(PENDING_SAVE_STORE){
            try{
                return persistDurablePendingSaveQueue();
            }catch(error){
                PENDING_SAVE_STORAGE_ERROR = error;
                PENDING_SAVE_STORE = null;
            }
        }

        // Keep the queue in memory so the existing PATCH and retry paths can
        // still save the user's changes while this tab remains open.
        updateUnsavedStateIndicator();
        return PENDING_SAVE_OPERATIONS;
    };
})();
