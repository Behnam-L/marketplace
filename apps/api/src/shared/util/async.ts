export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** BR-RETRY-01: 30 s × 2ⁿ, ±20 % jitter, cap 1 h. `n` = attempts so far (0-based). */
export function retryDelayMs(n: number, random = Math.random): number {
  const base = Math.min(30_000 * 2 ** n, 3_600_000);
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(Math.min(base * jitter, 3_600_000));
}

export const MAX_BACKGROUND_ATTEMPTS = 12;

/** FR-004 merchant webhook schedule (minutes after previous attempt). */
export const WEBHOOK_RETRY_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440];
