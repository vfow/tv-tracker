const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/movie-details-vue-bridge.js', 'utf8');
const stateBridgeSource = fs.readFileSync('static/js/media-details-state-bridge.js', 'utf8');
const nodeModelSource = fs.readFileSync('static/js/media-details-node-model.js', 'utf8');
const component = fs.readFileSync('frontend/src/media-details/MovieDetails.vue', 'utf8');
const nodeComponent = fs.readFileSync('frontend/src/media-details/DetailNode.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/media-details/movieViewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

const calls = [];
const pageState = {
    movieId:'101',
    routeSlug:'example-movie',
    loading:false,
    error:'',
    movie:{id:101,title:'Example Movie',year:'2024',runtime:120,vote_average:7.8}
};
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
        moviePageState:pageState,
        TVTrackerMediaDetailsNodeModel:nodeModel,
        trackerBackgroundImage(){ return 'url("/backdrop.jpg")'; },
        trackerImageURL(){ return '/poster.jpg'; },
        getMovieCertification(){ return 'PG-13'; },
        renderYearLinkHTML(){ return '<a>2024</a>'; },
        renderCertificationLinkHTML(){ return '<a>PG-13</a>'; },
        renderRuntimeDetailLinkHTML(){ return '<a>120 min</a>'; },
        renderMovieDirectedByHTML(){ return '<span>Directed by Director</span>'; },
        renderMovieGenresHTML(){ return '<span>Drama</span>'; },
        renderAdultMovieBadgeHTML(){ return ''; },
        renderMovieExternalLinksHTML(){ calls.push(['links']); return '<div>TMDB</div>'; },
        renderMovieActionButtonsHTML(){ calls.push(['actions']); return '<button>Favorite</button>'; },
        renderMovieTabsHTML(){ calls.push(['tabs']); return '<div class="show-detail-tabs"></div>'; },
        renderMovieActiveTabContentHTML(){ calls.push(['content']); return '<section>Synopsis</section>'; },
        attachMovieDetailPageEvents(){ calls.push(['bind']); },
        updateShellTitle(){ calls.push(['title']); }
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerMovieDetailsVueBridge;
assert(bridge, 'Movie Details Vue bridge should exist');
assert.strictEqual(bridge.ownership, 'vue-dom');
assert.strictEqual(context.window.renderMovieDetailPage, bridge.render, 'runtime Movie Details DOM target must stay behind the Vue bridge');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['attachVueOwner','buildViewModel','ownership','render','renderLoadFailure']);

const model = bridge.buildViewModel(pageState);
assert.strictEqual(model.surface, 'movie');
assert.strictEqual(model.state, 'ready');
assert.strictEqual(model.title, 'Example Movie');
assert(Array.isArray(model.meta));
assert(Array.isArray(model.actions));
assert(Array.isArray(model.tabs));
assert(Array.isArray(model.tabContent));
assert(!Object.prototype.hasOwnProperty.call(model,'html'), 'Movie Details model must not serialize the page as HTML');
assert(Object.isFrozen(model), 'Movie Details Vue view model must be immutable');
assert(calls.some(call=>call[0] === 'actions'));
assert(calls.some(call=>call[0] === 'content'));

const loading = bridge.buildViewModel({loading:true,error:'',movie:null});
assert.strictEqual(loading.state, 'loading');
assert.strictEqual(loading.message, 'Getting details.');
const failed = bridge.buildViewModel({loading:false,error:'No movie',movie:null});
assert.strictEqual(failed.state, 'error');
assert.strictEqual(failed.message, 'No movie');

let rendered = null;
bridge.attachVueOwner({
    render(next){ rendered = next; },
    unmount(){}
});
context.window.renderMovieDetailPage(pageState);
assert(rendered, 'Vue Movie Details owner should receive the structured model');
assert.strictEqual(rendered.surface, 'movie');
assert(calls.some(call=>call[0] === 'bind'), 'existing Movie Details interaction services must be rebound after Vue mount');
assert(calls.some(call=>call[0] === 'title'), 'existing shell title synchronization must remain intact');

assert(viewModel.includes("readonly surface: 'movie'"));
assert(viewModel.includes("readonly state: 'ready' | 'loading' | 'error'"));
assert(viewModel.includes('readonly tabContent: DetailNodeList'));
assert(!viewModel.includes('readonly html: string'));
assert(component.includes('data-tvtracker-movie-details-owner="vue"'));
assert(component.includes("import DetailNode from './DetailNode.vue'"));
assert(component.includes('movie-detail-page-inner'));
assert(!component.includes('v-html'), 'Movie Details Vue component must not inject serialized HTML');
assert(nodeComponent.includes('h(node.tag, node.attrs'), 'typed detail nodes must be rendered as native Vue VNodes');
assert(!component.includes('fetch('), 'Movie Details Vue component must not own network requests');
assert(!component.includes('history.'), 'Movie Details Vue component must not own browser History');
assert(!bridgeSource.includes('renderMovieDetailPageHTML'), 'Movie Details bridge must not consume the retired page HTML composer');
assert(!bridgeSource.includes('/api/'), 'Movie Details Vue bridge must not make provider/API requests');
assert(!bridgeSource.includes('history.pushState'), 'Movie Details Vue bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Movie Details Vue bridge must not own browser History writes');
assert(nodeModelSource.includes('ownership:"typed-node-model"'));
assert(nodeModelSource.includes('lower.startsWith("on")'), 'legacy fragment adapter must reject inline event attributes');

assert(!ui.includes('function renderMovieDetailPageHTML(state)'), 'obsolete Movie Details page HTML composer must be deleted after parity');
assert(!ui.includes('function renderMovieDetailPage(state)'), 'obsolete legacy Movie Details DOM wrapper must be deleted');
assert(ui.includes('function renderMovieActiveTabContentHTML(movie)'), 'shared detail fragments may remain until the final ui.js sweep');

assert(app.includes('function renderActiveMoviePage()'), 'app.js must remain Movie Details orchestration owner');
assert(app.includes('renderMovieDetailPage(moviePageState);'));
assert(app.includes('attachMovieDetailPageEvents();'), 'proven interaction binding remains intact in this bounded handoff');
assert(app.includes('async function openMoviePage(movieId,options={})'), 'movie request/navigation orchestration must remain in app.js');
assert(stateBridgeSource.includes('ownership:"legacy-read-only"'), 'Media Details state bridge must remain read-only');

assert(main.includes("import MovieDetails from './media-details/MovieDetails.vue';"));
assert(main.includes('createApp(MovieDetails, { model })'));
assert(main.includes('window.TVTrackerMovieDetailsVueBridge?.attachVueOwner(movieDetailsOwner);'));
assert(main.includes("document.getElementById('show-detail-content')"));

const stateBridgeIndex = template.indexOf("filename='js/media-details-state-bridge.js'");
const nodeModelIndex = template.indexOf("filename='js/media-details-node-model.js'");
const movieVueBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(stateBridgeIndex >= 0, 'Media Details state bridge must remain loaded');
assert(nodeModelIndex > stateBridgeIndex, 'typed detail node model must load after the read-only Media Details state bridge');
assert(movieVueBridgeIndex > nodeModelIndex, 'Movie Details bridge must load after the typed node model');
assert(routerIndex > movieVueBridgeIndex, 'Movie Details bridge must load before routing/startup can invoke movie rendering');

console.log('Vue-native Movie Details composition checks passed.');
