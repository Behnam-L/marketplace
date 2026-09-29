import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import {
  isValidIban,
  maskIban,
  toAsciiDigits,
  type MerchantRefundResponse,
  type Page,
  type RefundDetail,
  type RefundListItem,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged, validationError } from '../../shared/errors/app-error';
import { paginate } from '../../shared/database/pagination';
import { CryptoService } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import { CreditProvidersService } from '../credit-providers/credit-providers.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import type { BankTransaction } from '../payments/payment.entity';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { DocumentsService, type RefundDocInput } from '../settlements/documents.service';
import { WalletService } from '../wallet/wallet.service';
import type { ProviderTransaction } from '../wallet/wallet.entity';
import { Refund, RefundLeg } from './refund.entity';
import { splitRefund } from './refund-math';

export interface RefundInitiatorInput {
  initiatedBy: 'Merchant' | 'Admin';
  actorId: string;
  merchantId?: string;
}

export interface RefundQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  orderId?: string;
  merchantId?: string;
  from?: string;
  to?: string;
}

const COUNTED = Not(In(['Failed', 'Rejected']));

/** Refunds (FR-070/071, BR-RFD, BR-LED-06). */
@Injectable()
export class RefundsService implements OnModuleInit {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly orders: OrdersService,
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly documents: DocumentsService,
    private readonly ledger: LedgerService,
    private readonly recon: ReconciliationService,
    private readonly providers: CreditProvidersService,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit(): void {
    this.wallet.registerHooks({ onReversalFinal: (m, ptx, outcome) => this.onReversalFinal(m, ptx, outcome) });
    this.payments.registerHooks({ onRefundFinal: (m, btx) => this.onRefundFinal(m, btx) });
    this.orders.registerRefundLookup(async (orderId) => this.toList(await this.ds.manager.find(Refund, { where: { orderId }, order: { createdAt: 'ASC' } })));
    this.recon.registerRedrive(['REVERSAL_REJECTED', 'REFUND_LEG_FAILED'], async (item) => {
      const legId = item.refs.refundLegId;
      if (!legId) return false;
      const leg = await this.ds.manager.findOne(RefundLeg, { where: { id: legId } });
      if (!leg || leg.status !== 'NeedsReconciliation') return false;
      await this.ds.manager.update(RefundLeg, { id: legId }, { status: 'Pending' });
      await this.startLeg(legId);
      return (await this.ds.manager.findOne(RefundLeg, { where: { id: legId } }))?.status === 'Succeeded';
    });
  }

  /* ─────────── Create (FR-070) ─────────── */

