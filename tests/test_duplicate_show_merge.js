const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const integritySource = fs.readFileSync('static/js/duplicate-show-integrity.js','utf8');
const appSource = fs.readFileSync('static/js/app.js','utf8');
const templateSource = fs.readFileSync('templates/index.html','utf8');

const integrityNeedle = "filename='js/duplicate-show-integrity.js'";
const appNeedle = "filename='js/app.js'";
const firstIntegrity = templateSource.indexOf(integrityNeedle);
const appIndex = templateSource.indexOf(appNeedle);
const secondIntegrity = templateSource.indexOf(integrityNeedle,firstIntegrity + integrityNeedle.length);
assert.ok(firstIntegrity >= 0 && firstIntegrity < appIndex,'duplicate integrity preload must run before app.js');
assert.ok(secondIntegrity > appIndex,'duplicate cleanup hook must run again after app.js');

function extractAppCleanupSource(){
  const start = appSource.indexOf('function normalizeWatchedEpisodeArray');
  const end = appSource.indexOf('function normalizeTrackerDataForEpisodeIntegrity');
  assert.ok(start >= 0 && end > start,'duplicate cleanup helpers must exist in app.js');
  return appSource.slice(start,end);
}

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

  // First load happens before app.js. getStoredData must wait until the
  // post-app load has wrapped cleanupDuplicateShows, rather than mutating
  // duplicate progress before the app chooses its preferred record.
  vm.runInContext(integritySource,context);
  const pendingData = context.getStoredData();

  vm.runInContext(extractAppCleanupSource(),context);
  vm.runInContext(integritySource,context);

  const loaded = await pendingData;
  return {context,loaded};
}

(async()=>{
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
