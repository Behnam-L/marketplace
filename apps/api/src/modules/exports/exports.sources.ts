import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ConsumersService } from '../consumers/consumers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { RefundsService } from '../refunds/refunds.service';
import { DocumentsService } from '../settlements/documents.service';
import { InvoicesService } from '../settlements/invoices.service';
import { WalletService } from '../wallet/wallet.service';
import { ExportsService } from './exports.service';

type Filters = Record<string, string>;
const num = (v?: string): number | undefined => (v === undefined || v === '' ? undefined : Number(v));

/** Wires each list's existing filters into the exporter (same filters as the screens). */
@Injectable()
export class ExportSources implements OnModuleInit {
  constructor(
    private readonly exportsSvc: ExportsService,
    private readonly orders: OrdersService,
    private readonly consumers: ConsumersService,
    private readonly refunds: RefundsService,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly documents: DocumentsService,
    private readonly invoices: InvoicesService,
    private readonly recon: ReconciliationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    const q = (f: Filters, cursor?: string) => ({ ...f, cursor, limit: num(f.limit) });
    this.exportsSvc.register('orders', {
      permission: 'orders.read',
      fetch: (f, c) => this.orders.list({ ...q(f, c), minAmount: num(f.minAmount), maxAmount: num(f.maxAmount) }),
    });
    this.exportsSvc.register('consumers', { permission: 'consumers.read', fetch: (f, c, pii) => this.consumers.list(q(f, c), pii) });
    this.exportsSvc.register('refunds', { permission: 'orders.read', fetch: (f, c) => this.refunds.list(q(f, c)) });
    this.exportsSvc.register('bank-transactions', { permission: 'transactions.read', fetch: (f, c) => this.payments.list(q(f, c)) });
    this.exportsSvc.register('provider-transactions', {
      permission: 'transactions.read',
      fetch: (f, c) => this.wallet.listPtx({ ...q(f, c), stuck: f.stuck === 'true' }),
    });
    this.exportsSvc.register('documents', {
      permission: 'documents.read',
      fetch: (f, c) => this.documents.list({ ...q(f, c), direction: f.direction as 'Payable' | 'Receivable' | undefined }),
    });
    this.exportsSvc.register('invoices', {
      permission: 'invoices.read',
      fetch: (f, c) => this.invoices.list({ ...q(f, c), direction: f.direction as 'Payable' | 'Receivable' | undefined }),
    });
    this.exportsSvc.register('reconciliation-items', { permission: 'reconciliation.read', fetch: (f, c) => this.recon.list(q(f, c)) });
    this.exportsSvc.register('audit-logs', { permission: 'audit.read', fetch: (f, c) => this.audit.list(q(f, c)) });
    this.exportsSvc.register('message-logs', { permission: 'messages.read', fetch: (f, c) => this.notifications.listLogs(q(f, c)) });
  }
}