  async create(orderId: string, amount: number, reason: string, who: RefundInitiatorInput): Promise<Refund> {
    const refund = await this.orders.inTx(async (u) => {
      const o = await this.orders.lock(u.m, orderId); // refundable computed under the order row lock (AC3)
      if (who.merchantId && o.merchantId !== who.merchantId) throw notFound('Order');
      if (o.status !== 'Completed') throw new AppError('STATE_CHANGED', 'Only completed orders can be refunded.');
      if (o.allocationStatus !== 'Confirmed' && o.allocationStatus !== 'NotApplicable') {
        throw new AppError('ALLOCATION_PENDING', 'This order cannot be refunded until all credit allocations are confirmed.');
      }
      const prior = await u.m.find(Refund, { where: { orderId, status: COUNTED } });
      const previous = prior.reduce((a, r) => a + r.amount, 0);
      const refundable = o.totalAmount - previous;
      if (amount > refundable) {
        throw new AppError('REFUND_EXCEEDS_REFUNDABLE', 'The refund amount exceeds the refundable amount.', { refundable });
      }
      const s = o.settlementTermsSnapshot!;
      const split = splitRefund(
        {
          totalAmount: o.totalAmount,
          cashAmount: o.cashAmount ?? 0,
          commissionAmount: s.merchant.commissionAmount,
          providers: Object.entries(s.providers).map(([providerId, p]) => ({ providerId, creditAmount: p.creditAmount, marginAmount: p.marginAmount })),
        },
        previous,
        amount,
      );
      const r = u.m.create(Refund, {
        id: newId('rfd'),
        orderId,
        merchantId: o.merchantId,
        amount,
        cumulativeAmount: previous + amount,
        merchantMarginRefund: split.merchantMargin,
        status: 'Requested',
        initiatedBy: who.initiatedBy,
        actorId: who.actorId,
        reason: reason.trim().slice(0, 500),
        version: 1,
      });
      await u.m.insert(Refund, r);
      const reservations = await this.wallet.reservationsOf(orderId, u.m);
      const claimed = o.claimedBankTransactionId ? await this.payments.get(o.claimedBankTransactionId, u.m) : null;
      const viaGateway = claimed ? await this.payments.gatewaySupportsRefund(claimed.gatewayCode) : false;
      await u.m.insert(RefundLeg, {
        id: newId('rfl'),
        refundId: r.id,
        legType: 'Cash',
        providerId: null,
        reservationId: null,
        amount: split.cash,
        providerMarginRefund: 0,
        status: split.cash === 0 ? 'Succeeded' : 'Pending',
        viaGateway: viaGateway && split.cash > 0,
        gatewayCode: claimed?.gatewayCode ?? null,
      });
      for (const p of split.providers) {
        const res = reservations.find((x) => x.providerId === p.providerId && x.status === 'Allocated');
        await u.m.insert(RefundLeg, {
          id: newId('rfl'),
          refundId: r.id,
          legType: 'Credit',
          providerId: p.providerId,
          reservationId: res?.id ?? null,
          amount: p.amount,
          providerMarginRefund: p.margin,
          status: p.amount === 0 ? 'Succeeded' : 'Pending',
          viaGateway: false,
          gatewayCode: null,
        });
      }
      const refunded = previous + amount;
      await u.m.query(`UPDATE "order" SET refunded_amount = $2, refund_status = $3, version = version + 1, updated_at = now() WHERE id = $1`, [
        orderId,
        refunded,
        refunded >= o.totalAmount ? 'Full' : 'Partial',
      ]);
      await this.orders.addEvent(u.m, orderId, 'Completed', 'Completed', who.initiatedBy === 'Admin' ? `admin:${who.actorId}` : 'merchant', `REFUND ${r.id} ${amount}`);
      return r;
    });
    await this.execute(refund.id);
    return (await this.ds.manager.findOne(Refund, { where: { id: refund.id } }))!;
  }

  /* ─────────── Execute legs (FR-071) ─────────── */

  async execute(refundId: string): Promise<void> {
    const r = await this.ds.manager.update(Refund, { id: refundId, status: 'Requested' }, { status: 'Processing', version: () => 'version + 1' });
    if (!r.affected) return;
    const legs = await this.ds.manager.find(RefundLeg, { where: { refundId, status: 'Pending' } });
    // Validation at execution: every credit leg needs a confirmed allocation (§5.7 Requested → Rejected).
    if (legs.some((l) => l.legType === 'Credit' && !l.reservationId)) {
      await this.reject(refundId, 'NO_CONFIRMED_ALLOCATION');
      return;
    }
    for (const leg of legs) await this.startLeg(leg.id);
    await this.ds.transaction((m) => this.checkComplete(m, refundId));
  }

  private async startLeg(legId: string): Promise<void> {
    const leg = await this.ds.manager.findOne(RefundLeg, { where: { id: legId } });
    if (!leg || leg.status !== 'Pending') return;
    const refund = await this.ds.manager.findOneOrFail(Refund, { where: { id: leg.refundId } });
    if (leg.legType === 'Credit') {
      const ptxId = await this.ds.transaction((m) =>
        this.wallet.createReversal(m, { orderId: refund.orderId, reservationId: leg.reservationId!, refundLegId: leg.id, providerId: leg.providerId!, amount: leg.amount }),
      );
      await this.wallet.dispatch([ptxId]);
      return;
    }
    if (leg.viaGateway && leg.gatewayCode) {
      const btx = await this.ds.transaction((m) => this.payments.createRefund(m, { orderId: refund.orderId, refundLegId: leg.id, amount: leg.amount, gatewayCode: leg.gatewayCode! }));
      await this.payments.processRefund(btx.id);
      return;
    }
    // No gateway refund API: the consumer is owed a payable document (created on completion).
    await this.ds.manager.update(RefundLeg, { id: leg.id, status: 'Pending' }, { status: 'Succeeded' });
  }

