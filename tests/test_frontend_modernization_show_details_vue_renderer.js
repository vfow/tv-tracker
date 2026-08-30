const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/show-details-vue-bridge.js', 'utf8');
const component = fs.readFileSync('frontend/src/media-details/ShowDetails.vue', 'utf8');
const viewModel = fs.readFileSync('frontend/src/media-details/showViewModel.ts', 'utf8');
const main = fs.readFileSync('frontend/src/main.ts', 'utf8');
const ui = fs.readFileSync('static/js/ui.js', 'utf8');
const app = fs.readFileSync('static/js/app.js', 'utf8');
const template = fs.readFileSync('templates/index.html', 'utf8');

const calls = [];
const show = {tmdb_id:202,title:'Example Show'};
const options = {preview:true};
const context = {
    URL,
    window:{
        location:{pathname:'/app/list/watching',origin:'https://example.test'},
        DATA:{shows:{'202':{tmdb_id:202}}},
        renderShowDetailsPageHTML(nextShow,nextOptions){
            calls.push(['html', nextShow, nextOptions]);
            return `<div class="show-detail-page-inner">${nextShow.title}</div>`;
        },
        attachShowDetailsPageEvents(nextShow,tracked){ calls.push(['bind-page', nextShow, tracked]); },
        attachV2ShowModalEvents(nextShow){ calls.push(['bind-v2', nextShow]); }
    }
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

const bridge = context.window.TVTrackerShowDetailsVueBridge;
assert(bridge, 'Show Details Vue bridge should exist');
assert.strictEqual(bridge.ownership, 'vue-dom');
assert.strictEqual(context.window.renderShowDetailsPage, bridge.render, 'runtime Show Details DOM target must move to Vue bridge');
assert.deepStrictEqual(Object.keys(bridge).sort(), ['attachVueOwner','buildViewModel','ownership','render','renderLoadFailure']);

const model = bridge.buildViewModel(show,options);
assert.strictEqual(model.html, '<div class="show-detail-page-inner">Example Show</div>');
assert(Object.isFrozen(model), 'Show Details Vue view model must be immutable');
assert.strictEqual(calls[0][0], 'html');
assert.strictEqual(calls[0][1], show);
assert.deepStrictEqual(calls[0][2], options);

let rendered = null;
bridge.attachVueOwner({
    render(next){ rendered = next; },
    unmount(){}
});
context.window.renderShowDetailsPage(show,options);
assert(rendered, 'Vue Show Details owner should receive the render model');
assert.strictEqual(rendered.html, '<div class="show-detail-page-inner">Example Show</div>');
assert(calls.some(call=>call[0] === 'bind-page' && call[1] === show && call[2] === true), 'legacy Show Details page interactions must be rebound after Vue mount');
assert(calls.some(call=>call[0] === 'bind-v2' && call[1] === show), 'legacy V2 Show interactions must be rebound after Vue mount');

assert(viewModel.includes('export interface ShowDetailsViewModel'));
assert(viewModel.includes('readonly html: string'));
assert(viewModel.includes('ownership: "vue-dom"'));
assert(component.includes('data-tvtracker-show-details-owner="vue"'));
assert(component.includes('style="display: contents"'));
assert(component.includes('v-html="model.html"'));
assert(!component.includes('fetch('), 'Show Details Vue component must not own network requests');
assert(!component.includes('history.'), 'Show Details Vue component must not own browser History');
assert(!bridgeSource.includes('/api/'), 'Show Details Vue bridge must not make provider/API requests');
assert(!bridgeSource.includes('history.pushState'), 'Show Details Vue bridge must not own browser History writes');
assert(!bridgeSource.includes('history.replaceState'), 'Show Details Vue bridge must not own browser History writes');

assert(ui.includes('function renderShowDetailsPageHTML(show,options={})'), 'legacy show markup must be split into a DOM-free composition boundary');
assert(ui.includes('function renderShowDetailsPage(show,options={})'), 'legacy DOM wrapper remains physically present for rollback/readability');
const htmlStart = ui.indexOf('function renderShowDetailsPageHTML(show,options={})');
const wrapperStart = ui.indexOf('function renderShowDetailsPage(show,options={})', htmlStart + 1);
const htmlRenderer = ui.slice(htmlStart, wrapperStart);
assert(!htmlRenderer.includes('document.getElementById'), 'Show Details HTML renderer must be DOM-free');
assert(!htmlRenderer.includes('content.innerHTML'), 'Show Details HTML renderer must not mutate the DOM');
assert(htmlRenderer.includes('show-detail-page-inner'));
assert(htmlRenderer.includes('renderShowDetailActionControlsHTML(show,isTracked)'));
assert(htmlRenderer.includes('renderShowDetailTabsHTML(show)'));
assert(htmlRenderer.includes('renderShowDetailTabContentHTML(show)'));
assert(htmlRenderer.includes('renderV2SimilarShowsHTML(show)'));

const legacyWrapper = ui.slice(wrapperStart, ui.indexOf('function renderShowModal(show)', wrapperStart));
assert(legacyWrapper.includes('content.innerHTML = renderShowDetailsPageHTML(show,options);'));
assert(legacyWrapper.includes('attachShowDetailsPageEvents(show,isTracked);'));
assert(legacyWrapper.includes('attachV2ShowModalEvents(show);'));
assert(ui.includes('function attachShowDetailsPageEvents(show,isTracked)'), 'legacy show interaction orchestration must remain in ui.js');

assert(app.includes('function renderActiveShowDetailPage()'), 'app.js must remain Show Details orchestration owner');
assert(app.includes('renderShowDetailsPage(show,{preview:!(DATA.shows && DATA.shows[String(show.tmdb_id)])});'));
assert(app.includes('async function openShowDetailsPage(showId,options={})'), 'show request/navigation orchestration must remain in app.js');

assert(main.includes("import ShowDetails from './media-details/ShowDetails.vue';"));
assert(main.includes('createApp(ShowDetails, { model })'));
assert(main.includes('window.TVTrackerShowDetailsVueBridge?.attachVueOwner(showDetailsOwner);'));
assert(main.includes("document.getElementById('show-detail-content')"));
assert(main.includes('unmountMovieDetails();'));
assert(main.includes('unmountShowDetails();'));

const movieVueBridgeIndex = template.indexOf("filename='js/movie-details-vue-bridge.js'");
const showVueBridgeIndex = template.indexOf("filename='js/show-details-vue-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(movieVueBridgeIndex >= 0, 'Movie Details Vue bridge must remain loaded');
assert(showVueBridgeIndex > movieVueBridgeIndex, 'Show Details Vue bridge must load with the media-details Vue bridges after app.js');
assert(routerIndex > showVueBridgeIndex, 'Show Details Vue bridge must load before routing/startup can invoke show rendering');

console.log('Frontend modernization Vue Show Details renderer parity checks passed.');
