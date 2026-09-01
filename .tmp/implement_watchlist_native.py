from pathlib import Path
import re

ROOT = Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing replacement anchor: {label}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique replacement anchor: {label} ({text.count(old)})')
    return text.replace(old, new, 1)


def find_function_bounds(source, name):
    match = re.search(r'function\s+' + re.escape(name) + r'\s*\(', source)
    if not match:
        raise SystemExit(f'missing function: {name}')
    i = source.find('(', match.end() - 1)
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    body = None
    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ''
        if line_comment:
            if ch == '\n': line_comment = False
            i += 1; continue
        if block_comment:
            if ch == '*' and nxt == '/': block_comment = False; i += 2
            else: i += 1
            continue
        if quote:
            if escaped: escaped = False
            elif ch == '\\': escaped = True
            elif ch == quote: quote = None
            i += 1; continue
        if ch == '/' and nxt == '/': line_comment = True; i += 2; continue
        if ch == '/' and nxt == '*': block_comment = True; i += 2; continue
        if ch in ('"', "'", '`'): quote = ch; i += 1; continue
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                body = source.find('{', i + 1)
                break
        i += 1
    if body is None:
        raise SystemExit(f'missing body start: {name}')
    i = body
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ''
        if line_comment:
            if ch == '\n': line_comment = False
            i += 1; continue
        if block_comment:
            if ch == '*' and nxt == '/': block_comment = False; i += 2
            else: i += 1
            continue
        if quote:
            if escaped: escaped = False
            elif ch == '\\': escaped = True
            elif ch == quote: quote = None
            i += 1; continue
        if ch == '/' and nxt == '/': line_comment = True; i += 2; continue
        if ch == '/' and nxt == '*': block_comment = True; i += 2; continue
        if ch in ('"', "'", '`'): quote = ch; i += 1; continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return match.start(), i + 1
        i += 1
    raise SystemExit(f'unclosed function: {name}')


def remove_function(source, name):
    start, end = find_function_bounds(source, name)
    while end < len(source) and source[end] in ' \t':
        end += 1
    while end < len(source) and source[end] == '\n':
        end += 1
    return source[:start] + source[end:]


# ----- Typed contracts -----
contracts_path = ROOT / 'frontend/src/tracker-lists/contracts.ts'
contracts = contracts_path.read_text()
if 'export type TrackerListActionKind' not in contracts:
    block = '''export type TrackerListActionKind = "mark" | "watching";

export interface TrackerListActionViewModel {
  readonly kind: TrackerListActionKind;
  readonly label: string;
  readonly disabled: boolean;
}

export interface TrackerListCardViewModel {
  readonly id: string;
  readonly filter: TrackerListFilter;
  readonly title: string;
  readonly route: string;
  readonly posterUrl: string;
  readonly posterFallback: string;
  readonly episodeText: string;
  readonly completed: boolean;
  readonly episodeTitle: string;
  readonly newBadge: boolean;
  readonly action: TrackerListActionViewModel | null;
}

export interface TrackerListEmptyViewModel {
  readonly title: string;
  readonly text: string;
}

export interface TrackerListsViewModel {
  readonly surface: "watchlist";
  readonly activeFilter: TrackerListFilter;
  readonly routeSlug: TrackerListRouteSlug;
  readonly query: string;
  readonly items: readonly TrackerListCardViewModel[];
  readonly emptyState: TrackerListEmptyViewModel | null;
}

export interface TrackerListsRendererActions {
  perform(kind: TrackerListActionKind, showId: string, target: HTMLElement | null): Promise<void>;
}

export interface TrackerListsVueOwner {
  render(model: TrackerListsViewModel): void;
  unmount(): void;
}

export interface TrackerListsVueBridge {
  readonly ownership: "vue-dom";
  readonly actions: TrackerListsRendererActions;
  attachVueOwner(owner: TrackerListsVueOwner): void;
  renderWatchlist(): Promise<boolean>;
  refreshWatchlistShows(showIds?: readonly string[]): Promise<boolean>;
}

'''
    contracts = replace_once(contracts, 'export const TRACKER_LIST_FILTERS', block + 'export const TRACKER_LIST_FILTERS', 'tracker contracts insertion')
    contracts_path.write_text(contracts)

