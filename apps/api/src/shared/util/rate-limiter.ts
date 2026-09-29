import { Injectable } from '@nestjs/common';
import { AppError } from '../errors/app-error';

/** In-memory fixed-window limiter (single-process modular monolith). */
@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; count: number }>();

  hit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { resetAt: now + windowMs, count: 0 };
      this.windows.set(key, w);
    }
    w.count++;
    if (w.count > limit) {
      const retryAfter = Math.ceil((w.resetAt - now) / 1000);
      throw new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', { retryAfter }, {
        'Retry-After': String(retryAfter),
      });
    }
    if (this.windows.size > 50_000) {
      for (const [k, v] of this.windows) if (v.resetAt <= now) this.windows.delete(k);
    }
  }

  reset(): void {
    this.windows.clear();
  }
}
