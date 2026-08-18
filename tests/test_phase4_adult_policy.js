"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "static", "js", "adult-filter.js"), "utf8");

function loadPolicy(profile = {}, options = {}) {
  const DATA = {
    profile,
    shows: options.shows || {},
    movies: options.movies || {},
    history: options.history || []
  };
  const window = {
    DATA,
    sessionStorage: {
      length: 0,
      key(){ return null; },
      removeItem(){}
    },
    createShowObject: options.createShowObject,
    getMovieRecordFromDetails: options.getMovieRecordFromDetails,
    normalizeMovieTrackingRecord: options.normalizeMovieTrackingRecord,
    normalizeFavoriteMovieRecord: options.normalizeFavoriteMovieRecord,
    filterShow: options.filterShow,
    getWatchlistShowsForCurrentView: options.getWatchlistShowsForCurrentView,
    getLibraryBaseStatusShows: options.getLibraryBaseStatusShows,
    getFavoriteShows: options.getFavoriteShows,
    getFavoriteMovies: options.getFavoriteMovies,
    getUpcomingShows: options.getUpcomingShows,
    getUpcomingScheduleItems: options.getUpcomingScheduleItems,
    getActivityHistoryEntries: options.getActivityHistoryEntries,
    isMovieHistoryEntry: options.isMovieHistoryEntry,
    tmdbFetchJSON: options.tmdbFetchJSON,
    saveData: options.saveData
  };
  Object.keys(window).forEach(key=>{
    if(window[key] === undefined) delete window[key];
  });
  window.window = window;
  vm.runInNewContext(source, { window, encodeURIComponent }, { filename: "adult-filter.js" });
  return { window, policy: window.TVTrackerAdultPolicy };
}

{
  const { policy } = loadPolicy({});
  assert.strictEqual(policy.enabled(), true, "Adult Filter must default ON");
  assert.strictEqual(policy.includeAdultParam("movie"), "false");
  assert.strictEqual(policy.includeAdultParam("tv"), "false");
}

{
  const { policy } = loadPolicy({ adult_filter: false });
  assert.strictEqual(policy.enabled(), false);
  assert.strictEqual(policy.includeAdultParam("movie"), "true");
  assert.strictEqual(policy.includeAdultParam("tv"), "true");
}

{
  const visible = { id: 1, adult: false };
  const hidden = { id: 2, adult: true };
  const sourceItems = [visible, hidden];
  const { policy } = loadPolicy({ adult_filter: true });
  const filtered = policy.filterItems(sourceItems);

  assert.deepStrictEqual(Array.from(filtered, item => item.id), [1]);
  assert.strictEqual(sourceItems.length, 2, "Filtering must hide adult titles, never delete tracker/cache data");
  assert.strictEqual(sourceItems[1], hidden, "Filtering must not rewrite the hidden record");
}

{
  const payload = { page: 1, results: [{ id: 1, adult: true }, { id: 2, adult: false }] };
  const { policy } = loadPolicy({ adult_filter: true });
  const filtered = policy.filterPayload(payload);

  assert.notStrictEqual(filtered, payload, "Filtered TMDB result payload should be a shallow copy");
  assert.deepStrictEqual(Array.from(filtered.results, item => item.id), [2]);
  assert.strictEqual(payload.results.length, 2, "Original TMDB payload must remain intact");
}

{
  const adultShow = { tmdb_id: 10, title: "Hidden Show", adult: true, status: "watching" };
  const normalShow = { tmdb_id: 11, title: "Visible Show", adult: false, status: "watching" };
  const shows = { "10": adultShow, "11": normalShow };
  const sourceArray = [adultShow, normalShow];
  const { window } = loadPolicy(
    { adult_filter: true },
    {
      shows,
      filterShow:()=>true,
      getWatchlistShowsForCurrentView:()=>sourceArray.slice(),
      getLibraryBaseStatusShows:()=>sourceArray.slice(),
      getFavoriteShows:()=>sourceArray.slice(),
      getUpcomingScheduleItems:show=>[{ show }],
      getUpcomingShows:()=>sourceArray.map(show=>({ show }))
    }
  );

  assert.deepStrictEqual(Array.from(window.getWatchlistShowsForCurrentView(), item=>item.tmdb_id), [11]);
  assert.deepStrictEqual(Array.from(window.getLibraryBaseStatusShows(), item=>item.tmdb_id), [11]);
  assert.deepStrictEqual(Array.from(window.getFavoriteShows(), item=>item.tmdb_id), [11]);
  assert.strictEqual(window.filterShow(adultShow), false);
  assert.deepStrictEqual(Array.from(window.getUpcomingScheduleItems(adultShow)), []);
  assert.deepStrictEqual(Array.from(window.getUpcomingShows(), item=>item.show.tmdb_id), [11]);
  assert.strictEqual(window.DATA.shows["10"], adultShow, "Hidden tracked shows must remain in DATA");
  assert.strictEqual(Object.keys(window.DATA.shows).length, 2, "Adult Filter must never delete a tracked show");
}