# ----- Native Watchlist component -----
component_path = ROOT / 'frontend/src/tracker-lists/TrackerListsSurface.vue'
component_path.write_text('''<script setup lang="ts">
import { ref } from 'vue';

import type {
  TrackerListCardViewModel,
  TrackerListsRendererActions,
  TrackerListsViewModel,
} from './contracts';

const props = defineProps<{
  model: TrackerListsViewModel;
  actions: TrackerListsRendererActions;
}>();

const pendingShowId = ref('');

async function runAction(item: TrackerListCardViewModel, event: MouseEvent): Promise<void> {
  if (!item.action || item.action.disabled || pendingShowId.value) return;
  pendingShowId.value = item.id;
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  try {
    await props.actions.perform(item.action.kind, item.id, target);
  } finally {
    pendingShowId.value = '';
  }
}
</script>

<template>
  <div data-tvtracker-tracker-lists-owner="vue-watchlist" style="display: contents">
    <div v-if="model.emptyState" class="empty-state">
      <h2>{{ model.emptyState.title }}</h2>
      <p>{{ model.emptyState.text }}</p>
    </div>

    <article
      v-for="item in model.items"
      v-else
      :key="item.id"
      :class="['show', 'watchlist-card', `watchlist-card--${item.filter}`]"
      :data-show-id="item.id"
    >
      <a
        class="watchlist-card-link"
        :href="item.route"
        :aria-label="`Open ${item.title || 'show'} details`"
      >
        <img
          v-if="item.posterUrl"
          class="poster"
          :src="item.posterUrl"
          :alt="`${item.title || 'Show'} poster`"
          loading="lazy"
        >
        <div v-else class="poster-placeholder watchlist-poster-placeholder" aria-hidden="true">
          <span>{{ item.posterFallback }}</span>
        </div>

        <div class="info watchlist-info">
          <div class="watchlist-title-row">
            <div class="title">{{ item.title }}</div>
          </div>

          <div class="episode">
            <span v-if="item.completed" class="completed-label">✓ Completed</span>
            <template v-else>{{ item.episodeText }}</template>
          </div>

          <div v-if="item.episodeTitle" class="episode-title">“{{ item.episodeTitle }}”</div>

          <div v-if="item.newBadge" class="watchlist-new-badge-row">
            <span class="new-badge watchlist-new-badge">NEW</span>
          </div>
        </div>
      </a>

      <button
        v-if="item.action"
        type="button"
        :class="['check', 'watchlist-action', `watchlist-action--${item.action.kind}`]"
        :data-watchlist-action="item.action.kind"
        :aria-label="item.action.label"
        :title="item.action.label"
        :disabled="item.action.disabled || pendingShowId === item.id"
        @click.stop="runAction(item, $event)"
      ></button>
    </article>
  </div>
</template>
''')

