import { createApp, type App as VueApp } from 'vue';

import FoundationProbe from './FoundationProbe.vue';
import SettingsNotifications from './notifications/SettingsNotifications.vue';
import SearchResults from './search-discover/SearchResults.vue';
import type { SearchRendererActions, SearchViewModel } from './search-discover/searchViewModel';
import SettingsAuth from './settings/SettingsAuth.vue';
import SettingsDanger from './settings/SettingsDanger.vue';
import SettingsData from './settings/SettingsData.vue';
import SettingsProfile from './settings/SettingsProfile.vue';
import SettingsStreaming from './settings/SettingsStreaming.vue';

export const FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation';
export const FRONTEND_FOUNDATION_VERSION = 'phase9-search-renderer';

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

type VueFoundationBridge = Readonly<{
  version: string;
  mountProbe: typeof mountFoundationProbe;
}>;

declare global {
  interface Window {
    TVTrackerVueFoundation?: VueFoundationBridge;
    TVTrackerSettingsBridge?: SettingsBridge;
    TVTrackerSearchVueBridge?: SearchBridge;
  }
}

let settingsApp: VueApp<Element> | null = null;
let settingsRoot: Element | null = null;
let settingsSection = '';
let searchApp: VueApp<Element> | null = null;
let searchRoot: Element | null = null;

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
    unmountSearch();
    root.replaceChildren();
    searchRoot = root;
    searchApp = createApp(SearchResults, {
      model,
      actions: bridge.actions
    });
    searchApp.mount(root);
  },
  unmount: unmountSearch
});

window.TVTrackerVueFoundation = Object.freeze({
  version: FRONTEND_FOUNDATION_VERSION,
  mountProbe: mountFoundationProbe
});

window.TVTrackerSettingsBridge?.attachVueOwner(settingsOwner);
window.TVTrackerSearchVueBridge?.attachVueOwner(searchOwner);
