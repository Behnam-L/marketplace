import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import {
  normalisePhone,
  type AllocationStatus,
  type MerchantOrderResponse,
  type MerchantWebhookEventType,
  type MerchantWebhookPayload,
  type OrderDetail,
  type OrderFailureReason,
  type OrderListItem,
  type OrderStatus,
  type Page,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged } from '../../shared/errors/app-error';
import { paginate } from '../../shared/database/pagination';
import { newId } from '../../shared/util/ids';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import { ConsumersService } from '../consumers/consumers.service';
import { CreditProvidersService } from '../credit-providers/credit-providers.service';
import { MerchantsService } from '../merchants/merchants.service';
import { WebhooksService } from '../merchants/webhooks.service';
import { PaymentsService } from '../payments/payments.service';
import { CounterpartyRegistry } from '../settlements/counterparties';
import { DocumentsService } from '../settlements/documents.service';
import { SettlementTermsService } from '../settlements/settlement-terms.service';
import type { SettlementTermsSnapshot } from '../settlements/snapshot';
import { WalletService } from '../wallet/wallet.service';
import type { CreditReservation } from '../wallet/wallet.entity';
import { Order, OrderEvent } from './order.entity';
import { canTransition, isTerminal, releasesReservations } from './order-state';

/** A transaction with post-commit actions (outbox dispatch, BR-ORD-04). */
export interface Uow {
  m: EntityManager;
  after: (() => Promise<void>)[];
}

export interface TransitionOptions {
  /** CAS on version (consumer mutations pass `If-Match`). */
  version?: number;
  actor: string;
  reason?: string | null;
  set?: Partial<Order>;
}

export interface OrderQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  allocationStatus?: string;
  refundStatus?: string;
  merchantId?: string;
  providerId?: string;
  phone?: string;
  orderNumber?: string;
  consumerId?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
}

const WEBHOOK_FOR: Partial<Record<OrderStatus, MerchantWebhookEventType>> = {
  Completed: 'order.completed',
  Cancelled: 'order.cancelled',
  Expired: 'order.expired',
  Failed: 'order.failed',
};