# ----- Read-only structured view model -----
state_path = ROOT / 'static/js/tracker-lists-state-bridge.js'
state = state_path.read_text()
if 'function viewModel()' not in state:
    old = '''    global.TVTrackerTrackerListsStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });'''
    new = '''    function imageURL(path,size="w500"){
        const value = cleanText(path);
        if(!value) return "";
        if(/^https?:\\/\\//i.test(value)) return value;
        if(typeof global.trackerImageURL === "function"){
            return cleanText(global.trackerImageURL(value,size));
        }
        return "https://image.tmdb.org/t/p/" + String(size || "w500") + value;
    }

    function posterFallback(show){
        const words = cleanText(show && (show.title || show.name) || "TV")
        .split(/\\s+/)
        .filter(Boolean)
        .slice(0,2);
        const initials = words.map(word=>word.charAt(0)).join("").toUpperCase();
        return initials || "TV";
    }

    function actionViewModel(show,displayFilter,nextEp){
        const title = cleanText(show && show.title) || "show";
        if(displayFilter === "finished") return null;
        if(displayFilter === "paused" || displayFilter === "plan" || displayFilter === "dropped"){
            return Object.freeze({kind:"watching",label:`Change ${title} to Watching`,disabled:false});
        }
        if(!nextEp) return null;
        const isAvailable = Boolean(
            nextEp.air_date &&
            typeof global.isEpisodeLoggable === "function" &&
            global.isEpisodeLoggable(nextEp,show,nextEp.season)
        );
        const releaseDate = nextEp.air_date && typeof global.formatAirDate === "function"
            ? cleanText(global.formatAirDate(nextEp.air_date,nextEp,show))
            : "";
        const label = isAvailable
            ? `Mark ${title} Season ${nextEp.season}, Episode ${nextEp.episode} watched`
            : releaseDate
                ? `${title} Season ${nextEp.season}, Episode ${nextEp.episode} is available ${releaseDate}`
                : `${title} episode release date is unavailable`;
        return Object.freeze({kind:"mark",label,disabled:!isAvailable});
    }

    function cardViewModel(show,displayFilter){
        if(!show || typeof show !== "object") return null;
        const id = cleanId(show.tmdb_id || show.id);
        if(!id) return null;
        const title = cleanText(show.title || show.name);
        const isCompletedFilter = displayFilter === "finished";
        const isDroppedFilter = displayFilter === "dropped";
        const nextEp = (!isCompletedFilter && !isDroppedFilter && typeof global.getNextEpisode === "function")
            ? global.getNextEpisode(show)
            : null;
        const droppedStopEpisode = isDroppedFilter && typeof global.getLatestWatchedEpisode === "function"
            ? global.getLatestWatchedEpisode(show)
            : null;
        const droppedStopEpisodeData = droppedStopEpisode && typeof global.getEpisodeData === "function"
            ? global.getEpisodeData(show,droppedStopEpisode.season,droppedStopEpisode.episode)
            : null;
        const newBadge = Boolean(
            displayFilter === "watching" &&
            nextEp &&
            typeof global.isNewUpcomingEpisode === "function" &&
            global.isNewUpcomingEpisode(show,{
                season_number:nextEp.season,
                episode_number:nextEp.episode,
                air_date:nextEp.air_date,
                air_time:nextEp.air_time || "",
                air_timestamp:nextEp.air_timestamp || ""
            })
        );
        const episodeText = isCompletedFilter
            ? "✓ Completed"
            : isDroppedFilter && droppedStopEpisode
                ? `Stopped after Season ${droppedStopEpisode.season}, Episode ${droppedStopEpisode.episode}`
                : isDroppedFilter
                    ? "Dropped"
                    : displayFilter === "plan" && nextEp
                        ? `Start with Season ${nextEp.season}, Episode ${nextEp.episode}`
                        : displayFilter === "paused" && nextEp
                            ? `Next: Season ${nextEp.season}, Episode ${nextEp.episode}`
                            : nextEp
                                ? `Season ${nextEp.season}, Episode ${nextEp.episode}`
                                : typeof global.getNoNextEpisodeText === "function"
                                    ? cleanText(global.getNoNextEpisodeText(show))
                                    : "";
        const episodeTitle = isDroppedFilter && droppedStopEpisodeData && droppedStopEpisodeData.name
            ? cleanText(droppedStopEpisodeData.name)
            : nextEp && nextEp.name
                ? cleanText(nextEp.name)
                : "";
        const route = typeof global.getShowDetailRoute === "function"
            ? cleanText(global.getShowDetailRoute(show.tmdb_id || show.id,title))
            : `/app/list/${routeSlug(displayFilter)}`;
        return Object.freeze({
            id,
            filter:displayFilter,
            title,
            route,
            posterUrl:imageURL(show.poster_path,"w500"),
            posterFallback:posterFallback(show),
            episodeText,
            completed:isCompletedFilter,
            episodeTitle,
            newBadge,
            action:actionViewModel(show,displayFilter,nextEp)
        });
    }

    function filterLabel(filter){
        const labels = {watching:"Watching",paused:"Paused",finished:"Completed",plan:"Plan To Watch",dropped:"Dropped"};
        return labels[filter] || "Watching";
    }

    function emptyStateFor(state,query){
        if(query){
            const filterText = [state.genre,state.network,state.year]
            .filter(value=>value && value !== "all")
            .join(" • ");
            return Object.freeze({
                title:`No matches in ${filterLabel(state.activeFilter)}.`,
                text:filterText ? `No show matches ${filterText} in this list.` : "No show matches the selected filters."
            });
        }
        const messages = {
            watching:["Nothing in watching","Add a show when you start watching."],
            paused:["No paused shows","Paused shows will appear here."],
            finished:["No completed shows","Finished shows will appear here."],
            plan:["No planned shows","Shows saved for later will appear here."],
            dropped:["No dropped shows","Shows you stop watching will appear here."]
        };
        const message = messages[state.activeFilter] || messages.watching;
        return Object.freeze({title:message[0],text:message[1]});
    }

    function viewModel(){
        const state = snapshot();
        const legacyView = typeof global.getWatchlistShowsForCurrentView === "function"
            ? global.getWatchlistShowsForCurrentView()
            : null;
        const rawShows = legacyView && Array.isArray(legacyView.shows)
            ? legacyView.shows
            : Object.values(global.DATA && global.DATA.shows || {}).filter(show=>normalizeFilter(show && show.status) === state.activeFilter);
        const query = legacyView ? cleanText(legacyView.query) : state.query;
        const items = rawShows.map(show=>cardViewModel(show,state.activeFilter)).filter(Boolean);
        return Object.freeze({
            surface:"watchlist",
            activeFilter:state.activeFilter,
            routeSlug:state.routeSlug,
            query,
            items:Object.freeze(items),
            emptyState:items.length ? null : emptyStateFor(state,query)
        });
    }

    global.TVTrackerTrackerListsStateBridge = Object.freeze({
        snapshot,
        viewModel,
        ownership:"legacy-read-only"
    });'''
    state = replace_once(state, old, new, 'tracker state bridge export')
    state_path.write_text(state)

