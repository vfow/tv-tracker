"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname,"..");
const settingsSource = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const adultSource = fs.readFileSync(path.join(ROOT,"static/js/adult-filter.js"),"utf8");

// Settings must not publish routes that do not exist yet. Legal/public pages are
// a later product/legal phase, so the current Settings shell must not contain
// dead Privacy/Terms/About links.
assert(!settingsSource.includes('href="/privacy"'));
assert(!settingsSource.includes('href="/terms"'));
assert(!settingsSource.includes('href="/about"'));

// Profile persistence has one owner. Settings sets the Adult Filter value in the
// profile snapshot before delegating to saveProfileSettings(), which performs the
// single save and existing success feedback.
const profileSaveStart = settingsSource.indexOf('if(save) save.addEventListener("click",async()=>{');
const profileSaveEnd = settingsSource.indexOf('        updateProfilePreview();',profileSaveStart);
assert(profileSaveStart > 0 && profileSaveEnd > profileSaveStart);
const profileSaveSource = settingsSource.slice(profileSaveStart,profileSaveEnd);
const adultAssignment = profileSaveSource.indexOf('profile.adult_filter = draft.adult_filter !== false;');
const ownerSave = profileSaveSource.indexOf('await global.saveProfileSettings(draft);');
assert(adultAssignment >= 0 && ownerSave > adultAssignment,"Adult Filter must be included before the one profile persistence call");
assert(!profileSaveSource.includes('global.saveData'),"Settings profile save must not issue a second persistence call");
assert(!profileSaveSource.includes('notify("Settings saved"'),"Settings must not emit a duplicate success message after the profile owner succeeds");
assert(profileSaveSource.includes('profile.adult_filter = previousAdultFilter;'),"A failed profile save must restore the previous Adult Filter value");

// Existing tracked titles without an Adult classification are enriched only via
// a TMDB search result whose returned id exactly equals the tracked TMDB id.
assert(adultSource.includes('"search/" + candidate.kind'));
assert(adultSource.includes('String(item && item.id || "") === candidate.id'));
assert(adultSource.includes('classificationRequest ? "true" : includeAdultParam(media)'));
assert(adultSource.includes('return classificationRequest ? payload : filterPayload(payload);'));
assert(!adultSource.includes('candidate.kind + "/" + encodeURIComponent(candidate.id)'),"Classification must not assume TV/movie detail response shapes expose Adult classification");

function loadAdultPolicy(){
    const calls = [];
    const saves = [];
    const DATA = {
        profile:{adult_filter:true,favorite_movies:[]},
        shows:{
            "10":{tmdb_id:"10",title:"Same Title"},
            "11":{tmdb_id:"11",title:"Same Title"}
        },
        movies:{},
        history:[]
    };
    const window = {
        DATA,
        sessionStorage:{length:0,key(){return null;},removeItem(){}},
        async tmdbFetchJSON(pathname,params,options){
            calls.push({pathname,params:Object.assign({},params),options:Object.assign({},options)});
            return {
                page:1,
                results:[
                    {id:999,name:"Same Title",adult:true},
                    {id:10,name:"Same Title",adult:false}
                ]
            };
        },
        async saveData(options){ saves.push(options); }
    };
    window.window = window;
    vm.runInNewContext(adultSource,{window,encodeURIComponent,Map,Set,Array,Object,String,Number,Math,Promise},{filename:"adult-filter.js"});
    return {window,calls,saves};
}

(async()=>{
    const {window,calls,saves} = loadAdultPolicy();
    const result = await window.TVTrackerAdultPolicy.classifyTrackedMedia();

    assert.strictEqual(result.checked,2);
    assert.strictEqual(result.changed,1,"Only the exact TMDB-id result may update classification");
    assert.strictEqual(window.DATA.shows["10"].adult,false,"Exact-id TMDB search result should be persisted");
    assert.strictEqual(typeof window.DATA.shows["11"].adult,"undefined","Same-title nonmatching results must never be guessed onto another tracked title");
    assert.strictEqual(calls.length,2);
    calls.forEach(call=>{
        assert.strictEqual(call.pathname,"search/tv");
        assert.strictEqual(call.params.query,"Same Title");
        assert.strictEqual(call.params.include_adult,"true","Internal classification must be able to inspect TMDB-labelled Adult results");
        assert.strictEqual(call.options.adultPolicyClassification,true);
    });
    assert.strictEqual(saves.length,1);
    assert.deepStrictEqual(Array.from(saves[0].stateKeys),["shows"]);

    console.log("Phase 6 Settings repair contracts passed.");
})().catch(error=>{
    console.error(error);
    process.exitCode = 1;
});
