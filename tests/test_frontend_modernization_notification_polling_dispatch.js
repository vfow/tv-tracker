const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('static/js/notifications-runtime.js','utf8');
const firstOwnerStart = source.indexOf('(function(global){');
const firstOwnerEnd = source.indexOf('\n(function(global){',firstOwnerStart + 1);
assert(firstOwnerEnd > 0,'notification polling owner must remain in the first runtime closure');
const pollingOwnerSource = source.slice(firstOwnerStart,firstOwnerEnd);

function element(tagName='div'){
  const children = [];
  return {
    tagName:String(tagName).toUpperCase(),
    children,
    dataset:{},
    style:{},
    hidden:false,
    isConnected:true,
    className:'',
    classList:{add(){},remove(){},toggle(){}},
    appendChild(child){ children.push(child); child.parentNode = this; return child; },
    prepend(child){ children.unshift(child); child.parentNode = this; return child; },
    addEventListener(){},
    setAttribute(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    remove(){ this.isConnected = false; }
  };
}

async function settle(){
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));
}

async function waitFor(check){
  for(let attempt=0;attempt<10;attempt+=1){
    if(check()) return;
    await settle();
  }
}

async function runScenario(active,ownerMode='valid',renderResults=[true],pollCount=1){
  const page = element('section');
  page.classList = {
    contains(name){ return active && name === 'active-page'; },
    add(){},
    remove(){},
    toggle(){}
  };
  const body = element('body');
  let toastStack = null;
  let items = [{id:1,createdAt:'2026-09-03T00:00:00Z',message:'Existing',read:true}];
  let legacyRenderCalls = 0;
  let legacyDOMWrites = 0;
  let bridgeRenderCalls = 0;
  const timers = [];
  const warnings = [];
  const notificationsContent = element('div');
  Object.defineProperty(notificationsContent,'innerHTML',{
    set(){ legacyDOMWrites += 1; throw new Error('legacy Notifications DOM renderer invoked'); }
  });
  const document = {
    readyState:'complete',
    hidden:false,
    body,
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    getElementById(id){
      if(id === 'notifications-page') return page;
      if(id === 'notifications-content') return notificationsContent;
      if(id === 'notification-live-toast-stack') return toastStack;
      return null;
    },
    createElement(tagName){ return element(tagName); },
    addEventListener(){}
  };
  const window = {
    document,
    location:{href:'',pathname:'/app/list/watching'},
    addEventListener(){},
    setTimeout(callback,delay){ timers.push({callback,delay}); return timers.length; },
    clearTimeout(){},
    PointerEvent:function PointerEvent(){}
  };
  const originalAppendChild = body.appendChild;
  body.appendChild = function appendChild(child){
    if(child.id === 'notification-live-toast-stack') toastStack = child;
    return originalAppendChild.call(this,child);
  };
  window.window = window;

  const context = {
    window,
    document,
    fetch:async path=>({
      ok:true,
      async json(){
        if(path === '/api/notifications/status'){
          return {unread:true,latestId:2,latestCreatedAt:'2026-09-03T00:01:00Z'};
        }
        if(path === '/api/notifications') return {notifications:items};
        throw new Error('unexpected notification request: ' + path);
      }
    }),
    console:{
      log:console.log,
      error:console.error,
      warn(...args){ warnings.push(args); }
    },
    Intl:{DateTimeFormat(){ return {resolvedOptions(){ return {timeZone:''}; }}; }},
    Date,Object,Array,Map,Set,String,Number,Boolean,RegExp,Promise,Math,URL,encodeURIComponent
  };
  vm.createContext(context);
  vm.runInContext(pollingOwnerSource,context,{filename:'notifications-polling-owner.js'});
  await waitFor(()=>timers.some(timer=>timer.delay === 30 * 1000));

  window.TVTrackerNotifications = Object.assign({},window.TVTrackerNotifications,{
    async renderNotificationsPage(){ legacyRenderCalls += 1; }
  });
  if(ownerMode !== 'unavailable'){
    window.TVTrackerUpcomingNotificationsVueBridge = {
      ownership:ownerMode === 'valid' ? 'vue-dom' : 'legacy-dom',
      async renderNotificationsPage(){
        const result = renderResults[Math.min(bridgeRenderCalls,renderResults.length - 1)];
        bridgeRenderCalls += 1;
        if(result instanceof Error) throw result;
        return result;
      }
    };
  }
  items = [
    {id:2,createdAt:'2026-09-03T00:01:00Z',message:'Fresh',read:false,route:'/app/show/2'},
    ...items
  ];
  for(let pollIndex=0;pollIndex<pollCount;pollIndex+=1){
    const pollTimers = timers.filter(timer=>timer.delay === 30 * 1000);
    const pollTimer = pollTimers[pollIndex];
    assert(pollTimer,'live polling must schedule check ' + (pollIndex + 1) + '; observed delays: ' + timers.map(timer=>timer.delay).join(','));
    await pollTimer.callback();
    await settle();
  }

  return {
    legacyRenderCalls,
    legacyDOMWrites,
    bridgeRenderCalls,
    toastStack,
    warnings,
    pollingTimerCount:timers.filter(timer=>timer.delay === 30 * 1000).length
  };
}

