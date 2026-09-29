import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { buildWorld, mockProvider, resetLimits, type World } from '../../test-utils/checkout-harness';
import { nationalCode, nextSeed } from '../../test-utils/fixtures';
import { WalletService } from './wallet.service';

describe('Wallet: inquiries, reservations, provider transactions (FR-030, FR-041, BR-PRV)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let world: World;
  let wallet: WalletService;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    world = await buildWorld(app, ds, 1);
    wallet = app.get(WalletService);
    resetLimits(app);
  });
  afterAll(() => app.close());

  it('FR-030: a slow provider times out at the deadline and its late answer is marked Late', async () => {
    const pid = world.providerIds[0];
    mockProvider(app, pid).behaviour = { latencyMs: 400 };
    const inq = await wallet.startInquiry('ord_INQTEST', 'Initial', [pid]);
    const results = await wallet.runInquiry(inq, [{ id: pid, key: { type: 'NationalId', value: nationalCode(nextSeed()) } }], 100);
    expect(results[0].outcome).toBe('Timeout');
    await new Promise((r) => setTimeout(r, 500));
    const row: { outcome: string }[] = await ds.query(`SELECT outcome FROM credit_inquiry_result WHERE inquiry_id = $1`, [inq.id]);
    expect(row[0].outcome).toBe('Late');
    mockProvider(app, pid).behaviour = {};
  });

  async function reservation(orderId: string, consumerId: string, amount: number): Promise<void> {
    await ds.transaction((m) =>
      wallet.createReservations(m, { orderId, consumerId, attemptNo: 1, holdDeadlineAt: new Date(Date.now() + 900_000), allocations: [{ providerId: world.providerIds[0], amount }] }),
    );
  }

  it('FR-041 AC2: concurrent orders for the same consumer and provider cannot double-spend', async () => {
    const pid = world.providerIds[0];
    const nid = nationalCode(nextSeed());
    mockProvider(app, pid).behaviour = { balances: { [nid]: 1_000_000 }, latencyMs: 50 };
    await reservation('ord_LOCKA', 'csm_LOCK', 800_000);
    await reservation('ord_LOCKB', 'csm_LOCK', 800_000);
    const key = async () => ({ type: 'NationalId' as const, value: nid });
    const [a, b] = await Promise.all([wallet.executeReservations('ord_LOCKA', 1, key), wallet.executeReservations('ord_LOCKB', 1, key)]);
    expect([a.allReserved, b.allReserved].sort()).toEqual([false, true]);
    mockProvider(app, pid).behaviour = {};
  });

  it('BR-PRV-03: unknown reserve outcome → status query → still unknown → failed + release sent', async () => {
    const pid = world.providerIds[0];
    const nid = nationalCode(nextSeed());
    mockProvider(app, pid).behaviour = { balances: { [nid]: 5_000_000 }, failOps: ['reserve'] };
    await reservation('ord_UNKNOWN', 'csm_UNKNOWN', 1_000_000);
    const gw = mockProvider(app, pid);
    const origStatus = gw.status.bind(gw);
    gw.status = () => Promise.reject(new Error('status down'));
    const r = await wallet.executeReservations('ord_UNKNOWN', 1, async () => ({ type: 'NationalId', value: nid }));
    gw.status = origStatus;
    mockProvider(app, pid).behaviour = { balances: { [nid]: 5_000_000 } };
    expect(r.allReserved).toBe(false);
    const rows: { type: string; status: string }[] = await ds.query(`SELECT type, status FROM provider_transaction WHERE order_id = 'ord_UNKNOWN' ORDER BY created_at`);
    expect(rows).toEqual([
      { type: 'Reservation', status: 'Failed' },
      { type: 'Release', status: 'Pending' },
    ]);
    await wallet.processDue();
    const res: { status: string }[] = await ds.query(`SELECT status FROM credit_reservation WHERE order_id = 'ord_UNKNOWN'`);
    expect(res[0].status).toBe('Released');
  });

  it('BR-RETRY-01: failed releases back off and exhaust into NeedsReconciliation', async () => {
    const pid = world.providerIds[0];
    const nid = nationalCode(nextSeed());
    mockProvider(app, pid).behaviour = { balances: { [nid]: 5_000_000 } };
    await reservation('ord_RETRY', 'csm_RETRY', 1_000_000);
    await wallet.executeReservations('ord_RETRY', 1, async () => ({ type: 'NationalId', value: nid }));
    const ids = await ds.transaction((m) => wallet.releaseAll(m, 'ord_RETRY'));
    mockProvider(app, pid).behaviour = { down: true };
    await wallet.dispatch(ids);
    const after1: { attempts: number; next: boolean }[] = await ds.query(`SELECT attempts, next_attempt_at > now() + interval '20 seconds' AS next FROM provider_transaction WHERE id = $1`, [ids[0]]);
    expect(after1[0]).toEqual({ attempts: 1, next: true });
    await ds.query(`UPDATE provider_transaction SET attempts = 11, next_attempt_at = now() WHERE id = $1`, [ids[0]]);
    await wallet.processDue();
    const res: { status: string; recon_direction: string }[] = await ds.query(`SELECT status, recon_direction FROM credit_reservation WHERE order_id = 'ord_RETRY'`);
    expect(res[0]).toEqual({ status: 'NeedsReconciliation', recon_direction: 'Release' });
    mockProvider(app, pid).behaviour = {};
  });
});
