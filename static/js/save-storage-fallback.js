(function(){
    "use strict";

    if(typeof persistPendingSaveQueue !== "function"){
        return;
    }

    const persistDurablePendingSaveQueue = persistPendingSaveQueue;
    const LARGE_SHOW_SAVE_REQUEST_BYTES = 36 * 1024 * 1024;

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

    function isLargeShowOnlyRequest(payload){
        if(!payload || typeof payload !== "object"){
            return false;
        }

        const showIds = Object.keys(payload.showsUpsert || {});
        return (
            showIds.length === 1 &&
            (payload.showsDelete || []).length === 0 &&
            Object.keys(payload.historyUpsert || {}).length === 0 &&
            (payload.historyDelete || []).length === 0 &&
            payload.historyOrder === null &&
            Object.keys(payload.stateUpsert || {}).length === 0
        );
    }

    function largeShowRequestIsAllowed(payload){
        return (
            isLargeShowOnlyRequest(payload) &&
            jsonByteLength(payload) <= LARGE_SHOW_SAVE_REQUEST_BYTES
        );
    }

    // A tracked show is the atomic server record for status and watched-episode
    // mutations. Long-running shows can legitimately exceed db.js's generic
    // 2 MiB single-record guard once provider/season metadata has accumulated.
    // The Flask endpoint accepts requests up to 40 MiB, so allow one show record
    // to travel by itself up to 36 MiB and keep a safety margin for request
    // framing and future payload fields. History/state limits stay unchanged.
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
                const requestPayload = buildSaveRequestPayload(
                    batch,
                    baseRevision,
                    operationId
                );

                if(!largeShowRequestIsAllowed(requestPayload)){
                    throw error;
                }

                return batch;
            }
        };
    }

    // persistQueuedSaveOperation performs a second defensive 2 MiB check after
    // batching. Keep its conflict/rebase/retry behavior intact while applying
    // the same narrowly-scoped exception there; otherwise the recovered large
    // show batch would still be rejected immediately before PATCH /api/state.
    if(typeof persistQueuedSaveOperation === "function"){
        persistQueuedSaveOperation = async function(operation){
            let attempts = 0;

            while(true){
                if(deltaIsEmpty(operation.delta)){
                    return true;
                }

                let requestRevision = Number(operation.baseRevision || 0);
                if(!Number.isFinite(requestRevision) || requestRevision < 0){
                    requestRevision = 0;
                }
                operation.baseRevision = requestRevision;

                const batches = splitServerDeltaIntoBatches(
                    operation.delta,
                    requestRevision,
                    operation.id + "-g" + String(Number(operation.generation || 0))
                );

                try{
                    for(const pendingBatch of batches){
                        const requestPayload = buildSaveRequestPayload(
                            pendingBatch.delta,
                            requestRevision,
                            pendingBatch.operationId
                        );
                        const requestBytes = jsonByteLength(requestPayload);
                        if(
                            requestBytes > MAX_SINGLE_SAVE_REQUEST_BYTES &&
                            !largeShowRequestIsAllowed(requestPayload)
                        ){
                            throw new Error("Tracker save batch exceeded the safe request limit.");
                        }

                        const response = await fetch("/api/state",{
                            method:"PATCH",
                            credentials:"same-origin",
                            cache:"no-store",
                            headers:{
                                "Accept":"application/json",
                                "Content-Type":"application/json",
                                "X-CSRF-Token":csrfToken()
                            },
                            body:JSON.stringify(requestPayload)
                        });
                        const payload = await parseAPIResponse(response);

                        if(payload.reset){
                            const full = await fetchFullState();
                            const oldBaseline = LAST_SAVED_DATA || {shows:{},history:[]};
                            DATA = mergeTrackerSnapshots(oldBaseline,DATA,full.data || oldBaseline);
                            LAST_SAVED_DATA = cloneTrackerData(full.data || oldBaseline);
                            SERVER_REVISION = Number(full.revision || payload.revision || SERVER_REVISION);
                            operation.baseRevision = Number(SERVER_REVISION || 0);
                            operation.generation = Number(operation.generation || 0) + 1;
                            operation.delta = operation.dirtyOptions
                            ? buildDirtyServerDelta(DATA,operation.dirtyOptions)
                            : buildServerDelta(LAST_SAVED_DATA,DATA);
                            updatePendingSaveOperation(operation);
                            refreshUIAfterRemoteSync(null,true);
                            throw Object.assign(new Error("Synchronization reset required"),{retryPending:true});
                        }

                        if((payload.changes || []).length > 0){
                            if(!LAST_SAVED_DATA){
                                LAST_SAVED_DATA = {shows:{},history:[]};
                            }
                            applyChangeList(LAST_SAVED_DATA,payload.changes);
                            applyChangeList(DATA,payload.changes);
                            refreshUIAfterRemoteSync(payload.changes,false);
                        }

                        if(!LAST_SAVED_DATA){
                            LAST_SAVED_DATA = {shows:{},history:[]};
                        }
                        if(!payload.duplicate){
                            applyServerDelta(
                                LAST_SAVED_DATA,
                                payload.appliedDelta || pendingBatch.delta
                            );
                        }

                        SERVER_REVISION = Number(payload.revision || SERVER_REVISION);
                        broadcastRevision();
                        await sleep(0);
                    }
                    return true;
                }catch(error){
                    if(error && error.status === 409){
                        const baseline = LAST_SAVED_DATA || {shows:{},history:[]};
                        const remoteResult = await getRemoteSnapshotFromConflict(
                            error.payload || {},
                            baseline
                        );
                        const remoteSnapshot = remoteResult.data || baseline;
                        DATA = mergeTrackerSnapshots(baseline,DATA,remoteSnapshot);
                        LAST_SAVED_DATA = cloneTrackerData(remoteSnapshot);
                        SERVER_REVISION = Number(remoteResult.revision || SERVER_REVISION);
                        operation.baseRevision = Number(SERVER_REVISION || 0);
                        operation.generation = Number(operation.generation || 0) + 1;
                        operation.delta = operation.dirtyOptions
                        ? buildDirtyServerDelta(DATA,operation.dirtyOptions)
                        : buildServerDelta(LAST_SAVED_DATA,DATA);
                        updatePendingSaveOperation(operation);
                        refreshUIAfterRemoteSync(error.payload && error.payload.changes,false);
                        attempts += 1;
                    }else if(error && error.retryPending){
                        attempts += 1;
                    }else{
                        attempts += 1;
                        if(attempts >= MAX_SAVE_ATTEMPTS || (error && error.status)){
                            throw error;
                        }
                        await sleep(attempts === 1 ? 500 : 1500);
                    }

                    if(attempts >= MAX_SAVE_ATTEMPTS){
                        throw error;
                    }
                }
            }
        };
    }

    function queuedSaveFailureBlocksLaterOperations(error){
        if(error instanceof TypeError){
            return true;
        }

        const status = Number(error && error.status || 0);
        const code = error && error.payload
        ? String(error.payload.code || "")
        : "";

        return (
            status === 401 ||
            status === 403 ||
            status >= 500 ||
            code === "database_unavailable"
        );
    }

    // One bad record must never hold the entire tracker hostage. The original
    // queue always retried index 0 and returned immediately on failure, so a
    // permanently unsendable show could block status/episode saves for every
    // other show. Attempt each queued operation once per drain pass, keep failed
    // operations for retry, and continue with later operations when the failure
    // is record-specific. Connection/auth/server failures still stop the pass.
    if(typeof processPendingSaveQueue === "function"){
        processPendingSaveQueue = function(){
            if(PENDING_SAVE_PROCESSING){
                return PENDING_SAVE_PROCESSING;
            }

            PENDING_SAVE_PROCESSING = (async()=>{
                const attemptedOperationIds = new Set();
                let firstToastError = null;
                let firstToastOperation = null;
                let blockedBySharedFailure = false;

                while(true){
                    const queuedOperation = PENDING_SAVE_OPERATIONS.find(item=>{
                        const id = item && item.id ? String(item.id) : "";
                        return id && !attemptedOperationIds.has(id);
                    });

                    if(!queuedOperation || blockedBySharedFailure){
                        break;
                    }

                    const operation = cloneTrackerData(queuedOperation);
                    attemptedOperationIds.add(String(operation.id));

                    try{
                        SAVE_IN_FLIGHT += 1;
                        await persistQueuedSaveOperation(operation);
                        removePendingSaveOperation(operation.id);
                        SYNC_FAILURES = 0;
                        SYNC_WARNING_SHOWN = false;
                    }catch(error){
                        console.error("TV Tracker has an unsaved operation",error);

                        if(!firstToastError && !(operation && operation.silent)){
                            firstToastError = error;
                            firstToastOperation = operation;
                        }

                        blockedBySharedFailure = queuedSaveFailureBlocksLaterOperations(error);
                    }finally{
                        SAVE_IN_FLIGHT = Math.max(0,SAVE_IN_FLIGHT - 1);
                    }
                }

                if(PENDING_SAVE_OPERATIONS.length > 0){
                    PENDING_SAVE_FAILURES += 1;
                    const shouldToast =
                    PENDING_SAVE_FAILURES === 1 &&
                    firstToastError &&
                    typeof showToast === "function" &&
                    !(firstToastOperation && firstToastOperation.silent);

                    if(shouldToast){
                        showToast(friendlySaveError(firstToastError),{duration:3600});
                    }

                    updateUnsavedStateIndicator();
                    schedulePendingSaveRetry();
                    return false;
                }

                PENDING_SAVE_FAILURES = 0;
                updateUnsavedStateIndicator();
                return true;
            })().finally(()=>{
                PENDING_SAVE_PROCESSING = null;
                if(SYNC_STARTED && document.visibilityState === "visible"){
                    scheduleNextSync(250);
                }
            });

            return PENDING_SAVE_PROCESSING;
        };
    }
})();
