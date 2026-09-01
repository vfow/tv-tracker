const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/show-details-vue-bridge.js', 'utf8');
const nodeModelSource = fs.readFileSync('static/js/media-details-node-model.js', 'utf8');
const component = fs.readFileSync('frontend/src/media-details/ShowDetails.vue', 'utf8');
const nodeComponent = fs.readFileSync('frontend/src/media-details/DetailNode.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/media-details/showViewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

const calls = [];
const show = {tmdb_id:202,title:'Example Show',first_air_date:'2024-01-01',genres:['Drama'],tmdb_rating:8.4};
const options = {preview:true};
const nodeModel = {
    ownership:'typed-node-model',
    text(value){ return Object.freeze({kind:'text',text:String(value)}); },
    element(tag,attrs,children){ return Object.freeze({kind:'element',tag,attrs:Object.freeze(attrs || {}),children:Object.freeze(children || [])}); },
    fragment(html){ return Object.freeze([{kind:'text',text:String(html || '')}]); },
    freeze(value){ return Object.freeze(value); }
};
const context = {
    URL,
    window:{
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        DATA:{shows:{'202':{tmdb_id:202}}},
        activeShowDetailsTabs:{},
        TVTrackerMediaDetailsNodeModel:nodeModel,
        getShowDetailActiveTab(){ return 'Info'; },
        trackerBackgroundImage(){ return 'url("/backdrop.jpg")'; },
        trackerImageURL(){ return '/poster.jpg'; },
        getShowMetaHTML(){ calls.push(['meta']); return '<span>2024</span>'; },
        renderV2ShowInfoLinksLineHTML(){ calls.push(['links']); return '<div>TMDB</div>'; },
        renderShowDetailActionControlsHTML(nextShow,tracked){ calls.push(['actions',nextShow,tracked]); return '<button data-status="watching">Watching</button>'; },
        renderShowDetailTabsHTML(){ calls.push(['tabs']); return '<div class="show-detail-tabs"></div>'; },
        renderShowDetailTabContentHTML(){ calls.push(['content']); return '<section>Synopsis</section>'; },
        renderV2SimilarShowsHTML(){ calls.push(['similar']); return '<section>You may also like</section>'; },
        attachShowDetailsPageEvents(nextShow,tracked){ calls.push(['bind-page', nextShow, tracked]); },
        attachV2ShowModalEvents(nextShow){ calls.push(['bind-v2', nextShow]); }
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerShowDetailsVueBridge;
assert(bridge, 'Show Details Vue bridge should exist');
assert.strictEqual(bridge.ownership, 'vue-dom');
assert.strictEqual(context.window.renderShowDetailsPage, bridge.render, 'runtime Show Details DOM target must stay behind the Vue bridge');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['attachVueOwner','buildViewModel','ownership','render','renderLoadFailure']);

const model = bridge.buildViewModel(show,options);
assert.strictEqual(model.surface, 'show');
assert.strictEqual(model.showId, '202');
assert.strictEqual(model.title, 'Example Show');
assert(Array.isArray(model.meta));
assert(Array.isArray(model.actions));
assert(Array.isArray(model.tabs));
assert(Array.isArray(model.tabContent));
assert(Array.isArray(model.similar));
assert(!Object.prototype.hasOwnProperty.call(model,'html'), 'Show Details model must not serialize the page as HTML');
assert(Object.isFrozen(model), 'Show Details Vue view model must be immutable');
assert(calls.some(call=>call[0] === 'actions' && call[2] === true), 'tracked-state action composition must remain intact');

let rendered = null;
bridge.attachVueOwner({
    render(next){ rendered = next; },
    unmount(){}
});
context.window.renderShowDetailsPage(show,options);
assert(rendered, 'Vue Show Details owner should receive the structured model');
assert.strictEqual(rendered.surface, 'show');
assert(calls.some(call=>call[0] === 'bind-page' && call[1] === show && call[2] === true), 'existing Show Details interaction services must be rebound after Vue mount');
assert(calls.some(call=>call[0] === 'bind-v2' && call[1] === show), 'existing V2 interaction services must be rebound after Vue mount');

assert(viewModel.includes("readonly surface: 'show'"));
assert(viewModel.includes('readonly tabContent: DetailNodeList'));
assert(!viewModel.includes('readonly html: string'));
assert(component.includes('data-tvtracker-show-details-owner="vue"'));
assert(component.includes("import DetailNode from './DetailNode.vue'"));
assert(component.includes('class="show-detail-page-inner"'));
assert(!component.includes('v-html'), 'Show Details Vue component must not inject serialized HTML');
assert(nodeComponent.includes('h(node.tag, node.attrs'), 'typed detail nodes must be rendered as native Vue VNodes');
assert(!component.includes('fetch('), 'Show Details Vue component must not own network requests');
assert(!component.includes('history.'), 'Show Details Vue component must not own browser History');
assert(!bridgeSource.includes('renderShowDetailsPageHTML'), 'Show Details bridge must not consume the retired page HTML composer');
assert(!bridgeSource.includes('/api/'), 'Show Details Vue bridge must not make provider/API requests');
assert(!bridgeSource.includes('history.pushState'), 'Show Details Vue bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Show Details Vue bridge must not own browser History writes');
assert(nodeModelSource.includes('ownership:"typed-node-model"'));
assert(nodeModelSource.includes('lower.startsWith("on")'), 'legacy fragment adapter must reject inline event attributes');

assert(!ui.includes('function renderShowDetailsPageHTML(show,options={})'), 'obsolete Show Details page HTML composer must be deleted after parity');
assert(!ui.includes('function renderShowDetailsPage(show,options={})'), 'obsolete legacy Show Details DOM wrapper must be deleted');
assert(ui.includes('function attachShowDetailsPageEvents(show,isTracked)'), 'proven Show Details interaction services remain until the final service cleanup');
assert(ui.includes('function renderShowDetailActionControlsHTML(show,isTracked)'), 'shared detail fragments may remain until the final ui.js sweep');

assert(app.includes('function renderActiveShowDetailPage()'), 'app.js must remain Show Details orchestration owner');
assert(app.includes('renderShowDetailsPage(show,{preview:!(DATA.shows && DATA.shows[String(show.tmdb_id)])});'));
assert(app.includes('async function openShowDetailsPage(showId,options={})'), 'show request/navigation orchestration must remain in app.js');

assert(main.includes("import ShowDetails from './media-details/ShowDetails.vue';"));
assert(main.includes('createApp(ShowDetails, { model })'));
assert(main.includes('window.TVTrackerShowDetailsVueBridge?.attachVueOwner(showDetailsOwner);'));
assert(main.includes("document.getElementById('show-detail-content')"));

const stateBridgeIndex = template.indexOf("filename='js/media-details-state-bridge.js'");
const nodeModelIndex = template.indexOf("filename='js/media-details-node-model.js'");
const movieVueBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
const showVueBridgeIndex = template.indexOf("filename='js/show-details-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(stateBridgeIndex >= 0, 'Media Details state bridge must remain loaded');
assert(nodeModelIndex > stateBridgeIndex, 'typed detail node model must load after the read-only media state bridge');
assert(movieVueBridgeIndex > nodeModelIndex, 'Movie Details bridge must load after the typed node model');
assert(showVueBridgeIndex > movieVueBridgeIndex, 'Show Details bridge must load after Movie Details bridge');
assert(routerIndex > showVueBridgeIndex, 'media detail bridges must load before routing/startup can invoke them');

console.log('Vue-native Show Details composition checks passed.');
