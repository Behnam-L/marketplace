import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, idemKey } from '../../test-utils/admin-session';
import { buildWorld, mockProvider, payAtBank, resetLimits, settle, toSelection, type World } from '../../test-utils/checkout-harness';
import { iban } from '../../test-utils/fixtures';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';

describe('Refunds (FR-070/071, BR-RFD, BR-LED-06)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 2);
  });
  afterAll(() => app.close());
  beforeEach(() => resetLimits(app));

  async function completedOrder(balances = [6_000_000, 9_000_000]): Promise<string> {
    const c = await toSelection(app, world, balances);
    const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': idemKey() }).expect(202);
    await settle(app);
    await c.refresh();
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': idemKey() }).expect(201);
    await payAtBank(app, bank.body.redirect.url);
    await settle(app);
    const o = await c.refresh();
    expect(o.status).toBe('Completed');
    return o.orderId as string;
  }

  it('PRD example: merchant refunds 3,000,000 → legs, obligations and ledger', async () => {
    const orderId = await completedOrder();
    const r = await world.merchant.post(`/v1/merchant/orders/${orderId}/refunds`, { amount: 3_000_000, reason: 'returned item' }, idemKey()).expect(202);
    await settle(app);
    const detail = await as(app, world.admin).get(`/v1/admin/refunds/${r.body.refundId}`).expect(200);
    expect(detail.body.status).toBe('Completed');
    expect(detail.body.merchantMarginRefund).toBe(90_000);
    expect(detail.body.legs.map((l: { legType: string; amount: number; providerMarginRefund: number }) => [l.legType, l.amount, l.providerMarginRefund])).toEqual([
      ['Cash', 750_000, 0],
      ['Credit', 900_000, 9_000],
      ['Credit', 1_350_000, 20_250],
    ]);
    const docs = await as(app, world.admin).get(`/v1/admin/documents?orderId=${orderId}&kind=Refund`).expect(200);
    const amounts = docs.body.items.map((d: { counterpartyType: string; amount: number }) => `${d.counterpartyType}:${d.amount}`).sort();
    expect(amounts).toEqual(['Merchant:2910000', 'Provider:1329750', 'Provider:891000'].sort());
    const mv = await world.merchant.get(`/v1/merchant/orders/${orderId}`).expect(200);
    expect(mv.body).toMatchObject({ refundStatus: 'Partial', refundedAmount: 3_000_000 });
    expect(mv.body.refunds[0]).toMatchObject({ refundId: r.body.refundId, amount: 3_000_000, status: 'Completed' });
    const reservations: { reversed_amount: string }[] = await ds.query(`SELECT reversed_amount FROM credit_reservation WHERE order_id = $1 AND status = 'Allocated' ORDER BY amount`, [orderId]);
    expect(reservations.map((x) => Number(x.reversed_amount))).toEqual([900_000, 1_350_000]);
    const breaches = await app.get(LedgerService).checkInvariants();
    expect(breaches.filter((b) => b.name.includes(world.merchant.merchantId) || b.name === 'TRIAL_BALANCE')).toEqual([]);
    const psp = await app.get(LedgerService).balance(Accounts.pspClearing('MOCK'));
    expect(psp).toBeGreaterThan(0);
  });

  it('AC1: exceeding the refundable amount → 422; full refund afterwards returns originals', async () => {
    const orderId = await completedOrder();
    await world.merchant.post(`/v1/merchant/orders/${orderId}/refunds`, { amount: 17_000_000, reason: 'partial' }, idemKey()).expect(202);
    await settle(app);
    const over = await world.merchant.post(`/v1/merchant/orders/${orderId}/refunds`, { amount: 3_000_001, reason: 'too much' }, idemKey()).expect(422);
    expect(over.body.error.code).toBe('REFUND_EXCEEDS_REFUNDABLE');
    await world.merchant.post(`/v1/merchant/orders/${orderId}/refunds`, { amount: 3_000_000, reason: 'rest' }, idemKey()).expect(202);
    await settle(app);
    const mv = await world.merchant.get(`/v1/merchant/orders/${orderId}`).expect(200);
    expect(mv.body).toMatchObject({ refundStatus: 'Full', refundedAmount: 20_000_000 });
    const totals: { leg_type: string; s: string }[] = await ds.query(
      `SELECT l.leg_type, SUM(l.amount) AS s FROM refund_leg l JOIN refund r ON r.id = l.refund_id WHERE r.order_id = $1 GROUP BY l.leg_type`,
      [orderId],
    );
    expect(Object.fromEntries(totals.map((t) => [t.leg_type, Number(t.s)]))).toEqual({ Cash: 5_000_000, Credit: 15_000_000 });
  });

  it('AC3: concurrent refunds exceeding refundable → exactly one succeeds', async () => {
    const orderId = await completedOrder();
    const [a, b] = await Promise.all([
      world.merchant.post(`/v1/merchant/orders/${orderId}/refunds`, { amount: 15_000_000, reason: 'first' }, idemKey()),
      world.merchant.post(`/v1/merchant/orders/${orderId}/refunds`, { amount: 15_000_000, reason: 'second' }, idemKey()),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 422]);
  });

  it('AC2: allocation pending → 409 ALLOCATION_PENDING; other merchant → 404', async () => {
    const orderId = await completedOrder();
    await ds.query(`UPDATE "order" SET allocation_status = 'Pending' WHERE id = $1`, [orderId]);
    const r = await as(app, world.admin).post(`/v1/admin/orders/${orderId}/refunds`).set('Idempotency-Key', idemKey()).send({ amount: 1000, reason: 'test' }).expect(409);
    expect(r.body.error.code).toBe('ALLOCATION_PENDING');
    await ds.query(`UPDATE "order" SET allocation_status = 'Confirmed' WHERE id = $1`, [orderId]);
  });

  it('FR-071 AC1: provider rejects the reversal → NeedsReconciliation + REVERSAL_REJECTED', async () => {
    const orderId = await completedOrder();
    mockProvider(app, world.providerIds[0]).behaviour = { ...mockProvider(app, world.providerIds[0]).behaviour, rejectOps: ['reverse'] };
    const r = await as(app, world.admin).post(`/v1/admin/orders/${orderId}/refunds`).set('Idempotency-Key', idemKey()).send({ amount: 2_000_000, reason: 'loan closed test' }).expect(202);
    await settle(app);
    const d = await as(app, world.admin).get(`/v1/admin/refunds/${r.body.refundId}`).expect(200);
    expect(d.body.status).toBe('NeedsReconciliation');
    const items: { type: string }[] = await ds.query(`SELECT type FROM reconciliation_item WHERE refs->>'refundId' = $1`, [r.body.refundId]);
    expect(items.map((i) => i.type)).toContain('REVERSAL_REJECTED');
    mockProvider(app, world.providerIds[0]).behaviour = {};
  });

  it('E-32: gateway without refund API → consumer payable waits for the payee IBAN', async () => {
    await ds.query(`UPDATE bank_gateway SET supports_refund = false WHERE code = 'MOCK'`);
    const orderId = await completedOrder();
    const r = await as(app, world.admin).post(`/v1/admin/orders/${orderId}/refunds`).set('Idempotency-Key', idemKey()).send({ amount: 4_000_000, reason: 'cash back to card' }).expect(202);
    await settle(app);
    const d = await as(app, world.admin).get(`/v1/admin/refunds/${r.body.refundId}`).expect(200);
    const cash = d.body.legs.find((l: { legType: string }) => l.legType === 'Cash');
    expect(cash.needsPayeeIban).toBe(true);
    const doc: { awaiting_payee_details: boolean }[] = await ds.query(`SELECT awaiting_payee_details FROM settlement_document WHERE id = $1`, [cash.documentId]);
    expect(doc[0].awaiting_payee_details).toBe(true);
    await as(app, world.admin).patch(`/v1/admin/refund-legs/${cash.id}/payee`).send({ iban: 'IR000' }).expect(400);
    const ok = await as(app, world.admin).patch(`/v1/admin/refund-legs/${cash.id}/payee`).send({ iban: iban(555) }).expect(200);
    expect(ok.body.legs.find((l: { legType: string }) => l.legType === 'Cash').payeeIbanMasked).toMatch(/^IR\d{2}\*+\d{4}$/);
    const after: { awaiting_payee_details: boolean }[] = await ds.query(`SELECT awaiting_payee_details FROM settlement_document WHERE id = $1`, [cash.documentId]);
    expect(after[0].awaiting_payee_details).toBe(false);
    await ds.query(`UPDATE bank_gateway SET supports_refund = true WHERE code = 'MOCK'`);
  });
});
