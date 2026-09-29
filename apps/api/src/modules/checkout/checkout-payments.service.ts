import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { tomanToRial, type OrderStatus, type RedirectInstruction } from '@bajet/contracts';
import { AppError, stateChanged } from '../../shared/errors/app-error';
import { AlertService } from '../../shared/util/alerts';
import type { CheckoutPrincipal } from '../../shared/http/auth-context';
import { PaymentsService } from '../payments/payments.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/order.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CheckoutFlowService } from './checkout-flow.service';

const PAYABLE: OrderStatus[] = ['AwaitingBankPayment', 'CancellationRequested'];
const VERIFY_QUICK_RETRIES = 3;

/**
 * Bank payment orchestration (FR-042–045, FR-060/061, BR-BANK): initiation,
 * callback claim + verify, cancellation, expiry. Transitions go through OrdersService.
 */
@Injectable()
export class CheckoutPaymentsService {
  private readonly logger = new Logger(CheckoutPaymentsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly recon: ReconciliationService,
    private readonly settings: SystemSettingsService,
    private readonly flow: CheckoutFlowService,
    private readonly alerts: AlertService,
  ) {}

  /* ─────────── Initiation (FR-042/044) ─────────── */

  async startBankPayment(p: CheckoutPrincipal, version: number): Promise<RedirectInstruction> {
    await this.expireIfDue(p.orderId);
    const o = await this.orders.mustGet(p.orderId);
    if (o.status === 'Expired') throw new AppError('ORDER_EXPIRED', 'This session has expired. Please start a new payment.');
    if (o.status !== 'AwaitingBankPayment' || o.version !== version) throw stateChanged({ status: o.status, version: o.version });
    const minRemaining = await this.settings.get('bankMinRemainingSeconds');
    const rows: { remaining: number }[] = await this.ds.query(
      `SELECT EXTRACT(EPOCH FROM (payment_deadline_at - now())) AS remaining FROM "order" WHERE id = $1`,
      [o.id],
    );
    if (Number(rows[0].remaining) < minRemaining) {
      throw new AppError('DEADLINE_TOO_CLOSE', 'There is not enough time left to complete a bank payment. Please start a new payment.');
    }
    const gateway = await this.payments.selectGateway();
    if (!gateway) throw new AppError('GATEWAY_ERROR', "We couldn't start your bank payment. Please try again.");
    const btx = await this.orders.inTx(async (u) => {
      const cur = await this.orders.lock(u.m, o.id);
      if (cur.status !== 'AwaitingBankPayment') throw stateChanged({ status: cur.status });
      return this.payments.createPayment(u.m, o.id, cur.cashAmount!, gateway.code);
    });
    // Init error → BankTransaction Failed(INIT_ERROR); reservations are kept (D-05).
    return this.payments.initiate(btx.id);
  }

  /* ─────────── Callback (FR-043, FR-061, BR-BANK-01..03) ─────────── */

  /** Handles a PSP callback; returns the order to redirect the browser to (or null for unknown refs). */
  async handleCallback(gatewayCode: string, payload: Record<string, unknown>): Promise<Order | null> {
    const parsed = await this.payments.parseCallback(gatewayCode, payload);
    const btx = parsed ? await this.payments.get(parsed.ref) : null;
    if (!parsed || !btx || btx.gatewayCode !== gatewayCode || btx.type !== 'Payment' || !btx.orderId) {
      this.alerts.raise('Operations', 'BANK_CALLBACK_UNKNOWN_REFERENCE', { gatewayCode, ref: parsed?.ref ?? null });
      return null;
    }
    const order = await this.orders.mustGet(btx.orderId);
    if (parsed.reported !== 'Success') {
      await this.payments.markReported(btx.id, parsed.reported);
      await this.resolveCancellationIfIdle(order.id);
      return this.orders.mustGet(order.id);
    }
    // AC3: amount must equal cashAmount × 10 Rial exactly — otherwise no verify, reverse, reconcile.
    if (parsed.amountRial !== null && parsed.amountRial !== tomanToRial(btx.amount)) {
      const state = await this.payments.markAuthorized(btx.id);
      if (state !== 'noop') {
        await this.ds.transaction((m) => this.payments.startReversal(m, btx.id, 'AMOUNT_MISMATCH'));
        await this.recon.open({
          type: 'AMOUNT_MISMATCH',
          severity: 'High',
          orderId: order.id,
          refs: { bankTransactionId: btx.id },
          expectedAmount: btx.amount,
          actualAmount: Math.floor(parsed.amountRial / 10),
        });
        await this.payments.processReversal(btx.id);
      }
      return this.orders.mustGet(order.id);
    }
    await this.onReportedSuccess(btx.id, order.id);
    return this.orders.mustGet(order.id);
  }

