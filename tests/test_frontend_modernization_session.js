const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(ROOT,"static/js/client-runtime.js"),"utf8");

(async()=>{
    const elements = new Map();
    const calls = [];
    let reloads = 0;
    const document = {
        readyState:"complete",
        body:{appendChild(element){ if(element.id) elements.set(element.id,element); }},
        createElement(){
            return {
                id:"",className:"",hidden:false,textContent:"",dataset:{},
                setAttribute(){},
            };
        },
        getElementById(id){ return elements.get(id) || null; },
        querySelector(selector){
            return selector === 'meta[name="csrf-token"]' ? {content:"csrf-test"} : null;
        },
        addEventListener(){}
    };
    const storage = {setItem(){},removeItem(){}};
    async function originalFetch(input,init={}){
        const url = typeof input === "string" ? input : input.url;
        calls.push({url,init});
        if(url === "/api/client-errors"){
            return {ok:true,status:202,headers:{get(){return null;}},async json(){return {ok:true};}};
        }
        return {ok:false,status:401,headers:{get(name){return name === "X-Request-ID" ? "c".repeat(32) : null;}},async json(){return {};}};
    }
    const window = {
        document,
        fetch:originalFetch,
        location:{origin:"https://tracker.example",pathname:"/app/notifications",reload(){ reloads += 1; }},
        navigator:{onLine:true},
        localStorage:storage,
        sessionStorage:storage,
        crypto:{randomUUID(){return "11111111-2222-3333-4444-555555555555";}},
        addEventListener(){},
        setTimeout(callback){ callback(); return 1; },
        clearTimeout(){},
        URL
    };
    const context = {window,URL,Date,Math,Promise,console,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout};
    vm.createContext(context);
    vm.runInContext(source,context,{filename:"client-runtime.js"});

    const response = await window.fetch("/api/notifications",{method:"GET"});
    assert.strictEqual(response.status,401);
    assert.strictEqual(reloads,1,"a same-origin 401 must trigger one clean app reload for server-side login redirect");
    const telemetry = calls.find(call=>call.url === "/api/client-errors");
    assert(telemetry,"session expiry must be observable");
    const payload = JSON.parse(telemetry.init.body);
    assert.strictEqual(payload.category,"session");
    assert.strictEqual(payload.status,401);
    assert.strictEqual(payload.surface,"notifications");
    assert.strictEqual(payload.requestId,"c".repeat(32));

    await window.fetch("/api/notifications/settings",{method:"GET"});
    assert.strictEqual(reloads,1,"concurrent 401 responses must not start repeated reload loops");

    const warning = elements.get("tv-runtime-warning");
    assert(warning && warning.textContent.includes("session expired"));
    console.log("Frontend modernization session recovery tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
