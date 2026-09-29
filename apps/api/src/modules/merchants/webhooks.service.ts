import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  HEADER_EVENT_ID,
  HEADER_KEY_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  type MerchantWebhookEventDto,
  type MerchantWebhookEventType,
  type MerchantWebhookPayload,
} from '@bajet/contracts';
import { AppError, notFound } from '../../shared/errors/app-error';
import { newId } from '../../shared/util/ids';
import { AlertService } from '../../shared/util/alerts';
import { JobsGate } from '../../shared/util/jobs-gate';
import { WEBHOOK_RETRY_MINUTES } from '../../shared/util/async';
import { MerchantWebhookEvent } from './merchant.entity';
import { signRequest } from './merchant-signing';

type SecretLookup = (merchantId: string) => Promise<{ keyId: string; secret: string } | null>;

/**
 * FR-004 merchant webhooks: enqueued in the same transaction as the state change
 * (the event row is the outbox), delivered at-least-once with the fixed schedule.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private secretLookup: SecretLookup = () => Promise.resolve(null);
  /** Injectable transport so tests can observe deliveries. */
  transport: (url: string, init: { headers: Record<string, string>; body: string }) => Promise<number> = async (url, init) => {
    const res = await fetch(url, { method: 'POST', headers: init.headers, body: init.body, signal: AbortSignal.timeout(10_000), redirect: 'manual' });
    return res.status;
  };

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: AlertService,
    private readonly jobs: JobsGate,
  ) {}

  registerSecretLookup(fn: SecretLookup): void {
    this.secretLookup = fn;
  }

  /** Enqueue inside the caller's transaction. No target URL → nothing to deliver. */
  async enqueue(
    m: EntityManager,
    input: { merchantId: string; targetUrl: string | null; type: MerchantWebhookEventType; data: MerchantWebhookPayload['data'] },
  ): Promise<string | null> {
    if (!input.targetUrl) return null;
    const id = newId('evt');
    const payload: MerchantWebhookPayload = { id, type: input.type, createdAt: new Date().toISOString(), data: input.data };
    await m.insert(MerchantWebhookEvent, {
      id,
      merchantId: input.merchantId,
      eventType: input.type,
      payload,
      targetUrl: input.targetUrl,
      status: 'Pending',
      attempts: 0,
      nextAttemptAt: new Date(),
    });
    return id;
  }

  async deliver(eventId: string): Promise<void> {
    const ev = await this.ds.manager.findOne(MerchantWebhookEvent, { where: { id: eventId } });
    if (!ev || (ev.status !== 'Pending' && ev.status !== 'Retrying')) return;
    const body = JSON.stringify(ev.payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const key = await this.secretLookup(ev.merchantId);
    const url = new URL(ev.targetUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [HEADER_EVENT_ID]: ev.id,
      [HEADER_TIMESTAMP]: ts,
    };
    if (key) {
      headers[HEADER_KEY_ID] = key.keyId;
      headers[HEADER_SIGNATURE] = signRequest(key.secret, ts, 'POST', `${url.pathname}${url.search}`, body);
    }
    let status: number | null = null;
    let error: string | null = null;
    try {
      status = await this.transport(ev.targetUrl, { headers, body });
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    const attempts = ev.attempts + 1;
    if (status !== null && status >= 200 && status < 300) {
      await this.ds.manager.update(MerchantWebhookEvent, { id: ev.id }, {
        status: 'Delivered', attempts, lastHttpStatus: status, lastError: null, deliveredAt: new Date(), nextAttemptAt: null,
      });
      return;
    }
    const retryIndex = attempts - 1;
    if (retryIndex >= WEBHOOK_RETRY_MINUTES.length) {
      await this.ds.manager.update(MerchantWebhookEvent, { id: ev.id }, {
        status: 'Exhausted', attempts, lastHttpStatus: status, lastError: error, nextAttemptAt: null,
      });
      this.alerts.raise('Operations', 'MERCHANT_WEBHOOK_EXHAUSTED', { eventId: ev.id, merchantId: ev.merchantId });
      return;
    }
    await this.ds.manager.update(MerchantWebhookEvent, { id: ev.id }, {
      status: 'Retrying',
      attempts,
      lastHttpStatus: status,
      lastError: error,
      nextAttemptAt: new Date(Date.now() + WEBHOOK_RETRY_MINUTES[retryIndex] * 60_000),
    });
  }

  /** Delivers every due event; returns the number attempted. */
  async dispatchDue(limit = 50): Promise<number> {
    const due: { id: string }[] = await this.ds.query(
      `SELECT id FROM merchant_webhook_event
        WHERE status IN ('Pending', 'Retrying') AND next_attempt_at <= now()
        ORDER BY next_attempt_at LIMIT $1`,
      [limit],
    );
    for (const { id } of due) {
      try {
        await this.deliver(id);
      } catch (e) {
        this.logger.error(`webhook ${id} dispatch failed: ${(e as Error).message}`);
      }
    }
    return due.length;
  }

  @Interval('merchant-webhooks', 5000)
  async job(): Promise<void> {
    await this.jobs.run('merchant-webhooks', () => this.dispatchDue());
  }

  /** Manual redeliver of an exhausted event (same payload and event id). */
  async redeliver(id: string): Promise<MerchantWebhookEventDto> {
    const r = await this.ds.manager.update(MerchantWebhookEvent, { id, status: 'Exhausted' }, { status: 'Retrying', nextAttemptAt: new Date() });
    if (!r.affected) {
      if (!(await this.ds.manager.exists(MerchantWebhookEvent, { where: { id } }))) throw notFound('Webhook event');
      throw new AppError('STATE_CHANGED', 'Only exhausted events can be redelivered.');
    }
    return this.toDto(await this.ds.manager.findOneOrFail(MerchantWebhookEvent, { where: { id } }));
  }

  private toDto(e: MerchantWebhookEvent): MerchantWebhookEventDto {
    return {
      id: e.id,
      eventType: e.eventType,
      status: e.status,
      attempts: e.attempts,
      nextAttemptAt: e.nextAttemptAt?.toISOString() ?? null,
      lastHttpStatus: e.lastHttpStatus,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async recentFor(merchantId: string): Promise<MerchantWebhookEventDto[]> {
    const rows = await this.ds.manager.find(MerchantWebhookEvent, { where: { merchantId }, order: { createdAt: 'DESC' }, take: 20 });
    return rows.map((r) => this.toDto(r));
  }
}