  private async reject(refundId: string, why: string): Promise<void> {
    await this.orders.inTx(async (u) => {
      const refund = await u.m.findOneOrFail(Refund, { where: { id: refundId } });
      const o = await this.orders.lock(u.m, refund.orderId);
      await u.m.update(Refund, { id: refundId }, { status: 'Rejected', reason: `${refund.reason} [${why}]`.slice(0, 500) });
      const refunded = o.refundedAmount - refund.amount;
      await u.m.query(`UPDATE "order" SET refunded_amount = $2, refund_status = $3, version = version + 1, updated_at = now() WHERE id = $1`, [
        o.id,
        refunded,
        refunded === 0 ? 'None' : refunded >= o.totalAmount ? 'Full' : 'Partial',
      ]);
      await this.orders.enqueueWebhook(u.m, o, 'refund.failed', { refundId, refundAmount: refund.amount, refundStatus: 'Rejected' });
    });
  }

  private async onReversalFinal(m: EntityManager, ptx: ProviderTransaction, outcome: 'Confirmed' | 'Rejected' | 'Unconfirmed'): Promise<void> {
    if (!ptx.refundLegId) return;
    const leg = await m.findOne(RefundLeg, { where: { id: ptx.refundLegId } });
    if (!leg) return;
    if (outcome === 'Confirmed') {
      await m.update(RefundLeg, { id: leg.id }, { status: 'Succeeded' });
    } else {
      await m.update(RefundLeg, { id: leg.id }, { status: 'NeedsReconciliation' });
      if (outcome === 'Rejected') {
        await this.recon.open(
          { type: 'REVERSAL_REJECTED', severity: 'High', refs: { refundLegId: leg.id, providerTransactionId: ptx.id, refundId: leg.refundId }, expectedAmount: leg.amount },
          m,
        );
      }
    }
    await this.checkComplete(m, leg.refundId);
  }

  private async onRefundFinal(m: EntityManager, btx: BankTransaction): Promise<void> {
    if (!btx.refundLegId) return;
    const leg = await m.findOne(RefundLeg, { where: { id: btx.refundLegId } });
    if (!leg) return;
    if (btx.status === 'Success') await m.update(RefundLeg, { id: leg.id }, { status: 'Succeeded' });
    else {
      await m.update(RefundLeg, { id: leg.id }, { status: 'NeedsReconciliation' });
      await this.recon.open({ type: 'REFUND_LEG_FAILED', severity: 'High', refs: { refundLegId: leg.id, bankTransactionId: btx.id, refundId: leg.refundId }, expectedAmount: leg.amount }, m);
    }
    await this.checkComplete(m, leg.refundId);
  }

