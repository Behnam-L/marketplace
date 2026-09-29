import { randomInt } from 'node:crypto';
import { ExecutionContext, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TERMINAL_ORDER_STATUSES, type SendOtpResponse } from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError, stateChanged, validationError } from '../../shared/errors/app-error';
import { dbNow, returnedRows } from '../../shared/database/tx';
import { CHECKOUT_OTP, setPrincipal, type CheckoutPrincipal } from '../../shared/http/auth-context';
import { CryptoService, safeEqual } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { RateLimiter } from '../../shared/util/rate-limiter';
import { AuthRegistry } from '../auth/auth-registry';
import { ConsumersService } from '../consumers/consumers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import type { Order } from '../orders/order.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CheckoutSession, OtpSession } from './checkout.entity';

export const CHECKOUT_COOKIE = 'bajet_chk';
export const TERMS_VERSION = '2026-09';
const SESSION_TTL_MS = 24 * 3600 * 1000;

export interface Meta {
  ip: string | null;
  userAgent: string | null;
}

/** Checkout token → session cookie, OTP (FR-010–013, §9.1 consumer). */
@Injectable()
export class CheckoutSessionService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly registry: AuthRegistry,
    private readonly reflector: Reflector,
    private readonly crypto: CryptoService,
    private readonly limiter: RateLimiter,
    private readonly orders: OrdersService,
    private readonly consumers: ConsumersService,
    private readonly notifications: NotificationsService,
    private readonly settings: SystemSettingsService,
  ) {}

  onModuleInit(): void {
    this.registry.register('checkout', (req, ctx) => this.authenticate(req, ctx));
  }

  tokenHash(token: string): string {
    return this.crypto.hmac('checkout-token', token);
  }

  /** Checkout endpoints: 30 mutations/min per IP (§9.5). Polling GETs are exempt. */
  limit(meta: Meta): void {
    this.limiter.hit(`checkout:${meta.ip}`, 30, 60_000);
  }

  private async authenticate(req: Request, ctx: ExecutionContext): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[CHECKOUT_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Checkout session required.');
    const session = await this.ds.manager.findOne(CheckoutSession, { where: { tokenHash: this.crypto.hmac('checkout-session', token) } });
    if (!session || session.expiresAt.getTime() <= Date.now()) throw new AppError('SESSION_EXPIRED', 'Checkout session expired.');
    const principal: CheckoutPrincipal = {
      kind: 'checkout',
      sessionId: session.id,
      orderId: session.orderId,
      otpVerified: session.otpVerifiedAt !== null,
    };
    setPrincipal(req, principal);
    const needsOtp = this.reflector.getAllAndOverride<boolean>(CHECKOUT_OTP, [ctx.getHandler(), ctx.getClass()]);
    if (needsOtp && !principal.otpVerified) throw new AppError('OTP_REQUIRED', 'Please verify your phone number first.');
  }

  /**
   * FR-010: exchanges the checkout token for an HttpOnly cookie. A browser that
   * already holds a valid session for this order keeps it (two tabs share one
   * session); any other browser gets a new session that must pass OTP again.
   */
  async exchange(checkoutToken: string, req: Request, res: Response, meta: Meta): Promise<{ order: Order; session: CheckoutSession }> {
    this.limit(meta);
    const order = await this.orders.findByTokenHash(this.tokenHash(checkoutToken));
    if (!order) throw new AppError('NOT_FOUND', 'This payment request is invalid. Please return to the store and try again.');
    if ((TERMINAL_ORDER_STATUSES as string[]).includes(order.status) && order.updatedAt.getTime() + SESSION_TTL_MS < Date.now()) {
      throw new AppError('CHECKOUT_TOKEN_EXPIRED', 'This session has expired. Please start a new payment.');
    }
    const existingToken = (req.cookies as Record<string, string> | undefined)?.[CHECKOUT_COOKIE];
    if (existingToken) {
      const s = await this.ds.manager.findOne(CheckoutSession, { where: { tokenHash: this.crypto.hmac('checkout-session', existingToken) } });
      if (s && s.orderId === order.id && s.expiresAt.getTime() > Date.now()) return { order, session: s };
    }
    const cookieToken = this.crypto.randomToken(32);
    const session = this.ds.manager.create(CheckoutSession, {
      id: newId('chs'),
      orderId: order.id,
      tokenHash: this.crypto.hmac('checkout-session', cookieToken),
      otpVerifiedAt: null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    });
    await this.ds.manager.insert(CheckoutSession, session);
    res.cookie(CHECKOUT_COOKIE, cookieToken, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
    return { order, session };
  }

  getSession(id: string): Promise<CheckoutSession | null> {
    return this.ds.manager.findOne(CheckoutSession, { where: { id } });
  }

  /* ─────────── Terms (FR-011) ─────────── */

  async acceptTerms(p: CheckoutPrincipal, version: number, termsVersion: string, meta: Meta): Promise<void> {
    this.limit(meta);
    if (termsVersion !== TERMS_VERSION) throw validationError('termsVersion', 'Please accept the current terms and conditions.');
    await this.orders.inTx(async (u) => {
      const o = await this.orders.lock(u.m, p.orderId);
      if (o.status !== 'AwaitingOtp' || o.version !== version) throw stateChanged({ status: o.status, version: o.version });
      await u.m.query(
        `UPDATE "order" SET terms_version = $2, terms_accepted_at = now(), terms_accepted_ip = $3, terms_accepted_user_agent = $4,
           version = version + 1, updated_at = now() WHERE id = $1`,
        [o.id, termsVersion, meta.ip, meta.userAgent?.slice(0, 500) ?? null],
      );
    });
  }

  /* ─────────── OTP (FR-012/013) ─────────── */

  async send(p: CheckoutPrincipal, meta: Meta): Promise<SendOtpResponse> {
    this.limit(meta);
    const order = await this.orders.mustGet(p.orderId);
    if ((TERMINAL_ORDER_STATUSES as string[]).includes(order.status)) throw stateChanged({ status: order.status });
    if (order.status === 'AwaitingOtp' && !order.termsAcceptedAt) {
      throw validationError('terms', 'Please accept the terms and conditions to continue.');
    }
    if (order.status !== 'AwaitingOtp' && p.otpVerified) throw stateChanged({ status: order.status });
    const consumer = await this.consumers.get(order.consumerUserId);
    const s = await this.settings.getAll();
    const now = await dbNow(this.ds);
    // §9.5: OTP sends 5/h per phone (dispatched sends only).
    const hourly: { n: string }[] = await this.ds.query(
      `SELECT count(*) AS n FROM otp_session WHERE consumer_user_id = $1 AND dispatch_status = 'Sent' AND created_at > now() - interval '1 hour'`,
      [order.consumerUserId],
    );
    if (Number(hourly[0].n) >= 5) throw new AppError('RATE_LIMITED', 'Too many codes requested. Please try again later.', { retryAfter: 3600 });
    const dispatched = await this.ds.manager.find(OtpSession, { where: { orderId: order.id, dispatchStatus: 'Sent' }, order: { createdAt: 'DESC' } });
    if (dispatched.length > 0) {
      const last = dispatched[0];
      const availableAt = last.createdAt.getTime() + s.otpResendCooldownSeconds * 1000;
      if (now.getTime() < availableAt) {
        const retryAfter = Math.ceil((availableAt - now.getTime()) / 1000);
        throw new AppError('OTP_RESEND_COOLDOWN', 'Please wait before requesting a new code.', { retryAfter }, { 'Retry-After': String(retryAfter) });
      }
      if (dispatched.length - 1 >= s.otpMaxResends) throw new AppError('OTP_RESEND_LIMIT', 'You have reached the maximum number of codes for this payment.');
    }
    const code = String(randomInt(0, 100_000)).padStart(5, '0');
    const id = newId('otp');
    const expiresAt = new Date(now.getTime() + s.otpTtlSeconds * 1000);
    await this.ds.transaction(async (m) => {
      await m.update(OtpSession, { orderId: order.id, status: 'Sent' }, { status: 'Superseded' });
      await m.insert(OtpSession, {
        id,
        orderId: order.id,
        checkoutSessionId: p.sessionId,
        consumerUserId: order.consumerUserId,
        codeHash: this.crypto.hmac('otp', `${id}:${code}`),
        expiresAt,
        attempts: 0,
        status: 'Sent',
        dispatchStatus: 'Pending',
        smsProvider: null,
      });
    });
    try {
      const r = await this.notifications.sendSms('otp.sent', consumer!.phoneE164, { code });
      await this.ds.manager.update(OtpSession, { id }, { dispatchStatus: 'Sent', smsProvider: r.provider });
    } catch (e) {
      await this.ds.manager.update(OtpSession, { id }, { dispatchStatus: 'Failed', status: 'Superseded' });
      throw e;
    }
    const used = dispatched.length;
    return {
      otpSessionId: id,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(now.getTime() + s.otpResendCooldownSeconds * 1000).toISOString(),
      resendsLeft: Math.max(0, s.otpMaxResends - used),
    };
  }

  /** The live (sent, unexpired) OTP for the view, so a reloaded page resumes it instead of re-sending. */
  async current(orderId: string): Promise<SendOtpResponse | null> {
    const dispatched = await this.ds.manager.find(OtpSession, { where: { orderId, dispatchStatus: 'Sent' }, order: { createdAt: 'DESC' } });
    const live = dispatched[0];
    const now = await dbNow(this.ds);
    if (!live || live.status !== 'Sent' || live.expiresAt.getTime() <= now.getTime()) return null;
    const s = await this.settings.getAll();
    return {
      otpSessionId: live.id,
      expiresAt: live.expiresAt.toISOString(),
      resendAvailableAt: new Date(live.createdAt.getTime() + s.otpResendCooldownSeconds * 1000).toISOString(),
      resendsLeft: Math.max(0, s.otpMaxResends - (dispatched.length - 1)),
    };
  }

  /**
   * FR-013. Returns 'verified' or throws the matching error. Locks on the Nth wrong
   * code (not N+1). Order transitions are applied by the caller.
   */
  async verify(p: CheckoutPrincipal, otpSessionId: string, code: string, meta: Meta): Promise<'verified' | 'locked'> {
    this.limit(meta);
    const s = await this.settings.getAll();
    const result = await this.ds.transaction(async (m) => {
      const current = await m.findOne(OtpSession, { where: { orderId: p.orderId, status: 'Sent' }, lock: { mode: 'pessimistic_write' } });
      if (!current || current.id !== otpSessionId || current.checkoutSessionId !== p.sessionId) {
        return { kind: 'superseded' as const };
      }
      const expired: { e: boolean }[] = await m.query(`SELECT expires_at <= now() AS e FROM otp_session WHERE id = $1`, [current.id]);
      if (expired[0].e) {
        await m.update(OtpSession, { id: current.id }, { status: 'Expired' });
        return { kind: 'expired' as const };
      }
      const ok = safeEqual(this.crypto.hmac('otp', `${current.id}:${code}`), current.codeHash);
      if (ok) {
        await m.update(OtpSession, { id: current.id }, { status: 'Verified' });
        const r = returnedRows(await m.query(`UPDATE checkout_session SET otp_verified_at = now() WHERE id = $1 RETURNING id`, [p.sessionId]));
        if (!r.length) throw new Error('checkout session vanished');
        return { kind: 'ok' as const };
      }
      const attempts = current.attempts + 1;
      if (attempts >= s.otpMaxAttempts) {
        await m.update(OtpSession, { id: current.id }, { attempts, status: 'LockedOut' });
        return { kind: 'locked' as const, consumerId: current.consumerUserId };
      }
      await m.update(OtpSession, { id: current.id }, { attempts });
      return { kind: 'invalid' as const, attemptsLeft: s.otpMaxAttempts - attempts };
    });
    switch (result.kind) {
      case 'superseded':
        throw new AppError('OTP_SESSION_SUPERSEDED', 'This code is no longer valid. Please use the latest code we sent.');
      case 'expired':
        throw new AppError('OTP_EXPIRED', 'This code has expired. Please request a new one.');
      case 'invalid':
        throw new AppError('OTP_INVALID', 'The code is incorrect.', { attemptsLeft: result.attemptsLeft });
      case 'locked': {
        // AC5: the phone's Nth lockout within 24 h starts a cooldown.
        const rows: { n: string }[] = await this.ds.query(
          `SELECT count(*) AS n FROM otp_session WHERE consumer_user_id = $1 AND status = 'LockedOut' AND created_at > now() - interval '24 hours'`,
          [result.consumerId],
        );
        if (Number(rows[0].n) >= s.phoneLockoutsBeforeCooldown) {
          await this.consumers.startCooldown(this.ds.manager, result.consumerId, s.phoneCooldownHours);
        }
        return 'locked';
      }
      default:
        return 'verified';
    }
  }

  async purgeExpiredSessions(): Promise<void> {
    await this.ds.query(`DELETE FROM checkout_session WHERE expires_at < now() - interval '1 day'`);
    // §9.5 retention: OTP sessions 90 days.
    await this.ds.query(`DELETE FROM otp_session WHERE created_at < now() - interval '90 days'`);
  }
}
