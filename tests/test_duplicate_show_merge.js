const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { extractFunctions, extractFunction } = require('./helpers/extract.js');

const appSource = fs.readFileSync('static/js/app.js','utf8');
const dbSource = fs.readFileSync('static/js/db.js','utf8');
const templateSource = fs.readFileSync('templates/index.html','utf8');

for(const n of ['tracker-integrity.js','data-integrity.js','tracker-removal.js','upcoming-schedule-repair.js'])assert(!templateSource.includes(n),`${n} must no longer load as a separate script`);

const OWNERSHIP_REGION = (()=>{
  const start = appSource.indexOf("function cleanProviderHTML(");
  assert.ok(start >= 0,"ownership helpers must exist in app.js");
  const endFn = extractFunction(appSource, "removeExistingHistoryEntriesForEpisode");
  const end = appSource.indexOf(endFn) + endFn.length;
  assert.ok(end > start,"the ownership region must be well-ordered in app.js");
  return appSource.slice(start,end);
})();
const CLEANUP_SOURCE = extractFunction(appSource, 'cleanupDuplicateShows');
const DB_GATE = (()=>{
  const start = dbSource.indexOf("const DEFAULT_OWNERSHIP_READY_TIMEOUT_MS = 5000;");
  assert.ok(start >= 0,"db.js ownership gate constants must exist");
  const gateFn = extractFunction(dbSource, "waitForOwnershipLayerReadiness");
  const end = dbSource.indexOf(gateFn) + gateFn.length;
  assert.ok(end > start,"the db.js ownership gate region must be well-ordered");
  return dbSource.slice(start,end);
})();

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function makeContext(storedData){
  const context = {
    console,
    Map,
    Object,
    Array,
    Number,
    String,
    Date,
    Set,
    Promise,
    JSON,
    RegExp,
    setTimeout,
    clearTimeout,
    getStoredData:async()=>clone(storedData)
  };
  context.globalThis = context;
  return vm.createContext(context);
}

function normalizeAll(context,data,summary=null){
  Object.values(data.shows).forEach(show=>context.normalizeShowEpisodeProgress(show,summary));
}

async function loadThroughStartup(storedData){
  const context = makeContext(storedData);
  vm.runInContext(OWNERSHIP_REGION,context);
  vm.runInContext(CLEANUP_SOURCE,context);
  const loaded = await context.getStoredData();
  assert.strictEqual(typeof context.cleanupDuplicateShows,'function','cleanupDuplicateShows must be owned by app.js');
  return {context,loaded};
}

