"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { extractFunction, extractFunctions } = require("./helpers/extract.js");

const appSource = fs.readFileSync("static/js/app.js","utf8");
const dbSource = fs.readFileSync("static/js/db.js","utf8");
const template = fs.readFileSync("templates/index.html","utf8");
const backend = fs.readFileSync("app.py","utf8");

const OWNERSHIP_REGION = (()=>{
  const start = appSource.indexOf("function cleanProviderHTML(");
  assert.ok(start >= 0,"ownership helpers must exist in app.js");
  const endFn = extractFunction(appSource, "removeExistingHistoryEntriesForEpisode");
  const end = appSource.indexOf(endFn) + endFn.length;
  assert.ok(end > start,"the ownership region must be well-ordered in app.js");
  return appSource.slice(start,end);
})();

const SCATTERED_OWNERS = extractFunctions(appSource, [
  "getHistoryIdsForSeason",
  "moveShowStorageKey",
  "markSeasonWatched",
  "unwatchFullyWatchedSeason",
  "markSeasonWatchedLegacyFlow",
  "getBackupSummary",
  "commitTrackerDataTransactionally",
  "getNativeBackupObject",
  "validateNativeBackupObject",
  "findTMDBTVDetailsByTitle",
  "reapplyImportedWatchedProgress"
]);

const ENSURE_HISTORY_IDS = extractFunction(dbSource, "ensureHistoryIds");

const EXPORT_TAIL = (()=>{
  const start = appSource.indexOf("const FRONTEND_SCHEMA_VERSION = 5;");
  assert.ok(start >= 0,"app.js must own the frontend backup schema version");
  const end = appSource.lastIndexOf("});");
  assert.ok(end > start,"app.js must export the canonical TVTrackerDataIntegrity API");
  return appSource.slice(start,end + 3);
})();

