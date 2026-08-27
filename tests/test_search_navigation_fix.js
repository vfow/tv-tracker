const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { extractBetween } = require("./helpers/extract.js");

const uiSource = fs.readFileSync(path.join(__dirname,"..","static","js","ui.js"),"utf8");
const source = extractBetween(
  uiSource,
  "// --TVT-search-navigation-owner-begin--",
  "// --TVT-search-navigation-owner-end--"
);

function load(overrides={}){
    const calls = [];
    const win = Object.assign({
        searchRouteState:{query:"",media:"tv",fadeWatched:true},
        discoverSearchState:{query:"Dune",media:"movie"},
        normalizeSearchMediaType:value=>String(value || "tv").toLowerCase(),
        getSearchRoute:(query,media,state)=>`/app/search?q=${encodeURIComponent(query)}&type=${media}${state.fadeWatched ? "&fadeWatched=1" : ""}`,
        TVTrackerRouter:{setPathRoute:(route,replace)=>calls.push({route,replace})},
        history:{replaceState:(state,title,route)=>calls.push({route,replace:"history"})}
    },overrides);
    const context = {window:win,console,Object,String,Array,encodeURIComponent};
    vm.createContext(context);
    vm.runInContext(source,context);
    return {win,calls};
}

{
    const {win,calls} = load();
    const route = win.lockSearchRouteBeforeResultOpen();
    assert.strictEqual(route,"/app/search?q=Dune&type=movie&fadeWatched=1");
    assert.deepStrictEqual(calls,[{route,replace:true}]);
    assert.strictEqual(win.searchRouteState.query,"Dune");
    assert.strictEqual(win.searchRouteState.media,"movie");
}

{
    const {win,calls} = load({
        discoverSearchState:{query:"",media:"tv"},
        searchRouteState:{query:"",media:"tv"}
    });
    assert.strictEqual(win.lockSearchRouteBeforeResultOpen(),"");
    assert.deepStrictEqual(calls,[]);
}

{
    const calls = [];
    const {win} = load({
        TVTrackerRouter:null,
        history:{replaceState:(state,title,route)=>calls.push(route)}
    });
    const route = win.lockSearchRouteBeforeResultOpen();
    assert.strictEqual(route,"/app/search?q=Dune&type=movie&fadeWatched=1");
    assert.deepStrictEqual(calls,[route]);
}

assert.ok(source.includes("window.TVTrackerRouter"),"the folded search navigation logic must live in ui.js and use window-scoped refs");
console.log("Search navigation fix regression tests passed.");