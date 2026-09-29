import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  normalisePhone,
  normaliseText,
  SUPER_ADMIN_ROLE,
  type AdminListItem,
  type CreateAdminRequest,
  type CreateAdminResponse,
  type Page,
  type UpdateAdminRequest,
} from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError, notFound, validationError } from '../../shared/errors/app-error';
import { isUniqueViolation } from '../../shared/database/tx';
import { paginate } from '../../shared/database/pagination';
import { CryptoService } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminUser, Role } from './admin.entity';
import { MANAGER_PERMISSIONS, RolesService } from './roles.service';

export const ACTION_TOKEN_TTL_MS = 24 * 3600 * 1000;

export interface AdminQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  roleId?: string;
  phone?: string;
}

@Injectable()
export class AdminsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly roles: RolesService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  findById(id: string, m: EntityManager = this.ds.manager): Promise<AdminUser | null> {
    return m.findOne(AdminUser, { where: { id } });
  }

  findByPhone(phoneE164: string): Promise<AdminUser | null> {
    return this.ds.manager.findOne(AdminUser, { where: { phoneE164 } });
  }

  findByActionToken(token: string): Promise<AdminUser | null> {
    return this.ds.manager.findOne(AdminUser, { where: { actionTokenHash: this.crypto.hmac('admin-action', token) } });
  }

  findByMfaToken(token: string): Promise<AdminUser | null> {
    return this.ds.manager.findOne(AdminUser, { where: { mfaTokenHash: this.crypto.hmac('admin-mfa', token) } });
  }

  save(admin: AdminUser, m: EntityManager = this.ds.manager): Promise<AdminUser> {
    return m.save(AdminUser, admin);
  }

  async toListItem(a: AdminUser): Promise<AdminListItem> {
    return {
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      phone: a.phoneE164,
      roleId: a.roleId,
      roleName: await this.roles.roleName(a.roleId),
      status: a.status,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      lockedUntil: a.lockedUntil?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  list(q: AdminQuery): Promise<Page<AdminListItem>> {
    const qb = this.ds.manager.createQueryBuilder(AdminUser, 'a');
    if (q.status) qb.andWhere('a.status = :status', { status: q.status });
    if (q.roleId) qb.andWhere('a.roleId = :roleId', { roleId: q.roleId });
    if (q.phone) qb.andWhere('a.phoneE164 = :phone', { phone: normalisePhone(q.phone) ?? q.phone });
    return paginate(qb, 'a', q, (rows) => Promise.all(rows.map((r) => this.toListItem(r))));
  }

  async get(id: string): Promise<AdminListItem> {
    const a = await this.findById(id);
    if (!a) throw notFound('Admin');
    return this.toListItem(a);
  }

  /** Issues a single-use action token (stored hashed) valid for 24 h. */
  issueActionToken(admin: AdminUser, purpose: 'invite' | 'mfa-reset' | 'password-reset'): string {
    const token = this.crypto.randomToken(32);
    admin.actionTokenHash = this.crypto.hmac('admin-action', token);
    admin.actionTokenPurpose = purpose;
    admin.actionTokenExpiresAt = new Date(Date.now() + ACTION_TOKEN_TTL_MS);
    return token;
  }

  linkFor(purpose: 'invite' | 'mfa-reset' | 'password-reset', token: string): string {
    const base = `${this.config.publicWebUrl}/admin`;
    if (purpose === 'password-reset') return `${base}/reset-password?token=${token}`;
    return `${base}/invite/${token}${purpose === 'mfa-reset' ? '?mode=mfa' : ''}`;
  }

  private async sendActionLink(admin: AdminUser, purpose: 'invite' | 'mfa-reset' | 'password-reset', token: string): Promise<boolean> {
    const event = purpose === 'invite' ? 'admin.invitation' : purpose === 'mfa-reset' ? 'admin.mfa_reset' : 'admin.password_reset';
    try {
      await this.notifications.sendSms(event, admin.phoneE164, { link: this.linkFor(purpose, token) });
      return true;
    } catch {
      return false;
    }
  }

  /** FR-081: invitation by SMS link; delivery failure keeps the record `Invited` with Resend. */
  async create(input: CreateAdminRequest): Promise<CreateAdminResponse> {
    const phone = normalisePhone(input.phone);
    if (!phone) throw validationError('phone', 'Please enter a valid mobile number.');
    const role = await this.ds.manager.findOne(Role, { where: { id: input.roleId } });
    if (!role) throw validationError('roleId', 'Role not found.');
    const admin = this.ds.manager.create(AdminUser, {
      id: newId('adm'),
      firstName: normaliseText(input.firstName),
      lastName: normaliseText(input.lastName),
      phoneE164: phone,
      roleId: role.id,
      status: 'Invited',
      failedLogins: 0,
      version: 1,
    });
    const token = this.issueActionToken(admin, 'invite');
    try {
      await this.ds.manager.insert(AdminUser, admin);
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError('DUPLICATE_ENTITY', 'An admin with this phone already exists.', { field: 'phone' });
      throw e;
    }
    const delivered = await this.sendActionLink(admin, 'invite', token);
    return { ...(await this.get(admin.id)), invitationDelivered: delivered };
  }

  async resendInvitation(id: string): Promise<{ delivered: boolean }> {
    const admin = await this.findById(id);
    if (!admin) throw notFound('Admin');
    if (admin.status !== 'Invited') throw new AppError('STATE_CHANGED', 'Only invited admins can receive a new invitation.');
    const token = this.issueActionToken(admin, 'invite');
    await this.save(admin);
    return { delivered: await this.sendActionLink(admin, 'invite', token) };
  }

  /** TOTP reset only by SuperAdmin: clears the secret and sends a re-enrolment link. */
  async resetMfa(id: string, actorRoleId: string): Promise<{ delivered: boolean }> {
    const actorRole = await this.ds.manager.findOne(Role, { where: { id: actorRoleId } });
    if (actorRole?.name !== SUPER_ADMIN_ROLE) throw new AppError('FORBIDDEN', 'Only a SuperAdmin can reset two-factor authentication.');
    const admin = await this.findById(id);
    if (!admin) throw notFound('Admin');
    if (admin.status !== 'Active') throw new AppError('STATE_CHANGED', 'Only active admins can have their two-factor reset.');
    admin.totpSecretEnc = null;
    admin.pendingTotpSecretEnc = null;
    const token = this.issueActionToken(admin, 'mfa-reset');
    await this.save(admin);
    return { delivered: await this.sendActionLink(admin, 'mfa-reset', token) };
  }

  async requestPasswordReset(phoneInput: string): Promise<void> {
    const phone = normalisePhone(phoneInput);
    if (!phone) return;
    const admin = await this.findByPhone(phone);
    if (!admin || admin.status !== 'Active' || !admin.totpSecretEnc) return;
    const token = this.issueActionToken(admin, 'password-reset');
    await this.save(admin);
    await this.sendActionLink(admin, 'password-reset', token);
  }

  /** FR-120 edits with the last-manager guard and no self re-role. */
  async update(id: string, input: UpdateAdminRequest, actorId: string): Promise<{ before: AdminListItem; after: AdminListItem }> {
    const before = await this.get(id);
    await this.ds.transaction(async (m) => {
      await this.roles.lockManagers(m);
      const admin = await m.findOne(AdminUser, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!admin) throw notFound('Admin');
      if (input.roleId && input.roleId !== admin.roleId) {
        if (id === actorId) throw new AppError('FORBIDDEN', 'You cannot change your own role.');
        const role = await m.findOne(Role, { where: { id: input.roleId } });
        if (!role) throw validationError('roleId', 'Role not found.');
      }
      if (input.status) {
        const allowed =
          (admin.status === 'Active' && input.status === 'Inactive') ||
          (admin.status === 'Inactive' && input.status === 'Active' && admin.passwordHash && admin.totpSecretEnc) ||
          (admin.status === 'Invited' && input.status === 'Inactive') ||
          admin.status === input.status;
        if (!allowed) throw new AppError('STATE_CHANGED', `Cannot change status from ${admin.status} to ${input.status}.`);
      }
      const willBeActive = (input.status ?? admin.status) === 'Active';
      const roleId = input.roleId ?? admin.roleId;
      if (admin.status === 'Active' && (!willBeActive || roleId !== admin.roleId)) {
        for (const perm of MANAGER_PERMISSIONS) {
          const remaining = await this.roles.activeHolders(m, perm, willBeActive
            ? { adminRoleOverride: { adminId: id, roleId } }
            : { excludeAdminId: id });
          if (remaining === 0) throw new AppError('LAST_ADMIN_MANAGER', `This change would leave no active admin with ${perm}.`);
        }
      }
      if (input.firstName !== undefined) admin.firstName = normaliseText(input.firstName);
      if (input.lastName !== undefined) admin.lastName = normaliseText(input.lastName);
      admin.roleId = roleId;
      if (input.status) admin.status = input.status;
      admin.version += 1;
      await m.save(AdminUser, admin);
      if (admin.status === 'Inactive') {
        await m.query(`DELETE FROM admin_session WHERE admin_user_id = $1`, [id]);
      }
    });
    return { before, after: await this.get(id) };
  }
}
