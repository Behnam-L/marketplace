import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { CreateApiKeyResponse, MerchantDetail, MerchantListItem, MerchantWebhookEventDto, Page } from '@bajet/contracts';
import { AdminAuth } from '../../shared/http/auth-context';
import { setAuditBefore, setAuditHint } from '../../shared/http/audit-context';
import { IfMatch } from '../../shared/http/request-meta';
import { Idempotent } from '../../shared/idempotency/idempotency.interceptor';
import { MerchantsService } from './merchants.service';
import { WebhooksService } from './webhooks.service';
import { MerchantDto, MerchantQueryDto, UpdateMerchantDto } from './merchants.dto';

@ApiTags('admin: merchants')
@Controller('admin')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get('merchants')
  @AdminAuth('merchants.read')
  list(@Query() q: MerchantQueryDto): Promise<Page<MerchantListItem>> {
    return this.merchants.list(q);
  }

  @Get('merchants/:id')
  @AdminAuth('merchants.read')
  get(@Param('id') id: string): Promise<MerchantDetail> {
    return this.merchants.get(id);
  }

  @Post('merchants')
  @Idempotent()
  @AdminAuth('merchants.manage')
  create(@Body() body: MerchantDto): Promise<MerchantDetail> {
    return this.merchants.create(body);
  }

  /** Partial update with `If-Match: <version>`; `status = Disabled` blocks new checkouts (FR-093). */
  @Patch('merchants/:id')
  @AdminAuth('merchants.manage')
  async update(@Param('id') id: string, @Body() body: UpdateMerchantDto, @IfMatch() version: number, @Req() req: Request): Promise<MerchantDetail> {
    const { before, after } = await this.merchants.update(id, body, version);
    setAuditBefore(req, before, 'Merchant', id);
    return after;
  }

  /** Secret is shown once. */
  @Post('merchants/:id/api-keys')
  @AdminAuth('merchants.credentials')
  async createKey(@Param('id') id: string, @Req() req: Request): Promise<CreateApiKeyResponse> {
    const key = await this.merchants.createKey(id);
    setAuditHint(req, { entityType: 'Merchant', entityId: id, action: 'Merchant.createApiKey' });
    return key;
  }

  @Delete('merchants/:id/api-keys/:keyId')
  @HttpCode(204)
  @AdminAuth('merchants.credentials')
  async revokeKey(@Param('id') id: string, @Param('keyId') keyId: string, @Req() req: Request): Promise<void> {
    await this.merchants.revokeKey(id, keyId);
    setAuditHint(req, { entityType: 'Merchant', entityId: id, action: 'Merchant.revokeApiKey', before: { keyId } });
  }

  @Post('merchant-webhook-events/:id/redeliver')
  @HttpCode(202)
  @AdminAuth('merchants.manage')
  redeliver(@Param('id') id: string): Promise<MerchantWebhookEventDto> {
    return this.webhooks.redeliver(id);
  }
}
