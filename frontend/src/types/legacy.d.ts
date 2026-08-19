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
