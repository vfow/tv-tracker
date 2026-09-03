import { createApp, type App as VueApp } from 'vue';

import EpisodeTrackingController from './episode-tracking/EpisodeTrackingController.vue';
import FoundationProbe from './FoundationProbe.vue';
import HistorySurface from './history/HistorySurface.vue';
import type { HistoryVueBridge, HistoryVueOwner, HistoryViewModel } from './history/contracts';
import MovieDetails from './media-details/MovieDetails.vue';
import type { MovieDetailsVueBridge, MovieDetailsVueOwner, MovieDetailsViewModel } from './media-details/movieViewModel';
import ShowDetails from './media-details/ShowDetails.vue';
import type { ShowDetailsVueBridge, ShowDetailsVueOwner, ShowDetailsViewModel } from './media-details/showViewModel';
import SettingsNotifications from './notifications/SettingsNotifications.vue';
import DiscoverHub from './search-discover/DiscoverHub.vue';
import type { DiscoverRendererActions, DiscoverViewModel } from './search-discover/discoverViewModel';
import SearchResults from './search-discover/SearchResults.vue';
import type { SearchRendererActions, SearchViewModel } from './search-discover/searchViewModel';
import TrackerListsSurface from './tracker-lists/TrackerListsSurface.vue';
import type { TrackerListsVueBridge, TrackerListsVueOwner, TrackerListsViewModel } from './tracker-lists/contracts';
import SettingsAuth from './settings/SettingsAuth.vue';
import SettingsDanger from './settings/SettingsDanger.vue';
import SettingsData from './settings/SettingsData.vue';
import SettingsProfile from './settings/SettingsProfile.vue';
import SettingsStreaming from './settings/SettingsStreaming.vue';
import UpcomingNotificationsSurface from './upcoming-notifications/UpcomingNotificationsSurface.vue';
import type {
  UpcomingNotificationsSurface as UpcomingNotificationsSurfaceName,
  UpcomingNotificationsViewModel,
  UpcomingNotificationsVueBridge,
  UpcomingNotificationsVueOwner
} from './upcoming-notifications/viewModel';

export const FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation';
export const FRONTEND_FOUNDATION_VERSION = 'phase5-shared-ui-feedback';

export function createFoundationProbe(): VueApp<Element> {
  return createApp(FoundationProbe);
}

export function mountFoundationProbe(element: Element): () => void {
  const app = createFoundationProbe();
  app.mount(element);
  return () => app.unmount();
}

type SettingsVueOwner = Readonly<{
  supports: (section: string) => boolean;
  render: (section: string) => void;
  unmount: () => void;
}>;

type SettingsBridge = Readonly<{
  attachVueOwner: (owner: SettingsVueOwner) => void;
}>;

type SearchVueOwner = Readonly<{
  render: (model: SearchViewModel) => void;
  unmount: () => void;
}>;

type SearchBridge = Readonly<{
  attachVueOwner: (owner: SearchVueOwner) => void;
  actions: SearchRendererActions;
}>;

type DiscoverVueOwner = Readonly<{
  render: (model: DiscoverViewModel) => void;
  unmount: () => void;
}>;

type DiscoverBridge = Readonly<{
  attachVueOwner: (owner: DiscoverVueOwner) => void;
  actions: DiscoverRendererActions;
}>;

type VueFoundationBridge = Readonly<{
  version: string;
  mountProbe: typeof mountFoundationProbe;
}>;

declare global {
  interface Window {
    TVTrackerVueFoundation?: VueFoundationBridge;
    TVTrackerSettingsBridge?: SettingsBridge;
    TVTrackerSearchVueBridge?: SearchBridge;
    TVTrackerDiscoverVueBridge?: DiscoverBridge;
    TVTrackerHistoryVueBridge?: HistoryVueBridge;
    TVTrackerTrackerListsVueBridge?: TrackerListsVueBridge;
    TVTrackerMovieDetailsVueBridge?: MovieDetailsVueBridge;
    TVTrackerShowDetailsVueBridge?: ShowDetailsVueBridge;
    TVTrackerUpcomingNotificationsVueBridge?: UpcomingNotificationsVueBridge;
  }
}

