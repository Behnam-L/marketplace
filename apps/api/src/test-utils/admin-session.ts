import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { SUPER_ADMIN_ROLE } from '@bajet/contracts';
import { CryptoService } from '../shared/security/crypto.service';
import { generateTotpSecret, totpAt } from '../shared/security/totp';
import { hashPassword } from '../shared/security/passwords';
import { newId } from '../shared/util/ids';

export const TEST_PASSWORD = 'correct-horse-battery-staple';

export interface TestAdmin {
  id: string;
  phone: string;
  totpSecret: string;
  cookie: string;
  csrf: string;
  roleId: string;
}

let phoneSeq = 1000000;

/** Inserts an active admin with the given role and logs in (password + TOTP). */
export async function createAdmin(app: INestApplication, ds: DataSource, roleName = SUPER_ADMIN_ROLE): Promise<TestAdmin> {
  const crypto = app.get(CryptoService);
  const role: { id: string }[] = await ds.query(`SELECT id FROM role WHERE name = $1`, [roleName]);
  const id = newId('adm');
  phoneSeq += 1;
  const phone = `+98912${String(phoneSeq).padStart(7, '0')}`;
  const totpSecret = generateTotpSecret();
  await ds.query(
    `INSERT INTO admin_user (id, first_name, last_name, phone_e164, role_id, status, password_hash, totp_secret_enc)
     VALUES ($1, 'Test', $2, $3, $4, 'Active', $5, $6)`,
    [id, roleName, phone, role[0].id, await hashPassword(TEST_PASSWORD), crypto.encrypt(totpSecret)],
  );
  const session = await login(app, phone, totpSecret);
  return { id, phone, totpSecret, roleId: role[0].id, ...session };
}

export async function login(app: INestApplication, phone: string, totpSecret: string): Promise<{ cookie: string; csrf: string }> {
  const server = app.getHttpServer();
  const l = await request(server).post('/v1/admin/auth/login').send({ phone, password: TEST_PASSWORD }).expect(200);
  const m = await request(server)
    .post('/v1/admin/auth/mfa')
    .send({ mfaToken: l.body.mfaToken, totp: totpAt(totpSecret, Date.now()) })
    .expect(200);
  const setCookie = m.headers['set-cookie'] as unknown as string[];
  return { cookie: setCookie.map((c) => c.split(';')[0]).join('; '), csrf: m.body.csrfToken };
}

/** Request helper that attaches cookie + CSRF. */
export function as(app: INestApplication, admin: { cookie: string; csrf: string }) {
  const server = app.getHttpServer();
  return {
    get: (url: string) => request(server).get(url).set('Cookie', admin.cookie),
    post: (url: string) => request(server).post(url).set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf),
    patch: (url: string) => request(server).patch(url).set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf),
    put: (url: string) => request(server).put(url).set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf),
    delete: (url: string) => request(server).delete(url).set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf),
  };
}

export const idemKey = (): string => `ik-${Math.random().toString(36).slice(2)}-${Date.now()}`;
