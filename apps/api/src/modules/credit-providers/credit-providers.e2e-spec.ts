import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, idemKey, type TestAdmin } from '../../test-utils/admin-session';
import { createProviderPlan, providerBody } from '../../test-utils/fixtures';
import { nextConnectionStatus, p95, ProviderGatewayService } from './provider-gateway.service';

describe('Credit providers (FR-090/091, BR-PRV-01)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: TestAdmin;
  let planId: string;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    admin = await createAdmin(app, ds);
    planId = await createProviderPlan(app, admin);
  });
  afterAll(() => app.close());

  it('new providers start Disconnected; connection status is not editable', async () => {
    const r = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(providerBody(planId)).expect(201);
    expect(r.body.connectionStatus).toBe('Disconnected');
    const bad = await as(app, admin).patch(`/v1/admin/providers/${r.body.id}`).set('If-Match', String(r.body.version)).send({ connectionStatus: 'Connected' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('FR-090 AC1: concurrent creates with the same national ID → one 201, one 409', async () => {
    const body = providerBody(planId);
    const [a, b] = await Promise.all([
      as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(body),
      as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send({ ...body, economicId: String(Number(body.economicId) + 1) }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((a.status === 409 ? a : b).body.error.details.field).toBe('nationalId');
  });

  it('FR-090 AC2: IBAN failing mod-97 → 400', async () => {
    const r = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(providerBody(planId, { iban: 'IR062960000000100324200002' })).expect(400);
    expect(r.body.error.message).toBe('Please enter a valid IBAN.');
  });

  it('idempotent create replays the original response', async () => {
    const key = idemKey();
    const body = providerBody(planId);
    const a = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', key).send(body).expect(201);
    const b = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', key).send(body).expect(201);
    expect(b.body.id).toBe(a.body.id);
    const c = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', key).send({ ...body, sortOrder: 9 }).expect(422);
    expect(c.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('BR-PRV-01 health rules', () => {
    const base = { consecutiveProbeFailures: 0, consecutiveProbeSuccesses: 0, errorRate: 0, p95LatencyMs: 100, sampleCount: 10 };
    expect(nextConnectionStatus('Connected', { ...base, consecutiveProbeFailures: 3 })).toBe('Disconnected');
    expect(nextConnectionStatus('Connected', { ...base, errorRate: 0.2 })).toBe('Degraded');
    expect(nextConnectionStatus('Connected', { ...base, p95LatencyMs: 5001 })).toBe('Degraded');
    expect(nextConnectionStatus('Degraded', { ...base, consecutiveProbeSuccesses: 2 })).toBe('Degraded');
    expect(nextConnectionStatus('Degraded', { ...base, consecutiveProbeSuccesses: 3 })).toBe('Connected');
    expect(nextConnectionStatus('Disconnected', { ...base, consecutiveProbeSuccesses: 3 })).toBe('Connected');
    expect(nextConnectionStatus('Disconnected', { ...base, consecutiveProbeSuccesses: 3, errorRate: 0.5 })).toBe('Degraded');
    expect(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100])).toBe(19);
  });

  it('probes move a new provider to Connected after three successes and back to Disconnected after three failures', async () => {
    const r = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(providerBody(planId)).expect(201);
    const gw = app.get(ProviderGatewayService);
    for (let i = 0; i < 3; i++) await gw.probeAll();
    const s1: { connection_status: string }[] = await ds.query(`SELECT connection_status FROM credit_provider WHERE id = $1`, [r.body.id]);
    expect(s1[0].connection_status).toBe('Connected');
    gw.mock(r.body.id).behaviour = { down: true };
    for (let i = 0; i < 3; i++) await gw.probeAll();
    const s2: { connection_status: string }[] = await ds.query(`SELECT connection_status FROM credit_provider WHERE id = $1`, [r.body.id]);
    expect(s2[0].connection_status).toBe('Disconnected');
  });
});
