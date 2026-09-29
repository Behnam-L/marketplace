import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, TEST_PASSWORD } from '../../test-utils/admin-session';
import { totpAt } from '../../shared/security/totp';
import { RateLimiter } from '../../shared/util/rate-limiter';

describe('Admin auth (FR-080/081/083, §9.1)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
  });
  afterAll(() => app.close());
  beforeEach(() => app.get(RateLimiter).reset());

  it('logs in with password + TOTP and returns permissions from /me', async () => {
    const admin = await createAdmin(app, ds);
    const me = await as(app, admin).get('/v1/admin/me').expect(200);
    expect(me.body.permissions).toContain('settings.manage');
    expect(me.body.session.csrfToken).toBe(admin.csrf);
  });

  it('rejects unauthenticated and forbidden requests', async () => {
    await request(app.getHttpServer()).get('/v1/admin/me').expect(401);
    const viewer = await createAdmin(app, ds, 'Viewer');
    const r = await as(app, viewer).get('/v1/admin/audit-logs').expect(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  it('AC1: correct password and wrong TOTP 5 times → 423 ACCOUNT_LOCKED', async () => {
    const admin = await createAdmin(app, ds);
    const server = app.getHttpServer();
    let last: request.Response | undefined;
    for (let i = 0; i < 5; i++) {
      const l = await request(server).post('/v1/admin/auth/login').send({ phone: admin.phone, password: TEST_PASSWORD }).expect(200);
      last = await request(server).post('/v1/admin/auth/mfa').send({ mfaToken: l.body.mfaToken, totp: '000000' });
      app.get(RateLimiter).reset();
    }
    expect(last!.status).toBe(423);
    expect(last!.body.error.code).toBe('ACCOUNT_LOCKED');
    const again = await request(server).post('/v1/admin/auth/login').send({ phone: admin.phone, password: TEST_PASSWORD });
    expect(again.status).toBe(423);
    const audit: { action: string }[] = await ds.query(`SELECT action FROM audit_log WHERE entity_id = $1`, [admin.id]);
    expect(audit.map((a) => a.action)).toContain('auth.account_locked');
  });

  it('requires CSRF token on mutations', async () => {
    const admin = await createAdmin(app, ds);
    const r = await request(app.getHttpServer())
      .post('/v1/admin/auth/logout')
      .set('Cookie', admin.cookie)
      .expect(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  it('expires idle sessions after 30 minutes', async () => {
    const admin = await createAdmin(app, ds);
    await ds.query(`UPDATE admin_session SET last_seen_at = now() - interval '31 minutes' WHERE admin_user_id = $1`, [admin.id]);
    const r = await as(app, admin).get('/v1/admin/me').expect(401);
    expect(r.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('requires a fresh step-up for sensitive permissions', async () => {
    const admin = await createAdmin(app, ds);
    await ds.query(`UPDATE admin_session SET step_up_at = now() - interval '6 minutes' WHERE admin_user_id = $1`, [admin.id]);
    const r = await as(app, admin).patch('/v1/admin/settings/otpTtlSeconds').send({ value: 180, reason: 'test change' }).expect(401);
    expect(r.body.error.code).toBe('STEP_UP_REQUIRED');
    await as(app, admin).post('/v1/admin/auth/step-up').send({ totp: totpAt(admin.totpSecret, Date.now()) }).expect(200);
    await as(app, admin).patch('/v1/admin/settings/otpTtlSeconds').send({ value: 180, reason: 'test change' }).expect(200);
  });

  it('invitation → accept → TOTP confirm → login (FR-081)', async () => {
    const su = await createAdmin(app, ds);
    const roles = await as(app, su).get('/v1/admin/roles').expect(200);
    const support = roles.body.find((r: { name: string }) => r.name === 'Support');
    const created = await as(app, su).post('/v1/admin/admins').send({ firstName: 'Sara', lastName: 'K', phone: '09125550001', roleId: support.id }).expect(201);
    expect(created.body.status).toBe('Invited');
    expect(created.body.invitationDelivered).toBe(true);
    const inbox = await request(app.getHttpServer()).get('/v1/demo/sms?phone=09125550001').expect(200);
    const token = /invite\/([\w-]+)/.exec(inbox.body[0].text)![1];
    await request(app.getHttpServer()).post('/v1/admin/auth/invitations/accept').send({ token, password: 'short' }).expect(400);
    const acc = await request(app.getHttpServer()).post('/v1/admin/auth/invitations/accept').send({ token, password: 'a-long-enough-passphrase' }).expect(200);
    await request(app.getHttpServer()).post('/v1/admin/auth/totp/confirm').send({ token, totp: totpAt(acc.body.totpSecret, Date.now()) }).expect(204);
    await request(app.getHttpServer()).post('/v1/admin/auth/totp/confirm').send({ token, totp: totpAt(acc.body.totpSecret, Date.now()) }).expect(410);
    const l = await request(app.getHttpServer()).post('/v1/admin/auth/login').send({ phone: '09125550001', password: 'a-long-enough-passphrase' }).expect(200);
    expect(l.body.mfaToken).toBeTruthy();
  });

  it('writes audit entries for admin mutations and logins, and the table is append-only', async () => {
    const admin = await createAdmin(app, ds);
    await as(app, admin).patch('/v1/admin/settings/invoiceDueDays').send({ value: 5, reason: 'finance request' }).expect(200);
    const rows: { action: string; before: { value: number }; after: { value: number } }[] = await ds.query(
      `SELECT action, before, after FROM audit_log WHERE actor_id = $1 ORDER BY created_at`,
      [admin.id],
    );
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['auth.login', 'SystemSettings.update']));
    const upd = rows.find((r) => r.action === 'SystemSettings.update')!;
    expect(upd.before.value).toBe(3);
    expect(upd.after.value).toBe(5);
    await expect(ds.query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
  });
});
