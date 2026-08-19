"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const feedbackSource = fs.readFileSync(path.join(ROOT,"static/js/feedback.js"),"utf8");
const foundationSource = fs.readFileSync(path.join(ROOT,"static/js/core/foundation.js"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");

function loadedStaticScripts(markup){
    return (markup.match(/<script\b[^>]*>/gi) || []).flatMap(tag=>{
        const match = tag.match(/url_for\(\s*["']static["']\s*,\s*filename\s*=\s*["']([^"']+)["']\s*\)/i);
        return match ? [match[1]] : [];
    });
}

const scriptNames = loadedStaticScripts(template);
assert.strictEqual(scriptNames.filter(filename=>filename === "js/feedback.js").length,1,"feedback.js must load exactly once");
assert.strictEqual(scriptNames.filter(filename=>filename === "js/core/foundation.js").length,1,"foundation.js must load exactly once");
assert(scriptNames.indexOf("js/ui.js") < scriptNames.indexOf("js/feedback.js"),"The feedback compatibility bridge must replace the legacy toast owner");
assert(scriptNames.indexOf("js/feedback.js") < scriptNames.indexOf("js/core/foundation.js"),"Feedback must exist before the foundation delegates to it");
assert(!/\bid\s*=\s*["']toast["']/i.test(template),"The legacy toast surface must not be present in the page");

const loadedSources = new Map();
for(const filename of scriptNames){
    if(!filename.endsWith(".js")){ continue; }
    const sourcePath = path.join(ROOT,"static",...filename.split("/"));
    assert(fs.existsSync(sourcePath),`Loaded browser source is missing: ${filename}`);
    loadedSources.set(filename,fs.readFileSync(sourcePath,"utf8"));
}
const feedbackPublishers = Array.from(loadedSources.entries())
    .filter(([,source])=>/(?:window|globalThis|global)\.TVTrackerFeedback\s*=/.test(source))
    .map(([filename])=>filename);
assert.deepStrictEqual(feedbackPublishers,["js/feedback.js"],"Only feedback.js may publish the visible feedback API");

const visibleSurfaceRenderers = Array.from(loadedSources.entries())
    .filter(([,source])=>source.includes("tv-feedback-root") || source.includes("tv-offline-banner"))
    .map(([filename])=>filename);
assert.deepStrictEqual(visibleSurfaceRenderers,["js/feedback.js"],"Only feedback.js may render the visible feedback surfaces");

assert(foundationSource.includes("const surface = global.TVTrackerFeedback;"),"The foundation must resolve the shared feedback owner");
assert(foundationSource.includes('typeof surface.reportError === "function"'),"The foundation must delegate through reportError");
assert(foundationSource.includes("return surface.reportError(error,message"),"The delegated feedback result must be returned");
for(const forbiddenRendererToken of ["tv-feedback-root","tv-offline-banner","createElement(","appendChild(","insertAdjacentHTML(","innerHTML","textContent"]){
    assert(!foundationSource.includes(forbiddenRendererToken),`foundation.js must not render a second surface (${forbiddenRendererToken})`);
}

class FakeClassList{
    constructor(){ this.values = new Set(); }
    toggle(name,force){
        if(force === true){ this.values.add(name); return true; }
        if(force === false){ this.values.delete(name); return false; }
        if(this.values.has(name)){ this.values.delete(name); return false; }
        this.values.add(name);
        return true;
    }
    contains(name){ return this.values.has(name); }
}

class FakeElement{
    constructor(tagName){
        this.tagName = String(tagName || "div").toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.id = "";
        this.className = "";
        this.dataset = {};
        this.attributes = {};
        this.listeners = {};
        this.hidden = false;
        this.textContent = "";
        this.disabled = false;
        this.type = "";
        this.classList = new FakeClassList();
    }
    appendChild(child){ child.parentNode = this; this.children.push(child); return child; }
    removeChild(child){
        const index = this.children.indexOf(child);
        if(index >= 0){ this.children.splice(index,1); child.parentNode = null; }
        return child;
    }
    setAttribute(name,value){ this.attributes[String(name)] = String(value); }
    addEventListener(name,handler){ this.listeners[String(name)] = handler; }
    querySelector(selector){
        if(!String(selector).startsWith(".")){ return null; }
        const wanted = String(selector).slice(1);
        const stack = this.children.slice();
        while(stack.length){
            const element = stack.shift();
            if(String(element.className || "").split(/\s+/).includes(wanted)){ return element; }
            stack.push(...element.children);
        }
        return null;
    }
}

class FakeDocument{
    constructor(){
        this.readyState = "complete";
        this.body = new FakeElement("body");
    }
    createElement(tagName){ return new FakeElement(tagName); }
    getElementById(id){
        const wanted = String(id);
        const stack = [this.body];
        while(stack.length){
            const element = stack.shift();
            if(element.id === wanted){ return element; }
            stack.push(...element.children);
        }
        return null;
    }
    countById(id){
        const wanted = String(id);
        let count = 0;
        const stack = [this.body];
        while(stack.length){
            const element = stack.shift();
            if(element.id === wanted){ count += 1; }
            stack.push(...element.children);
        }
        return count;
    }
    querySelector(){ return null; }
    addEventListener(){}
}

function loadFeedbackRuntime({online=true}={}){
    const document = new FakeDocument();
    const legacyToast = document.createElement("div");
    legacyToast.id = "toast";
    document.body.appendChild(legacyToast);
    const events = {};
    const logs = [];
    const timers = new Map();
    let timerSequence = 0;
    const window = {
        document,
        navigator:{onLine:online},
        location:{href:"https://tracker.test/app/settings",origin:"https://tracker.test"},
        URL,
        Headers,
        console:{error:(...args)=>logs.push(args)},
        addEventListener:(name,handler)=>{ events[name] = handler; },
        setTimeout:(handler,delay)=>{
            const id = ++timerSequence;
            timers.set(id,{handler,delay});
            return id;
        },
        clearTimeout:id=>timers.delete(id)
    };
    window.window = window;
    vm.runInNewContext(feedbackSource,{window},{filename:"feedback.js"});
    vm.runInNewContext(foundationSource,{window},{filename:"foundation.js"});
    return {window,document,events,logs,timers};
}

{
    const {window,document} = loadFeedbackRuntime();
    const feedback = window.TVTrackerFeedback;
    const root = document.getElementById("tv-feedback-root");
    assert(root,"The sole feedback root must be installed");
    assert.strictEqual(document.getElementById("toast"),null,"The legacy toast surface must be retired");

    const ids = ["A","B","C","D"].map(message=>feedback.notify(message,{severity:"error"}));
    assert.strictEqual(root.children.length,3,"The visible feedback boundary must remain capped at three cards");
    assert.strictEqual(feedback.notify("B",{severity:"error"}),ids[1],"Duplicate feedback must reuse its existing item");
    assert.strictEqual(root.children.length,3,"Deduplication must not create a second card");
    assert.strictEqual(feedback.dismissByKey("error:A"),true);
    assert.deepStrictEqual(
        Array.from(root.children,card=>card.querySelector(".tv-feedback-message").textContent),
        ["B","C","D"],
        "Removing a visible item must pump the queued feedback without exceeding the cap"
    );

    const banner = document.getElementById("tv-offline-banner");
    assert(banner,"The persistent offline surface must be installed");
    feedback.setOffline(true);
    assert.strictEqual(banner.hidden,false);
    assert(document.body.classList.contains("tv-feedback-is-offline"));
    feedback.setOffline(false);
    assert.strictEqual(banner.hidden,true);
    assert(!document.body.classList.contains("tv-feedback-is-offline"));
    assert.strictEqual(document.countById("tv-feedback-root"),1);
    assert.strictEqual(document.countById("tv-offline-banner"),1);
}

{
    const reports = [];
    let renderAttempts = 0;
    const window = {
        document:{
            querySelector(){ return null; },
            createElement(){ renderAttempts += 1; throw new Error("foundation rendered UI"); }
        },
        console:{error(){}},
        TVTrackerFeedback:{
            reportError(error,message,options){
                reports.push({error,message,options});
                return "delegated-feedback-id";
            }
        }
    };
    window.window = window;
    vm.runInNewContext(foundationSource,{window},{filename:"foundation.js"});
    const result = window.TVTrackerCore.feedback.presentError(
        {status:400,code:"BAD_INPUT"},
        {userMessage:"Fix the highlighted fields.",context:"settings save"}
    );
    assert.strictEqual(result,"delegated-feedback-id");
    assert.strictEqual(reports.length,1,"The foundation must make exactly one delegation call");
    assert.strictEqual(reports[0].message,"Fix the highlighted fields.");
    assert.strictEqual(reports[0].options.context,"settings save");
    window.TVTrackerCore.feedback.presentError({status:503},{background:true});
    assert.strictEqual(reports.length,1,"Recoverable background failures must remain non-visible");
    assert.strictEqual(renderAttempts,0,"The foundation must never render its own feedback UI");
}

{
    const {window,document,logs} = loadFeedbackRuntime();
    const rawTechnicalDetail = "VAPID private key mismatch: Server request failed (500)";
    const error = new Error(rawTechnicalDetail);
    const core = window.TVTrackerCore;
    assert.strictEqual(
        core.errors.classify(error).classification,
        core.errors.Classification.TECHNICAL_DETAIL,
        "Unclassified internal failures must stay inside the technical-detail boundary"
    );

    const options = {userMessage:rawTechnicalDetail,context:"feedback revalidation"};
    const firstId = core.feedback.presentError(error,options);
    const secondId = core.feedback.presentError(error,options);
    const root = document.getElementById("tv-feedback-root");
    assert.strictEqual(secondId,firstId,"Foundation delegation must retain feedback deduplication");
    assert.strictEqual(root.children.length,1,"Delegation must produce one visible surface item");
    assert.strictEqual(
        root.children[0].querySelector(".tv-feedback-message").textContent,
        "Something went wrong. Try again.",
        "Technical backend/provider details must never reach the visible surface"
    );
    assert(logs.length > 0,"Suppressed technical detail must retain bounded developer diagnostics");
    assert(!JSON.stringify(logs).includes(rawTechnicalDetail),"Developer diagnostics must not copy the complete raw technical message");
    assert.strictEqual(document.countById("tv-feedback-root"),1);
    assert.strictEqual(document.countById("tv-offline-banner"),1);
}

console.log("Phase 15 feedback ownership revalidation contracts passed.");
