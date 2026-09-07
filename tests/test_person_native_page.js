const assert=require('assert'),fs=require('fs'),vm=require('vm');

function environment(){
    const renders=[],routes=[],opens=[];
    const win={console,URL,URLSearchParams,setTimeout,clearTimeout,
        location:{pathname:'/app/person/10-synthetic-person',search:'?media=movie',origin:'https://test.invalid'},
        document:{addEventListener(){},getElementById(){return null;}},sessionStorage:{getItem(){return null;},setItem(){}}
    };
    win.window=win;vm.createContext(win);
    for(const file of ['app.js','ui.js','discover-vue-bridge.js'])vm.runInContext(fs.readFileSync('static/js/'+file,'utf8'),win,{filename:file});
    win.activePage='person-detail';win.selectedPersonContext={personId:'10',role:''};
    win.setAppHashRoute=route=>routes.push(route);
    win.getCurrentAppRoute=()=>routes.at(-1)||'/app/person/10-synthetic-person?media=movie';
    win.getDetailNavContext=()=> 'discover';win.rememberRouteNavContext=()=>{};
    win.updateShellTitle=()=>{};win.ensureBrowseGlobalInteractionEvents=()=>{};
    win.showPersonDetailPageShell=()=>{win.activePage='person-detail';};
    win.openMoviePage=async(id,options)=>opens.push({media:'movie',id,options});
    win.openDiscoverShowModal=async(item)=>opens.push({media:'tv',item});
    win.navigateBackOrRouteFallback=route=>routes.push(route);
    win.renderAppRouteNotFoundPage=()=>renders.push({notFound:true});
    const raw={id:10,name:'Synthetic Person',biography:'A biography. '.repeat(30),combined_credits:{cast:[
        {id:1,media_type:'movie',title:'First movie',character:'Lead',popularity:20,release_date:'2005-01-01',adult:true,vote_average:8.54},
        {id:2,media_type:'movie',title:'Second movie',character:'Guest',popularity:10,release_date:'2008-01-01'},
        {id:3,media_type:'tv',name:'Synthetic show',character:'TV lead',popularity:5,first_air_date:'2010-01-01'}
    ],crew:[{id:1,media_type:'movie',title:'First movie',job:'Director',department:'Directing',popularity:20,release_date:'2005-01-01'}]}};
    const person=win.normalizePersonDetails(raw);
    win.personPageState={personId:'10',role:'',media:'movie',person,credits:win.getPersonCreditsForRole(person,'','movie')};
    win.getMovieTrackingState=id=>({watched:id==='1',plan:false,favorite:false});
    const bridge=win.TVTrackerDiscoverVueBridge;bridge.attachPersonOwner({render:model=>renders.push(model),unmount(){}});
    return {win,bridge,renders,routes,opens,person,raw,actions:bridge.personActions};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

(async()=>{
    const e=environment(),{win,bridge,actions}=e,original=JSON.stringify(win.DATA);
    win.renderActivePersonPage();let model=e.renders.at(-1);
    assert.deepStrictEqual(Array.from(model.items,x=>x.id),[1,2]);
    assert(model.items[0].roleLabel.includes('Lead')&&model.items[0].roleLabel.includes('Director'),'duplicate cast/crew credits retain combined roles');
    assert.strictEqual(model.items[0].rating,'8.5');assert.strictEqual(model.items[0].adult,true);
    assert.strictEqual(model.profile.longBio,true);assert.strictEqual(model.profile.photoUrl,'');
    assert.strictEqual(model.profile.watched,1);assert.strictEqual(model.profile.total,2);assert.strictEqual(model.profile.percent,50);
    assert(model.roles.some(role=>role.value==='director'));
    await actions.toggleEye('fadeWatched');assert.strictEqual(e.renders.at(-1).items[0].faded,true);
    await actions.toggleEye('hideWatched');assert.strictEqual(e.renders.at(-1).items.length,1);
    assert.strictEqual(e.renders.at(-1).profile.total,2,'eye visibility does not change the progress denominator');
    assert(e.routes.at(-1).includes('hideWatched=1'));
    await actions.setRole('director');assert.strictEqual(e.renders.at(-1).bodyState,'empty');
    assert.strictEqual(e.renders.at(-1).profile.total,1,'role filter scopes progress as before');
    await actions.toggleEye('hideWatched');model=e.renders.at(-1);
    assert.strictEqual(model.items.length,1);assert(e.routes.at(-1).includes('role=director'));
    await actions.openMedia(model.items[0]);assert.strictEqual(e.opens.at(-1).id,1);
    await actions.setMedia('tv');model=e.renders.at(-1);
    assert.strictEqual(model.role,'','unsupported role resets when changing media');assert.strictEqual(model.items[0].id,3);
    assert.strictEqual(model.eyes.fadeWatched,true,'media changes preserve eye flags');
    await actions.openMedia(model.items[0]);assert.strictEqual(e.opens.at(-1).media,'tv');
    assert.strictEqual(e.opens.at(-1).item.first_air_date,'2010-01-01');
    await actions.setMedia('movie');await actions.setRole('acting');
    assert.strictEqual(e.renders.at(-1).items.length,2);
    actions.back();assert.strictEqual(e.routes.at(-1),'/app/discover');
    assert.strictEqual(JSON.stringify(win.DATA),original);
    assert(Object.isFrozen(model)&&Object.isFrozen(model.items)&&Object.isFrozen(model.eyes));
    assert.strictEqual(bridge.buildPersonModel({personId:'10',loading:true}).bodyState,'loading');
    assert.strictEqual(bridge.buildPersonModel({personId:'10',error:'Provider unavailable'}).bodyState,'error');
    assert.strictEqual(bridge.buildPersonModel({personId:'10',media:'movie'}).emptyTitle,'No movies found');

    for(const outcome of ['success','error','not-found']){
        const e=environment(),d=deferred();e.win.personPageState.person=null;e.win.tmdbGetPersonDetailsWithCredits=()=>d.promise;
        const pending=e.win.loadPersonPageResults();e.win.activePage='shows';const count=e.renders.length,routes=e.routes.length;
        if(outcome==='success')d.resolve(e.raw);else d.reject(Object.assign(new Error('Provider'),{status:outcome==='not-found'?404:502}));
        await pending;assert.strictEqual(e.renders.length,count,'late '+outcome+' cannot render');assert.strictEqual(e.routes.length,routes);
    }
    const race=environment(),first=deferred(),second=deferred();let calls=0;
    race.win.personPageState.person=null;race.win.tmdbGetPersonDetailsWithCredits=()=>++calls===1?first.promise:second.promise;
    const old=race.win.openPersonPage('',10,{media:'movie'});
    const next=race.win.openPersonPage('',10,{media:'tv'});
    second.resolve(race.raw);await next;first.resolve(race.raw);await old;
    assert.strictEqual(race.renders.at(-1).media,'tv');assert.strictEqual(race.renders.at(-1).items[0].id,3);
    const adult=environment();
    adult.win.DATA.profile.adult_filter=false;
    vm.runInContext(fs.readFileSync('static/js/adult-filter.js','utf8'),adult.win);
    assert.strictEqual(adult.win.getPersonCreditsForRole(adult.person,'','movie').length,2);
    assert.strictEqual(adult.win.getPersonCreditsForRole(adult.person,'director','movie')[0].adult,true,'explicit TMDB classification survives role selection across duplicate credits');
    adult.win.DATA.profile.adult_filter=true;
    assert.deepStrictEqual(Array.from(adult.win.getPersonCreditsForRole(adult.person,'','movie'),item=>item.id),[2]);
    assert.strictEqual(adult.win.getPersonCreditsForRole(adult.person,'director','movie').length,0);
    const unknown=adult.win.normalizePersonCreditItem({id:50,title:'Unknown'},'movie');
    assert(!Object.hasOwn(unknown,'adult'),'missing classification remains unknown');
    assert.strictEqual(adult.win.normalizePersonCreditItem({id:51,title:'Known',adult:false},'movie').adult,false);
    const ui=fs.readFileSync('static/js/ui.js','utf8'),app=fs.readFileSync('static/js/app.js','utf8');
    for(const name of ['renderPersonDetailPage','renderPersonResultCard','renderPersonProfileHTML','renderPersonProgressCardHTML'])assert(!ui.includes('function '+name));
    assert(!app.includes('attachPersonDetailPageEvents'));
    console.log('Person native credit merging, roles/media, progress, actions, tracker integrity, and stale requests passed.');
})().catch(error=>{console.error(error);process.exit(1);});
