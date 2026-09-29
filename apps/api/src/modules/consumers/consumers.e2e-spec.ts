import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin } from '../../test-utils/admin-session';
import { buildWorld, Consumer, createCheckout, nextPhone, resetLimits, settle, type World } from '../../test-utils/checkout-harness';
import { ConsumersService } from './consumers.service';
import { IDENTITY_VERIFIER, type MockIdentityVerifier } from './identity-verifier';

describe('Consumers and identity (FR-020–023, FR-113)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 1);
  });
  afterAll(() => app.close());
  beforeEach(() => resetLimits(app));

  it('FR-113: list shows "not verified" consumers masked; block → new checkouts rejected; unblock', async () => {
    const phone = nextPhone();
    await createCheckout(world, phone, 1_000_000);
    const support = await createAdmin(app, ds, 'Viewer');
    const list = await as(app, support).get('/v1/admin/consumers?status=Inactive').expect(200);
    const row = list.body.items.find((c: { phone: string }) => c.phone.endsWith(phone.slice(-4)));
    expect(row.firstName).toBeNull();
    expect(row.phone).toContain('***');
    await as(app, world.admin).patch(`/v1/admin/consumers/${row.id}/status`).send({ status: 'Blocked', reason: 'fraud check' }).expect(200);
    const r = await createCheckout(world, phone, 1_000_000).catch((e: Error) => e);
    expect(String(r)).toContain('CONSUMER_NOT_ELIGIBLE');
    const unblocked = await as(app, world.admin).patch(`/v1/admin/consumers/${row.id}/status`).send({ status: 'Active', reason: 'cleared' }).expect(200);
    expect(unblocked.body.status).toBe('Inactive'); // never OTP-verified
  });

  it('FR-020: a verified linkage skips identity; stale linkage re-matches silently; service outage → 503 and retry', async () => {
    const c = new Consumer(app, nextPhone());
    const first = await createCheckout(world, c.phone, 1_000_000);
    await c.open(first.body.checkoutUrl);
    await c.acceptTermsAndVerifyOtp();
    await c.verifyIdentity();
    await settle(app);
    // Second order for the same phone: identity already verified → straight to credit.
    const c2 = new Consumer(app, c.phone);
    const second = await createCheckout(world, c.phone, 1_000_000);
    await c2.open(second.body.checkoutUrl);
    await c2.acceptTermsAndVerifyOtp();
    await settle(app);
    expect((await c2.refresh()).status).toBe('AwaitingSupplierSelection');
    // Stale linkage + identity down → stays AwaitingIdentity; check endpoint returns 503; recovers.
    await ds.query(`UPDATE identity_linkage SET last_matched_at = now() - interval '40 days' WHERE status = 'Verified'`);
    const verifier = app.get<MockIdentityVerifier>(IDENTITY_VERIFIER);
    verifier.down = true;
    const c3 = new Consumer(app, c.phone);
    const third = await createCheckout(world, c.phone, 1_000_000);
    await c3.open(third.body.checkoutUrl);
    await c3.acceptTermsAndVerifyOtp();
    const v = await c3.refresh();
    expect(v).toMatchObject({ status: 'AwaitingIdentity', identityStep: 'check' });
    const down = await c3.post('/identity/check').expect(503);
    expect(down.body.error.code).toBe('IDENTITY_SERVICE_UNAVAILABLE');
    verifier.down = false;
    await c3.post('/identity/check').expect(200);
    await settle(app);
    expect((await c3.refresh()).status).toBe('AwaitingSupplierSelection');
    const attempts: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM identity_attempt WHERE step = 'Rematch'`);
    expect(Number(attempts[0].n)).toBe(1);
  });

  it('FR-023: 5 mismatches lock the order (IDENTITY_LOCKED); FR-022 AC1 pending linkage of a terminal order is not trusted', async () => {
    const c = new Consumer(app, nextPhone());
    const created = await createCheckout(world, c.phone, 1_000_000);
    await c.open(created.body.checkoutUrl);
    await c.acceptTermsAndVerifyOtp();
    await c.refresh();
    const verifier = app.get<MockIdentityVerifier>(IDENTITY_VERIFIER);
    verifier.mismatchPhoneIds.add(c.nationalId);
    for (let i = 1; i <= 4; i++) {
      const r = await c.post('/identity/national-id', { nationalId: c.nationalId }).expect(422);
      expect(r.body.error.details.attemptsLeft).toBe(5 - i);
    }
    const locked = await c.post('/identity/national-id', { nationalId: c.nationalId }).expect(423);
    expect(locked.body.error.code).toBe('IDENTITY_LOCKED');
    expect((await c.refresh()).failureReason).toBe('IDENTITY_LOCKED');
    verifier.mismatchPhoneIds.delete(c.nationalId);
    const consumers = app.get(ConsumersService);
    const id = await consumers.idByPhone(`+98${c.phone.slice(1)}`);
    expect(await consumers.identityStep(id!, 'ord_OTHER')).toBe('national-id');
  });
});
