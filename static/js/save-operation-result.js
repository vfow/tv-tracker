(function(global){
    "use strict";

    if(
        typeof saveData !== "function" ||
        typeof PENDING_SAVE_OPERATIONS === "undefined"
    ){
        return;
    }

    const queuedSaveData = saveData;

    function queuedOperationIds(){
        return new Set(
            (Array.isArray(PENDING_SAVE_OPERATIONS) ? PENDING_SAVE_OPERATIONS : [])
            .map(item=>item && item.id ? String(item.id) : "")
            .filter(Boolean)
        );
    }

    function operationIsStillPending(operationId){
        const id = String(operationId || "");
        if(!id){
            return false;
        }
        return (Array.isArray(PENDING_SAVE_OPERATIONS) ? PENDING_SAVE_OPERATIONS : [])
        .some(item=>item && String(item.id || "") === id);
    }

    function saveDataForRequestedOperation(options={}){
        const beforeIds = queuedOperationIds();
        const result = queuedSaveData(options);
        const queuedOperation = (
            Array.isArray(PENDING_SAVE_OPERATIONS) ? PENDING_SAVE_OPERATIONS : []
        ).find(item=>{
            const id = item && item.id ? String(item.id) : "";
            return id && !beforeIds.has(id);
        });

        if(!queuedOperation){
            return Promise.resolve(result);
        }

        const operationId = String(queuedOperation.id);
        return Promise.resolve(result).then(()=>{
            // processPendingSaveQueue can legitimately return false when an older,
            // unrelated operation remains queued. The caller only needs to know
            // whether the operation created by this saveData call was confirmed.
            return !operationIsStillPending(operationId);
        });
    }

    saveData = saveDataForRequestedOperation;
    global.saveData = saveDataForRequestedOperation;
})(window);