(async()=>{
  const active = await runScenario(true);
  assert.strictEqual(active.bridgeRenderCalls,1,'an active Notifications page must refresh through the explicit Vue bridge');
  assert.strictEqual(active.legacyRenderCalls,0,'active polling must never invoke the legacy Notifications renderer');
  assert.strictEqual(active.legacyDOMWrites,0,'active polling must never invoke the lexical legacy DOM renderer');
  assert.strictEqual(active.toastStack,null,'an active Notifications page must not show a live toast');

  const inactive = await runScenario(false);
  assert.strictEqual(inactive.bridgeRenderCalls,0,'an inactive Notifications page must not invoke the Vue renderer');
  assert.strictEqual(inactive.legacyRenderCalls,0,'an inactive Notifications page must not invoke the legacy renderer');
  assert.strictEqual(inactive.legacyDOMWrites,0,'an inactive Notifications page must not invoke the lexical legacy DOM renderer');
  assert(inactive.toastStack,'an inactive page must create the live toast stack');
  assert.strictEqual(inactive.toastStack.children.length,1,'an inactive page must show the fresh unread notification');
  assert.strictEqual(inactive.toastStack.children[0].className,'notification-live-toast');

  for(const ownerMode of ['unavailable','wrong']){
    const failedOwner = await runScenario(true,ownerMode);
    assert.strictEqual(failedOwner.bridgeRenderCalls,0,ownerMode + ' Vue owner must not render');
    assert.strictEqual(failedOwner.legacyRenderCalls,0,ownerMode + ' Vue owner must not fall back to the legacy renderer');
    assert.strictEqual(failedOwner.legacyDOMWrites,0,ownerMode + ' Vue owner must not invoke the lexical legacy DOM renderer');
    assert.strictEqual(failedOwner.toastStack,null,ownerMode + ' active owner failure must not create a toast');
    assert(failedOwner.warnings.some(args=>String(args[1] && args[1].message || '').includes('Vue renderer unavailable during live polling')),
      ownerMode + ' Vue owner must report a clear polling failure');
    assert(failedOwner.pollingTimerCount >= 2,ownerMode + ' Vue owner failure must reschedule polling');
  }

  const retried = await runScenario(true,'valid',[false,true],2);
  assert.strictEqual(retried.bridgeRenderCalls,2,'a false render result must retry the same fresh version on the next poll');
  assert.strictEqual(retried.legacyRenderCalls,0,'a false render result must not use the public legacy renderer');
  assert.strictEqual(retried.legacyDOMWrites,0,'a false render result must not use the lexical legacy DOM renderer');
  assert(retried.warnings.some(args=>String(args[1] && args[1].message || '').includes('did not render during live polling')),
    'a false render result must report the incomplete active-page refresh');
  assert(retried.pollingTimerCount >= 3,'a false render result and successful retry must both reschedule polling');

  const thrownThenRetried = await runScenario(true,'valid',[new Error('Vue owner render failed'),true],2);
  assert.strictEqual(thrownThenRetried.bridgeRenderCalls,2,'a thrown render must retry the same fresh version on the next poll');
  assert.strictEqual(thrownThenRetried.legacyRenderCalls,0,'a thrown render must not use the public legacy renderer');
  assert.strictEqual(thrownThenRetried.legacyDOMWrites,0,'a thrown render must not use the lexical legacy DOM renderer');
  assert(thrownThenRetried.warnings.some(args=>String(args[1] && args[1].message || '') === 'Vue owner render failed'),
    'a thrown render must propagate into the polling failure handler');
  assert(thrownThenRetried.pollingTimerCount >= 3,'a thrown render and successful retry must both reschedule polling');

  console.log('Notification polling active/inactive dispatch behavior passed.');
})().catch(error=>{ console.error(error); process.exit(1); });