function comparable(value){
  return String(value || "")
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function createContext(options={}){
  const seasonUnwatchCalls = [];
  const DATA = options.DATA || {
    shows:{},
    history:[],
    profile:{favorite_shows:[],favorite_movies:[]},
    metadata_sync:{pending:[],failed:[]},
    network_sync:{pending:[],failed:[]}
  };

  const context = {
    console,
    JSON,
    Date,
    Map,
    Set,
    Promise,
    Object,
    Array,
    Number,
    String,
    RegExp,
    DATA,
    ensureProfileData(){
      DATA.profile = DATA.profile || {favorite_shows:[],favorite_movies:[]};
      DATA.profile.favorite_shows = DATA.profile.favorite_shows || [];
      DATA.profile.favorite_movies = DATA.profile.favorite_movies || [];
    },
    async ensureSeasonLoaded(){},
    getAiredEpisodeNumbersInSeason(){ return []; },
    isSeasonFullyWatched(){ return false; },
    async showAppConfirm(dialog){
      seasonUnwatchCalls.push({kind:"confirm",dialog});
      return true;
    },
    updateShowLastWatchedFromHistory(){},
    reopenCompletedShowAfterUnwatch(){},
    refreshAfterLocalShowChange(){},
    showToast(){},
    async waitForNextPaint(){},
    async saveShowMutation(showId,addedEntries,deletedHistoryIds){
      seasonUnwatchCalls.push({kind:"save",showId,addedEntries,deletedHistoryIds});
    },
    normalizeComparableTitle:comparable,
    async tmdbSearchShows(){
      return options.searchResults || [];
    },
    async tmdbGetShowDetails(id){
      return {id:Number(id),name:"resolved"};
    },
    fetch:options.fetch || (async()=>({ok:true})),
    csrfToken(){
      return "test-token";
    },
    async parseAPIResponse(){
      return {data:null,revision:1};
    },
    adoptTransactionalTrackerData(){}
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(OWNERSHIP_REGION,context,{filename:"ownership-region.js"});
  vm.runInContext(SCATTERED_OWNERS,context,{filename:"scattered-owners.js"});
  vm.runInContext(ENSURE_HISTORY_IDS,context,{filename:"ensure-history-ids.js"});
  vm.runInContext(EXPORT_TAIL,context,{filename:"export-tail.js"});
  return {context,seasonUnwatchCalls};
}

(async()=>{
  {
    const backendSchema = Number((backend.match(/^SCHEMA_VERSION\s*=\s*(\d+)/m) || [])[1]);
    const {context} = createContext();
    const api = context.TVTrackerDataIntegrity;
    assert.ok(api,"app.js must own the canonical TVTrackerDataIntegrity export");
    assert.strictEqual(api.frontendSchemaVersion,backendSchema,"browser and backend backup schema versions must match");
    assert.strictEqual(api.installed,true);
    assert.strictEqual(api.regularEpisodeIdentity,context.getEpisodeIdentityKey,"the canonical regular identity must be the exported owner");
    assert.strictEqual(api.historyEpisodeIdentity,context.getHistoryEntryEpisodeKey,"the canonical history identity must be the exported owner");
  }

  {
    for(const n of ["tracker-integrity.js","data-integrity.js","tracker-removal.js","upcoming-schedule-repair.js","discover-runtime.js","search-navigation.js"]){
      assert.ok(!template.includes(n),`${n} must no longer load as a separate script`);
    }
    assert.ok(appSource.includes("function getEpisodeIdentityKey"),"app.js must own the regular episode identity");
    assert.ok(appSource.includes("function getHistoryEntryEpisodeKey"),"app.js must own the history entry identity");
    assert.ok(appSource.includes("function suspiciousHistoryReferences"),"app.js must own the suspicious history audit");
    assert.ok(appSource.includes("window.TVTrackerDataIntegrity"),"app.js must export the canonical integrity API");
  }

  {
    const {context} = createContext();
    const api = context.TVTrackerDataIntegrity;
    const regular = api.historyEpisodeIdentity({tmdb_id:"10",season:1,episode:1});
    const special = api.historyEpisodeIdentity({tmdb_id:"10",season:1,episode:1,special:true,source_tvdb_episode_id:"900"});
    assert.notStrictEqual(regular,special,"regular episodes and specials sharing coordinates must never dedupe each other");
    assert.strictEqual(
      special,
      api.historyEpisodeIdentity({tmdb_id:"10",season:9,episode:99,special:true,source_tvdb_episode_id:"900"}),
      "a source episode id is the stable identity for an imported special"
    );
    assert.strictEqual(api.historyEpisodeIdentity({media_type:"movie",movie_id:"20",tmdb_id:"20"}),"","movie history must stay outside TV episode dedupe identity");
  }

  {
    const {context} = createContext({DATA:{
      shows:{"10":{}},
      history:[
        {tmdb_id:"10",season:1,episode:1},
        {tmdb_id:"10",season:0,episode:1,special:true},
        {media_type:"movie",movie_id:"20",tmdb_id:"20"},
        {id:"legacy-other"}
      ],
      profile:{favorite_shows:["10"],favorite_movies:[{id:"20"}]}
    }});
    const summary = context.getBackupSummary();
    assert.strictEqual(summary.historyEntries,4);
    assert.strictEqual(summary.regularHistoryEntries,1);
    assert.strictEqual(summary.specialHistoryEntries,1);
    assert.strictEqual(summary.movieHistoryEntries,1,"movies must not inflate regular TV history counts");
    assert.strictEqual(summary.otherHistoryEntries,1);
  }

  {
    const {context} = createContext();
    const backup = context.getNativeBackupObject();
    assert.strictEqual(backup.schemaVersion,5,"browser backup export must use the current schema");
    assert.strictEqual(context.validateNativeBackupObject(backup).valid,true,"browser restore must accept a current schema backup");

    let capturedBody = null;
    context.fetch = async (url,options)=>{
      capturedBody = JSON.parse(options.body);
      return {ok:true};
    };
    const transactional = await context.commitTrackerDataTransactionally({shows:{},history:[]});
    assert.ok(capturedBody,"the transactional import must be sent to the backend");
    assert.strictEqual(capturedBody.schemaVersion,5,"transactional reset/import must use the current schema");
    assert.strictEqual(transactional.revision,1,"the backend revision must be adopted from the import response");
  }

  {
    const sameTitleCandidates = [
      {id:1,name:"Monster",first_air_date:"2004-04-07"},
      {id:2,name:"Monster",first_air_date:"2022-09-21"}
    ];
    const {context} = createContext({searchResults:sameTitleCandidates});
    const api = context.TVTrackerDataIntegrity;
    assert.strictEqual(
      api.selectStrictTMDBCandidate(sameTitleCandidates,"Monster"),
      null,
      "same-title imports without a disambiguating year must remain unresolved instead of guessing"
    );
    const selected = api.selectStrictTMDBCandidate(sameTitleCandidates,"Monster (2022)");
    assert.strictEqual(selected.id,2,"year-qualified imports must not collapse onto another same-title series");
    assert.strictEqual(
      api.selectStrictTMDBCandidate([{id:1,name:"Monsters",first_air_date:"2022-01-01"}],"Monster (2022)"),
      null,
      "title fallback must not take the first fuzzy result"
    );
    const details = await context.findTMDBTVDetailsByTitle("Monster (2022)");
    assert.strictEqual(details.id,2);
  }

  {
    const show = {tmdb_id:"local-tvdb-1",local_only:true};
    const DATA = {
      shows:{"local-tvdb-1":show},
      history:[{id:"h1",tmdb_id:"local-tvdb-1",season:1,episode:1}],
      profile:{favorite_shows:["local-tvdb-1"],favorite_movies:[]},
      metadata_sync:{pending:["local-tvdb-1"],failed:[{showId:"local-tvdb-1"}]},
      network_sync:{pending:["local-tvdb-1"],failed:["local-tvdb-1"]}
    };
    const {context} = createContext({DATA});
    show.tmdb_id = "555";
    show.local_only = false;
    context.moveShowStorageKey("local-tvdb-1","555",show);
    assert.strictEqual(DATA.history[0].tmdb_id,"555","show-id remaps must migrate history references");
    assert.deepStrictEqual(Array.from(DATA.profile.favorite_shows),["555"]);
    assert.deepStrictEqual(Array.from(DATA.metadata_sync.pending),["555"]);
    assert.strictEqual(DATA.metadata_sync.failed[0].showId,"555");
    assert.deepStrictEqual(Array.from(DATA.network_sync.pending),["555"]);
  }

  {
    const {context} = createContext();
    const compatible = {
      seasons:[{
        number:1,
        episodes:[
          {number:1,name:"Source special",special:true,is_watched:true,id:{tvdb:901}},
          {number:2,name:"Regular",is_watched:true,id:{tvdb:902}}
        ]
      }]
    };
    assert.ok(
      appSource.includes("removeSpecialOnlyProgress(show,scanCompatibleWatchedEpisodes(compatibleShow))"),
      "importCompatibleEpisodesIntoShow must apply the folded special-only progress cleanup"
    );
    const show = {
      episodes_watched:{"1":[1,2]},
      _imported_progress:{watched:{},specials:{}}
    };
    context.removeSpecialOnlyProgress(show,context.scanCompatibleWatchedEpisodes(compatible));
    assert.deepStrictEqual(Array.from(show.episodes_watched["1"] || []),[2],"imported specials must not mark regular progress coordinates watched");
    assert.deepStrictEqual(Object.keys(show._imported_progress.watched),["1-2"]);
    assert.strictEqual(Object.keys(show._imported_progress.specials).length,1);
  }

  {
    const {context} = createContext();
    const show = {
      episodes_watched:{},
      _imported_progress:{
        watched:{
          "1-1":{special:true},
          "1-2":{special:false}
        }
      }
    };
    context.reapplyImportedWatchedProgress(show);
    assert.deepStrictEqual(Array.from(show.episodes_watched["1"] || []),[2],"metadata hydration must never reapply special progress as a regular episode");
  }

  {
    const {context} = createContext();
    const data = {
      shows:{"30981":{tmdb_id:"30981",number_of_seasons:1}},
      history:[
        {id:"good",tmdb_id:"30981",season:1,episode:1},
        {id:"suspect",tmdb_id:"30981",season:3,episode:8}
      ]
    };
    const before = JSON.stringify(data);
    const findings = context.TVTrackerDataIntegrity.suspiciousHistoryReferences(data);
    assert.deepStrictEqual(Array.from(findings,item=>item.id),["suspect"]);
    assert.strictEqual(JSON.stringify(data),before,"integrity audit helpers must never silently repair or delete user history");
  }

  {
    const {context} = createContext({DATA:{
      shows:{},
      history:[
        {id:"h-regular-1",tmdb_id:"10",season:1,episode:1},
        {id:"h-regular-2",tmdb_id:"10",season:1,episode:2},
        {id:"h-special",tmdb_id:"10",season:1,episode:1,special:true,source_tvdb_episode_id:"900"},
        {id:"h-special-season",tmdb_id:"10",season:0,episode:5,special:true},
        {id:"h-movie",media_type:"movie",movie_id:"20",tmdb_id:"20"},
        {id:"h-other-season",tmdb_id:"10",season:2,episode:1},
        {id:"h-other-show",tmdb_id:"11",season:1,episode:1}
      ],
      profile:{favorite_shows:[],favorite_movies:[]}
    }});
    const ids = context.getHistoryIdsForSeason("10",1);
    assert.deepStrictEqual(
      Array.from(ids),
      ["h-regular-1","h-regular-2"],
      "season history ids must exclude specials and movies"
    );
    assert.deepStrictEqual(
      Array.from(context.getHistoryIdsForSeason("10",2)),
      ["h-other-season"]
    );
  }

  {
    const {context,seasonUnwatchCalls} = createContext({DATA:{
      shows:{
        "10":{
          tmdb_id:"10",
          title:"Season Watcher",
          episodes_watched:{"1":[1,2,3]}
        }
      },
      history:[
        {id:"regular-1",tmdb_id:"10",season:1,episode:1},
        {id:"regular-2",tmdb_id:"10",season:1,episode:2},
        {id:"special-1",tmdb_id:"10",season:1,episode:1,special:true,source_tvdb_episode_id:"900"},
        {id:"movie-1",media_type:"movie",movie_id:"20",tmdb_id:"20"}
      ],
      profile:{favorite_shows:[],favorite_movies:[]}
    }});
    context.getAiredEpisodeNumbersInSeason = ()=>[1,2,3];
    context.isSeasonFullyWatched = ()=>true;
    await context.markSeasonWatched("10",1);

    assert.strictEqual(
      context.DATA.shows["10"].episodes_watched["1"],
      undefined,
      "a fully watched season must be cleared from regular progress"
    );
    assert.deepStrictEqual(
      Array.from(context.DATA.history,entry=>entry.id),
      ["special-1","movie-1"],
      "imported specials and movies must survive a season unwatch"
    );
    const confirmCall = seasonUnwatchCalls.find(call=>call.kind === "confirm");
    assert.ok(confirmCall,"the season unwatch must ask for confirmation first");
    assert.ok(
      String(confirmCall.dialog.message || "").includes("Imported specials are preserved."),
      "the unwatch confirmation must state that imported specials are preserved"
    );
    const saveCall = seasonUnwatchCalls.find(call=>call.kind === "save");
    assert.ok(saveCall,"the season unwatch must persist through the canonical save mutation");
    assert.deepStrictEqual(Array.from(saveCall.addedEntries),[]);
    assert.deepStrictEqual(
      Array.from(saveCall.deletedHistoryIds),
      ["regular-1","regular-2"],
      "only regular season history ids may be deleted"
    );
  }

  console.log("Phase 3 data integrity contracts passed.");
})().catch(error=>{
  console.error(error);
  process.exit(1);
});