  /** Reported (or inquired) success for a payment transaction. */
  async onReportedSuccess(btxId: string, orderId: string): Promise<void> {
    const state = await this.payments.markAuthorized(btxId);
    if (state === 'noop') {
      // Duplicate callback (AC1): nothing to do unless this transaction is still Authorized and unclaimed.
      const btx = await this.payments.get(btxId);
      const o = await this.orders.mustGet(orderId);
      if (btx?.status !== 'Authorized' || o.claimedBankTransactionId === btxId) return;
    }
    if (state === 'late') {
      await this.reverse(btxId, 'LATE_PAYMENT');
      return;
    }
    const claimed = await this.claim(orderId, btxId);
    if (!claimed) {
      await this.reverse(btxId, 'NOT_CLAIMABLE');
      return;
    }
    await this.verifyClaimed(orderId, btxId);
  }

  private async reverse(btxId: string, reason: string): Promise<void> {
    const started = await this.ds.transaction((m) => this.payments.startReversal(m, btxId, reason));
    if (started) await this.payments.processReversal(btxId);
  }

  /** CAS AwaitingBankPayment|CancellationRequested → PaymentVerifying claiming this transaction. */
  private async claim(orderId: string, btxId: string): Promise<boolean> {
    try {
      await this.orders.inTx(async (u) => {
        const o = await this.orders.lock(u.m, orderId);
        if (!PAYABLE.includes(o.status) || o.claimedBankTransactionId) throw stateChanged();
        await this.orders.transition(u, orderId, o.status, 'PaymentVerifying', {
          actor: 'system',
          reason: `CLAIMED ${btxId}`,
          set: { claimedBankTransactionId: btxId, cancelNotApplied: o.status === 'CancellationRequested' ? true : o.cancelNotApplied },
        });
      });
      return true;
    } catch (e) {
      if (e instanceof AppError && e.code === 'STATE_CHANGED') return false;
      throw e;
    }
  }

  /** Verify after a successful claim (BR-BANK-02); unknown outcomes stay PaymentVerifying (BR-BANK-04). */
  async verifyClaimed(orderId: string, btxId: string): Promise<void> {
    const v = await this.payments.verify(btxId);
    if (v.kind === 'Unknown') return;
    if (v.kind === 'Success') {
      await this.orders.inTx(async (u) => {
        await this.payments.applyVerifiedSuccess(u.m, btxId, { gatewayReference: v.gatewayReference, cardMask: v.cardMask });
        await this.orders.transition(u, orderId, 'PaymentVerifying', 'AllocationInProgress', { actor: 'system', reason: 'PAYMENT_VERIFIED' });
      });
      this.flow.background('allocation', () => this.orders.allocateAndComplete(orderId));
      return;
    }
    if (v.kind === 'AmountMismatch') {
      await this.ds.transaction((m) => this.payments.startReversal(m, btxId, 'AMOUNT_MISMATCH'));
      await this.recon.open({
        type: 'AMOUNT_MISMATCH', severity: 'High', orderId, refs: { bankTransactionId: btxId }, actualAmount: Math.floor(v.paidAmountRial / 10),
      });
      await this.payments.processReversal(btxId);
    } else {
      await this.ds.transaction((m) => this.payments.applyVerifyFailed(m, btxId, v.reason));
    }
    await this.leaveVerifying(orderId);
  }

