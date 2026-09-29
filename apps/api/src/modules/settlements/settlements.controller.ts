import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type {
  DocumentDetail,
  DocumentListItem,
  InvoiceDetail,
  InvoiceListItem,
  MerchantPlanDto as MerchantPlanView,
  Page,
  ProviderPlanDto as ProviderPlanView,
} from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { Idempotent } from '../../shared/idempotency/idempotency.interceptor';
import { PlansService } from './plans.service';
import { DocumentsService } from './documents.service';
import { InvoicesService } from './invoices.service';
import {
  CreateManualDocumentDto,
  DocumentActionDto,
  DocumentQueryDto,
  InvoiceQueryDto,
  MerchantPlanDto,
  PlanQueryDto,
  ProviderPlanDto,
  RecordPaymentDto,
  UpdateMerchantPlanDto,
  UpdateProviderPlanDto,
} from './settlements.dto';

function ifMatch(header?: string): number | undefined {
  const n = Number(header?.replace(/"/g, ''));
  return header && Number.isInteger(n) ? n : undefined;
}

@ApiTags('admin: settlement plans')
@Controller('admin')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get('provider-settlement-plans')
  @AdminAuth('plans.read')
  listProvider(@Query() q: PlanQueryDto): Promise<ProviderPlanView[]> {
    return this.plans.listProvider(q.status);
  }

  @Get('provider-settlement-plans/:id')
  @AdminAuth('plans.read')
  getProvider(@Param('id') id: string): Promise<ProviderPlanView> {
    return this.plans.getProvider(id);
  }

  @Post('provider-settlement-plans')
  @AdminAuth('plans.manage')
  createProvider(@Body() body: ProviderPlanDto): Promise<ProviderPlanView> {
    return this.plans.createProvider(body);
  }

  @Patch('provider-settlement-plans/:id')
  @AdminAuth('plans.manage')
  async updateProvider(@Param('id') id: string, @Body() body: UpdateProviderPlanDto, @Headers('if-match') im: string | undefined, @Req() req: Request): Promise<ProviderPlanView> {
    const { version, ...rest } = body;
    const { before, after } = await this.plans.updateProvider(id, rest, ifMatch(im) ?? version);
    setAuditBefore(req, before, 'ProviderSettlementPlan', id);
    return after;
  }

  @Post('provider-settlement-plans/:id/archive')
  @HttpCode(200)
  @AdminAuth('plans.manage')
  archiveProvider(@Param('id') id: string): Promise<ProviderPlanView | MerchantPlanView> {
    return this.plans.archive('provider', id);
  }

  @Get('merchant-settlement-plans')
  @AdminAuth('plans.read')
  listMerchant(@Query() q: PlanQueryDto): Promise<MerchantPlanView[]> {
    return this.plans.listMerchant(q.status);
  }

  @Get('merchant-settlement-plans/:id')
  @AdminAuth('plans.read')
  getMerchant(@Param('id') id: string): Promise<MerchantPlanView> {
    return this.plans.getMerchant(id);
  }

  @Post('merchant-settlement-plans')
  @AdminAuth('plans.manage')
  createMerchant(@Body() body: MerchantPlanDto): Promise<MerchantPlanView> {
    return this.plans.createMerchant(body);
  }

  @Patch('merchant-settlement-plans/:id')
  @AdminAuth('plans.manage')
  async updateMerchant(@Param('id') id: string, @Body() body: UpdateMerchantPlanDto, @Headers('if-match') im: string | undefined, @Req() req: Request): Promise<MerchantPlanView> {
    const { version, ...rest } = body;
    const { before, after } = await this.plans.updateMerchant(id, rest, ifMatch(im) ?? version);
    setAuditBefore(req, before, 'MerchantSettlementPlan', id);
    return after;
  }

  @Post('merchant-settlement-plans/:id/archive')
  @HttpCode(200)
  @AdminAuth('plans.manage')
  archiveMerchant(@Param('id') id: string): Promise<ProviderPlanView | MerchantPlanView> {
    return this.plans.archive('merchant', id);
  }
}

@ApiTags('admin: documents & invoices')
@Controller('admin')
export class SettlementsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('documents')
  @AdminAuth('documents.read')
  listDocuments(@Query() q: DocumentQueryDto): Promise<Page<DocumentListItem>> {
    return this.documents.list(q);
  }

  @Get('documents/:id')
  @AdminAuth('documents.read')
  getDocument(@Param('id') id: string): Promise<DocumentDetail> {
    return this.documents.get(id);
  }

  @Post('documents')
  @Idempotent()
  @AdminAuth('documents.manual')
  createDocument(@Body() body: CreateManualDocumentDto, @CurrentAdmin() admin: AdminPrincipal): Promise<DocumentDetail> {
    return this.documents.createManual(body, admin.adminId);
  }

  @Post('documents/:id/approve')
  @HttpCode(200)
  @AdminAuth('documents.approve')
  approve(@Param('id') id: string, @Body() body: DocumentActionDto, @CurrentAdmin() admin: AdminPrincipal): Promise<DocumentDetail> {
    return this.documents.approve(id, admin.adminId, body.note);
  }

  @Post('documents/:id/reject')
  @HttpCode(200)
  @AdminAuth('documents.approve')
  reject(@Param('id') id: string, @Body() body: DocumentActionDto, @CurrentAdmin() admin: AdminPrincipal): Promise<DocumentDetail> {
    return this.documents.reject(id, admin.adminId, body.note);
  }

  @Post('documents/:id/cancel')
  @HttpCode(200)
  @AdminAuth('documents.manual')
  cancel(@Param('id') id: string, @Body() body: DocumentActionDto): Promise<DocumentDetail> {
    return this.documents.cancel(id, body.note);
  }

  @Get('invoices')
  @AdminAuth('invoices.read')
  listInvoices(@Query() q: InvoiceQueryDto): Promise<Page<InvoiceListItem>> {
    return this.invoices.list(q);
  }

  @Get('invoices/:id')
  @AdminAuth('invoices.read')
  getInvoice(@Param('id') id: string): Promise<InvoiceDetail> {
    return this.invoices.get(id);
  }

  @Post('invoices/:id/mark-sent')
  @HttpCode(200)
  @AdminAuth('invoices.settle')
  markSent(@Param('id') id: string): Promise<InvoiceDetail> {
    return this.invoices.markSent(id);
  }

  @Post('invoices/:id/payments')
  @HttpCode(200)
  @Idempotent()
  @AdminAuth('invoices.settle')
  pay(@Param('id') id: string, @Body() body: RecordPaymentDto, @CurrentAdmin() admin: AdminPrincipal): Promise<InvoiceDetail> {
    return this.invoices.recordPayment(id, body, admin.adminId);
  }
}
