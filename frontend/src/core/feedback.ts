import {
  ErrorClassification,
  classifyError,
  type ErrorClassificationOptions
} from "./errors";

export interface PresentErrorOptions extends ErrorClassificationOptions {
  userMessage?: string;
  context?: string;
}

export function presentError(error: unknown, options: PresentErrorOptions = {}): void {
  const classified = classifyError(error, options);

  if (classified.classification === ErrorClassification.RECOVERABLE_BACKGROUND_FAILURE) {
    return;
  }

  const feedback = window.TVTrackerFeedback;
  const userMessage = options.userMessage || classified.safeMessage || "Something went wrong. Try again.";

  if (feedback && typeof feedback.reportError === "function") {
    feedback.reportError(error, userMessage, { context: options.context || "modern frontend" });
    return;
  }

  // Do not create a second renderer if the legacy feedback runtime has not loaded.
  // Technical information is console-only at this compatibility boundary.
  console.error("[TV Tracker] modern frontend error", {
    classification: classified.classification,
    status: classified.status,
    code: classified.code
  });
}
