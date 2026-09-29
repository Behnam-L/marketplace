import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';

/**
 * Key management interface. The offline build ships a local implementation that
 * wraps data keys with a master key from the environment (stand-in for a KMS).
 */
export interface KeyWrapper {
  wrap(dataKey: Buffer): string;
  unwrap(wrapped: string): Buffer;
}

export class LocalKeyWrapper implements KeyWrapper {
  constructor(private readonly masterKey: Buffer) {}

  wrap(dataKey: Buffer): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const enc = Buffer.concat([c.update(dataKey), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
  }

  unwrap(wrapped: string): Buffer {
    const buf = Buffer.from(wrapped, 'base64');
    const d = createDecipheriv('aes-256-gcm', this.masterKey, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
  }
}

/** Envelope encryption (AES-256-GCM), blind indexes and hashing (§9.5). */
@Injectable()
export class CryptoService {
  private readonly keys: KeyWrapper;
  private readonly pepper: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.keys = new LocalKeyWrapper(config.dataEncryptionKey);
    this.pepper = config.hashPepper;
  }

  /** Returns `v1.<wrappedKey>.<iv+tag+ciphertext>` (base64 parts). */
  encrypt(plaintext: string): string {
    const dataKey = randomBytes(32);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', dataKey, iv);
    const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
    return `v1.${this.keys.wrap(dataKey)}.${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [ver, wrapped, body] = payload.split('.');
    if (ver !== 'v1' || !wrapped || !body) throw new Error('Unsupported ciphertext');
    const dataKey = this.keys.unwrap(wrapped);
    const buf = Buffer.from(body, 'base64');
    const d = createDecipheriv('aes-256-gcm', dataKey, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  }

  /** Keyed hash for lookups (blind index), tokens and OTP codes. */
  hmac(purpose: string, value: string): string {
    return createHmac('sha256', `${this.pepper}:${purpose}`).update(value).digest('hex');
  }

  randomToken(bytes = 16): string {
    return randomBytes(bytes).toString('base64url');
  }
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacSha256Hex(secret: string | Buffer, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
