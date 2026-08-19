export const ErrorClassification = Object.freeze({
  ACTIONABLE: "ACTIONABLE",
  VISIBLE_SERVICE_PROBLEM: "VISIBLE_SERVICE_PROBLEM",
  RECOVERABLE_BACKGROUND_FAILURE: "RECOVERABLE_BACKGROUND_FAILURE",
  TECHNICAL_DETAIL: "TECHNICAL_DETAIL"
} as const);

export type ErrorClassificationValue =
  (typeof ErrorClassification)[keyof typeof ErrorClassification];

export interface ErrorClassificationOptions {
  background?: boolean;
  status?: number | null;
}

export interface ClassifiedError {
  classification: ErrorClassificationValue;
  status: number | null;
  code: string;
  safeMessage: string;
  retryable: boolean;
  original: unknown;
}

function statusFrom(error: unknown, override?: number | null): number | null {
  if (Number.isFinite(Number(override))) return Number(override);
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

function codeFrom(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value.slice(0, 120) : "";
}

function looksLikeNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|networkerror|network request|econnreset|econnrefused|enotfound|etimedout/i.test(
    error.message
  );
}

export function classifyError(
  error: unknown,
  options: ErrorClassificationOptions = {}
): ClassifiedError {
  const status = statusFrom(error, options.status);
  const networkFailure = looksLikeNetworkFailure(error);
  const serviceFailure = networkFailure || status === 429 || (status !== null && status >= 500);

  if (options.background === true && serviceFailure) {
    return {
      classification: ErrorClassification.RECOVERABLE_BACKGROUND_FAILURE,
      status,
      code: codeFrom(error),
      safeMessage: "",
      retryable: true,
      original: error
    };
  }

  if (status !== null && [400, 401, 403, 404, 409, 422].includes(status)) {
    return {
      classification: ErrorClassification.ACTIONABLE,
      status,
      code: codeFrom(error),
      safeMessage: "Couldn’t complete that request. Check the details and try again.",
      retryable: status === 409,
      original: error
    };
  }

  if (serviceFailure) {
    return {
      classification: ErrorClassification.VISIBLE_SERVICE_PROBLEM,
      status,
      code: codeFrom(error),
      safeMessage: "TV Tracker can’t reach the service right now. Try again.",
      retryable: true,
      original: error
    };
  }

  return {
    classification: ErrorClassification.TECHNICAL_DETAIL,
    status,
    code: codeFrom(error),
    safeMessage: "Something went wrong. Try again.",
    retryable: false,
    original: error
  };
}
