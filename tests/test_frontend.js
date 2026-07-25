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

// TVmaze contributes only the exact matching episode's clock time and source
// offset. Its calendar date is ignored and the clock is attached to TMDB's
// canonical date before the browser converts the instant to local time.
const canonicalUtcRelease = utils.makeCanonicalEpisodeReleaseDate(
    "2026-07-27",
    "17:00",
    "2026-07-26T17:00:00Z"
);
assert.strictEqual(
    canonicalUtcRelease.toISOString(),
    "2026-07-27T17:00:00.000Z"
);

const canonicalOffsetRelease = utils.makeCanonicalEpisodeReleaseDate(
    "2026-07-27",
    "21:00",
    "2026-07-26T21:00:00-04:00"
);
assert.strictEqual(
    canonicalOffsetRelease.toISOString(),
    "2026-07-28T01:00:00.000Z"
);

// An offset-bearing airstamp without an explicitly published TVmaze airtime
// is not trustworthy. It may be generated from a default show schedule.
assert.strictEqual(
    utils.makeCanonicalEpisodeReleaseDate(
        "2026-07-27",
        "",
        "2026-07-26T03:15:00+02:00"
    ),
    null
);

// The explicit clock and airstamp clock must agree before the timestamp's
// source offset can be used.
assert.strictEqual(
    utils.makeCanonicalEpisodeReleaseDate(
        "2026-07-27",
        "17:00",
        "2026-07-26T20:00:00+02:00"
    ),
    null
);
assert.strictEqual(
    utils.hasTrustworthyTVmazeAirtime(
        "17:00",
        "2026-07-26T17:00:00+02:00"
    ),
    true
);
assert.strictEqual(
    utils.hasTrustworthyTVmazeAirtime(
        "",
        "2026-07-26T17:00:00+02:00"
    ),
    false
);

// A source clock without an offset-bearing airstamp cannot be converted
// reliably and must be treated as date-only metadata.
assert.strictEqual(
    utils.makeCanonicalEpisodeReleaseDate(
        "2026-07-27",
        "17:00",
        "2026-07-26T17:00:00"
    ),
    null
);

// Date-only metadata remains upcoming for the complete official date in the
// browser's timezone and becomes available at local midnight the next day.
const dateOnlyRelease = utils.makeDateOnlyEpisodeReleaseDate("2026-07-27");
assert.strictEqual(dateOnlyRelease.getFullYear(),2026);
assert.strictEqual(dateOnlyRelease.getMonth(),6);
assert.strictEqual(dateOnlyRelease.getDate(),28);
assert.strictEqual(dateOnlyRelease.getHours(),0);
assert.strictEqual(dateOnlyRelease.getMinutes(),0);
assert.strictEqual(
    utils.makeDateOnlyEpisodeReleaseDate("2026-02-31"),
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
