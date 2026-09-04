const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const pendingSaveStore = fs.readFileSync(
  path.join(root, 'static/js/pending-save-store.js'),
  'utf8'
);
const db = fs.readFileSync(path.join(root, 'static/js/db.js'), 'utf8');
const saveStorageFallback = fs.readFileSync(
  path.join(root, 'static/js/save-storage-fallback.js'),
  'utf8'
);

function createContext(){
  const context = {
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    __assert: assert,
  };
  context.globalThis = context;
  Object.defineProperty(context, 'localStorage', {
    configurable: true,
    get(){ throw new Error('localStorage blocked'); },
  });
  Object.defineProperty(context, 'sessionStorage', {
    configurable: true,
    get(){ throw new Error('sessionStorage blocked'); },
  });
  context.document = {
    visibilityState: 'visible',
    addEventListener(){},
    getElementById(){ return null; },
    querySelector(selector){
      return selector === 'meta[name="csrf-token"]'
        ? {content: 'csrf-test-token'}
        : null;
    },
  };
  context.window = {
    addEventListener(){},
    location: {href: '', assign(){}},
  };
  return vm.createContext(context);
}

async function run(){
  const context = createContext();
  const testScript = `
    const assert = globalThis.__assert;

    function emptyTrackerData(){
      return {
        shows:{},
        history:[],
        profile:{username:'Owner',favorite_shows:[]}
      };
    }

    function showRecord(id,title){
      return {
        title,
        tmdb_id:String(id),
        status:'watching',
        episodes_watched:{}
      };
    }

    function deltaForShow(id,title){
      return {
        showsUpsert:{[String(id)]:showRecord(id,title)},
        showsDelete:[],
        historyUpsert:{},
        historyDelete:[],
        historyOrder:null,
        stateUpsert:{}
      };
    }

    function jsonResponse(status,payload){
      return {
        status,
        ok:status >= 200 && status < 300,
        json:async()=>payload
      };
    }

    async function largeTrackedShowPastOldCeilingStillSaves(){
      initializePendingSaveStore();
      assert.strictEqual(PENDING_SAVE_STORE,null);

      LAST_SAVED_DATA = emptyTrackerData();
      DATA = cloneTrackerData(LAST_SAVED_DATA);
      DATA.shows['37854'] = {
        title:'Very large long-running show',
        tmdb_id:'37854',
        status:'watching',
        episodes_watched:{'23':[1175]},
        season_details:{
          '23':{overview:'x'.repeat(20 * 1024 * 1024)}
        }
      };
      SERVER_REVISION = 8;

      const requests = [];
      globalThis.fetch = async (url,options)=>{
        assert.strictEqual(url,'/api/state');
        const body = JSON.parse(options.body);
        requests.push(body);
        return jsonResponse(200,{
          ok:true,
          revision:9,
          reset:false,
          duplicate:false,
          changes:[],
          appliedDelta:body
        });
      };

      const saved = await saveData({showIds:['37854']});

      assert.strictEqual(saved,true);
      assert.strictEqual(requests.length,1);
      assert.ok(jsonByteLength(requests[0]) > (16 * 1024 * 1024));
      assert.ok(jsonByteLength(requests[0]) < (36 * 1024 * 1024));
      assert.strictEqual(PENDING_SAVE_OPERATIONS.length,0);
      assert.strictEqual(SERVER_REVISION,9);
    }

    async function failedQueueHeadDoesNotBlockLaterShow(){
      PENDING_SAVE_OPERATIONS = [
        {
          id:'operation-blocked-1111',
          createdAt:Date.now(),
          dirtyOptions:null,
          baseRevision:9,
          generation:0,
          delta:deltaForShow('111','Blocked show'),
          silent:false
        },
        {
          id:'operation-later-2222',
          createdAt:Date.now(),
          dirtyOptions:null,
          baseRevision:9,
          generation:0,
          delta:deltaForShow('222','Later show'),
          silent:false
        }
      ];
      LAST_SAVED_DATA = emptyTrackerData();
      DATA = emptyTrackerData();
      DATA.shows['111'] = showRecord('111','Blocked show');
      DATA.shows['222'] = showRecord('222','Later show');
      SERVER_REVISION = 9;
      PENDING_SAVE_FAILURES = 0;

      const requests = [];
      globalThis.fetch = async (_url,options)=>{
        const body = JSON.parse(options.body);
        requests.push(body.operationId);

        if(String(body.operationId).startsWith('operation-blocked-1111')){
          return jsonResponse(400,{
            ok:false,
            error:'Invalid tracker record',
            code:'invalid_sync_record'
          });
        }

        return jsonResponse(200,{
          ok:true,
          revision:10,
          reset:false,
          duplicate:false,
          changes:[],
          appliedDelta:body
        });
      };

      const drained = await processPendingSaveQueue();

      assert.strictEqual(drained,false);
      assert.strictEqual(requests.length,2);
      assert.ok(requests[0].startsWith('operation-blocked-1111'));
      assert.ok(requests[1].startsWith('operation-later-2222'));
      assert.strictEqual(PENDING_SAVE_OPERATIONS.length,1);
      assert.strictEqual(PENDING_SAVE_OPERATIONS[0].id,'operation-blocked-1111');
      assert.strictEqual(SERVER_REVISION,10);

      clearTimeout(PENDING_SAVE_RETRY_TIMER);
      PENDING_SAVE_RETRY_TIMER = null;
    }

    globalThis.__testPromise = (async()=>{
      await largeTrackedShowPastOldCeilingStillSaves();
      await failedQueueHeadDoesNotBlockLaterShow();
    })();
  `;

  const script = new vm.Script(
    `${pendingSaveStore}\n${db}\n${saveStorageFallback}\n${testScript}`,
    {filename:'global-save-queue-recovery.vm.js'}
  );
  script.runInContext(context);
  await context.__testPromise;
}

run().then(()=>{
  console.log('Global save queue recovery checks passed');
}).catch(error=>{
  console.error(error);
  process.exit(1);
});
