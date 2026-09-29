import { ExecutionContext, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import {
  HEADER_CSRF,
  normalisePhone,
  STEP_UP_PERMISSIONS,
  type AcceptInvitationResponse,
  type AdminSessionInfo,
  type MeResponse,
  type Permission,
} from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError, validationError } from '../../shared/errors/app-error';
import { ADMIN_PERMISSIONS, principalOf, setPrincipal, type AdminPrincipal } from '../../shared/http/auth-context';
import { setAuditHint } from '../../shared/http/audit-context';
import { CryptoService, safeEqual } from '../../shared/security/crypto.service';
import { generateTotpSecret, totpProvisioningUri, verifyTotp } from '../../shared/security/totp';
import { hashPassword, passwordPolicyError, verifyPassword } from '../../shared/security/passwords';
import { newId } from '../../shared/util/ids';
import { RateLimiter } from '../../shared/util/rate-limiter';
import { AuditService } from '../audit/audit.service';
import { AdminsService } from '../admins/admins.service';
import { RolesService } from '../admins/roles.service';
import { AdminUser } from '../admins/admin.entity';
import { AdminSession } from './admin-session.entity';
import { AuthRegistry } from './auth-registry';

export const ADMIN_COOKIE = 'bajet_admin';
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 3600 * 1000;
export const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

