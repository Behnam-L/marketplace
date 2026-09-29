import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { CreateRefundResponse, MerchantRefundResponse, Page, RefundDetail, RefundListItem } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, CurrentMerchant, MerchantAuth, type AdminPrincipal, type MerchantPrincipal } from '../../shared/http/auth-context';
import { setAuditHint } from '../../shared/http/audit-context';
import { Idempotent } from '../../shared/idempotency/idempotency.interceptor';
import { RefundsService } from './refunds.service';
import { CreateRefundDto, RefundQueryDto, SetPayeeIbanDto } from './refunds.dto';

@ApiTags('merchant API')
@Controller('merchant')
export class MerchantRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  /** FR-070 (merchant). `202 {refundId, status}`. */
  @Post('orders/:orderId/refunds')
  @HttpCode(202)
  @Idempotent()
  @MerchantAuth()
  async create(@Param('orderId') orderId: string, @Body() body: CreateRefundDto, @CurrentMerchant() m: MerchantPrincipal): Promise<CreateRefundResponse> {
    const r = await this.refunds.create(orderId, body.amount, body.reason, { initiatedBy: 'Merchant', actorId: m.keyId, merchantId: m.merchantId });
    return { refundId: r.id, status: r.status };
  }

  @Get('refunds/:refundId')
  @MerchantAuth()
  get(@Param('refundId') id: string, @CurrentMerchant() m: MerchantPrincipal): Promise<MerchantRefundResponse> {
    return this.refunds.merchantView(m.merchantId, id);
  }
}

@ApiTags('admin: refunds')
@Controller('admin')
export class RefundsAdminController {
  constructor(private readonly refunds: RefundsService) {}

  @Post('orders/:orderId/refunds')
  @HttpCode(202)
  @Idempotent()
  @AdminAuth('refunds.create')
  async create(@Param('orderId') orderId: string, @Body() body: CreateRefundDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request): Promise<CreateRefundResponse & { id: string }> {
    const r = await this.refunds.create(orderId, body.amount, body.reason, { initiatedBy: 'Admin', actorId: admin.adminId });
    setAuditHint(req, { entityType: 'Refund', entityId: r.id, action: 'Refund.create' });
    return { id: r.id, refundId: r.id, status: r.status };
  }

  @Get('refunds')
  @AdminAuth('orders.read')
  list(@Query() q: RefundQueryDto): Promise<Page<RefundListItem>> {
    return this.refunds.list(q);
  }

  @Get('refunds/:id')
  @AdminAuth('orders.read')
  get(@Param('id') id: string): Promise<RefundDetail> {
    return this.refunds.detail(id);
  }

  /** E-32: Support enters the consumer's IBAN before the payable is invoiced. */
  @Patch('refund-legs/:id/payee')
  @AdminAuth('refunds.create')
  payee(@Param('id') id: string, @Body() body: SetPayeeIbanDto): Promise<RefundDetail> {
    return this.refunds.setPayeeIban(id, body.iban);
  }
}
