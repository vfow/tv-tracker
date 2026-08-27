const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'notifications-runtime.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'app.js'), 'utf8');

function extractUpcomingRepairSource(){
  const start = appSource.indexOf('const UPCOMING_REPAIR_COOLDOWN_MS');
  assert.ok(start >= 0,'app.js must own the Upcoming repair pass constants');
  const fnStart = appSource.indexOf('async function refreshUpcomingDataInBackground',start);
  assert.ok(fnStart > start,'app.js must own refreshUpcomingDataInBackground');
  const braceStart = appSource.indexOf('{',fnStart);
  assert.ok(braceStart > fnStart);
  let depth = 0;
  let quote = null;
  for(let i = braceStart; i < appSource.length; i += 1){
    const char = appSource[i];
    if(quote){
      if(char === '\\'){ i += 1; continue; }
      if(char === quote){ quote = null; }
      continue;
    }
    if(char === '"' || char === "'" || char === '`'){ quote = char; continue; }
    if(char === '{'){ depth += 1; continue; }
    if(char === '}'){ depth -= 1; if(depth === 0){ return appSource.slice(start,i + 1); } }
  }
  throw new Error('could not extract the Upcoming repair owner block from app.js');
}

function occurrences(value,needle){
    return value.split(needle).length - 1;
}

function createSandbox(){
    const navigator = {};
    const document = {
        readyState: 'complete',
        querySelector(){ return null; },
        querySelectorAll(){ return []; },
        getElementById(){ return null; },
        createElement(){ return {}; },
        addEventListener(){}
    };

    const routed = [];
    const window = {
        document,
        navigator,
        location:{pathname:'/app/list/watching',hash:'',assign(){}},
        history:{
            pushState(){},
            replaceState(){}
        },
        addEventListener(){},
        setTimeout(){ return 1; },
        clearTimeout(){},
        TVTrackerRouter:{
            setPathRoute(route,replace){ routed.push({route,replace}); },
            applyRoute(){}
        },
        TVTrackerNotifications:{}
    };
    window.window = window;
    window.history = window.history;

    const sandbox = {
        window,
        document,
        navigator,
        history:window.history,
        fetch:async()=>{ throw new Error('unexpected fetch'); },
        console,
        Date,
        Object,
        Array,
        Map,
        WeakSet,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        Math,
        setTimeout:window.setTimeout,
        clearTimeout:window.clearTimeout
    };
    vm.createContext(sandbox);
    vm.runInContext(source,sandbox,{filename:'notifications-runtime.js'});
    return {window,routed};
}

function createUpcomingRepairSandbox(){
    const calls = {prepared:0};
    const warnings = [];
    const sandbox = {
        console:{
            log:console.log,
            error:console.error,
            warn(...args){ warnings.push(args); }
        },
        DATA:{shows:{}},
        activePage:'shows',
        activeShowsTab:'upcoming',
        isRefreshingUpcoming:false,
        prepareUpcomingData:async()=>{ calls.prepared += 1; },
        getUpcomingScheduleItems:()=>[],
        refreshShowForSchedule:async()=>{},
        saveData:async()=>{},
        renderUpcoming:async()=>{},
        Map,
        Date,
        Object,
        Array,
        String,
        Number,
        Promise,
        Math
    };
    vm.createContext(sandbox);
    vm.runInContext(extractUpcomingRepairSource(),sandbox,{filename:'app-upcoming-repair-owner.js'});
    return {sandbox,calls,warnings};
}

