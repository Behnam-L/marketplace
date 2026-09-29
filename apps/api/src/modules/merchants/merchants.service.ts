import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Request } from 'express';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  HEADER_KEY_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  isValidEconomicId,
  isValidLegalNationalId,
  isValidNationalCode,
  normaliseText,
  toAsciiDigits,
  type CreateApiKeyResponse,
  type MerchantDetail,
  type MerchantInput,
  type MerchantListItem,
  type Page,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged, validationError } from '../../shared/errors/app-error';
import { isUniqueViolation } from '../../shared/database/tx';
import { paginate } from '../../shared/database/pagination';
import { setPrincipal } from '../../shared/http/auth-context';
import { CryptoService, safeEqual } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { AuthRegistry } from '../auth/auth-registry';
import { FilesService } from '../files/files.service';
import { PlansService } from '../settlements/plans.service';
import { InvoicesService } from '../settlements/invoices.service';
import { CounterpartyRegistry } from '../settlements/counterparties';
import { Merchant, MerchantApiKey } from './merchant.entity';
import { MAX_CLOCK_SKEW_SECONDS, signRequest } from './merchant-signing';
import { WebhooksService } from './webhooks.service';

export interface MerchantQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  entityType?: string;
  q?: string;
}

export interface CheckoutMerchant {
  id: string;
  displayName: string;
  status: 'Enabled' | 'Disabled';
  returnUrlDomains: string[];
  merchantSettlementPlanId: string;
  webhookUrl: string | null;
}

const MAX_ACTIVE_KEYS = 2;

