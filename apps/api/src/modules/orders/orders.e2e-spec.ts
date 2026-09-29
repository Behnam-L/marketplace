import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { buildWorld, createCheckout, nextPhone, resetLimits, type World } from '../../test-utils/checkout-harness';
import { OrdersService } from './orders.service';

describe('Order CAS transitions (BR-ORD-03)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 1);
    resetLimits(app);
  });
  afterAll(() => app.close());

  it('two transitions from one version: exactly one wins; each writes an OrderEvent', async () => {
    const created = await createCheckout(world, nextPhone(), 1_000_000);
    const orders = app.get(OrdersService);
    const o = await orders.mustGet(created.body.orderId);
    const results = await Promise.allSettled([
      orders.transitionTx(o.id, 'AwaitingOtp', 'Cancelled', { actor: 'consumer', version: o.version }),
      orders.transitionTx(o.id, 'AwaitingOtp', 'Expired', { actor: 'system', version: o.version }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('STATE_CHANGED');
    const events: { to_status: string }[] = await ds.query(`SELECT to_status FROM order_event WHERE order_id = $1 ORDER BY created_at`, [o.id]);
    expect(events).toHaveLength(3);
    await expect(orders.transitionTx(o.id, ['Cancelled', 'Expired'], 'AwaitingIdentity', { actor: 'x' })).rejects.toMatchObject({ code: 'STATE_CHANGED' });
    await expect(ds.query(`DELETE FROM order_event WHERE order_id = $1`, [o.id])).rejects.toThrow(/append-only/);
  });

  it('merchant cannot read another merchant’s order (FR-003 AC1)', async () => {
    const created = await createCheckout(world, nextPhone(), 1_000_000);
    const other = await buildWorld(app, ds, 0);
    const r = await other.merchant.get(`/v1/merchant/orders/${created.body.orderId}`).expect(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    const byNumber = await world.merchant.get(`/v1/merchant/orders?orderNumber=${encodeURIComponent((await app.get(OrdersService).mustGet(created.body.orderId)).merchantOrderNumber)}`).expect(200);
    expect(byNumber.body.orderId).toBe(created.body.orderId);
  });
});