/** Admin authentication: password + mandatory TOTP, server-side sessions, CSRF, step-up (FR-080/081, §9.1). */
@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly registry: AuthRegistry,
    private readonly reflector: Reflector,
    private readonly admins: AdminsService,
    private readonly roles: RolesService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  onModuleInit(): void {
    this.registry.register('admin', (req, ctx) => this.authenticate(req, ctx));
  }

  private decryptTotp(enc: string | null): string | null {
    return enc ? this.crypto.decrypt(enc) : null;
  }

  private async registerFailure(admin: AdminUser, meta: Meta, stage: 'password' | 'totp'): Promise<never> {
    admin.failedLogins += 1;
    let locked = false;
    if (admin.failedLogins >= MAX_FAILURES) {
      admin.lockedUntil = new Date(Date.now() + LOCK_MS);
      admin.failedLogins = 0;
      admin.mfaTokenHash = null;
      locked = true;
    }
    await this.admins.save(admin);
    await this.audit.record({
      actorId: admin.id,
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: locked ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'AdminUser',
      entityId: admin.id,
      after: { stage },
      ...meta,
    });
    if (locked) throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Your account is locked for 15 minutes.');
    throw new AppError('UNAUTHENTICATED', stage === 'password' ? 'Invalid phone or password.' : 'Invalid authentication code.');
  }

  private assertNotLocked(admin: AdminUser): void {
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Your account is locked for 15 minutes.');
    }
  }

  async login(phoneInput: string, password: string, meta: Meta): Promise<{ mfaToken: string }> {
    this.limiter.hit(`admin-login:${meta.ip}`, 10, 60_000);
    const phone = normalisePhone(phoneInput);
    const admin = phone ? await this.admins.findByPhone(phone) : null;
    if (!admin || admin.status !== 'Active' || !admin.passwordHash || !admin.totpSecretEnc) {
      await this.audit.record({ actorId: null, action: 'auth.login_failed', entityType: 'AdminUser', after: { phone: phone ?? phoneInput.slice(0, 20) }, ...meta });
      throw new AppError('UNAUTHENTICATED', 'Invalid phone or password.');
    }
    this.assertNotLocked(admin);
    if (!(await verifyPassword(admin.passwordHash, password))) return this.registerFailure(admin, meta, 'password');
    const mfaToken = this.crypto.randomToken(32);
    admin.mfaTokenHash = this.crypto.hmac('admin-mfa', mfaToken);
    admin.mfaTokenExpiresAt = new Date(Date.now() + MFA_TOKEN_TTL_MS);
    await this.admins.save(admin);
    return { mfaToken };
  }

  async completeMfa(mfaToken: string, totp: string, meta: Meta, res: Response): Promise<AdminSessionInfo> {
    this.limiter.hit(`admin-login:${meta.ip}`, 10, 60_000);
    const admin = await this.admins.findByMfaToken(mfaToken);
    if (!admin || !admin.mfaTokenExpiresAt || admin.mfaTokenExpiresAt.getTime() <= Date.now() || admin.status !== 'Active') {
      throw new AppError('UNAUTHENTICATED', 'Your sign-in expired. Please enter your password again.');
    }
    this.assertNotLocked(admin);
    const secret = this.decryptTotp(admin.totpSecretEnc);
    if (!secret || !verifyTotp(secret, totp)) return this.registerFailure(admin, meta, 'totp');
    admin.failedLogins = 0;
    admin.lockedUntil = null;
    admin.mfaTokenHash = null;
    admin.mfaTokenExpiresAt = null;
    admin.lastLoginAt = new Date();
    await this.admins.save(admin);
    const token = this.crypto.randomToken(32);
    const now = new Date();
    const session = this.ds.manager.create(AdminSession, {
      id: newId('ses'),
      adminUserId: admin.id,
      tokenHash: this.crypto.hmac('admin-session', token),
      csrfToken: this.crypto.randomToken(24),
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS),
      stepUpAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    });
    await this.ds.manager.insert(AdminSession, session);
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: '/',
      maxAge: ABSOLUTE_TIMEOUT_MS,
    });
    await this.audit.record({
      actorId: admin.id,
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'auth.login',
      entityType: 'AdminUser',
      entityId: admin.id,
      ...meta,
    });
    return this.sessionInfo(session);
  }

  sessionInfo(s: AdminSession): AdminSessionInfo {
    const idle = s.lastSeenAt.getTime() + IDLE_TIMEOUT_MS;
    return {
      idleExpiresAt: new Date(Math.min(idle, s.expiresAt.getTime())).toISOString(),
      absoluteExpiresAt: s.expiresAt.toISOString(),
      csrfToken: s.csrfToken,
      stepUpValidUntil: s.stepUpAt ? new Date(s.stepUpAt.getTime() + STEP_UP_WINDOW_MS).toISOString() : null,
    };
  }

  async logout(req: Request, res: Response, meta: Meta): Promise<void> {
    const p = principalOf(req);
    if (p?.kind === 'admin') {
      await this.ds.manager.delete(AdminSession, { id: p.sessionId });
      await this.audit.record({ actorId: p.adminId, actorName: p.name, action: 'auth.logout', entityType: 'AdminUser', entityId: p.adminId, ...meta });
    }
    setAuditHint(req, { skip: true });
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
  }

  /** Global-guard hook for `ADM:<perm>` routes. */
  private async authenticate(req: Request, ctx: ExecutionContext): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[ADMIN_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
    const session = await this.ds.manager.findOne(AdminSession, { where: { tokenHash: this.crypto.hmac('admin-session', token) } });
    if (!session) throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS <= now) {
      await this.ds.manager.delete(AdminSession, { id: session.id });
      throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    const admin = await this.admins.findById(session.adminUserId);
    if (!admin || admin.status !== 'Active') {
      await this.ds.manager.delete(AdminSession, { id: session.id });
      throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    if (MUTATIONS.has(req.method)) {
      const csrf = req.header(HEADER_CSRF) ?? '';
      if (!safeEqual(csrf, session.csrfToken)) throw new AppError('FORBIDDEN', 'Invalid or missing CSRF token.');
    }
    const permissions = new Set(await this.roles.permissionsOfRole(admin.roleId));
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(ADMIN_PERMISSIONS, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const principal: AdminPrincipal = {
      kind: 'admin',
      adminId: admin.id,
      sessionId: session.id,
      roleId: admin.roleId,
      permissions,
      name: `${admin.firstName} ${admin.lastName}`,
      stepUpAt: session.stepUpAt,
    };
    setPrincipal(req, principal);
    if (!required.every((p) => permissions.has(p))) {
      throw new AppError('FORBIDDEN', "You don't have permission to perform this action.");
    }
    if (MUTATIONS.has(req.method) && required.some((p) => STEP_UP_PERMISSIONS.includes(p))) {
      if (!session.stepUpAt || session.stepUpAt.getTime() + STEP_UP_WINDOW_MS <= now) {
        throw new AppError('STEP_UP_REQUIRED', 'Please confirm with your authentication code to continue.');
      }
    }
    await this.ds.manager.update(AdminSession, { id: session.id }, { lastSeenAt: new Date() });
  }

  async stepUp(p: AdminPrincipal, totp: string): Promise<AdminSessionInfo> {
    const admin = await this.admins.findById(p.adminId);
    const secret = this.decryptTotp(admin?.totpSecretEnc ?? null);
    if (!admin || !secret || !verifyTotp(secret, totp)) {
      throw new AppError('UNAUTHENTICATED', 'Invalid authentication code.');
    }
    await this.ds.manager.update(AdminSession, { id: p.sessionId }, { stepUpAt: new Date() });
    const s = await this.ds.manager.findOneOrFail(AdminSession, { where: { id: p.sessionId } });
    return this.sessionInfo(s);
  }

  async me(p: AdminPrincipal): Promise<MeResponse> {
    const admin = await this.admins.findById(p.adminId);
    const session = await this.ds.manager.findOneOrFail(AdminSession, { where: { id: p.sessionId } });
    return {
      admin: {
        id: admin!.id,
        firstName: admin!.firstName,
        lastName: admin!.lastName,
        phone: admin!.phoneE164,
        roleId: admin!.roleId,
        roleName: await this.roles.roleName(admin!.roleId),
      },
      permissions: [...p.permissions],
      session: this.sessionInfo(session),
    };
  }

  private async adminForActionToken(token: string, purposes: ('invite' | 'mfa-reset' | 'password-reset')[]): Promise<AdminUser> {
    const admin = await this.admins.findByActionToken(token);
    if (!admin || !admin.actionTokenPurpose || !purposes.includes(admin.actionTokenPurpose)) {
      throw new AppError('TOKEN_EXPIRED', 'This link is invalid or has already been used.');
    }
    if (!admin.actionTokenExpiresAt || admin.actionTokenExpiresAt.getTime() <= Date.now()) {
      throw new AppError('TOKEN_EXPIRED', 'This link has expired. Ask an administrator for a new one.');
    }
    if (admin.status === 'Inactive') throw new AppError('TOKEN_EXPIRED', 'This account is inactive.');
    return admin;
  }

  /** Invitation / MFA re-enrolment step 1: set password, receive a TOTP secret. */
  async acceptInvitation(token: string, password: string): Promise<AcceptInvitationResponse> {
    const admin = await this.adminForActionToken(token, ['invite', 'mfa-reset']);
    const policy = passwordPolicyError(password);
    if (policy) throw validationError('password', policy);
    const secret = generateTotpSecret();
    admin.passwordHash = await hashPassword(password);
    admin.pendingTotpSecretEnc = this.crypto.encrypt(secret);
    await this.admins.save(admin);
    const account = admin.phoneE164.replace('+98', '0');
    return { totpProvisioningUri: totpProvisioningUri(secret, account), totpSecret: secret };
  }

  /** Step 2: confirm the authenticator; activates the account. */
  async confirmTotp(token: string, totp: string, meta: Meta): Promise<void> {
    const admin = await this.adminForActionToken(token, ['invite', 'mfa-reset']);
    const pending = this.decryptTotp(admin.pendingTotpSecretEnc);
    if (!pending) throw new AppError('STATE_CHANGED', 'Set your password first.');
    if (!verifyTotp(pending, totp)) throw new AppError('UNAUTHENTICATED', 'Invalid authentication code.');
    admin.totpSecretEnc = admin.pendingTotpSecretEnc;
    admin.pendingTotpSecretEnc = null;
    admin.actionTokenHash = null;
    admin.actionTokenPurpose = null;
    admin.actionTokenExpiresAt = null;
    if (admin.status === 'Invited') admin.status = 'Active';
    admin.failedLogins = 0;
    admin.lockedUntil = null;
    await this.admins.save(admin);
    await this.audit.record({ actorId: admin.id, action: 'auth.mfa_enrolled', entityType: 'AdminUser', entityId: admin.id, ...meta });
  }

  async requestPasswordReset(phone: string, meta: Meta): Promise<void> {
    this.limiter.hit(`admin-reset:${meta.ip}`, 5, 60_000);
    await this.admins.requestPasswordReset(phone);
  }

  async confirmPasswordReset(token: string, newPassword: string, totp: string, meta: Meta): Promise<void> {
    const admin = await this.adminForActionToken(token, ['password-reset']);
    const secret = this.decryptTotp(admin.totpSecretEnc);
    if (!secret || !verifyTotp(secret, totp)) throw new AppError('UNAUTHENTICATED', 'Invalid authentication code.');
    const policy = passwordPolicyError(newPassword);
    if (policy) throw validationError('newPassword', policy);
    admin.passwordHash = await hashPassword(newPassword);
    admin.actionTokenHash = null;
    admin.actionTokenPurpose = null;
    admin.actionTokenExpiresAt = null;
    admin.failedLogins = 0;
    admin.lockedUntil = null;
    await this.admins.save(admin);
    await this.ds.manager.delete(AdminSession, { adminUserId: admin.id });
    await this.audit.record({ actorId: admin.id, action: 'auth.password_reset', entityType: 'AdminUser', entityId: admin.id, ...meta });
  }

  async purgeExpiredSessions(): Promise<void> {
    await this.ds.query(
      `DELETE FROM admin_session WHERE expires_at <= now() OR last_seen_at <= now() - interval '30 minutes'`,
    );
  }
}
