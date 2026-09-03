const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname,'..');
const css = fs.readFileSync(path.join(ROOT,'static/css/notifications-nav.css'),'utf8');
const source = fs.readFileSync(path.join(ROOT,'static/js/notifications-nav.js'),'utf8');

assert(css.includes('.sidebar-notifications-link'),'Notifications sidebar selector must remain covered before JavaScript removes the node');
assert(css.includes('display:none !important'),'Notifications sidebar entry must never flash while the app boots');
assert(!css.includes('--tt-sidebar-width:220px'),'Removing Notifications must restore the normal desktop sidebar width');
assert(css.includes('.notifications-page .notifications-loading'),'The transient Notifications loading copy must never be visible');
assert(css.includes('.tv-runtime-save-status[data-state="saved"]'),'Routine Saved status badge must stay hidden');
assert(!source.includes('setInterval('),'Removed sidebar entry must not leave a useless unread polling loop behind');

function classList(initial=[]){
    const values = new Set(initial);
    return {
        add(name){ values.add(name); },
        remove(name){ values.delete(name); },
        toggle(name,on){ if(on) values.add(name); else values.delete(name); },
        contains(name){ return values.has(name); }
    };
}

const links = ['shows','discover','notifications','profile','settings'].map(page=>({
    dataset:{page},
    classList:classList(page === 'shows' ? ['active'] : []),
    attrs:{},
    removed:false,
    remove(){ this.removed = true; },
    setAttribute(name,value){ this.attrs[name] = value; },
    removeAttribute(name){ delete this.attrs[name]; }
}));
const notificationLink = links[2];
const showsPage = {classList:classList(['active-page'])};
const notificationsPage = {classList:classList()};
const pages = [showsPage,notificationsPage];
const renderOrder = [];

function response(payload={notifications:[]}){
    return {
        ok:true,
        status:200,
        async json(){ return payload; },
        clone(){ return response(payload); }
    };
}

const document = {
    readyState:'complete',
    querySelector(selector){
        if(selector === '.sidebar [data-page="notifications"]') return notificationLink.removed ? null : notificationLink;
        if(selector === 'meta[name="csrf-token"]') return {content:'csrf'};
        return null;
    },
    querySelectorAll(selector){
        if(selector === '.app-primary-nav [data-page]') return links.filter(link=>!link.removed);
        if(selector === '.page') return pages;
        return [];
    },
    getElementById(id){ return id === 'notifications-page' ? notificationsPage : null; },
    addEventListener(){}
};

const fetch = async requestPath=>{
    if(String(requestPath).startsWith('/api/notifications')) return response({notifications:[]});
    return response({});
};

const services = {
    async renderNotificationsPage(){
        renderOrder.push('render-start');
        assert.strictEqual(notificationsPage.classList.contains('active-page'),false,'Notifications must stay hidden while its data/model is prepared');
        await Promise.resolve();
        renderOrder.push('render-ready');
        return true;
    }
};

const win = {
    document,
    fetch,
    URL,
    location:{pathname:'/app/list/watching',origin:'https://example.test'},
    activePage:'shows',
    TVTrackerNotifications:services,
    updateShellTitle(){ renderOrder.push('title'); },
    console
};
const context = {window:win,console,Object,String,Number,Array,Date,JSON,Promise,Error,Set,Proxy,Reflect,URL,encodeURIComponent};
vm.createContext(context);
vm.runInContext(source,context,{filename:'notifications-nav.js'});

(async()=>{
    assert.strictEqual(notificationLink.removed,true,'NOTiFiCATIONS must be removed from the desktop sidebar DOM');
    assert.strictEqual(typeof win.TVTrackerNotifications.openNotificationsPage,'function','Notifications route must remain available from the bell/URL');

    await win.TVTrackerNotifications.openNotificationsPage({fromRoute:true});

    assert.deepStrictEqual(renderOrder.slice(0,2),['render-start','render-ready'],'Notifications content must be prepared before the page is revealed');
    assert.strictEqual(notificationsPage.classList.contains('active-page'),true,'Notifications page must appear only after its ready render finishes');
    assert.strictEqual(showsPage.classList.contains('active-page'),false,'Previous page must be hidden after Notifications is ready');
    assert.strictEqual(links[0].classList.contains('active'),true,'Notifications still belongs to the Shows/Upcoming navigation context');
    assert.strictEqual(links[1].classList.contains('active'),false);
    assert.strictEqual(links[3].classList.contains('active'),false);

    console.log('notifications sidebar removal and instant route regression passed');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
