import type { ApiErrorBody, ErrorCode } from '@bajet/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    readonly details: ApiErrorBody['error']['details'] = {},
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** FormData bodies are sent as multipart. */
  form?: FormData;
  signal?: AbortSignal;
}

type Interceptor = (err: ApiError, retry: () => Promise<unknown>) => Promise<unknown> | undefined;

let csrfToken: string | null = null;
const interceptors: Interceptor[] = [];

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Lets the admin shell handle session expiry / step-up and retry transparently. */
export function addInterceptor(fn: Interceptor): () => void {
  interceptors.push(fn);
  return () => {
    const i = interceptors.indexOf(fn);
    if (i >= 0) interceptors.splice(i, 1);
  };
}

export function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function raw<T>(path: string, opts: RequestOptions): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.ifMatch !== undefined) headers['If-Match'] = String(opts.ifMatch);
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(`/v1${path}${buildQuery(opts.query)}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL_ERROR', err?.message ?? res.statusText, err?.details ?? {});
  }
  return data as T;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await raw<T>(path, opts);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    for (const fn of interceptors) {
      const handled = fn(e, () => raw<T>(path, opts));
      if (handled) return (await handled) as T;
    }
    throw e;
  }
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
