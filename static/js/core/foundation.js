(function installTVTrackerCore(global){
    "use strict";

    if(Object.prototype.hasOwnProperty.call(global,"TVTrackerCore")){ return; }

    const SAFE_METHODS = Object.freeze(["GET","HEAD","OPTIONS"]);
    const ErrorClassification = Object.freeze({
        ACTIONABLE:"ACTIONABLE",
        VISIBLE_SERVICE_PROBLEM:"VISIBLE_SERVICE_PROBLEM",
        RECOVERABLE_BACKGROUND_FAILURE:"RECOVERABLE_BACKGROUND_FAILURE",
        TECHNICAL_DETAIL:"TECHNICAL_DETAIL"
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
        const serviceFailure = looksLikeNetworkFailure(error)
            || status === 429
            || (status !== null && status >= 500);

        if(settings.background === true && serviceFailure){
            return classified(
                error,
                ErrorClassification.RECOVERABLE_BACKGROUND_FAILURE,
                status,
                "",
                true
            );
        }
        if(status !== null && [400,401,403,404,409,422].includes(status)){
            return classified(
                error,
                ErrorClassification.ACTIONABLE,
                status,
                "Couldn't complete that request. Check the details and try again.",
                status === 409
            );
        }
        if(serviceFailure){
            return classified(
                error,
                ErrorClassification.VISIBLE_SERVICE_PROBLEM,
                status,
                "TV Tracker can't reach the service right now. Try again.",
                true
            );
        }
        return classified(
            error,
            ErrorClassification.TECHNICAL_DETAIL,
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
        if(result.classification === ErrorClassification.RECOVERABLE_BACKGROUND_FAILURE){
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

    const core = Object.freeze({
        version:"phase13-v1",
        api:Object.freeze({request,get,post,patch,delete:remove}),
        errors:Object.freeze({
            Classification:ErrorClassification,
            ApiRequestError,
            classify:classifyError
        }),
        feedback:Object.freeze({presentError})
    });

    Object.defineProperty(global,"TVTrackerCore",{
        value:core,
        writable:false,
        configurable:false,
        enumerable:false
    });
})(window);
