import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  addDaysIso,
  normaliseBalance,
  tehranDateOf,
  type InquiryKind,
  type InquiryOutcome,
  type Page,
  type ProviderTransactionListItem,
  type ReservationDto,
} from '@bajet/contracts';
import { paginate } from '../../shared/database/pagination';
import { dbNow } from '../../shared/database/tx';
import { newId } from '../../shared/util/ids';
import { AlertService } from '../../shared/util/alerts';
import { JobsGate } from '../../shared/util/jobs-gate';
import { MAX_BACKGROUND_ATTEMPTS, retryDelayMs, sleep, TimeoutError } from '../../shared/util/async';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import { ProviderGatewayService } from '../credit-providers/provider-gateway.service';
import { CreditProvidersService } from '../credit-providers/credit-providers.service';
import type { ConsumerKey, OperationResult, StatusResult } from '../credit-providers/adapters/provider-adapter';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CreditInquiry, CreditInquiryResult, CreditReservation, ProviderTransaction } from './wallet.entity';

export interface InquiryProvider {
  id: string;
  key: ConsumerKey | null;
}

export interface InquiryView {
  inquiry: CreditInquiry;
  results: CreditInquiryResult[];
}

export interface ProviderTxQuery {
  cursor?: string;
  limit?: number;
  providerId?: string;
  type?: string;
  status?: string;
  orderId?: string;
  reference?: string;
  stuck?: boolean;
  from?: string;
  to?: string;
}

export interface WalletHooks {
  /** Inside the transaction that marks the reservation Allocated. */
  onAllocationConfirmed?: (m: EntityManager, reservation: CreditReservation) => Promise<void>;
  onAllocationExhausted?: (m: EntityManager, reservation: CreditReservation) => Promise<void>;
  onReversalFinal?: (m: EntityManager, ptx: ProviderTransaction, outcome: 'Confirmed' | 'Rejected' | 'Unconfirmed') => Promise<void>;
}

const LOCK_TIMEOUT = '15s';
const STATUS_QUERY_TRIES = 3;

/**
 * The consumer's credit lines at providers ("wallet"): inquiries, reservations and
 * provider transactions. The provider is the balance authority (D-12); Bâjet adds
 * a per-(consumer, provider) lock and keeps no shadow balances.
 */
