import type { ApiErrorBody, ErrorCode } from "@/contracts/common";

export type ApiErrorCode = ErrorCode | "NETWORK_ERROR";

/** Error returned by the Tailorite API (same shape for every endpoint). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {},
    public readonly requestId?: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError(status: number, data: unknown): ApiError {
  const err = (data as ApiErrorBody | null)?.error;
  return new ApiError(
    status,
    err?.code ?? (status >= 500 ? "INTERNAL" : "VALIDATION_FAILED"),
    err?.message ?? "Something went wrong. Please try again.",
    err?.fieldErrors ?? {},
    err?.requestId,
    err?.meta,
  );
}

/**
 * Same-origin call to the API (proxied under /api). Cookies carry the session; the custom
 * header is required by the API's CSRF protection for every mutation.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", "x-tailorite-csrf": "1" };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach Tailorite. Check your connection and try again.");
  }
  const text = await res.text();
  const data = text ? parseJson(text) : null;
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

/** Multipart upload with progress reporting (fetch cannot report upload progress). */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("x-tailorite-csrf", "1");
    xhr.setRequestHeader("accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const data = xhr.responseText ? parseJson(xhr.responseText) : null;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(toApiError(xhr.status, data));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "NETWORK_ERROR", "The upload was interrupted. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
