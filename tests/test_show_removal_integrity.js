const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('static/js/show-removal-integrity.js','utf8');

async function runCase(favorite){
  const saves = [];
  const refreshes = [];
  const context = {
    console,
    String,
    Array,
    DATA:{
      shows:{
        '123':{title:'Example Show',tmdb_id:'123'},
        '999':{title:'Other Show',tmdb_id:'999'}
      },
      history:[
        {id:'history-123',tmdb_id:'123'},
        {id:'history-999',tmdb_id:'999'}
      ],
      profile:{favorite_shows:favorite ? ['123','999'] : ['999']}
    },
    async showAppConfirm(){ return true; },
    closeShowDetailsPage(){},
    refreshInterfaceForDataChanges(change){ refreshes.push(change); },
    showToast(){},
    async waitForNextPaint(){},
    async saveData(options){ saves.push(options); return true; }
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  await context.removeShow('123');
  return {context,saves,refreshes};
}

(async()=>{
  const favoriteCase = await runCase(true);
  assert.strictEqual(favoriteCase.context.DATA.shows['123'],undefined);
  assert.deepStrictEqual(
    Array.from(favoriteCase.context.DATA.history).map(entry=>entry.id),
    ['history-999']
  );
  assert.deepStrictEqual(
    Array.from(favoriteCase.context.DATA.profile.favorite_shows),
    ['999'],
    'removed favorite show must be removed from profile immediately'
  );
  assert.strictEqual(favoriteCase.saves.length,1);
  assert.deepStrictEqual(Array.from(favoriteCase.saves[0].showDeleteIds),['123']);
  assert.deepStrictEqual(Array.from(favoriteCase.saves[0].historyDeleteIds),['history-123']);
  assert.deepStrictEqual(
    Array.from(favoriteCase.saves[0].stateKeys),
    ['profile'],
    'profile removal must be persisted in the same save operation'
  );
  assert.strictEqual(favoriteCase.refreshes[0].stateChanged,true);

  const normalCase = await runCase(false);
  assert.strictEqual(normalCase.saves.length,1);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(normalCase.saves[0],'stateKeys'),
    false,
    'non-favorite show removal should not write profile unnecessarily'
  );
  assert.strictEqual(normalCase.refreshes[0].stateChanged,false);

  console.log('Show removal integrity checks passed');
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