(async()=>{
    {
        const {window,routed} = createSandbox();
        window.TVTrackerNotificationsRuntime.openDedicatedSettingsPage({fromRoute:false});
        assert.strictEqual(routed.length,1,'settings gear should route once');
        assert.strictEqual(routed[0].route,'/app/settings/notifications','settings gear should use canonical Account Settings route');
        assert.strictEqual(routed[0].replace,false);
        assert.strictEqual(window.TVTrackerNotificationsRuntime.repairMissingWatchingSchedules,undefined,'Notifications must not expose tracker repair operations');
    }

    {
        const {window} = createSandbox();
        assert.strictEqual(
            window.TVTrackerNotificationsRuntime.pushErrorMessage(new Error('VAPID public/private keys do not match')),
            'Push notifications are temporarily unavailable.'
        );
        assert.strictEqual(
            window.TVTrackerNotificationsRuntime.pushErrorMessage({code:'PUSH_PERMISSION',message:'permission denied'}),
            'Push permission wasn’t granted.'
        );
        assert.strictEqual(
            window.TVTrackerNotificationsRuntime.pushErrorMessage(new Error('unexpected browser failure')),
            'TV Tracker couldn’t enable Push on this device. Try again later.'
        );
    }

{
        const repairBlock = extractUpcomingRepairSource();
        assert.ok(repairBlock.includes('function repairMissingWatchingSchedules'),'app.js must own the Upcoming repair pass');
        assert.ok(repairBlock.includes('const UPCOMING_REPAIR_MAX_PER_PASS = 8'),'the repair pass must keep the eight-show per-pass bound');
        assert.ok(repairBlock.includes('const UPCOMING_REPAIR_COOLDOWN_MS = 30 * 60 * 1000'),'the repair pass must keep the thirty-minute cooldown');
        assert.ok(repairBlock.includes('upcomingRepairAttempts'),'the repair pass must keep per-show cooldown bookkeeping');
        assert.ok(repairBlock.includes('isRefreshingUpcoming'),'the repair pass must stay guarded by the Upcoming refresh lock');
        assert.ok(repairBlock.includes('repairMissingWatchingSchedules()'),'refreshUpcomingDataInBackground must run the repair pass');
        assert.ok(repairBlock.includes('refreshShowForSchedule(show,true)'),'the repair pass must force targeted schedule refreshes');
        assert.ok(!repairBlock.includes('setTimeout'),'the folded repair pass must not rely on a wrapper-owned timer');
        assert.ok(!appSource.includes('TVTrackerUpcomingScheduleRepair'),'the repair implementation must stay private to the app owner');
        assert.strictEqual(occurrences(appSource,'async function refreshUpcomingDataInBackground'),1,'there must be one Upcoming refresh owner');
        assert.strictEqual(occurrences(appSource,'function repairMissingWatchingSchedules'),1,'there must be one repair pass owner');
    }

    {
        const {sandbox,calls} = createUpcomingRepairSandbox();
        let forcedRefreshes = 0;
        let saved = 0;
        let rerendered = 0;
        const lucky = {
            id:123,
            tmdb_id:123,
            status:'watching',
            tmdb_status:'Returning Series',
            number_of_episodes:7,
            episodes_watched:{'1':[1,2,3,4,5,6]}
        };
        sandbox.DATA.shows = {'123':lucky};
        sandbox.getUpcomingScheduleItems = show=>show._repaired ? [{episode_number:7,air_date:'2026-08-19'}] : [];
        sandbox.refreshShowForSchedule = async(show,force)=>{
            assert.strictEqual(force,true,'missing Watching schedule must force a targeted refresh');
            forcedRefreshes += 1;
            show._repaired = true;
        };
        sandbox.saveData = async()=>{ saved += 1; };
        sandbox.renderUpcoming = async(startBackgroundRefresh)=>{
            assert.strictEqual(startBackgroundRefresh,false,'targeted repair rerender must not start another background loop');
            rerendered += 1;
        };

        await sandbox.refreshUpcomingDataInBackground();
        assert.strictEqual(calls.prepared,1,'the Upcoming refresh owner must run the main refresh first');
        assert.strictEqual(forcedRefreshes,1,'a show with no schedule items must receive a targeted refresh');
        assert.strictEqual(saved,1,'a successful repair pass must save the refreshed tracker state');
        assert.strictEqual(rerendered,2,'the refresh owner and the repair pass each render the Upcoming tab');
        assert.strictEqual(lucky._repaired,true);

        await sandbox.refreshUpcomingDataInBackground();
        assert.strictEqual(calls.prepared,2);
        assert.strictEqual(forcedRefreshes,1,'a show with a repaired schedule must not refresh again');
        assert.strictEqual(saved,1,'no repair save is needed once the schedule exists');
        assert.strictEqual(rerendered,3,'only the refresh owner rerenders when nothing needs repair');
    }

    {
        const {sandbox,calls} = createUpcomingRepairSandbox();
        let forcedRefreshes = 0;
        const completed = {
            id:999,
            tmdb_id:999,
            status:'watching',
            tmdb_status:'Ended',
            number_of_episodes:6,
            episodes_watched:{'1':[1,2,3,4,5,6]},
            last_air_date:'2020-01-01'
        };
        sandbox.DATA.shows = {'999':completed};
        sandbox.getUpcomingScheduleItems = ()=>[];
        sandbox.refreshShowForSchedule = async()=>{ forcedRefreshes += 1; };

        await sandbox.refreshUpcomingDataInBackground();
        assert.strictEqual(calls.prepared,1);
        assert.strictEqual(forcedRefreshes,0,'ended shows must never be force-refreshed for a missing schedule');
    }

    {
        const {sandbox} = createUpcomingRepairSandbox();
        const forcedIds = [];
        let saved = 0;
        let rerendered = 0;
        for(let id=1;id<=10;id+=1){
            sandbox.DATA.shows[String(id)] = {
                id,
                tmdb_id:id,
                status:'watching',
                tmdb_status:'Returning Series',
                number_of_episodes:1,
                episodes_watched:{}
            };
        }
        sandbox.getUpcomingScheduleItems = ()=>[];
        sandbox.refreshShowForSchedule = async(show,force)=>{
            assert.strictEqual(force,true);
            forcedIds.push(show.tmdb_id);
        };
        sandbox.saveData = async()=>{ saved += 1; };
        sandbox.renderUpcoming = async(startBackgroundRefresh)=>{
            assert.strictEqual(startBackgroundRefresh,false);
            rerendered += 1;
        };

        await sandbox.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedIds.length,8,'one repair pass must refresh at most eight shows');
        assert.strictEqual(saved,1);
        assert.strictEqual(rerendered,2);

        await sandbox.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedIds.length,10,'a later pass may process candidates left beyond the bound');
        assert.strictEqual(saved,2);
        assert.strictEqual(rerendered,4);

        await sandbox.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedIds.length,10,'cooldown must suppress immediate repeat refreshes');
        assert.strictEqual(saved,2,'cooldown-only passes must not save tracker state');
        assert.strictEqual(rerendered,5,'cooldown-only passes must not rerender through the repair pass');
    }

    {
        const {sandbox,warnings} = createUpcomingRepairSandbox();
        sandbox.DATA.shows = {
            '321':{
                id:321,
                tmdb_id:321,
                status:'watching',
                tmdb_status:'Returning Series',
                number_of_episodes:1,
                episodes_watched:{}
            }
        };
        sandbox.saveData = async()=>{ throw new Error('targeted save failed'); };
        await sandbox.refreshUpcomingDataInBackground();
        assert.ok(
            warnings.some(args=>args[0] === 'TV Tracker could not save targeted Upcoming refresh'),
            'repair save failures must be reported without breaking the refresh'
        );
    }

    {
        const {sandbox} = createUpcomingRepairSandbox();
        sandbox.DATA.shows = {
            '456':{
                id:456,
                tmdb_id:456,
                status:'watching',
                tmdb_status:'Returning Series',
                number_of_episodes:1,
                episodes_watched:{}
            }
        };
        const renderFailure = new Error('targeted render failed');
        let renders = 0;
        sandbox.renderUpcoming = async()=>{
            renders += 1;
            if(renders > 1) throw renderFailure;
        };
        await assert.rejects(
            sandbox.refreshUpcomingDataInBackground(),
            error=>error === renderFailure,
            'a failed repair-pass rerender must propagate through the refresh owner'
        );
    }

    const settingsOwnerSource = source.slice(source.indexOf('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'));
    assert(source.includes('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'),'Notifications settings must use the canonical Account Settings route');
    assert(source.includes('function ensureMainSettingsSection()'),'polish compatibility API must target the first-class Settings section');
    assert(source.includes('document.getElementById("settings-v2-notification-list")'),'notification controls must render into the first-class Settings owner');
    assert(!source.includes('insertAdjacentElement'),'notification runtime must not dynamically inject a retired Settings section');
    assert(!source.includes('MutationObserver'),'notification runtime must not own Settings through a mutation observer');
    assert(!source.includes('function observeSettings()'),'the retired Settings observer must stay deleted');
    assert(!source.includes('function installNotificationSettingsNavigation()'),'the retired navigation interceptor must stay deleted');
    assert(!source.includes('function mountSettingsNotifications()'),'the retired Settings renderer must stay deleted');
    assert.strictEqual(occurrences(source,'const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'),1,'there must be one canonical Settings route owner');
    assert.strictEqual(occurrences(source,'const BASE_SETTING_OPTIONS = ['),1,'there must be one notification setting definition owner');
    assert.strictEqual(occurrences(source,'async function renderNotificationControls'),1,'there must be one canonical notification control renderer');
    assert(!source.includes('async function renderNotificationSettingsPage'),'the legacy settings-page renderer must stay deleted');
    assert(!source.includes('const SETTINGS_OPTIONS = ['),'the legacy 6-family option list must stay deleted');
    assert(!source.includes('notification-settings-content'),'the legacy settings page container must stay deleted');
    assert(!source.includes('notification-settings-page'),'the legacy settings page id must stay deleted');
    assert(!source.includes('pushDiagnosticMessage'),'technical Push diagnostics must not have a browser-facing formatter');
    assert(!source.includes('The VAPID public and private keys do not match.'),'keypair diagnostics must stay out of normal-user UI copy');
    assert(source.includes('Push notifications are temporarily unavailable.'),'generic unavailable Push copy must exist');
    assert(source.includes('TV Tracker couldn’t enable Push on this device. Try again later.'),'generic enable failure copy must exist');
    assert(settingsOwnerSource.indexOf('list.appendChild(pushRow);') < settingsOwnerSource.indexOf('list.appendChild(masterRow);'),'Push Notifications must be the first notification control');
    assert(settingsOwnerSource.includes('list.appendChild(pushRow);'),'the Push control must come from the canonical renderer');
    assert(settingsOwnerSource.includes('BASE_SETTING_OPTIONS.forEach(([key,label,description])'),'TV and movie families must come from the canonical renderer');
    assert(settingsOwnerSource.includes('["movieReleased","Movie Released"'),'movie rows must come from the canonical renderer');
    assert(settingsOwnerSource.includes('["movieReleaseUpdates","Movie Release Updates"'),'movie release-update rows must come from the canonical renderer');
    assert(source.includes('if(input && key === "enabled") input.disabled = false;'),'master Notifications toggle must be re-enabled after save');
    for(const trackerDependency of ['DATA','saveData','refreshShowForSchedule','getUpcomingScheduleItems','refreshUpcomingDataInBackground']){
        assert(!source.includes(trackerDependency),`Notifications must not reference tracker dependency ${trackerDependency}`);
        assert(extractUpcomingRepairSource().includes(trackerDependency),`Upcoming owner must contain tracker dependency ${trackerDependency}`);
    }

    console.log('Notification settings and Upcoming polish regression tests passed.');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
