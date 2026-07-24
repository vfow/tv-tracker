(function(root,factory){
    const api = factory();
    if(typeof module !== "undefined" && module.exports){
        module.exports = api;
    }
    root.TVTrackerPendingSaveStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
    "use strict";

    function clone(value){
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isOperation(value){
        return !!(
            value &&
            typeof value === "object" &&
            typeof value.id === "string" &&
            value.id.length >= 8 &&
            value.delta &&
            typeof value.delta === "object"
        );
    }


    function createPendingSaveStore(storage,key){
        if(!storage || typeof storage.getItem !== "function"){
            throw new Error("A persistent browser storage provider is required.");
        }

        const storageKey = String(key || "tv-tracker-pending-saves:v1");

        function load(){
            const raw = storage.getItem(storageKey);
            if(!raw){
                return [];
            }

            const parsed = JSON.parse(raw);
            if(!Array.isArray(parsed)){
                throw new Error("The pending-save queue is malformed.");
            }

            return parsed
            .filter(isOperation)
            .sort((left,right)=>Number(left.createdAt || 0) - Number(right.createdAt || 0))
            .map(clone);
        }

        function replace(operations){
            const safe = (Array.isArray(operations) ? operations : [])
            .filter(isOperation)
            .map(clone);
            storage.setItem(storageKey,JSON.stringify(safe));
            return safe;
        }

        function add(operation){
            if(!isOperation(operation)){
                throw new Error("Cannot store an invalid pending save.");
            }
            const operations = load().filter(item=>item.id !== operation.id);
            operations.push(clone(operation));
            return replace(operations);
        }

        function update(operation){
            return add(operation);
        }

        function remove(operationId){
            return replace(load().filter(item=>item.id !== String(operationId || "")));
        }

        function clear(){
            storage.removeItem(storageKey);
            return [];
        }

        return {load,replace,add,update,remove,clear,key:storageKey};
    }

    return {createPendingSaveStore};
});