  /** Completed when all legs succeeded: obligations (BR-RFD-03), ledger (BR-LED-06), webhook. */
  private async checkComplete(m: EntityManager, refundId: string): Promise<void> {
    const refund = await m.findOne(Refund, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
    if (!refund || (refund.status !== 'Processing' && refund.status !== 'NeedsReconciliation')) return;
    const legs = await m.find(RefundLeg, { where: { refundId } });
    const order = await this.orders.mustGet(refund.orderId, m);
    if (legs.some((l) => l.status === 'NeedsReconciliation' || l.status === 'Failed')) {
      if (refund.status !== 'NeedsReconciliation') {
        await m.update(Refund, { id: refundId }, { status: 'NeedsReconciliation', version: refund.version + 1 });
        await this.orders.enqueueWebhook(m, order, 'refund.failed', { refundId, refundAmount: refund.amount, refundStatus: 'NeedsReconciliation' });
      }
      return;
    }
    if (!legs.every((l) => l.status === 'Succeeded')) return;
    await m.update(Refund, { id: refundId }, { status: 'Completed', version: refund.version + 1 });
    const cash = legs.find((l) => l.legType === 'Cash')!;
    const credit = legs.filter((l) => l.legType === 'Credit');
    const docs: RefundDocInput[] = [
      { key: 'merchant', direction: 'Receivable', counterpartyType: 'Merchant', counterpartyId: refund.merchantId, amount: refund.amount - refund.merchantMarginRefund },
      ...credit.map((l) => ({
        key: `provider:${l.providerId}`,
        direction: 'Payable' as const,
        counterpartyType: 'Provider' as const,
        counterpartyId: l.providerId!,
        amount: l.amount - l.providerMarginRefund,
      })),
    ];
    if (!cash.viaGateway && cash.amount > 0) {
      docs.push({ key: 'consumer', direction: 'Payable', counterpartyType: 'Consumer', counterpartyId: order.consumerUserId, amount: cash.amount, awaitingPayeeDetails: !cash.payeeIbanEnc });
    }
    const ids = await this.documents.createRefundDocuments(m, { id: refund.id, orderId: refund.orderId }, docs);
    const consumerDoc = ids.get('consumer');
    if (consumerDoc) await m.update(RefundLeg, { id: cash.id }, { documentId: consumerDoc });
    const gateway = order.settlementTermsSnapshot?.gatewayCode ?? cash.gatewayCode ?? 'UNKNOWN';
    await this.ledger.post(m, {
      eventType: 'RefundCompleted',
      sourceType: 'Refund',
      sourceId: refund.id,
      lines: [
        { account: Accounts.merchant(refund.merchantId), debit: refund.amount - refund.merchantMarginRefund },
        { account: Accounts.commissionRevenue, debit: refund.merchantMarginRefund },
        { account: cash.viaGateway ? Accounts.pspClearing(gateway) : Accounts.consumer(order.consumerUserId), credit: cash.amount },
        ...credit.flatMap((l) => [
          { account: Accounts.provider(l.providerId!), credit: l.amount - l.providerMarginRefund },
          { account: Accounts.providerMarginExpense, credit: l.providerMarginRefund },
        ]),
      ],
    });
    await this.orders.enqueueWebhook(m, order, 'refund.completed', { refundId, refundAmount: refund.amount, refundStatus: 'Completed' });
  }

  /* ─────────── Payee IBAN (E-32) ─────────── */

  async setPayeeIban(legId: string, ibanInput: string): Promise<RefundDetail> {
    const iban = toAsciiDigits(ibanInput.replace(/\s/g, '')).toUpperCase();
    if (!isValidIban(iban)) throw validationError('iban', 'Please enter a valid IBAN.');
    const leg = await this.ds.manager.findOne(RefundLeg, { where: { id: legId } });
    if (!leg) throw notFound('Refund leg');
    if (leg.legType !== 'Cash' || leg.viaGateway) throw stateChanged();
    await this.ds.transaction(async (m) => {
      await m.update(RefundLeg, { id: legId }, { payeeIbanEnc: this.crypto.encrypt(iban) });
      if (leg.documentId) await this.documents.markPayeeReady(m, leg.documentId);
    });
    return this.detail(leg.refundId);
  }

  /* ─────────── Views ─────────── */

  private toList(rows: Refund[]): RefundListItem[] {
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amount: r.amount,
      merchantMarginRefund: r.merchantMarginRefund,
      status: r.status,
      initiatedBy: r.initiatedBy,
      actorId: r.actorId,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  list(q: RefundQuery): Promise<Page<RefundListItem>> {
    const qb = this.ds.manager.createQueryBuilder(Refund, 'r');
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.orderId) qb.andWhere('r.orderId = :o', { o: q.orderId });
    if (q.merchantId) qb.andWhere('r.merchantId = :mid', { mid: q.merchantId });
    if (q.from) qb.andWhere('r.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('r.createdAt < :to', { to: q.to });
    return paginate(qb, 'r', q, (rows) => this.toList(rows));
  }

  async detail(id: string): Promise<RefundDetail> {
    const r = await this.ds.manager.findOne(Refund, { where: { id } });
    if (!r) throw notFound('Refund');
    const legs = await this.ds.manager.find(RefundLeg, { where: { refundId: id }, order: { createdAt: 'ASC' } });
    const names = await this.providers.names(legs.filter((l) => l.providerId).map((l) => l.providerId!));
    return {
      ...this.toList([r])[0],
      legs: legs.map((l) => ({
        id: l.id,
        legType: l.legType,
        providerId: l.providerId,
        providerName: l.providerId ? (names.get(l.providerId) ?? l.providerId) : null,
        amount: l.amount,
        providerMarginRefund: l.providerMarginRefund,
        status: l.status,
        needsPayeeIban: l.legType === 'Cash' && !l.viaGateway && l.amount > 0 && !l.payeeIbanEnc,
        payeeIbanMasked: l.payeeIbanEnc ? maskIban(this.crypto.decrypt(l.payeeIbanEnc)) : null,
        documentId: l.documentId,
      })),
    };
  }

  async merchantView(merchantId: string, id: string): Promise<MerchantRefundResponse> {
    const r = await this.ds.manager.findOne(Refund, { where: { id, merchantId } });
    if (!r) throw notFound('Refund');
    return { refundId: r.id, orderId: r.orderId, amount: r.amount, status: r.status };
  }
}
