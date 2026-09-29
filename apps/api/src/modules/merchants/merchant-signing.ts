import { hmacSha256Hex, sha256Hex } from '../../shared/security/crypto.service';

/**
 * §9.1: signature = hex(HMAC-SHA256(secret, ts + "\n" + method + "\n" + path + "\n" + hex(SHA-256(body)))).
 * `path` is the request path including the query string, e.g. `/v1/merchant/availability?amount=1000`.
 */
export function signRequest(secret: string, timestamp: string, method: string, path: string, body: Buffer | string): string {
  return hmacSha256Hex(secret, `${timestamp}\n${method.toUpperCase()}\n${path}\n${sha256Hex(body)}`);
}

export const MAX_CLOCK_SKEW_SECONDS = 300;
