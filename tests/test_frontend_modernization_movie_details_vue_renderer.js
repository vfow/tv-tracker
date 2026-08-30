const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/movie-details-vue-bridge.js', 'utf8');
const stateBridgeSource = fs.readFileSync('static/js/media-details-state-bridge.js', 'utf8');
const component = fs.readFileSync('frontend/src/media-details/MovieDetails.vue', 'utf8');
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
    movie:{id:101,title:'Example Movie'}
};
const context = {
    URL,
    window:{
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        moviePageState:pageState,
        renderMovieDetailPageHTML(state){
            calls.push(['html', state]);
            return `<div class="movie-detail-page-inner">${state.movie.title}</div>`;
        },
        attachMovieDetailPageEvents(){ calls.push(['bind']); },
        updateShellTitle(){ calls.push(['title']); }
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerMovieDetailsVueBridge;
assert(bridge, 'Movie Details Vue bridge should exist');
assert.strictEqual(bridge.ownership, 'vue-dom');
assert.strictEqual(context.window.renderMovieDetailPage, bridge.render, 'runtime Movie Details DOM target must move to Vue bridge');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['attachVueOwner','buildViewModel','ownership','render','renderLoadFailure']);

const model = bridge.buildViewModel(pageState);
assert.strictEqual(model.html, '<div class="movie-detail-page-inner">Example Movie</div>');
assert(Object.isFrozen(model), 'Movie Details Vue view model must be immutable');
assert.strictEqual(calls[0][0], 'html');
assert.strictEqual(calls[0][1], pageState, 'legacy state object should be passed only to pure HTML composition');

let rendered = null;
bridge.attachVueOwner({
    render(next){ rendered = next; },
    unmount(){}
});
context.window.renderMovieDetailPage(pageState);
assert(rendered, 'Vue Movie Details owner should receive the render model');
assert.strictEqual(rendered.html, '<div class="movie-detail-page-inner">Example Movie</div>');

assert(viewModel.includes('export interface MovieDetailsViewModel'));
assert(viewModel.includes('readonly html: string'));
assert(viewModel.includes('ownership: "vue-dom"'));
assert(component.includes('data-tvtracker-movie-details-owner="vue"'));
assert(component.includes('style="display: contents"'));
assert(component.includes('v-html="model.html"'));
assert(!component.includes('fetch('), 'Movie Details Vue component must not own network requests');
assert(!component.includes('history.'), 'Movie Details Vue component must not own browser History');
assert(!bridgeSource.includes('/api/'), 'Movie Details Vue bridge must not make provider/API requests');
assert(!bridgeSource.includes('history.pushState'), 'Movie Details Vue bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Movie Details Vue bridge must not own browser History writes');

assert(ui.includes('function renderMovieDetailPageHTML(state)'), 'legacy movie markup must be split into a pure composition boundary');
assert(ui.includes('function renderMovieDetailPage(state)'), 'legacy DOM wrapper remains physically present for rollback/readability');
const htmlStart = ui.indexOf('function renderMovieDetailPageHTML(state)');
const wrapperStart = ui.indexOf('function renderMovieDetailPage(state)', htmlStart + 1);
const htmlRenderer = ui.slice(htmlStart, wrapperStart);
assert(!htmlRenderer.includes('document.getElementById'), 'pure movie HTML renderer must be DOM-free');
assert(!htmlRenderer.includes('content.innerHTML'), 'pure movie HTML renderer must not mutate the DOM');
assert(htmlRenderer.includes('movie-detail-page-inner'));
assert(htmlRenderer.includes('renderMovieActionButtonsHTML(movie)'));
assert(htmlRenderer.includes('renderMovieTabsHTML()'));
assert(htmlRenderer.includes('renderMovieActiveTabContentHTML(movie)'));

assert(app.includes('function renderActiveMoviePage()'), 'app.js must remain Movie Details orchestration owner');
assert(app.includes('renderMovieDetailPage(moviePageState);'));
assert(app.includes('attachMovieDetailPageEvents();'), 'legacy interaction binding remains intact in this bounded handoff');
assert(app.includes('async function openMoviePage(movieId,options={})'), 'movie request/navigation orchestration must remain in app.js');
assert(stateBridgeSource.includes('ownership:"legacy-read-only"'), 'Media Details state bridge must remain read-only');

assert(main.includes("import MovieDetails from './media-details/MovieDetails.vue';"));
assert(main.includes('createApp(MovieDetails, { model })'));
assert(main.includes('window.TVTrackerMovieDetailsVueBridge?.attachVueOwner(movieDetailsOwner);'));
assert(main.includes("document.getElementById('show-detail-content')"));

const stateBridgeIndex = template.indexOf("filename='js/media-details-state-bridge.js'");
const movieVueBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(stateBridgeIndex >= 0, 'Media Details state bridge must remain loaded');
assert(movieVueBridgeIndex > stateBridgeIndex, 'Movie Details Vue bridge must load after the read-only Media Details state bridge');
assert(routerIndex > movieVueBridgeIndex, 'Movie Details Vue bridge must load before routing/startup can invoke movie rendering');

console.log('Frontend modernization Vue Movie Details renderer parity checks passed.');
