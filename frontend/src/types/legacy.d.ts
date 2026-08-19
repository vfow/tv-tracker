export {};

declare global {
  interface Window {
    TVTrackerFeedback?: {
      notify(message: string, options?: Record<string, unknown>): string | null;
      reportError(error: unknown, userMessage?: string, options?: Record<string, unknown>): string | null;
      dismissByKey(key: string): boolean;
      setOffline(offline: boolean): void;
    };
  }
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
