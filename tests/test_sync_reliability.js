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

function createContext(){
  const context = {
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    __assert: assert,
  };
  context.globalThis = context;
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

async function runDbReliabilityChecks(){
  const context = createContext();
  const testScript = `
    const assert = globalThis.__assert;

    function emptyTrackerData(){
      return {
        shows: {},
        history: [],
        profile: {username: 'Owner', favorite_shows: []}
      };
    }

    function showRecord(id,title){
      return {
        title,
        tmdb_id: String(id),
        status: 'watching',
        episodes_watched: {}
      };
    }

    function deltaForShow(id,title){
      return {
        showsUpsert: {[String(id)]: showRecord(id,title)},
        showsDelete: [],
        historyUpsert: {},
        historyDelete: [],
        historyOrder: null,
        stateUpsert: {}
      };
    }

    function jsonResponse(status,payload){
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async()=>payload
      };
    }

    async function queuedSaveUsesCapturedBaseRevision(){
      LAST_SAVED_DATA = emptyTrackerData();
      DATA = cloneTrackerData(LAST_SAVED_DATA);
      DATA.shows['123'] = showRecord('123','Example');
      SERVER_REVISION = 12;

      const operation = createPendingSaveOperation({},'operation-test-1234');
      assert.strictEqual(operation.baseRevision,12);

      SERVER_REVISION = 20;
      const requests = [];
      globalThis.fetch = async (url,options)=>{
        assert.strictEqual(url,'/api/state');
        const body = JSON.parse(options.body);
        requests.push(body);
        return jsonResponse(200,{
          ok: true,
          revision: 21,
          reset: false,
          duplicate: false,
          changes: [],
          appliedDelta: body
        });
      };

      await persistQueuedSaveOperation(cloneTrackerData(operation));

      assert.strictEqual(requests.length,1);
      assert.strictEqual(requests[0].baseRevision,12);
      assert.strictEqual(requests[0].operationId,'operation-test-1234-g0-1');
    }

    async function queuedSaveRebasesBaseRevisionAfterConflict(){
      LAST_SAVED_DATA = emptyTrackerData();
      DATA = cloneTrackerData(LAST_SAVED_DATA);
      DATA.shows['123'] = showRecord('123','Local edit');
      SERVER_REVISION = 3;

      const operation = createPendingSaveOperation({},'operation-rebase-1234');
      const remoteData = emptyTrackerData();
      remoteData.shows['456'] = showRecord('456','Remote edit');
      LAST_SAVED_DATA = cloneTrackerData(remoteData);
      DATA = cloneTrackerData(remoteData);
      DATA.shows['123'] = showRecord('123','Local edit');
      SERVER_REVISION = 20;

      const requests = [];
      globalThis.fetch = async (_url,options)=>{
        const body = JSON.parse(options.body);
        requests.push(body);

        if(requests.length === 1){
          return jsonResponse(409,{
            ok: false,
            error: 'The same tracker data changed on another device',
            revision: 20,
            reset: false,
            conflict: true,
            changes: [{
              revision: 20,
              operationId: 'remote-change-1234',
              delta: deltaForShow('456','Remote edit')
            }]
          });
        }

        return jsonResponse(200,{
          ok: true,
          revision: 21,
          reset: false,
          duplicate: false,
          changes: [],
          appliedDelta: body
        });
      };

      await persistQueuedSaveOperation(operation);

      assert.strictEqual(requests.length,2);
      assert.strictEqual(requests[0].baseRevision,3);
      assert.strictEqual(requests[1].baseRevision,20);
      assert.strictEqual(operation.baseRevision,20);
      assert.strictEqual(operation.generation,1);
      assert.deepStrictEqual(Object.keys(requests[1].showsUpsert),['123']);
    }

    globalThis.__testPromise = (async()=>{
      await queuedSaveUsesCapturedBaseRevision();
      await queuedSaveRebasesBaseRevisionAfterConflict();
    })();
  `;

  const script = new vm.Script(`${pendingSaveStore}\n${db}\n${testScript}`, {
    filename: 'sync-reliability.vm.js',
  });
  script.runInContext(context);
  await context.__testPromise;
}

runDbReliabilityChecks().then(()=>{
  console.log('Sync reliability checks passed');
}).catch(error=>{
  console.error(error);
  process.exit(1);
});
