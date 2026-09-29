/** Cursor pagination (PRD §7 conventions). */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Row count, capped: `capped = true` means "10,000+". */
  total?: number;
  capped?: boolean;
}

export interface ListQuery {
  cursor?: string;
  limit?: number;
}

export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 25;
export const ROW_COUNT_CAP = 10_000;

/** ISO-8601 UTC timestamp string. */
export type IsoDateTime = string;
/** ISO calendar date `YYYY-MM-DD` (business dates are Asia/Tehran). */
export type IsoDate = string;

export interface RedirectInstruction {
  url: string;
  method: 'GET' | 'POST';
  fields: Record<string, string>;
}

export const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key';
export const HEADER_IF_MATCH = 'If-Match';
export const HEADER_CSRF = 'X-CSRF-Token';
export const HEADER_KEY_ID = 'X-Bajet-Key-Id';
export const HEADER_TIMESTAMP = 'X-Bajet-Timestamp';
export const HEADER_SIGNATURE = 'X-Bajet-Signature';
export const HEADER_EVENT_ID = 'X-Bajet-Event-Id';
export const HEADER_REQUEST_ID = 'X-Request-Id';