@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new Logger(WalletService.name);
  private hooks: WalletHooks = {};

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly gateway: ProviderGatewayService,
    private readonly providers: CreditProvidersService,
    private readonly settings: SystemSettingsService,
    private readonly ledger: LedgerService,
    private readonly recon: ReconciliationService,
    private readonly alerts: AlertService,
    private readonly jobs: JobsGate,
  ) {}

  onModuleInit(): void {
    this.ledger.registerInvariant(async (m) => {
      const rows: { s: string }[] = await m.query(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM credit_reservation
          WHERE status = 'AllocationPending' OR (status = 'NeedsReconciliation' AND recon_direction = 'Allocation')`,
      );
      return [{ name: 'ALLOCATION_SUSPENSE', expected: Number(rows[0].s), actual: await this.ledger.balance(Accounts.allocationSuspense, m) }];
    });
    this.recon.registerRedrive(['ALLOCATION_UNCONFIRMED', 'RELEASE_UNCONFIRMED', 'REVERSAL_UNCONFIRMED'], async (item) => {
      const ptxId = item.refs.providerTransactionId;
      if (!ptxId) return false;
      await this.ds.query(
        `UPDATE provider_transaction SET status = 'Pending', attempts = 0, next_attempt_at = now(), updated_at = now()
          WHERE id = $1 AND status IN ('Pending', 'Unknown')`,
        [ptxId],
      );
      await this.processPtx(ptxId, { redrive: true });
      const ptx = await this.ds.manager.findOne(ProviderTransaction, { where: { id: ptxId } });
      return ptx?.status === 'Confirmed';
    });
    this.recon.registerDaily(() => this.reconcileStatements());
  }

  registerHooks(h: WalletHooks): void {
    this.hooks = { ...this.hooks, ...h };
  }

  /* ─────────── Credit inquiry (FR-030) ─────────── */

  async inquiryCount(orderId: string, kinds: InquiryKind[]): Promise<number> {
    return this.ds.manager.count(CreditInquiry, { where: { orderId, kind: In(kinds) } });
  }

  async startInquiry(orderId: string, kind: InquiryKind, providerIds: string[]): Promise<CreditInquiry> {
    return this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`inquiry:${orderId}`]);
      const rows: { n: number }[] = await m.query(`SELECT COALESCE(MAX(attempt_no), 0) + 1 AS n FROM credit_inquiry WHERE order_id = $1`, [orderId]);
      const inq = m.create(CreditInquiry, {
        id: newId('inq'),
        orderId,
        attemptNo: Number(rows[0].n),
        kind,
        status: 'InProgress',
        providerCount: providerIds.length,
        providerIds,
        finishedAt: null,
      });
      await m.insert(CreditInquiry, inq);
      return inq;
    });
  }

  private async saveResult(inquiryId: string, providerId: string, outcome: InquiryOutcome, amount: number | null, latencyMs: number): Promise<void> {
    await this.ds.query(
      `INSERT INTO credit_inquiry_result (id, inquiry_id, provider_id, outcome, available_amount, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (inquiry_id, provider_id) DO NOTHING`,
      [newId('iqr'), inquiryId, providerId, outcome, amount, latencyMs],
    );
  }

  /**
   * Parallel inquiry with one deadline for all providers. Each result is stored as it
   * arrives; answers after the deadline are marked `Late` and ignored.
   */
  async runInquiry(inquiry: CreditInquiry, providers: InquiryProvider[], timeoutMs: number): Promise<CreditInquiryResult[]> {
    const started = Date.now();
    await Promise.all(
      providers.map(async (p) => {
        if (!p.key) {
          await this.saveResult(inquiry.id, p.id, 'NoAccount', null, 0);
          return;
        }
        const call = this.gateway.inquire(p.id, p.key, Math.max(timeoutMs * 4, 30_000));
        const deadline = sleep(Math.max(0, timeoutMs - (Date.now() - started))).then(() => 'deadline' as const);
        let settled = false;
        const outcome = await Promise.race([
          call.then((r) => ({ r })).catch((e: unknown) => ({ e })),
          deadline,
        ]);
        if (outcome === 'deadline') {
          await this.saveResult(inquiry.id, p.id, 'Timeout', null, Date.now() - started);
          void call
            .then(async () => {
              if (settled) return;
              await this.ds.query(`UPDATE credit_inquiry_result SET outcome = 'Late' WHERE inquiry_id = $1 AND provider_id = $2 AND outcome = 'Timeout'`, [inquiry.id, p.id]);
            })
            .catch(() => undefined);
          return;
        }
        settled = true;
        const latency = Date.now() - started;
        if ('e' in outcome) {
          await this.saveResult(inquiry.id, p.id, outcome.e instanceof TimeoutError ? 'Timeout' : 'Error', null, latency);
        } else if (outcome.r.kind === 'NoAccount') {
          await this.saveResult(inquiry.id, p.id, 'NoAccount', null, latency);
        } else {
          await this.saveResult(inquiry.id, p.id, 'Ok', normaliseBalance(outcome.r.availableAmount), latency);
        }
      }),
    );
    await this.ds.manager.update(CreditInquiry, { id: inquiry.id }, { status: 'Finished', finishedAt: new Date() });
    return this.ds.manager.find(CreditInquiryResult, { where: { inquiryId: inquiry.id } });
  }

  /**
   * Current credit per provider: the latest Initial/Retry inquiry, overridden by any
   * later Recheck (confirm-time re-check) results.
   */
  async currentCredit(orderId: string): Promise<{ base: InquiryView | null; byProvider: Map<string, CreditInquiryResult> }> {
    const base = await this.latestInquiry(orderId, ['Initial', 'Retry']);
    const byProvider = new Map<string, CreditInquiryResult>();
    if (!base) return { base, byProvider };
    for (const r of base.results) byProvider.set(r.providerId, r);
    const rechecks = await this.ds.manager.find(CreditInquiry, { where: { orderId, kind: 'Recheck' }, order: { attemptNo: 'ASC' } });
    for (const rc of rechecks.filter((x) => x.attemptNo > base.inquiry.attemptNo)) {
      for (const r of await this.ds.manager.find(CreditInquiryResult, { where: { inquiryId: rc.id } })) byProvider.set(r.providerId, r);
    }
    return { base, byProvider };
  }

  /** Latest inquiry of the given kinds (Recheck inquiries replace the list only when credit changed). */
  async latestInquiry(orderId: string, kinds: InquiryKind[] = ['Initial', 'Retry', 'Recheck']): Promise<InquiryView | null> {
    const inquiry = await this.ds.manager.findOne(CreditInquiry, { where: { orderId, kind: In(kinds) }, order: { attemptNo: 'DESC' } });
    if (!inquiry) return null;
    return { inquiry, results: await this.ds.manager.find(CreditInquiryResult, { where: { inquiryId: inquiry.id } }) };
  }

  /** Finalises inquiries stuck `InProgress` (process restart): missing results → Timeout. */
  async finishStaleInquiries(olderThanMs: number): Promise<string[]> {
    const rows: { id: string; order_id: string }[] = await this.ds.query(
      `SELECT id, order_id FROM credit_inquiry WHERE status = 'InProgress' AND created_at < now() - make_interval(secs => $1)`,
      [olderThanMs / 1000],
    );
    for (const r of rows) {
      await this.ds.manager.update(CreditInquiry, { id: r.id, status: 'InProgress' }, { status: 'Finished', finishedAt: new Date() });
    }
    return rows.map((r) => r.order_id);
  }

  /* ─────────── Reservation (FR-040/041, BR-PRV-02/03) ─────────── */

  async createReservations(
    m: EntityManager,
    input: { orderId: string; consumerId: string; attemptNo: number; holdDeadlineAt: Date | null; allocations: { providerId: string; amount: number }[] },
  ): Promise<CreditReservation[]> {
    const out: CreditReservation[] = [];
    for (const a of input.allocations) {
      const res = m.create(CreditReservation, {
        id: newId('res'),
        orderId: input.orderId,
        providerId: a.providerId,
        consumerUserId: input.consumerId,
        attemptNo: input.attemptNo,
        amount: a.amount,
        status: 'Requested',
        reconDirection: null,
        providerReference: null,
        holdDeadlineAt: input.holdDeadlineAt,
        reversedAmount: 0,
        version: 1,
      });
      await m.insert(CreditReservation, res);
      await m.insert(ProviderTransaction, {
        id: newId('ptx'),
        orderId: input.orderId,
        reservationId: res.id,
        refundLegId: null,
        providerId: a.providerId,
        type: 'Reservation',
        amount: a.amount,
        status: 'Pending',
        attempts: 0,
        nextAttemptAt: null,
      });
      out.push(res);
    }
    return out;
  }

  reservationsOf(orderId: string, m: EntityManager = this.ds.manager): Promise<CreditReservation[]> {
    return m.find(CreditReservation, { where: { orderId }, order: { createdAt: 'ASC' } });
  }

  /** Runs `fn` while holding the (consumer, provider) advisory lock; waits ≤ 15 s. */
  private async withConsumerProviderLock<T>(consumerId: string, providerId: string, fn: () => Promise<T>): Promise<T | 'busy'> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
      try {
        await qr.query(`SELECT pg_advisory_lock(hashtext($1), hashtext($2))`, [consumerId, providerId]);
      } catch (e) {
        if ((e as { code?: string }).code === '55P03') return 'busy';
        throw e;
      }
      try {
        return await fn();
      } finally {
        await qr.query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [consumerId, providerId]);
      }
    } finally {
      await qr.query(`RESET lock_timeout`).catch(() => undefined);
      await qr.release();
    }
  }

  /** BR-PRV-03: status query up to 3× for an unknown outcome. */
  private async resolveUnknown(providerId: string, ref: string, timeoutMs: number): Promise<StatusResult | 'Unknown'> {
    for (let i = 0; i < STATUS_QUERY_TRIES; i++) {
      try {
        const s = await this.gateway.status(providerId, ref, timeoutMs);
        if (s === 'Confirmed' || s === 'Rejected') return s;
        if (s === 'NotFound') return 'NotFound';
      } catch {
        /* keep trying */
      }
      if (i < STATUS_QUERY_TRIES - 1) await sleep(200 * (i + 1));
    }
    return 'Unknown';
  }

  /**
   * Calls reserve for every `Requested` reservation of the attempt, in parallel, each
   * under its (consumer, provider) lock. Returns whether all ended `Reserved`.
   */
  async executeReservations(orderId: string, attemptNo: number, keyFor: (providerId: string) => Promise<ConsumerKey | null>): Promise<{ allReserved: boolean }> {
    const timeoutMs = await this.settings.get('providerCallTimeoutMs');
    const reservations = await this.ds.manager.find(CreditReservation, { where: { orderId, attemptNo, status: 'Requested' } });
    const ptxs = await this.ds.manager.find(ProviderTransaction, { where: { reservationId: In(reservations.map((r) => r.id)), type: 'Reservation' } });
    await Promise.all(
      reservations.map(async (res) => {
        const ptx = ptxs.find((p) => p.reservationId === res.id)!;
        const key = await keyFor(res.providerId);
        let result: OperationResult | 'busy' | 'unknown' | 'no-key';
        if (!key) result = 'no-key';
        else {
          result = await this.withConsumerProviderLock(res.consumerUserId, res.providerId, async () => {
            try {
              return await this.gateway.reserve(res.providerId, ptx.id, key, res.amount, timeoutMs);
            } catch {
              const s = await this.resolveUnknown(res.providerId, ptx.id, timeoutMs);
              if (s === 'Confirmed') return { status: 'Confirmed', providerReference: '' } as OperationResult;
              if (s === 'Rejected' || s === 'NotFound') return { status: 'Rejected', reason: 'STATUS_QUERY' } as OperationResult;
              return 'unknown' as const;
            }
          });
        }
        await this.ds.transaction(async (m) => {
          if (result !== 'busy' && result !== 'unknown' && result !== 'no-key' && result.status === 'Confirmed') {
            const r = await m.update(CreditReservation, { id: res.id, status: 'Requested' }, {
              status: 'Reserved', reservedAt: new Date(), providerReference: result.providerReference || null, version: () => 'version + 1',
            });
            await m.update(ProviderTransaction, { id: ptx.id }, { status: 'Confirmed', providerReference: result.providerReference || null, attempts: 1 });
            if (!r.affected) {
              // The order left the reservation step meanwhile: make sure the hold is released.
              await this.ensureRelease(m, res.id);
            }
            return;
          }
          const reason = result === 'busy' ? 'RESERVATION_BUSY' : result === 'unknown' ? 'UNKNOWN_OUTCOME' : result === 'no-key' ? 'NO_CONSUMER_KEY' : result.reason;
          if (result === 'unknown') {
            // Treated as failed; a release is sent (releasing an unknown ref must succeed).
            await m.update(ProviderTransaction, { id: ptx.id }, { status: 'Failed', lastError: reason, attempts: 1 });
            await m.update(CreditReservation, { id: res.id, status: 'Requested' }, { status: 'ReleasePending', version: () => 'version + 1' });
            await this.ensureRelease(m, res.id);
          } else {
            await m.update(ProviderTransaction, { id: ptx.id }, { status: 'Failed', lastError: reason, attempts: 1 });
            await m.update(CreditReservation, { id: res.id, status: 'Requested' }, { status: 'Failed', version: () => 'version + 1' });
          }
        });
      }),
    );
    const after = await this.ds.manager.find(CreditReservation, { where: { orderId, attemptNo } });
    return { allReserved: after.length > 0 && after.every((r) => r.status === 'Reserved') };
  }

  /* ─────────── Release / allocation / reversal ─────────── */

  private async ensureRelease(m: EntityManager, reservationId: string): Promise<string | null> {
    const res = await m.findOne(CreditReservation, { where: { id: reservationId } });
    if (!res) return null;
    const existing = await m.findOne(ProviderTransaction, { where: { reservationId, type: 'Release', status: In(['Pending', 'Unknown', 'Confirmed']) } });
    if (existing) return existing.id;
    const id = newId('ptx');
    await m.insert(ProviderTransaction, {
      id, orderId: res.orderId, reservationId, refundLegId: null, providerId: res.providerId, type: 'Release', amount: res.amount,
      status: 'Pending', attempts: 0, nextAttemptAt: new Date(),
    });
    return id;
  }

  /**
   * On Cancelled/Expired/Failed or re-inquiry: every non-terminal reservation →
   * ReleasePending with a release transaction (outbox). Returns ptx ids to dispatch.
   */
  async releaseAll(m: EntityManager, orderId: string): Promise<string[]> {
    const rows = await m.find(CreditReservation, { where: { orderId, status: In(['Requested', 'Reserved']) } });
    const ids: string[] = [];
    for (const r of rows) {
      const u = await m.update(CreditReservation, { id: r.id, status: r.status }, { status: 'ReleasePending', version: () => 'version + 1' });
      if (!u.affected) continue;
      if (r.status === 'Requested') {
        await m.update(ProviderTransaction, { reservationId: r.id, type: 'Reservation', status: 'Pending' }, { status: 'Failed', lastError: 'ORDER_LEFT_RESERVATION' });
      }
      const id = await this.ensureRelease(m, r.id);
      if (id) ids.push(id);
    }
    return ids;
  }

  /** Reserved → AllocationPending with an allocation transaction (FR-050). */
  async prepareAllocations(m: EntityManager, orderId: string): Promise<string[]> {
    const rows = await m.find(CreditReservation, { where: { orderId, status: 'Reserved' } });
    const ids: string[] = [];
    for (const r of rows) {
      await m.update(CreditReservation, { id: r.id, status: 'Reserved' }, { status: 'AllocationPending', version: () => 'version + 1' });
      const id = newId('ptx');
      await m.insert(ProviderTransaction, {
        id, orderId, reservationId: r.id, refundLegId: null, providerId: r.providerId, type: 'Allocation', amount: r.amount,
        status: 'Pending', attempts: 0, nextAttemptAt: new Date(Date.now() + 60_000),
      });
      ids.push(id);
    }
    return ids;
  }

  async createReversal(m: EntityManager, input: { orderId: string; reservationId: string; refundLegId: string; providerId: string; amount: number }): Promise<string> {
    const id = newId('ptx');
    await m.insert(ProviderTransaction, {
      id, orderId: input.orderId, reservationId: input.reservationId, refundLegId: input.refundLegId, providerId: input.providerId,
      type: 'Reversal', amount: input.amount, status: 'Pending', attempts: 0, nextAttemptAt: new Date(),
    });
    return id;
  }

  /** Dispatch after commit; failures are retried by the background job. */
  async dispatch(ptxIds: string[]): Promise<void> {
    await Promise.all(ptxIds.map((id) => this.processPtx(id).catch((e: unknown) => this.logger.error(`ptx ${id}: ${(e as Error).message}`))));
  }

  private async applyConfirmed(ptx: ProviderTransaction, providerReference: string | null): Promise<void> {
    await this.ds.transaction(async (m) => {
      const u = await m.update(ProviderTransaction, { id: ptx.id, status: In(['Pending', 'Unknown']) }, { status: 'Confirmed', providerReference, nextAttemptAt: null, lastError: null });
      if (!u.affected) return;
      if (ptx.type === 'Allocation' && ptx.reservationId) {
        const r = await m.update(
          CreditReservation,
          { id: ptx.reservationId, status: In(['AllocationPending', 'NeedsReconciliation']) },
          { status: 'Allocated', allocatedAt: new Date(), reconDirection: null, version: () => 'version + 1' },
        );
        if (r.affected) {
          const res = await m.findOneOrFail(CreditReservation, { where: { id: ptx.reservationId } });
          await this.recon.autoResolve(`ALLOCATION_UNCONFIRMED:${ptx.id}`, 'Allocation confirmed.', m);
          await this.hooks.onAllocationConfirmed?.(m, res);
        }
      } else if (ptx.type === 'Release' && ptx.reservationId) {
        await m.update(
          CreditReservation,
          { id: ptx.reservationId, status: In(['ReleasePending', 'NeedsReconciliation', 'Failed']) },
          { status: 'Released', releasedAt: new Date(), reconDirection: null, version: () => 'version + 1' },
        );
        await this.recon.autoResolve(`RELEASE_UNCONFIRMED:${ptx.id}`, 'Release confirmed.', m);
      } else if (ptx.type === 'Reversal' && ptx.reservationId) {
        await m.query(`UPDATE credit_reservation SET reversed_amount = reversed_amount + $2, updated_at = now() WHERE id = $1`, [ptx.reservationId, ptx.amount]);
        await this.recon.autoResolve(`REVERSAL_UNCONFIRMED:${ptx.id}`, 'Reversal confirmed.', m);
        await this.hooks.onReversalFinal?.(m, ptx, 'Confirmed');
      }
    });
  }

  private async applyRejected(ptx: ProviderTransaction, reason: string): Promise<void> {
    await this.ds.transaction(async (m) => {
      const u = await m.update(ProviderTransaction, { id: ptx.id, status: In(['Pending', 'Unknown']) }, { status: 'Failed', lastError: reason.slice(0, 300), nextAttemptAt: null });
      if (!u.affected) return;
      if (ptx.type === 'Reversal') {
        await this.hooks.onReversalFinal?.(m, ptx, 'Rejected');
        return;
      }
      if (ptx.reservationId) {
        const direction = ptx.type === 'Allocation' ? 'Allocation' : 'Release';
        await m.update(CreditReservation, { id: ptx.reservationId }, { status: 'NeedsReconciliation', reconDirection: direction, version: () => 'version + 1' });
        await this.recon.open(
          {
            type: ptx.type === 'Allocation' ? 'ALLOCATION_UNCONFIRMED' : 'RELEASE_UNCONFIRMED',
            severity: 'High',
            orderId: ptx.orderId,
            refs: { providerTransactionId: ptx.id, reservationId: ptx.reservationId, providerId: ptx.providerId },
            expectedAmount: ptx.amount,
          },
          m,
        );
        if (ptx.type === 'Allocation') {
          const res = await m.findOneOrFail(CreditReservation, { where: { id: ptx.reservationId } });
          await this.hooks.onAllocationExhausted?.(m, res);
        }
      }
    });
  }

  private async applyRetry(ptx: ProviderTransaction, error: string): Promise<void> {
    const attempts = ptx.attempts + 1;
    if (attempts < MAX_BACKGROUND_ATTEMPTS) {
      await this.ds.manager.update(ProviderTransaction, { id: ptx.id }, {
        status: 'Pending', attempts, nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts - 1)), lastError: error.slice(0, 300),
      });
      return;
    }
    // BR-RETRY-01 exhausted → NeedsReconciliation, item, alert.
    await this.ds.transaction(async (m) => {
      await m.update(ProviderTransaction, { id: ptx.id }, { status: 'Unknown', attempts, nextAttemptAt: null, lastError: error.slice(0, 300) });
      const type = ptx.type === 'Allocation' ? 'ALLOCATION_UNCONFIRMED' : ptx.type === 'Release' ? 'RELEASE_UNCONFIRMED' : 'REVERSAL_UNCONFIRMED';
      await this.recon.open(
        { type, severity: 'High', orderId: ptx.orderId, refs: { providerTransactionId: ptx.id, providerId: ptx.providerId }, expectedAmount: ptx.amount, dedupeKey: `${type}:${ptx.id}` },
        m,
      );
      if (ptx.type === 'Reversal') {
        await this.hooks.onReversalFinal?.(m, ptx, 'Unconfirmed');
      } else if (ptx.reservationId) {
        await m.update(CreditReservation, { id: ptx.reservationId }, {
          status: 'NeedsReconciliation', reconDirection: ptx.type === 'Allocation' ? 'Allocation' : 'Release', version: () => 'version + 1',
        });
        if (ptx.type === 'Allocation') {
          const res = await m.findOneOrFail(CreditReservation, { where: { id: ptx.reservationId } });
          await this.hooks.onAllocationExhausted?.(m, res);
        }
      }
    });
    this.alerts.raise('Operations', 'PROVIDER_OPERATION_EXHAUSTED', { providerTransactionId: ptx.id, type: ptx.type });
  }

  /** Executes one allocation/release/reversal attempt (idempotent by ptx id). */
  async processPtx(ptxId: string, opts: { redrive?: boolean } = {}): Promise<void> {
    const ptx = await this.ds.manager.findOne(ProviderTransaction, { where: { id: ptxId } });
    if (!ptx || (ptx.status !== 'Pending' && !(opts.redrive && ptx.status === 'Unknown'))) return;
    if (ptx.type === 'Reservation') return;
    const timeoutMs = await this.settings.get('providerCallTimeoutMs');
    let target: string | null = ptx.reservationId;
    if (ptx.type === 'Reversal') {
      const alloc = await this.ds.manager.findOne(ProviderTransaction, { where: { reservationId: ptx.reservationId ?? '', type: 'Allocation', status: 'Confirmed' } });
      target = alloc?.id ?? null;
    } else if (ptx.reservationId) {
      const rtx = await this.ds.manager.findOne(ProviderTransaction, { where: { reservationId: ptx.reservationId, type: 'Reservation' } });
      target = rtx?.id ?? ptx.reservationId;
    }
    let result: OperationResult;
    try {
      if (!target) throw new Error('No provider reference to act on');
      if (ptx.type === 'Allocation') result = await this.gateway.allocate(ptx.providerId, ptx.id, target, timeoutMs);
      else if (ptx.type === 'Release') result = await this.gateway.release(ptx.providerId, ptx.id, target, timeoutMs);
      else result = await this.gateway.reverse(ptx.providerId, ptx.id, target, ptx.amount, timeoutMs);
    } catch (e) {
      const s = await this.resolveUnknown(ptx.providerId, ptx.id, timeoutMs);
      if (s === 'Confirmed') return this.applyConfirmed(ptx, null);
      if (s === 'Rejected') return this.applyRejected(ptx, 'REJECTED');
      return this.applyRetry(ptx, (e as Error).message);
    }
    if (result.status === 'Confirmed') return this.applyConfirmed(ptx, result.providerReference);
    return this.applyRejected(ptx, result.reason);
  }

  async processDue(limit = 50): Promise<number> {
    const due: { id: string }[] = await this.ds.query(
      `SELECT id FROM provider_transaction
        WHERE status = 'Pending' AND type IN ('Allocation', 'Release', 'Reversal') AND next_attempt_at <= now()
        ORDER BY next_attempt_at LIMIT $1`,
      [limit],
    );
    await this.dispatch(due.map((d) => d.id));
    return due.length;
  }

  @Interval('provider-retries', 5000)
  async retryJob(): Promise<void> {
    await this.jobs.run('provider-retries', () => this.processDue());
  }

  /** FR-142: allocation suspense older than 24 h raises an alert. */
  @Interval('suspense-age', 3_600_000)
  async suspenseAgeJob(): Promise<void> {
    await this.jobs.run('suspense-age', async () => {
      const rows: { n: string; s: string }[] = await this.ds.query(
        `SELECT count(*) AS n, COALESCE(SUM(amount), 0) AS s FROM credit_reservation
          WHERE (status = 'AllocationPending' OR (status = 'NeedsReconciliation' AND recon_direction = 'Allocation'))
            AND updated_at < now() - interval '24 hours'`,
      );
      if (Number(rows[0].n) > 0) this.alerts.raise('Finance', 'ALLOCATION_SUSPENSE_AGED', { count: Number(rows[0].n), amount: Number(rows[0].s) });
    });
  }

  /* ─────────── Provider statement reconciliation (FR-141) ─────────── */

  async reconcileStatements(date?: string): Promise<void> {
    const day = date ?? addDaysIso(tehranDateOf(await dbNow(this.ds)), -1);
    for (const p of await this.providers.allIds()) {
      let lines;
      try {
        lines = await this.gateway.statement(p.id, day);
      } catch (e) {
        this.alerts.raise('Operations', 'PROVIDER_STATEMENT_UNAVAILABLE', { providerId: p.id, error: (e as Error).message });
        continue;
      }
      for (const line of lines) {
        const ptx = await this.ds.manager.findOne(ProviderTransaction, { where: { id: line.reference } });
        await this.recon.storeStatementLine({
          source: p.id, statementDate: day, reference: line.reference, operation: line.operation, state: line.state, amount: line.amount, matchedTxId: ptx?.id ?? null,
        });
        if (!ptx) {
          await this.recon.open({ type: 'PROVIDER_STATEMENT_MISMATCH', severity: 'Medium', refs: { providerId: p.id, reference: line.reference }, actualAmount: line.amount });
          continue;
        }
        if (line.operation === 'allocate' && line.state === 'Allocated' && ptx.status !== 'Confirmed') {
          await this.applyConfirmed(ptx, null); // E-36: auto-confirm and resolve
          continue;
        }
        if (line.operation === 'reserve' && line.state === 'Active' && ptx.reservationId) {
          const res = await this.ds.manager.findOne(CreditReservation, { where: { id: ptx.reservationId } });
          if (res && (res.status === 'Released' || res.status === 'Failed')) {
            // E-37: provider still holds what we released → re-send release as a new operation.
            const id = newId('ptx');
            await this.ds.manager.insert(ProviderTransaction, {
              id, orderId: res.orderId, reservationId: res.id, refundLegId: null, providerId: res.providerId, type: 'Release',
              amount: res.amount, status: 'Pending', attempts: 0, nextAttemptAt: new Date(),
            });
            await this.dispatch([id]);
          }
          continue;
        }
        if (line.amount !== ptx.amount && line.operation !== 'release') {
          await this.recon.open({
            type: 'AMOUNT_MISMATCH', severity: 'High', orderId: ptx.orderId,
            refs: { providerTransactionId: ptx.id, providerId: p.id }, expectedAmount: ptx.amount, actualAmount: line.amount,
          });
        }
      }
    }
  }

  /* ─────────── Views (FR-110/112/113) ─────────── */

  async reservationDtos(orderId: string): Promise<ReservationDto[]> {
    const rows = await this.reservationsOf(orderId);
    const names = await this.providers.names(rows.map((r) => r.providerId));
    return rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      providerName: names.get(r.providerId) ?? r.providerId,
      attemptNo: r.attemptNo,
      amount: r.amount,
      status: r.status,
      providerReference: r.providerReference,
      reservedAt: r.reservedAt?.toISOString() ?? null,
      allocatedAt: r.allocatedAt?.toISOString() ?? null,
      releasedAt: r.releasedAt?.toISOString() ?? null,
      reversedAmount: r.reversedAmount,
    }));
  }

  private async toPtxItems(rows: ProviderTransaction[]): Promise<ProviderTransactionListItem[]> {
    const names = await this.providers.names(rows.map((r) => r.providerId));
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      reservationId: r.reservationId,
      refundLegId: r.refundLegId,
      providerId: r.providerId,
      providerName: names.get(r.providerId) ?? r.providerId,
      type: r.type,
      amount: r.amount,
      status: r.status,
      providerReference: r.providerReference,
      attempts: r.attempts,
      nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
      lastError: r.lastError,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async ptxForOrder(orderId: string): Promise<ProviderTransactionListItem[]> {
    return this.toPtxItems(await this.ds.manager.find(ProviderTransaction, { where: { orderId }, order: { createdAt: 'ASC' } }));
  }

  listPtx(q: ProviderTxQuery): Promise<Page<ProviderTransactionListItem>> {
    const qb = this.ds.manager.createQueryBuilder(ProviderTransaction, 't');
    if (q.providerId) qb.andWhere('t.providerId = :p', { p: q.providerId });
    if (q.type) qb.andWhere('t.type = :type', { type: q.type });
    if (q.status) qb.andWhere('t.status = :status', { status: q.status });
    if (q.orderId) qb.andWhere('t.orderId = :o', { o: q.orderId });
    if (q.reference) qb.andWhere('(t.id = :ref OR t.providerReference = :ref)', { ref: q.reference });
    if (q.from) qb.andWhere('t.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('t.createdAt < :to', { to: q.to });
    if (q.stuck) {
      // FR-112: reservation Reserved/ReleasePending/AllocationPending older than paymentDeadlineAt + 5 min.
      qb.andWhere(
        `t.reservationId IN (SELECT r.id FROM credit_reservation r WHERE r.status IN ('Reserved', 'ReleasePending', 'AllocationPending')
           AND COALESCE(r.hold_deadline_at, r.created_at) + interval '5 minutes' < now())`,
      );
    }
    return paginate(qb, 't', q, (rows) => this.toPtxItems(rows));
  }

  async ptxDetail(id: string): Promise<(ProviderTransactionListItem & { callLog: { at: string; operation: string; outcome: string; latencyMs: number }[] }) | null> {
    const row = await this.ds.manager.findOne(ProviderTransaction, { where: { id } });
    if (!row) return null;
    const [item] = await this.toPtxItems([row]);
    const log = await this.gateway.callLog(id);
    return { ...item, callLog: log.map((l) => ({ at: l.createdAt.toISOString(), operation: l.operation, outcome: l.outcome, latencyMs: l.latencyMs })) };
  }

  /** Distinct providers funding each order (admin order list). */
  async providerCounts(orderIds: string[]): Promise<Map<string, number>> {
    if (!orderIds.length) return new Map();
    const rows: { order_id: string; n: string }[] = await this.ds.query(
      `SELECT order_id, count(DISTINCT provider_id) AS n FROM credit_reservation
        WHERE order_id = ANY($1) AND status IN ('Reserved', 'AllocationPending', 'Allocated', 'NeedsReconciliation') GROUP BY order_id`,
      [orderIds],
    );
    return new Map(rows.map((r) => [r.order_id, Number(r.n)]));
  }

  async orderIdsForProvider(providerId: string): Promise<string[]> {
    const rows: { order_id: string }[] = await this.ds.query(`SELECT DISTINCT order_id FROM credit_reservation WHERE provider_id = $1 LIMIT 10000`, [providerId]);
    return rows.map((r) => r.order_id);
  }

  async linkedProviders(consumerId: string): Promise<{ providerId: string; displayName: string; lastUsedAt: string }[]> {
    const rows: { provider_id: string; last: Date }[] = await this.ds.query(
      `SELECT provider_id, MAX(allocated_at) AS last FROM credit_reservation WHERE consumer_user_id = $1 AND status = 'Allocated' GROUP BY provider_id ORDER BY last DESC`,
      [consumerId],
    );
    const names = await this.providers.names(rows.map((r) => r.provider_id));
    return rows.map((r) => ({ providerId: r.provider_id, displayName: names.get(r.provider_id) ?? r.provider_id, lastUsedAt: new Date(r.last).toISOString() }));
  }
}
