import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  normalisePhone,
  type AvailabilityResponse,
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
} from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError, validationError } from '../../shared/errors/app-error';
import { dbNow, isUniqueViolation } from '../../shared/database/tx';
import { CryptoService } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { RateLimiter } from '../../shared/util/rate-limiter';
import { ConsumersService } from '../consumers/consumers.service';
import { CreditProvidersService } from '../credit-providers/credit-providers.service';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { Order } from '../orders/order.entity';
import { OrdersService } from '../orders/orders.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CheckoutSessionService } from './checkout-session.service';

const CACHE_MS = 30_000;

/** Merchant integration: availability (FR-001) and checkout creation (FR-002). */
@Injectable()
export class MerchantCheckoutService {
  private readonly cache = new Map<string, { at: number; value: Omit<AvailabilityResponse, 'minAmount' | 'maxAmount'> & { min: number; max: number } }>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly merchants: MerchantsService,
    private readonly providers: CreditProvidersService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly consumers: ConsumersService,
    private readonly settings: SystemSettingsService,
    private readonly orders: OrdersService,
    private readonly sessions: CheckoutSessionService,
    private readonly crypto: CryptoService,
    private readonly limiter: RateLimiter,
  ) {}

  clearCache(): void {
    this.cache.clear();
  }

  /** Amount-independent part of availability, cached 30 s per merchant. */
  private async baseAvailability(merchantId: string) {
    const hit = this.cache.get(merchantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const s = await this.settings.getAll();
    const merchant = await this.merchants.forCheckout(merchantId);
    const providers = await this.providers.inquirable();
    let value: { available: boolean; degraded: boolean; reason?: AvailabilityResponse['reason']; min: number; max: number };
    if (s.checkoutKillSwitch) value = { available: false, degraded: false, reason: 'KILL_SWITCH', min: s.minOrderAmount, max: s.maxOrderAmount };
    else if (merchant?.status !== 'Enabled') value = { available: false, degraded: false, reason: 'MERCHANT_DISABLED', min: s.minOrderAmount, max: s.maxOrderAmount };
    else if (providers.length === 0) value = { available: false, degraded: false, reason: 'NO_PROVIDER', min: s.minOrderAmount, max: s.maxOrderAmount };
    else if (!(await this.payments.anyHealthyGateway())) value = { available: false, degraded: false, reason: 'NO_BANK_GATEWAY', min: s.minOrderAmount, max: s.maxOrderAmount };
    else if (!this.notifications.isReachable()) value = { available: false, degraded: false, reason: 'SMS_UNAVAILABLE', min: s.minOrderAmount, max: s.maxOrderAmount };
    else {
      const degraded = providers.every((p) => p.connectionStatus === 'Degraded') || !this.consumers.identityHealthy();
      value = { available: true, degraded, min: s.minOrderAmount, max: s.maxOrderAmount };
    }
    this.cache.set(merchantId, { at: Date.now(), value });
    return value;
  }

  async availability(merchantId: string, amount: number): Promise<AvailabilityResponse> {
    const base = await this.baseAvailability(merchantId);
    const out: AvailabilityResponse = { available: base.available, degraded: base.degraded, minAmount: base.min, maxAmount: base.max };
    if (!base.available) out.reason = base.reason;
    else if (amount < base.min || amount > base.max) {
      out.available = false;
      out.degraded = false;
      out.reason = 'AMOUNT_OUT_OF_RANGE';
    }
    return out;
  }

  private checkoutUrl(token: string): string {
    return `${this.config.publicWebUrl}/c/${token}`;
  }

  private resume(existing: Order, amount: number, consumerId: string): { status: number; body: CreateCheckoutResponse } {
    if (existing.status === 'Completed') throw new AppError('ORDER_ALREADY_COMPLETED', 'This order number was already paid.');
    if (existing.totalAmount !== amount || existing.consumerUserId !== consumerId) {
      throw new AppError('ORDER_CONFLICT', 'An active checkout with this order number has a different amount or phone number.');
    }
    return {
      status: 200,
      body: {
        orderId: existing.id,
        checkoutUrl: this.checkoutUrl(this.crypto.decrypt(existing.checkoutTokenEnc)),
        status: existing.status,
        expiresAt: existing.sessionExpiresAt.toISOString(),
      },
    };
  }

  private findActive(merchantId: string, orderNumber: string): Promise<Order | null> {
    return this.orders.findActiveByNumber(merchantId, orderNumber);
  }

  /** FR-002. Returns the HTTP status (201 new, 200 resumed) with the body. */
  async create(merchantId: string, input: CreateCheckoutRequest): Promise<{ status: number; body: CreateCheckoutResponse }> {
    this.limiter.hit(`checkout-create:${merchantId}`, 50, 1000);
    const s = await this.settings.getAll();
    const merchant = await this.merchants.forCheckout(merchantId);
    if (!merchant || merchant.status !== 'Enabled') throw new AppError('MERCHANT_DISABLED', 'This merchant is not enabled for combined-credit payments.');
    if (s.checkoutKillSwitch) throw new AppError('SERVICE_UNAVAILABLE', 'Combined-credit payment is temporarily unavailable.');
    const phone = normalisePhone(input.phoneNumber);
    if (!phone) throw validationError('phoneNumber', 'Please enter a valid mobile number.');
    const host = new URL(input.returnUrl).hostname.toLowerCase();
    if (!merchant.returnUrlDomains.includes(host)) throw validationError('returnUrl', 'The return URL host is not allowed for this merchant.');
    if (input.amount < s.minOrderAmount || input.amount > s.maxOrderAmount) {
      throw new AppError('AMOUNT_OUT_OF_RANGE', 'The amount is outside the allowed range.', { minAmount: s.minOrderAmount, maxAmount: s.maxOrderAmount });
    }
    const consumer = await this.consumers.findOrCreate(this.ds.manager, phone);
    const now = await dbNow(this.ds);
    const existing = await this.findActive(merchantId, input.orderNumber);
    if (existing) return this.resume(existing, input.amount, consumer.id);
    if (!this.consumers.isEligible(consumer, now)) {
      throw new AppError('CONSUMER_NOT_ELIGIBLE', 'This customer cannot use combined-credit payment right now.');
    }
    const token = this.crypto.randomToken(16); // 128-bit
    const order = Object.assign(new Order(), {
      id: newId('ord'),
      merchantId,
      merchantOrderNumber: input.orderNumber,
      consumerUserId: consumer.id,
      totalAmount: input.amount,
      cashAmount: null,
      creditAmount: null,
      cashPaymentBps: null,
      status: 'AwaitingOtp',
      failureReason: null,
      allocationStatus: null,
      refundStatus: 'None',
      refundedAmount: 0,
      sessionExpiresAt: new Date(now.getTime() + s.sessionTtlMinutes * 60_000),
      paymentDeadlineAt: null,
      inquiryAttempts: 0,
      reservationAttempts: 0,
      quoteHash: null,
      cashOnly: false,
      returnUrl: input.returnUrl,
      callbackUrl: input.callbackUrl ?? null,
      checkoutTokenHash: this.sessions.tokenHash(token),
      checkoutTokenEnc: this.crypto.encrypt(token),
      termsVersion: null,
      termsAcceptedAt: null,
      termsAcceptedIp: null,
      termsAcceptedUserAgent: null,
      settlementTermsSnapshot: null,
      completedAt: null,
      claimedBankTransactionId: null,
      cancelRequestedAt: null,
      cancelNotApplied: false,
      metadata: input.metadata ?? null,
      version: 1,
    } satisfies Partial<Order>);
    try {
      // Initiated → AwaitingOtp in one transaction.
      await this.orders.inTx(async (u) => {
        await u.m.insert(Order, order);
        await this.orders.addEvent(u.m, order.id, null, 'Initiated', `merchant:${merchantId}`, null);
        await this.orders.addEvent(u.m, order.id, 'Initiated', 'AwaitingOtp', 'system', null);
      });
    } catch (e) {
      // AC4: concurrent create with the same orderNumber → exactly one row; both reference it.
      if (isUniqueViolation(e, 'uq_order_merchant_number_active')) {
        const winner = await this.findActive(merchantId, input.orderNumber);
        if (winner) return this.resume(winner, input.amount, consumer.id);
      }
      throw e;
    }
    return {
      status: 201,
      body: { orderId: order.id, checkoutUrl: this.checkoutUrl(token), status: 'AwaitingOtp', expiresAt: order.sessionExpiresAt.toISOString() },
    };
  }
}
