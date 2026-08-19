const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'notifications-runtime.js'), 'utf8');
const upcomingRepairSource = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'upcoming-schedule-repair.js'), 'utf8');

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
    const scheduled = [];
    const calls = {background:0};
    const warnings = [];
    const window = {
        DATA:{shows:{}},
        activePage:'shows',
        activeShowsTab:'upcoming',
        refreshUpcomingDataInBackground:async()=>{
            calls.background += 1;
            return 'background-result';
        },
        getUpcomingScheduleItems:()=>[],
        refreshShowForSchedule:async()=>{},
        saveData:async()=>{},
        renderUpcoming:async()=>{},
        setTimeout(callback,delay){
            scheduled.push({callback,delay});
            return scheduled.length;
        }
    };
    window.window = window;
    const runtimeConsole = {
        log:console.log,
        error:console.error,
        warn(...args){ warnings.push(args); }
    };
    const sandbox = {window,console:runtimeConsole};
    vm.createContext(sandbox);
    vm.runInContext(upcomingRepairSource,sandbox,{filename:'upcoming-schedule-repair.js'});
    return {window,scheduled,calls,sandbox,warnings};
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
        const {window,scheduled,calls,sandbox} = createUpcomingRepairSandbox();
        const installedWrapper = window.refreshUpcomingDataInBackground;
        assert.strictEqual(installedWrapper._tvtrackerTargetedRepair,true,'owner must retain the shipped duplicate-wrapper marker');
        vm.runInContext(upcomingRepairSource,sandbox,{filename:'upcoming-schedule-repair.js'});
        assert.strictEqual(window.refreshUpcomingDataInBackground,installedWrapper,'owner must not wrap Upcoming refresh twice');
        assert.strictEqual(scheduled.length,1,'owner must schedule one initial repair pass');
        assert.strictEqual(scheduled[0].delay,1200);
        assert.strictEqual(window.TVTrackerUpcomingScheduleRepair.install(),false,'owner installer must be idempotent');
        assert.strictEqual(window.TVTrackerUpcomingScheduleRepair.repairMissingWatchingSchedules,undefined,'owner must keep repair implementation private');

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
        window.DATA.shows = {'123':lucky};
        window.getUpcomingScheduleItems = show=>show._repaired ? [{episode_number:7,air_date:'2026-08-19'}] : [];
        window.refreshShowForSchedule = async(show,force)=>{
            assert.strictEqual(force,true,'missing Watching schedule must force a targeted refresh');
            forcedRefreshes += 1;
            show._repaired = true;
        };
        window.saveData = async()=>{ saved += 1; };
        window.renderUpcoming = async(startBackgroundRefresh)=>{
            assert.strictEqual(startBackgroundRefresh,false,'targeted repair rerender must not start another background loop');
            rerendered += 1;
        };

        const result = await window.refreshUpcomingDataInBackground();
        assert.strictEqual(result,'background-result','wrapper must preserve the original Upcoming refresh result');
        assert.strictEqual(calls.background,1);
        assert.strictEqual(forcedRefreshes,1);
        assert.strictEqual(saved,1);
        assert.strictEqual(rerendered,1);
        assert.strictEqual(lucky._repaired,true);

        await window.refreshUpcomingDataInBackground();
        assert.strictEqual(calls.background,2);
        assert.strictEqual(forcedRefreshes,1,'a show with a repaired schedule must not refresh again');
        assert.strictEqual(saved,1);
        assert.strictEqual(rerendered,1);
    }

    {
        const {window} = createUpcomingRepairSandbox();
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
        window.DATA.shows = {'999':completed};
        window.getUpcomingScheduleItems = ()=>[];
        window.refreshShowForSchedule = async()=>{ forcedRefreshes += 1; };

        await window.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedRefreshes,0);
    }

    {
        const {window} = createUpcomingRepairSandbox();
        const forcedIds = [];
        let saved = 0;
        let rerendered = 0;
        for(let id=1;id<=10;id+=1){
            window.DATA.shows[String(id)] = {
                id,
                tmdb_id:id,
                status:'watching',
                tmdb_status:'Returning Series',
                number_of_episodes:1,
                episodes_watched:{}
            };
        }
        window.getUpcomingScheduleItems = ()=>[];
        window.refreshShowForSchedule = async(show,force)=>{
            assert.strictEqual(force,true);
            forcedIds.push(show.tmdb_id);
        };
        window.saveData = async()=>{ saved += 1; };
        window.renderUpcoming = async(startBackgroundRefresh)=>{
            assert.strictEqual(startBackgroundRefresh,false);
            rerendered += 1;
        };

        await window.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedIds.length,8,'one repair pass must refresh at most eight shows');
        assert.strictEqual(saved,1);
        assert.strictEqual(rerendered,1);

        await window.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedIds.length,10,'a later pass may process candidates left beyond the bound');
        assert.strictEqual(saved,2);
        assert.strictEqual(rerendered,2);

        await window.refreshUpcomingDataInBackground();
        assert.strictEqual(forcedIds.length,10,'cooldown must suppress immediate repeat refreshes');
        assert.strictEqual(saved,2,'cooldown-only passes must not save tracker state');
        assert.strictEqual(rerendered,2,'cooldown-only passes must not rerender Upcoming');
    }

    {
        const {window,scheduled,warnings} = createUpcomingRepairSandbox();
        const failure = new Error('initial repair render failed');
        window.DATA.shows = {
            '321':{
                id:321,
                tmdb_id:321,
                status:'watching',
                tmdb_status:'Returning Series',
                number_of_episodes:1,
                episodes_watched:{}
            }
        };
        window.renderUpcoming = async()=>{ throw failure; };
        const unhandled = [];
        const onUnhandled = error=>{ unhandled.push(error); };
        process.on('unhandledRejection',onUnhandled);
        try{
            scheduled[0].callback();
            await new Promise(resolve=>setImmediate(resolve));
            assert.deepStrictEqual(unhandled,[],'the timer-owned repair promise must not leak an unhandled rejection');
        }finally{
            process.removeListener('unhandledRejection',onUnhandled);
        }
        assert.ok(
            warnings.some(args=>args[0] === 'TV Tracker initial targeted Upcoming repair failed' && args[1] === failure),
            'the timer-owned repair rejection must be reported'
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
        assert(upcomingRepairSource.includes(trackerDependency),`Upcoming owner must contain tracker dependency ${trackerDependency}`);
    }

    console.log('Notification settings and Upcoming polish regression tests passed.');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
