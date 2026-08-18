"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const releaseTimingSource = fs.readFileSync("static/js/release-timing.js","utf8");
const historySource = fs.readFileSync("static/js/history-activity.js","utf8");

function createReleaseTimingContext(statusPayload){
    const requests = [];
    const context = {
        console,
        Date,
        Intl,
        Map,
        Math,
        Number,
        Object,
        Promise,
        String,
        clearTimeout,
        setTimeout,
        addEventListener(){},
        fetch:async(path,options={})=>{
            const method = String(options.method || "GET").toUpperCase();
            requests.push({path:String(path),method,body:options.body});
            if(path === "/api/release-timing/status"){
                return {ok:true,json:async()=>statusPayload};
            }
            if(path === "/api/notifications/settings"){
                return {
                    ok:true,
                    json:async()=>({settings:{timezone:"Asia/Tokyo",timezoneMode:"automatic"}})
                };
            }
            if(path === "/api/release-timing/batch"){
                return {
                    ok:true,
                    json:async()=>({results:{},timezone:statusPayload.timezone,timezoneMode:statusPayload.timezoneMode})
                };
            }
            return {ok:false,json:async()=>({error:"unexpected request"})};
        }
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    vm.runInContext(releaseTimingSource,context,{filename:"release-timing.js"});
    return {api:context.TVTrackerReleaseTiming,requests};
}

(async()=>{
    {
        const {api,requests} = createReleaseTimingContext({
            timezone:"Asia/Kuala_Lumpur",
            timezoneMode:"manual",
            capability:{enabled:false}
        });
        await api.initialize();
        assert.strictEqual(
            requests.filter(item=>item.path === "/api/notifications/settings").length,
            0,
            "manual timezone mode must never be overwritten by automatic browser synchronization"
        );
    }

    {
        const {api} = createReleaseTimingContext({
            timezone:"Asia/Kuala_Lumpur",
            timezoneMode:"manual",
            capability:{enabled:true}
        });
        api._cache.set("1:1:1",{
            releaseAt:null,
            releaseDate:"2026-08-16",
            eligibleAt:"2026-08-15T16:00:00+00:00",
            precision:"date",
            confidence:"verified",
            providerUsed:true,
            displayDate:"2026-08-16"
        });
        const dateOnly = api.getReleaseInfo(
            "2026-08-16",
            {season_number:1,episode_number:1},
            {tmdb_id:1}
        );
        assert.ok(dateOnly);
        assert.strictEqual(dateOnly.hasTime,false,"date-only releases must never pretend to have a confirmed midnight time");
        assert.strictEqual(dateOnly.precision,"date");
        assert.strictEqual(dateOnly.releaseDate,"2026-08-16");
        assert.strictEqual(
            api.calendarDate("2026-08-16",{season_number:1,episode_number:1},{tmdb_id:1}),
            "2026-08-16",
            "date-only releases must keep their canonical calendar date"
        );
    }

    {
        const {api} = createReleaseTimingContext({
            timezone:"Asia/Kuala_Lumpur",
            timezoneMode:"manual",
            capability:{enabled:true}
        });
        api._cache.set("1:1:2",{
            releaseAt:"2026-08-16T23:30:00+00:00",
            releaseDate:"2026-08-16",
            eligibleAt:"2026-08-16T23:30:00+00:00",
            precision:"exact",
            confidence:"verified",
            providerUsed:true,
            displayDate:"2026-08-17"
        });
        const exact = api.getReleaseInfo(
            "2026-08-16",
            {season_number:1,episode_number:2},
            {tmdb_id:1}
        );
        assert.ok(exact);
        assert.strictEqual(exact.hasTime,true);
        assert.strictEqual(exact.date.toISOString(),"2026-08-16T23:30:00.000Z","exact release time must remain the same absolute instant");
        assert.strictEqual(
            api.calendarDate("2026-08-16",{season_number:1,episode_number:2},{tmdb_id:1}),
            "2026-08-17",
            "exact release display date may cross a calendar boundary in the selected timezone"
        );
    }

    {
        const DATA = {
            shows:{"10":{tmdb_id:"10"}},
            history:[
                {id:"logged-later-moved",tmdb_id:"10",season:1,episode:2,air_date:"2099-01-01",watched_at:"2026-08-18T12:00:00Z"},
                {id:"older",tmdb_id:"10",season:1,episode:1,air_date:"2026-08-01",watched_at:"2026-08-17T12:00:00Z"}
            ]
        };
        const before = JSON.stringify(DATA.history);
        let scheduleChecks = 0;
        const context = {
            console,
            Date,
            Number,
            String,
            DATA,
            isMovieHistoryEntry(){ return false; },
            isEpisodeAired(){ scheduleChecks += 1; return false; }
        };
        vm.createContext(context);
        vm.runInContext(historySource,context,{filename:"history-activity.js"});
        const entries = context.getActivityHistoryEntries();
        assert.strictEqual(scheduleChecks,0,"persisted History must not be revalidated against mutable release metadata");
        assert.strictEqual(entries.map(item=>item.id).join(","),"logged-later-moved,older");
        assert.strictEqual(JSON.stringify(DATA.history),before,"reading History must not mutate saved user history");
    }

    console.log("Phase 6 timezone/date-only and History contracts passed.");
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
