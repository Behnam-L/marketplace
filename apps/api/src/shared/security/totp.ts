import { createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) with RFC 4648 base32 secrets. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secret: string, timeMs: number, step = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString();
  return code.padStart(digits, '0');
}

/** Accepts the current code and ±1 step for clock drift. */
export function verifyTotp(secret: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  for (const drift of [-1, 0, 1]) {
    if (totpAt(secret, nowMs + drift * 30_000) === code) return true;
  }
  return false;
}

export function totpProvisioningUri(secret: string, account: string, issuer = 'Bajet Admin'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
