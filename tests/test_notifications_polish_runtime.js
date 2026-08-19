const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'notifications-runtime.js'), 'utf8');

function createSandbox(){
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
        TVTrackerNotifications:{},
        DATA:{shows:{}},
        activePage:'shows',
        activeShowsTab:'upcoming',
        renderUpcoming:async()=>{},
        refreshUpcomingDataInBackground:async()=>{},
        getUpcomingScheduleItems:()=>[],
        refreshShowForSchedule:async()=>{},
        saveData:async()=>{}
    };
    window.window = window;
    window.history = window.history;

    const sandbox = {
        window,
        document,
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

(async()=>{
    {
        const {window,routed} = createSandbox();
        window.TVTrackerNotificationsRuntime.openDedicatedSettingsPage({fromRoute:false});
        assert.strictEqual(routed.length,1,'settings gear should route once');
        assert.strictEqual(routed[0].route,'/app/settings/notifications','settings gear should use canonical Account Settings route');
        assert.strictEqual(routed[0].replace,false);
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
        const {window} = createSandbox();
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

        const repaired = await window.TVTrackerNotificationsRuntime.repairMissingWatchingSchedules();
        assert.strictEqual(repaired,true);
        assert.strictEqual(forcedRefreshes,1);
        assert.strictEqual(saved,1);
        assert.strictEqual(rerendered,1);
        assert.strictEqual(lucky._repaired,true);
    }

    {
        const {window} = createSandbox();
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

        const repaired = await window.TVTrackerNotificationsRuntime.repairMissingWatchingSchedules();
        assert.strictEqual(repaired,false,'caught-up ended shows should not be force-refreshed');
        assert.strictEqual(forcedRefreshes,0);
    }

    assert(source.includes('const CANONICAL_SETTINGS_ROUTE = "/app/settings/notifications";'),'Notifications settings must use the canonical Account Settings route');
    assert(source.includes('function ensureMainSettingsSection()'),'polish compatibility API must target the first-class Settings section');
    assert(source.includes('document.getElementById("settings-v2-notification-list")'),'notification controls must render into the first-class Settings owner');
    assert(!source.includes('insertAdjacentElement'),'notification polish must not dynamically inject a Settings section');
    assert(!source.includes('MutationObserver'),'notification polish must not own Settings through a mutation observer');
    assert(!source.includes('pushDiagnosticMessage'),'technical Push diagnostics must not have a browser-facing formatter');
    assert(!source.includes('The VAPID public and private keys do not match.'),'keypair diagnostics must stay out of normal-user UI copy');
    assert(source.includes('Push notifications are temporarily unavailable.'),'generic unavailable Push copy must exist');
    assert(source.includes('TV Tracker couldn’t enable Push on this device. Try again later.'),'generic enable failure copy must exist');
    assert(source.indexOf('list.appendChild(pushRow);') < source.indexOf('list.appendChild(masterRow);'),'Push Notifications must be the first notification control');
    assert(source.includes('if(input && key === "enabled") input.disabled = false;'),'master Notifications toggle must be re-enabled after save');

    console.log('Notification settings and Upcoming polish regression tests passed.');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
