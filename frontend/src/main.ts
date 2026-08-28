import { createApp, type App as VueApp } from 'vue';

import FoundationProbe from './FoundationProbe.vue';

export const FRONTEND_FOUNDATION_VERSION = 'phase2-vue-foundation';

export function createFoundationProbe(): VueApp<Element> {
  return createApp(FoundationProbe);
}

export function mountFoundationProbe(element: Element): () => void {
  const app = createFoundationProbe();
  app.mount(element);
  return () => app.unmount();
}
