import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, idemKey } from '../../test-utils/admin-session';
import { buildWorld, payAtBank, resetLimits, settle, toSelection, type World } from '../../test-utils/checkout-harness';
import { ExportsService } from '../exports/exports.service';

describe('Transactions, orders monitoring and exports (FR-110–114)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;
  let orderId: string;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 1);
    resetLimits(app);
    const c = await toSelection(app, world, [20_000_000], 4_000_000);
    const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': idemKey() }).expect(202);
    await settle(app);
    await c.refresh();
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': idemKey() }).expect(201);
    await payAtBank(app, bank.body.redirect.url);
    await settle(app);
    orderId = (await c.refresh()).orderId as string;
  });
  afterAll(() => app.close());

  it('FR-110: order list filters and detail with timeline', async () => {
    const byStatus = await as(app, world.admin).get('/v1/admin/orders?status=Completed').expect(200);
    expect(byStatus.body.items.map((o: { id: string }) => o.id)).toContain(orderId);
    expect(byStatus.body.items[0].providerCount).toBe(1);
    const none = await as(app, world.admin).get('/v1/admin/orders?status=Expired').expect(200);
    expect(none.body.items.map((o: { id: string }) => o.id)).not.toContain(orderId);
    const byProvider = await as(app, world.admin).get(`/v1/admin/orders?providerId=${world.providerIds[0]}`).expect(200);
    expect(byProvider.body.items.map((o: { id: string }) => o.id)).toContain(orderId);
    const detail = await as(app, world.admin).get(`/v1/admin/orders/${orderId}`).expect(200);
    expect(detail.body.bankTransactions[0].isAuthoritative).toBe(true);
    expect(detail.body.consumer.phone).toMatch(/^\+98/); // SuperAdmin holds consumers.pii
    const viewer = await createAdmin(app, ds, 'Viewer');
    const masked = await as(app, viewer).get(`/v1/admin/orders/${orderId}`).expect(200);
    expect(masked.body.consumer.phone).toContain('***');
  });

  it('FR-111/112: bank and provider transactions with technical logs and the stuck filter', async () => {
    const bank = await as(app, world.admin).get(`/v1/admin/bank-transactions?orderId=${orderId}`).expect(200);
    expect(bank.body.items).toHaveLength(1);
    const detail = await as(app, world.admin).get(`/v1/admin/bank-transactions/${bank.body.items[0].id}`).expect(200);
    expect(detail.body.technicalLog.map((l: { operation: string }) => l.operation)).toEqual(['initiate', 'verify']);
    const ptx = await as(app, world.admin).get(`/v1/admin/provider-transactions?orderId=${orderId}`).expect(200);
    expect(ptx.body.items.map((t: { type: string }) => t.type).sort()).toEqual(['Allocation', 'Reservation']);
    const stuck = await as(app, world.admin).get('/v1/admin/provider-transactions?stuck=true').expect(200);
    expect(stuck.body.items).toHaveLength(0);
    await ds.query(`UPDATE credit_reservation SET status = 'AllocationPending', hold_deadline_at = now() - interval '10 minutes' WHERE order_id = $1`, [orderId]);
    const stuck2 = await as(app, world.admin).get('/v1/admin/provider-transactions?stuck=true').expect(200);
    expect(stuck2.body.items.length).toBeGreaterThan(0);
    await ds.query(`UPDATE credit_reservation SET status = 'Allocated' WHERE order_id = $1`, [orderId]);
  });

  it('FR-114: CSV export of a filtered list, PII masked without consumers.pii', async () => {
    const r = await as(app, world.admin).post('/v1/admin/exports').send({ resource: 'orders', filters: { status: 'Completed' } }).expect(202);
    await app.get(ExportsService).processPending();
    const e = await as(app, world.admin).get(`/v1/admin/exports/${r.body.exportId}`).expect(200);
    expect(e.body).toMatchObject({ status: 'Ready', rowCount: 1 });
    const file = await as(app, world.admin).get(e.body.downloadUrl).expect(200);
    const text = file.text ?? file.body.toString();
    expect(text).toContain(orderId);
    const finance = await createAdmin(app, ds, 'Finance');
    const c = await as(app, finance).post('/v1/admin/exports').send({ resource: 'consumers', filters: {} }).expect(202);
    await app.get(ExportsService).processPending();
    const ce = await as(app, finance).get(`/v1/admin/exports/${c.body.exportId}`).expect(200);
    const cf = await as(app, finance).get(ce.body.downloadUrl).expect(200);
    expect(cf.text ?? cf.body.toString()).toMatch(/09\d\d\*\*\*\d{4}/);
    const support = await createAdmin(app, ds, 'Support');
    await as(app, support).post('/v1/admin/exports').send({ resource: 'orders', filters: {} }).expect(403);
  });
});
