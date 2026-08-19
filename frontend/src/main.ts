import { createApp } from "vue";
import CompatibilityBoundary from "./CompatibilityBoundary";
import { apiClient } from "./core/api";
import { classifyError } from "./core/errors";
import { presentError } from "./core/feedback";
import { installSettingsDomain, type SettingsController } from "./domains/settings";

export interface TVTrackerModernBridge {
  readonly version: "phase14-v1";
  readonly api: typeof apiClient;
  readonly classifyError: typeof classifyError;
  readonly presentError: typeof presentError;
  readonly settings?: SettingsController;
}

declare global {
  interface Window {
    TVTrackerModern?: TVTrackerModernBridge;
  }
}

const settings = installSettingsDomain();
const bridge: TVTrackerModernBridge = Object.freeze({
  version: "phase14-v1",
  api: apiClient,
  classifyError,
  presentError,
  settings
});

if (!window.TVTrackerModern) {
  Object.defineProperty(window, "TVTrackerModern", {
    value: bridge,
    writable: false,
    configurable: false,
    enumerable: false
  });
}

const root = document.querySelector<HTMLElement>("[data-tv-modern-root]");
if (root && root.dataset.tvModernMounted !== "true") {
  createApp(CompatibilityBoundary).mount(root);
  root.dataset.tvModernMounted = "true";
}
