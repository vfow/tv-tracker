export type ApiErrorBody = {
  error?: string;
  code?: string;
  requestId?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(message: string, status: number, code: string | null, requestId: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function requireApiPath(path: string): string {
  if (!path.startsWith('/api/')) {
    throw new TypeError('TV Tracker API requests must use same-origin /api/ paths.');
  }
  return path;
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content?.trim() ?? '';
}

function isMutation(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (isMutation(method)) {
    const token = csrfToken();
    if (!token) {
      throw new Error('Missing CSRF token for authenticated mutation.');
    }
    headers.set('X-CSRF-Token', token);
  }

  const response = await fetch(requireApiPath(path), {
    ...init,
    method,
    headers,
    credentials: 'same-origin'
  });

  const requestId = response.headers.get('X-Request-ID');
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? (await response.json()) as unknown
    : null;

  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? (body as ApiErrorBody) : {};
    throw new ApiError(
      typeof errorBody.error === 'string' ? errorBody.error : `Request failed with HTTP ${response.status}.`,
      response.status,
      typeof errorBody.code === 'string' ? errorBody.code : null,
      typeof errorBody.requestId === 'string' ? errorBody.requestId : requestId
    );
  }

  return body as T;
}