let settingsApp: VueApp<Element> | null = null;
let settingsRoot: Element | null = null;
let settingsSection = '';
let searchApp: VueApp<Element> | null = null;
let searchRoot: Element | null = null;
let discoverApp: VueApp<Element> | null = null;
let discoverRoot: Element | null = null;
let movieDetailsApp: VueApp<Element> | null = null;
let movieDetailsRoot: Element | null = null;
let showDetailsApp: VueApp<Element> | null = null;
let showDetailsRoot: Element | null = null;
let upcomingApp: VueApp<Element> | null = null;
let upcomingRoot: Element | null = null;
let notificationsApp: VueApp<Element> | null = null;
let notificationsRoot: Element | null = null;
let trackerListsApp: VueApp<Element> | null = null;
let trackerListsRoot: Element | null = null;
let historyApp: VueApp<Element> | null = null;
let historyRoot: Element | null = null;
let episodeTrackingControllerApp: VueApp<Element> | null = null;

function mountEpisodeTrackingController(): void {
  if (episodeTrackingControllerApp || !document.body) return;
  const root = document.createElement('div');
  root.id = 'vue-episode-tracking-controller-root';
  root.hidden = true;
  document.body.appendChild(root);
  episodeTrackingControllerApp = createApp(EpisodeTrackingController);
  episodeTrackingControllerApp.mount(root);
}

function unmountSettings(): void {
  if (settingsApp) settingsApp.unmount();
  settingsApp = null;
  settingsRoot = null;
  settingsSection = '';
}

function unmountSearch(): void {
  if (searchApp) searchApp.unmount();
  searchApp = null;
  searchRoot = null;
}

function unmountDiscover(): void {
  if (discoverApp) discoverApp.unmount();
  discoverApp = null;
  discoverRoot = null;
}

function unmountMovieDetails(): void {
  if (movieDetailsApp) movieDetailsApp.unmount();
  movieDetailsApp = null;
  movieDetailsRoot = null;
}

function unmountShowDetails(): void {
  if (showDetailsApp) showDetailsApp.unmount();
  showDetailsApp = null;
  showDetailsRoot = null;
}

function unmountTrackerLists(): void {
  if (trackerListsApp) trackerListsApp.unmount();
  trackerListsApp = null;
  trackerListsRoot = null;
}

function unmountHistory(): void {
  if (historyApp) historyApp.unmount();
  historyApp = null;
  historyRoot = null;
}

function unmountUpcomingNotifications(surface?: UpcomingNotificationsSurfaceName): void {
  if (!surface || surface === 'upcoming') {
    if (upcomingApp) upcomingApp.unmount();
    upcomingApp = null;
    upcomingRoot = null;
  }
  if (!surface || surface === 'notifications') {
    if (notificationsApp) notificationsApp.unmount();
    notificationsApp = null;
    notificationsRoot = null;
  }
}

function supportsPhase3Streaming(section: string): boolean {
  return section === 'streaming';
}

function supportsSettingsSection(section: string): boolean {
  return supportsPhase3Streaming(section)
    || section === 'notifications'
    || section === 'profile'
    || section === 'auth'
    || section === 'data'
    || section === 'danger-zone';
}

const settingsOwner: SettingsVueOwner = Object.freeze({
  supports(section: string): boolean {
    return supportsSettingsSection(section);
  },
  render(section: string): void {
    if (!supportsSettingsSection(section)) {
      unmountSettings();
      return;
    }
    const root = document.getElementById('settings-content');
    if (!root) return;
    if (settingsApp && settingsRoot === root && settingsSection === section) return;
    unmountSettings();
    root.replaceChildren();
    settingsRoot = root;
    settingsSection = section;
    if (supportsPhase3Streaming(section)) {
      settingsApp = createApp(SettingsStreaming);
    } else if (section === 'notifications') {
      settingsApp = createApp(SettingsNotifications);
    } else if (section === 'profile') {
      settingsApp = createApp(SettingsProfile);
    } else if (section === 'auth') {
      settingsApp = createApp(SettingsAuth);
    } else if (section === 'data') {
      settingsApp = createApp(SettingsData);
    } else {
      settingsApp = createApp(SettingsDanger);
    }
    settingsApp.mount(root);
  },
  unmount: unmountSettings
});

const searchOwner: SearchVueOwner = Object.freeze({
  render(model: SearchViewModel): void {
    const root = document.getElementById('search-results');
    const bridge = window.TVTrackerSearchVueBridge;
    if (!root || !bridge) return;
    unmountDiscover();
    unmountSearch();
    root.replaceChildren();
    searchRoot = root;
    searchApp = createApp(SearchResults, { model, actions: bridge.actions });
    searchApp.mount(root);
  },
  unmount: unmountSearch
});

