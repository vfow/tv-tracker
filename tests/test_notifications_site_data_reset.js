const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
const HISTORY_KEY = 'tv-tracker-notification-history-scope:v1';

assert(source.includes(HISTORY_KEY));
assert(source.includes('await ensureNotificationHistoryScope()'));
assert(source.includes('filterNotificationItems(Array.isArray(payload.notifications) ? payload.notifications : [],historyScope)'));

function makeStorage(){
  const values = new Map();
  return {
    get length(){ return values.size; },
    getItem(key){ return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key,value){ values.set(String(key),String(value)); },
    removeItem(key){ values.delete(String(key)); },
    clear(){ values.clear(); }
  };
}

function makeRoot(){
  return {
    dataset:{},
    querySelector(){ return null; },
    querySelectorAll(){ return []; }
  };
}

async function run(){
  const storage = makeStorage();
  const notificationsRoot = makeRoot();
  let statusPayload = {
    ok:true,
    latestId:20,
    latestCreatedAt:'2026-09-03T09:00:00+00:00',
    unread:true
  };
  let notificationPayload = {
    ok:true,
    notifications:[
      {id:21,message:'New after reset',createdAt:'2026-09-03T09:01:00+00:00',route:'/app/show/21',imagePath:''},
      {id:20,message:'Reset boundary',createdAt:'2026-09-03T09:00:00+00:00',route:'/app/show/20',imagePath:''},
      {id:19,message:'Older history',createdAt:'2026-09-03T08:00:00+00:00',route:'/app/show/19',imagePath:''}
    ]
  };
  let statusRequests = 0;
  let readAllRequests = 0;
  let listRequests = 0;

  async function fetch(path){
    const clean = String(path || '');
    if(clean === '/api/notifications/status'){
      statusRequests += 1;
      return {ok:true,json:async()=>statusPayload};
    }
    if(clean === '/api/notifications/read-all'){
      readAllRequests += 1;
      return {ok:true,json:async()=>({ok:true,updated:2})};
    }
    if(clean === '/api/notifications'){
      listRequests += 1;
      return {ok:true,json:async()=>notificationPayload};
    }
    throw new Error('Unexpected fetch: ' + clean);
  }

  const rendered = [];
  const document = {
    getElementById(id){ return id === 'notifications-content' ? notificationsRoot : null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; }
  };
  const window = {
    document,
    localStorage:storage,
    fetch,
    location:{pathname:'/app/list/watching',origin:'https://example.test'},
    TVTrackerNotifications:{_relativeTime(){ return 'now'; }},
    setTimeout,
    PointerEvent:undefined
  };
  const context = vm.createContext({window,document,console,setTimeout,clearTimeout,URL,Date,Object,Array,Map,Set,Promise,Number,String,Math,JSON,encodeURIComponent});
  vm.runInContext(source,context,{filename:'upcoming-notifications-vue-bridge.js'});

  const bridge = window.TVTrackerUpcomingNotificationsVueBridge;
  assert(bridge && bridge.ownership === 'vue-dom');
  bridge.attachVueOwner({
    render(model){ rendered.push(model); return true; },
    unmount(){}
  });

  assert.strictEqual(await bridge.renderNotificationsPage(),true);
  const first = rendered[rendered.length - 1];
  assert.strictEqual(first.state,'ready');
  assert.deepStrictEqual(Array.from(first.items,item=>item.id),['21']);
  assert.strictEqual(statusRequests,1,'a cleared browser must establish one server-backed notification history boundary');
  assert.strictEqual(readAllRequests,1);
  assert.strictEqual(listRequests,1);

  const stored = JSON.parse(storage.getItem(HISTORY_KEY));
  assert.strictEqual(stored.latestId,20);
  assert.strictEqual(stored.latestCreatedAt,'2026-09-03T09:00:00+00:00');

  notificationPayload = {
    ok:true,
    notifications:[
      {id:22,message:'Another new notification',createdAt:'2026-09-03T09:02:00+00:00',route:'/app/show/22',imagePath:''},
      ...notificationPayload.notifications
    ]
  };
  assert.strictEqual(await bridge.renderNotificationsPage(),true);
  const second = rendered[rendered.length - 1];
  assert.deepStrictEqual(Array.from(second.items,item=>item.id),['22','21']);
  assert.strictEqual(statusRequests,1,'persisted site data must reuse the existing history boundary');

  storage.clear();
  statusPayload = {
    ok:true,
    latestId:22,
    latestCreatedAt:'2026-09-03T09:02:00+00:00',
    unread:true
  };
  assert.strictEqual(await bridge.renderNotificationsPage(),true);
  const afterClear = rendered[rendered.length - 1];
  assert.strictEqual(afterClear.state,'empty');
  assert.strictEqual(afterClear.items.length,0,'clearing website data must prevent old server notification rows from reappearing');
  assert.strictEqual(statusRequests,2,'cleared storage must establish a fresh notification history boundary');

  notificationPayload = {
    ok:true,
    notifications:[
      {id:23,message:'Post-clear notification',createdAt:'2026-09-03T09:03:00+00:00',route:'/app/show/23',imagePath:''},
      {id:22,message:'Old after clear',createdAt:'2026-09-03T09:02:00+00:00',route:'/app/show/22',imagePath:''}
    ]
  };
  assert.strictEqual(await bridge.renderNotificationsPage(),true);
  const postClear = rendered[rendered.length - 1];
  assert.deepStrictEqual(Array.from(postClear.items,item=>item.id),['23']);

  console.log('Notification site-data reset regression tests passed.');
}

run().catch(error=>{
  console.error(error);
  process.exitCode = 1;
});