  /** Verify failed / resolved unpaid: back to AwaitingBankPayment, or Expired past the deadline. */
  private async leaveVerifying(orderId: string): Promise<void> {
    const past = await this.orders.isPastDeadline(orderId);
    await this.orders.inTx(async (u) => {
      const o = await this.orders.lock(u.m, orderId);
      if (o.status !== 'PaymentVerifying') return;
      await this.orders.transition(u, orderId, 'PaymentVerifying', past ? 'Expired' : 'AwaitingBankPayment', {
        actor: 'system',
        reason: 'PAYMENT_NOT_VERIFIED',
        set: { claimedBankTransactionId: null },
      });
    });
  }

  /** BR-BANK-04 resolver for orders stuck in PaymentVerifying. */
  async resolveVerifying(order: Order): Promise<void> {
    const btxId = order.claimedBankTransactionId;
    if (!btxId) return;
    const btx = await this.payments.get(btxId);
    if (!btx) return;
    if (btx.status !== 'Authorized') {
      if (btx.status === 'Success') {
        await this.orders.inTx((u) => this.orders.transition(u, order.id, 'PaymentVerifying', 'AllocationInProgress', { actor: 'system', reason: 'PAYMENT_VERIFIED' }));
        await this.orders.allocateAndComplete(order.id);
      } else await this.leaveVerifying(order.id);
      return;
    }
    if (btx.attempts < VERIFY_QUICK_RETRIES) return this.verifyClaimed(order.id, btxId);
    const inq = await this.payments.inquiry(btxId);
    if (inq.status === 'Paid') return this.verifyClaimed(order.id, btxId);
    const maxSeconds = await this.settings.get('bankPendingMaxSeconds');
    const tooOld = btx.createdAt.getTime() + maxSeconds * 1000 <= Date.now();
    if (inq.status === 'Unpaid' || inq.status === 'Reversed' || tooOld) {
      // Still unknown at the limit → treat as unpaid and reverse (BR-BANK-04).
      await this.reverse(btxId, inq.status === 'Unpaid' ? 'UNPAID' : 'VERIFY_UNKNOWN');
      await this.leaveVerifying(order.id);
    }
  }

  /* ─────────── Cancel (FR-045) ─────────── */

  async cancel(p: CheckoutPrincipal, version: number): Promise<OrderStatus> {
    const o = await this.orders.mustGet(p.orderId);
    if (o.version !== version) throw stateChanged({ status: o.status, version: o.version });
    if (['AwaitingOtp', 'AwaitingIdentity', 'AwaitingSupplierSelection'].includes(o.status)) {
      await this.orders.transitionTx(o.id, o.status, 'Cancelled', { actor: 'consumer', version, reason: 'CONSUMER_CANCEL' });
      return 'Cancelled';
    }
    if (['CreditInquiryInProgress', 'ReservationInProgress', 'PaymentVerifying', 'AllocationInProgress'].includes(o.status)) {
      throw new AppError('ORDER_BUSY', 'Your payment is being processed and cannot be cancelled right now.');
    }
    if (o.status === 'CancellationRequested') return o.status;
    if (o.status !== 'AwaitingBankPayment') throw stateChanged({ status: o.status, version: o.version });
    const open = await this.payments.openPayments(o.id);
    if (open.length === 0) {
      await this.orders.transitionTx(o.id, 'AwaitingBankPayment', 'Cancelled', { actor: 'consumer', version, reason: 'CONSUMER_CANCEL' });
      return 'Cancelled';
    }
    await this.orders.transitionTx(o.id, 'AwaitingBankPayment', 'CancellationRequested', {
      actor: 'consumer',
      version,
      set: { cancelRequestedAt: new Date() },
      reason: 'CONSUMER_CANCEL',
    });
    await this.resolveCancellation(o.id);
    return (await this.orders.mustGet(o.id)).status;
  }