# ----- Runtime bridge: remove legacy HTML staging and publish structured model -----
runtime_path = ROOT / 'static/js/upcoming-notifications-vue-bridge.js'
runtime = runtime_path.read_text()
runtime = runtime.replace('    const legacyRenderWatchlist = typeof global.renderWatchlist === "function" ? global.renderWatchlist : null;\n', '')
if 'let trackerListsVueOwner = null;' not in runtime:
    runtime = replace_once(runtime, '    let vueOwner = null;\n', '    let vueOwner = null;\n    let trackerListsVueOwner = null;\n', 'tracker owner state')
for fn in ('attachWatchlistInteractions','composeWatchlistHTML','renderWatchlist','refreshWatchlistShows'):
    if re.search(r'function\s+' + re.escape(fn) + r'\s*\(', runtime) or re.search(r'async\s+function\s+' + re.escape(fn) + r'\s*\(', runtime):
        # helper expects the function keyword and works for async because the match starts at function, leaving async behind.
        start, end = find_function_bounds(runtime, fn)
        async_start = runtime.rfind('async ', max(0,start-8), start)
        if async_start >= 0 and runtime[async_start:start].strip() == 'async':
            start = async_start
        while end < len(runtime) and runtime[end] in ' \t\n': end += 1
        runtime = runtime[:start] + runtime[end:]

watchlist_block = '''    function buildWatchlistModel(){
        const stateBridge = global.TVTrackerTrackerListsStateBridge;
        if(!stateBridge || stateBridge.ownership !== "legacy-read-only" || typeof stateBridge.viewModel !== "function") return null;
        try{
            return stateBridge.viewModel();
        }catch(error){
            return null;
        }
    }

    function renderWatchlistLoadFailure(){
        const root = rootFor("watchlist");
        if(!root) return;
        root.innerHTML = '<div class="empty-state" data-tvtracker-watchlist-vue-load-failed="true" role="alert"><h2>List unavailable</h2><p>Reload the page to try again.</p></div>';
    }

    async function performTrackerListAction(kind,showId,target){
        const id = String(showId || "").trim();
        if(!id) return;
        if(kind === "mark"){
            if(target && typeof global.playCheckSuccessAnimation === "function"){
                await global.playCheckSuccessAnimation(target);
            }
            if(typeof global.markNextEpisode === "function") await global.markNextEpisode(id);
            return;
        }
        if(kind === "watching" && typeof global.updateShowStatus === "function"){
            await global.updateShowStatus(id,"watching");
        }
    }

    const trackerListsActions = Object.freeze({perform:performTrackerListAction});

    function attachTrackerListsVueOwner(owner){
        if(!owner || typeof owner.render !== "function" || typeof owner.unmount !== "function"){
            throw new TypeError("Invalid Tracker Lists Vue owner");
        }
        trackerListsVueOwner = owner;
    }

    async function renderWatchlist(){
        if(typeof global.renderLibrarySearchControl === "function") global.renderLibrarySearchControl();
        const model = buildWatchlistModel();
        if(!model){
            renderWatchlistLoadFailure();
            return false;
        }
        if(!trackerListsVueOwner){
            const loaded = await loadVueOwner("watchlist");
            if(!loaded || !trackerListsVueOwner){
                renderWatchlistLoadFailure();
                return false;
            }
        }
        trackerListsVueOwner.render(model);
        const root = rootFor("watchlist");
        if(root && root.dataset){
            root.dataset.tvtrackerTrackerListsOwner = "vue-watchlist";
        }
        return true;
    }

    async function refreshWatchlistShows(){
        return renderWatchlist();
    }

'''
runtime = replace_once(runtime, '    async function renderUpcoming(startBackgroundRefresh=true){', watchlist_block + '    async function renderUpcoming(startBackgroundRefresh=true){', 'insert native watchlist runtime')
old_bridge = '''    const trackerListsBridge = Object.freeze({
        renderWatchlist,
        refreshWatchlistShows,
        ownership:"vue-dom"
    });'''
new_bridge = '''    const trackerListsBridge = Object.freeze({
        attachVueOwner:attachTrackerListsVueOwner,
        renderWatchlist,
        refreshWatchlistShows,
        actions:trackerListsActions,
        ownership:"vue-dom"
    });'''
runtime = replace_once(runtime, old_bridge, new_bridge, 'tracker bridge export')
runtime_path.write_text(runtime)

