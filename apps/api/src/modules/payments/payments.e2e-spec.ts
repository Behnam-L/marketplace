import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { seedGateways } from '../../test-utils/fixtures';
import { PaymentsService } from './payments.service';

describe('Payments (BR-BANK-03/05, BR-RETRY-01)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let payments: PaymentsService;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    await seedGateways(ds);
    payments = app.get(PaymentsService);
  });
  afterAll(() => app.close());

  it('BR-BANK-05: highest-priority healthy gateway; falls back when it is down', async () => {
    expect((await payments.selectGateway())?.code).toBe('MOCK');
    payments.adapter('MOCK').behaviour = { down: true };
    expect((await payments.selectGateway())?.code).toBe('MOCK_B');
    payments.adapter('MOCK_B').behaviour = { down: true };
    expect(await payments.anyHealthyGateway()).toBe(false);
    payments.adapter('MOCK').behaviour = {};
    payments.adapter('MOCK_B').behaviour = {};
  });

  it('reversal retries with backoff and ends in NeedsReconciliation + item', async () => {
    const btx = await ds.transaction((m) => payments.createPayment(m, 'ord_REV', 1000, 'MOCK'));
    await payments.initiate(btx.id);
    await ds.transaction((m) => payments.startReversal(m, btx.id, 'TEST'));
    payments.adapter('MOCK').behaviour = { failOps: ['reverse'] };
    await payments.processReversal(btx.id);
    let row: { status: string; attempts: number }[] = await ds.query(`SELECT status, attempts FROM bank_transaction WHERE id = $1`, [btx.id]);
    expect(row[0]).toEqual({ status: 'ReversalPending', attempts: 1 });
    await ds.query(`UPDATE bank_transaction SET attempts = 11, next_attempt_at = now() WHERE id = $1`, [btx.id]);
    await payments.processDue();
    row = await ds.query(`SELECT status, attempts FROM bank_transaction WHERE id = $1`, [btx.id]);
    expect(row[0].status).toBe('NeedsReconciliation');
    const items: { type: string }[] = await ds.query(`SELECT type FROM reconciliation_item WHERE refs->>'bankTransactionId' = $1`, [btx.id]);
    expect(items[0].type).toBe('BANK_REVERSAL_FAILED');
    payments.adapter('MOCK').behaviour = {};
  });

  it('BR-BANK-03: a gateway without reverse opens a LATE_PAYMENT item instead', async () => {
    const btx = await ds.transaction((m) => payments.createPayment(m, 'ord_REVB', 1000, 'MOCK_B'));
    await payments.initiate(btx.id);
    await ds.transaction((m) => payments.startReversal(m, btx.id, 'LATE_PAYMENT'));
    await payments.processReversal(btx.id);
    const items: { type: string }[] = await ds.query(`SELECT type FROM reconciliation_item WHERE refs->>'bankTransactionId' = $1`, [btx.id]);
    expect(items[0].type).toBe('LATE_PAYMENT');
  });
});
