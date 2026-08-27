(function installTVTrackerCore(global){
    "use strict";

    if(Object.prototype.hasOwnProperty.call(global,"TVTrackerCore")){ return; }

    const SAFE_METHODS = Object.freeze(["GET","HEAD","OPTIONS"]);
    const ErrorClassification = Object.freeze({
        USER_ACTIONABLE:"USER_ACTIONABLE",
        VALIDATION:"VALIDATION",
        AUTHORIZATION_SESSION:"AUTHORIZATION_SESSION",
        OFFLINE_NETWORK:"OFFLINE_NETWORK",
        OPTIONAL_PROVIDER_FAILURE:"OPTIONAL_PROVIDER_FAILURE",
        SERVER_INTERNAL:"SERVER_INTERNAL",
        SECURITY_SENSITIVE:"SECURITY_SENSITIVE"
    });

    function statusFrom(error,override){
        if(override !== undefined && override !== null){
            const status = Number(override);
            if(Number.isFinite(status)){ return status; }
        }
        if(
            error
            && typeof error === "object"
            && error.status !== undefined
            && error.status !== null
        ){
            const status = Number(error.status);
            if(Number.isFinite(status)){ return status; }
        }
        return null;
    }

    function codeFrom(error){
        if(!error || typeof error !== "object"){ return ""; }
        const code = error.code;
        return typeof code === "string" ? code.slice(0,120) : "";
    }

    function looksLikeNetworkFailure(error){
        const message = error && typeof error === "object" ? error.message : "";
        return /failed to fetch|networkerror|network request|econnreset|econnrefused|enotfound|etimedout/i.test(
            String(message || "")
        );
    }

    function classified(error,classification,status,safeMessage,retryable){
        return Object.freeze({
            classification,
            status,
            code:codeFrom(error),
            safeMessage,
            retryable,
            original:error
        });
    }

    function classifyError(error,options={}){
        const settings = options && typeof options === "object" ? options : {};
        const status = statusFrom(error,settings.status);

        if(looksLikeNetworkFailure(error) && status === null){
            return classified(
                error,
                ErrorClassification.OFFLINE_NETWORK,
                status,
                "TV Tracker can't reach the service right now. Try again.",
                true
            );
        }
        if(
            /^provider_/i.test(codeFrom(error))
            || (status !== null && [502,503,504].includes(status))
        ){
            return classified(
                error,
                ErrorClassification.OPTIONAL_PROVIDER_FAILURE,
                status,
                "Some extra information is temporarily unavailable.",
                true
            );
        }
        if(status === 422){
            return classified(
                error,
                ErrorClassification.VALIDATION,
                status,
                "One or more fields need attention. Check the details and try again.",
                false
            );
        }
        if(status !== null && [401,403].includes(status)){
            const code = codeFrom(error);
            if(["session_expired","csrf","invalid_token","login_required","password_changed","session_invalid"].includes(code)){
                return classified(
                    error,
                    ErrorClassification.SECURITY_SENSITIVE,
                    status,
                    "That action couldn't be completed securely. Refresh and try again.",
                    false
                );
            }
            return classified(
                error,
                ErrorClassification.AUTHORIZATION_SESSION,
                status,
                "Couldn't complete that request. Check the details and try again.",
                false
            );
        }
        if(status !== null && [400,404,409].includes(status)){
            return classified(
                error,
                ErrorClassification.USER_ACTIONABLE,
                status,
                "Couldn't complete that request. Check the details and try again.",
                status === 409
            );
        }
        if(status === 429 || (status !== null && status >= 500)){
            return classified(
                error,
                ErrorClassification.SERVER_INTERNAL,
                status,
                "TV Tracker is having trouble right now. Try again.",
                true
            );
        }
        return classified(
            error,
            ErrorClassification.SERVER_INTERNAL,
            status,
            "Something went wrong. Try again.",
            false
        );
    }

    class ApiRequestError extends Error {
        constructor(status,payload){
            super(`TV Tracker API request failed (${status})`);
            this.name = "ApiRequestError";
            this.status = status;
            this.code = codeFrom(payload);
            this.payload = payload;
            this.classified = classifyError(this,{status});
        }
    }
    Object.freeze(ApiRequestError.prototype);
    Object.freeze(ApiRequestError);

    function sameOriginPath(path){
        if(typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")){
            throw new TypeError("API paths must be same-origin absolute paths");
        }
        const target = new global.URL(path,global.location.href);
        if(target.origin !== global.location.origin){
            throw new TypeError("API paths must be same-origin absolute paths");
        }
        return path;
    }

    function csrfToken(){
        const token = global.document.querySelector('meta[name="csrf-token"]');
        return token && typeof token.content === "string" ? token.content : "";
    }

    async function responsePayload(response){
        const contentType = response.headers.get("content-type") || "";
        if(!/(?:^|[+/])json(?:;|$)/i.test(contentType)){ return null; }
        try{
            return await response.json();
        }catch(_error){
            return null;
        }
    }

    function networkError(error){
        const failure = error instanceof Error ? error : new Error("Network request failed");
        const classification = classifyError(failure);
        try{
            Object.defineProperty(failure,"classified",{
                value:classification,
                configurable:true,
                enumerable:false
            });
            return failure;
        }catch(_error){
            const wrapped = new Error("Network request failed",{cause:failure});
            Object.defineProperty(wrapped,"classified",{value:classification,enumerable:false});
            return wrapped;
        }
    }

    async function request(path,init={}){
        const target = sameOriginPath(path);
        const options = init && typeof init === "object" ? init : {};
        const method = String(options.method || "GET").toUpperCase();
        const headers = new global.Headers(options.headers || {});
        headers.set("Accept","application/json");

        if(!SAFE_METHODS.includes(method)){
            const token = csrfToken();
            if(token){ headers.set("X-CSRF-Token",token); }
            if(options.body != null && !headers.has("Content-Type") && typeof options.body === "string"){
                headers.set("Content-Type","application/json");
            }
        }

        let response;
        try{
            response = await global.fetch(target,Object.assign({},options,{
                method,
                headers,
                credentials:"same-origin"
            }));
        }catch(error){
            throw networkError(error);
        }

        const payload = await responsePayload(response);
        if(!response.ok){ throw new ApiRequestError(response.status,payload); }
        return payload;
    }

    function get(path,init={}){
        return request(path,Object.assign({},init,{method:"GET"}));
    }

    function post(path,body,init={}){
        const options = init && typeof init === "object" ? init : {};
        return request(path,Object.assign({},options,{
            method:"POST",
            body:body === undefined ? options.body : JSON.stringify(body)
        }));
    }

    function patch(path,body,init={}){
        const options = init && typeof init === "object" ? init : {};
        return request(path,Object.assign({},options,{
            method:"PATCH",
            body:body === undefined ? options.body : JSON.stringify(body)
        }));
    }

    function remove(path,init={}){
        return request(path,Object.assign({},init,{method:"DELETE"}));
    }

    function presentError(error,options={}){
        const settings = options && typeof options === "object" ? options : {};
        const result = classifyError(error,settings);
        if(
            settings.background === true
            && (
                result.classification === ErrorClassification.OFFLINE_NETWORK
                || result.classification === ErrorClassification.SERVER_INTERNAL
                || result.classification === ErrorClassification.OPTIONAL_PROVIDER_FAILURE
            )
        ){
            return null;
        }

        const surface = global.TVTrackerFeedback;
        const message = settings.userMessage || result.safeMessage || "Something went wrong. Try again.";
        if(surface && typeof surface.reportError === "function"){
            return surface.reportError(error,message,{
                context:settings.context || "browser core"
            });
        }

        if(global.console && typeof global.console.error === "function"){
            global.console.error("[TV Tracker] browser core error",{
                classification:result.classification,
                status:result.status,
                code:result.code
            });
        }
        return null;
    }

    const APP_STORAGE_PREFIX = "tv-tracker-";
    const APP_LEGACY_STORAGE_KEYS = Object.freeze(["main-data"]);
    const SYNC_CHANNEL_NAME = "tv-tracker-sync-v1";
    const LOGOUT_CLEAR_MESSAGE_TYPE = "logout-clear";

    function safeStorage(name){
        try{
            const value = global[name];
            return value && typeof value.getItem === "function" ? value : null;
        }catch(_error){
            return null;
        }
    }

    function isAppOwnedStorageKey(key){
        return (
            key.startsWith(APP_STORAGE_PREFIX) ||
            APP_LEGACY_STORAGE_KEYS.includes(key)
        );
    }

    function removeAppOwnedStorageKeys(storage){
        if(!storage || typeof storage.removeItem !== "function"){
            return;
        }
        const keys = [];
        try{
            for(let index=0;index<storage.length;index+=1){
                const key = storage.key(index);
                if(key){
                    keys.push(String(key));
                }
            }
        }catch(_error){
            return;
        }
        keys.forEach(key=>{
            if(!isAppOwnedStorageKey(key)){
                return;
            }
            try{
                storage.removeItem(key);
            }catch(_error){
                // A single restricted key must not block the rest of the cleanup.
            }
        });
    }

    function clearClientStorageOnLogout(){
        try{
            ["localStorage","sessionStorage"].forEach(name=>{
                removeAppOwnedStorageKeys(safeStorage(name));
            });
            try{
                if(typeof global.BroadcastChannel === "function"){
                    const channel = new global.BroadcastChannel(SYNC_CHANNEL_NAME);
                    channel.postMessage({type:LOGOUT_CLEAR_MESSAGE_TYPE});
                    channel.close();
                }
            }catch(_error){
                // Other tabs simply keep their queued state until navigation.
            }
        }catch(_error){
            // Logout must never be blocked by client storage cleanup failures.
        }
    }

    const core = Object.freeze({
        version:"phase13-v1",
        api:Object.freeze({request,get,post,patch,delete:remove}),
        errors:Object.freeze({
            Classification:ErrorClassification,
            ApiRequestError,
            classify:classifyError
        }),
        feedback:Object.freeze({presentError}),
        clientStorage:Object.freeze({clearOnLogout:clearClientStorageOnLogout})
    });

    Object.defineProperty(global,"TVTrackerCore",{
        value:core,
        writable:false,
        configurable:false,
        enumerable:false
    });
})(window);