# ----- Vue entrypoint -----
main_path = ROOT / 'frontend/src/main.ts'
main = main_path.read_text()
if "TrackerListsSurface from './tracker-lists/TrackerListsSurface.vue'" not in main:
    main = replace_once(
        main,
        "import type { SearchRendererActions, SearchViewModel } from './search-discover/searchViewModel';\n",
        "import type { SearchRendererActions, SearchViewModel } from './search-discover/searchViewModel';\nimport TrackerListsSurface from './tracker-lists/TrackerListsSurface.vue';\nimport type { TrackerListsVueBridge, TrackerListsVueOwner, TrackerListsViewModel } from './tracker-lists/contracts';\n",
        'tracker imports',
    )
    main = replace_once(
        main,
        '    TVTrackerDiscoverVueBridge?: DiscoverBridge;\n',
        '    TVTrackerDiscoverVueBridge?: DiscoverBridge;\n    TVTrackerTrackerListsVueBridge?: TrackerListsVueBridge;\n',
        'tracker global bridge',
    )
    main = replace_once(
        main,
        'let notificationsRoot: Element | null = null;\n',
        'let notificationsRoot: Element | null = null;\nlet trackerListsApp: VueApp<Element> | null = null;\nlet trackerListsRoot: Element | null = null;\n',
        'tracker app state',
    )
    unmount_block = '''function unmountTrackerLists(): void {
  if (trackerListsApp) trackerListsApp.unmount();
  trackerListsApp = null;
  trackerListsRoot = null;
}

'''
    main = replace_once(main, 'function unmountUpcomingNotifications(surface?: UpcomingNotificationsSurfaceName): void {', unmount_block + 'function unmountUpcomingNotifications(surface?: UpcomingNotificationsSurfaceName): void {', 'tracker unmount')
    owner_block = '''const trackerListsOwner: TrackerListsVueOwner = Object.freeze({
  render(model: TrackerListsViewModel): void {
    const root = document.getElementById('show-list');
    const bridge = window.TVTrackerTrackerListsVueBridge;
    if (!root || !bridge) return;
    unmountUpcomingNotifications('upcoming');
    unmountTrackerLists();
    root.replaceChildren();
    trackerListsRoot = root;
    trackerListsApp = createApp(TrackerListsSurface, { model, actions: bridge.actions });
    trackerListsApp.mount(root);
    root.setAttribute('data-tvtracker-tracker-lists-owner', 'vue-watchlist');
  },
  unmount: unmountTrackerLists
});

'''
    main = replace_once(main, 'const upcomingNotificationsOwner: UpcomingNotificationsVueOwner = Object.freeze({', owner_block + 'const upcomingNotificationsOwner: UpcomingNotificationsVueOwner = Object.freeze({', 'tracker owner')
    main = replace_once(
        main,
        "    if (!root) return;\n    unmountUpcomingNotifications(model.surface);\n",
        "    if (!root) return;\n    if (model.surface === 'upcoming') unmountTrackerLists();\n    unmountUpcomingNotifications(model.surface);\n",
        'upcoming unmount tracker',
    )
    main = replace_once(
        main,
        'window.TVTrackerDiscoverVueBridge?.attachVueOwner(discoverOwner);\n',
        'window.TVTrackerDiscoverVueBridge?.attachVueOwner(discoverOwner);\nwindow.TVTrackerTrackerListsVueBridge?.attachVueOwner(trackerListsOwner);\n',
        'attach tracker owner',
    )
    main_path.write_text(main)

# ----- Remove obsolete Watchlist DOM composer ownership from ui.js -----
ui_path = ROOT / 'static/js/ui.js'
ui = ui_path.read_text()
for fn in ('getWatchlistPosterFallback','getWatchlistActionConfig','createWatchlistCard','renderWatchlist','refreshWatchlistShows'):
    if re.search(r'function\s+' + re.escape(fn) + r'\s*\(', ui):
        ui = remove_function(ui, fn)
ui_path.write_text(ui)

# ----- Regression contracts -----
completion = ROOT / 'tests/test_frontend_modernization_tracker_lists_completion.js'
completion.write_text(r'''const assert = require('assert');
const fs = require('fs');

const runtime = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');
const stateBridge = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const vue = fs.readFileSync('frontend/src/tracker-lists/TrackerListsSurface.vue','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md','utf8');

assert(!runtime.includes('legacyRenderWatchlist'));
assert(!runtime.includes('function composeWatchlistHTML()'));
assert(!runtime.includes('attachWatchlistInteractions'));
assert(runtime.includes('stateBridge.viewModel()'));
assert(runtime.includes('attachVueOwner:attachTrackerListsVueOwner'));
assert(runtime.includes('actions:trackerListsActions'));
assert(runtime.includes('await global.markNextEpisode(id)'));
assert(runtime.includes('await global.updateShowStatus(id,"watching")'));
assert(stateBridge.includes('function viewModel()'));
assert(stateBridge.includes('getWatchlistShowsForCurrentView'));
assert(!stateBridge.includes('document.'));
assert(!stateBridge.includes('saveData('));
assert(!ui.includes('function createWatchlistCard('));
assert(!ui.includes('function getWatchlistActionConfig('));
assert(!ui.includes('function getWatchlistPosterFallback('));
assert(!ui.includes('function renderWatchlist('));
assert(!ui.includes('function refreshWatchlistShows('));
assert(ui.includes('function getWatchlistShowsForCurrentView()'));
assert(vue.includes('data-tvtracker-tracker-lists-owner="vue-watchlist"'));
assert(vue.includes('class="watchlist-card-link"'));
assert(vue.includes('watchlist-action--${item.action.kind}'));
assert(!vue.includes('v-html'));
assert(architecture.includes('Vue-native structured view model'));
assert(architecture.includes('legacy Watchlist HTML composer has been removed'));

console.log('Tracker Lists native composition ownership contract passed.');
''')

