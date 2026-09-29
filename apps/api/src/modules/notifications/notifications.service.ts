import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  MessageEventDto,
  MessageLogDto,
  MessageTemplateDto,
  MessageTemplateInput,
  Page,
} from '@bajet/contracts';
import { AppError, notFound, validationError } from '../../shared/errors/app-error';
import { isUniqueViolation } from '../../shared/database/tx';
import { paginate } from '../../shared/database/pagination';
import { newId } from '../../shared/util/ids';
import { MessageLog, MessageTemplate } from './message.entity';
import { MESSAGE_EVENTS, MessageEvent, extractParams, render } from './message-events';
import { SMS_PROVIDERS, SmsProvider } from './sms/sms-provider';

export interface SendResult {
  messageLogId: string;
  provider: string;
}

export interface MessageLogQuery {
  cursor?: string;
  limit?: number;
  event?: string;
  status?: string;
  recipient?: string;
  from?: string;
  to?: string;
}

/** SMS delivery with primary → secondary failover, templates and message log (FR-150/151). */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(SMS_PROVIDERS) private readonly providers: SmsProvider[],
  ) {}

  async onModuleInit(): Promise<void> {
    // Flag templates whose event no longer exists in the catalog.
    const known = MESSAGE_EVENTS.map((e) => e.event);
    try {
      await this.ds.query(`UPDATE message_template SET orphaned = NOT (event = ANY($1))`, [known]);
    } catch {
      /* table may not exist before the first migration */
    }
  }

  /** True if at least one SMS provider is reachable. */
  isReachable(): boolean {
    return this.providers.some((p) => p.isHealthy());
  }

  /**
   * Sends an SMS. Throws `SMS_UNAVAILABLE` if all providers fail. The message body
   * is never persisted or logged (it may contain an OTP).
   */
  async sendSms(event: MessageEvent, recipient: string, params: Record<string, string>): Promise<SendResult> {
    const template = await this.ds.manager.findOne(MessageTemplate, {
      where: { event, channel: 'SMS', status: 'Active', orphaned: false },
    });
    const content = template?.content ?? MESSAGE_EVENTS.find((e) => e.event === event)!.fallback;
    const text = render(content, params);
    const logId = newId('msg');
    await this.ds.manager.insert(MessageLog, {
      id: logId,
      templateId: template?.id ?? null,
      event,
      recipient,
      status: 'Queued',
    });
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        const { messageId } = await provider.send(recipient, text);
        const now = new Date();
        // Mock providers deliver synchronously; real ones would confirm via DLR callbacks.
        await this.ds.manager.update(MessageLog, { id: logId }, {
          status: 'Delivered',
          provider: provider.name,
          providerMessageId: messageId,
          sentAt: now,
          deliveredAt: now,
          error: errors.length ? errors.join('; ').slice(0, 500) : null,
        });
        return { messageLogId: logId, provider: provider.name };
      } catch (e) {
        errors.push(`${provider.name}: ${(e as Error).message}`);
        this.logger.warn(`SMS provider ${provider.name} failed for event ${event}`);
      }
    }
    await this.ds.manager.update(MessageLog, { id: logId }, { status: 'Failed', error: errors.join('; ').slice(0, 500) });
    throw new AppError('SMS_UNAVAILABLE', "We couldn't send your code. Tap to try again.");
  }

  events(): MessageEventDto[] {
    return MESSAGE_EVENTS.map(({ event, requiredParams, description }) => ({ event, requiredParams, description }));
  }

  private toDto(t: MessageTemplate): MessageTemplateDto {
    return {
      id: t.id,
      event: t.event,
      channel: t.channel,
      name: t.name,
      content: t.content,
      params: t.params,
      status: t.status,
      orphaned: t.orphaned,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private validate(input: MessageTemplateInput): string[] {
    const def = MESSAGE_EVENTS.find((e) => e.event === input.event);
    if (!def) throw validationError('event', 'Unknown message event.');
    const params = extractParams(input.content);
    const missing = def.requiredParams.filter((p) => !params.includes(p));
    if (missing.length) {
      throw validationError('content', `Content must include the required parameters: ${missing.map((m) => `{{${m}}}`).join(', ')}.`);
    }
    return params;
  }

  async listTemplates(): Promise<MessageTemplateDto[]> {
    const rows = await this.ds.manager.find(MessageTemplate, { order: { createdAt: 'DESC' } });
    return rows.map((t) => this.toDto(t));
  }

  async getTemplate(id: string): Promise<MessageTemplateDto> {
    const t = await this.ds.manager.findOne(MessageTemplate, { where: { id } });
    if (!t) throw notFound('Template');
    return this.toDto(t);
  }

  async createTemplate(input: MessageTemplateInput): Promise<MessageTemplateDto> {
    const params = this.validate(input);
    const id = newId('tpl');
    try {
      await this.ds.manager.insert(MessageTemplate, { id, ...input, params, orphaned: false });
    } catch (e) {
      if (isUniqueViolation(e, 'uq_template_active')) {
        throw new AppError('DUPLICATE_ENTITY', 'An active template already exists for this event and channel.', { field: 'event' });
      }
      throw e;
    }
    return this.getTemplate(id);
  }

  async updateTemplate(id: string, input: Partial<MessageTemplateInput>): Promise<{ before: MessageTemplateDto; after: MessageTemplateDto }> {
    const before = await this.getTemplate(id);
    const merged: MessageTemplateInput = {
      event: input.event ?? before.event,
      channel: 'SMS',
      name: input.name ?? before.name,
      content: input.content ?? before.content,
      status: input.status ?? before.status,
    };
    const params = this.validate(merged);
    try {
      await this.ds.manager.update(MessageTemplate, { id }, { ...merged, params });
    } catch (e) {
      if (isUniqueViolation(e, 'uq_template_active')) {
        throw new AppError('DUPLICATE_ENTITY', 'An active template already exists for this event and channel.', { field: 'event' });
      }
      throw e;
    }
    return { before, after: await this.getTemplate(id) };
  }

  listLogs(q: MessageLogQuery): Promise<Page<MessageLogDto>> {
    const qb = this.ds.manager.createQueryBuilder(MessageLog, 'l');
    if (q.event) qb.andWhere('l.event = :event', { event: q.event });
    if (q.status) qb.andWhere('l.status = :status', { status: q.status });
    if (q.recipient) qb.andWhere('l.recipient = :recipient', { recipient: q.recipient });
    if (q.from) qb.andWhere('l.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('l.createdAt < :to', { to: q.to });
    return paginate(qb, 'l', q, (rows) =>
      rows.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        event: r.event,
        recipient: r.recipient,
        status: r.status,
        provider: r.provider,
        providerMessageId: r.providerMessageId,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        error: r.error,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }
}
