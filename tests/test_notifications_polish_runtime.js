const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'notifications-polish.js'), 'utf8');

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
        location:{pathname:'/app/list/watching',hash:''},
        history:{
            pushState(){},
            replaceState(){}
        },
        addEventListener(){},
        setTimeout(){ return 1; },
        clearTimeout(){},
        MutationObserver: class {
            constructor(callback){ this.callback = callback; }
            observe(){}
            disconnect(){}
        },
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
        MutationObserver:window.MutationObserver,
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
    vm.runInContext(source,sandbox,{filename:'notifications-polish.js'});
    return {window,routed};
}

(async()=>{
    {
        const {window,routed} = createSandbox();
        window.TVTrackerNotificationPolish.openDedicatedSettingsPage({fromRoute:false});
        assert.strictEqual(routed.length,1,'settings gear should route once');
        assert.strictEqual(routed[0].route,'/app/notifications/settings','settings gear should keep its dedicated route');
        assert.strictEqual(routed[0].replace,false);
    }

    {
        const {window} = createSandbox();
        assert.strictEqual(
            window.TVTrackerNotificationPolish.pushDiagnosticMessage('keypair_mismatch'),
            'The VAPID public and private keys do not match.'
        );
        assert.strictEqual(
            window.TVTrackerNotificationPolish.pushDiagnosticMessage('invalid_private_key'),
            'Server setup has an invalid VAPID private key.'
        );
        assert.strictEqual(window.TVTrackerNotificationPolish.pushDiagnosticMessage('unknown_code'),'');
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

        const repaired = await window.TVTrackerNotificationPolish.repairMissingWatchingSchedules();
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

        const repaired = await window.TVTrackerNotificationPolish.repairMissingWatchingSchedules();
        assert.strictEqual(repaired,false,'caught-up ended shows should not be force-refreshed');
        assert.strictEqual(forcedRefreshes,0);
    }

    assert(!source.includes('Choose which alerts TV Tracker can send you.'),'redundant Notifications subtitle must stay removed from the polish surface');
    assert(!source.includes('data-timezone-setting'),'polished notification settings must not expose a timezone control');
    assert(source.includes('function ensureMainSettingsSection()'),'polish layer must own creation of the main Settings section');
    assert(source.includes('section.id = "settings-notifications"'),'polish layer must create the canonical Settings section');
    assert(source.includes('profile.insertAdjacentElement("afterend",section)'),'Notifications must stay directly after Profile');
    assert(source.includes('renderNotificationControls(root.querySelector(".notification-settings-list"))'),'dedicated settings page must use the shared controls renderer');
    assert(source.includes('renderNotificationControls(list);'),'main Settings must use the same shared controls renderer');
    assert(source.includes('enrichUnavailablePushState(state)'),'unavailable Push state must be enriched with safe diagnostics');
    assert(source.includes('keypair_mismatch:"The VAPID public and private keys do not match."'),'key mismatch diagnostic must be explicit without exposing key material');
    assert(source.includes('if(input && key === "enabled") input.disabled = false;'),'master Notifications toggle must be re-enabled after save');
    assert(!source.includes('header.innerHTML = "<h2>NOTIFICATIONS</h2>"'),'Settings observer must not replace the header on every mutation');
    assert(source.includes('if(subtitle) subtitle.remove();'),'redundant subtitle removal must be idempotent');

    console.log('Notification settings and Upcoming polish regression tests passed.');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
