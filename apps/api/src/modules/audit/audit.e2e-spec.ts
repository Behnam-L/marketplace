import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin } from '../../test-utils/admin-session';
import { createMerchantPlan } from '../../test-utils/fixtures';

describe('Audit log (FR-083)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
  });
  afterAll(() => app.close());

  it('records admin mutations with masked PII and supports filters', async () => {
    const admin = await createAdmin(app, ds);
    await createMerchantPlan(app, admin);
    await as(app, admin).post('/v1/admin/admins').send({ firstName: 'X', lastName: 'Y', phone: '09129998877', roleId: admin.roleId }).expect(201);
    const list = await as(app, admin).get(`/v1/admin/audit-logs?actorId=${admin.id}`).expect(200);
    const actions = list.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.login', 'Plans.createMerchant', 'Admins.create']));
    const created = list.body.items.find((i: { action: string }) => i.action === 'Admins.create');
    expect(JSON.stringify(created.after)).not.toContain('9129998877');
    const filtered = await as(app, admin).get('/v1/admin/audit-logs?action=Plans').expect(200);
    expect(filtered.body.items.every((i: { action: string }) => i.action.startsWith('Plans'))).toBe(true);
  });
});
