(function(global){
    "use strict";

    const MAX_VISIBLE = 3;
    const DEFAULT_DURATION = {success:3000,info:4500};
    const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";
    const GENERIC_REQUEST_ERROR_MESSAGE = "Couldn’t complete that request. Try again.";
    const OFFLINE_MESSAGE = "You’re offline. Some changes may not sync yet.";
    const queue = [];
    const visible = new Map();
    let sequence = 0;

    const TECHNICAL_MESSAGE_PATTERNS = Object.freeze([
        /\b(?:traceback|stack trace|typeerror|referenceerror|syntaxerror|rangeerror|evalerror)\b/i,
        /(?:^|\n)\s*at\s+\S+/,
        /\b(?:vapid|pywebpush|psycopg|postgres(?:ql)?|sqlite|sqlstate)\b/i,
        /\b(?:database_url|secret_key|private[_ -]?key|api[_ -]?key|environment variable)\b/i,
        /\b(?:dependencyavailable|validationcode|validationerror)\b/i,
        /\b(?:econnreset|econnrefused|enotfound|etimedout|fetch failed|failed to fetch)\b/i,
        /networkerror when attempting/i,
        /\bhttp(?: status)?\s*\d{3}\b/i,
        /server request failed\s*\(\d{3}\)/i,
        /\bstatus_message\b/i,
        /\b(?:tmdb|tvmaze)\b.*\b(?:error|failed|request)\b/i,
        /-----BEGIN [A-Z ]+PRIVATE KEY-----/i
    ]);

    function removeLegacyToastSurface(){
        if(!global.document){ return; }
        const legacy = global.document.getElementById("toast");
        if(legacy && legacy.parentNode){
            legacy.parentNode.removeChild(legacy);
        }
    }

    function ensureRoot(){
        if(!global.document){ return null; }
        let root = global.document.getElementById("tv-feedback-root");
        if(!root){
            root = global.document.createElement("div");
            root.id = "tv-feedback-root";
            root.className = "tv-feedback-root";
            root.setAttribute("aria-live","polite");
            root.setAttribute("aria-relevant","additions text");
            global.document.body.appendChild(root);
        }
        return root;
    }

    function ensureOfflineBanner(){
        if(!global.document){ return null; }
        let banner = global.document.getElementById("tv-offline-banner");
        if(!banner){
            banner = global.document.createElement("div");
            banner.id = "tv-offline-banner";
            banner.className = "tv-offline-banner";
            banner.setAttribute("role","status");
            banner.hidden = true;
            banner.textContent = OFFLINE_MESSAGE;
            global.document.body.appendChild(banner);
        }
        return banner;
    }

    function normalizeSeverity(value){
        const clean = String(value || "info").toLowerCase();
        return ["success","info","warning","error"].includes(clean) ? clean : "info";
    }

    function looksTechnical(message){
        const text = String(message || "").trim();
        return !!text && TECHNICAL_MESSAGE_PATTERNS.some(pattern=>pattern.test(text));
    }

    function sanitizeUserMessage(message,fallback=GENERIC_ERROR_MESSAGE){
        const text = String(message || "").trim();
        if(!text){ return String(fallback || GENERIC_ERROR_MESSAGE); }
        return looksTechnical(text) ? String(fallback || GENERIC_ERROR_MESSAGE) : text;
    }

    function redactDiagnosticText(value){
        let text = String(value || "");
        text = text.replace(/((?:api[_ -]?key|token|secret|password|private[_ -]?key)\s*[=:]\s*)[^\s,&;]+/ig,"$1[redacted]");
        text = text.replace(/([?&](?:api_key|token|key|secret|password)=)[^&#\s]+/ig,"$1[redacted]");
        text = text.replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/ig,"[redacted private key]");
        return text.length > 500 ? text.slice(0,500) + "…" : text;
    }

    function boundedDiagnosticMessage(value){
        const text = redactDiagnosticText(value).trim();
        if(!text){ return ""; }
        if(/\b(?:vapid|private[_ -]?key|api[_ -]?key|secret_key|database_url|environment variable)\b/i.test(text)){
            return "Sensitive configuration error";
        }
        if(/\b(?:tmdb|tvmaze)\b/i.test(text)){
            return "External provider request failed";
        }
        if(/\b(?:econnreset|econnrefused|enotfound|etimedout|fetch failed|failed to fetch|networkerror when attempting)\b/i.test(text)){
            return "Network request failed";
        }
        if(/server request failed|\bhttp(?: status)?\s*\d{3}\b/i.test(text)){
            return "Server request failed";
        }
        if(/\b(?:traceback|stack trace|typeerror|referenceerror|syntaxerror|rangeerror|evalerror)\b/i.test(text) || /(?:^|\n)\s*at\s+\S+/.test(text)){
            return "Browser runtime error";
        }
        return text;
    }

    function statusFromDiagnostic(source,message){
        if(Number.isFinite(Number(source && source.status))){ return Number(source.status); }
        const match = String(message || "").match(/(?:http(?: status)?\s*|server request failed\s*\()(\d{3})/i);
        return match ? Number(match[1]) : undefined;
    }

    function logTechnical(context,error){
        if(!global.console || typeof global.console.error !== "function"){ return; }
        const source = error && typeof error === "object" ? error : {message:error};
        const rawMessage = source && source.message || error || "";
        const diagnostic = {
            name:redactDiagnosticText(source && source.name || "Error"),
            message:boundedDiagnosticMessage(rawMessage),
            status:statusFromDiagnostic(source,rawMessage),
            code:redactDiagnosticText(source && source.code || (source && source.payload && source.payload.code) || "")
        };
        Object.keys(diagnostic).forEach(key=>{
            if(diagnostic[key] === "" || diagnostic[key] === undefined){ delete diagnostic[key]; }
        });
        global.console.error("[TV Tracker] " + String(context || "operation failed"),diagnostic);
    }

    function messageKey(message,severity,key){
        return String(key || (severity + ":" + String(message || "").trim()));
    }

    function restartTimer(item){
        if(!item){ return; }
        if(item.timer){
            global.clearTimeout(item.timer);
            item.timer = null;
        }
        if(item.duration > 0){
            item.timer = global.setTimeout(()=>remove(item.id),item.duration);
        }
    }

    function remove(id){
        const item = visible.get(id);
        if(!item){ return; }
        if(item.timer){ global.clearTimeout(item.timer); }
        if(item.element && item.element.parentNode){ item.element.parentNode.removeChild(item.element); }
        visible.delete(id);
        pump();
    }

    function findByKey(key){
        for(const item of visible.values()){
            if(item.key === key){ return item; }
        }
        return queue.find(item=>item.key === key) || null;
    }

    function buildElement(item){
        const card = global.document.createElement("div");
        card.className = "tv-feedback-card tv-feedback-card--" + item.severity;
        card.dataset.feedbackId = item.id;
        card.setAttribute("role",item.severity === "error" || item.severity === "warning" ? "alert" : "status");

        const copy = global.document.createElement("div");
        copy.className = "tv-feedback-message";
        copy.textContent = item.message;
        card.appendChild(copy);

        if(item.actionLabel && typeof item.onAction === "function"){
            const action = global.document.createElement("button");
            action.type = "button";
            action.className = "tv-feedback-action";
            action.textContent = item.actionLabel;
            action.addEventListener("click",async()=>{
                action.disabled = true;
                try{
                    await item.onAction();
                    remove(item.id);
                }catch(error){
                    logTechnical("feedback action failed",error);
                    action.disabled = false;
                }
            });
            card.appendChild(action);
        }

        if(item.dismissible){
            const dismiss = global.document.createElement("button");
            dismiss.type = "button";
            dismiss.className = "tv-feedback-dismiss";
            dismiss.textContent = "Dismiss";
            dismiss.addEventListener("click",()=>remove(item.id));
            card.appendChild(dismiss);
        }

        return card;
    }

    function showItem(item){
        const root = ensureRoot();
        if(!root){ return; }
        item.element = buildElement(item);
        root.appendChild(item.element);
        visible.set(item.id,item);
        restartTimer(item);
    }

    function pump(){
        while(visible.size < MAX_VISIBLE && queue.length){
            showItem(queue.shift());
        }
    }

    function notify(message,options={}){
        const severity = normalizeSeverity(options.severity);
        const fallback = String(options.fallbackMessage || (severity === "error" ? GENERIC_ERROR_MESSAGE : GENERIC_REQUEST_ERROR_MESSAGE));
        const original = String(message || "").trim();
        const text = sanitizeUserMessage(original,fallback);
        if(!text){ return null; }
        if(original && original !== text){
            logTechnical("suppressed technical feedback",{message:original});
        }

        const key = messageKey(text,severity,options.key);
        const duplicate = findByKey(key);
        if(duplicate){
            duplicate.message = text;
            if(duplicate.element){
                const copy = duplicate.element.querySelector(".tv-feedback-message");
                if(copy){ copy.textContent = text; }
                restartTimer(duplicate);
            }
            return duplicate.id;
        }

        const persistent = options.persistent === true || severity === "error" || severity === "warning";
        const duration = Number.isFinite(Number(options.duration))
            ? Math.max(0,Number(options.duration))
            : (persistent ? 0 : (DEFAULT_DURATION[severity] || DEFAULT_DURATION.info));
        const item = {
            id:"feedback-" + (++sequence),
            key,
            message:text,
            severity,
            duration,
            dismissible:options.dismissible !== false && (persistent || options.dismissible === true),
            actionLabel:String(options.actionLabel || ""),
            onAction:typeof options.onAction === "function" ? options.onAction : null,
            timer:null,
            element:null
        };
        queue.push(item);
        pump();
        return item.id;
    }

    function reportError(error,userMessage=GENERIC_ERROR_MESSAGE,options={}){
        logTechnical(String(options.context || "operation failed"),error);
        const normalized = Object.assign({},options,{
            severity:"error",
            fallbackMessage:GENERIC_ERROR_MESSAGE
        });
        delete normalized.context;
        return notify(sanitizeUserMessage(userMessage,GENERIC_ERROR_MESSAGE),normalized);
    }

    function dismissByKey(key){
        const clean = String(key || "");
        const active = findByKey(clean);
        if(active && visible.has(active.id)){
            remove(active.id);
            return true;
        }
        const index = queue.findIndex(item=>item.key === clean);
        if(index >= 0){ queue.splice(index,1); return true; }
        return false;
    }

    function setOffline(offline){
        const banner = ensureOfflineBanner();
        if(!banner){ return; }
        const isOffline = offline === true;
        banner.hidden = !isOffline;
        if(global.document && global.document.body && global.document.body.classList){
            global.document.body.classList.toggle("tv-feedback-is-offline",isOffline);
        }
    }

    function installNetworkState(){
        if(!global.addEventListener){ return; }
        const sync = ()=>setOffline(typeof global.navigator !== "undefined" && global.navigator.onLine === false);
        global.addEventListener("online",sync);
        global.addEventListener("offline",sync);
        sync();
    }

    const api = Object.freeze({
        notify,
        reportError,
        dismissByKey,
        setOffline,
        sanitizeUserMessage,
        looksTechnical
    });
    global.TVTrackerFeedback = api;

    // Compatibility bridge for old callers. This is intentionally routed through
    // the same queue/sanitizer so legacy code cannot create a second feedback UI
    // or expose raw provider/backend details.
    global.showToast = function(message,options={}){
        const normalized = Object.assign({},options);
        const original = String(message || "").trim();
        if(looksTechnical(original)){
            normalized.severity = "error";
            normalized.fallbackMessage = GENERIC_REQUEST_ERROR_MESSAGE;
        }
        return notify(original,normalized);
    };

    if(global.document && global.document.readyState === "loading"){
        global.document.addEventListener("DOMContentLoaded",()=>{
            removeLegacyToastSurface();
            ensureRoot();
            ensureOfflineBanner();
            installNetworkState();
        },{once:true});
    }else{
        removeLegacyToastSurface();
        ensureRoot();
        ensureOfflineBanner();
        installNetworkState();
    }
})(window);
