import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  isValidNationalCode,
  maskNationalId,
  maskPhone,
  normalisePhone,
  toAsciiDigits,
  type ConsumerDetail,
  type ConsumerListItem,
  type OrderListItem,
  type Page,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged, validationError } from '../../shared/errors/app-error';
import { isUniqueViolation } from '../../shared/database/tx';
import { paginate } from '../../shared/database/pagination';
import { CryptoService } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CounterpartyRegistry } from '../settlements/counterparties';
import { ConsumerUser, IdentityAttempt, IdentityLinkage } from './consumer.entity';
import { IDENTITY_VERIFIER, IdentityUnavailableError, IdentityVerifier } from './identity-verifier';

export interface ConsumerQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  phone?: string;
  name?: string;
}

/** Outcome of an identity step, interpreted by checkout into order transitions. */
export type IdentityStepResult =
  | { kind: 'verified' }
  | { kind: 'needs-national-id' }
  | { kind: 'needs-dob' }
  | { kind: 'mismatch'; attemptsLeft: number }
  | { kind: 'locked'; phoneCooldown: boolean };

type InsightLookups = {
  orders?: (consumerId: string) => Promise<OrderListItem[]>;
  linkedProviders?: (consumerId: string) => Promise<{ providerId: string; displayName: string; lastUsedAt: string }[]>;
};

const serviceDown = (): AppError =>
  new AppError('IDENTITY_SERVICE_UNAVAILABLE', "We couldn't verify your identity right now. Please try again.");

