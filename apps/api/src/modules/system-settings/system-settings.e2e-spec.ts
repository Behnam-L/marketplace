import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, type TestAdmin } from '../../test-utils/admin-session';
import { SystemSettingsService } from './system-settings.service';

describe('System settings (FR-101, BR-LIM)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: TestAdmin;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    admin = await createAdmin(app, ds);
  });
  afterAll(() => app.close());

  it('lists typed settings with defaults and ranges', async () => {
    const r = await as(app, admin).get('/v1/admin/settings').expect(200);
    expect(r.body.find((s: { key: string }) => s.key === 'cashPaymentBps')).toMatchObject({ value: 2500, min: 0, max: 10000, type: 'int' });
  });

  it('validates ranges, requires a reason, records append-only history', async () => {
    await as(app, admin).patch('/v1/admin/settings/cashPaymentBps').send({ value: 10001, reason: 'too high' }).expect(400);
    await as(app, admin).patch('/v1/admin/settings/cashPaymentBps').send({ value: 3000 }).expect(400);
    await as(app, admin).patch('/v1/admin/settings/allowCashOnly').send({ value: 1, reason: 'wrong type' }).expect(400);
    await as(app, admin).patch('/v1/admin/settings/minOrderAmount').send({ value: 2_000_000_000, reason: 'min above max' }).expect(400);
    await as(app, admin).patch('/v1/admin/settings/cashPaymentBps').send({ value: 3000, reason: 'policy change' }).expect(200);
    expect(await app.get(SystemSettingsService).get('cashPaymentBps')).toBe(3000);
    const h = await as(app, admin).get('/v1/admin/settings/cashPaymentBps/history').expect(200);
    expect(h.body[0]).toMatchObject({ oldValue: 2500, newValue: 3000, reason: 'policy change', changedBy: admin.id });
    await expect(ds.query(`UPDATE system_setting_change SET reason = 'x'`)).rejects.toThrow(/append-only/);
    await as(app, admin).patch('/v1/admin/settings/unknownKey').send({ value: 1, reason: 'nope' }).expect(404);
  });

  it('settings.manage is required (Operations may only read)', async () => {
    const ops = await createAdmin(app, ds, 'Operations');
    await as(app, ops).get('/v1/admin/settings').expect(200);
    await as(app, ops).patch('/v1/admin/settings/cashPaymentBps').send({ value: 2000, reason: 'try' }).expect(403);
  });
});