  /** Gateway inquiry for each open payment: paid wins; unpaid/timed out → cancelled. */
  async resolveCancellation(orderId: string): Promise<void> {
    const maxSeconds = await this.settings.get('bankPendingMaxSeconds');
    for (const btx of await this.payments.openPayments(orderId)) {
      const inq = await this.payments.inquiry(btx.id);
      if (inq.status === 'Paid') {
        await this.onReportedSuccess(btx.id, orderId);
        return;
      }
      const tooOld = btx.createdAt.getTime() + maxSeconds * 1000 <= Date.now();
      if (inq.status === 'Unpaid' || inq.status === 'Reversed' || tooOld) {
        await this.ds.transaction((m) => this.payments.markCancelled(m, btx.id, tooOld ? 'PENDING_TIMEOUT' : 'UNPAID'));
      }
    }
    await this.resolveCancellationIfIdle(orderId);
  }

  private async resolveCancellationIfIdle(orderId: string): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    if (o.status !== 'CancellationRequested') return;
    if ((await this.payments.openPayments(orderId)).length > 0) return;
    try {
      await this.orders.transitionTx(orderId, 'CancellationRequested', 'Cancelled', { actor: 'system', reason: 'CANCELLATION_RESOLVED' });
    } catch (e) {
      if (!(e instanceof AppError && e.code === 'STATE_CHANGED')) throw e;
    }
  }

  /* ─────────── Expiry (FR-060) ─────────── */

  /**
   * Expires an order whose deadline passed (DB time). With a Pending/Authorized bank
   * payment the gateway is asked first; paid → normal PaymentVerifying path.
   */
  async expireIfDue(orderId: string): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    const pre = ['AwaitingOtp', 'AwaitingIdentity', 'CreditInquiryInProgress', 'AwaitingSupplierSelection'];
    try {
      if (pre.includes(o.status)) {
        if (await this.orders.isSessionExpired(o.id)) {
          await this.orders.transitionTx(o.id, o.status, 'Expired', { actor: 'system', version: o.version, reason: 'SESSION_EXPIRED' });
        }
        return;
      }
      if ((o.status === 'ReservationInProgress' || o.status === 'AwaitingBankPayment') && (await this.orders.isPastDeadline(o.id))) {
        if (o.status === 'AwaitingBankPayment') {
          for (const btx of await this.payments.openPayments(o.id)) {
            const inq = await this.payments.inquiry(btx.id);
            if (inq.status === 'Paid') {
              await this.onReportedSuccess(btx.id, o.id);
              return;
            }
          }
        }
        await this.orders.transitionTx(o.id, o.status, 'Expired', { actor: 'system', version: o.version, reason: 'PAYMENT_DEADLINE' });
      }
    } catch (e) {
      // AC1: a concurrent action won the CAS; the loser gets STATE_CHANGED.
      if (!(e instanceof AppError && e.code === 'STATE_CHANGED')) throw e;
    }
  }

  async runExpiry(): Promise<void> {
    const due = await this.orders.dueForExpiry();
    for (const o of [...due.preConfirm, ...due.payment]) {
      await this.expireIfDue(o.id).catch((e: unknown) => this.logger.error(`expiry ${o.id}: ${(e as Error).message}`));
    }
  }

  /** Whether a late payment is being returned for this order (FR-061) and its reference. */
  async latePayment(orderId: string): Promise<string | null> {
    const txs = await this.payments.forOrder(orderId);
    const late = txs.find((t) => t.type === 'Payment' && ['ReversalPending', 'Reversed', 'NeedsReconciliation'].includes(t.status) && ['LATE_PAYMENT', 'NOT_CLAIMABLE'].includes(t.failureCode ?? ''));
    return late ? (late.gatewayReference ?? late.id) : null;
  }
}
