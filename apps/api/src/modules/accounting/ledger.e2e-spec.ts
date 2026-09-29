import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { LedgerService } from './ledger.service';

describe('Ledger (BR-LED-01)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let ledger: LedgerService;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    ledger = app.get(LedgerService);
  });
  afterAll(() => app.close());

  it('posts balanced entries idempotently and drops zero lines', async () => {
    const lines = [
      { account: 'PSP_CLEARING:MOCK', debit: 100 },
      { account: 'ALLOCATION_SUSPENSE', debit: 0 },
      { account: 'CP:MERCHANT:mer_1', credit: 97 },
      { account: 'COMMISSION_REVENUE', credit: 3 },
    ];
    const a = await ds.transaction((m) => ledger.post(m, { eventType: 'OrderCompleted', sourceType: 'Order', sourceId: 'ord_1', lines }));
    const b = await ds.transaction((m) => ledger.post(m, { eventType: 'OrderCompleted', sourceType: 'Order', sourceId: 'ord_1', lines }));
    expect(a).toBe(b);
    const count: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM ledger_line`);
    expect(Number(count[0].n)).toBe(3);
    expect(await ledger.balance('PSP_CLEARING:MOCK')).toBe(100);
  });

  it('rejects unbalanced entries and negative amounts', async () => {
    await expect(
      ds.transaction((m) => ledger.post(m, { eventType: 'X', sourceType: 'T', sourceId: 's1', lines: [{ account: 'A', debit: 5 }, { account: 'B', credit: 4 }] })),
    ).rejects.toThrow(/Unbalanced/);
    await expect(
      ds.transaction((m) => ledger.post(m, { eventType: 'X', sourceType: 'T', sourceId: 's2', lines: [{ account: 'A', debit: -5 }, { account: 'B', credit: -5 }] })),
    ).rejects.toThrow(/Invalid/);
  });

  it('reverses by posting a mirror entry; lines are immutable', async () => {
    await ds.transaction((m) => ledger.post(m, { eventType: 'Manual', sourceType: 'Doc', sourceId: 'doc_1', lines: [{ account: 'ADJUSTMENTS', debit: 50 }, { account: 'CP:MERCHANT:mer_2', credit: 50 }] }));
    await ds.transaction((m) => ledger.reverse(m, { eventType: 'Manual', sourceId: 'doc_1' }, { eventType: 'ManualReversal', sourceType: 'Doc', sourceId: 'doc_1' }));
    expect(await ledger.balance('CP:MERCHANT:mer_2')).toBe(0);
    await expect(ds.query(`UPDATE ledger_line SET debit = 1`)).rejects.toThrow(/append-only/);
    expect(await ledger.balance('', ds.manager, true)).toBe(0);
  });
});