/** FR-092/093: merchants, credentials, HMAC request authentication. */
@Injectable()
export class MerchantsService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly crypto: CryptoService,
    private readonly registry: AuthRegistry,
    private readonly files: FilesService,
    private readonly plans: PlansService,
    private readonly invoices: InvoicesService,
    private readonly counterparties: CounterpartyRegistry,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit(): void {
    this.registry.register('merchant', (req) => this.authenticate(req));
    this.counterparties.register('Merchant', {
      names: async (ids) => {
        const rows = await this.ds.manager.find(Merchant, { where: { id: In(ids) }, select: { id: true, displayName: true } });
        return new Map(rows.map((r) => [r.id, r.displayName]));
      },
      exists: (id) => this.ds.manager.exists(Merchant, { where: { id } }),
    });
    this.plans.registerUsage('merchant', (planId) => this.ds.manager.count(Merchant, { where: { merchantSettlementPlanId: planId } }));
    this.webhooks.registerSecretLookup((merchantId) => this.signingKey(merchantId));
  }

  /* ─────────── Merchant API authentication (§9.1) ─────────── */

  private async authenticate(req: Request): Promise<void> {
    const keyId = req.header(HEADER_KEY_ID);
    const ts = req.header(HEADER_TIMESTAMP);
    const sig = req.header(HEADER_SIGNATURE);
    if (!keyId || !ts || !sig) throw new AppError('UNAUTHENTICATED', 'Missing signature headers.');
    const tsNum = Number(ts);
    if (!Number.isInteger(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_CLOCK_SKEW_SECONDS) {
      throw new AppError('INVALID_SIGNATURE', 'Request timestamp is outside the allowed window.');
    }
    const key = await this.ds.manager.findOne(MerchantApiKey, { where: { keyId, status: 'Active' } });
    if (!key) throw new AppError('INVALID_SIGNATURE', 'Unknown or revoked key.');
    const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    const expected = signRequest(this.crypto.decrypt(key.secretEnc), ts, req.method, req.originalUrl, raw);
    if (!safeEqual(expected, sig.toLowerCase())) throw new AppError('INVALID_SIGNATURE', 'Invalid request signature.');
    setPrincipal(req, { kind: 'merchant', merchantId: key.merchantId, keyId });
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      await this.ds.manager.update(MerchantApiKey, { id: key.id }, { lastUsedAt: new Date() });
    }
  }

  /** Newest active key signs outbound webhooks. */
  private async signingKey(merchantId: string): Promise<{ keyId: string; secret: string } | null> {
    const key = await this.ds.manager.findOne(MerchantApiKey, { where: { merchantId, status: 'Active' }, order: { createdAt: 'DESC' } });
    return key ? { keyId: key.keyId, secret: this.crypto.decrypt(key.secretEnc) } : null;
  }

  /* ─────────── Lookups used by other modules ─────────── */

  async forCheckout(id: string, m: EntityManager = this.ds.manager): Promise<CheckoutMerchant | null> {
    const r = await m.findOne(Merchant, { where: { id } });
    return r
      ? {
          id: r.id,
          displayName: r.displayName,
          status: r.status,
          returnUrlDomains: r.returnUrlDomains,
          merchantSettlementPlanId: r.merchantSettlementPlanId,
          webhookUrl: r.webhookUrl,
        }
      : null;
  }

  async names(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.ds.manager.find(Merchant, { where: { id: In([...new Set(ids)]) }, select: { id: true, displayName: true } });
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  /* ─────────── Admin CRUD ─────────── */

  private normalise(input: MerchantInput): MerchantInput {
    const nationalId = toAsciiDigits(input.nationalId.trim());
    const economicId = input.economicId ? toAsciiDigits(input.economicId.trim()) : null;
    const out: MerchantInput = {
      ...input,
      displayName: normaliseText(input.displayName),
      legalName: normaliseText(input.legalName),
      managerName: normaliseText(input.managerName),
      officeAddress: normaliseText(input.officeAddress),
      nationalId,
      economicId,
      managerNationalCode: toAsciiDigits(input.managerNationalCode.trim()),
      contactNumber: toAsciiDigits(input.contactNumber.replace(/[\s-]/g, '')),
      iban: toAsciiDigits(input.iban.replace(/\s/g, '')).toUpperCase(),
      returnUrlDomains: [...new Set(input.returnUrlDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))],
      webhookUrl: input.webhookUrl?.trim() || null,
    };
    // BR-VAL: conditional by entity type (FR-092 AC1).
    if (out.entityType === 'Individual') {
      if (!isValidNationalCode(out.nationalId)) throw validationError('nationalId', 'For individuals, the national ID must be a valid 10-digit personal code.');
      if (out.economicId && !isValidEconomicId(out.economicId)) throw validationError('economicId', 'Economic ID must be 11–12 digits.');
    } else {
      if (!isValidLegalNationalId(out.nationalId)) throw validationError('nationalId', 'Please enter a valid 11-digit legal-entity national ID.');
      if (!out.economicId) throw validationError('economicId', 'Economic ID is required for legal entities.');
      if (!isValidEconomicId(out.economicId)) throw validationError('economicId', 'Economic ID must be 11–12 digits.');
    }
    if (!isValidNationalCode(out.managerNationalCode)) throw validationError('managerNationalCode', "Please enter a valid manager's national code.");
    return out;
  }

  private async toList(r: Merchant): Promise<MerchantListItem> {
    return {
      id: r.id,
      displayName: r.displayName,
      entityType: r.entityType,
      managerName: r.managerName,
      contactNumber: r.contactNumber,
      nationalId: r.nationalId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }

  list(q: MerchantQuery): Promise<Page<MerchantListItem>> {
    const qb = this.ds.manager.createQueryBuilder(Merchant, 'm');
    if (q.status) qb.andWhere('m.status = :status', { status: q.status });
    if (q.entityType) qb.andWhere('m.entityType = :et', { et: q.entityType });
    if (q.q) {
      qb.andWhere('(m.displayName ILIKE :q OR m.legalName ILIKE :q OR m.nationalId = :exact OR m.managerName ILIKE :q)', {
        q: `%${q.q}%`,
        exact: q.q,
      });
    }
    return paginate(qb, 'm', q, (rows) => Promise.all(rows.map((r) => this.toList(r))));
  }

  async get(id: string): Promise<MerchantDetail> {
    const r = await this.ds.manager.findOne(Merchant, { where: { id } });
    if (!r) throw notFound('Merchant');
    const keys = await this.ds.manager.find(MerchantApiKey, { where: { merchantId: id }, order: { createdAt: 'DESC' } });
    return {
      id: r.id,
      displayName: r.displayName,
      entityType: r.entityType,
      legalName: r.legalName,
      nationalId: r.nationalId,
      economicId: r.economicId,
      managerName: r.managerName,
      managerNationalCode: r.managerNationalCode,
      contactNumber: r.contactNumber,
      websiteUrl: r.websiteUrl,
      officeAddress: r.officeAddress,
      iban: r.iban,
      contractFileId: r.contractFileId,
      contractUrl: this.files.urlFor(r.contractFileId, 'Contract'),
      merchantSettlementPlanId: r.merchantSettlementPlanId,
      planNumber: await this.plans.planNumber('merchant', r.merchantSettlementPlanId),
      status: r.status,
      returnUrlDomains: r.returnUrlDomains,
      webhookUrl: r.webhookUrl,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      apiKeys: keys.map((k) => ({
        keyId: k.keyId,
        status: k.status,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
      invoiceSummaries: await this.invoices.summaries('Merchant', id),
      recentWebhookEvents: await this.webhooks.recentFor(id),
    };
  }

  private duplicate(e: unknown): never {
    if (isUniqueViolation(e, 'uq_merchant_national_id')) {
      throw new AppError('DUPLICATE_ENTITY', 'A merchant with this national ID already exists.', { field: 'nationalId' });
    }
    if (isUniqueViolation(e, 'uq_merchant_economic_id')) {
      throw new AppError('DUPLICATE_ENTITY', 'A merchant with this economic ID already exists.', { field: 'economicId' });
    }
    throw e;
  }

  async create(input: MerchantInput): Promise<MerchantDetail> {
    const data = this.normalise(input);
    const id = newId('mer');
    try {
      await this.ds.transaction(async (m) => {
        await this.plans.assertAssignable('merchant', data.merchantSettlementPlanId, m);
        await this.files.commit(m, data.contractFileId, 'Contract');
        await m.insert(Merchant, { id, ...data, version: 1 });
      });
    } catch (e) {
      this.duplicate(e);
    }
    return this.get(id);
  }

  async update(id: string, patch: Partial<MerchantInput>, expectedVersion: number): Promise<{ before: MerchantDetail; after: MerchantDetail }> {
    const before = await this.get(id);
    try {
      await this.ds.transaction(async (m) => {
        const current = await m.findOne(Merchant, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!current) throw notFound('Merchant');
        if (current.version !== expectedVersion) throw new AppError('STATE_CHANGED', 'This record changed. Reload to see the latest.');
        const merged = this.normalise({
          displayName: patch.displayName ?? current.displayName,
          entityType: patch.entityType ?? current.entityType,
          legalName: patch.legalName ?? current.legalName,
          nationalId: patch.nationalId ?? current.nationalId,
          economicId: patch.economicId !== undefined ? patch.economicId : current.economicId,
          managerName: patch.managerName ?? current.managerName,
          managerNationalCode: patch.managerNationalCode ?? current.managerNationalCode,
          contactNumber: patch.contactNumber ?? current.contactNumber,
          websiteUrl: patch.websiteUrl ?? current.websiteUrl,
          officeAddress: patch.officeAddress ?? current.officeAddress,
          iban: patch.iban ?? current.iban,
          contractFileId: patch.contractFileId !== undefined ? patch.contractFileId : current.contractFileId,
          merchantSettlementPlanId: patch.merchantSettlementPlanId ?? current.merchantSettlementPlanId,
          status: patch.status ?? current.status,
          returnUrlDomains: patch.returnUrlDomains ?? current.returnUrlDomains,
          webhookUrl: patch.webhookUrl !== undefined ? patch.webhookUrl : current.webhookUrl,
        });
        if (merged.merchantSettlementPlanId !== current.merchantSettlementPlanId) {
          await this.plans.assertAssignable('merchant', merged.merchantSettlementPlanId, m);
        }
        await this.files.commit(m, merged.contractFileId, 'Contract', current.contractFileId);
        const r = await m.update(Merchant, { id, version: expectedVersion }, { ...merged, version: expectedVersion + 1 });
        if (!r.affected) throw stateChanged();
      });
    } catch (e) {
      this.duplicate(e);
    }
    return { before, after: await this.get(id) };
  }

  /* ─────────── API keys (FR-093) ─────────── */

  async createKey(merchantId: string): Promise<CreateApiKeyResponse> {
    return this.ds.transaction(async (m) => {
      const merchant = await m.findOne(Merchant, { where: { id: merchantId }, lock: { mode: 'pessimistic_write' } });
      if (!merchant) throw notFound('Merchant');
      const active = await m.count(MerchantApiKey, { where: { merchantId, status: 'Active' } });
      if (active >= MAX_ACTIVE_KEYS) {
        throw new AppError('API_KEY_LIMIT', 'A merchant can have at most 2 active keys. Revoke one first.');
      }
      const keyId = `mk_${this.crypto.randomToken(12)}`;
      const secret = this.crypto.randomToken(32);
      await m.insert(MerchantApiKey, { id: newId('key'), merchantId, keyId, secretEnc: this.crypto.encrypt(secret), status: 'Active' });
      return { keyId, secret };
    });
  }

  /** Seeds/demo only: registers a key with a known secret. */
  async createKeyWithSecret(merchantId: string, keyId: string, secret: string): Promise<void> {
    const exists = await this.ds.manager.findOne(MerchantApiKey, { where: { keyId } });
    if (exists) return;
    await this.ds.manager.insert(MerchantApiKey, { id: newId('key'), merchantId, keyId, secretEnc: this.crypto.encrypt(secret), status: 'Active' });
  }

  async revokeKey(merchantId: string, keyId: string): Promise<void> {
    const r = await this.ds.manager.update(MerchantApiKey, { merchantId, keyId, status: 'Active' }, { status: 'Revoked', revokedAt: new Date() });
    if (!r.affected) throw notFound('API key');
  }
}
