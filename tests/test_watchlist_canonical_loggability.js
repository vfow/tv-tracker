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


const today = new Date().toISOString().slice(0,10);
const staleAirDate = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000))
    .toISOString().slice(0,10);

const staleHiatusShow = {
    status:"watching",
    number_of_seasons:1,
    episodes_watched:{"1":[1180]},
    last_episode_to_air:{season_number:1,episode_number:1180},
    _episode_details:{},
    _episode_list:{
        "1":[
            {episode_number:1180,air_date:"2026-09-27",name:"Episode 1180"},
            {episode_number:1181,air_date:staleAirDate,name:"Unconfirmed episode 1181"}
        ]
    }
};
availability.set("1:1180",true);
availability.set("1:1181",true);
assert.strictEqual(
    context.getNextEpisode(staleHiatusShow),
    null,
    "a stale past-dated episode after TMDB's last aired episode must not become the next loggable episode"
);

const newSeasonShow = {
    status:"watching",
    number_of_seasons:2,
    episodes_watched:{"1":[10]},
    last_episode_to_air:{season_number:1,episode_number:10},
    _episode_details:{},
    _episode_list:{
        "1":[{episode_number:10,air_date:"2026-10-01",name:"Season 1 finale"}],
        "2":[{episode_number:1,air_date:today,name:"New season premiere"}]
    }
};
availability.set("1:10",true);
availability.set("2:1",true);
const nextSeasonEpisode = context.getNextEpisode(newSeasonShow);
assert(nextSeasonEpisode,"the first episode of a newly aired season must remain loggable during provider propagation");
assert.strictEqual(nextSeasonEpisode.season,2);
assert.strictEqual(nextSeasonEpisode.episode,1);

const delayedSeasonAirDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))
    .toISOString().slice(0,10);
const delayedProviderSeasonShow = {
    status:"watching",
    number_of_seasons:2,
    episodes_watched:{"1":[10]},
    last_episode_to_air:{season_number:1,episode_number:10},
    _episode_details:{},
    _episode_list:{
        "1":[{episode_number:10,air_date:"2026-10-01",name:"Season 1 finale"}],
        "2":[{episode_number:1,air_date:delayedSeasonAirDate,name:"New season premiere"}]
    }
};
availability.set("2:1",true);
const delayedSeasonEpisode = context.getNextEpisode(delayedProviderSeasonShow);
assert(delayedSeasonEpisode,"a later-season premiere must remain loggable while the provider's last-aired pointer lags behind by a week");
assert.strictEqual(delayedSeasonEpisode.season,2);
assert.strictEqual(delayedSeasonEpisode.episode,1);

console.log("Watchlist canonical loggability regression tests passed.");
