"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(ROOT,"static/js/feedback.js"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"static/css/feedback.css"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");

class FakeClassList{
    constructor(){ this.values = new Set(); }
    toggle(name,force){
        if(force === true){ this.values.add(name); return true; }
        if(force === false){ this.values.delete(name); return false; }
        if(this.values.has(name)){ this.values.delete(name); return false; }
        this.values.add(name); return true;
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
        if(String(selector).startsWith(".")){
            const wanted = String(selector).slice(1);
            const stack = this.children.slice();
            while(stack.length){
                const item = stack.shift();
                if(String(item.className || "").split(/\s+/).includes(wanted)) return item;
                stack.push(...item.children);
            }
        }
        return null;
    }
}

class FakeDocument{
    constructor(){ this.readyState = "complete"; this.body = new FakeElement("body"); }
    createElement(tagName){ return new FakeElement(tagName); }
    getElementById(id){
        const wanted = String(id);
        const stack = [this.body];
        while(stack.length){
            const item = stack.shift();
            if(item.id === wanted) return item;
            stack.push(...item.children);
        }
        return null;
    }
    addEventListener(){}
}

function loadFeedback({online=true}={}){
    const document = new FakeDocument();
    const events = {};
    const logs = [];
    let timerId = 0;
    const timers = new Map();
    const window = {
        document,
        navigator:{onLine:online},
        console:{error:(...args)=>logs.push(args)},
        addEventListener:(name,handler)=>{ events[name] = handler; },
        setTimeout:(handler,delay)=>{ const id=++timerId; timers.set(id,{handler,delay}); return id; },
        clearTimeout:id=>timers.delete(id)
    };
    window.window = window;
    vm.runInNewContext(source,{window},{filename:"feedback.js"});
    return {window,document,events,logs,timers};
}

{
    const {window,document} = loadFeedback();
    const api = window.TVTrackerFeedback;
    const ids = ["A","B","C","D"].map(message=>api.notify(message,{severity:"error"}));
    const root = document.getElementById("tv-feedback-root");

    assert(root,"Unified feedback root must be created once");
    assert.strictEqual(root.children.length,3,"At most three feedback cards may be visible");
    assert.strictEqual(api.notify("B",{severity:"error"}),ids[1],"Duplicate feedback must reuse the existing card");
    assert.strictEqual(root.children.length,3,"Deduplication must not add another visible card");

    assert.strictEqual(api.dismissByKey("error:A"),true);
    assert.strictEqual(root.children.length,3,"Dismissing a visible card must pump the queued card");
    assert.deepStrictEqual(
        Array.from(root.children,card=>card.querySelector(".tv-feedback-message").textContent),
        ["B","C","D"]
    );
}

{
    const {window,document,logs} = loadFeedback();
    window.showToast("VAPID private key mismatch: Server request failed (500)");
    const root = document.getElementById("tv-feedback-root");
    const card = root.children[0];
    assert(card,"Legacy showToast must route into the unified feedback root");
    assert(card.className.includes("tv-feedback-card--error"),"Technical legacy errors must be promoted to error feedback");
    assert.strictEqual(
        card.querySelector(".tv-feedback-message").textContent,
        "Couldn’t complete that request. Try again.",
        "Technical backend/provider details must not reach normal UI"
    );
    assert(logs.length > 0,"Suppressed technical feedback should leave a bounded diagnostic in developer logs");
    assert(!JSON.stringify(logs).includes("private key mismatch: Server request failed"),"Technical logging must be bounded/redacted rather than copying the complete raw UI string");
}

{
    const {window,document,logs} = loadFeedback();
    window.TVTrackerFeedback.reportError(
        Object.assign(new Error("Server request failed (503)"),{status:503,code:"database_unavailable"}),
        "Couldn’t save your changes.",
        {context:"profile save"}
    );
    const root = document.getElementById("tv-feedback-root");
    assert.strictEqual(root.children.length,1);
    assert.strictEqual(root.children[0].querySelector(".tv-feedback-message").textContent,"Couldn’t save your changes.");
    assert(logs.length === 1,"reportError must log the technical failure once while showing safe copy");
}

{
    const {window,document} = loadFeedback();
    const api = window.TVTrackerFeedback;
    const banner = document.getElementById("tv-offline-banner");
    api.setOffline(true);
    assert.strictEqual(banner.hidden,false,"Offline state must have a persistent banner");
    assert(document.body.classList.contains("tv-feedback-is-offline"),"Offline state must reserve layout space for feedback cards");
    api.setOffline(false);
    assert.strictEqual(banner.hidden,true);
    assert(!document.body.classList.contains("tv-feedback-is-offline"));
}

assert(css.includes(".tv-feedback-is-offline .tv-feedback-root{bottom:76px}"),"Desktop cards must move above the offline banner");
assert(css.includes(".tv-feedback-is-offline .tv-feedback-root{bottom:132px}"),"Mobile cards must move above the offline banner and bottom navigation");
assert(css.includes("@media(max-width:767.98px)"),"Mobile feedback placement must remain explicit");
assert(!source.includes("<svg") && !/[🚫⚠️✅❌]/u.test(source),"Unified feedback cards must not add decorative status icons");

const uiPosition = template.indexOf("js/ui.js");
const feedbackPosition = template.indexOf("js/feedback.js");
assert(uiPosition >= 0 && feedbackPosition > uiPosition,"feedback.js must load after legacy UI so its compatibility bridge is authoritative");

console.log("Phase 7 unified feedback contracts passed.");
