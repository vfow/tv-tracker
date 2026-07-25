"use strict";

const assert = require("assert");
const path = require("path");

const utils = require(path.join(__dirname,"../static/js/audit-utils.js"));
const saveStoreModule = require(path.join(__dirname,"../static/js/pending-save-store.js"));

function fakeStorage(){
    const values = new Map();
    return {
        getItem:key=>values.has(key) ? values.get(key) : null,
        setItem:(key,value)=>values.set(key,String(value)),
        removeItem:key=>values.delete(key)
    };
}

assert.strictEqual(utils.parseStrictLocalDate("2026-02-31"),null);
assert.strictEqual(utils.parseStrictLocalDate("2025-02-29"),null);
assert.ok(utils.parseStrictLocalDate("2024-02-29") instanceof Date);

// The primary episode date remains canonical when TVmaze reports the previous
// broadcaster day. TVmaze is used only when the primary date is unavailable.
assert.strictEqual(
    utils.chooseEpisodeCalendarDate("2026-07-27","2026-07-26"),
    "2026-07-27"
);
assert.strictEqual(
    utils.chooseEpisodeCalendarDate("","2026-07-26"),
    "2026-07-26"
);
assert.strictEqual(
    utils.chooseEpisodeCalendarDate("2026-02-31","2026-07-26"),
    "2026-07-26"
);

// An exact timestamp can refine the time only when it remains on the canonical
// calendar date in Kuala Lumpur. A previous-day timestamp must not shift it.
assert.strictEqual(
    utils.isTimestampOnCalendarDate(
        "2026-07-27T01:00:00.000Z",
        "2026-07-27",
        "Asia/Kuala_Lumpur"
    ),
    true
);
assert.strictEqual(
    utils.isTimestampOnCalendarDate(
        "2026-07-26T01:00:00.000Z",
        "2026-07-27",
        "Asia/Kuala_Lumpur"
    ),
    false
);

const fallback = utils.makeDateOnlyEpisodeReleaseDate("2026-07-25","09:00","+08:00");
assert.strictEqual(fallback.toISOString(),"2026-07-25T01:00:00.000Z");
// The estimated release boundary is exact: unavailable immediately before it,
// available at the fallback instant.
assert.strictEqual(new Date("2026-07-25T00:59:59.999Z").getTime() >= fallback.getTime(),false);
assert.strictEqual(new Date("2026-07-25T01:00:00.000Z").getTime() >= fallback.getTime(),true);
assert.strictEqual(
    utils.makeDateOnlyEpisodeReleaseDate("2026-02-31","09:00","+08:00"),
    null
);
assert.strictEqual(utils.prefersReducedMotion(()=>({matches:true})),true);
assert.strictEqual(utils.prefersReducedMotion(()=>({matches:false})),false);

assert.strictEqual(saveStoreModule.pendingSaveStatusText,undefined);

const storage = fakeStorage();
const firstStore = saveStoreModule.createPendingSaveStore(storage,"test-pending");
firstStore.add({
    id:"operation-12345678",
    createdAt:1,
    dirtyOptions:{showIds:["123"]},
    delta:{
        showsUpsert:{"123":{title:"Example"}},
        showsDelete:[],historyUpsert:{},historyDelete:[],historyOrder:null,stateUpsert:{}
    }
});

// A new store instance simulates a page reload. The operation must survive.
const reloadedStore = saveStoreModule.createPendingSaveStore(storage,"test-pending");
assert.strictEqual(reloadedStore.load().length,1);
assert.strictEqual(reloadedStore.load()[0].id,"operation-12345678");

// It is cleared only after the caller reports server confirmation.
reloadedStore.remove("operation-12345678");
assert.strictEqual(reloadedStore.load().length,0);

console.log("Frontend audit regression tests passed.");
