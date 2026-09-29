import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { as, createAdmin, type TestAdmin } from './admin-session';
import { createMerchant, createMerchantPlan, createProvider, createProviderPlan, nationalCode, nextSeed, seedGateways } from './fixtures';
import { signRequest } from '../modules/merchants/merchant-signing';
import { ProviderGatewayService } from '../modules/credit-providers/provider-gateway.service';
import { CheckoutFlowService } from '../modules/checkout/checkout-flow.service';
import { PaymentsService } from '../modules/payments/payments.service';
import { RateLimiter } from '../shared/util/rate-limiter';

export class MerchantClient {
  constructor(
    private readonly app: INestApplication,
    readonly merchantId: string,
    readonly keyId: string,
    readonly secret: string,
  ) {}

  private headers(method: string, path: string, body: string): Record<string, string> {
    const ts = String(Math.floor(Date.now() / 1000));
    return {
      'X-Bajet-Key-Id': this.keyId,
      'X-Bajet-Timestamp': ts,
      'X-Bajet-Signature': signRequest(this.secret, ts, method, path, body),
      'Content-Type': 'application/json',
    };
  }

  post(path: string, body: unknown, idempotencyKey?: string): request.Test {
    const raw = JSON.stringify(body);
    const r = request(this.app.getHttpServer()).post(path).set(this.headers('POST', path, raw));
    if (idempotencyKey) r.set('Idempotency-Key', idempotencyKey);
    return r.send(raw);
  }

  get(path: string): request.Test {
    return request(this.app.getHttpServer()).get(path).set(this.headers('GET', path, ''));
  }
}

export interface World {
  admin: TestAdmin;
  merchant: MerchantClient;
  providerIds: string[];
  mPlan: string;
}

/** Admin, plans, one merchant with an API key, N connected providers, gateways. */
export async function buildWorld(app: INestApplication, ds: DataSource, providerCount = 2): Promise<World> {
  await seedGateways(ds);
  const admin = await createAdmin(app, ds);
  const mPlan = await createMerchantPlan(app, admin);
  const merchant = await createMerchant(app, admin, mPlan);
  const key = await as(app, admin).post(`/v1/admin/merchants/${merchant.id}/api-keys`).expect(201);
  const providerIds: string[] = [];
  for (let i = 0; i < providerCount; i++) {
    const plan = await createProviderPlan(app, admin, { providerPayableMarginBps: 100 + i * 50, installmentCount: 1 + i });
    providerIds.push(await createProvider(app, ds, admin, plan, { sortOrder: i + 1 }));
  }
  return { admin, merchant: new MerchantClient(app, merchant.id, key.body.keyId, key.body.secret), providerIds, mPlan };
}

let phoneSeq = 3000000;
export const nextPhone = (): string => `0913${String((phoneSeq += 17) % 10_000_000).padStart(7, '0')}`;

export class Consumer {
  readonly agent: ReturnType<typeof request.agent>;
  version = 0;
  token = '';
  otpSessionId = '';
  readonly nationalId = nationalCode(nextSeed());

  constructor(
    private readonly app: INestApplication,
    readonly phone: string,
  ) {
    this.agent = request.agent(app.getHttpServer());
  }

  async open(checkoutUrl: string): Promise<request.Response> {
    this.token = checkoutUrl.split('/c/')[1];
    const r = await this.agent.post('/v1/checkout/sessions').send({ checkoutToken: this.token });
    if (r.status === 200) this.version = r.body.order.version;
    return r;
  }

  async refresh(): Promise<Record<string, unknown> & { status: string; step: string; version: number }> {
    const r = await this.agent.get('/v1/checkout/order').expect(200);
    this.version = r.body.version;
    return r.body;
  }

  post(path: string, body: unknown = {}, extra: Record<string, string> = {}): request.Test {
    return this.agent.post(`/v1/checkout${path}`).set('If-Match', String(this.version)).set(extra).send(body as object);
  }

  async latestCode(): Promise<string> {
    const r = await request(this.app.getHttpServer()).get(`/v1/demo/sms?phone=${this.phone}`).expect(200);
    return /(\d{5})/.exec(r.body[0].text)![1];
  }

  async acceptTermsAndVerifyOtp(): Promise<void> {
    await this.post('/terms', { termsVersion: '2026-09', accepted: true }).expect(200);
    await this.refresh();
    const otp = await this.post('/otp').expect(201);
    this.otpSessionId = otp.body.otpSessionId;
    const v = await this.post('/otp/verify', { otpSessionId: this.otpSessionId, code: await this.latestCode() }).expect(200);
    this.version = v.body.order.version;
  }

  async verifyIdentity(dob = '1990-05-17'): Promise<void> {
    await this.refresh();
    const n = await this.post('/identity/national-id', { nationalId: this.nationalId }).expect(200);
    this.version = n.body.order.version;
    const d = await this.post('/identity/dob', { dateOfBirth: dob }).expect(200);
    this.version = d.body.order.version;
  }
}

export async function settle(app: INestApplication): Promise<void> {
  await app.get(CheckoutFlowService).settle();
}

export function resetLimits(app: INestApplication): void {
  app.get(RateLimiter).reset();
}

export function mockProvider(app: INestApplication, providerId: string) {
  return app.get(ProviderGatewayService).mock(providerId);
}

export async function createCheckout(world: World, phone: string, amount = 20_000_000, orderNumber = `ORD-${nextSeed()}`): Promise<request.Response> {
  return world.merchant
    .post('/v1/merchant/checkouts', { orderNumber, amount, phoneNumber: phone, returnUrl: 'https://shop.example.com/return' }, `ik-${orderNumber}-${Math.random()}`)
    .expect((r) => {
      if (r.status >= 300) throw new Error(`create checkout failed: ${r.status} ${JSON.stringify(r.body)}`);
    });
}

/** Drives a consumer to AwaitingSupplierSelection with the given balances per provider. */
export async function toSelection(app: INestApplication, world: World, balances: number[], amount = 20_000_000): Promise<Consumer> {
  const c = new Consumer(app, nextPhone());
  world.providerIds.forEach((pid, i) => {
    mockProvider(app, pid).behaviour = { balances: { [c.nationalId]: balances[i] ?? 0 } };
  });
  const created = await createCheckout(world, c.phone, amount);
  await c.open(created.body.checkoutUrl);
  await c.acceptTermsAndVerifyOtp();
  await c.verifyIdentity();
  await settle(app);
  await c.refresh();
  return c;
}

/** Completes the mock bank page and posts the callback like the browser would. */
export async function payAtBank(app: INestApplication, redirectUrl: string, action: 'pay' | 'fail' | 'cancel' = 'pay'): Promise<request.Response> {
  const m = /mock-gateway\/([A-Z_]+)\/([a-f0-9]+)/.exec(redirectUrl)!;
  const r = app.get(PaymentsService).adapter(m[1]).complete(m[2], action)!;
  return request(app.getHttpServer()).post(`/v1/callbacks/bank/${m[1]}`).type('form').send(r.fields);
}
