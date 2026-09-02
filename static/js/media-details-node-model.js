(function(global){
    "use strict";

    const SAFE_TAGS = new Set([
        "a","article","button","circle","div","em","footer","g","h1","h2","h3","h4","header","img","li","line","main","nav","p","path","polyline","rect","section","small","span","strong","svg","time","ul","use"
    ]);
    const URL_ATTRS = new Set(["href","src"]);

    function freeze(value){
        if(Array.isArray(value)){
            value.forEach(freeze);
            return Object.freeze(value);
        }
        if(value && typeof value === "object" && !Object.isFrozen(value)){
            Object.keys(value).forEach(key=>freeze(value[key]));
            Object.freeze(value);
        }
        return value;
    }

    function text(value){
        return Object.freeze({kind:"text",text:String(value === null || typeof value === "undefined" ? "" : value)});
    }

    function sanitizeURL(value){
        const raw = String(value || "").trim();
        if(!raw) return "";
        if(/^[\\/]{2}/.test(raw)) return "";
        if(raw.startsWith("/") || raw.startsWith("#")) return raw;
        try{
            const base = global.location && global.location.origin ? global.location.origin : "http://localhost";
            const parsed = new URL(raw,base);
            if(parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
            return raw;
        }catch(error){
            return "";
        }
    }

    function cleanAttrs(source){
        const attrs = {};
        Object.keys(source || {}).forEach(name=>{
            const lower = String(name || "").toLowerCase();
            if(!lower || lower.startsWith("on")) return;
            let value = source[name];
            if(URL_ATTRS.has(lower)){
                value = sanitizeURL(value);
                if(!value) return;
            }
            attrs[name] = value;
        });
        return Object.freeze(attrs);
    }

    function element(tag,attrs={},children=[]){
        const cleanTag = String(tag || "div").toLowerCase();
        if(!SAFE_TAGS.has(cleanTag)){
            return Object.freeze({kind:"element",tag:"span",attrs:Object.freeze({}),children:Object.freeze((children || []).slice())});
        }
        return Object.freeze({
            kind:"element",
            tag:cleanTag,
            attrs:cleanAttrs(attrs),
            children:Object.freeze((children || []).slice())
        });
    }

    global.TVTrackerMediaDetailsNodeModel = Object.freeze({
        text,
        element,
        freeze,
        ownership:"typed-node-model"
    });
})(window);
