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

    function jsonResponse(status,payload){
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async()=>payload
      };
    }

    globalThis.__testPromise = (async()=>{
      initializePendingSaveStore();
      assert.strictEqual(PENDING_SAVE_STORE,null);

      LAST_SAVED_DATA = {
        shows:{},
        history:[],
        profile:{username:'Owner',favorite_shows:[]}
      };
      DATA = cloneTrackerData(LAST_SAVED_DATA);
      DATA.shows['37854'] = {
        title:'Large long-running show',
        tmdb_id:'37854',
        status:'watching',
        episodes_watched:{'23':[1175]},
        season_details:{
          '23':{overview:'x'.repeat(3 * 1024 * 1024)}
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
      assert.ok(jsonByteLength(requests[0]) > (2 * 1024 * 1024));
      assert.ok(jsonByteLength(requests[0]) < (16 * 1024 * 1024));
      assert.strictEqual(requests[0].showsUpsert['37854'].status,'watching');
      assert.deepStrictEqual(
        Array.from(requests[0].showsUpsert['37854'].episodes_watched['23']),
        [1175]
      );
      assert.strictEqual(PENDING_SAVE_OPERATIONS.length,0);
      assert.strictEqual(SERVER_REVISION,9);
    })();
  `;

  const script = new vm.Script(
    `${pendingSaveStore}\n${db}\n${saveStorageFallback}\n${testScript}`,
    {filename: 'large-show-save-persistence.vm.js'}
  );
  script.runInContext(context);
  await context.__testPromise;
}

run().then(()=>{
  console.log('Large show save persistence checks passed');
}).catch(error=>{
  console.error(error);
  process.exit(1);
});
