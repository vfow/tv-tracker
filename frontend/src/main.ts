import { createApp, type App as VueApp } from 'vue';

import FoundationProbe from './FoundationProbe.vue';
import SettingsStreaming from './settings/SettingsStreaming.vue';

export const FRONTEND_FOUNDATION_LINEAGE = 'phase2-vue-foundation';
export const FRONTEND_FOUNDATION_VERSION = 'phase3-settings-streaming-canary';

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

function unmountSettings(): void {
  if (settingsApp) settingsApp.unmount();
  settingsApp = null;
  settingsRoot = null;
}

const settingsOwner: SettingsVueOwner = Object.freeze({
  supports(section: string): boolean {
    return section === 'streaming';
  },
  render(section: string): void {
    if (section !== 'streaming') {
      unmountSettings();
      return;
    }
    const root = document.getElementById('settings-content');
    if (!root) return;
    if (settingsApp && settingsRoot === root) return;
    unmountSettings();
    root.replaceChildren();
    settingsRoot = root;
    settingsApp = createApp(SettingsStreaming);
    settingsApp.mount(root);
  },
  unmount: unmountSettings
});

window.TVTrackerVueFoundation = Object.freeze({
  version: FRONTEND_FOUNDATION_VERSION,
  mountProbe: mountFoundationProbe
});

window.TVTrackerSettingsBridge?.attachVueOwner(settingsOwner);
