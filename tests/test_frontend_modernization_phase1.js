const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(ROOT,"static/js/client-runtime.js"),"utf8");
const template = fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");

function buildEnvironment({storageWorks=true}={}){
    const elements = new Map();
    const listeners = {};
    const fetchCalls = [];
    let stateResponse = {ok:true,status:200,requestId:"a".repeat(32)};

    function createElement(){
        return {
            id:"",
            className:"",
            hidden:false,
            textContent:"",
            dataset:{},
            attributes:{},
            setAttribute(name,value){ this.attributes[name] = String(value); }
        };
    }

    const document = {
        readyState:"complete",
        body:{
            appendChild(element){
                if(element.id){ elements.set(element.id,element); }
            }
        },
        createElement,
        getElementById(id){ return elements.get(id) || null; },
        querySelector(selector){
            if(selector === 'meta[name="csrf-token"]'){
                return {content:"csrf-test"};
            }
            return null;
        },
        addEventListener(){}
    };

    function makeStorage(){
        return {
            values:new Map(),
            setItem(key,value){
                if(!storageWorks){ throw new Error("storage blocked"); }
                this.values.set(String(key),String(value));
            },
            removeItem(key){
                if(!storageWorks){ throw new Error("storage blocked"); }
                this.values.delete(String(key));
            }
        };
    }

    async function originalFetch(input,init={}){
        const url = typeof input === "string" ? input : input.url;
        fetchCalls.push({url,init});
        if(url === "/api/client-errors"){
            return {
                ok:true,
                status:202,
                headers:{get(){ return null; }},
                async json(){ return {ok:true,eventId:"server-event"}; }
            };
        }
        if(url === "/api/state" && String(init.method || "GET").toUpperCase() === "PATCH"){
            return {
                ok:stateResponse.ok,
                status:stateResponse.status,
                headers:{get(name){
                    return name === "X-Request-ID" ? stateResponse.requestId : null;
                }},
                async json(){ return {}; }
            };
        }
        return {
            ok:true,
            status:200,
            headers:{get(){ return null; }},
            async json(){ return {}; }
        };
    }

    const window = {
        document,
        location:{origin:"https://tracker.example",pathname:"/app/show/123-private-title"},
        navigator:{onLine:true},
        localStorage:makeStorage(),
        sessionStorage:makeStorage(),
        crypto:{randomUUID(){ return "11111111-2222-3333-4444-555555555555"; }},
        fetch:originalFetch,
        addEventListener(name,handler){
            listeners[name] = listeners[name] || [];
            listeners[name].push(handler);
        },
        setTimeout(){ return 1; },
        clearTimeout(){},
        URL
    };

    const context = {
        window,
        URL,
        console,
        Date,
        Math,
        Promise,
        setTimeout:window.setTimeout,
        clearTimeout:window.clearTimeout
    };
    vm.createContext(context);
    vm.runInContext(source,context,{filename:"client-runtime.js"});

    return {
        window,
        elements,
        listeners,
        fetchCalls,
        setStateResponse(value){ stateResponse = value; }
    };
}

(async()=>{
    assert(template.includes("filename='css/runtime-health.css'"));
    assert(template.includes("filename='js/client-runtime.js'"));
    assert(
        template.indexOf("filename='js/client-runtime.js'") < template.indexOf("filename='js/db.js'"),
        "client runtime observation must install before tracker persistence begins"
    );

    const env = buildEnvironment();
    assert.strictEqual(env.window.TVTrackerClientRuntime.surfaceFromPath("/app/settings/streaming"),"settings");
    assert.strictEqual(env.window.TVTrackerClientRuntime.surfaceFromPath("/app/list/watching"),"tracker");
    assert.strictEqual(env.window.TVTrackerClientRuntime.surfaceFromPath("/app/show/123-private-title"),"detail");

    env.setStateResponse({ok:true,status:200,requestId:"a".repeat(32)});
    await env.window.fetch("/api/state",{method:"PATCH",body:'{"private":"payload"}'});
    const saved = env.elements.get("tv-runtime-save-status");
    assert(saved,"save status should be created");
    assert.strictEqual(saved.textContent,"Saved");
    assert.strictEqual(saved.dataset.state,"saved");

    env.setStateResponse({ok:false,status:503,requestId:"B".repeat(32)});
    await env.window.fetch("/api/state",{method:"PATCH",body:'{"private":"payload"}'});
    assert.strictEqual(saved.textContent,"Save failed — retrying…");
    assert.strictEqual(saved.dataset.state,"error");

    const telemetryCall = [...env.fetchCalls].reverse().find(call=>call.url === "/api/client-errors");
    assert(telemetryCall,"failed save should emit a diagnostic event");
    const diagnostic = JSON.parse(telemetryCall.init.body);
    assert.deepStrictEqual(
        Object.keys(diagnostic).sort(),
        ["category","clientEventId","requestId","status","surface"].sort()
    );
    assert.strictEqual(diagnostic.category,"save");
    assert.strictEqual(diagnostic.surface,"detail");
    assert.strictEqual(diagnostic.status,503);
    assert.strictEqual(diagnostic.requestId,"b".repeat(32));
    const serialized = JSON.stringify(diagnostic);
    for(const forbidden of ["private-title","private","payload","message","stack","url"]){
        assert(!serialized.includes(forbidden),`diagnostic must not include ${forbidden}`);
    }

    const callsBeforeRuntimeError = env.fetchCalls.length;
    assert(env.listeners.error && env.listeners.error.length === 1);
    env.listeners.error[0]({message:"Private title and password=hunter2",error:new Error("secret")});
    await Promise.resolve();
    assert(env.fetchCalls.length > callsBeforeRuntimeError);
    const runtimeCall = env.fetchCalls[env.fetchCalls.length - 1];
    const runtimeDiagnostic = JSON.parse(runtimeCall.init.body);
    assert.strictEqual(runtimeDiagnostic.category,"runtime");
    assert.strictEqual(runtimeDiagnostic.code,"uncaught_error");
    assert(!JSON.stringify(runtimeDiagnostic).includes("hunter2"));
    assert(!JSON.stringify(runtimeDiagnostic).includes("Private title"));

    const blocked = buildEnvironment({storageWorks:false});
    const warning = blocked.elements.get("tv-runtime-warning");
    assert(warning,"blocked persistent storage should produce a visible warning");
    assert(warning.textContent.includes("Browser storage is unavailable"));
    const storageCall = blocked.fetchCalls.find(call=>call.url === "/api/client-errors");
    assert(storageCall,"blocked persistent storage should be reported");
    const storageDiagnostic = JSON.parse(storageCall.init.body);
    assert.strictEqual(storageDiagnostic.category,"storage");
    assert.strictEqual(storageDiagnostic.code,"persistent_storage_unavailable");

    console.log("Frontend modernization phase 1 runtime tests passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
