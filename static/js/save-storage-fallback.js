(function(){
    "use strict";

    if(typeof persistPendingSaveQueue !== "function"){
        return;
    }

    const persistDurablePendingSaveQueue = persistPendingSaveQueue;
    const LARGE_SHOW_SAVE_REQUEST_BYTES = 16 * 1024 * 1024;

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

    // A tracked show is the atomic server record for status and watched-episode
    // mutations. Long-running shows can legitimately exceed db.js's generic
    // 2 MiB single-record guard once provider/season metadata has accumulated.
    // The Flask endpoint already accepts requests up to 40 MiB, so allow one
    // show record to travel by itself up to a conservative 16 MiB ceiling.
    // This also lets an older oversized operation at the head of the durable
    // queue drain instead of blocking every later status/episode save.
    if(typeof takeServerDeltaBatch === "function"){
        const takeConservativeServerDeltaBatch = takeServerDeltaBatch;

        takeServerDeltaBatch = function(delta,baseRevision,operationId){
            try{
                return takeConservativeServerDeltaBatch(
                    delta,
                    baseRevision,
                    operationId
                );
            }catch(error){
                const message = error && error.message
                ? String(error.message)
                : "";

                if(!message.startsWith("One tracker record is too large to save safely.")){
                    throw error;
                }

                const atoms = getServerDeltaAtoms(delta);
                const firstAtom = atoms[0];

                if(
                    !firstAtom ||
                    firstAtom.kind !== "map" ||
                    firstAtom.field !== "showsUpsert"
                ){
                    throw error;
                }

                const batch = createEmptyServerDelta();
                addDeltaAtom(batch,firstAtom);
                const requestBytes = jsonByteLength(
                    buildSaveRequestPayload(batch,baseRevision,operationId)
                );

                if(requestBytes > LARGE_SHOW_SAVE_REQUEST_BYTES){
                    throw error;
                }

                return batch;
            }
        };
    }
})();