const discoverOwner: DiscoverVueOwner = Object.freeze({
  render(model: DiscoverViewModel): void {
    const root = document.getElementById('search-results');
    const bridge = window.TVTrackerDiscoverVueBridge;
    if (!root || !bridge) return;
    unmountSearch();
    unmountDiscover();
    root.replaceChildren();
    discoverRoot = root;
    discoverApp = createApp(DiscoverHub, { model, actions: bridge.actions });
    discoverApp.mount(root);
  },
  unmount: unmountDiscover
});

const movieDetailsOwner: MovieDetailsVueOwner = Object.freeze({
  render(model: MovieDetailsViewModel): void {
    const root = document.getElementById('show-detail-content');
    if (!root) return;
    unmountShowDetails();
    unmountMovieDetails();
    root.replaceChildren();
    movieDetailsRoot = root;
    movieDetailsApp = createApp(MovieDetails, { model });
    movieDetailsApp.mount(root);
  },
  unmount: unmountMovieDetails
});

const showDetailsOwner: ShowDetailsVueOwner = Object.freeze({
  render(model: ShowDetailsViewModel): void {
    const root = document.getElementById('show-detail-content');
    if (!root) return;
    unmountMovieDetails();
    unmountShowDetails();
    root.replaceChildren();
    showDetailsRoot = root;
    showDetailsApp = createApp(ShowDetails, { model });
    showDetailsApp.mount(root);
  },
  unmount: unmountShowDetails
});

const trackerListsOwner: TrackerListsVueOwner = Object.freeze({
  render(model: TrackerListsViewModel): void {
    const root = document.getElementById('show-list');
    const bridge = window.TVTrackerTrackerListsVueBridge;
    if (!root || !bridge) return;
    unmountHistory();
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

const historyOwner: HistoryVueOwner = Object.freeze({
  render(model: HistoryViewModel): void {
    const root = document.getElementById('show-list');
    const bridge = window.TVTrackerHistoryVueBridge;
    if (!root || !bridge) return;
    unmountTrackerLists();
    unmountUpcomingNotifications('upcoming');
    unmountHistory();
    root.replaceChildren();
    historyRoot = root;
    historyApp = createApp(HistorySurface, { model, actions: bridge.actions });
    historyApp.mount(root);
    root.setAttribute('data-tvtracker-history-owner', 'vue-history');
    root.removeAttribute('data-tvtracker-tracker-lists-owner');
  },
  unmount: unmountHistory
});

const upcomingNotificationsOwner: UpcomingNotificationsVueOwner = Object.freeze({
  render(model: UpcomingNotificationsViewModel): boolean {
    const rootId = model.surface === 'upcoming' ? 'show-list' : 'notifications-content';
    const root = document.getElementById(rootId);
    if (!root) return false;
    if (model.surface === 'upcoming') {
      unmountHistory();
      unmountTrackerLists();
    }
    unmountUpcomingNotifications(model.surface);
    root.replaceChildren();
    const app = createApp(UpcomingNotificationsSurface, { model });
    app.mount(root);
    if (model.surface === 'upcoming') {
      upcomingRoot = root;
      upcomingApp = app;
    } else {
      notificationsRoot = root;
      notificationsApp = app;
    }
    return true;
  },
  unmount: unmountUpcomingNotifications
});

window.TVTrackerVueFoundation = Object.freeze({
  version: FRONTEND_FOUNDATION_VERSION,
  mountProbe: mountFoundationProbe
});

mountEpisodeTrackingController();
window.TVTrackerSettingsBridge?.attachVueOwner(settingsOwner);
window.TVTrackerSearchVueBridge?.attachVueOwner(searchOwner);
window.TVTrackerDiscoverVueBridge?.attachVueOwner(discoverOwner);
window.TVTrackerHistoryVueBridge?.attachVueOwner(historyOwner);
window.TVTrackerTrackerListsVueBridge?.attachVueOwner(trackerListsOwner);
window.TVTrackerMovieDetailsVueBridge?.attachVueOwner(movieDetailsOwner);
window.TVTrackerShowDetailsVueBridge?.attachVueOwner(showDetailsOwner);
window.TVTrackerUpcomingNotificationsVueBridge?.attachVueOwner(upcomingNotificationsOwner);
