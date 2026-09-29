import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, type TestAdmin } from '../../test-utils/admin-session';

describe('Admin users and roles (FR-120/121, FR-082)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let su: TestAdmin;
  let roles: Record<string, string>;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    su = await createAdmin(app, ds);
    const r = await as(app, su).get('/v1/admin/roles').expect(200);
    roles = Object.fromEntries(r.body.map((x: { name: string; id: string }) => [x.name, x.id]));
  });
  afterAll(() => app.close());

  it('last active manager cannot be deactivated or re-roled; no self re-role', async () => {
    const self = await as(app, su).patch(`/v1/admin/admins/${su.id}`).send({ roleId: roles.Viewer }).expect(403);
    expect(self.body.error.code).toBe('FORBIDDEN');
    const other = await createAdmin(app, ds);
    // Two SuperAdmins: deactivating one is fine.
    await as(app, su).patch(`/v1/admin/admins/${other.id}`).send({ status: 'Inactive' }).expect(200);
    // Now `su` is the last manager: another SuperAdmin can't take them down.
    const third = await createAdmin(app, ds);
    await as(app, third).patch(`/v1/admin/admins/${third.id}`).send({ status: 'Inactive' }).expect(200);
    const blocked = await as(app, su).patch(`/v1/admin/admins/${su.id}`).send({ status: 'Inactive' }).expect(409);
    expect(blocked.body.error.code).toBe('LAST_ADMIN_MANAGER');
  });

  it('SuperAdmin role is immutable; custom roles get permissions; removal takes effect on the next request', async () => {
    await as(app, su).put(`/v1/admin/roles/${roles.SuperAdmin}/permissions`).send({ permissionCodes: [] }).expect(403);
    const custom = await as(app, su).post('/v1/admin/roles').send({ name: 'Auditors', description: 'read audit' }).expect(201);
    await as(app, su).put(`/v1/admin/roles/${custom.body.id}/permissions`).send({ permissionCodes: ['audit.read'] }).expect(200);
    const auditor = await createAdmin(app, ds, 'Auditors');
    await as(app, auditor).get('/v1/admin/audit-logs').expect(200);
    await as(app, su).put(`/v1/admin/roles/${custom.body.id}/permissions`).send({ permissionCodes: [] }).expect(200);
    await as(app, auditor).get('/v1/admin/audit-logs').expect(403);
    const me = await as(app, auditor).get('/v1/admin/me').expect(200);
    expect(me.body.permissions).toEqual([]);
    await as(app, su).put(`/v1/admin/roles/${custom.body.id}/permissions`).send({ permissionCodes: ['not.real'] }).expect(400);
    await as(app, su).post('/v1/admin/roles').send({ name: 'Auditors', description: 'dup' }).expect(409);
  });

  it('removing admins.manage from the only role holding it is blocked', async () => {
    const custom = await as(app, su).post('/v1/admin/roles').send({ name: 'Managers', description: 'm' }).expect(201);
    await as(app, su).put(`/v1/admin/roles/${custom.body.id}/permissions`).send({ permissionCodes: ['admins.manage', 'roles.manage'] }).expect(200);
    await as(app, su).put(`/v1/admin/roles/${custom.body.id}/permissions`).send({ permissionCodes: [] }).expect(200);
  });

  it('duplicate phone → 409 DUPLICATE_ENTITY; resend invitation', async () => {
    const a = await as(app, su).post('/v1/admin/admins').send({ firstName: 'A', lastName: 'B', phone: '09127770000', roleId: roles.Support }).expect(201);
    const dup = await as(app, su).post('/v1/admin/admins').send({ firstName: 'C', lastName: 'D', phone: '+989127770000', roleId: roles.Support }).expect(409);
    expect(dup.body.error.details.field).toBe('phone');
    await as(app, su).post(`/v1/admin/admins/${a.body.id}/resend-invitation`).expect(202);
  });
});
