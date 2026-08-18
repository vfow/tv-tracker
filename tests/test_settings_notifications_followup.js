const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const sourcePath = process.env.NOTIFICATIONS_FINAL_SOURCE || path.join(ROOT,"static/js/notifications-final.js");
const source = fs.readFileSync(sourcePath,"utf8");
const polish = fs.readFileSync(path.join(ROOT,"static/js/notifications-polish.js"),"utf8");
const settings = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");

// Account Settings is now the sole owner of the Notifications settings surface.
assert(settings.includes('function renderNotifications()'));
assert(settings.includes('id="settings-v2-notification-list"'));
assert(settings.includes('global.TVTrackerNotificationPolish'));
assert(!polish.includes('section.id = "settings-notifications"'));
assert(!polish.includes('insertAdjacentElement'));
assert(!polish.includes('MutationObserver'));
assert(polish.includes('"When a movie you plan to watch is released."'));
assert(polish.includes('"When a movie you plan to watch gets a release date or the date changes."'));
assert(polish.includes('"Enable alerts on this device."'));
assert(!polish.includes('Enable browser or phone alerts on this device.'));
assert(!polish.includes('first meaningful release in your selected region'));
assert(source.includes('body:{timezone,timezoneMode:"automatic"}'));
assert(!source.includes('timezoneMode:"manual"'));
assert(polish.includes('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'));
assert(polish.includes('global.TVTrackerNotifications.openNotificationSettingsPage = openDedicatedSettingsPage'));
assert(polish.includes('data-push-error'));
assert(!polish.includes('pushDiagnosticMessage'));
assert(!polish.includes('The VAPID public and private keys do not match.'));
assert(source.includes('registerSubscriptionWithServer(localSubscription)'));
assert(source.includes('subscriptionMatchesPublicKey'));
assert(!source.includes('NotificationApi.requestPermission()'));

// Regression for the duplicate Push row: notifications-final.js may keep its
// legacy renderer functions for compatibility, but its runtime boot must never
// start them. notifications-polish.js renders into the first-class Settings owner.
const bootStart = source.indexOf("async function boot()");
const bootEnd = source.indexOf('document.addEventListener("visibilitychange"',bootStart);
const bootSource = source.slice(bootStart,bootEnd);
assert(bootStart > 0 && bootEnd > bootStart);
assert(!bootSource.includes("observeSettings();"));
assert(!bootSource.includes("installNotificationSettingsNavigation();"));
assert(bootSource.includes("installServiceWorkerMessages();"));
assert(source.includes('const polish = global.TVTrackerNotificationPolish;'));
assert(source.includes('return polish.adoptMainSettingsSurface(...args);'));
assert(source.includes('return polish.openDedicatedSettingsPage({fromRoute:!!replace});'));
assert(polish.includes('function ensureMainSettingsSection()'));
assert(polish.includes('document.getElementById("settings-v2-notification-list")'));
assert(polish.includes('renderNotificationControls(list);'));
assert(polish.indexOf('list.appendChild(pushRow);') < polish.indexOf('list.appendChild(masterRow);'));

const enableStart = source.indexOf("async function enablePush");
const enableEnd = source.indexOf("async function disablePush",enableStart);
const enableSource = source.slice(enableStart,enableEnd);
const subscribeStatement = "subscription = await registration.pushManager.subscribe";
const subscribePosition = enableSource.indexOf(subscribeStatement);
assert(subscribePosition > 0);
const beforeSubscribe = enableSource.slice(0,subscribePosition).replace(/\/\/.*$/gm,"");
assert(!beforeSubscribe.includes("await "));
assert(!enableSource.includes('NotificationApi.permission !== "granted"'));

function storage(){
    const values = new Map();
    return {
        getItem:key=>values.has(key) ? values.get(key) : null,
        setItem:(key,value)=>values.set(key,String(value))
    };
}