function makeGateContext(readinessTimeoutMs){
  const context = {
    console,
    Map,
    Object,
    Array,
    Number,
    String,
    Date,
    Set,
    Promise,
    JSON,
    RegExp,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(DB_GATE,context);
  context.TVTrackerOwnershipReadiness = {readinessTimeoutMs};
  return context;
}

function resolveWithin(promise,timeoutMs=1000){
  return new Promise((resolve,reject)=>{
    const timeout = setTimeout(
      ()=>reject(new Error('single-load stored data startup timed out')),
      timeoutMs
    );
    promise.then(
      value=>{
        clearTimeout(timeout);
        resolve(value);
      },
      error=>{
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

(async()=>{
  {
    const data = {
      shows:{'10':{tmdb_id:'10',episodes_watched:{'1':[1]}}},
      history:[
        {id:'regular-1',tmdb_id:'10',season:1,episode:1,watched_at:'2026-01-01T00:00:00Z'},
        {
          id:'special-1',
          tmdb_id:'10',
          season:1,
          episode:1,
          special:true,
          source_tvdb_episode_id:'900',
          watched_at:'2026-01-02T00:00:00Z'
        }
      ]
    };
    const {context,loaded} = await loadThroughStartup(data);

    context.normalizeTrackerDataForEpisodeIntegrity(loaded);

    assert.deepStrictEqual(
      Array.from(loaded.history,entry=>entry.id).sort(),
      ['regular-1','special-1'],
      'regular and special history sharing coordinates must both survive startup normalization'
    );
    assert.notStrictEqual(
      context.getHistoryEntryEpisodeKey(loaded.history[0]),
      context.getHistoryEntryEpisodeKey(loaded.history[1])
    );
  }

  {
    const context = makeGateContext(20);
    await assert.rejects(
      resolveWithin(context.waitForOwnershipLayerReadiness(),250),
      /data integrity startup timed out/,
      'a storage read without the app ownership layer must reject within a bounded interval'
    );
    context.getEpisodeIdentityKey = ()=>"k";
    context.getHistoryEntryEpisodeKey = ()=>"h";
    context.cleanupDuplicateShows = ()=>null;
    await resolveWithin(context.waitForOwnershipLayerReadiness(),250);
  }

  {
    const data = {
      shows:{
        legacyA:{
          tmdb_id:'123',
          title:'Older metadata',
          status:'paused',
          updated_at:'2026-01-01T00:00:00Z',
          episodes_watched:{'1':[1,2],'2':[1]}
        },
        legacyB:{
          tmdb_id:'123',
          title:'Preferred metadata',
          status:'watching',
          updated_at:'2026-02-01T00:00:00Z',
          episodes_watched:{'1':[2,3],'3':[4]}
        }
      },
      history:[]
    };
    const {context,loaded} = await loadThroughStartup(data);
    const summary = {
      duplicateShowsRemoved:0,
      duplicateWatchedRecordsRemoved:0,
      duplicateProgressEntriesRemoved:0,
      invalidHistoryEntriesSkipped:0
    };

    context.cleanupDuplicateShows(loaded,summary);
    normalizeAll(context,loaded,summary);

    assert.deepStrictEqual(Object.keys(loaded.shows),['123']);
    const merged = loaded.shows['123'];
    assert.strictEqual(merged.title,'Preferred metadata');
    assert.strictEqual(merged.status,'watching');
    assert.deepStrictEqual(Array.from(merged.episodes_watched['1']),[1,2,3]);
    assert.deepStrictEqual(Array.from(merged.episodes_watched['2']),[1]);
    assert.deepStrictEqual(Array.from(merged.episodes_watched['3']),[4]);
    assert.strictEqual(summary.duplicateShowsRemoved,1);
    assert.strictEqual(summary.duplicateProgressEntriesRemoved,1);
  }

  {
    // Regression for the merge blocker: the later record has more watched
    // progress but older metadata. The app's original chooser selects it on
    // progress. Pre-merging both records would equalize their counts and let
    // the newer timestamp incorrectly win instead.
    const data = {
      shows:{
        newerLessProgress:{
          tmdb_id:'456',
          title:'Newer but less progress',
          status:'watching',
          updated_at:'2026-03-01T00:00:00Z',
          episodes_watched:{'1':[4]}
        },
        olderMoreProgress:{
          tmdb_id:'456',
          title:'Older with more progress',
          status:'paused',
          updated_at:'2026-01-01T00:00:00Z',
          episodes_watched:{'1':[1,2,3]}
        }
      },
      history:[]
    };
    const {context,loaded} = await loadThroughStartup(data);

    context.cleanupDuplicateShows(loaded,null);
    normalizeAll(context,loaded,null);

    const merged = loaded.shows['456'];
    assert.strictEqual(
      merged.title,
      'Older with more progress',
      'progress union must not change which original duplicate record wins'
    );
    assert.strictEqual(merged.status,'paused');
    assert.deepStrictEqual(Array.from(merged.episodes_watched['1']),[1,2,3,4]);
  }

  {
    // Also protect the iterative chooser from progress accumulated from an
    // earlier duplicate affecting a later comparison.
    const data = {
      shows:{
        first:{
          tmdb_id:'789',
          title:'First',
          status:'paused',
          updated_at:'2026-03-01T00:00:00Z',
          episodes_watched:{'1':[1]}
        },
        second:{
          tmdb_id:'789',
          title:'Second',
          status:'watching',
          updated_at:'2026-02-01T00:00:00Z',
          episodes_watched:{'1':[2]}
        },
        third:{
          tmdb_id:'789',
          title:'Third',
          status:'dropped',
          updated_at:'2026-01-01T00:00:00Z',
          episodes_watched:{'1':[3,4]}
        }
      },
      history:[]
    };
    const {context,loaded} = await loadThroughStartup(data);

    context.cleanupDuplicateShows(loaded,null);
    normalizeAll(context,loaded,null);

    const merged = loaded.shows['789'];
    assert.strictEqual(merged.title,'Third');
    assert.strictEqual(merged.status,'dropped');
    assert.deepStrictEqual(Array.from(merged.episodes_watched['1']),[1,2,3,4]);
  }

  console.log('Duplicate show progress merge checks passed');
})().catch(error=>{
  console.error(error);
  process.exit(1);
});