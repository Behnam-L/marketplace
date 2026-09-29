import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  allocateCredit,
  splitCash,
  type CheckoutStep,
  type QuoteResponse,
} from '@bajet/contracts';
import { AppError, stateChanged } from '../../shared/errors/app-error';
import { dbNow } from '../../shared/database/tx';
import { sha256Hex } from '../../shared/security/crypto.service';
import type { CheckoutPrincipal } from '../../shared/http/auth-context';
import { ConsumersService, type IdentityStepResult } from '../consumers/consumers.service';
import { CreditProvidersService } from '../credit-providers/credit-providers.service';
import type { ConsumerKey } from '../credit-providers/adapters/provider-adapter';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/order.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { WalletService } from '../wallet/wallet.service';
import type { InquiryKind } from '@bajet/contracts';

export interface QuoteInput {
  providerIds: string[];
  cashOnly: boolean;
}

interface ComputedQuote extends QuoteResponse {
  cashOnly: boolean;
}

/** Identity → credit inquiry → quote → confirm → reservation (FR-020–041). */
@Injectable()
export class CheckoutFlowService {
  private readonly logger = new Logger(CheckoutFlowService.name);
  /** In-flight background work, awaited by tests. */
  readonly pending = new Set<Promise<unknown>>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly orders: OrdersService,
    private readonly consumers: ConsumersService,
    private readonly providers: CreditProvidersService,
    private readonly wallet: WalletService,
    private readonly settings: SystemSettingsService,
  ) {}

  /** Runs work after the response (background), tracked so tests can await it. */
  background(name: string, fn: () => Promise<unknown>): void {
    const p = fn()
      .catch((e: unknown) => this.logger.error(`${name} failed: ${(e as Error).message}`, (e as Error).stack))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  async settle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  /* ─────────── OTP outcome (FR-013) ─────────── */

  /** AC4: the Nth wrong code fails an order still at AwaitingOtp. */
  async onOtpLocked(orderId: string): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    if (o.status === 'AwaitingOtp') await this.orders.inTx((u) => this.orders.fail(u, o.id, 'AwaitingOtp', 'OTP_LOCKED', 'consumer'));
  }

  /**
   * AC1/AC6: correct code → AwaitingIdentity and consumer Active; a Blocked consumer
   * fails the order. Re-verification on a later step (new browser) changes nothing.
   */
  async onOtpVerified(orderId: string, version: number): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    if (o.status !== 'AwaitingOtp') return;
    const consumer = await this.consumers.get(o.consumerUserId);
    if (consumer?.status === 'Blocked') {
      await this.orders.inTx((u) => this.orders.fail(u, o.id, 'AwaitingOtp', 'CONSUMER_BLOCKED', 'system'));
      return;
    }
    await this.orders.inTx(async (u) => {
      await this.orders.transition(u, o.id, 'AwaitingOtp', 'AwaitingIdentity', { actor: 'consumer', version });
      await this.consumers.markOtpVerified(u.m, o.consumerUserId);
    });
    await this.afterOtp(o.id);
  }

  /* ─────────── Identity (FR-020–023) ─────────── */

  /** After OTP: run the linkage check; a verified consumer advances immediately. */
  async afterOtp(orderId: string): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    if (o.status !== 'AwaitingIdentity') return;
    try {
      const r = await this.consumers.checkLinkage(orderId, o.consumerUserId);
      if (r.kind === 'verified') await this.advanceAfterIdentity(orderId);
    } catch (e) {
      // FR-020 AC1: identity service down → order stays AwaitingIdentity; the consumer retries.
      if (!(e instanceof AppError && e.code === 'IDENTITY_SERVICE_UNAVAILABLE')) throw e;
    }
  }

  private async onIdentityResult(o: Order, r: IdentityStepResult): Promise<'dob' | 'national-id' | 'verified'> {
    switch (r.kind) {
      case 'verified':
        await this.advanceAfterIdentity(o.id);
        return 'verified';
      case 'needs-dob':
        return 'dob';
      case 'needs-national-id':
        return 'national-id';
      case 'mismatch':
        throw new AppError('IDENTITY_MISMATCH', "The information you entered doesn't match our records.", { attemptsLeft: r.attemptsLeft });
      case 'locked':
        await this.orders.inTx((u) => this.orders.fail(u, o.id, 'AwaitingIdentity', 'IDENTITY_LOCKED', 'consumer'));
        throw new AppError('IDENTITY_LOCKED', 'Too many incorrect attempts. Please return to the store and start again.');
    }
  }

  private async assertIdentityStep(p: CheckoutPrincipal, version: number): Promise<Order> {
    const o = await this.orders.mustGet(p.orderId);
    if (o.status !== 'AwaitingIdentity' || o.version !== version) throw stateChanged({ status: o.status, version: o.version });
    return o;
  }

  async checkLinkage(p: CheckoutPrincipal, version: number): Promise<void> {
    const o = await this.assertIdentityStep(p, version);
    await this.onIdentityResult(o, await this.consumers.checkLinkage(o.id, o.consumerUserId));
  }

  async submitNationalId(p: CheckoutPrincipal, version: number, nationalId: string): Promise<'dob' | 'national-id' | 'verified'> {
    const o = await this.assertIdentityStep(p, version);
    return this.onIdentityResult(o, await this.consumers.submitNationalId(o.id, o.consumerUserId, nationalId));
  }

  async submitDob(p: CheckoutPrincipal, version: number, dateOfBirth: string): Promise<'dob' | 'national-id' | 'verified'> {
    const o = await this.assertIdentityStep(p, version);
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || dateOfBirth < '1900-01-01' || dateOfBirth > today || Number.isNaN(Date.parse(dateOfBirth))) {
      throw new AppError('VALIDATION_ERROR', 'Please enter a valid date of birth.', { fields: [{ field: 'dateOfBirth', message: 'Invalid date.' }] });
    }
    return this.onIdentityResult(o, await this.consumers.submitDob(o.id, o.consumerUserId, dateOfBirth));
  }

  /**
   * FR-022: verified identity → credit inquiry, or straight to selection when the
   * cash share is 100 % (cashPaymentBps snapshotted on first entry, BR-CALC-05).
   */
  async advanceAfterIdentity(orderId: string): Promise<void> {
    const bps = await this.settings.get('cashPaymentBps');
    if (bps === 10000) {
      await this.orders.transitionTx(orderId, 'AwaitingIdentity', 'AwaitingSupplierSelection', { actor: 'system', set: { cashPaymentBps: bps }, reason: 'CASH_ONLY_100' });
      return;
    }
    const o = await this.orders.mustGet(orderId);
    await this.orders.transitionTx(orderId, 'AwaitingIdentity', 'CreditInquiryInProgress', {
      actor: 'system',
      set: { inquiryAttempts: o.inquiryAttempts + 1 },
    });
    this.background('credit-inquiry', () => this.runInquiryForOrder(orderId, 'Initial'));
  }

  /* ─────────── Credit inquiry (FR-030/031) ─────────── */

  private async keyFor(consumerId: string, inquiryKey: 'NationalId' | 'Phone'): Promise<ConsumerKey | null> {
    const value = await this.consumers.inquiryKeyValue(consumerId, inquiryKey);
    return value ? { type: inquiryKey, value } : null;
  }

  /** Inquiry for an order in CreditInquiryInProgress; then → AwaitingSupplierSelection. */
  async runInquiryForOrder(orderId: string, kind: InquiryKind, onlyProviderIds?: string[]): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    if (o.status !== 'CreditInquiryInProgress' && kind !== 'Recheck') return;
    const timeoutMs = await this.settings.get('providerInquiryTimeoutMs');
    // Providers disabled after this point stay excluded only from later inquiries (FR-091).
    const eligible = onlyProviderIds ? await this.providers.byIds(onlyProviderIds) : await this.providers.inquirable();
    const inquiry = await this.wallet.startInquiry(orderId, kind, eligible.map((p) => p.id));
    await this.wallet.runInquiry(
      inquiry,
      await Promise.all(eligible.map(async (p) => ({ id: p.id, key: await this.keyFor(o.consumerUserId, p.inquiryKey) }))),
      timeoutMs,
    );
    if (kind === 'Recheck') return;
    await this.enterSelection(orderId);
  }

  /** CreditInquiryInProgress → AwaitingSupplierSelection, snapshotting cashPaymentBps on first entry. */
  async enterSelection(orderId: string, reason?: string): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    if (o.status !== 'CreditInquiryInProgress') return;
    const bps = o.cashPaymentBps ?? (await this.settings.get('cashPaymentBps'));
    try {
      await this.orders.transitionTx(orderId, 'CreditInquiryInProgress', 'AwaitingSupplierSelection', {
        actor: 'system',
        set: { cashPaymentBps: bps },
        reason: reason ?? null,
      });
    } catch (e) {
      if (!(e instanceof AppError && e.code === 'STATE_CHANGED')) throw e;
    }
  }

  /** Consumer "Try again" (max `maxInquiryAttempts`). */
  async retryInquiry(p: CheckoutPrincipal, version: number): Promise<void> {
    const o = await this.orders.mustGet(p.orderId);
    if (o.status !== 'AwaitingSupplierSelection' || o.version !== version) throw stateChanged({ status: o.status, version: o.version });
    const max = await this.settings.get('maxInquiryAttempts');
    if (o.inquiryAttempts >= max) throw new AppError('INQUIRY_LIMIT', 'You have reached the maximum number of credit checks for this payment.');
    await this.orders.transitionTx(o.id, 'AwaitingSupplierSelection', 'CreditInquiryInProgress', {
      actor: 'consumer',
      version,
      set: { inquiryAttempts: o.inquiryAttempts + 1 },
      reason: 'CONSUMER_RETRY',
    });
    this.background('credit-inquiry', () => this.runInquiryForOrder(o.id, 'Retry'));
  }

  /* ─────────── Quote (FR-032/033, BR-CALC) ─────────── */

  static quoteHash(orderId: string, bps: number, allocations: { providerId: string; amount: number }[], cashOnly: boolean): string {
    const parts = [...allocations].sort((a, b) => (a.providerId < b.providerId ? -1 : 1)).map((a) => `${a.providerId}:${a.amount}`);
    return sha256Hex(`${orderId}|${bps}|${parts.join(',')}|${cashOnly}`);
  }

  /** Server-side, authoritative breakdown for a selection. */
  async computeQuote(o: Order, input: QuoteInput, availability?: Map<string, number>): Promise<ComputedQuote> {
    const bps = o.cashPaymentBps ?? (await this.settings.get('cashPaymentBps'));
    const allowCashOnly = await this.settings.get('allowCashOnly');
    const fullCash = bps === 10000;
    if (input.cashOnly && !allowCashOnly && !fullCash) throw new AppError('VALIDATION_ERROR', 'Paying fully by bank card is not available.', { fields: [{ field: 'cashOnly', message: 'Not allowed.' }] });
    const cashOnly = input.cashOnly || fullCash;
    const { cashAmount, creditAmount } = splitCash(o.totalAmount, bps, input.cashOnly);
    let allocations: { providerId: string; amount: number }[] = [];
    if (!cashOnly || creditAmount > 0) {
      const avail = availability ?? (await this.availability(o.id));
      const unique = [...new Set(input.providerIds)];
      if (unique.some((id) => !avail.has(id))) throw new AppError('NO_SELECTION', 'Please select a credit source.');
      const r = allocateCredit(creditAmount, unique.map((id) => ({ providerId: id, availableAmount: avail.get(id) ?? 0 })));
      if (!r.ok) {
        throw r.code === 'NO_SELECTION'
          ? new AppError('NO_SELECTION', 'Please select a credit source or pay fully by bank card.')
          : new AppError('INSUFFICIENT_CREDIT', "The selected credit lines don't cover the required amount. Please select additional sources.");
      }
      allocations = r.allocations;
    }
    return {
      totalAmount: o.totalAmount,
      cashAmount,
      creditAmount,
      allocations,
      cashOnly: input.cashOnly,
      quoteHash: CheckoutFlowService.quoteHash(o.id, bps, allocations, input.cashOnly),
    };
  }

  /** Current selectable balances (Ok, > 0) per provider. */
  async availability(orderId: string): Promise<Map<string, number>> {
    const { byProvider } = await this.wallet.currentCredit(orderId);
    const out = new Map<string, number>();
    for (const [id, r] of byProvider) if (r.outcome === 'Ok' && (r.availableAmount ?? 0) > 0) out.set(id, r.availableAmount!);
    return out;
  }

  async quote(p: CheckoutPrincipal, input: QuoteInput): Promise<QuoteResponse> {
    const o = await this.orders.mustGet(p.orderId);
    if (o.status !== 'AwaitingSupplierSelection') throw stateChanged({ status: o.status, version: o.version });
    const q = await this.computeQuote(o, input);
    return { totalAmount: q.totalAmount, cashAmount: q.cashAmount, creditAmount: q.creditAmount, allocations: q.allocations, quoteHash: q.quoteHash };
  }

  /* ─────────── Confirm & reserve (FR-040/041) ─────────── */

  /**
   * Returns 'bank' when the order now awaits the bank payment (cash-only), or
   * 'reserving' when reservations run in the background.
   */
  async confirm(p: CheckoutPrincipal, version: number, input: QuoteInput & { quoteHash: string }): Promise<'bank' | 'reserving'> {
    const o = await this.orders.mustGet(p.orderId);
    if (o.status !== 'AwaitingSupplierSelection' || o.version !== version) throw stateChanged({ status: o.status, version: o.version });
    const q = await this.computeQuote(o, input);
    if (q.quoteHash !== input.quoteHash) {
      throw new AppError('STATE_CHANGED', 'Your selection changed. Please review the updated breakdown.', {
        quote: { totalAmount: q.totalAmount, cashAmount: q.cashAmount, creditAmount: q.creditAmount, allocations: q.allocations, quoteHash: q.quoteHash },
      });
    }
    const holdMinutes = await this.settings.get('paymentHoldMinutes');
    const now = await dbNow(this.ds);
    const paymentDeadlineAt = new Date(now.getTime() + holdMinutes * 60_000);
    const amounts = { cashAmount: q.cashAmount, creditAmount: q.creditAmount, quoteHash: q.quoteHash, cashOnly: q.cashOnly, paymentDeadlineAt };
    if (q.creditAmount === 0) {
      await this.orders.transitionTx(o.id, 'AwaitingSupplierSelection', 'AwaitingBankPayment', { actor: 'consumer', version, set: amounts, reason: 'CASH_ONLY' });
      return 'bank';
    }
    await this.orders.transitionTx(o.id, 'AwaitingSupplierSelection', 'ReservationInProgress', { actor: 'consumer', version, set: amounts });
    // Fresh inquiry of the selected providers (strict: share > available → changed).
    const selected = q.allocations.map((a) => a.providerId);
    await this.runInquiryForOrder(o.id, 'Recheck', selected);
    const fresh = await this.availability(o.id);
    const changed = q.allocations.some((a) => a.amount > (fresh.get(a.providerId) ?? 0));
    if (changed) {
      await this.orders.inTx(async (u) => {
        await this.orders.transition(u, o.id, 'ReservationInProgress', 'CreditInquiryInProgress', {
          actor: 'system',
          reason: 'CREDIT_CHANGED',
          set: { paymentDeadlineAt: null, cashAmount: null, creditAmount: null, quoteHash: null },
        });
        await this.orders.transition(u, o.id, 'CreditInquiryInProgress', 'AwaitingSupplierSelection', { actor: 'system', reason: 'CREDIT_CHANGED' });
      });
      let freshQuote: QuoteResponse | null = null;
      try {
        const reloaded = await this.orders.mustGet(o.id);
        const fq = await this.computeQuote(reloaded, input, fresh);
        freshQuote = { totalAmount: fq.totalAmount, cashAmount: fq.cashAmount, creditAmount: fq.creditAmount, allocations: fq.allocations, quoteHash: fq.quoteHash };
      } catch {
        freshQuote = null;
      }
      throw new AppError('CREDIT_CHANGED', 'Your available credit has changed. Please review your selection.', { quote: freshQuote });
    }
    const attemptNo = o.reservationAttempts + 1;
    await this.orders.inTx(async (u) => {
      const cur = await this.orders.lock(u.m, o.id);
      if (cur.status !== 'ReservationInProgress') throw stateChanged({ status: cur.status });
      await u.m.query(`UPDATE "order" SET reservation_attempts = $2, updated_at = now() WHERE id = $1`, [o.id, attemptNo]);
      await this.wallet.createReservations(u.m, {
        orderId: o.id,
        consumerId: o.consumerUserId,
        attemptNo,
        holdDeadlineAt: paymentDeadlineAt,
        allocations: q.allocations,
      });
    });
    this.background('reservation', () => this.processReservation(o.id, attemptNo));
    return 'reserving';
  }

  /** FR-041 outcome handling. */
  async processReservation(orderId: string, attemptNo: number): Promise<void> {
    const o = await this.orders.mustGet(orderId);
    const { allReserved } = await this.wallet.executeReservations(orderId, attemptNo, async (providerId) => {
      const [p] = await this.providers.byIds([providerId]);
      return p ? this.keyFor(o.consumerUserId, p.inquiryKey) : null;
    });
    const current = await this.orders.mustGet(orderId);
    if (current.status !== 'ReservationInProgress') return; // expired meanwhile: reservations already released
    if (allReserved) {
      const cash = current.cashAmount ?? 0;
      await this.orders.transitionTx(orderId, 'ReservationInProgress', cash > 0 ? 'AwaitingBankPayment' : 'AllocationInProgress', { actor: 'system' });
      if (cash === 0) await this.orders.allocateAndComplete(orderId);
      return;
    }
    const max = await this.settings.get('maxReservationAttempts');
    if (current.reservationAttempts < max) {
      await this.orders.transitionTx(orderId, 'ReservationInProgress', 'CreditInquiryInProgress', {
        actor: 'system',
        reason: 'RESERVATION_FAILED',
        set: { paymentDeadlineAt: null, cashAmount: null, creditAmount: null, quoteHash: null },
      });
      await this.runInquiryForOrder(orderId, 'Retry');
      return;
    }
    await this.orders.inTx((u) => this.orders.fail(u, orderId, 'ReservationInProgress', 'RESERVATION_FAILED', 'system'));
  }

  /** Step shown to the consumer for a given order + session (PRD §8.2). */
  static stepFor(o: Order, otpVerified: boolean, latePayment: boolean, hasPayment: boolean): CheckoutStep {
    switch (o.status) {
      case 'Completed':
        return 'result';
      case 'Cancelled':
        return latePayment ? 'late-payment' : 'cancelled';
      case 'Expired':
        return latePayment ? 'late-payment' : 'expired';
      case 'Failed':
        return 'failed';
      case 'Initiated':
      case 'AwaitingOtp':
        return o.termsAcceptedAt ? 'otp' : 'landing';
      default:
        break;
    }
    if (!otpVerified) return 'otp';
    switch (o.status) {
      case 'AwaitingIdentity':
        return 'identity';
      case 'CreditInquiryInProgress':
      case 'AwaitingSupplierSelection':
        return 'credit';
      case 'ReservationInProgress':
      case 'AllocationInProgress':
        return 'processing';
      case 'AwaitingBankPayment':
        return hasPayment ? 'payment-failed' : 'bank-start';
      default:
        return 'return';
    }
  }
}