renderer = ROOT / 'tests/test_frontend_modernization_tracker_lists_vue_renderer.js'
renderer.write_text(r'''const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const stateSource = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const runtimeSource = fs.readFileSync('static/js/upcoming-notifications-vue-bridge.js','utf8');

const root = {innerHTML:'',dataset:{},querySelector(){return null;},querySelectorAll(){return [];}};
let ownerModel = null;
let libraryControls = 0;
let marked = '';
let statusUpdate = null;
let animated = 0;
const show = {tmdb_id:42,title:'Example Show',status:'watching',poster_path:'/poster.jpg'};
const context = {
  console, URL, Promise, Object, String, Number, Math, Set, Map,
  window:{
    DATA:{shows:{'42':show},movies:{},profile:{favorite_shows:[],favorite_movies:[]}},
    activeFilter:'watching',librarySearchQuery:'',libraryGenreFilter:'all',libraryNetworkFilter:'all',libraryYearFilter:'all',librarySortMode:'default',
    getWatchlistShowsForCurrentView(){ return {shows:[show],query:''}; },
    getNextEpisode(){ return {season:2,episode:3,name:'The Next One',air_date:'2026-08-31'}; },
    getLatestWatchedEpisode(){ return null; },
    getEpisodeData(){ return {}; },
    isNewUpcomingEpisode(){ return true; },
    getNoNextEpisodeText(){ return 'No next episode'; },
    isEpisodeLoggable(){ return true; },
    formatAirDate(){ return 'Aug 31'; },
    getShowDetailRoute(){ return '/app/show/42-example-show'; },
    trackerImageURL(path,size){ return `https://img.test/${size}${path}`; },
    renderLibrarySearchControl(){ libraryControls += 1; },
    async markNextEpisode(id){ marked = id; },
    async updateShowStatus(id,status){ statusUpdate = [id,status]; },
    async playCheckSuccessAnimation(){ animated += 1; },
    document:{getElementById(id){ return id === 'show-list' ? root : null; },querySelector(){return null;},querySelectorAll(){return []; }},
    location:{pathname:'/app/list/watching',origin:'https://example.test'},
    renderUpcoming(){},TVTrackerNotifications:null,setTimeout,PointerEvent:function PointerEvent(){}
  }
};
vm.createContext(context);
vm.runInContext(stateSource,context);
vm.runInContext(runtimeSource,context);
const bridge = context.window.TVTrackerTrackerListsVueBridge;
bridge.attachVueOwner({render(model){ ownerModel = model; },unmount(){}});

(async()=>{
  assert.strictEqual(await bridge.renderWatchlist(),true);
  assert.strictEqual(libraryControls,1);
  assert(ownerModel);
  assert.strictEqual(ownerModel.surface,'watchlist');
  assert.strictEqual(ownerModel.items.length,1);
  const item = ownerModel.items[0];
  assert.strictEqual(item.id,'42');
  assert.strictEqual(item.route,'/app/show/42-example-show');
  assert.strictEqual(item.episodeText,'Season 2, Episode 3');
  assert.strictEqual(item.episodeTitle,'The Next One');
  assert.strictEqual(item.newBadge,true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(item.action)),{kind:'mark',label:'Mark Example Show Season 2, Episode 3 watched',disabled:false});
  assert.strictEqual(root.dataset.tvtrackerTrackerListsOwner,'vue-watchlist');

  await bridge.actions.perform('mark','42',{});
  assert.strictEqual(marked,'42');
  assert.strictEqual(animated,1);
  await bridge.actions.perform('watching','42',null);
  assert.deepStrictEqual(statusUpdate,['42','watching']);

  assert.strictEqual(await bridge.refreshWatchlistShows(['42']),true);
  assert.strictEqual(libraryControls,2);
  console.log('Tracker Lists structured Vue renderer contract passed.');
})().catch(error=>{ console.error(error); process.exitCode = 1; });
''')

