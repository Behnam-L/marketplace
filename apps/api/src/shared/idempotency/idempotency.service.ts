import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../errors/app-error';
import { sha256Hex } from '../security/crypto.service';

export interface StoredResponse {
  status: number;
  body: unknown;
}

export type IdempotencyStart =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredResponse };

/** Idempotency-Key store (§7 conventions): replay, reuse detection, in-flight guard. */
@Injectable()
export class IdempotencyService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  static hashRequest(method: string, path: string, body: unknown): string {
    return sha256Hex(`${method}\n${path}\n${JSON.stringify(body ?? {})}`);
  }

  static validateKey(key: string | undefined): string {
    if (!key || key.length > 64 || !/^[\x21-\x7e]+$/.test(key)) {
      throw new AppError('VALIDATION_ERROR', 'A valid Idempotency-Key header (≤ 64 chars) is required.', {
        fields: [{ field: 'Idempotency-Key', message: 'Required, at most 64 printable characters.' }],
      });
    }
    return key;
  }

  async begin(scope: string, key: string, requestHash: string): Promise<IdempotencyStart> {
    await this.ds.query(
      `DELETE FROM idempotency_record WHERE scope = $1 AND key = $2 AND expires_at <= now()`,
      [scope, key],
    );
    const inserted: unknown[] = await this.ds.query(
      `INSERT INTO idempotency_record (scope, key, request_hash, status, expires_at)
       VALUES ($1, $2, $3, 'InProgress', now() + interval '24 hours')
       ON CONFLICT (scope, key) DO NOTHING RETURNING key`,
      [scope, key, requestHash],
    );
    if (inserted.length > 0) return { kind: 'new' };
    const rows: { request_hash: string; status: string; response_code: number; response_body: unknown }[] =
      await this.ds.query(
        `SELECT request_hash, status, response_code, response_body FROM idempotency_record WHERE scope = $1 AND key = $2`,
        [scope, key],
      );
    const rec = rows[0];
    if (!rec) return this.begin(scope, key, requestHash);
    if (rec.request_hash !== requestHash) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
    }
    if (rec.status !== 'Done') {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is still being processed.');
    }
    return { kind: 'replay', response: { status: rec.response_code, body: rec.response_body } };
  }

  async complete(scope: string, key: string, response: StoredResponse): Promise<void> {
    await this.ds.query(
      `UPDATE idempotency_record SET status = 'Done', response_code = $3, response_body = $4 WHERE scope = $1 AND key = $2`,
      [scope, key, response.status, JSON.stringify(response.body ?? null)],
    );
  }

  async abandon(scope: string, key: string): Promise<void> {
    await this.ds.query(`DELETE FROM idempotency_record WHERE scope = $1 AND key = $2 AND status = 'InProgress'`, [scope, key]);
  }

  async purgeExpired(): Promise<number> {
    const r: [unknown[], number] = await this.ds.query(`DELETE FROM idempotency_record WHERE expires_at <= now()`);
    return Array.isArray(r) ? (r[1] ?? 0) : 0;
  }
}
