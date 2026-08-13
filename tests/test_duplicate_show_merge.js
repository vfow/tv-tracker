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

function makeDuplicateData(){
  return {
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
}

(async()=>{
  const startupData = makeDuplicateData();
  const preloadContext = {
    console,
    Map,
    Object,
    Array,
    Number,
    String,
    getStoredData:async()=>clone(startupData)
  };
  preloadContext.globalThis = preloadContext;
  vm.createContext(preloadContext);
  vm.runInContext(integritySource,preloadContext);

  const loaded = await preloadContext.getStoredData();
  assert.deepStrictEqual(
    Array.from(loaded.shows.legacyA.episodes_watched['1']),
    [1,2,2,3],
    'startup preload must preserve progress from both duplicate records'
  );
  assert.deepStrictEqual(Array.from(loaded.shows.legacyA.episodes_watched['3']),[4]);
  assert.deepStrictEqual(Array.from(loaded.shows.legacyB.episodes_watched['2']),[1]);

  const cleanupContext = {console,Map,Object,Array,Number,String,Date,Set};
  cleanupContext.globalThis = cleanupContext;
  vm.createContext(cleanupContext);
  vm.runInContext(extractAppCleanupSource(),cleanupContext);
  vm.runInContext(integritySource,cleanupContext);

  const data = makeDuplicateData();
  const summary = {
    duplicateShowsRemoved:0,
    duplicateWatchedRecordsRemoved:0,
    duplicateProgressEntriesRemoved:0,
    invalidHistoryEntriesSkipped:0
  };
  cleanupContext.cleanupDuplicateShows(data,summary);
  Object.values(data.shows).forEach(show=>cleanupContext.normalizeShowEpisodeProgress(show,summary));

  assert.deepStrictEqual(Object.keys(data.shows),['123']);
  const merged = data.shows['123'];
  assert.strictEqual(merged.title,'Preferred metadata','existing preferred-record metadata rule must remain unchanged');
  assert.strictEqual(merged.status,'watching');
  assert.deepStrictEqual(Array.from(merged.episodes_watched['1']),[1,2,3]);
  assert.deepStrictEqual(Array.from(merged.episodes_watched['2']),[1]);
  assert.deepStrictEqual(Array.from(merged.episodes_watched['3']),[4]);
  assert.strictEqual(summary.duplicateShowsRemoved,1);
  assert.strictEqual(summary.duplicateProgressEntriesRemoved,1);

  const newerLessProgress = {
    shows:{
      old:{
        tmdb_id:'456',
        title:'Older with more progress',
        status:'paused',
        updated_at:'2026-01-01T00:00:00Z',
        episodes_watched:{'1':[1,2,3]}
      },
      newer:{
        tmdb_id:'456',
        title:'Newer but less progress',
        status:'watching',
        updated_at:'2026-03-01T00:00:00Z',
        episodes_watched:{'1':[4]}
      }
    },
    history:[]
  };
  cleanupContext.cleanupDuplicateShows(newerLessProgress,null);
  cleanupContext.normalizeShowEpisodeProgress(newerLessProgress.shows['456'],null);
  assert.strictEqual(newerLessProgress.shows['456'].title,'Newer but less progress');
  assert.strictEqual(newerLessProgress.shows['456'].status,'watching');
  assert.deepStrictEqual(Array.from(newerLessProgress.shows['456'].episodes_watched['1']),[1,2,3,4]);

  console.log('Duplicate show progress merge checks passed');
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
