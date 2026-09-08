const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {console,URL,URLSearchParams,setTimeout,clearTimeout,
  document:{addEventListener(){},getElementById(){return null;}}};
context.window=context;
vm.createContext(context);
for(const file of ['audit-utils','app','ui','episode-crew','episode-details-vue-bridge']) {
  vm.runInContext(fs.readFileSync(`static/js/${file}.js`,'utf8'),context,{filename:file});
}
const plain=value=>JSON.parse(JSON.stringify(value));
const show={tmdb_id:42,title:'Synthetic show',number_of_seasons:1,status:'paused',
  episodes_watched:{'1':[1]},_episode_list:{'1':[
    {episode_number:1,name:'First',air_date:'2020-01-01'},
    {episode_number:2,name:'Second <script>text</script>',air_date:'2020-01-02',overview:'Overview',runtime:45,vote_average:8.2},
    {episode_number:3,name:'Future',air_date:'2099-01-01'}
  ]},_episode_v2_details:{'1-2':{external_ids:{imdb_id:'tt123',tvdb_id:99}}},
  _episode_guest_stars:{'1-2':[{id:8,name:'Guest',character:'Guest role'}]},
  _episode_cast_credits:{'1-2':[{id:9,name:'Cast',character:'Lead'}]}};
context.DATA.shows['42']=show;
context.DATA.history=[{id:'old',tmdb_id:42,season:1,episode:1,watched_at:'2020-01-03T00:00:00Z'},{id:'unknown',action:'old format'}];
context.selectedEpisodeContext={showId:'42',season:1,episode:2};
context.activePage='episode-detail';
const bridge=context.TVTrackerEpisodeDetailsBridge;
let rendered=[];
let unmounted=0;
bridge.attachVueOwner({render(model){rendered.push(model);},unmount(){unmounted++;}});
const before=plain(context.DATA);
const crew=[{id:12,name:'Director',job:'Director'},{id:13,name:'Writer',job:'Writer'}];
const model=bridge.viewModel(show,1,2,{},crew);
assert.strictEqual(model.state,'ready');
assert.strictEqual(model.title,'Second <script>text</script>');
assert.strictEqual(model.code,'S1E02');
assert.strictEqual(model.canToggle,true);
assert.strictEqual(model.status,'Unwatched');
assert.strictEqual(model.previous.episode,1);
assert.strictEqual(model.next.episode,3);
assert.strictEqual(model.rating,'8.2');
assert.deepStrictEqual(plain(model.links).map(x=>x.label),['IMDb','TVDB','TMDB']);
assert.strictEqual(model.guests[0].name,'Guest');
assert.strictEqual(model.cast[0].name,'Cast');
assert.deepStrictEqual(plain(model.crew).map(x=>x.label),['Directors','Writers']);
assert.deepStrictEqual(plain(context.DATA),before,'projection preserves tracker and all History records');
assert.strictEqual(bridge.viewModel(show,1,3,{}).canToggle,false,'future unlogged episode cannot be toggled');
assert.strictEqual(bridge.viewModel(show,1,1,{}).watched,true);
assert.strictEqual(bridge.viewModel(show,1,1,{}).canToggle,true,'watched entries remain reversible');
assert.strictEqual(bridge.viewModel(show,1,2,{discoverPreview:true}).canToggle,false);
assert.strictEqual(bridge.viewModel(show,1,2,{discoverPreview:true}).watchedText,'Not in library');

(async()=>{
  let release;
  context.TVTrackerEpisodeCrew={load:()=>new Promise(resolve=>{release=resolve;})};
  context.renderEpisodeDetails(show,1,2,{});
  assert.strictEqual(rendered.at(-1).key,'42::1-2');
  context.selectedEpisodeContext={showId:'42',season:1,episode:3};
  await bridge.renderState('loading','42',1,3);
  release(crew);await new Promise(setImmediate);
  assert.strictEqual(rendered.at(-1).key,'42::1-3','late crew cannot replace another episode');
  assert.strictEqual(rendered.at(-1).state,'loading');
  context.activePage='shows';
  const count=rendered.length;
  await bridge.renderState('error','42',1,3);
  assert.strictEqual(rendered.length,count,'late failure cannot replace another route');

  bridge.release();
  assert.strictEqual(unmounted,1,'route close releases the Vue owner');

  // The retained crew service reuses canonical cached credits and normalizes jobs.
  context.readCachedV2EpisodeDetails=()=>({credits:{crew:[...crew,crew[0],{id:14,name:'Ignore',job:'Catering'}]}});
  vm.runInContext(fs.readFileSync('static/js/episode-crew.js','utf8'),context);
  const loaded=await context.TVTrackerEpisodeCrew.load(show,1,2);
  assert.deepStrictEqual(plain(loaded).map(x=>x.name),['Director','Writer']);
  assert.deepStrictEqual(plain(context.DATA.history),before.history,'crew cache never rewrites History');
  const service=fs.readFileSync('static/js/episode-crew.js','utf8');
  assert(!service.includes('MutationObserver')&&!service.includes('insertAdjacentHTML'));
  assert(!fs.existsSync('static/js/episode-tabs.js'));
  console.log('Native Episode Details projection and stale-request checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
