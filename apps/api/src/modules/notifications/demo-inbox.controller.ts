import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { normalisePhone } from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError } from '../../shared/errors/app-error';
import { SMS_INBOX } from './notifications.tokens';
import type { InboxMessage } from './sms/sms-provider';

/**
 * Demo-only mock SMS inbox (MOCK_INTEGRATIONS=true) so the offline build can be
 * exercised end-to-end. Disabled when real integrations are configured.
 */
@ApiExcludeController()
@Controller('demo/sms')
export class DemoInboxController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SMS_INBOX) private readonly inbox: InboxMessage[],
  ) {}

  @Get()
  list(@Query('phone') phone?: string): InboxMessage[] {
    if (!this.config.mockIntegrations) throw new AppError('NOT_FOUND', 'Not found.');
    const e164 = phone ? normalisePhone(phone) : null;
    return this.inbox.filter((m) => !e164 || m.to === e164).slice(-20).reverse();
  }
}
