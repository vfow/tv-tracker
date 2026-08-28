const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const sourcePath = process.env.NOTIFICATIONS_FINAL_SOURCE || path.join(ROOT,"static/js/notifications-runtime.js");
const source = fs.readFileSync(sourcePath,"utf8");
const runtime = fs.readFileSync(path.join(ROOT,"static/js/notifications-runtime.js"),"utf8");
const settings = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const notificationsSettings = fs.readFileSync(path.join(ROOT,"frontend/src/notifications/SettingsNotifications.vue"),"utf8");
const settingsRuntimeStart = runtime.indexOf('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";');
const settingsRuntime = runtime.slice(settingsRuntimeStart);
const rendererStart = settingsRuntime.indexOf("async function renderNotificationControls");
const rendererEnd = settingsRuntime.indexOf("function openDedicatedSettingsPage",rendererStart);
const rendererSource = settingsRuntime.slice(rendererStart,rendererEnd);

function occurrences(value,needle){
    return value.split(needle).length - 1;
}

// Vue Account Settings is now the sole presentation owner of the Notifications
// settings surface while the existing notifications runtime remains the canonical
// controls/service owner.
assert(!settings.includes('function renderNotifications()'),"route/state Settings facade must not retain Notifications presentation ownership");
assert(notificationsSettings.includes('data-tvtracker-vue-notifications-settings="notifications"'));
assert(notificationsSettings.includes('id="settings-v2-notification-list"'));
assert(notificationsSettings.includes('const runtime = window.TVTrackerNotificationsRuntime;'));
assert(notificationsSettings.includes('await runtime.renderNotificationControls(list);'));
assert(settingsRuntimeStart > 0);
assert(rendererStart > 0 && rendererEnd > rendererStart);
assert(!runtime.includes('section.id = "settings-notifications"'));
assert(!runtime.includes('insertAdjacentElement'));
assert(!runtime.includes('MutationObserver'));
assert(!runtime.includes('function observeSettings()'));
assert(!runtime.includes('function installNotificationSettingsNavigation()'));
assert(!runtime.includes('function mountSettingsNotifications()'));
assert.strictEqual(occurrences(runtime,'const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'),1);
assert.strictEqual(occurrences(runtime,'const BASE_SETTING_OPTIONS = ['),1);
assert.strictEqual(occurrences(runtime,'async function renderNotificationControls'),1);
assert(runtime.includes('"When a movie you plan to watch is released."'));
assert(runtime.includes('"When a movie you plan to watch gets a release date or the date changes."'));
assert(runtime.includes('"Enable alerts on this device."'));
assert(!runtime.includes('Enable browser or phone alerts on this device.'));
assert(!runtime.includes('first meaningful release in your selected region'));
assert(source.includes('body:{timezone,timezoneMode:"automatic"}'));
assert(rendererSource.includes('api.syncAutomaticTimezone()'));
assert(!rendererSource.includes('timezoneMode:"manual"'));
assert(!rendererSource.includes('data-timezone-setting'));
assert(!rendererSource.includes('data-notification-timezone'));
assert(runtime.includes('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'));
assert(runtime.includes('global.TVTrackerNotifications.openNotificationSettingsPage = openDedicatedSettingsPage'));
assert(runtime.includes('data-push-error'));
assert(!runtime.includes('pushDiagnosticMessage'));
assert(!runtime.includes('The VAPID public and private keys do not match.'));
assert(source.includes('registerSubscriptionWithServer(localSubscription)'));
assert(source.includes('subscriptionMatchesPublicKey'));
assert(!source.includes('NotificationApi.requestPermission()'));

// Regression for the duplicate Push row: only the first-class Settings owner
// may render notification controls or intercept notification Settings routes.
const bootStart = source.indexOf("async function boot()");
const bootEnd = source.indexOf('document.addEventListener("visibilitychange"',bootStart);
const bootSource = source.slice(bootStart,bootEnd);
assert(bootStart > 0 && bootEnd > bootStart);
assert(bootSource.includes("installServiceWorkerMessages();"));
assert(source.includes('const polish = global.TVTrackerNotificationsRuntime;'));
assert(source.includes('return polish.adoptMainSettingsSurface(...args);'));
assert(source.includes('return polish.openDedicatedSettingsPage({fromRoute:!!replace});'));
assert(runtime.includes('function ensureMainSettingsSection()'));
assert(runtime.includes('document.getElementById("settings-v2-notification-list")'));
assert(runtime.includes('renderNotificationControls(list);'));
assert(rendererSource.indexOf('list.appendChild(pushRow);') < rendererSource.indexOf('list.appendChild(masterRow);'));

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
        addEventListener(type,handler){
            if(!domListeners[type]) domListeners[type] = [];
            domListeners[type].push(handler);
        }
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
    vm.runInContext(source,context,{filename:"notifications-runtime.js"});
    const pushBoot = (domListeners.DOMContentLoaded || []).find(handler=>handler.name === "boot");
    assert(pushBoot);
    await pushBoot();

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
