(function(global){
    "use strict";

    const MAX_VISIBLE = 3;
    const DEFAULT_DURATION = {success:3000,info:4500};
    const queue = [];
    const visible = new Map();
    let sequence = 0;

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
            banner.textContent = "You’re offline. Some changes may not sync yet.";
            global.document.body.appendChild(banner);
        }
        return banner;
    }

    function normalizeSeverity(value){
        const clean = String(value || "info").toLowerCase();
        return ["success","info","warning","error"].includes(clean) ? clean : "info";
    }

    function messageKey(message,severity,key){
        return String(key || (severity + ":" + String(message || "").trim()));
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
        if(item.duration > 0){
            item.timer = global.setTimeout(()=>remove(item.id),item.duration);
        }
    }

    function pump(){
        while(visible.size < MAX_VISIBLE && queue.length){
            showItem(queue.shift());
        }
    }

    function notify(message,options={}){
        const text = String(message || "").trim();
        if(!text){ return null; }
        const severity = normalizeSeverity(options.severity);
        const key = messageKey(text,severity,options.key);
        const duplicate = findByKey(key);
        if(duplicate){
            duplicate.message = text;
            if(duplicate.element){
                const copy = duplicate.element.querySelector(".tv-feedback-message");
                if(copy){ copy.textContent = text; }
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
        banner.hidden = !offline;
    }

    function installNetworkState(){
        if(!global.addEventListener){ return; }
        const sync = ()=>setOffline(typeof global.navigator !== "undefined" && global.navigator.onLine === false);
        global.addEventListener("online",sync);
        global.addEventListener("offline",sync);
        sync();
    }

    const api = Object.freeze({notify,dismissByKey,setOffline});
    global.TVTrackerFeedback = api;

    // Compatibility for existing callers. New code should call TVTrackerFeedback.notify.
    global.showToast = function(message,options={}){
        const normalized = Object.assign({},options);
        if(options.actionLabel && typeof options.onAction === "function"){
            normalized.actionLabel = options.actionLabel;
            normalized.onAction = options.onAction;
        }
        return notify(message,normalized);
    };

    if(global.document && global.document.readyState === "loading"){
        global.document.addEventListener("DOMContentLoaded",()=>{
            ensureRoot();
            ensureOfflineBanner();
            installNetworkState();
        },{once:true});
    }else{
        ensureRoot();
        ensureOfflineBanner();
        installNetworkState();
    }
})(window);
