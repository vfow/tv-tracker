const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(ROOT,'templates/index.html'),'utf8');
const css = fs.readFileSync(path.join(ROOT,'static/css/notifications-nav.css'),'utf8');
const source = fs.readFileSync(path.join(ROOT,'static/js/notifications-nav.js'),'utf8');

const discoverAt = html.indexOf('data-page="discover"');
const notificationsAt = html.indexOf('data-page="notifications"');
const profileAt = html.indexOf('data-page="profile"');
assert(discoverAt >= 0 && notificationsAt > discoverAt && profileAt > notificationsAt,'Notifications must sit between Discover and Profile in the desktop sidebar');
assert(html.includes('sidebar-notifications-label">NOTiFiCATIONS<span'),'Sidebar label must use the requested NOTiFiCATIONS treatment');
assert(html.includes('sidebar-notification-unread-dot'),'Sidebar Notifications must contain its own unread dot');
assert(html.indexOf("filename='js/notifications-nav.js'") > html.indexOf("filename='js/app-router.js'"),'Notifications nav bridge must load after the router');
assert(html.includes("filename='css/notifications-nav.css'"),'Notifications nav styling must be loaded by the app shell');
assert(css.includes('right:-9px'),'Unread dot must sit just beyond the final S instead of at the far sidebar edge');
assert(css.includes('font-size:34px'),'Long Notifications label must fit the fixed-width sidebar on one line');

function classList(){
    const values = new Set();
    return {
        toggle(name,on){ if(on) values.add(name); else values.delete(name); },
        contains(name){ return values.has(name); }
    };
}

const dot = {hidden:true};
const links = ['shows','discover','notifications','profile','settings'].map(page=>({
    dataset:{page},
    classList:classList(),
    attrs:{},
    setAttribute(name,value){ this.attrs[name] = value; },
    removeAttribute(name){ delete this.attrs[name]; },
    querySelector(selector){
        return page === 'notifications' && selector === '.sidebar-notification-unread-dot' ? dot : null;
    },
    addEventListener(){}
}));
const notificationLink = links[2];
const store = new Map([[
    'tv-tracker-notification-history-scope:v1',
    JSON.stringify({latestId:10,latestCreatedAt:'2026-09-03T00:00:00Z'})
]]);
const document = {
    readyState:'complete',
    hidden:false,
    querySelector(selector){
        return selector === '.sidebar [data-page="notifications"]' ? notificationLink : null;
    },
    querySelectorAll(selector){
        return selector === '.app-primary-nav [data-page]' ? links : [];
    },
    addEventListener(){}
};
const fetch = async requestPath=>({
    ok:true,
    status:200,
    async json(){
        if(requestPath === '/api/notifications/status'){
            return {latestId:10,latestCreatedAt:'2026-09-03T00:00:00Z'};
        }
        return {notifications:[
            {id:10,createdAt:'2026-09-03T00:00:00Z',read:false},
            {id:11,createdAt:'2026-09-03T00:01:00Z',read:false}
        ]};
    }
});
const win = {
    document,
    fetch,
    localStorage:{getItem:key=>store.get(key) || null,setItem:(key,value)=>store.set(key,value)},
    location:{pathname:'/app/list/watching',href:''},
    activePage:'shows',
    setInterval(){ return 1; },
    addEventListener(){},
    console,
    setAppPrimaryNavActive(page){
        links.forEach(link=>link.classList.toggle('active',link.dataset.page === page));
    }
};
const context = {window:win,console,Object,String,Number,Array,Date,JSON,Promise,Error,Set};
vm.createContext(context);
vm.runInContext(source,context,{filename:'notifications-nav.js'});

(async()=>{
    const api = win.TVTrackerNotificationsNav;
    assert(api,'Notifications nav runtime must expose its bridge');
    const filtered = api.filterNotificationItems([
        {id:9,createdAt:'2026-09-02T23:59:00Z'},
        {id:10,createdAt:'2026-09-03T00:00:00Z'},
        {id:11,createdAt:'2026-09-03T00:01:00Z'}
    ],{mode:'after',latestId:10,latestCreatedAt:'2026-09-03T00:00:00Z'});
    assert.deepStrictEqual(Array.from(filtered,item=>item.id),[11],'Sidebar unread state must respect the browser notification-history reset boundary');

    api.setNotificationsActive();
    assert.strictEqual(links[2].classList.contains('active'),true,'Notifications nav item must become active on the Notifications page');
    assert.strictEqual(links[0].classList.contains('active'),false,'Shows must not remain active on the Notifications page');

    await api.syncUnread();
    assert.strictEqual(dot.hidden,false,'Unread dot must become visible for a new unread notification after the local history boundary');
    console.log('sidebar notifications navigation regression passed');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
