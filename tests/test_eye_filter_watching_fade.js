const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const behaviorSource = fs.readFileSync('static/js/eye-filter-behavior.js','utf8');
const template = fs.readFileSync('templates/index.html','utf8');

function loadBehavior(){
  const tracked = {
    1:{status:'watching'},
    2:{status:'finished'},
    3:{status:'plan'},
    4:{status:'watching'}
  };

  const context = {
    console,
    getShowByTmdb(id){ return tracked[String(id)] || tracked[id] || null; },
    createEyeFilterState(state){
      const source = state && typeof state === 'object' ? state : {};
      return {
        fadeWatched:source.fadeWatched === true || String(source.fadeWatched || '') === '1',
        hideWatched:source.hideWatched === true || String(source.hideWatched || '') === '1'
      };
    },
    applyEyeFiltersToItems(items,media='tv',state={}){
      const fade = state.fadeWatched === true || String(state.fadeWatched || '') === '1';
      const hide = state.hideWatched === true || String(state.hideWatched || '') === '1';
      return (Array.isArray(items) ? items : [])
        .filter(item=>!(hide && item && item.completed === true))
        .map(item=>Object.assign({},item,{
          _eyeFaded:!!(fade && !hide && item && item.completed === true)
        }));
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(behaviorSource,context);
  return context;
}

{
  const context = loadBehavior();
  const rows = context.applyEyeFiltersToItems([
    {id:1,media_type:'tv',name:'Watching Show'},
    {id:2,media_type:'tv',name:'Completed Show',completed:true},
    {id:3,media_type:'tv',name:'Plan Show'}
  ],'tv',{fadeWatched:true});

  assert.strictEqual(rows[0]._eyeFaded,true,'watching TV shows should fade when Fade watched is enabled');
  assert.strictEqual(rows[1]._eyeFaded,true,'existing completed-show fade behavior should remain intact');
  assert.strictEqual(rows[2]._eyeFaded,false,'plan-to-watch shows should not be faded');
}

{
  const context = loadBehavior();
  const rows = context.applyEyeFiltersToItems([
    {id:1,media_type:'tv',name:'Watching Show'}
  ],'tv',{fadeWatched:false});
  assert.strictEqual(rows[0]._eyeFaded,false,'watching shows should not fade when Fade watched is off');
}

{
  const context = loadBehavior();
  const rows = context.applyEyeFiltersToItems([
    {id:1,media_type:'tv',name:'Watching Show'},
    {id:2,media_type:'tv',name:'Completed Show',completed:true}
  ],'tv',{fadeWatched:true,hideWatched:true});

  assert.strictEqual(rows.length,1,'Hide watched should keep its existing filtering semantics');
  assert.strictEqual(rows[0].id,1,'Watching should not be reclassified as hidden watched content');
  assert.strictEqual(rows[0]._eyeFaded,false,'Hide watched should continue to suppress fade styling');
}

{
  const context = loadBehavior();
  const rows = context.applyEyeFiltersToItems([
    {id:4,media_type:'movie',title:'Movie In Progress'}
  ],'movie',{fadeWatched:true});
  assert.strictEqual(rows[0]._eyeFaded,false,'TV watching status should not change movie fade behavior');
}

{
  const appIndex = template.indexOf("filename='js/app.js'");
  const behaviorIndex = template.indexOf("filename='js/eye-filter-behavior.js'");
  const searchBridgeIndex = template.indexOf("filename='js/search-state-bridge.js'");

  assert(appIndex >= 0,'app.js should be loaded');
  assert(behaviorIndex > appIndex,'eye-filter behavior must load after app.js defines the base filter');
  assert(searchBridgeIndex > behaviorIndex,'eye-filter behavior must be installed before Search/Discover render bridges');
}

console.log('Eye-filter watching fade tests passed.');