{
  const adultMovie = { id: "20", tmdb_id: "20", title: "Hidden Movie", adult: true };
  const normalMovie = { id: "21", tmdb_id: "21", title: "Visible Movie", adult: false };
  const movies = { "20": adultMovie, "21": normalMovie };
  const history = [
    { media_type: "movie", movie_id: "20", title: "Hidden Movie" },
    { media_type: "movie", movie_id: "21", title: "Visible Movie" },
    { tmdb_id: "30", title: "Visible Show Episode" }
  ];
  const { window } = loadPolicy(
    { adult_filter: true },
    {
      movies,
      shows:{ "30": { tmdb_id: "30", adult: false } },
      history,
      getFavoriteMovies:()=>[adultMovie, normalMovie],
      getActivityHistoryEntries:()=>history.slice(),
      isMovieHistoryEntry:entry=>entry.media_type === "movie"
    }
  );

  assert.deepStrictEqual(Array.from(window.getFavoriteMovies(), item=>String(item.id)), ["21"]);
  assert.deepStrictEqual(Array.from(window.getActivityHistoryEntries(), item=>item.title), ["Visible Movie", "Visible Show Episode"]);
  assert.strictEqual(window.DATA.movies["20"], adultMovie, "Hidden tracked movies must remain in DATA");
  assert.strictEqual(window.DATA.history.length, 3, "History filtering must not remove stored history entries");
}

{
  const adultShow = { tmdb_id: 10, adult: true };
  const adultMovie = { id: "20", adult: true };
  const history = [{ media_type:"movie", movie_id:"20", title:"Adult Movie" }];
  const { window } = loadPolicy(
    { adult_filter: false },
    {
      shows:{ "10": adultShow },
      movies:{ "20": adultMovie },
      getWatchlistShowsForCurrentView:()=>[adultShow],
      getFavoriteMovies:()=>[adultMovie],
      getActivityHistoryEntries:()=>history.slice(),
      isMovieHistoryEntry:()=>true
    }
  );

  assert.strictEqual(window.getWatchlistShowsForCurrentView().length, 1, "Turning Adult Filter off must restore tracked shows");
  assert.strictEqual(window.getFavoriteMovies().length, 1, "Turning Adult Filter off must restore tracked movies");
  assert.strictEqual(window.getActivityHistoryEntries().length, 1, "Turning Adult Filter off must restore hidden history");
}

{
  const { window } = loadPolicy(
    { adult_filter: true },
    {
      createShowObject:details=>({ tmdb_id:details.id, title:details.name }),
      getMovieRecordFromDetails:details=>({ id:String(details.id), title:details.title }),
      normalizeMovieTrackingRecord:record=>({ id:String(record.id), title:record.title }),
      normalizeFavoriteMovieRecord:record=>({ id:String(record.id), title:record.title })
    }
  );

  assert.strictEqual(window.createShowObject({id:1,name:"Show",adult:true}).adult,true);
  assert.strictEqual(window.getMovieRecordFromDetails({id:2,title:"Movie",adult:true}).adult,true);
  assert.strictEqual(window.normalizeMovieTrackingRecord({id:3,title:"Movie",adult:false}).adult,false);
  assert.strictEqual(window.normalizeFavoriteMovieRecord({id:4,title:"Movie",adult:true}).adult,true);
}

{
  const { policy } = loadPolicy({ adult_filter: true });
  assert.strictEqual(policy.visibleTrackedItem({adult:false,rating:"NC-17"},"movie"),true,"Ratings must not be treated as adult classification");
  assert.strictEqual(policy.visibleTrackedItem({adult:false,certification:"18"},"tv"),true,"Maturity metadata must not be treated as adult classification");
}

console.log("Phase 6 adult policy contracts passed.");
