import { createServer, Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, idemKey, type TestAdmin } from '../../test-utils/admin-session';
import { createMerchant, createMerchantPlan, merchantBody, nationalCode, nextSeed } from '../../test-utils/fixtures';
import { WebhooksService } from './webhooks.service';

describe('Merchants (FR-092/093, FR-004)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: TestAdmin;
  let planId: string;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    admin = await createAdmin(app, ds);
    planId = await createMerchantPlan(app, admin);
  });
  afterAll(() => app.close());

  it('FR-092 AC1: individual merchants need a 10-digit personal code; economic ID optional', async () => {
    const s = nextSeed();
    const ok = await as(app, admin)
      .post('/v1/admin/merchants')
      .set('Idempotency-Key', idemKey())
      .send(merchantBody(planId, { entityType: 'Individual', nationalId: nationalCode(s), economicId: null }))
      .expect(201);
    expect(ok.body.economicId).toBeNull();
    const bad = await as(app, admin)
      .post('/v1/admin/merchants')
      .set('Idempotency-Key', idemKey())
      .send(merchantBody(planId, { entityType: 'Individual', economicId: null }))
      .expect(400);
    expect(bad.body.error.details.fields[0].field).toBe('nationalId');
    const legalNoEco = await as(app, admin).post('/v1/admin/merchants').set('Idempotency-Key', idemKey()).send(merchantBody(planId, { economicId: null })).expect(400);
    expect(legalNoEco.body.error.details.fields[0].field).toBe('economicId');
  });

  it('rejects an invalid IBAN and duplicate national IDs (concurrently)', async () => {
    const r = await as(app, admin).post('/v1/admin/merchants').set('Idempotency-Key', idemKey()).send(merchantBody(planId, { iban: 'IR000000000000000000000000' })).expect(400);
    expect(r.body.error.message).toBe('Please enter a valid IBAN.');
    const body = merchantBody(planId);
    const [a, b] = await Promise.all([
      as(app, admin).post('/v1/admin/merchants').set('Idempotency-Key', idemKey()).send(body),
      as(app, admin).post('/v1/admin/merchants').set('Idempotency-Key', idemKey()).send({ ...body, economicId: String(Number(body.economicId) + 1) }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const dup = a.status === 409 ? a : b;
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_ENTITY', details: { field: 'nationalId' } });
  });

  it('If-Match protects edits; merchant can be disabled', async () => {
    const m = await createMerchant(app, admin, planId);
    await as(app, admin).patch(`/v1/admin/merchants/${m.id}`).set('If-Match', String(m.version + 5)).send({ status: 'Disabled' }).expect(409);
    const r = await as(app, admin).patch(`/v1/admin/merchants/${m.id}`).set('If-Match', String(m.version)).send({ status: 'Disabled' }).expect(200);
    expect(r.body.status).toBe('Disabled');
    expect(r.body.version).toBe(m.version + 1);
  });

  it('FR-093: at most two active keys; secret shown once; revoke', async () => {
    const m = await createMerchant(app, admin, planId);
    const k1 = await as(app, admin).post(`/v1/admin/merchants/${m.id}/api-keys`).expect(201);
    expect(k1.body.secret).toHaveLength(43);
    await as(app, admin).post(`/v1/admin/merchants/${m.id}/api-keys`).expect(201);
    const third = await as(app, admin).post(`/v1/admin/merchants/${m.id}/api-keys`).expect(409);
    expect(third.body.error.code).toBe('API_KEY_LIMIT');
    await as(app, admin).delete(`/v1/admin/merchants/${m.id}/api-keys/${k1.body.keyId}`).expect(204);
    await as(app, admin).post(`/v1/admin/merchants/${m.id}/api-keys`).expect(201);
    const detail = await as(app, admin).get(`/v1/admin/merchants/${m.id}`).expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(k1.body.secret);
  });

  it('FR-004 AC1: 500, 500, 200 → three attempts, Delivered, same event id, signed', async () => {
    const m = await createMerchant(app, admin, planId);
    await as(app, admin).post(`/v1/admin/merchants/${m.id}/api-keys`).expect(201);
    const received: { eventId: string; sig: string }[] = [];
    let calls = 0;
    const server: Server = createServer((req, res) => {
      calls++;
      received.push({ eventId: String(req.headers['x-bajet-event-id']), sig: String(req.headers['x-bajet-signature']) });
      res.statusCode = calls < 3 ? 500 : 200;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    const hooks = app.get(WebhooksService);
    const id = await ds.transaction((tm) =>
      hooks.enqueue(tm, {
        merchantId: m.id,
        targetUrl: `http://127.0.0.1:${port}/hook`,
        type: 'order.completed',
        data: { orderId: 'ord_x', orderNumber: 'A1', status: 'Completed', totalAmount: 1, cashAmount: 1, creditAmount: 0 },
      }),
    );
    for (let i = 0; i < 3; i++) {
      await hooks.deliver(id!);
      await ds.query(`UPDATE merchant_webhook_event SET next_attempt_at = now() WHERE id = $1`, [id]);
    }
    server.close();
    const ev: { status: string; attempts: number }[] = await ds.query(`SELECT status, attempts FROM merchant_webhook_event WHERE id = $1`, [id]);
    expect(ev[0]).toEqual({ status: 'Delivered', attempts: 3 });
    expect(new Set(received.map((r) => r.eventId))).toEqual(new Set([id]));
    expect(received[0].sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exhausts after the retry schedule and can be redelivered', async () => {
    const m = await createMerchant(app, admin, planId);
    const hooks = app.get(WebhooksService);
    const original = hooks.transport;
    hooks.transport = () => Promise.resolve(503);
    const id = await ds.transaction((tm) =>
      hooks.enqueue(tm, { merchantId: m.id, targetUrl: 'https://merchant.invalid/h', type: 'order.failed', data: { orderId: 'o', orderNumber: 'n', status: 'Failed', totalAmount: 1, cashAmount: null, creditAmount: null } }),
    );
    for (let i = 0; i < 9; i++) await hooks.deliver(id!);
    hooks.transport = original;
    const ev: { status: string; attempts: number }[] = await ds.query(`SELECT status, attempts FROM merchant_webhook_event WHERE id = $1`, [id]);
    expect(ev[0]).toEqual({ status: 'Exhausted', attempts: 9 });
    const r = await as(app, admin).post(`/v1/admin/merchant-webhook-events/${id}/redeliver`).expect(202);
    expect(r.body.status).toBe('Retrying');
  });
});
