import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, idemKey } from '../../test-utils/admin-session';
import { buildWorld, mockProvider, payAtBank, resetLimits, settle, toSelection, type World } from '../../test-utils/checkout-harness';
import { ReconciliationService } from './reconciliation.service';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';

describe('Reconciliation (FR-140–142)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 1);
  });
  afterAll(() => app.close());
  beforeEach(() => resetLimits(app));

  async function paidOrder(): Promise<{ orderId: string; ref: string; cash: number }> {
    const c = await toSelection(app, world, [20_000_000], 4_000_000);
    const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': idemKey() }).expect(202);
    await settle(app);
    await c.refresh();
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': idemKey() }).expect(201);
    await payAtBank(app, bank.body.redirect.url);
    await settle(app);
    const o = await c.refresh();
    const btx: { gateway_reference: string; amount: string }[] = await ds.query(`SELECT gateway_reference, amount FROM bank_transaction WHERE order_id = $1 AND status = 'Success'`, [o.orderId]);
    return { orderId: o.orderId as string, ref: btx[0].gateway_reference, cash: Number(btx[0].amount) };
  }

  it('FR-140: CSV import matches, flags unknown cash and amount mismatches; BR-LED-08 posted', async () => {
    const p = await paidOrder();
    const csv = [
      'reference,amount_rial,fee_rial,date',
      `${p.ref},${p.cash * 10},1000,2026-09-29`,
      `UNKNOWNREF1,500000,0,2026-09-29`,
    ].join('\n');
    const r = await as(app, world.admin)
      .post('/v1/admin/reconciliation/psp-reports')
      .field('gatewayCode', 'MOCK')
      .attach('file', Buffer.from(csv), { filename: 'psp.csv', contentType: 'text/csv' })
      .expect(201);
    expect(r.body).toEqual({ imported: 2, matched: 1, itemsCreated: 1 });
    const again = await as(app, world.admin).post('/v1/admin/reconciliation/psp-reports').field('gatewayCode', 'MOCK').attach('file', Buffer.from(csv), 'psp.csv').expect(201);
    expect(again.body.itemsCreated).toBe(0);
    const ledger = app.get(LedgerService);
    expect(await ledger.balance(Accounts.bankOperating)).toBe(p.cash - 100);
    expect(await ledger.balance(Accounts.pspFeeExpense)).toBe(100);
    const items = await as(app, world.admin).get('/v1/admin/reconciliation-items?type=CASH_WITHOUT_ORDER').expect(200);
    expect(items.body.items).toHaveLength(1);
    expect(items.body.items[0].actualAmount).toBe(50_000);
  });

  it('FR-142: resolution needs type + note; money-affecting needs a linked manual document; no reopen', async () => {
    const recon = app.get(ReconciliationService);
    const id = (await recon.open({ type: 'PROVIDER_STATEMENT_MISMATCH', refs: { reference: `x-${Date.now()}` } }))!;
    await as(app, world.admin).patch(`/v1/admin/reconciliation-items/${id}`).send({ status: 'Resolved' }).expect(400);
    await as(app, world.admin).patch(`/v1/admin/reconciliation-items/${id}`).send({ status: 'Resolved', resolutionType: 'WrittenOff', note: 'written off after review' }).expect(400);
    await as(app, world.admin).patch(`/v1/admin/reconciliation-items/${id}`).send({ status: 'InReview', assigneeId: world.admin.id }).expect(200);
    const done = await as(app, world.admin).patch(`/v1/admin/reconciliation-items/${id}`).send({ status: 'Resolved', resolutionType: 'NoActionNeeded', note: 'statement corrected by provider' }).expect(200);
    expect(done.body.status).toBe('Resolved');
    await as(app, world.admin).patch(`/v1/admin/reconciliation-items/${id}`).send({ note: 'reopen?' }).expect(409);
  });

  it('FR-141 / E-36: a statement confirming a pending allocation auto-confirms it; re-drive retries stuck operations', async () => {
    const c = await toSelection(app, world, [20_000_000], 4_000_000);
    const q = await c.post('/quote', { providerIds: world.providerIds, cashOnly: false }).expect(200);
    await c.post('/confirm', { providerIds: world.providerIds, cashOnly: false, quoteHash: q.body.quoteHash }, { 'Idempotency-Key': idemKey() }).expect(202);
    await settle(app);
    await c.refresh();
    const pid = world.providerIds[0];
    mockProvider(app, pid).behaviour = { balances: { [c.nationalId]: 20_000_000 }, timeoutAfterApplyOps: ['allocate'] };
    const bank = await c.post('/bank-payments', {}, { 'Idempotency-Key': idemKey() }).expect(201);
    await payAtBank(app, bank.body.redirect.url);
    await settle(app);
    const o = await c.refresh();
    const mv = await world.merchant.get(`/v1/merchant/orders/${o.orderId}`).expect(200);
    // The status query saw the applied allocation, so it is confirmed despite the timeout.
    expect(mv.body.allocationStatus).toBe('Confirmed');
    mockProvider(app, pid).behaviour = { balances: { [c.nationalId]: 20_000_000 } };
    // Stuck release: exhaust retries, then re-drive.
    const wallet = app.get(WalletService);
    await ds.query(
      `INSERT INTO provider_transaction (id, order_id, reservation_id, provider_id, type, amount, status, attempts, next_attempt_at)
       SELECT 'ptx_TESTSTUCK', order_id, id, provider_id, 'Release', amount, 'Pending', 11, now() FROM credit_reservation WHERE order_id = $1 LIMIT 1`,
      [o.orderId],
    );
    mockProvider(app, pid).behaviour = { down: true };
    await wallet.processPtx('ptx_TESTSTUCK');
    const item: { id: string; type: string }[] = await ds.query(`SELECT id, type FROM reconciliation_item WHERE refs->>'providerTransactionId' = 'ptx_TESTSTUCK'`);
    expect(item[0].type).toBe('RELEASE_UNCONFIRMED');
    mockProvider(app, pid).behaviour = {};
    const redriven = await as(app, world.admin).post(`/v1/admin/reconciliation-items/${item[0].id}/redrive`).expect(200);
    expect(redriven.body.status).toBe('Resolved');
    expect(redriven.body.resolutionType).toBe('Redriven');
  });

  it('daily run: PSP report from the gateway API and provider statements import without errors', async () => {
    await paidOrder();
    await app.get(PaymentsService).dailyReconciliation();
    await app.get(WalletService).reconcileStatements('2026-09-29');
    const lines: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM provider_statement_line`);
    expect(Number(lines[0].n)).toBeGreaterThan(0);
  });

  it('unknown bank callback reference redirects to the generic error page', async () => {
    const r = await request(app.getHttpServer()).post('/v1/callbacks/bank/MOCK').type('form').send({ ref: 'btx_UNKNOWN', status: 'OK', amount: '10' }).expect(302);
    expect(r.headers.location).toMatch(/\/c\/error$/);
  });
});
