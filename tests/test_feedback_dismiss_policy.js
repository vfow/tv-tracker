"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const feedbackSource = fs.readFileSync(path.join(ROOT,"static/js/feedback.js"),"utf8");
const policySource = fs.readFileSync(path.join(ROOT,"static/js/feedback-dismiss-policy.js"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");

class FakeClassList{
    constructor(){ this.values = new Set(); }
    toggle(name,force){
        if(force === true){ this.values.add(name); return true; }
        if(force === false){ this.values.delete(name); return false; }
        if(this.values.has(name)){ this.values.delete(name); return false; }
        this.values.add(name); return true;
    }
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
        if(!String(selector).startsWith(".")) return null;
        const wanted = String(selector).slice(1);
        const stack = this.children.slice();
        while(stack.length){
            const item = stack.shift();
            if(String(item.className || "").split(/\s+/).includes(wanted)) return item;
            stack.push(...item.children);
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

const document = new FakeDocument();
const window = {
    document,
    navigator:{onLine:true},
    console:{error(){}},
    addEventListener(){},
    setTimeout(){ return 1; },
    clearTimeout(){}
};
window.window = window;

vm.runInNewContext(feedbackSource,{window},{filename:"feedback.js"});
vm.runInNewContext(policySource,{window,Object},{filename:"feedback-dismiss-policy.js"});

const root = document.getElementById("tv-feedback-root");
assert(root,"feedback root must exist");

for(const severity of ["success","info","warning","error"]){
    window.TVTrackerFeedback.notify("Message " + severity,{severity,key:"dismiss-" + severity});
}

assert.strictEqual(root.children.length,3,"feedback visibility limit should stay unchanged");
for(const card of root.children){
    const dismiss = card.querySelector(".tv-feedback-dismiss");
    assert(dismiss,"every visible feedback alert should have a Dismiss control");
    assert.strictEqual(dismiss.textContent,"Dismiss");
}

const firstDismiss = root.children[0].querySelector(".tv-feedback-dismiss");
firstDismiss.listeners.click();
assert.strictEqual(root.children.length,3,"dismissing a card should reveal the queued alert");
assert(root.children[2].querySelector(".tv-feedback-dismiss"),"queued alerts must also render Dismiss when shown");

window.TVTrackerFeedback.notify("No dismiss",{severity:"info",key:"no-dismiss",dismissible:false});
while(root.children.length && root.children[0].querySelector(".tv-feedback-dismiss")){
    root.children[0].querySelector(".tv-feedback-dismiss").listeners.click();
}
const noDismissCard = root.children.find(card=>{
    const message = card.querySelector(".tv-feedback-message");
    return message && message.textContent === "No dismiss";
});
assert(noDismissCard,"explicit non-dismissible feedback should still be allowed");
assert.strictEqual(noDismissCard.querySelector(".tv-feedback-dismiss"),null);

const feedbackPosition = template.indexOf("js/feedback.js");
const policyPosition = template.indexOf("js/feedback-dismiss-policy.js");
assert(feedbackPosition >= 0 && policyPosition > feedbackPosition,"dismiss policy must load immediately after feedback.js");

console.log("Feedback dismiss policy checks passed.");
