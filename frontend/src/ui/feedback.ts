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
  actionLabel?: string;
  onAction?: () => unknown;
  dismissible?: boolean;
  key?: string;
}>;

type FeedbackSurface = Readonly<{
  notify?: (message: string, options?: FeedbackOptions) => unknown;
  reportError?: (error: unknown, userMessage?: string, options?: Record<string, unknown>) => unknown;
}>;

type CoreFeedback = Readonly<{
  presentError?: (error: unknown, options?: Record<string, unknown>) => unknown;
}>;

type FeedbackRuntimeWindow = Window & Readonly<{
  TVTrackerFeedback?: FeedbackSurface;
  TVTrackerCore?: { feedback?: CoreFeedback };
  showToast?: (message: string, options?: FeedbackOptions) => unknown;
}>;

const runtimeWindow = window as FeedbackRuntimeWindow;
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.';

function notify(message: string, options: FeedbackOptions = {}): unknown {
  const surface = runtimeWindow.TVTrackerFeedback;
  if (typeof surface?.notify === 'function') {
    return surface.notify(message, options);
  }
  if (typeof runtimeWindow.showToast === 'function') {
    return runtimeWindow.showToast(message, options);
  }
  return null;
}

function presentError(
  error: unknown,
  userMessage = GENERIC_ERROR_MESSAGE,
  options: PresentErrorOptions = {}
): unknown {
  if (options.background === true) {
    const core = runtimeWindow.TVTrackerCore?.feedback;
    if (typeof core?.presentError === 'function') {
      return core.presentError(error, {
        userMessage,
        context: options.context,
        background: true
      });
    }
    return null;
  }

  const surface = runtimeWindow.TVTrackerFeedback;
  if (typeof surface?.reportError === 'function') {
    return surface.reportError(error, userMessage, {
      context: options.context ?? 'vue feedback',
      actionLabel: options.actionLabel,
      onAction: options.onAction,
      dismissible: options.dismissible,
      key: options.key
    });
  }

  const core = runtimeWindow.TVTrackerCore?.feedback;
  if (typeof core?.presentError === 'function') {
    return core.presentError(error, {
      userMessage,
      context: options.context
    });
  }

  return notify(userMessage, {
    severity: 'error',
    ...(options.actionLabel === undefined ? {} : { actionLabel: options.actionLabel }),
    ...(options.onAction === undefined ? {} : { onAction: options.onAction }),
    ...(options.dismissible === undefined ? {} : { dismissible: options.dismissible }),
    ...(options.key === undefined ? {} : { key: options.key })
  });
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
