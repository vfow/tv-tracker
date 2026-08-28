const assert = require("assert");
const fs = require("fs");
const path = require("path");

require("../static/js/trending.js");
const api = globalThis.TVTrackerTrending;

assert.ok(api,"Trending API should be exported");
assert.strictEqual(api.DAY_TTL,30 * 60 * 1000);
assert.strictEqual(api.WEEK_TTL,3 * 60 * 60 * 1000);
assert.strictEqual(api.CONFIGS["tv-day"].path,"trending/tv/day");
assert.strictEqual(api.CONFIGS["tv-week"].path,"trending/tv/week");
assert.strictEqual(api.CONFIGS["movie-day"].path,"trending/movie/day");
assert.strictEqual(api.CONFIGS["movie-week"].path,"trending/movie/week");

assert.strictEqual(api.routeFor("tv-day"),"/app/discover?trending=tv-day");
assert.strictEqual(api.routeFor("movie-week"),"/app/discover?trending=movie-week");
assert.strictEqual(api.parseRoute("/app/discover","?trending=tv-day"),"tv-day");
assert.strictEqual(api.parseRoute("/app/discover/","?trending=movie-week"),"movie-week");
assert.strictEqual(api.parseRoute("/app/discover","?trending=bad"),"");
assert.strictEqual(api.parseRoute("/app/discover","?trending=tv-day&sort=rating"),"");
assert.strictEqual(api.parseRoute("/app/discover/tv/popular","?trending=tv-day"),"");

const raw = [
    {id:30,name:"Third",first_air_date:"2024-03-01"},
    {id:10,name:"First",first_air_date:"2024-01-01"},
    {id:20,name:"Second",first_air_date:"2024-02-01"},
    {id:10,name:"Duplicate",first_air_date:"2024-01-01"}
];
const normalized = api.normalizeItems(raw,"tv");
assert.deepStrictEqual(normalized.map(item=>item.id),[30,10,20],"TMDB order must be preserved while exact duplicates are removed");
assert.deepStrictEqual(normalized.map(item=>item.title),["Third","First","Second"]);

const tvDay = api.buildSection("tv-day",{results:raw});
const tvWeek = api.buildSection("tv-week",{results:[{id:40,name:"Week"}]});
const movieDay = api.buildSection("movie-day",{results:[{id:50,title:"Movie Day",release_date:"2025-01-01"}]});
const movieWeek = api.buildSection("movie-week",{results:[{id:60,title:"Movie Week",release_date:"2025-02-01"}]});
assert.strictEqual(tvDay.route,"/app/discover?trending=tv-day");
assert.deepStrictEqual(tvDay.items.map(item=>item.id),[30,10,20]);

const base = [
    {key:"tv/popular",media:"tv",category:"popular"},
    {key:"tv/top-rated",media:"tv",category:"top-rated"},
    {key:"tv/airing-today",media:"tv",category:"airing-today"},
    {key:"tv/on-the-air",media:"tv",category:"on-the-air"},
    {key:"movie/popular",media:"movie",category:"popular"},
    {key:"movie/top-rated",media:"movie",category:"top-rated"},
    {key:"movie/now-playing",media:"movie",category:"now-playing"},
    {key:"movie/upcoming",media:"movie",category:"upcoming"}
];
const merged = api.mergeSections(base,[tvDay,tvWeek,movieDay,movieWeek]);
assert.deepStrictEqual(merged.map(section=>section.key),[
    "tv/popular","trending/tv-day","trending/tv-week","tv/top-rated","tv/airing-today","tv/on-the-air",
    "movie/popular","trending/movie-day","trending/movie-week","movie/top-rated","movie/now-playing","movie/upcoming"
]);

const source = fs.readFileSync(path.join(__dirname,"../static/js/trending.js"),"utf8");
assert.ok(source.includes("tmdbFetchJSON"),"Trending should use the existing TMDB fetch helper");
assert.ok(!source.includes("sortBrowseResultsForDisplay"),"Trending must not re-sort TMDB ranking");
assert.ok(!source.includes("renderBrowseControlsHTML"),"Trending full pages must not expose normal Discover browse filters");
assert.ok(source.includes("registerRouteHandler"),"Trending must register its routes through the shared router extension point");
assert.ok(source.includes("TVTrackerRouter.setPathRoute"),"Trending route writes must delegate to the canonical router");
assert.ok(!source.includes("pushState("),"Trending must not write pushState directly");
assert.ok(!source.includes("replaceState("),"Trending must not write replaceState directly");
assert.ok(!source.includes("stopImmediatePropagation"),"Trending must not intercept events that belong to the shared router");
assert.ok(!source.includes("document.addEventListener"),"Trending must not install its own document-level click interceptor");
assert.ok(!source.includes('addEventListener("popstate"'),"Trending must not install its own popstate handler");
assert.ok(source.includes("currentRouteKey() !== config.key"),"Stale Trending failures must not overwrite a page after navigation");

console.log("Trending regression tests passed.");
