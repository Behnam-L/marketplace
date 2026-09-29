import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { jalaliToIso } from '@bajet/contracts';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, idemKey, type TestAdmin } from '../../test-utils/admin-session';
import { createMerchant, createMerchantPlan, createProvider, createProviderPlan } from '../../test-utils/fixtures';
import { DocumentsService } from './documents.service';
import { InvoicesService } from './invoices.service';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import type { SettlementTermsSnapshot } from './snapshot';

describe('Settlement plans, documents and invoices (FR-100, FR-130–134)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let finance: TestAdmin;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    finance = await createAdmin(app, ds);
  });
  afterAll(() => app.close());

  it('FR-100 AC1/AC2: cash-settlement bps only when enabled; 0 and 10000 margins accepted', async () => {
    const bad = await as(app, finance)
      .post('/v1/admin/merchant-settlement-plans')
      .send({ merchantReceivableMarginBps: 300, cashSettlementEnabled: false, cashSettlementBps: 5000, installmentCount: 1, maturityRule: 'EndOfJalaliMonth' })
      .expect(400);
    expect(bad.body.error.message).toBe('Cash settlement percentage only applies when cash settlement is enabled.');
    await createMerchantPlan(app, finance, { merchantReceivableMarginBps: 0, cashSettlementEnabled: false, cashSettlementBps: null });
    await createMerchantPlan(app, finance, { merchantReceivableMarginBps: 10000, cashSettlementEnabled: false, cashSettlementBps: null });
    await as(app, finance).post('/v1/admin/provider-settlement-plans').send({ providerPayableMarginBps: 10001, installmentCount: 1, maturityRule: 'EndOfJalaliMonth' }).expect(400);
    await as(app, finance).post('/v1/admin/provider-settlement-plans').send({ providerPayableMarginBps: 100, installmentCount: 7, maturityRule: 'EndOfJalaliMonth' }).expect(400);
  });

  it('archived plans cannot be assigned or edited', async () => {
    const planId = await createMerchantPlan(app, finance);
    await as(app, finance).post(`/v1/admin/merchant-settlement-plans/${planId}/archive`).expect(200);
    const r = await as(app, finance).patch(`/v1/admin/merchant-settlement-plans/${planId}`).send({ installmentCount: 3 }).expect(422);
    expect(r.body.error.code).toBe('PLAN_ARCHIVED');
    const m = await as(app, finance).post('/v1/admin/merchants').set('Idempotency-Key', idemKey()).send({
      ...(await import('../../test-utils/fixtures')).merchantBody(planId),
    });
    expect(m.body.error.code).toBe('PLAN_ARCHIVED');
  });

  it('BR-SET example: merchant and provider documents from the snapshot, ledger balanced', async () => {
    const mPlan = await createMerchantPlan(app, finance);
    const merchant = await createMerchant(app, finance, mPlan);
    const p1Plan = await createProviderPlan(app, finance, { providerPayableMarginBps: 100, installmentCount: 1 });
    const p2Plan = await createProviderPlan(app, finance, { providerPayableMarginBps: 150, installmentCount: 3 });
    const p1 = await createProvider(app, ds, finance, p1Plan);
    const p2 = await createProvider(app, ds, finance, p2Plan);
    const snapshot: SettlementTermsSnapshot = {
      completedAt: '2026-09-29T08:00:00.000Z',
      completedDate: '2026-09-29',
      totalAmount: 20_000_000,
      cashAmount: 5_000_000,
      gatewayCode: 'MOCK',
      merchant: {
        merchantId: merchant.id,
        planId: mPlan,
        planNumber: 'MP-1',
        merchantReceivableMarginBps: 300,
        cashSettlementEnabled: true,
        cashSettlementBps: 3000,
        installmentCount: 2,
        maturityRule: 'EndOfJalaliMonth',
        cashSettlementDelayDays: 1,
        commissionAmount: 600_000,
      },
      providers: {
        [p1]: { planId: p1Plan, planNumber: 'PP-1', providerPayableMarginBps: 100, installmentCount: 1, maturityRule: 'EndOfJalaliMonth', creditAmount: 6_000_000, marginAmount: 60_000 },
        [p2]: { planId: p2Plan, planNumber: 'PP-2', providerPayableMarginBps: 150, installmentCount: 3, maturityRule: 'EndOfJalaliMonth', creditAmount: 9_000_000, marginAmount: 135_000 },
      },
    };
    const docs = app.get(DocumentsService);
    const orderId = 'ord_TESTSETTLEMENT0001';
    await ds.transaction(async (m) => {
      await docs.createMerchantDocuments(m, orderId, snapshot);
      await docs.createMerchantDocuments(m, orderId, snapshot); // FR-130 AC1: idempotent
      await docs.createProviderDocuments(m, orderId, p1, snapshot);
      await docs.createProviderDocuments(m, orderId, p2, snapshot);
    });
    const list = await docs.forOrder(orderId);
    const merchantDocs = list.filter((d) => d.counterpartyType === 'Merchant').map((d) => [d.kind, d.amount, d.maturityDate]);
    expect(merchantDocs).toEqual([
      ['CashSettlement', 5_820_000, jalaliToIso({ jy: 1405, jm: 7, jd: 8 })],
      ['OrderSettlement', 6_790_000, jalaliToIso({ jy: 1405, jm: 7, jd: 30 })],
      ['OrderSettlement', 6_790_000, jalaliToIso({ jy: 1405, jm: 8, jd: 30 })],
    ]);
    const p1Docs = list.filter((d) => d.counterpartyId === p1).map((d) => [d.amount, d.maturityDate]);
    expect(p1Docs).toEqual([[5_940_000, jalaliToIso({ jy: 1405, jm: 7, jd: 30 })]]);
    const p2Docs = list.filter((d) => d.counterpartyId === p2).map((d) => d.amount);
    expect(p2Docs).toEqual([2_955_000, 2_955_000, 2_955_000]);
    expect(list.every((d) => /^(PD|RD)-\d{8}-\d{6}$/.test(d.number))).toBe(true);
  });

  it('manual documents: four-eyes above threshold, no self approval, cancel posts reversal', async () => {
    const mPlan = await createMerchantPlan(app, finance);
    const merchant = await createMerchant(app, finance, mPlan);
    const big = await as(app, finance)
      .post('/v1/admin/documents')
      .set('Idempotency-Key', idemKey())
      .send({ direction: 'Payable', counterpartyType: 'Merchant', counterpartyId: merchant.id, amount: 60_000_000, maturityDate: '2026-10-01', reason: 'Adjustment', note: 'Large adjustment for testing' })
      .expect(201);
    expect(big.body.status).toBe('PendingApproval');
    const self = await as(app, finance).post(`/v1/admin/documents/${big.body.id}/approve`).send({ note: 'ok' }).expect(409);
    expect(self.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    const other = await createAdmin(app, ds, 'Finance');
    const approved = await as(app, other).post(`/v1/admin/documents/${big.body.id}/approve`).send({ note: 'checked' }).expect(200);
    expect(approved.body.status).toBe('Scheduled');
    const ledger = app.get(LedgerService);
    expect(await ledger.balance(Accounts.merchant(merchant.id))).toBe(-60_000_000);
    const cancelled = await as(app, finance).post(`/v1/admin/documents/${big.body.id}/cancel`).send({ note: 'duplicate entry' }).expect(200);
    expect(cancelled.body.status).toBe('Cancelled');
    expect(await ledger.balance(Accounts.merchant(merchant.id))).toBe(0);
    const short = await as(app, finance)
      .post('/v1/admin/documents')
      .set('Idempotency-Key', idemKey())
      .send({ direction: 'Receivable', counterpartyType: 'Merchant', counterpartyId: merchant.id, amount: 1000, maturityDate: '2026-10-01', reason: 'Other', note: 'short' })
      .expect(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('FR-133/134: daily invoice per counterparty, payment must match, documents settled, ledger clears', async () => {
    const mPlan = await createMerchantPlan(app, finance);
    const merchant = await createMerchant(app, finance, mPlan);
    for (const amount of [1_000_000, 2_500_000]) {
      await as(app, finance)
        .post('/v1/admin/documents')
        .set('Idempotency-Key', idemKey())
        .send({ direction: 'Payable', counterpartyType: 'Merchant', counterpartyId: merchant.id, amount, maturityDate: '2026-01-01', reason: 'Adjustment', note: 'past maturity adjustment' })
        .expect(201);
    }
    await app.get(DocumentsService).runMaturity();
    const invoices = app.get(InvoicesService);
    expect(await invoices.generate()).toBeGreaterThanOrEqual(1);
    expect(await invoices.generate()).toBe(0); // rerun safe
    const list = await as(app, finance).get(`/v1/admin/invoices?counterpartyId=${merchant.id}`).expect(200);
    expect(list.body.items).toHaveLength(1);
    const inv = list.body.items[0];
    expect(inv.totalAmount).toBe(3_500_000);
    expect(inv.documentCount).toBe(2);
    expect(inv.number).toMatch(/^PI-\d{8}-\d{6}$/);
    await as(app, finance).post(`/v1/admin/invoices/${inv.id}/mark-sent`).expect(200);
    const mismatch = await as(app, finance)
      .post(`/v1/admin/invoices/${inv.id}/payments`)
      .set('Idempotency-Key', idemKey())
      .send({ amount: 3_400_000, paidAt: new Date().toISOString(), bankReference: 'TRX-1' })
      .expect(422);
    expect(mismatch.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    const paid = await as(app, finance)
      .post(`/v1/admin/invoices/${inv.id}/payments`)
      .set('Idempotency-Key', idemKey())
      .send({ amount: 3_500_000, paidAt: new Date().toISOString(), bankReference: 'TRX-2' })
      .expect(200);
    expect(paid.body.status).toBe('Paid');
    expect(paid.body.documents.every((d: { status: string }) => d.status === 'Settled')).toBe(true);
    expect(await app.get(LedgerService).balance(Accounts.merchant(merchant.id))).toBe(0);
    const breaches = await app.get(LedgerService).checkInvariants();
    expect(breaches.filter((b) => b.name.includes(merchant.id))).toEqual([]);
  });

  it('overdue job marks sent invoices past due', async () => {
    const mPlan = await createMerchantPlan(app, finance);
    const merchant = await createMerchant(app, finance, mPlan);
    await as(app, finance)
      .post('/v1/admin/documents')
      .set('Idempotency-Key', idemKey())
      .send({ direction: 'Receivable', counterpartyType: 'Merchant', counterpartyId: merchant.id, amount: 5000, maturityDate: '2026-01-01', reason: 'Other', note: 'receivable for overdue test' })
      .expect(201);
    await app.get(DocumentsService).runMaturity();
    await app.get(InvoicesService).generate();
    const list = await as(app, finance).get(`/v1/admin/invoices?counterpartyId=${merchant.id}`).expect(200);
    const id = list.body.items[0].id;
    await as(app, finance).post(`/v1/admin/invoices/${id}/mark-sent`).expect(200);
    await ds.query(`UPDATE invoice SET due_date = '2026-01-01' WHERE id = $1`, [id]);
    expect(await app.get(InvoicesService).markOverdue()).toBe(1);
    const inv = await as(app, finance).get(`/v1/admin/invoices/${id}`).expect(200);
    expect(inv.body.status).toBe('Overdue');
  });
});