async function runtimePushRecoveryTest(){
    const publicKeyBytes = Buffer.alloc(65,7);
    publicKeyBytes[0] = 4;
    const publicKey = publicKeyBytes.toString("base64url");
    let serverSubscribed = false;
    let subscribeCalls = 0;
    let localSubscription = null;
    const subscription = {
        endpoint:"https://push.example.test/subscription",
        options:{applicationServerKey:publicKeyBytes.buffer.slice(publicKeyBytes.byteOffset,publicKeyBytes.byteOffset + publicKeyBytes.byteLength)},
        toJSON(){
            return {endpoint:this.endpoint,keys:{p256dh:"p256dh-key",auth:"auth-key"}};
        },
        async unsubscribe(){ localSubscription = null; return true; }
    };
    const pushManager = {
        async getSubscription(){ return localSubscription; },
        async subscribe(){
            subscribeCalls += 1;
            localSubscription = subscription;
            // Intentionally leave Notification.permission at "default" to model
            // browsers that update that observable state after subscribe() resolves.
            return subscription;
        }
    };
    const worker = {postMessage(){}};
    const registration = {pushManager,active:worker};
    const domListeners = {};
    const serviceWorkerListeners = {};

    const document = {
        readyState:"loading",
        hidden:false,
        querySelector(){ return null; },
        querySelectorAll(){ return []; },
        getElementById(){ return null; },
        addEventListener(type,handler){ domListeners[type] = handler; }
    };
    const navigator = {
        userAgent:"Firefox",
        platform:"Win32",
        maxTouchPoints:0,
        standalone:false,
        serviceWorker:{
            async register(){ return registration; },
            ready:Promise.resolve(registration),
            controller:worker,
            addEventListener(type,handler){ serviceWorkerListeners[type] = handler; }
        }
    };
    const Notification = {permission:"default"};

    async function fetch(url,options={}){
        const method = String(options.method || "GET").toUpperCase();
        let payload = {ok:true};
        if(url === "/api/notifications/settings" && method === "PATCH"){
            payload = {ok:true,settings:{timezone:"Asia/Kuala_Lumpur",timezoneMode:"automatic"}};
        }else if(url === "/api/push/config"){
            payload = {ok:true,configured:true,publicKey};
        }else if(String(url).startsWith("/api/push/device")){
            payload = {ok:true,subscribed:serverSubscribed};
        }else if(url === "/api/push/subscribe" && method === "POST"){
            const body = JSON.parse(options.body || "{}");
            assert(body.deviceId);
            assert.strictEqual(body.subscription.endpoint,subscription.endpoint);
            serverSubscribed = true;
            payload = {ok:true,subscribed:true};
        }else if(url === "/api/push/unsubscribe" && method === "POST"){
            serverSubscribed = false;
            payload = {ok:true,subscribed:false};
        }else if(url === "/api/push/presence" && method === "POST"){
            payload = {ok:true,active:true};
        }
        return {ok:true,async json(){ return payload; }};
    }

    const window = {
        document,
        navigator,
        Notification,
        PushManager:function PushManager(){},
        location:{pathname:"/app/list/watching",hash:"",href:""},
        history:{replaceState(){},pushState(){}},
        localStorage:storage(),
        sessionStorage:storage(),
        crypto:{randomUUID:()=>"11111111-1111-4111-8111-111111111111"},
        fetch,
        atob:value=>Buffer.from(value,"base64").toString("binary"),
        matchMedia:()=>({matches:false}),
        MutationObserver:class { observe(){} },
        setTimeout,
        clearTimeout,
        setInterval:()=>1,
        clearInterval(){},
        addEventListener(){},
        console
    };
    window.window = window;

    const context = vm.createContext({
        window,
        document,
        navigator,
        Notification,
        PushManager:window.PushManager,
        localStorage:window.localStorage,
        sessionStorage:window.sessionStorage,
        history:window.history,
        fetch,
        MutationObserver:window.MutationObserver,
        Intl,
        Uint8Array,
        Promise,
        Array,
        Set,
        Map,
        Number,
        String,
        RegExp,
        Math,
        Date,
        encodeURIComponent,
        console
    });
    vm.runInContext(source,context,{filename:"notifications-final.js"});
    assert(domListeners.DOMContentLoaded);
    await domListeners.DOMContentLoaded();

    // Regression: a successful PushSubscription must not be rejected only because
    // Notification.permission is still momentarily "default".
    await window.TVTrackerFinalNotifications.enablePush(publicKey,null);
    assert.strictEqual(subscribeCalls,1);
    assert.strictEqual(serverSubscribed,true);

    // Regression: if the browser already has the subscription but the server lost
    // its device row, pushState() should repair the server side automatically.
    serverSubscribed = false;
    Notification.permission = "granted";
    const repaired = await window.TVTrackerFinalNotifications.pushState();
    assert.strictEqual(repaired.checked,true);
    assert.strictEqual(serverSubscribed,true);
    assert.strictEqual(subscribeCalls,1,"Reconciliation must reuse the existing browser subscription");
}

runtimePushRecoveryTest().then(()=>{
    console.log("Settings notifications follow-up contracts passed.");
}).catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
