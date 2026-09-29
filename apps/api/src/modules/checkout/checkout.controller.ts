import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type {
  AvailabilityResponse,
  BankPaymentResponse,
  CancelResponse,
  CheckoutOrderView,
  CheckoutResultResponse,
  ConfirmResponse,
  CreateCheckoutResponse,
  CreditResponse,
  NationalIdResponse,
  QuoteResponse,
  SendOtpResponse,
} from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError } from '../../shared/errors/app-error';
import { CheckoutAuth, CurrentCheckout, CurrentMerchant, MerchantAuth, type CheckoutPrincipal, type MerchantPrincipal } from '../../shared/http/auth-context';
import { IfMatch, ReqMeta, type RequestMeta } from '../../shared/http/request-meta';
import { Idempotent } from '../../shared/idempotency/idempotency.interceptor';
import { CryptoService } from '../../shared/security/crypto.service';
import { CheckoutSessionService } from './checkout-session.service';
import { CheckoutFlowService } from './checkout-flow.service';
import { CheckoutPaymentsService } from './checkout-payments.service';
import { CheckoutViewService } from './checkout-view.service';
import { MerchantCheckoutService } from './merchant-checkout.service';
import {
  AcceptTermsDto,
  AvailabilityQueryDto,
  ConfirmDto,
  CreateCheckoutDto,
  CreateSessionDto,
  DobDto,
  NationalIdDto,
  QuoteDto,
  VerifyOtpDto,
} from './checkout.dto';

@ApiTags('merchant API')
@Controller('merchant')
export class MerchantCheckoutController {
  constructor(private readonly svc: MerchantCheckoutService) {}

  /** FR-001 (server-to-server). Cached 30 s per merchant. */
  @Get('availability')
  @MerchantAuth()
  availability(@Query() q: AvailabilityQueryDto, @CurrentMerchant() m: MerchantPrincipal): Promise<AvailabilityResponse> {
    return this.svc.availability(m.merchantId, q.amount);
  }

  /** FR-002: `201` new, `200` resumed. Requires `Idempotency-Key`. */
  @Post('checkouts')
  @Idempotent()
  @MerchantAuth()
  async create(@Body() body: CreateCheckoutDto, @CurrentMerchant() m: MerchantPrincipal, @Res({ passthrough: true }) res: Response): Promise<CreateCheckoutResponse> {
    const r = await this.svc.create(m.merchantId, body);
    res.status(r.status);
    return r.body;
  }
}