/** Order aggregate: CAS state machine (BR-ORD-03), completion (FR-050/052), views. */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  private refundLookup: (orderId: string) => Promise<OrderDetail['refunds']> = () => Promise.resolve([]);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly merchants: MerchantsService,
    private readonly webhooks: WebhooksService,
    private readonly providers: CreditProvidersService,
    private readonly consumers: ConsumersService,
    private readonly ledger: LedgerService,
    private readonly documents: DocumentsService,
    private readonly terms: SettlementTermsService,
    private readonly counterparties: CounterpartyRegistry,
  ) {}

  onModuleInit(): void {
    this.wallet.registerHooks({
      onAllocationConfirmed: (m, res) => this.onAllocationConfirmed(m, res),
      onAllocationExhausted: (m, res) => this.refreshAllocationStatus(m, res.orderId),
    });
    this.counterparties.registerOrderTotalLookup(async (id) => (await this.ds.manager.findOne(Order, { where: { id } }))?.totalAmount ?? null);
    this.consumers.registerInsights({
      orders: async (consumerId) => (await this.list({ consumerId, limit: 20 })).items,
      linkedProviders: (consumerId) => this.wallet.linkedProviders(consumerId),
    });
  }

  /** The refunds module registers how to list an order's refunds (no import cycle). */
  registerRefundLookup(fn: (orderId: string) => Promise<OrderDetail['refunds']>): void {
    this.refundLookup = fn;
  }

  /** Runs `fn` in a transaction and then its post-commit actions. */
  async inTx<T>(fn: (u: Uow) => Promise<T>): Promise<T> {
    const after: (() => Promise<void>)[] = [];
    const result = await this.ds.transaction('READ COMMITTED', (m) => fn({ m, after }));
    for (const a of after) {
      try {
        await a();
      } catch (e) {
        this.logger.error(`post-commit action failed: ${(e as Error).message}`);
      }
    }
    return result;
  }

  get(id: string, m: EntityManager = this.ds.manager): Promise<Order | null> {
    return m.findOne(Order, { where: { id } });
  }

  async mustGet(id: string, m: EntityManager = this.ds.manager): Promise<Order> {
    const o = await this.get(id, m);
    if (!o) throw notFound('Order');
    return o;
  }

  /** Row lock (refunds: refundable computed under the order row lock, FR-070). */
  async lock(m: EntityManager, id: string): Promise<Order> {
    const o = await m.findOne(Order, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!o) throw notFound('Order');
    return o;
  }

  /** BR-ORD-01: the non-terminal-or-Completed order holding this order number. */
  findActiveByNumber(merchantId: string, orderNumber: string): Promise<Order | null> {
    return this.ds.manager.findOne(Order, {
      where: { merchantId, merchantOrderNumber: orderNumber, status: Not(In(['Cancelled', 'Expired', 'Failed'])) },
    });
  }

  findByTokenHash(hash: string): Promise<Order | null> {
    return this.ds.manager.findOne(Order, { where: { checkoutTokenHash: hash } });
  }

  async insert(m: EntityManager, order: Order, actor: string): Promise<void> {
    await m.insert(Order, order);
    await m.insert(OrderEvent, { id: newId('oev'), orderId: order.id, fromStatus: null, toStatus: order.status, actor, reason: null });
  }

  async addEvent(m: EntityManager, orderId: string, from: OrderStatus | null, to: OrderStatus, actor: string, reason: string | null): Promise<void> {
    await m.insert(OrderEvent, { id: newId('oev'), orderId, fromStatus: from, toStatus: to, actor, reason: reason?.slice(0, 300) ?? null });
  }

  /**
   * Compare-and-swap transition (BR-ORD-03): locks the row, checks status (and
   * version), updates with version+1 and appends an OrderEvent — in one transaction.
   * Releases reservations / abandons identity / enqueues webhooks as §5.1 requires.
   */
  async transition(u: Uow, orderId: string, from: OrderStatus | readonly OrderStatus[], to: OrderStatus, opts: TransitionOptions): Promise<Order> {
    const fromList = Array.isArray(from) ? from : [from as OrderStatus];
    const current = await u.m.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
    if (!current) throw notFound('Order');
    if (!fromList.includes(current.status) || (opts.version !== undefined && current.version !== opts.version)) {
      throw stateChanged({ status: current.status, version: current.version });
    }
    if (!canTransition(current.status, to)) throw stateChanged({ status: current.status, version: current.version });
    const set = { ...(opts.set ?? {}), status: to, version: current.version + 1 };
    const r = await u.m.update(Order, { id: orderId, version: current.version }, set);
    if (!r.affected) throw stateChanged();
    await this.addEvent(u.m, orderId, current.status, to, opts.actor, opts.reason ?? (opts.set?.failureReason as string | undefined) ?? null);
    const updated = { ...current, ...set } as Order;
    if (releasesReservations(current.status, to)) {
      const ptxIds = await this.wallet.releaseAll(u.m, orderId);
      if (ptxIds.length) u.after.push(() => this.wallet.dispatch(ptxIds));
    }
    if (isTerminal(to)) {
      await this.consumers.abandonPendingForOrder(u.m, orderId);
      const type = WEBHOOK_FOR[to];
      if (type && to !== 'Completed') await this.enqueueWebhook(u.m, updated, type);
    }
    return updated;
  }

  /** Transition helper that owns its transaction. */
  transitionTx(orderId: string, from: OrderStatus | readonly OrderStatus[], to: OrderStatus, opts: TransitionOptions): Promise<Order> {
    return this.inTx((u) => this.transition(u, orderId, from, to, opts));
  }

  fail(u: Uow, orderId: string, from: OrderStatus | readonly OrderStatus[], reason: OrderFailureReason, actor: string): Promise<Order> {
    return this.transition(u, orderId, from, 'Failed', { actor, set: { failureReason: reason }, reason });
  }

  webhookData(o: Order): MerchantWebhookPayload['data'] {
    return {
      orderId: o.id,
      orderNumber: o.merchantOrderNumber,
      status: o.status,
      failureReason: o.failureReason,
      totalAmount: o.totalAmount,
      cashAmount: o.cashAmount,
      creditAmount: o.creditAmount,
      allocationStatus: o.allocationStatus,
    };
  }

  async enqueueWebhook(m: EntityManager, o: Order, type: MerchantWebhookEventType, extra: Partial<MerchantWebhookPayload['data']> = {}): Promise<void> {
    const merchant = await this.merchants.forCheckout(o.merchantId, m);
    await this.webhooks.enqueue(m, {
      merchantId: o.merchantId,
      targetUrl: o.callbackUrl ?? merchant?.webhookUrl ?? null,
      type,
      data: { ...this.webhookData(o), ...extra },
    });
  }

  /* ─────────── Allocation and completion (FR-050/052) ─────────── */

  private computeAllocationStatus(reservations: CreditReservation[]): AllocationStatus {
    const relevant = reservations.filter((r) => ['AllocationPending', 'Allocated', 'NeedsReconciliation'].includes(r.status) && (r.status !== 'NeedsReconciliation' || r.reconDirection === 'Allocation'));
    if (relevant.length === 0) return 'NotApplicable';
    if (relevant.every((r) => r.status === 'Allocated')) return 'Confirmed';
    if (relevant.some((r) => r.status === 'NeedsReconciliation')) return 'NeedsReconciliation';
    return 'Pending';
  }

  private async postAllocation(m: EntityManager, order: Order, res: CreditReservation): Promise<void> {
    const snapshot = order.settlementTermsSnapshot!;
    const terms = snapshot.providers[res.providerId];
    if (!terms) return;
    await this.ledger.post(m, {
      eventType: 'AllocationConfirmed',
      sourceType: 'CreditReservation',
      sourceId: res.id,
      lines: [
        { account: Accounts.provider(res.providerId), debit: res.amount - terms.marginAmount },
        { account: Accounts.providerMarginExpense, debit: terms.marginAmount },
        { account: Accounts.allocationSuspense, credit: res.amount },
      ],
    });
    await this.documents.createProviderDocuments(m, order.id, res.providerId, snapshot);
  }

  /** Wallet hook (inside the allocation transaction); serialised with completion by the order row lock. */
  private async onAllocationConfirmed(m: EntityManager, res: CreditReservation): Promise<void> {
    const order = await m.findOne(Order, { where: { id: res.orderId }, lock: { mode: 'pessimistic_write' } });
    if (!order || order.status !== 'Completed') return; // completion will post it
    await this.postAllocation(m, order, res);
    await this.refreshAllocationStatus(m, order.id);
  }

  private async refreshAllocationStatus(m: EntityManager, orderId: string): Promise<void> {
    const order = await m.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
    if (!order || order.status !== 'Completed' || order.allocationStatus === 'NotApplicable') return;
    const next = this.computeAllocationStatus(await this.wallet.reservationsOf(orderId, m));
    if (next !== order.allocationStatus) {
      await m.update(Order, { id: orderId }, { allocationStatus: next, version: order.version + 1 });
      await this.addEvent(m, orderId, 'Completed', 'Completed', 'system', `allocationStatus ${order.allocationStatus} → ${next}`);
    }
  }

  /**
   * FR-050: one synchronous allocation pass, then `Completed` (same rule for
   * cash-only orders). Unconfirmed allocations keep retrying in the background.
   */
  async allocateAndComplete(orderId: string): Promise<Order> {
    const ptxIds = await this.inTx(async (u) => {
      const o = await this.lock(u.m, orderId);
      if (o.status !== 'AllocationInProgress') return [];
      return this.wallet.prepareAllocations(u.m, orderId);
    });
    await this.wallet.dispatch(ptxIds);
    return this.inTx(async (u) => {
      const o = await this.lock(u.m, orderId);
      if (o.status !== 'AllocationInProgress') return o;
      const reservations = (await this.wallet.reservationsOf(orderId, u.m)).filter((r) =>
        ['AllocationPending', 'Allocated', 'NeedsReconciliation'].includes(r.status),
      );
      const merchant = await this.merchants.forCheckout(o.merchantId, u.m);
      const providerRows = await this.providers.byIds(reservations.map((r) => r.providerId), u.m);
      const claimed = o.claimedBankTransactionId ? await this.payments.get(o.claimedBankTransactionId, u.m) : null;
      const completedAt = new Date();
      const snapshot: SettlementTermsSnapshot = await this.terms.buildSnapshot(u.m, {
        completedAt,
        totalAmount: o.totalAmount,
        cashAmount: o.cashAmount ?? 0,
        gatewayCode: claimed?.gatewayCode ?? null,
        merchant: { merchantId: o.merchantId, planId: merchant!.merchantSettlementPlanId },
        providers: reservations.map((r) => ({
          providerId: r.providerId,
          planId: providerRows.find((p) => p.id === r.providerId)!.providerSettlementPlanId,
          creditAmount: r.amount,
        })),
      });
      const allocationStatus = this.computeAllocationStatus(reservations);
      const done = await this.transition(u, orderId, 'AllocationInProgress', 'Completed', {
        actor: 'system',
        set: { completedAt, settlementTermsSnapshot: snapshot, allocationStatus },
      });
      const cash = o.cashAmount ?? 0;
      const credit = o.creditAmount ?? 0;
      const commission = snapshot.merchant.commissionAmount;
      await this.ledger.post(u.m, {
        eventType: 'OrderCompleted',
        sourceType: 'Order',
        sourceId: orderId,
        lines: [
          ...(cash > 0 ? [{ account: Accounts.pspClearing(snapshot.gatewayCode ?? 'UNKNOWN'), debit: cash }] : []),
          { account: Accounts.allocationSuspense, debit: credit },
          { account: Accounts.merchant(o.merchantId), credit: o.totalAmount - commission },
          { account: Accounts.commissionRevenue, credit: commission },
        ],
      });
      await this.documents.createMerchantDocuments(u.m, orderId, snapshot);
      for (const r of reservations.filter((x) => x.status === 'Allocated')) await this.postAllocation(u.m, done, r);
      await this.consumers.touchTransaction(u.m, o.consumerUserId);
      await this.enqueueWebhook(u.m, done, 'order.completed');
      return done;
    });
  }

  /* ─────────── Views ─────────── */

  async toListItems(rows: Order[]): Promise<OrderListItem[]> {
    const names = await this.merchants.names(rows.map((r) => r.merchantId));
    const byOrder = await this.wallet.providerCounts(rows.map((r) => r.id));
    return rows.map((o) => ({
      id: o.id,
      merchantOrderNumber: o.merchantOrderNumber,
      merchantId: o.merchantId,
      merchantName: names.get(o.merchantId) ?? o.merchantId,
      totalAmount: o.totalAmount,
      cashAmount: o.cashAmount,
      creditAmount: o.creditAmount,
      providerCount: byOrder.get(o.id) ?? 0,
      status: o.status,
      failureReason: o.failureReason,
      allocationStatus: o.allocationStatus,
      refundStatus: o.refundStatus,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async list(q: OrderQuery): Promise<Page<OrderListItem>> {
    const qb = this.ds.manager.createQueryBuilder(Order, 'o');
    if (q.status) qb.andWhere('o.status = :status', { status: q.status });
    if (q.allocationStatus) qb.andWhere('o.allocationStatus = :as', { as: q.allocationStatus });
    if (q.refundStatus) qb.andWhere('o.refundStatus = :rs', { rs: q.refundStatus });
    if (q.merchantId) qb.andWhere('o.merchantId = :mid', { mid: q.merchantId });
    if (q.orderNumber) qb.andWhere('(o.merchantOrderNumber = :num OR o.id = :num)', { num: q.orderNumber });
    if (q.consumerId) qb.andWhere('o.consumerUserId = :cid', { cid: q.consumerId });
    if (q.from) qb.andWhere('o.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('o.createdAt < :to', { to: q.to });
    if (q.minAmount !== undefined) qb.andWhere('o.totalAmount >= :min', { min: q.minAmount });
    if (q.maxAmount !== undefined) qb.andWhere('o.totalAmount <= :max', { max: q.maxAmount });
    if (q.phone) {
      const phone = normalisePhone(q.phone) ?? q.phone;
      qb.andWhere('o.consumerUserId = :pc', { pc: (await this.consumers.idByPhone(phone)) ?? '-' });
    }
    if (q.providerId) {
      const ids = await this.wallet.orderIdsForProvider(q.providerId);
      qb.andWhere('o.id IN (:...pids)', { pids: ids.length ? ids : ['-'] });
    }
    return paginate(qb, 'o', q, (rows) => this.toListItems(rows));
  }

  async events(orderId: string): Promise<OrderEvent[]> {
    return this.ds.manager.find(OrderEvent, { where: { orderId }, order: { createdAt: 'ASC' } });
  }

  async detail(id: string, pii: boolean): Promise<OrderDetail> {
    const o = await this.mustGet(id);
    const [item] = await this.toListItems([o]);
    const consumer = await this.consumers.get(o.consumerUserId);
    const btx = await this.payments.forOrder(id);
    return {
      ...item,
      consumer: consumer
        ? {
            id: consumer.id,
            phone: pii ? consumer.phoneE164 : consumer.phoneE164.replace(/^\+98(\d{3})\d{3}(\d{4})$/, '0$1***$2'),
            firstName: consumer.firstName,
            lastName: consumer.lastName,
          }
        : null,
      cashPaymentBps: o.cashPaymentBps,
      refundedAmount: o.refundedAmount,
      sessionExpiresAt: o.sessionExpiresAt.toISOString(),
      paymentDeadlineAt: o.paymentDeadlineAt?.toISOString() ?? null,
      completedAt: o.completedAt?.toISOString() ?? null,
      inquiryAttempts: o.inquiryAttempts,
      reservationAttempts: o.reservationAttempts,
      returnUrl: o.returnUrl,
      callbackUrl: o.callbackUrl,
      termsVersion: o.termsVersion,
      termsAcceptedAt: o.termsAcceptedAt?.toISOString() ?? null,
      settlementTermsSnapshot: o.settlementTermsSnapshot,
      version: o.version,
      reservations: await this.wallet.reservationDtos(id),
      bankTransactions: btx.map((b) => this.payments.toListItem(b)),
      providerTransactions: await this.wallet.ptxForOrder(id),
      documents: await this.documents.forOrder(id),
      refunds: await this.refundLookup(id),
      events: (await this.events(id)).map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actor: e.actor,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /** FR-003 merchant status view. Another merchant's order → 404. */
  async merchantView(merchantId: string, where: { id?: string; orderNumber?: string }): Promise<MerchantOrderResponse> {
    let o: Order | null = null;
    if (where.id) o = await this.ds.manager.findOne(Order, { where: { id: where.id, merchantId } });
    else if (where.orderNumber) {
      o = await this.ds.manager.findOne(Order, { where: { merchantId, merchantOrderNumber: where.orderNumber }, order: { createdAt: 'DESC' } });
    }
    if (!o) throw notFound('Order');
    return {
      orderId: o.id,
      orderNumber: o.merchantOrderNumber,
      status: o.status,
      failureReason: o.failureReason,
      totalAmount: o.totalAmount,
      cashAmount: o.cashAmount,
      creditAmount: o.creditAmount,
      allocationStatus: o.allocationStatus,
      refundStatus: o.refundStatus,
      refundedAmount: o.refundedAmount,
      completedAt: o.completedAt?.toISOString() ?? null,
      refunds: (await this.refundLookup(o.id)).map((r) => ({ refundId: r.id, amount: r.amount, status: r.status, createdAt: r.createdAt })),
    };
  }

  /** Orders due for expiry processing (DB time, BR-ORD-02). */
  async dueForExpiry(): Promise<{ preConfirm: Order[]; payment: Order[] }> {
    const preConfirm = await this.ds.manager
      .createQueryBuilder(Order, 'o')
      .where(`o.status IN ('AwaitingOtp', 'AwaitingIdentity', 'CreditInquiryInProgress', 'AwaitingSupplierSelection')`)
      .andWhere('o.sessionExpiresAt <= now()')
      .limit(200)
      .getMany();
    const payment = await this.ds.manager
      .createQueryBuilder(Order, 'o')
      .where(`o.status IN ('ReservationInProgress', 'AwaitingBankPayment')`)
      .andWhere('o.paymentDeadlineAt <= now()')
      .limit(200)
      .getMany();
    return { preConfirm, payment };
  }

  byStatus(statuses: OrderStatus[], limit = 200): Promise<Order[]> {
    return this.ds.manager.find(Order, { where: { status: In(statuses) }, take: limit, order: { updatedAt: 'ASC' } });
  }

  async isPastDeadline(orderId: string, m: EntityManager = this.ds.manager): Promise<boolean> {
    const r: { past: boolean }[] = await m.query(`SELECT (payment_deadline_at IS NOT NULL AND payment_deadline_at <= now()) AS past FROM "order" WHERE id = $1`, [orderId]);
    return r[0]?.past ?? false;
  }

  async isSessionExpired(orderId: string, m: EntityManager = this.ds.manager): Promise<boolean> {
    const r: { past: boolean }[] = await m.query(`SELECT session_expires_at <= now() AS past FROM "order" WHERE id = $1`, [orderId]);
    return r[0]?.past ?? false;
  }

  assertNotTerminalForRefund(o: Order): void {
    if (o.status !== 'Completed') throw new AppError('STATE_CHANGED', 'Only completed orders can be refunded.');
  }
}
