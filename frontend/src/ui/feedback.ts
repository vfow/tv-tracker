export type FeedbackSeverity = 'success' | 'info' | 'warning' | 'error';

export type FeedbackOptions = Readonly<{
  severity?: FeedbackSeverity;
  actionLabel?: string;
  onAction?: () => unknown;
  duration?: number;
  persistent?: boolean;
  dismissible?: boolean;
  key?: string;
}>;

export type PresentErrorOptions = Readonly<{
  context?: string;
  background?: boolean;
}>;

type FeedbackSurface = Readonly<{
  notify?: (message: string, options?: FeedbackOptions) => unknown;
  reportError?: (error: unknown, userMessage?: string, options?: Record<string, unknown>) => unknown;
}>;

type CoreFeedback = Readonly<{
  presentError?: (error: unknown, options?: Record<string, unknown>) => unknown;
}>;

declare global {
  interface Window {
    TVTrackerFeedback?: FeedbackSurface;
    TVTrackerCore?: { feedback?: CoreFeedback };
    showToast?: (message: string, options?: FeedbackOptions) => unknown;
  }
}

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.';

function notify(message: string, options: FeedbackOptions = {}): unknown {
  const surface = window.TVTrackerFeedback;
  if (typeof surface?.notify === 'function') {
    return surface.notify(message, options);
  }
  if (typeof window.showToast === 'function') {
    return window.showToast(message, options);
  }
  return null;
}

function presentError(
  error: unknown,
  userMessage = GENERIC_ERROR_MESSAGE,
  options: PresentErrorOptions = {}
): unknown {
  const core = window.TVTrackerCore?.feedback;
  if (typeof core?.presentError === 'function') {
    return core.presentError(error, {
      userMessage,
      context: options.context,
      background: options.background === true
    });
  }

  const surface = window.TVTrackerFeedback;
  if (typeof surface?.reportError === 'function') {
    return surface.reportError(error, userMessage, {
      context: options.context ?? 'vue feedback'
    });
  }

  if (options.background === true) return null;
  return notify(userMessage, { severity: 'error' });
}

export const feedback = Object.freeze({
  notify,
  success(message: string, options: Omit<FeedbackOptions, 'severity'> = {}): unknown {
    return notify(message, { ...options, severity: 'success' });
  },
  info(message: string, options: Omit<FeedbackOptions, 'severity'> = {}): unknown {
    return notify(message, { ...options, severity: 'info' });
  },
  warning(message: string, options: Omit<FeedbackOptions, 'severity'> = {}): unknown {
    return notify(message, { ...options, severity: 'warning' });
  },
  error(message: string, options: Omit<FeedbackOptions, 'severity'> = {}): unknown {
    return notify(message, { ...options, severity: 'error' });
  },
  presentError
});
