"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("static/js/data-integrity.js","utf8");
const template = fs.readFileSync("templates/index.html","utf8");
const backend = fs.readFileSync("app.py","utf8");

function comparable(value){
  return String(value || "")
    .toLowerCase()
    .replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function createContext(options={}){
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
    getBackupSummary(){
      return {historyEntries:(DATA.history || []).length};
    },
    getNativeBackupObject(){
      return {
        app:"TV Tracker",
        backupType:"native-app-backup",
        backupVersion:2,
        schemaVersion:4,
        summary:null,
        data:DATA
      };
    },
    async commitTrackerDataTransactionally(data,template){
      return template;
    },
    validateNativeBackupObject(backup){
      const schema = Number(backup && backup.schemaVersion || 1);
      if(schema > 4){
        return {valid:false,message:"unsupported"};
      }
      return {valid:true,summary:{schemaVersion:schema}};
    },
    normalizeComparableTitle:comparable,
    async tmdbSearchShows(){
      return options.searchResults || [];
    },
    async tmdbGetShowDetails(id){
      return {id:Number(id),name:"resolved"};
    },
    async findTMDBTVDetailsByTitle(){
      return {id:-1};
    },
    moveShowStorageKey(oldId,newId,show){
      if(DATA.shows[String(newId)] && DATA.shows[String(newId)] !== show){
        show.tmdb_id = oldId;
        show.local_only = true;
        return;
      }
      delete DATA.shows[String(oldId)];
      DATA.shows[String(newId)] = show;
    },
    importCompatibleEpisodesIntoShow(show){
      show.episodes_watched = {"1":[1,2]};
      show._imported_progress = {
        watched:{
          "1-1":{special:true,name:"Special"},
          "1-2":{special:false,name:"Regular"}
        },
        specials:{"1-1":{watched:true}}
      };
      return {historyEntries:2,specialsPreserved:1,regularWatched:1};
    },
    reapplyImportedWatchedProgress(){},
    getHistoryIdsForSeason(){ return []; }
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source,context,{filename:"data-integrity.js"});
  return context;
}

(async()=>{
  {
    const backendSchema = Number((backend.match(/^SCHEMA_VERSION\s*=\s*(\d+)/m) || [])[1]);
    const context = createContext();
    assert.strictEqual(context.TVTrackerDataIntegrity.frontendSchemaVersion,backendSchema,"browser and backend backup schema versions must match");
  }

  {
    const appIndex = template.indexOf("filename='js/app.js'");
    const integrityIndex = template.indexOf("filename='js/data-integrity.js'");
    const firstDuplicate = template.indexOf("filename='js/duplicate-show-integrity.js'");
    const secondDuplicate = template.indexOf("filename='js/duplicate-show-integrity.js'",firstDuplicate + 1);
    assert.ok(appIndex >= 0 && integrityIndex > appIndex,"data-integrity.js must load after app.js so it can take ownership of legacy functions");
    assert.ok(secondDuplicate > integrityIndex,"data-integrity.js must load before startup data is released by the second duplicate integrity hook");
  }

  {
    const context = createContext();
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
    const context = createContext({DATA:{
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
    const context = createContext();
    const backup = context.getNativeBackupObject();
    assert.strictEqual(backup.schemaVersion,5,"browser backup export must use the current schema");
    assert.strictEqual(context.validateNativeBackupObject(backup).valid,true,"browser restore must accept a current schema backup");
    const transactional = await context.commitTrackerDataTransactionally({shows:{},history:[]});
    assert.strictEqual(transactional.schemaVersion,5,"transactional reset/import fallback must use the current schema");
  }

  {
    const context = createContext({searchResults:[
      {id:1,name:"Monster",first_air_date:"2004-04-07"},
      {id:2,name:"Monster",first_air_date:"2022-09-21"}
    ]});
    const api = context.TVTrackerDataIntegrity;
    assert.strictEqual(api.selectStrictTMDBCandidate(context.searchResults || [],"Monster"),null);
    const selected = api.selectStrictTMDBCandidate([
      {id:1,name:"Monster",first_air_date:"2004-04-07"},
      {id:2,name:"Monster",first_air_date:"2022-09-21"}
    ],"Monster (2022)");
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
    const context = createContext({DATA});
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
    const context = createContext();
    const show = {};
    const compatible = {
      seasons:[{
        number:1,
        episodes:[
          {number:1,name:"Source special",special:true,is_watched:true,id:{tvdb:901}},
          {number:2,name:"Regular",is_watched:true,id:{tvdb:902}}
        ]
      }]
    };
    context.importCompatibleEpisodesIntoShow(show,compatible,{history:[]});
    assert.deepStrictEqual(Array.from(show.episodes_watched["1"] || []),[2],"imported specials must not mark regular progress coordinates watched");
    assert.deepStrictEqual(Object.keys(show._imported_progress.watched),["1-2"]);
    assert.strictEqual(Object.keys(show._imported_progress.specials).length,1);
  }

  {
    const context = createContext();
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
    const context = createContext();
    const data = {
      shows:{"30981":{tmdb_id:"30981",number_of_seasons:1}},
      history:[
        {id:"good",tmdb_id:"30981",season:1,episode:1},
        {id:"suspect",tmdb_id:"30981",season:3,episode:8}
      ]
    };
    const before = JSON.stringify(data);
    const findings = context.TVTrackerDataIntegrity.suspiciousHistoryReferences(data);
    assert.deepStrictEqual(findings.map(item=>item.id),["suspect"]);
    assert.strictEqual(JSON.stringify(data),before,"integrity audit helpers must never silently repair or delete user history");
  }

  console.log("Phase 3 data integrity contracts passed.");
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
