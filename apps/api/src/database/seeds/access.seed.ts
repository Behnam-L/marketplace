import { DataSource } from 'typeorm';
import {
  DEFAULT_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  normalisePhone,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SUPER_ADMIN_ROLE,
} from '@bajet/contracts';
import { newId } from '../../shared/util/ids';
import { hashPassword, passwordPolicyError } from '../../shared/security/passwords';
import { CryptoService } from '../../shared/security/crypto.service';
import { base32Decode } from '../../shared/security/totp';

/** Permission catalog and default roles (§9.2). Idempotent: existing roles keep their edits. */
export async function seedAccess(ds: DataSource): Promise<void> {
  for (const code of PERMISSIONS) {
    await ds.query(
      `INSERT INTO permission (code, description) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
      [code, PERMISSION_DESCRIPTIONS[code]],
    );
  }
  for (const name of DEFAULT_ROLES) {
    const existing: { id: string }[] = await ds.query(`SELECT id FROM role WHERE name = $1`, [name]);
    if (existing.length) continue;
    const id = newId('rol');
    await ds.query(`INSERT INTO role (id, name, description, is_system) VALUES ($1, $2, $3, $4)`, [
      id,
      name,
      `Default ${name} role`,
      name === SUPER_ADMIN_ROLE,
    ]);
    if (name !== SUPER_ADMIN_ROLE) {
      for (const perm of DEFAULT_ROLE_PERMISSIONS[name]) {
        await ds.query(`INSERT INTO role_permission (role_id, permission_code) VALUES ($1, $2)`, [id, perm]);
      }
    }
  }
}

export interface BootstrapAdminInput {
  phone: string;
  password: string;
  totpSecret: string;
  firstName?: string;
  lastName?: string;
}

/**
 * FR-081: the first SuperAdmin is created only by this bootstrap (CLI / container
 * start). It does nothing once any admin exists.
 */
export async function bootstrapSuperAdmin(ds: DataSource, crypto: CryptoService, input: BootstrapAdminInput): Promise<'created' | 'exists'> {
  const count: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM admin_user`);
  if (Number(count[0].n) > 0) return 'exists';
  const phone = normalisePhone(input.phone);
  if (!phone) throw new Error('BOOTSTRAP_ADMIN_PHONE is not a valid Iranian mobile number');
  const policy = passwordPolicyError(input.password);
  if (policy) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD rejected: ${policy}`);
  if (base32Decode(input.totpSecret).length < 10) throw new Error('BOOTSTRAP_ADMIN_TOTP_SECRET must be base32, ≥ 80 bits');
  const role: { id: string }[] = await ds.query(`SELECT id FROM role WHERE name = $1`, [SUPER_ADMIN_ROLE]);
  if (!role.length) throw new Error('Seed roles before bootstrapping the admin');
  await ds.query(
    `INSERT INTO admin_user (id, first_name, last_name, phone_e164, role_id, status, password_hash, totp_secret_enc)
     VALUES ($1, $2, $3, $4, $5, 'Active', $6, $7)`,
    [
      newId('adm'),
      input.firstName ?? 'مدیر',
      input.lastName ?? 'سیستم',
      phone,
      role[0].id,
      await hashPassword(input.password),
      crypto.encrypt(input.totpSecret.toUpperCase()),
    ],
  );
  return 'created';
}