/** Consumers, identity linkage and limits (FR-020–023, FR-113, §9.5). */
@Injectable()
export class ConsumersService implements OnModuleInit {
  private insights: InsightLookups = {};

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
    private readonly crypto: CryptoService,
    private readonly settings: SystemSettingsService,
    private readonly counterparties: CounterpartyRegistry,
  ) {}

  onModuleInit(): void {
    this.counterparties.register('Consumer', {
      names: async (ids) => {
        const rows = await this.ds.manager.find(ConsumerUser, { where: { id: In(ids) } });
        return new Map(rows.map((r) => [r.id, r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : maskPhone(r.phoneE164)]));
      },
      exists: (id) => this.ds.manager.exists(ConsumerUser, { where: { id } }),
    });
  }

  registerInsights(lookups: InsightLookups): void {
    this.insights = { ...this.insights, ...lookups };
  }

  identityHealthy(): boolean {
    return this.identity.isHealthy();
  }

  /* ─────────── Checkout-facing ─────────── */

  /** FR-002: finds or creates the consumer (`Inactive` when new). */
  async findOrCreate(m: EntityManager, phoneE164: string): Promise<ConsumerUser> {
    const existing = await m.findOne(ConsumerUser, { where: { phoneE164 } });
    if (existing) return existing;
    try {
      await m.query(
        `INSERT INTO consumer_user (id, phone_e164, status) VALUES ($1, $2, 'Inactive') ON CONFLICT (phone_e164) DO NOTHING`,
        [newId('csm'), phoneE164],
      );
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    return m.findOneOrFail(ConsumerUser, { where: { phoneE164 } });
  }

  async idByPhone(phoneE164: string): Promise<string | null> {
    return (await this.ds.manager.findOne(ConsumerUser, { where: { phoneE164 } }))?.id ?? null;
  }

  get(id: string, m: EntityManager = this.ds.manager): Promise<ConsumerUser | null> {
    return m.findOne(ConsumerUser, { where: { id } });
  }

  /** Blocked, or inside a cooldown window → not eligible for new checkouts. */
  isEligible(c: ConsumerUser, now: Date): boolean {
    return c.status !== 'Blocked' && !(c.cooldownUntil && c.cooldownUntil.getTime() > now.getTime());
  }

  /** FR-013 AC1: first OTP verification activates the consumer. */
  async markOtpVerified(m: EntityManager, consumerId: string): Promise<void> {
    await m.query(
      `UPDATE consumer_user SET status = CASE WHEN status = 'Inactive' THEN 'Active' ELSE status END,
         otp_verified_at = COALESCE(otp_verified_at, now()), updated_at = now() WHERE id = $1`,
      [consumerId],
    );
  }

  async startCooldown(m: EntityManager, consumerId: string, hours: number): Promise<void> {
    await m.query(`UPDATE consumer_user SET cooldown_until = now() + make_interval(hours => $2), updated_at = now() WHERE id = $1`, [consumerId, hours]);
  }

  async touchTransaction(m: EntityManager, consumerId: string): Promise<void> {
    await m.query(`UPDATE consumer_user SET last_transaction_at = now() WHERE id = $1`, [consumerId]);
  }

  /** The consumer's inquiry key value for a provider. */
  async inquiryKeyValue(consumerId: string, type: 'NationalId' | 'Phone', m: EntityManager = this.ds.manager): Promise<string | null> {
    if (type === 'Phone') return (await this.get(consumerId, m))?.phoneE164 ?? null;
    const l = await m.findOne(IdentityLinkage, { where: { consumerUserId: consumerId, status: 'Verified' } });
    return l ? this.crypto.decrypt(l.nationalIdEnc) : null;
  }

  /** Which identity sub-step the order is at (for the checkout view). */
  async identityStep(consumerId: string, orderId: string): Promise<'check' | 'national-id' | 'dob'> {
    const pending = await this.ds.manager.findOne(IdentityLinkage, { where: { consumerUserId: consumerId, orderId, status: 'PendingVerification' } });
    if (pending) return 'dob';
    const verified = await this.ds.manager.exists(IdentityLinkage, { where: { consumerUserId: consumerId, status: 'Verified' } });
    return verified ? 'check' : 'national-id';
  }

  private async recordAttempt(orderId: string, consumerId: string, step: IdentityAttempt['step'], outcome: IdentityAttempt['outcome']): Promise<void> {
    await this.ds.manager.insert(IdentityAttempt, { id: newId('ida'), orderId, consumerUserId: consumerId, step, outcome });
  }

  /** After a mismatch: FR-023 limits (per order and per phone per 24 h). */
  private async afterMismatch(orderId: string, consumerId: string): Promise<IdentityStepResult> {
    const s = await this.settings.getAll();
    const rows: { per_order: string; per_phone: string }[] = await this.ds.query(
      `SELECT count(*) FILTER (WHERE order_id = $1) AS per_order,
              count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS per_phone
         FROM identity_attempt WHERE consumer_user_id = $2 AND outcome = 'Mismatch'`,
      [orderId, consumerId],
    );
    const perOrder = Number(rows[0].per_order);
    const perPhone = Number(rows[0].per_phone);
    if (perPhone >= s.identityMaxMismatchesPerPhone24h) {
      await this.startCooldown(this.ds.manager, consumerId, s.phoneCooldownHours);
      return { kind: 'locked', phoneCooldown: true };
    }
    if (perOrder >= s.identityMaxMismatchesPerOrder) return { kind: 'locked', phoneCooldown: false };
    return { kind: 'mismatch', attemptsLeft: s.identityMaxMismatchesPerOrder - perOrder };
  }

  /**
   * FR-020: on entering AwaitingIdentity. A fresh `Verified` linkage passes; a stale
   * one is silently re-matched (phone↔ID). Service errors → 503, no attempt counted.
   */
  async checkLinkage(orderId: string, consumerId: string): Promise<IdentityStepResult> {
    const linkage = await this.ds.manager.findOne(IdentityLinkage, { where: { consumerUserId: consumerId, status: 'Verified' } });
    if (!linkage) {
      const pending = await this.ds.manager.exists(IdentityLinkage, { where: { consumerUserId: consumerId, orderId, status: 'PendingVerification' } });
      return pending ? { kind: 'needs-dob' } : { kind: 'needs-national-id' };
    }
    const days = await this.settings.get('linkageRematchDays');
    const fresh: { fresh: boolean }[] = await this.ds.query(
      `SELECT last_matched_at >= now() - make_interval(days => $2) AS fresh FROM identity_linkage WHERE id = $1`,
      [linkage.id, days],
    );
    if (fresh[0]?.fresh) return { kind: 'verified' };
    const consumer = await this.get(consumerId);
    let match: boolean;
    try {
      match = await this.identity.matchPhone(consumer!.phoneE164, this.crypto.decrypt(linkage.nationalIdEnc));
    } catch (e) {
      if (e instanceof IdentityUnavailableError) throw serviceDown();
      throw e;
    }
    if (match) {
      await this.ds.query(`UPDATE identity_linkage SET last_matched_at = now(), updated_at = now() WHERE id = $1`, [linkage.id]);
      await this.recordAttempt(orderId, consumerId, 'Rematch', 'Match');
      return { kind: 'verified' };
    }
    await this.ds.manager.update(IdentityLinkage, { id: linkage.id, status: 'Verified' }, { status: 'Revoked' });
    await this.recordAttempt(orderId, consumerId, 'Rematch', 'Mismatch');
    return { kind: 'needs-national-id' };
  }

  /** FR-021: national ID step. */
  async submitNationalId(orderId: string, consumerId: string, nationalIdInput: string): Promise<IdentityStepResult> {
    const nationalId = toAsciiDigits(nationalIdInput.trim());
    if (!isValidNationalCode(nationalId)) throw validationError('nationalId', 'Please enter a valid national ID.');
    const consumer = await this.get(consumerId);
    if (!consumer) throw notFound('Consumer');
    let match: boolean;
    try {
      match = await this.identity.matchPhone(consumer.phoneE164, nationalId);
    } catch (e) {
      if (e instanceof IdentityUnavailableError) throw serviceDown();
      throw e;
    }
    if (!match) {
      await this.recordAttempt(orderId, consumerId, 'NationalId', 'Mismatch');
      return this.afterMismatch(orderId, consumerId);
    }
    await this.recordAttempt(orderId, consumerId, 'NationalId', 'Match');
    await this.ds.transaction(async (m) => {
      await m.update(IdentityLinkage, { consumerUserId: consumerId, orderId, status: 'PendingVerification' }, { status: 'Abandoned' });
      await m.insert(IdentityLinkage, {
        id: newId('lnk'),
        consumerUserId: consumerId,
        nationalIdEnc: this.crypto.encrypt(nationalId),
        nationalIdHash: this.crypto.hmac('national-id', nationalId),
        status: 'PendingVerification',
        orderId,
      });
    });
    return { kind: 'needs-dob' };
  }

  /** FR-022/023: DOB step; verifies the linkage under a consumer row lock. */
  async submitDob(orderId: string, consumerId: string, dateOfBirth: string): Promise<IdentityStepResult> {
    const pending = await this.ds.manager.findOne(IdentityLinkage, { where: { consumerUserId: consumerId, orderId, status: 'PendingVerification' } });
    if (!pending) return { kind: 'needs-national-id' };
    const nationalId = this.crypto.decrypt(pending.nationalIdEnc);
    let result;
    try {
      result = await this.identity.matchDob(nationalId, dateOfBirth);
    } catch (e) {
      if (e instanceof IdentityUnavailableError) throw serviceDown();
      throw e;
    }
    if (!result.match) {
      await this.recordAttempt(orderId, consumerId, 'Dob', 'Mismatch');
      return this.afterMismatch(orderId, consumerId);
    }
    await this.recordAttempt(orderId, consumerId, 'Dob', 'Match');
    const { firstName, lastName } = result;
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT id FROM consumer_user WHERE id = $1 FOR UPDATE`, [consumerId]);
      const current = await m.findOne(IdentityLinkage, { where: { id: pending.id } });
      if (current?.status !== 'PendingVerification') return;
      const verified = await m.findOne(IdentityLinkage, { where: { consumerUserId: consumerId, status: 'Verified' } });
      if (verified && verified.nationalIdHash === pending.nationalIdHash) {
        // Concurrent verification of the same identity: keep one Verified row (FR-023 AC1).
        await m.query(`UPDATE identity_linkage SET last_matched_at = now(), updated_at = now() WHERE id = $1`, [verified.id]);
        await m.update(IdentityLinkage, { id: pending.id }, { status: 'Abandoned' });
      } else {
        if (verified) await m.update(IdentityLinkage, { id: verified.id }, { status: 'Revoked' });
        await m.query(
          `UPDATE identity_linkage SET status = 'Verified', dob_enc = $2, verified_at = now(), last_matched_at = now(), updated_at = now() WHERE id = $1`,
          [pending.id, this.crypto.encrypt(dateOfBirth)],
        );
      }
      await m.update(ConsumerUser, { id: consumerId }, { firstName, lastName });
    });
    return { kind: 'verified' };
  }

  /** §5.6: a PendingVerification linkage is abandoned when its order ends. */
  async abandonPendingForOrder(m: EntityManager, orderId: string): Promise<void> {
    await m.update(IdentityLinkage, { orderId, status: 'PendingVerification' }, { status: 'Abandoned' });
  }

  /* ─────────── Admin (FR-113) ─────────── */

  private toList(c: ConsumerUser, pii: boolean): ConsumerListItem {
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: pii ? c.phoneE164 : maskPhone(c.phoneE164),
      status: c.status,
      cooldownUntil: c.cooldownUntil?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  list(q: ConsumerQuery, pii: boolean): Promise<Page<ConsumerListItem>> {
    const qb = this.ds.manager.createQueryBuilder(ConsumerUser, 'c');
    if (q.status) qb.andWhere('c.status = :status', { status: q.status });
    if (q.phone) qb.andWhere('c.phoneE164 = :phone', { phone: normalisePhone(q.phone) ?? q.phone });
    if (q.name) qb.andWhere(`(c.firstName || ' ' || c.lastName) ILIKE :name`, { name: `%${q.name}%` });
    return paginate(qb, 'c', q, (rows) => rows.map((r) => this.toList(r, pii)));
  }

  async detail(id: string, pii: boolean): Promise<ConsumerDetail> {
    const c = await this.get(id);
    if (!c) throw notFound('Consumer');
    const l =
      (await this.ds.manager.findOne(IdentityLinkage, { where: { consumerUserId: id, status: 'Verified' } })) ??
      (await this.ds.manager.findOne(IdentityLinkage, { where: { consumerUserId: id }, order: { createdAt: 'DESC' } }));
    const nid = l ? this.crypto.decrypt(l.nationalIdEnc) : null;
    const dob = l?.dobEnc ? this.crypto.decrypt(l.dobEnc) : null;
    return {
      ...this.toList(c, pii),
      lastTransactionAt: c.lastTransactionAt?.toISOString() ?? null,
      linkage: l
        ? {
            id: l.id,
            status: l.status,
            nationalId: pii ? nid! : maskNationalId(nid!),
            dateOfBirth: dob ? (pii ? dob : '****-**-**') : null,
            verifiedAt: l.verifiedAt?.toISOString() ?? null,
            lastMatchedAt: l.lastMatchedAt?.toISOString() ?? null,
          }
        : null,
      linkedProviders: (await this.insights.linkedProviders?.(id)) ?? [],
      orders: (await this.insights.orders?.(id)) ?? [],
      piiVisible: pii,
    };
  }

  /** Admin sets Active ↔ Blocked with a reason. Unblocking a never-verified consumer returns it to Inactive. */
  async setStatus(id: string, status: 'Active' | 'Blocked', reason: string): Promise<{ before: string; after: string }> {
    if (!reason || reason.trim().length < 3) throw validationError('reason', 'A reason is required.');
    const c = await this.get(id);
    if (!c) throw notFound('Consumer');
    let next: ConsumerUser['status'];
    if (status === 'Blocked') {
      if (c.status === 'Blocked') throw stateChanged();
      next = 'Blocked';
    } else {
      if (c.status !== 'Blocked') throw stateChanged();
      next = c.otpVerifiedAt ? 'Active' : 'Inactive';
    }
    const r = await this.ds.manager.update(
      ConsumerUser,
      { id, version: c.version },
      { status: next, statusReason: reason.trim().slice(0, 500), version: c.version + 1 },
    );
    if (!r.affected) throw stateChanged();
    return { before: c.status, after: next };
  }

  /** For the ledger/documents: whether a consumer exists. */
  exists(id: string): Promise<boolean> {
    return this.ds.manager.exists(ConsumerUser, { where: { id } });
  }
}