@ApiTags('checkout (consumer)')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly sessions: CheckoutSessionService,
    private readonly flow: CheckoutFlowService,
    private readonly payments: CheckoutPaymentsService,
    private readonly views: CheckoutViewService,
  ) {}

  /** Exchanges the checkout token for an HttpOnly session cookie (FR-010). */
  @Post('sessions')
  @HttpCode(200)
  async createSession(@Body() body: CreateSessionDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @ReqMeta() meta: RequestMeta): Promise<{ order: CheckoutOrderView }> {
    const { order, session } = await this.sessions.exchange(body.checkoutToken, req, res, meta);
    return { order: await this.views.view(order.id, session.otpVerifiedAt !== null) };
  }

  @Get('order')
  @CheckoutAuth()
  order(@CurrentCheckout() p: CheckoutPrincipal): Promise<CheckoutOrderView> {
    return this.views.view(p.orderId, p.otpVerified);
  }

  @Post('terms')
  @HttpCode(200)
  @CheckoutAuth()
  async terms(@Body() body: AcceptTermsDto, @IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<{ order: CheckoutOrderView }> {
    await this.sessions.acceptTerms(p, version, body.termsVersion, meta);
    return { order: await this.views.view(p.orderId, p.otpVerified, false) };
  }

  /** Send or resend (cooldown, max resends, primary→secondary SMS failover). */
  @Post('otp')
  @CheckoutAuth()
  otp(@CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<SendOtpResponse> {
    return this.sessions.send(p, meta);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @CheckoutAuth()
  async verify(@Body() body: VerifyOtpDto, @IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<{ order: CheckoutOrderView }> {
    const outcome = await this.sessions.verify(p, body.otpSessionId, body.code, meta);
    if (outcome === 'locked') {
      await this.flow.onOtpLocked(p.orderId);
      throw new AppError('OTP_LOCKED', 'Too many incorrect attempts. Please return to the store and start again.');
    }
    await this.flow.onOtpVerified(p.orderId, version);
    return { order: await this.views.view(p.orderId, true) };
  }

  /** FR-020 retry of the linkage check (identity service was unavailable). */
  @Post('identity/check')
  @HttpCode(200)
  @CheckoutAuth(true)
  async identityCheck(@IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal): Promise<{ order: CheckoutOrderView }> {
    await this.flow.checkLinkage(p, version);
    return { order: await this.views.view(p.orderId, true) };
  }

  @Post('identity/national-id')
  @HttpCode(200)
  @CheckoutAuth(true)
  async nationalId(@Body() body: NationalIdDto, @IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<NationalIdResponse & { order: CheckoutOrderView }> {
    this.sessions.limit(meta);
    await this.flow.submitNationalId(p, version, body.nationalId);
    return { next: 'dob', order: await this.views.view(p.orderId, true) };
  }

  @Post('identity/dob')
  @HttpCode(200)
  @CheckoutAuth(true)
  async dob(@Body() body: DobDto, @IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<{ order: CheckoutOrderView }> {
    this.sessions.limit(meta);
    await this.flow.submitDob(p, version, body.dateOfBirth);
    return { order: await this.views.view(p.orderId, true) };
  }

  @Get('credit')
  @CheckoutAuth(true)
  credit(@CurrentCheckout() p: CheckoutPrincipal): Promise<CreditResponse> {
    return this.views.credit(p);
  }

  @Post('credit/inquiries')
  @HttpCode(202)
  @CheckoutAuth(true)
  async retryInquiry(@IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<{ order: CheckoutOrderView }> {
    this.sessions.limit(meta);
    await this.flow.retryInquiry(p, version);
    return { order: await this.views.view(p.orderId, true) };
  }

  @Post('quote')
  @HttpCode(200)
  @CheckoutAuth(true)
  quote(@Body() body: QuoteDto, @CurrentCheckout() p: CheckoutPrincipal): Promise<QuoteResponse> {
    return this.flow.quote(p, body);
  }

  /** FR-040. `Idempotency-Key` + `If-Match` + `quoteHash`. */
  @Post('confirm')
  @HttpCode(202)
  @Idempotent()
  @CheckoutAuth(true)
  async confirm(@Body() body: ConfirmDto, @IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<ConfirmResponse> {
    this.sessions.limit(meta);
    const r = await this.flow.confirm(p, version, body);
    if (r === 'bank') {
      try {
        const o = await this.views.view(p.orderId, true, false);
        const redirect = await this.payments.startBankPayment(p, o.version);
        return { order: await this.views.view(p.orderId, true, false), next: { type: 'redirect', ...redirect } };
      } catch {
        // Initiation error: the payment-failed screen offers Retry/Cancel (FR-042 AC1).
      }
    }
    return { order: await this.views.view(p.orderId, true, false), next: { type: 'poll' } };
  }

  @Post('bank-payments')
  @Idempotent()
  @CheckoutAuth(true)
  async bankPayment(@IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<BankPaymentResponse> {
    this.sessions.limit(meta);
    return { redirect: await this.payments.startBankPayment(p, version) };
  }

  @Post('cancel')
  @HttpCode(200)
  @Idempotent()
  @CheckoutAuth()
  async cancel(@IfMatch() version: number, @CurrentCheckout() p: CheckoutPrincipal, @ReqMeta() meta: RequestMeta): Promise<CancelResponse> {
    this.sessions.limit(meta);
    return { status: await this.payments.cancel(p, version) };
  }

  @Get('result')
  @CheckoutAuth(true)
  result(@CurrentCheckout() p: CheckoutPrincipal): Promise<CheckoutResultResponse> {
    return this.views.result(p);
  }
}

/** PSP callbacks: untrusted; outcome only from server-side verify/inquiry (§9.4). */
@ApiTags('callbacks')
@Controller('callbacks/bank')
export class BankCallbackController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly payments: CheckoutPaymentsService,
    private readonly crypto: CryptoService,
  ) {}

  private async handle(code: string, payload: Record<string, unknown>, res: Response): Promise<void> {
    const order = await this.payments.handleCallback(code, payload);
    if (!order) {
      res.redirect(302, `${this.config.publicWebUrl}/c/error`);
      return;
    }
    res.redirect(302, `${this.config.publicWebUrl}/c/${this.crypto.decrypt(order.checkoutTokenEnc)}/return`);
  }

  @Get(':gatewayCode')
  get(@Param('gatewayCode') code: string, @Query() q: Record<string, unknown>, @Res() res: Response): Promise<void> {
    return this.handle(code, q, res);
  }

  @Post(':gatewayCode')
  post(@Param('gatewayCode') code: string, @Body() body: Record<string, unknown>, @Query() q: Record<string, unknown>, @Res() res: Response): Promise<void> {
    return this.handle(code, { ...q, ...body }, res);
  }
}
