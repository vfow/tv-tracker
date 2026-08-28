const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");

function classList(){
    const values = new Set();
    return {
        toggle(name,active){
            if(active){ values.add(name); }else{ values.delete(name); }
        },
        contains(name){ return values.has(name); }
    };
}

function element(id=""){
    const listeners = new Map();
    const attributes = new Map();
    return {
        id,
        value:"",
        disabled:false,
        hidden:false,
        tabIndex:0,
        dataset:{},
        classList:classList(),
        isConnected:true,
        setAttribute(name,value){ attributes.set(name,String(value)); },
        getAttribute(name){ return attributes.has(name) ? attributes.get(name) : null; },
        hasAttribute(name){ return attributes.has(name); },
        addEventListener(name,handler){
            if(!listeners.has(name)){ listeners.set(name,[]); }
            listeners.get(name).push(handler);
        },
        dispatch(name,event={}){
            (listeners.get(name) || []).forEach(handler=>handler(event));
        },
        focus(){ this.ownerDocument.activeElement = this; }
    };
}

function testLoginInteraction(){
    const username = element("username");
    const password = element("password");
    const submit = element("sign-in-button");
    const loginTab = element("login-tab");
    const signupTab = element("signup-tab");
    const loginPanel = element("login-panel");
    const signupPanel = element("signup-panel");
    loginTab.dataset.authTab = "login";
    signupTab.dataset.authTab = "signup";

    const elements = new Map([
        ["username",username],
        ["password",password],
        ["sign-in-button",submit],
        ["login-panel",loginPanel],
        ["signup-panel",signupPanel]
    ]);
    const document = {
        body:{dataset:{initialAuthTab:"login"}},
        activeElement:null,
        getElementById(id){ return elements.get(id) || null; },
        querySelectorAll(selector){ return selector === "[data-auth-tab]" ? [loginTab,signupTab] : []; }
    };
    [username,password,submit,loginTab,signupTab,loginPanel,signupPanel].forEach(node=>node.ownerDocument=document);

    const windowListeners = new Map();
    const window = {
        addEventListener(name,handler){ windowListeners.set(name,handler); },
        setTimeout(handler){ handler(); return 1; }
    };
    const source = fs.readFileSync(path.join(ROOT,"static/js/login.js"),"utf8");
    vm.runInNewContext(source,{document,window});

    assert.strictEqual(submit.disabled,true,"login starts disabled");
    assert.strictEqual(loginTab.tabIndex,0,"selected tab participates in tab order");
    assert.strictEqual(signupTab.tabIndex,-1,"inactive tab uses roving tabindex");
    assert.strictEqual(loginPanel.hidden,false);
    assert.strictEqual(signupPanel.hidden,true);

    password.value = "secret";
    password.dispatch("input");
    assert.strictEqual(submit.disabled,true,"password alone must not enable sign in");

    username.value = "vfow";
    username.dispatch("input");
    assert.strictEqual(submit.disabled,false,"both credentials enable sign in");
    assert.strictEqual(submit.classList.contains("is-ready"),true);
    assert.strictEqual(submit.getAttribute("aria-disabled"),"false");

    username.value = "   ";
    username.dispatch("change");
    assert.strictEqual(submit.disabled,true,"blank username disables sign in again");

    let prevented = false;
    loginTab.dispatch("keydown",{key:"ArrowRight",preventDefault(){ prevented = true; }});
    assert.strictEqual(prevented,true);
    assert.strictEqual(signupTab.getAttribute("aria-selected"),"true");
    assert.strictEqual(loginTab.getAttribute("aria-selected"),"false");
    assert.strictEqual(signupPanel.hidden,false);
    assert.strictEqual(loginPanel.hidden,true);
    assert.strictEqual(document.activeElement,signupTab,"arrow navigation focuses the newly selected tab");

    signupTab.dispatch("keydown",{key:"Home",preventDefault(){}});
    assert.strictEqual(document.activeElement,loginTab,"Home moves to the first auth tab");
    assert.strictEqual(loginTab.getAttribute("aria-selected"),"true");

    assert.strictEqual(typeof windowListeners.get("pageshow"),"function");
}

async function testStartupRecovery(){
    const status = element("tv-tracker-startup-status");
    status.children = [];
    status.textContent = "";
    status.appendChild = function(child){ this.children.push(child); return child; };
    status.querySelector = function(selector){
        if(selector !== "[data-startup-retry]"){ return null; }
        return this.children.find(child=>child && child.getAttribute && child.getAttribute("data-startup-retry") !== null) || null;
    };

    const document = {
        getElementById(id){ return id === "tv-tracker-startup-status" ? status : null; },
        createElement(){
            const node = element();
            node.ownerDocument = document;
            return node;
        },
        createTextNode(text){ return {nodeType:3,textContent:String(text)}; }
    };
    status.ownerDocument = document;

    let handled = false;
    let reloaded = false;
    const window = {
        document,
        location:{reload(){ reloaded = true; }},
        startTVTrackerApp(){ return Promise.reject(new Error("startup failed")); },
        handleTVTrackerStartupFailure(){
            handled = true;
            status.hidden = false;
            status.textContent = "TV Tracker could not start. Refresh the page to try again.";
        }
    };
    const source = fs.readFileSync(path.join(ROOT,"static/js/startup.js"),"utf8");
    vm.runInNewContext(source,{window,Promise});
    await window.TVTrackerStartupPromise;

    assert.strictEqual(handled,true,"startup failure still uses the canonical failure handler");
    const retry = status.querySelector("[data-startup-retry]");
    assert.ok(retry,"startup failure renders an explicit recovery control");
    assert.strictEqual(retry.textContent,"RELOAD APP");
    retry.dispatch("click");
    assert.strictEqual(reloaded,true,"startup recovery reloads the application");
}

function testInteractionQualityBootsWithoutAnOpenDialog(){
    const keydownHandlers = [];
    const document = {
        readyState:"complete",
        body:{},
        activeElement:null,
        querySelectorAll(){ return []; },
        addEventListener(name,handler){ if(name === "keydown"){ keydownHandlers.push(handler); } }
    };
    class FakeMutationObserver {
        constructor(callback){ this.callback = callback; }
        observe(){}
    }
    const window = {
        document,
        MutationObserver:FakeMutationObserver,
        getComputedStyle(element){ return element.style || {display:"block",visibility:"visible"}; },
        requestAnimationFrame(handler){ handler(); },
        setTimeout(handler){ handler(); }
    };
    const source = fs.readFileSync(path.join(ROOT,"static/js/interaction-quality.js"),"utf8");
    vm.runInNewContext(source,{window});

    assert.ok(window.TVTrackerInteractionQuality,"interaction quality API is installed");
    assert.strictEqual(window.TVTrackerInteractionQuality.sync(),null);
    assert.strictEqual(keydownHandlers.length,1,"dialog keyboard handling is installed once");
}

(async()=>{
    testLoginInteraction();
    await testStartupRecovery();
    testInteractionQualityBootsWithoutAnOpenDialog();
    console.log("Product quality interaction tests passed.");
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
