const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const app = fs.readFileSync("static/js/app.js","utf8");

function section(startMarker,endMarker){
    const start = app.indexOf(startMarker);
    const end = app.indexOf(endMarker,start);
    assert(start >= 0, `missing ${startMarker}`);
    assert(end > start, `missing ${endMarker}`);
    return app.slice(start,end);
}

const source = [
    section("function getEpisodeNumberFromInfo", "function getHistoryEntries"),
    section("function filterShow(show){", "function getWatchedEpisodeCount(show){")
].join("\n");

const availability = new Map();
const seen = [];
const context = {
    console,
    Object,
    Array,
    Number,
    String,
    Math,
    Date,
    activeFilter:"watching",
    getDayDiffFromToday(){ return 0; },
    isEpisodeAired(airDate,episodeInfo){
        const season = Number(episodeInfo && episodeInfo.season_number);
        const episode = Number(episodeInfo && episodeInfo.episode_number);
        seen.push({season,episode,airDate});
        if(!Number.isFinite(season) || !Number.isFinite(episode)){
            return true; // reproduces the old TMDB date-only fallback path
        }
        return availability.get(`${season}:${episode}`) === true;
    }
};
vm.createContext(context);
vm.runInContext(source,context);

const futureShow = {
    status:"watching",
    number_of_seasons:1,
    episodes_watched:{},
    _episode_details:{},
    _episode_list:{
        "1":[{episode_number:1,air_date:"2026-08-16",name:"Pilot"}]
    }
};

availability.set("1:1",false);
seen.length = 0;
assert.strictEqual(context.getNextEpisode(futureShow),null,"future canonical episode must not become the Watching next episode");
assert.strictEqual(context.filterShow(futureShow),false,"show with only a future canonical episode must not appear in Watching");
assert(seen.some(item=>item.season === 1 && item.episode === 1),"season hint must be restored before canonical timing is checked");

availability.set("1:1",true);
const aired = context.getNextEpisode(futureShow);
assert(aired,"aired canonical episode must appear in Watching");
assert.strictEqual(aired.season,1);
assert.strictEqual(aired.episode,1);
assert.strictEqual(aired.season_number,1,"returned next episode must preserve canonical season identity");
assert.strictEqual(aired.episode_number,1,"returned next episode must preserve canonical episode identity");
assert.strictEqual(context.filterShow(futureShow),true);

futureShow.episodes_watched = {"1":[1]};
assert.strictEqual(context.getNextEpisode(futureShow),null,"watched episodes must remain excluded");
assert.strictEqual(context.filterShow(futureShow),false);

console.log("Watchlist canonical loggability regression tests passed.");
