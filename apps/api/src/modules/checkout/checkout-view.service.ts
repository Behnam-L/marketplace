import { Inject, Injectable } from '@nestjs/common';
import {
  maskPhone,
  type CheckoutOrderView,
  type CheckoutResultResponse,
  type CreditNotice,
  type CreditProviderOption,
  type CreditResponse,
  TERMINAL_ORDER_STATUSES,
} from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError } from '../../shared/errors/app-error';
import type { CheckoutPrincipal } from '../../shared/http/auth-context';
import { ConsumersService } from '../consumers/consumers.service';
import { CreditProvidersService } from '../credit-providers/credit-providers.service';
import { MerchantsService } from '../merchants/merchants.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/order.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { WalletService } from '../wallet/wallet.service';
import { CheckoutFlowService } from './checkout-flow.service';
import { CheckoutPaymentsService } from './checkout-payments.service';
import { CheckoutSessionService } from './checkout-session.service';
import { TERMS_VERSION } from './checkout-session.service';
import { SMS_INBOX } from '../notifications/notifications.tokens';
import type { InboxMessage } from '../notifications/sms/sms-provider';

/** Consumer-facing read models (FR-010, FR-031, FR-051). No credit data before OTP. */
@Injectable()
export class CheckoutViewService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly orders: OrdersService,
    private readonly consumers: ConsumersService,
    private readonly merchants: MerchantsService,
    private readonly providers: CreditProvidersService,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly settings: SystemSettingsService,
    private readonly checkoutPayments: CheckoutPaymentsService,
    private readonly sessions: CheckoutSessionService,
    @Inject(SMS_INBOX) private readonly inbox: InboxMessage[],
  ) {}

  async view(orderId: string, otpVerified: boolean, refreshExpiry = true): Promise<CheckoutOrderView> {
    if (refreshExpiry) await this.checkoutPayments.expireIfDue(orderId);
    const o = await this.orders.mustGet(orderId);
    const merchant = await this.merchants.forCheckout(o.merchantId);
    const consumer = await this.consumers.get(o.consumerUserId);
    const payments = otpVerified ? (await this.payments.forOrder(o.id)).filter((b) => b.type === 'Payment') : [];
    const late = (TERMINAL_ORDER_STATUSES as string[]).includes(o.status) ? await this.checkoutPayments.latePayment(o.id) : null;
    const step = CheckoutFlowService.stepFor(o, otpVerified, late !== null, payments.length > 0);
    return {
      orderId: o.id,
      orderNumber: o.merchantOrderNumber,
      status: o.status,
      failureReason: o.failureReason,
      version: o.version,
      merchantDisplayName: merchant?.displayName ?? '',
      totalAmount: o.totalAmount,
      maskedPhone: consumer ? maskPhone(consumer.phoneE164) : '',
      sessionExpiresAt: o.sessionExpiresAt.toISOString(),
      paymentDeadlineAt: o.paymentDeadlineAt?.toISOString() ?? null,
      otpVerified,
      termsAccepted: o.termsAcceptedAt !== null,
      termsVersion: TERMS_VERSION,
      step,
      cashAmount: otpVerified ? o.cashAmount : null,
      creditAmount: otpVerified ? o.creditAmount : null,
      returnUrl: (TERMINAL_ORDER_STATUSES as string[]).includes(o.status) ? await this.signedReturnUrl(o) : null,
      serverTime: new Date().toISOString(),
      identityStep: step === 'identity' ? await this.consumers.identityStep(o.consumerUserId, o.id) : null,
      demoMode: this.config.mockIntegrations,
      otp: step === 'otp' ? await this.sessions.current(o.id) : null,
    };
  }

  async demoSms(orderId: string): Promise<{ text: string; at: string }[]> {
    if (!this.config.mockIntegrations) throw new AppError('NOT_FOUND', 'Not found.');
    const o = await this.orders.mustGet(orderId);
    const c = await this.consumers.get(o.consumerUserId);
    return this.inbox.filter((m) => m.to === c?.phoneE164).slice(-5).reverse().map((m) => ({ text: m.text, at: m.at }));
  }

  /** FR-005: `returnUrl?orderId&orderNumber&status&ts&sig` — informational only. */
  async signedReturnUrl(o: Order): Promise<string> {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await this.merchants.signReturn(o.merchantId, `${o.id}|${o.merchantOrderNumber}|${o.status}|${ts}`);
    const u = new URL(o.returnUrl);
    u.searchParams.set('orderId', o.id);
    u.searchParams.set('orderNumber', o.merchantOrderNumber);
    u.searchParams.set('status', o.status);
    u.searchParams.set('ts', ts);
    if (sig) u.searchParams.set('sig', sig);
    return u.toString();
  }

  private async notice(orderId: string): Promise<CreditNotice> {
    const events = await this.orders.events(orderId);
    const last = [...events].reverse().find((e) => e.toStatus === 'CreditInquiryInProgress' || e.toStatus === 'ReservationInProgress');
    if (last?.fromStatus === 'ReservationInProgress' && last.reason === 'RESERVATION_FAILED') return 'RESERVATION_FAILED';
    if (last?.fromStatus === 'ReservationInProgress' && last.reason === 'CREDIT_CHANGED') return 'CREDIT_CHANGED';
    return null;
  }

  /** FR-031 credit display. */
  async credit(p: CheckoutPrincipal): Promise<CreditResponse> {
    const o = await this.orders.mustGet(p.orderId);
    const s = await this.settings.getAll();
    const bps = o.cashPaymentBps ?? s.cashPaymentBps;
    const { base, byProvider } = await this.wallet.currentCredit(o.id);
    const inquiryIds = base?.inquiry.providerIds ?? [];
    const meta = await this.providers.byIds(inquiryIds);
    const providers: CreditProviderOption[] = [];
    let pending = 0;
    for (const pr of meta.sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName))) {
      const r = byProvider.get(pr.id);
      if (!r) {
        pending++;
        providers.push({ providerId: pr.id, displayName: pr.displayName, iconUrl: this.providers.iconUrl(pr.iconFileId), availableAmount: null, selectable: false, outcome: 'Pending' });
        continue;
      }
      if (r.outcome === 'NoAccount') continue; // hidden
      const amount = r.outcome === 'Ok' ? (r.availableAmount ?? 0) : null;
      providers.push({
        providerId: pr.id,
        displayName: pr.displayName,
        iconUrl: this.providers.iconUrl(pr.iconFileId),
        availableAmount: amount,
        selectable: r.outcome === 'Ok' && (amount ?? 0) > 0,
        outcome: r.outcome,
      });
    }
    const inquiryStatus: CreditResponse['inquiryStatus'] =
      bps === 10000 && !base ? 'Skipped' : o.status === 'CreditInquiryInProgress' || base?.inquiry.status === 'InProgress' ? 'InProgress' : 'Finished';
    return {
      inquiryStatus,
      providers,
      pendingProviderCount: inquiryStatus === 'InProgress' ? pending : 0,
      cashPaymentBps: bps,
      allowCashOnly: s.allowCashOnly,
      inquiryAttemptsLeft: Math.max(0, s.maxInquiryAttempts - o.inquiryAttempts),
      notice: await this.notice(o.id),
    };
  }

  /** FR-051 result (terminal orders only). */
  async result(p: CheckoutPrincipal): Promise<CheckoutResultResponse> {
    const o = await this.orders.mustGet(p.orderId);
    if (!(TERMINAL_ORDER_STATUSES as string[]).includes(o.status)) throw new AppError('STATE_CHANGED', 'The payment is not finished yet.', { status: o.status });
    const merchant = await this.merchants.forCheckout(o.merchantId);
    const reservations = (await this.wallet.reservationsOf(o.id)).filter((r) => ['AllocationPending', 'Allocated', 'NeedsReconciliation'].includes(r.status));
    const names = await this.providers.names(reservations.map((r) => r.providerId));
    const claimed = o.claimedBankTransactionId ? await this.payments.get(o.claimedBankTransactionId) : null;
    return {
      status: o.status,
      failureReason: o.failureReason,
      orderId: o.id,
      orderNumber: o.merchantOrderNumber,
      merchantDisplayName: merchant?.displayName ?? '',
      totalAmount: o.totalAmount,
      cashAmount: o.status === 'Completed' ? (o.cashAmount ?? 0) : 0,
      creditAmount: o.status === 'Completed' ? (o.creditAmount ?? 0) : 0,
      allocations: o.status === 'Completed' ? reservations.map((r) => ({ providerId: r.providerId, displayName: names.get(r.providerId) ?? '', amount: r.amount })) : [],
      bankReference: claimed?.status === 'Success' ? claimed.gatewayReference : null,
      returnUrl: await this.signedReturnUrl(o),
      latePaymentReference: await this.checkoutPayments.latePayment(o.id),
      cancelNotApplied: o.cancelNotApplied,
    };
  }
}
