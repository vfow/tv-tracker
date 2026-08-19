const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const integritySource = fs.readFileSync('static/js/tracker-integrity.js','utf8');
const dataIntegritySource = fs.readFileSync('static/js/data-integrity.js','utf8');
const appSource = fs.readFileSync('static/js/app.js','utf8');
const templateSource = fs.readFileSync('templates/index.html','utf8');

const integrityNeedle = "filename='js/tracker-integrity.js'";
const dbNeedle = "filename='js/db.js'";
const appNeedle = "filename='js/app.js'";
const dbIndex = templateSource.indexOf(dbNeedle);
const firstIntegrity = templateSource.indexOf(integrityNeedle);
const appIndex = templateSource.indexOf(appNeedle);
const secondIntegrity = templateSource.indexOf(integrityNeedle,firstIntegrity + integrityNeedle.length);
assert.ok(
  dbIndex >= 0 && dbIndex < firstIntegrity && firstIntegrity < appIndex,
  'tracker-integrity.js must load after db.js and before app.js'
);
assert.strictEqual(secondIntegrity,-1,'tracker-integrity.js must load exactly once');

function extractAppCleanupSource(){
  const start = appSource.indexOf('function getEpisodeIdentityKey');
  const end = appSource.indexOf('function removeExistingHistoryEntriesForEpisode');
  assert.ok(start >= 0 && end > start,'duplicate cleanup helpers must exist in app.js');
  return appSource.slice(start,end);
}

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function makeContext(storedData,readinessTimeoutMs=null){
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
  if(readinessTimeoutMs !== null){
    context.TVTrackerDuplicateShowIntegrity = {readinessTimeoutMs};
  }
  context.globalThis = context;
  return vm.createContext(context);
}

function normalizeAll(context,data,summary=null){
  Object.values(data.shows).forEach(show=>context.normalizeShowEpisodeProgress(show,summary));
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

async function loadThroughStartup(storedData){
  const context = makeContext(storedData);

  // The integrity script loads once before app.js. A storage read may begin
  // before app.js finishes defining cleanupDuplicateShows, but its result must
  // not be released until the cleanup wrapper is installed.
  vm.runInContext(integritySource,context);
  const pendingData = context.getStoredData();
  let released = false;
  pendingData.then(
    ()=>{ released = true; },
    ()=>{ released = true; }
  );

  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(released,false,'stored data must wait for app and data-integrity installation');

  vm.runInContext(extractAppCleanupSource(),context);
  await Promise.resolve();
  assert.strictEqual(released,false,'app cleanup alone must not release stored data before canonical identities');

  vm.runInContext(dataIntegritySource,context,{filename:'data-integrity.js'});
  const loaded = await resolveWithin(pendingData);
  assert.strictEqual(
    context.cleanupDuplicateShows.__tvTrackerDuplicateShowIntegrityWrapped,
    true,
    'duplicate normalization must be installed before getStoredData returns'
  );
  assert.strictEqual(context.TVTrackerDuplicateShowIntegrity.ready,true);
  const integrityState = context.TVTrackerDuplicateShowIntegrity;
  const wrappedGetStoredData = context.getStoredData;
  vm.runInContext(integritySource,context,{filename:'tracker-integrity-reevaluation.js'});
  assert.strictEqual(context.TVTrackerDuplicateShowIntegrity,integrityState);
  assert.strictEqual(context.TVTrackerDuplicateShowIntegrity.ready,true,'re-evaluation must preserve resolved readiness');
  assert.strictEqual(context.TVTrackerDuplicateShowIntegrity.readinessFailed,false);
  assert.strictEqual(context.getStoredData,wrappedGetStoredData,'re-evaluation must not wrap storage twice');
  return {context,loaded};
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
    const context = makeContext({shows:{},history:[]},20);
    vm.runInContext(integritySource,context);

    await assert.rejects(
      resolveWithin(context.getStoredData(),250),
      /data integrity startup timed out/,
      'missing startup dependencies must reject within a bounded interval'
    );
    assert.strictEqual(context.TVTrackerDuplicateShowIntegrity.readinessFailed,true);
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