parity = ROOT / 'tests/test_frontend_modernization_tracker_lists_status_parity.js'
parity.write_text(r'''const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const router = fs.readFileSync('static/js/app-router.js','utf8');
const source = fs.readFileSync('static/js/tracker-lists-state-bridge.js','utf8');
const cases = [
  {filter:'watching',slug:'watching',episode:'Season 1, Episode 2',action:'mark'},
  {filter:'paused',slug:'paused',episode:'Next: Season 1, Episode 2',action:'watching'},
  {filter:'finished',slug:'completed',episode:'✓ Completed',action:null},
  {filter:'plan',slug:'plan-to-watch',episode:'Start with Season 1, Episode 2',action:'watching'},
  {filter:'dropped',slug:'dropped',episode:'Stopped after Season 1, Episode 1',action:'watching'},
];
const compactRouter = router.replace(/\s+/g,'');
for(const item of cases){
  assert(compactRouter.includes(`"${item.slug}":"${item.filter}"`));
  assert(compactRouter.includes(`${item.filter}:"${item.slug}"`) || compactRouter.includes(`"${item.filter}":"${item.slug}"`));
}

const show = {tmdb_id:7,title:'Parity Show',status:'watching'};
const context = {window:{
  DATA:{shows:{'7':show},movies:{},profile:{favorite_shows:[],favorite_movies:[]}},
  activeFilter:'watching',librarySearchQuery:'',libraryGenreFilter:'all',libraryNetworkFilter:'all',libraryYearFilter:'all',librarySortMode:'default',
  getWatchlistShowsForCurrentView(){ return {shows:[show],query:''}; },
  getNextEpisode(){ return {season:1,episode:2,name:'Next',air_date:'2026-08-31'}; },
  getLatestWatchedEpisode(){ return {season:1,episode:1}; },
  getEpisodeData(){ return {name:'Previous'}; },
  isNewUpcomingEpisode(){ return false; },
  getNoNextEpisodeText(){ return 'No next episode'; },
  isEpisodeLoggable(){ return true; },
  formatAirDate(){ return 'Aug 31'; },
  getShowDetailRoute(){ return '/app/show/7-parity-show'; },
  trackerImageURL(){ return ''; }
}};
vm.createContext(context);
vm.runInContext(source,context);
const bridge = context.window.TVTrackerTrackerListsStateBridge;
for(const item of cases){
  context.window.activeFilter = item.filter;
  show.status = item.filter;
  const state = bridge.snapshot();
  const model = bridge.viewModel();
  assert.strictEqual(state.routeSlug,item.slug);
  assert.strictEqual(model.routeSlug,item.slug);
  assert.strictEqual(model.items[0].filter,item.filter);
  assert.strictEqual(model.items[0].episodeText,item.episode);
  assert.strictEqual(model.items[0].completed,item.filter === 'finished');
  assert.strictEqual(model.items[0].action ? model.items[0].action.kind : null,item.action);
}
assert.strictEqual(bridge.ownership,'legacy-read-only');
assert(!source.includes('document.'));
assert(!source.includes('saveData('));
console.log('Tracker Lists five-status native view-model parity contract passed.');
''')

# source-contract ownership assertion follows the renderer into Vue.
source_contracts = ROOT / 'tests/test_source_contracts.py'
source_text = source_contracts.read_text()
source_text = source_text.replace(
    "self.assertIn('class=\"watchlist-card-link\" href=', ui)",
    "self.assertIn('class=\"watchlist-card-link\"', self.read('frontend/src/tracker-lists/TrackerListsSurface.vue'))",
)
source_contracts.write_text(source_text)

