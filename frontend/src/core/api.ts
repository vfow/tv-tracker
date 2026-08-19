import { classifyError, type ClassifiedError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || "";
}

function errorCode(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("code" in payload)) return "";
  const value = (payload as { code?: unknown }).code;
  return typeof value === "string" ? value.slice(0, 120) : "";
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: unknown;
  readonly classified: ClassifiedError;

  constructor(status: number, payload: unknown) {
    super(`TV Tracker API request failed (${status})`);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = errorCode(payload);
    this.payload = payload;
    this.classified = classifyError(this, { status });
  }
}

async function responsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class ApiClient {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("API paths must be same-origin absolute paths");
    }

    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    headers.set("Accept", "application/json");

    if (!SAFE_METHODS.has(method)) {
      const token = csrfToken();
      if (token) headers.set("X-CSRF-Token", token);
      if (init.body != null && !headers.has("Content-Type") && typeof init.body === "string") {
        headers.set("Content-Type", "application/json");
      }
    }

    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        method,
        headers,
        credentials: "same-origin"
      });
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error("Network request failed"), {
        classified: classifyError(error)
      });
    }

    const payload = await responsePayload(response);
    if (!response.ok) throw new ApiRequestError(response.status, payload);
    return payload as T;
  }

  get<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: "GET" });
  }

  post<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "POST",
      body: body === undefined ? init.body : JSON.stringify(body)
    });
  }

  patch<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "PATCH",
      body: body === undefined ? init.body : JSON.stringify(body)
    });
  }

  delete<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: "DELETE" });
  }
}

export const apiClient = Object.freeze(new ApiClient());
