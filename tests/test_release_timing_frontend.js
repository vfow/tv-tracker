const assert = require("assert");

global.TVTrackerAuditUtils = require("../static/js/audit-utils.js");
global.addEventListener = ()=>{};
const timing = require("../static/js/release-timing.js");

assert.strictEqual(timing._key(123,2,4),"123:2:4");
assert.strictEqual(timing._key(0,2,4),"");

const shows = {
    "123":{
        tmdb_id:123,
        _episode_list:{
            "1":[
                {season_number:1,episode_number:1,air_date:"2026-08-16"},
                {season_number:1,episode_number:1,air_date:"2026-08-16"},
                {season_number:1,episode_number:2,air_date:"2026-08-23"}
            ]
        },
        next_episode_to_air:{season_number:1,episode_number:2,air_date:"2026-08-23"}
    }
};
const episodes = timing._collectEpisodes(shows);
assert.strictEqual(episodes.length,2,"runtime prefetch must deduplicate episode identities");

const fallback = timing.getReleaseInfo(
    "2026-08-16",
    {season_number:1,episode_number:1},
    {tmdb_id:999}
);
assert.ok(fallback && fallback.date instanceof Date);
assert.strictEqual(fallback.hasTime,false);
assert.strictEqual(fallback.precision,"date");
assert.strictEqual(fallback.date.getDate(),16,"date-only fallback must not add one day");

timing._cache.set("123:1:1",{
    precision:"exact",
    releaseAt:"2026-08-16T12:30:00Z",
    eligibleAt:"2026-08-16T12:30:00Z",
    releaseDate:"2026-08-16",
    displayDate:"2026-08-17",
    confidence:"verified",
    providerUsed:true
});
const exactEpisode = {season_number:1,episode_number:1};
const exactShow = {tmdb_id:123};
const exact = timing.getReleaseInfo(
    "2026-08-16",
    exactEpisode,
    exactShow
);
assert.strictEqual(exact.hasTime,true);
assert.strictEqual(exact.precision,"exact");
assert.strictEqual(exact.releaseDate,"2026-08-16");
assert.strictEqual(exact.displayDate,"2026-08-17");
assert.strictEqual(exact.date.toISOString(),"2026-08-16T12:30:00.000Z");
assert.strictEqual(
    timing.calendarDate("2026-08-16",exactEpisode,exactShow),
    "2026-08-17",
    "canonical timing must replace the displayed calendar date when local timezone shifts the episode"
);

timing._cache.set("123:1:2",{
    precision:"date",
    releaseAt:null,
    eligibleAt:"2023-10-05T00:00:00Z",
    releaseDate:"2023-10-05",
    displayDate:"2023-10-05",
    confidence:"verified",
    providerUsed:true
});
const conflicting = timing.getReleaseInfo(
    "2026-10-23",
    {season_number:1,episode_number:2},
    {tmdb_id:123}
);
assert.strictEqual(conflicting.source,"fallback","clearly conflicting provider dates must fall back to TMDB");
assert.strictEqual(conflicting.releaseDate,"2026-10-23");
assert.strictEqual(
    timing.calendarDate("2026-10-23",{season_number:1,episode_number:2},{tmdb_id:123}),
    "2026-10-23",
    "conflicting cached provider dates must not change the displayed day"
);

console.log("Release timing frontend tests passed.");