# ----- Architecture docs -----
tracker_doc = ROOT / 'docs/architecture/FRONTEND_MODERNIZATION_TRACKER_LISTS.md'
tracker_doc.write_text('''# Frontend Modernization: Watchlist / Tracker Lists

## Scope

The protected `/app/list/<status>` surfaces now use a Vue-native structured view model. Tracker truth and mutations remain in the proven legacy service layer; legacy Watchlist HTML composition is no longer part of the runtime path.

## Current ownership

- `static/js/app.js` remains authoritative for `DATA.shows`, tracker mutations, durable save orchestration, list/filter state, and persistence semantics.
- `static/js/tracker-lists-state-bridge.js` is a read-only boundary. Its `viewModel()` reuses the established read-only filter/sort/progress helpers and produces structured card/action/empty-state data without touching the DOM, network, storage, or navigation.
- `frontend/src/tracker-lists/TrackerListsSurface.vue` is the Vue-native Watchlist renderer. It renders the existing Watchlist classes and action affordances without `v-html`.
- `static/js/upcoming-notifications-vue-bridge.js` publishes the Watchlist render entrypoint and mutation actions, but no longer captures or stages the legacy `renderWatchlist` HTML composer.
- `app-router.js` remains the sole History API owner.

## Preserved behavior

The five canonical status routes remain:

- `watching` → `/app/list/watching`
- `paused` → `/app/list/paused`
- `finished` → `/app/list/completed`
- `plan` → `/app/list/plan-to-watch`
- `dropped` → `/app/list/dropped`

The existing library query/genre/network/year/sort selection continues to flow through `getWatchlistShowsForCurrentView()`, including the established adult-filter read-time wrapper. Next-episode text, completed/dropped presentation, new-episode badges, poster fallbacks, routes, and action availability are mapped into the structured view model using the existing domain helpers.

Mutation ownership is unchanged:

- `mark` delegates to `markNextEpisode` after the existing success animation;
- `watching` delegates to `updateShowStatus(..., "watching")`;
- durable save/pending-save behavior remains in the established services.

## Completion status

The Watchlist Vue-native structured view model is complete. The legacy Watchlist HTML composer has been removed from `ui.js`, and the detached `composeWatchlistHTML()` staging path has been removed from the runtime bridge. Vue is both the composition renderer and final live DOM owner, while tracker truth and persistence remain unchanged.

Every completion head must still pass exact-head repository CI and production deployment/restart/public-health verification before this ownership reduction is considered production-proven.
''')

audit_path = ROOT / 'docs/architecture/FRONTEND_OWNERSHIP_AUDIT.md'
audit = audit_path.read_text()
audit = audit.replace(
    '| Watchlist / tracker lists | Vue final `#show-list` writer | `ui.js` detached Watchlist composition plus `app.js` tracker state/mutations/save orchestration | RETAIN — `composeWatchlistHTML()` still stages the legacy composer for the Vue owner |',
    '| Watchlist / tracker lists | Vue-native `TrackerListsSurface.vue` | `app.js` tracker state/mutations/save orchestration plus read-only filter/progress helpers | PASS — structured view model replaces detached legacy HTML composition |',
)
audit = audit.replace(
    '- the same bridge still uses detached legacy Watchlist composition through `composeWatchlistHTML()` before Vue becomes the final `#show-list` writer.\n',
    '- Watchlist no longer uses detached legacy HTML composition; its bridge now consumes a read-only structured view model and Vue renders the cards natively.\n',
)
audit = audit.replace('- Watchlist Vue ownership still consumes detached legacy composition from `ui.js`.\n', '')
audit = audit.replace(
    '1. Replace Watchlist detached legacy composition with a typed Vue-native view model while preserving tracker state/mutation/save ownership in established services.\n2. After Watchlist no longer stages `ui.js` HTML, remove only the now-unreferenced Watchlist composer functions under exact ownership regression coverage.\n3. Replace History detached composition/pagination rendering with Vue-native composition before deleting `history-activity.js` renderer ownership.\n4. Move Show/Movie detail composition to typed Vue-native view models before removing their legacy HTML composers.\n5. Migrate the Upcoming composer only after timing, grouping, watched actions, notification state, loading/failure, and mobile behavior have equivalent Vue-native coverage.\n6. Re-audit `app.js` / `ui.js`; retain only explicitly named shared state/service owners or remove the shells if no such ownership remains.\n',
    '1. Replace History detached composition/pagination rendering with Vue-native composition before deleting `history-activity.js` renderer ownership.\n2. Move Show/Movie detail composition to typed Vue-native view models before removing their legacy HTML composers.\n3. Migrate the Upcoming composer only after timing, grouping, watched actions, notification state, loading/failure, and mobile behavior have equivalent Vue-native coverage.\n4. Finish Discover native ownership under direct-route, refresh, Back/Forward, provider-failure, and mobile acceptance coverage.\n5. Re-audit `app.js` / `ui.js`; retain only explicitly named shared state/service owners or remove the shells if no such ownership remains.\n',
)
audit = audit.replace(
    'The next meaningful `ui.js` ownership reduction is Watchlist: replace its detached legacy HTML staging with a typed Vue-native view model first, then delete the legacy composer only after exact parity tests prove the replacement. Until that handoff exists, broad `app.js` / `ui.js` deletion would remove active service/composition ownership and is intentionally blocked by this audit.',
    'Watchlist native composition is now complete. The next meaningful ownership reduction is History: replace its detached legacy composition and pagination rendering with a Vue-native structured model, then remove only the obsolete History renderer ownership after exact parity tests prove the replacement. Broad `app.js` / `ui.js` deletion remains intentionally blocked while the other named composers/services are active.',
)
audit_path.write_text(audit)

print('Watchlist native composition patch applied.')
