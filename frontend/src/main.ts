import { createApp, type App as VueApp } from 'vue';

import FoundationProbe from './FoundationProbe.vue';
import SettingsNotifications from './notifications/SettingsNotifications.vue';
import SettingsStreaming from './settings/SettingsStreaming.vue';

export const FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation';
export const FRONTEND_FOUNDATION_VERSION = 'phase4a-settings-notifications-canary';

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

type VueFoundationBridge = Readonly<{
  version: string;
  mountProbe: typeof mountFoundationProbe;
}>;

declare global {
  interface Window {
    TVTrackerVueFoundation?: VueFoundationBridge;
    TVTrackerSettingsBridge?: SettingsBridge;
  }
}

let settingsApp: VueApp<Element> | null = null;
let settingsRoot: Element | null = null;
let settingsSection = '';

function unmountSettings(): void {
  if (settingsApp) settingsApp.unmount();
  settingsApp = null;
  settingsRoot = null;
  settingsSection = '';
}

function supportsPhase3Streaming(section: string): boolean {
  return section === 'streaming';
}

function supportsSettingsSection(section: string): boolean {
  return supportsPhase3Streaming(section) || section === 'notifications';
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
    settingsApp = supportsPhase3Streaming(section)
      ? createApp(SettingsStreaming)
      : createApp(SettingsNotifications);
    settingsApp.mount(root);
  },
  unmount: unmountSettings
});

window.TVTrackerVueFoundation = Object.freeze({
  version: FRONTEND_FOUNDATION_VERSION,
  mountProbe: mountFoundationProbe
});

window.TVTrackerSettingsBridge?.attachVueOwner(settingsOwner);
