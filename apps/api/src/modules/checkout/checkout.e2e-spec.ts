import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as } from '../../test-utils/admin-session';
import {
  buildWorld,
  Consumer,
  createCheckout,
  mockProvider,
  nextPhone,
  payAtBank,
  resetLimits,
  settle,
  toSelection,
  type World,
} from '../../test-utils/checkout-harness';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';

describe('Checkout end to end (FR-001–061)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 2);
  });
  afterAll(() => app.close());
  beforeEach(() => resetLimits(app));

  it('happy path: 2 providers + cash → Completed, allocation confirmed, ledger and documents posted', async () => {
    const c = await toSelection(app, world, [6_000_000, 9_000_000]);
    expect(c.version).toBeGreaterThan(0);
    const order = await c.refresh();
    expect(order.status).toBe('AwaitingSupplierSelection');
    const credit = await c.agent.get('/v1/checkout/credit').expect(200);
    expect(credit.body.providers.map((p: { availableAmount: number }) => p.availableAmount)).toEqual([6_000_000, 9_000_000]);
    const quote = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    expect(quote.body).toMatchObject({ cashAmount: 5_000_000, creditAmount: 15_000_000 }); // FR-032 AC1
    expect(quote.body.allocations.map((a: { amount: number }) => a.amount)).toEqual([6_000_000, 9_000_000]);
    const confirm = await c
      .post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: quote.body.quoteHash }, { 'Idempotency-Key': 'confirm-1' })
      .expect(202);
    expect(confirm.body.next.type).toBe('poll');
    // AC3: replay with the same key creates no second reservation set.
    await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: quote.body.quoteHash }, { 'Idempotency-Key': 'confirm-1' }).expect(202);
    await settle(app);
    const afterReserve = await c.refresh();
    expect(afterReserve.status).toBe('AwaitingBankPayment');
    expect(afterReserve.step).toBe('bank-start');
    const res: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM credit_reservation WHERE order_id = $1`, [afterReserve.orderId]);
    expect(Number(res[0].n)).toBe(2);
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'bank-1' }).expect(201);
    const cb = await payAtBank(app, bank.body.redirect.url);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain(`/c/${c.token}/return`);
    await settle(app);
    const done = await c.refresh();
    expect(done.status).toBe('Completed');
    expect(done.step).toBe('result');
    const result = await c.agent.get('/v1/checkout/result').expect(200);
    expect(result.body).toMatchObject({ status: 'Completed', cashAmount: 5_000_000, creditAmount: 15_000_000 });
    expect(result.body.bankReference).toMatch(/^RRN/);
    expect(result.body.returnUrl).toContain('sig=');
    // Merchant view (FR-003).
    const mv = await world.merchant.get(`/v1/merchant/orders/${done.orderId}`).expect(200);
    expect(mv.body).toMatchObject({ status: 'Completed', allocationStatus: 'Confirmed', cashAmount: 5_000_000 });
    // Ledger (BR-LED-03/04): suspense cleared, merchant owed T − M.
    const ledger = app.get(LedgerService);
    expect(await ledger.balance(Accounts.merchant(world.merchant.merchantId))).toBe(-(20_000_000 - 600_000));
    const docs = await as(app, world.admin).get(`/v1/admin/documents?orderId=${done.orderId}`).expect(200);
    expect(docs.body.items.length).toBe(3 + 1 + 2); // merchant cash+2 inst, provider1 ×1, provider2 ×2
    const hooks: { event_type: string }[] = await ds.query(`SELECT event_type FROM merchant_webhook_event WHERE merchant_id = $1`, [world.merchant.merchantId]);
    expect(hooks.map((h) => h.event_type)).toContain('order.completed');
    // FR-043 AC1: a duplicate callback changes nothing.
    const again = await payAtBank(app, bank.body.redirect.url);
    expect(again.status).toBe(302);
    const verifies: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM bank_call_log WHERE operation = 'verify'`);
    expect(Number(verifies[0].n)).toBe(1);
    const admin = await as(app, world.admin).get(`/v1/admin/orders/${done.orderId}`).expect(200);
    expect(admin.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'Initiated', 'AwaitingOtp', 'AwaitingIdentity', 'CreditInquiryInProgress', 'AwaitingSupplierSelection',
      'ReservationInProgress', 'AwaitingBankPayment', 'PaymentVerifying', 'AllocationInProgress', 'Completed',
    ]);
    const breaches = await ledger.checkInvariants();
    expect(breaches.filter((b) => b.name.includes(world.merchant.merchantId) || world.providerIds.some((p) => b.name.includes(p)) || b.name === 'ALLOCATION_SUSPENSE' || b.name === 'TRIAL_BALANCE')).toEqual([]);
  });

  it('FR-001 availability and FR-002 create/resume/conflict/idempotency', async () => {
    const a = await world.merchant.get('/v1/merchant/availability?amount=500').expect(200);
    expect(a.body).toMatchObject({ available: false, reason: 'AMOUNT_OUT_OF_RANGE' });
    const b = await world.merchant.get('/v1/merchant/availability?amount=5000000').expect(200);
    expect(b.body).toMatchObject({ available: true, degraded: false });
    const phone = nextPhone();
    const body = { orderNumber: 'DUP-1', amount: 1_000_000, phoneNumber: phone, returnUrl: 'https://shop.example.com/r' };
    const first = await world.merchant.post('/v1/merchant/checkouts', body, 'k-dup-1').expect(201);
    const replay = await world.merchant.post('/v1/merchant/checkouts', body, 'k-dup-1').expect(201);
    expect(replay.body).toEqual(first.body);
    await world.merchant.post('/v1/merchant/checkouts', { ...body, amount: 2 }, 'k-dup-1').expect(422);
    const resumed = await world.merchant.post('/v1/merchant/checkouts', body, 'k-dup-2').expect(200);
    expect(resumed.body.orderId).toBe(first.body.orderId);
    expect(resumed.body.checkoutUrl).toBe(first.body.checkoutUrl);
    const conflict = await world.merchant.post('/v1/merchant/checkouts', { ...body, amount: 1_500_000 }, 'k-dup-3').expect(409);
    expect(conflict.body.error.code).toBe('ORDER_CONFLICT');
    const badReturn = await world.merchant.post('/v1/merchant/checkouts', { ...body, orderNumber: 'X2', returnUrl: 'https://evil.example.org/r' }, 'k-dup-4').expect(400);
    expect(badReturn.body.error.code).toBe('VALIDATION_ERROR');
    // AC4: concurrent creates, different keys, same number → one order.
    const cb = { orderNumber: 'RACE-1', amount: 1_000_000, phoneNumber: nextPhone(), returnUrl: 'https://shop.example.com/r' };
    const [r1, r2] = await Promise.all([world.merchant.post('/v1/merchant/checkouts', cb, 'race-a'), world.merchant.post('/v1/merchant/checkouts', cb, 'race-b')]);
    expect(r1.body.orderId).toBe(r2.body.orderId);
    const rows: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM "order" WHERE merchant_order_number = 'RACE-1'`);
    expect(Number(rows[0].n)).toBe(1);
    // Bad signature.
    const bad = await request(app.getHttpServer())
      .get('/v1/merchant/availability?amount=1000')
      .set({ 'X-Bajet-Key-Id': world.merchant.keyId, 'X-Bajet-Timestamp': String(Math.floor(Date.now() / 1000)), 'X-Bajet-Signature': 'ab'.repeat(32) })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('FR-010 AC2: a new browser must pass OTP again; no credit data before', async () => {
    const c = await toSelection(app, world, [10_000_000, 10_000_000]);
    const other = new Consumer(app, c.phone);
    const r = await other.open(`x/c/${c.token}`);
    expect(r.body.order.step).toBe('otp');
    expect(r.body.order.cashAmount).toBeNull();
    const credit = await other.agent.get('/v1/checkout/credit').expect(401);
    expect(credit.body.error.code).toBe('OTP_REQUIRED');
    const state = await c.refresh();
    expect(state.status).toBe('AwaitingSupplierSelection');
  });

  it('FR-011/012/013: terms gate, cooldown, superseded session, lockout on the 5th wrong code', async () => {
    const c = new Consumer(app, nextPhone());
    const created = await createCheckout(world, c.phone, 2_000_000);
    await c.open(created.body.checkoutUrl);
    const noTerms = await c.post('/otp').expect(400);
    expect(noTerms.body.error.message).toBe('Please accept the terms and conditions to continue.');
    await c.post('/terms', { termsVersion: '2026-09', accepted: true }).expect(200);
    await c.refresh();
    const s1 = await c.post('/otp').expect(201);
    const cooldown = await c.post('/otp').expect(429);
    expect(cooldown.body.error.code).toBe('OTP_RESEND_COOLDOWN');
    expect(cooldown.body.error.details.retryAfter).toBeGreaterThan(0);
    // A reopened page resumes the live code from the view instead of re-sending.
    const resumed = (await c.refresh()) as unknown as { otp: { otpSessionId: string; resendsLeft: number } | null };
    expect(resumed.otp?.otpSessionId).toBe(s1.body.otpSessionId);
    expect(resumed.otp?.resendsLeft).toBe(3);
    await ds.query(`UPDATE otp_session SET created_at = now() - interval '2 minutes' WHERE id = $1`, [s1.body.otpSessionId]);
    const s2 = await c.post('/otp').expect(201);
    const code2 = await c.latestCode();
    const superseded = await c.post('/otp/verify', { otpSessionId: s1.body.otpSessionId, code: code2 }).expect(422);
    expect(superseded.body.error.code).toBe('OTP_SESSION_SUPERSEDED');
    const wrong = code2 === '00000' ? '11111' : '00000';
    for (let i = 1; i <= 4; i++) {
      const r = await c.post('/otp/verify', { otpSessionId: s2.body.otpSessionId, code: wrong }).expect(422);
      expect(r.body.error.details.attemptsLeft).toBe(5 - i);
    }
    const locked = await c.post('/otp/verify', { otpSessionId: s2.body.otpSessionId, code: wrong }).expect(423);
    expect(locked.body.error.code).toBe('OTP_LOCKED');
    const after = await c.refresh();
    expect(after).toMatchObject({ status: 'Failed', failureReason: 'OTP_LOCKED', step: 'failed' });
    // A new checkout for the same order number is allowed after Failed (BR-ORD-01).
  });

  it('FR-013 AC2: expired code fails closed', async () => {
    const c = new Consumer(app, nextPhone());
    const created = await createCheckout(world, c.phone, 2_000_000);
    await c.open(created.body.checkoutUrl);
    await c.post('/terms', { termsVersion: '2026-09', accepted: true }).expect(200);
    await c.refresh();
    const s = await c.post('/otp').expect(201);
    await ds.query(`UPDATE otp_session SET expires_at = now() WHERE id = $1`, [s.body.otpSessionId]);
    const r = await c.post('/otp/verify', { otpSessionId: s.body.otpSessionId, code: await c.latestCode() }).expect(422);
    expect(r.body.error.code).toBe('OTP_EXPIRED');
  });

  it('FR-021: invalid checksum → 400 with no external call; mismatch → 422 with attempts left', async () => {
    const c = new Consumer(app, nextPhone());
    const created = await createCheckout(world, c.phone, 2_000_000);
    await c.open(created.body.checkoutUrl);
    await c.acceptTermsAndVerifyOtp();
    await c.refresh();
    const bad = await c.post('/identity/national-id', { nationalId: '1234567890' }).expect(400);
    expect(bad.body.error.message).toBe('Please enter a valid national ID.');
    const dob = await c.post('/identity/national-id', { nationalId: c.nationalId }).expect(200);
    expect(dob.body.next).toBe('dob');
    c.version = dob.body.order.version;
    const mm = await c.post('/identity/dob', { dateOfBirth: '1910-01-01' }).expect(422); // mock mismatch trigger
    expect(mm.body.error).toMatchObject({ code: 'IDENTITY_MISMATCH', details: { attemptsLeft: 4 } });
  });

  it('FR-030 AC1/AC3 + FR-031: partial provider failure and balance normalisation', async () => {
    const c = new Consumer(app, nextPhone());
    mockProvider(app, world.providerIds[0]).behaviour = { balances: { [c.nationalId]: 1_234_567 } };
    mockProvider(app, world.providerIds[1]).behaviour = { down: true };
    const created = await createCheckout(world, c.phone, 1_000_000);
    await c.open(created.body.checkoutUrl);
    await c.acceptTermsAndVerifyOtp();
    await c.verifyIdentity();
    await settle(app);
    const credit = await c.agent.get('/v1/checkout/credit').expect(200);
    expect(credit.body.inquiryStatus).toBe('Finished');
    expect(credit.body.providers).toEqual([
      expect.objectContaining({ providerId: world.providerIds[0], availableAmount: 1_234_567, selectable: true, outcome: 'Ok' }),
      expect.objectContaining({ providerId: world.providerIds[1], availableAmount: null, selectable: false, outcome: 'Error' }),
    ]);
    mockProvider(app, world.providerIds[1]).behaviour = {};
    await c.refresh();
    const insufficient = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    expect(insufficient.body.creditAmount).toBe(750_000);
  });

  it('FR-032 AC2/AC3: insufficient credit and empty selection', async () => {
    const c = await toSelection(app, world, [1_000_000, 0]);
    const r = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(422);
    expect(r.body.error.code).toBe('INSUFFICIENT_CREDIT');
    const e = await c.post('/quote', { providerIds: [], cashOnly: false }).expect(422);
    expect(e.body.error.code).toBe('NO_SELECTION');
  });

  it('FR-033: pay fully by bank card', async () => {
    const c = await toSelection(app, world, [0, 0]);
    const q = await c.post('/quote', { providerIds: [], cashOnly: true }).expect(200);
    expect(q.body).toMatchObject({ cashAmount: 20_000_000, creditAmount: 0, allocations: [] });
    const conf = await c.post('/confirm', { providerIds: [], cashOnly: true, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'cash-only-1' }).expect(202);
    expect(conf.body.next.type).toBe('redirect');
    await payAtBank(app, conf.body.next.url);
    await settle(app);
    const done = await c.refresh();
    expect(done.status).toBe('Completed');
    const mv = await world.merchant.get(`/v1/merchant/orders/${done.orderId}`).expect(200);
    expect(mv.body.allocationStatus).toBe('NotApplicable');
  });

  it('FR-040 AC1 + CREDIT_CHANGED: stale hash → 409 STATE_CHANGED; lower fresh balance → 409 CREDIT_CHANGED', async () => {
    const c = await toSelection(app, world, [10_000_000, 10_000_000]);
    const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    const stale = await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: 'x'.repeat(64) }, { 'Idempotency-Key': 'cc-0' }).expect(409);
    expect(stale.body.error.code).toBe('STATE_CHANGED');
    expect(stale.body.error.details.quote.quoteHash).toBe(q.body.quoteHash);
    mockProvider(app, world.providerIds[0]).behaviour = { balances: { [c.nationalId]: 1_000 } };
    const changed = await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'cc-1' }).expect(409);
    expect(changed.body.error.code).toBe('CREDIT_CHANGED');
    const after = await c.refresh();
    expect(after.status).toBe('AwaitingSupplierSelection');
    const credit = await c.agent.get('/v1/checkout/credit').expect(200);
    expect(credit.body.notice).toBe('CREDIT_CHANGED');
    expect(credit.body.providers[0].availableAmount).toBe(1_000);
  });

  it('FR-041 AC1: one rejection releases the others and returns to selection; third failure → Failed', async () => {
    const c = await toSelection(app, world, [10_000_000, 10_000_000]);
    for (let attempt = 1; attempt <= 3; attempt++) {
      mockProvider(app, world.providerIds[1]).behaviour = { balances: { [c.nationalId]: 10_000_000 }, rejectOps: ['reserve'] };
      await c.refresh();
      const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
      await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': `rf-${attempt}` }).expect(202);
      await settle(app);
      const o = await c.refresh();
      const rows: { status: string }[] = await ds.query(`SELECT status FROM credit_reservation WHERE order_id = $1 AND attempt_no = $2`, [o.orderId, attempt]);
      expect(rows.map((r) => r.status).sort()).toEqual(['Failed', 'Released']);
      if (attempt < 3) {
        expect(o.status).toBe('AwaitingSupplierSelection');
        const credit = await c.agent.get('/v1/checkout/credit').expect(200);
        expect(credit.body.notice).toBe('RESERVATION_FAILED');
      } else {
        expect(o).toMatchObject({ status: 'Failed', failureReason: 'RESERVATION_FAILED' });
      }
    }
  });

  it('FR-042/044/045: init error keeps reservations; retry; cancel without pending payment', async () => {
    const c = await toSelection(app, world, [20_000_000, 0], 4_000_000);
    const q = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: [world.providerIds[0]], cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'init-1' }).expect(202);
    await settle(app);
    await c.refresh();
    const payments = app.get((await import('../payments/payments.service')).PaymentsService);
    payments.adapter('MOCK').behaviour = { failOps: ['initiate'] };
    const fail = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'b-1' }).expect(502);
    expect(fail.body.error.message).toBe("We couldn't start your bank payment. Please try again.");
    payments.adapter('MOCK').behaviour = {};
    const o = await c.refresh();
    expect(o).toMatchObject({ status: 'AwaitingBankPayment', step: 'payment-failed' });
    const res: { status: string }[] = await ds.query(`SELECT status FROM credit_reservation WHERE order_id = $1`, [o.orderId]);
    expect(res[0].status).toBe('Reserved');
    const retry = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'b-2' }).expect(201);
    await payAtBank(app, retry.body.redirect.url, 'cancel');
    await c.refresh();
    const cancel = await c.post('/cancel', {}, { 'Idempotency-Key': 'cancel-1' }).expect(200);
    expect(cancel.body.status).toBe('Cancelled');
    await settle(app);
    const released: { status: string }[] = await ds.query(`SELECT status FROM credit_reservation WHERE order_id = $1`, [o.orderId]);
    expect(released[0].status).toBe('Released');
  });

  it('FR-045: cancel is busy during reservation; pending bank payment → CancellationRequested → paid wins', async () => {
    const c = await toSelection(app, world, [20_000_000, 0], 4_000_000);
    const q = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: [world.providerIds[0]], cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'cr-1' }).expect(202);
    await settle(app);
    await c.refresh();
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'cr-b' }).expect(201);
    const cancel = await c.post('/cancel', {}, { 'Idempotency-Key': 'cr-c' }).expect(200);
    expect(cancel.body.status).toBe('CancellationRequested');
    await payAtBank(app, bank.body.redirect.url, 'pay');
    await settle(app);
    const o = await c.refresh();
    expect(o.status).toBe('Completed');
    const result = await c.agent.get('/v1/checkout/result').expect(200);
    expect(result.body.cancelNotApplied).toBe(true);
  });

  it('FR-060/061: expiry releases reservations; a later success is reversed and shown as late payment', async () => {
    const c = await toSelection(app, world, [20_000_000, 0], 4_000_000);
    const q = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: [world.providerIds[0]], cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'ex-1' }).expect(202);
    await settle(app);
    await c.refresh();
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'ex-b' }).expect(201);
    const o = await c.refresh();
    await ds.query(`UPDATE "order" SET payment_deadline_at = now() WHERE id = $1`, [o.orderId]); // exactly the deadline counts as expired
    const checkoutPayments = app.get((await import('./checkout-payments.service')).CheckoutPaymentsService);
    await checkoutPayments.runExpiry();
    await settle(app);
    const expired = await c.refresh();
    expect(expired.status).toBe('Expired');
    const res: { status: string }[] = await ds.query(`SELECT status FROM credit_reservation WHERE order_id = $1`, [o.orderId]);
    expect(res[0].status).toBe('Released');
    await payAtBank(app, bank.body.redirect.url, 'pay');
    const late = await c.refresh();
    expect(late.step).toBe('late-payment');
    const btx: { status: string }[] = await ds.query(`SELECT status FROM bank_transaction WHERE order_id = $1`, [o.orderId]);
    expect(btx[0].status).toBe('Reversed');
    const result = await c.agent.get('/v1/checkout/result').expect(200);
    expect(result.body.latePaymentReference).toBeTruthy();
    const bankPay = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'ex-c' }).expect(409);
    expect(bankPay.body.error.code).toBe('ORDER_EXPIRED');
  });

  it('FR-043 AC3: callback amount ≠ cash × 10 → no verify, reversal, reconciliation item', async () => {
    const c = await toSelection(app, world, [20_000_000, 0], 4_000_000);
    const q = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: [world.providerIds[0]], cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'am-1' }).expect(202);
    await settle(app);
    await c.refresh();
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'am-b' }).expect(201);
    const payments = app.get((await import('../payments/payments.service')).PaymentsService);
    payments.adapter('MOCK').behaviour = { payAmountOverrideRial: 1 };
    await payAtBank(app, bank.body.redirect.url, 'pay');
    payments.adapter('MOCK').behaviour = {};
    const o = await c.refresh();
    expect(o.status).toBe('AwaitingBankPayment');
    const items: { type: string }[] = await ds.query(`SELECT type FROM reconciliation_item WHERE order_id = $1`, [o.orderId]);
    expect(items.map((i) => i.type)).toContain('AMOUNT_MISMATCH');
    const btx: { status: string }[] = await ds.query(`SELECT status FROM bank_transaction WHERE order_id = $1`, [o.orderId]);
    expect(btx[0].status).toBe('Reversed');
  });

  it('E-03: two tabs pay; the first verified success wins and the other is reversed', async () => {
    const c = await toSelection(app, world, [20_000_000, 0], 4_000_000);
    const q = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: [world.providerIds[0]], cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'tt-1' }).expect(202);
    await settle(app);
    await c.refresh();
    const b1 = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'tt-b1' }).expect(201);
    const b2 = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'tt-b2' }).expect(201);
    await payAtBank(app, b1.body.redirect.url, 'pay');
    await payAtBank(app, b2.body.redirect.url, 'pay');
    await settle(app);
    const o = await c.refresh();
    expect(o.status).toBe('Completed');
    const btx: { status: string; is_authoritative: boolean }[] = await ds.query(`SELECT status, is_authoritative FROM bank_transaction WHERE order_id = $1 ORDER BY created_at`, [o.orderId]);
    expect(btx).toEqual([
      { status: 'Success', is_authoritative: true },
      { status: 'Reversed', is_authoritative: false },
    ]);
  });

  it('FR-050 AC1: an allocation timeout still completes; retry later confirms', async () => {
    const c = await toSelection(app, world, [10_000_000, 10_000_000]);
    const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'al-1' }).expect(202);
    await settle(app);
    await c.refresh();
    mockProvider(app, world.providerIds[1]).behaviour = { balances: { [c.nationalId]: 10_000_000 }, failOps: ['allocate'] };
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': 'al-b' }).expect(201);
    await payAtBank(app, bank.body.redirect.url, 'pay');
    await settle(app);
    const o = await c.refresh();
    expect(o.status).toBe('Completed');
    const mv = await world.merchant.get(`/v1/merchant/orders/${o.orderId}`).expect(200);
    expect(mv.body.allocationStatus).toBe('Pending');
    mockProvider(app, world.providerIds[1]).behaviour = { balances: { [c.nationalId]: 10_000_000 } };
    await ds.query(`UPDATE provider_transaction SET next_attempt_at = now() WHERE order_id = $1 AND type = 'Allocation'`, [o.orderId]);
    const { WalletService } = await import('../wallet/wallet.service');
    await app.get(WalletService).processDue();
    const mv2 = await world.merchant.get(`/v1/merchant/orders/${o.orderId}`).expect(200);
    expect(mv2.body.allocationStatus).toBe('Confirmed');
    const docs: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM settlement_document WHERE order_id = $1 AND counterparty_id = $2`, [o.orderId, world.providerIds[1]]);
    expect(Number(docs[0].n)).toBe(2);
  });

  it('FR-060 AC1: expiry job and consumer confirm race → exactly one wins', async () => {
    const c = await toSelection(app, world, [20_000_000, 0], 4_000_000);
    const q = await c.post('/quote', { providerIds: [world.providerIds[0]], cashOnly: false }).expect(200);
    await ds.query(`UPDATE "order" SET session_expires_at = now() WHERE id = (SELECT id FROM "order" WHERE checkout_token_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1)`);
    const checkoutPayments = app.get((await import('./checkout-payments.service')).CheckoutPaymentsService);
    const [confirm] = await Promise.all([
      c.post('/confirm', { providerIds: [world.providerIds[0]], cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': 'race-c' }),
      checkoutPayments.runExpiry(),
    ]);
    await settle(app);
    const o = await c.refresh();
    if (confirm.status === 202) expect(['ReservationInProgress', 'AwaitingBankPayment', 'Expired']).toContain(o.status);
    else {
      expect(confirm.status).toBe(409);
      expect(o.status).toBe('Expired');
    }
  });
});
