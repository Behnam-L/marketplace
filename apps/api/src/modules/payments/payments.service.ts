import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  addDaysIso,
  rialToToman,
  tehranDateOf,
  tomanToRial,
  type BankTransactionDetail,
  type BankTransactionListItem,
  type Page,
  type PspReportImportResponse,
  type RedirectInstruction,
} from '@bajet/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { AppError, notFound } from '../../shared/errors/app-error';
import { paginate } from '../../shared/database/pagination';
import { dbNow, returnedRows } from '../../shared/database/tx';
import { newId } from '../../shared/util/ids';
import { AlertService } from '../../shared/util/alerts';
import { JobsGate } from '../../shared/util/jobs-gate';
import { MAX_BACKGROUND_ATTEMPTS, retryDelayMs, withTimeout } from '../../shared/util/async';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { BankCallLog, BankGateway, BankTransaction } from './payment.entity';
import { GatewayAdapter, InquiryResult, ParsedCallback, VerifyResult } from './gateways/gateway-adapter';
import { MockGatewayAdapter } from './gateways/mock-gateway.adapter';

const GATEWAY_TIMEOUT_MS = 10_000;

export type VerifyOutcome =
  | { kind: 'Success'; gatewayReference: string; cardMask: string | null }
  | { kind: 'Failed'; reason: string }
  | { kind: 'AmountMismatch'; paidAmountRial: number }
  | { kind: 'Unknown' };

export interface BankTxQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  type?: string;
  gatewayCode?: string;
  orderId?: string;
  reference?: string;
  from?: string;
  to?: string;
}

interface Hooks {
  onRefundFinal?: (m: EntityManager, btx: BankTransaction) => Promise<void>;
}

/**
 * Bank gateways and bank transactions (FR-042–045, FR-061, FR-111, FR-140,
 * BR-BANK). Knows nothing about orders: orchestration lives in checkout/orders.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly adapters = new Map<string, MockGatewayAdapter>();
  private hooks: Hooks = {};

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly ledger: LedgerService,
    private readonly recon: ReconciliationService,
    private readonly alerts: AlertService,
    private readonly jobs: JobsGate,
  ) {}

  onModuleInit(): void {
    this.recon.registerPspImporter((code, csv) => this.importCsv(code, csv));
    this.recon.registerDaily(() => this.dailyReconciliation());
    this.recon.registerRedrive(['BANK_REVERSAL_FAILED', 'LATE_PAYMENT'], async (item) => {
      const btxId = item.refs.bankTransactionId;
      if (!btxId) return false;
      await this.ds.query(
        `UPDATE bank_transaction SET status = 'ReversalPending', attempts = 0, next_attempt_at = now(), updated_at = now()
          WHERE id = $1 AND status IN ('ReversalPending', 'NeedsReconciliation')`,
        [btxId],
      );
      await this.processReversal(btxId);
      return (await this.get(btxId))?.status === 'Reversed';
    });
  }

  registerHooks(h: Hooks): void {
    this.hooks = { ...this.hooks, ...h };
  }

  /** Adapter per gateway code (the offline build uses the mock PSP for every gateway). */
  adapter(code: string, supportsReverse = true): MockGatewayAdapter {
    let a = this.adapters.get(code);
    if (!a) {
      a = new MockGatewayAdapter(code, this.config.publicApiUrl, supportsReverse);
      this.adapters.set(code, a);
    }
    return a;
  }

  callbackUrl(code: string): string {
    return `${this.config.publicApiUrl}/v1/callbacks/bank/${code}`;
  }

  private async gatewayRow(code: string): Promise<BankGateway | null> {
    return this.ds.manager.findOne(BankGateway, { where: { code } });
  }

  private async adapterFor(code: string): Promise<GatewayAdapter> {
    const row = await this.gatewayRow(code);
    return this.adapter(code, row?.supportsReverse ?? true);
  }

  /** BR-BANK-05: highest-priority healthy gateway (priority 1 = highest). */
  async selectGateway(): Promise<BankGateway | null> {
    const rows = await this.ds.manager.find(BankGateway, { where: { healthStatus: 'Healthy' }, order: { priority: 'ASC' } });
    return rows.find((g) => this.adapter(g.code, g.supportsReverse).isHealthy()) ?? null;
  }

  async anyHealthyGateway(): Promise<boolean> {
    return (await this.selectGateway()) !== null;
  }

  private async log(btxId: string, operation: string, outcome: string, detail: string | null, started: number): Promise<void> {
    await this.ds.manager
      .insert(BankCallLog, { id: newId('alr'), bankTransactionId: btxId, operation, outcome, detail: detail?.slice(0, 500) ?? null, latencyMs: Date.now() - started })
      .catch((e: unknown) => this.logger.warn(`bank call log failed: ${(e as Error).message}`));
  }

  get(id: string, m: EntityManager = this.ds.manager): Promise<BankTransaction | null> {
    return m.findOne(BankTransaction, { where: { id } });
  }

  forOrder(orderId: string, m: EntityManager = this.ds.manager): Promise<BankTransaction[]> {
    return m.find(BankTransaction, { where: { orderId }, order: { createdAt: 'ASC' } });
  }

  /** Payment transactions whose outcome is not yet known. */
  openPayments(orderId: string, m: EntityManager = this.ds.manager): Promise<BankTransaction[]> {
    return m.find(BankTransaction, { where: { orderId, type: 'Payment', status: In(['Pending', 'Authorized']) }, order: { createdAt: 'ASC' } });
  }

  /* ─────────── Initiation (FR-042) ─────────── */

  async createPayment(m: EntityManager, orderId: string, amount: number, gatewayCode: string): Promise<BankTransaction> {
    const btx = m.create(BankTransaction, {
      id: newId('btx'),
      orderId,
      refundLegId: null,
      type: 'Payment',
      gatewayCode,
      amount,
      status: 'Pending',
      isAuthoritative: false,
      attempts: 0,
      version: 1,
    });
    await m.insert(BankTransaction, btx);
    return btx;
  }

  /** Calls the gateway outside any transaction. Init error → `Failed(INIT_ERROR)` and 502. */
  async initiate(btxId: string): Promise<RedirectInstruction> {
    const btx = await this.get(btxId);
    if (!btx) throw notFound('Bank transaction');
    const adapter = await this.adapterFor(btx.gatewayCode);
    const started = Date.now();
    try {
      const r = await withTimeout(
        adapter.initiate({ ref: btx.id, amountRial: tomanToRial(btx.amount), callbackUrl: this.callbackUrl(btx.gatewayCode) }),
        GATEWAY_TIMEOUT_MS,
      );
      await this.ds.manager.update(BankTransaction, { id: btx.id, status: 'Pending' }, { gatewayToken: r.token });
      await this.log(btx.id, 'initiate', 'ok', null, started);
      return r.redirect;
    } catch (e) {
      await this.ds.manager.update(BankTransaction, { id: btx.id, status: 'Pending' }, { status: 'Failed', failureCode: 'INIT_ERROR', lastError: (e as Error).message.slice(0, 300) });
      await this.log(btx.id, 'initiate', 'error', (e as Error).message, started);
      throw new AppError('GATEWAY_ERROR', "We couldn't start your bank payment. Please try again.");
    }
  }

  /* ─────────── Callback, verify, inquiry (FR-043, BR-BANK) ─────────── */

  async parseCallback(gatewayCode: string, payload: Record<string, unknown>): Promise<ParsedCallback | null> {
    if (!(await this.gatewayRow(gatewayCode))) return null;
    return (await this.adapterFor(gatewayCode)).parseCallback(payload);
  }

  /**
   * Records a reported success: `Pending → Authorized`. A success reported for a
   * transaction that already failed/was cancelled is a late payment (→ reversal).
   * Returns the transaction state after the update.
   */
  async markAuthorized(btxId: string): Promise<'authorized' | 'late' | 'noop'> {
    const r = await this.ds.query(
      `UPDATE bank_transaction SET status = 'Authorized', authorized_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1 AND status = 'Pending' RETURNING id`,
      [btxId],
    );
    if (returnedRows(r).length) return 'authorized';
    const btx = await this.get(btxId);
    if (btx && (btx.status === 'Failed' || btx.status === 'Cancelled')) return 'late';
    return 'noop';
  }

  async markReported(btxId: string, reported: 'Failed' | 'Cancelled'): Promise<void> {
    await this.ds.manager.update(BankTransaction, { id: btxId, status: 'Pending' }, { status: reported, failureCode: `REPORTED_${reported.toUpperCase()}` });
  }

  /** Server-to-server verify; the payload is never trusted (BR-BANK-02). */
  async verify(btxId: string): Promise<VerifyOutcome> {
    const btx = await this.get(btxId);
    if (!btx || !btx.gatewayToken) return { kind: 'Failed', reason: 'NO_TOKEN' };
    const adapter = await this.adapterFor(btx.gatewayCode);
    const started = Date.now();
    let r: VerifyResult;
    try {
      r = await withTimeout(adapter.verify({ ref: btx.id, token: btx.gatewayToken }), GATEWAY_TIMEOUT_MS);
    } catch (e) {
      await this.ds.query(`UPDATE bank_transaction SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, [btxId, (e as Error).message.slice(0, 300)]);
      await this.log(btxId, 'verify', 'unknown', (e as Error).message, started);
      return { kind: 'Unknown' };
    }
    await this.log(btxId, 'verify', r.status, r.status === 'Failed' ? r.reason : r.gatewayReference, started);
    if (r.status === 'Failed') return { kind: 'Failed', reason: r.reason };
    if (r.amountRial !== tomanToRial(btx.amount)) return { kind: 'AmountMismatch', paidAmountRial: r.amountRial };
    return { kind: 'Success', gatewayReference: r.gatewayReference, cardMask: r.cardMask };
  }

  /** Applied inside the caller's transaction together with the order transition. */
  async applyVerifiedSuccess(m: EntityManager, btxId: string, v: { gatewayReference: string; cardMask: string | null }): Promise<void> {
    const r = await m.query(
      `UPDATE bank_transaction SET status = 'Success', is_authoritative = true, verified_at = now(), gateway_reference = $2, card_mask = $3,
         version = version + 1, updated_at = now() WHERE id = $1 AND status = 'Authorized' RETURNING id`,
      [btxId, v.gatewayReference, v.cardMask],
    );
    if (!returnedRows(r).length) throw new Error(`bank transaction ${btxId} not Authorized`);
  }

  async applyVerifyFailed(m: EntityManager, btxId: string, reason: string): Promise<void> {
    await m.update(BankTransaction, { id: btxId, status: In(['Authorized', 'Pending']) }, { status: 'Failed', failureCode: reason.slice(0, 40) });
  }

  async inquiry(btxId: string): Promise<InquiryResult | { status: 'Unknown' }> {
    const btx = await this.get(btxId);
    if (!btx?.gatewayToken) return { status: 'Unpaid' };
    const adapter = await this.adapterFor(btx.gatewayCode);
    const started = Date.now();
    try {
      const r = await withTimeout(adapter.inquiry({ ref: btx.id, token: btx.gatewayToken }), GATEWAY_TIMEOUT_MS);
      await this.log(btxId, 'inquiry', r.status, null, started);
      return r;
    } catch (e) {
      await this.log(btxId, 'inquiry', 'unknown', (e as Error).message, started);
      return { status: 'Unknown' };
    }
  }

  /** Gives up on an unresolved payment (bankPendingMaxSeconds) — treated as unpaid. */
  async markCancelled(m: EntityManager, btxId: string, code: string): Promise<void> {
    await m.update(BankTransaction, { id: btxId, status: In(['Pending']) }, { status: 'Cancelled', failureCode: code });
  }

  /* ─────────── Reversal (BR-BANK-03/04) ─────────── */

  /** Marks a non-claimable / unknown success for reversal. Dispatch with `processReversal` after commit. */
  async startReversal(m: EntityManager, btxId: string, reason: string): Promise<boolean> {
    const r = await m.query(
      `UPDATE bank_transaction SET status = 'ReversalPending', failure_code = $2, attempts = 0, next_attempt_at = now(),
         version = version + 1, updated_at = now()
        WHERE id = $1 AND status IN ('Pending', 'Authorized', 'Failed', 'Cancelled') RETURNING id`,
      [btxId, reason.slice(0, 40)],
    );
    return returnedRows(r).length > 0;
  }

  async processReversal(btxId: string): Promise<void> {
    const btx = await this.get(btxId);
    if (!btx || btx.status !== 'ReversalPending') return;
    const row = await this.gatewayRow(btx.gatewayCode);
    if (!row?.supportsReverse) {
      // PSP auto-reverses unverified payments; confirm via the settlement report.
      await this.ds.manager.update(BankTransaction, { id: btxId }, { nextAttemptAt: null });
      await this.recon.open({
        type: 'LATE_PAYMENT',
        severity: 'Medium',
        orderId: btx.orderId,
        refs: { bankTransactionId: btx.id, gatewayCode: btx.gatewayCode },
        expectedAmount: btx.amount,
      });
      return;
    }
    const adapter = await this.adapterFor(btx.gatewayCode);
    const started = Date.now();
    try {
      await withTimeout(adapter.reverse({ ref: btx.id, token: btx.gatewayToken ?? '' }), GATEWAY_TIMEOUT_MS);
      await this.ds.manager.update(BankTransaction, { id: btxId, status: 'ReversalPending' }, { status: 'Reversed', nextAttemptAt: null, lastError: null });
      await this.log(btxId, 'reverse', 'ok', null, started);
    } catch (e) {
      await this.log(btxId, 'reverse', 'error', (e as Error).message, started);
      const attempts = btx.attempts + 1;
      if (attempts >= MAX_BACKGROUND_ATTEMPTS) {
        await this.ds.manager.update(BankTransaction, { id: btxId }, { status: 'NeedsReconciliation', attempts, nextAttemptAt: null, lastError: (e as Error).message.slice(0, 300) });
        await this.recon.open({ type: 'BANK_REVERSAL_FAILED', severity: 'High', orderId: btx.orderId, refs: { bankTransactionId: btx.id }, expectedAmount: btx.amount });
      } else {
        await this.ds.manager.update(BankTransaction, { id: btxId }, {
          attempts,
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts - 1)),
          lastError: (e as Error).message.slice(0, 300),
        });
      }
    }
  }

  /* ─────────── Gateway refunds (FR-071 cash leg) ─────────── */

  async gatewaySupportsRefund(code: string): Promise<boolean> {
    return (await this.gatewayRow(code))?.supportsRefund ?? false;
  }

  async createRefund(m: EntityManager, input: { orderId: string; refundLegId: string; amount: number; gatewayCode: string }): Promise<BankTransaction> {
    const btx = m.create(BankTransaction, {
      id: newId('btx'),
      orderId: input.orderId,
      refundLegId: input.refundLegId,
      type: 'Refund',
      gatewayCode: input.gatewayCode,
      amount: input.amount,
      status: 'Pending',
      isAuthoritative: false,
      attempts: 0,
      nextAttemptAt: new Date(),
      version: 1,
    });
    await m.insert(BankTransaction, btx);
    return btx;
  }

  /** Executes a refund transaction; retries with backoff; final outcome goes to the refunds hook. */
  async processRefund(btxId: string): Promise<void> {
    const btx = await this.get(btxId);
    if (!btx || btx.type !== 'Refund' || btx.status !== 'Pending') return;
    const original = btx.orderId
      ? await this.ds.manager.findOne(BankTransaction, { where: { orderId: btx.orderId, isAuthoritative: true } })
      : null;
    const adapter = await this.adapterFor(btx.gatewayCode);
    const started = Date.now();
    let final: 'Success' | 'Failed' | null = null;
    let reference: string | null = null;
    try {
      const r = await withTimeout(
        adapter.refund({ ref: btx.id, amountRial: tomanToRial(btx.amount), originalReference: original?.gatewayReference ?? null }),
        GATEWAY_TIMEOUT_MS,
      );
      await this.log(btxId, 'refund', r.status, r.status === 'Success' ? r.gatewayReference : r.reason, started);
      final = r.status;
      reference = r.status === 'Success' ? r.gatewayReference : null;
    } catch (e) {
      await this.log(btxId, 'refund', 'error', (e as Error).message, started);
      const attempts = btx.attempts + 1;
      if (attempts >= MAX_BACKGROUND_ATTEMPTS) final = 'Failed';
      else {
        await this.ds.manager.update(BankTransaction, { id: btxId }, {
          attempts, nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts - 1)), lastError: (e as Error).message.slice(0, 300),
        });
        return;
      }
    }
    await this.ds.transaction(async (m) => {
      const r = await m.update(BankTransaction, { id: btxId, status: 'Pending' }, {
        status: final!, gatewayReference: reference, verifiedAt: final === 'Success' ? new Date() : null, nextAttemptAt: null,
      });
      if (!r.affected) return;
      await this.hooks.onRefundFinal?.(m, (await this.get(btxId, m))!);
    });
  }

  /** Background retries for reversals and refunds. */
  async processDue(): Promise<void> {
    const due: { id: string; type: string; status: string }[] = await this.ds.query(
      `SELECT id, type, status FROM bank_transaction
        WHERE next_attempt_at <= now() AND ((status = 'ReversalPending') OR (type = 'Refund' AND status = 'Pending'))
        ORDER BY next_attempt_at LIMIT 50`,
    );
    for (const d of due) {
      if (d.status === 'ReversalPending') await this.processReversal(d.id);
      else await this.processRefund(d.id);
    }
  }

  @Interval('bank-retries', 5000)
  async retryJob(): Promise<void> {
    await this.jobs.run('bank-retries', () => this.processDue());
  }

  /* ─────────── PSP reconciliation (FR-140, BR-LED-08) ─────────── */

  private async matchLine(gatewayCode: string, source: string, line: { reference: string; amountRial: number; feeRial: number; date: string }): Promise<'matched' | 'item'> {
    const amount = rialToToman(line.amountRial);
    const fee = rialToToman(line.feeRial);
    if (await this.recon.pspLineExists(gatewayCode, line.reference)) return 'matched';
    const btx = await this.ds.manager.findOne(BankTransaction, { where: { gatewayCode, gatewayReference: line.reference, type: 'Payment' } });
    const stored = await this.recon.storePspLine({
      source, gatewayCode, reportDate: line.date, reference: line.reference, amount, fee, matchedTxId: btx?.status === 'Success' ? btx.id : null,
    });
    if (!stored) return 'matched';
    if (!btx || btx.status !== 'Success') {
      await this.ds.transaction((m) =>
        this.ledger.post(m, {
          eventType: 'UnallocatedCash',
          sourceType: 'PspSettlementLine',
          sourceId: stored.id,
          lines: [{ account: Accounts.pspClearing(gatewayCode), debit: amount }, { account: Accounts.unallocatedCash, credit: amount }],
        }),
      );
      await this.recon.open({
        type: 'CASH_WITHOUT_ORDER',
        severity: 'High',
        orderId: btx?.orderId ?? null,
        refs: { gatewayReference: line.reference, gatewayCode, ...(btx ? { bankTransactionId: btx.id } : {}) },
        actualAmount: amount,
      });
      return 'item';
    }
    if (btx.amount !== amount) {
      await this.recon.open({
        type: 'AMOUNT_MISMATCH',
        severity: 'High',
        orderId: btx.orderId,
        refs: { gatewayReference: line.reference, bankTransactionId: btx.id },
        expectedAmount: btx.amount,
        actualAmount: amount,
      });
      return 'item';
    }
    await this.ds.transaction((m) =>
      this.ledger.post(m, {
        eventType: 'PspSettlementMatched',
        sourceType: 'PspSettlementLine',
        sourceId: stored.id,
        lines: [
          { account: Accounts.bankOperating, debit: amount - fee },
          { account: Accounts.pspFeeExpense, debit: fee },
          { account: Accounts.pspClearing(gatewayCode), credit: amount },
        ],
      }),
    );
    return 'matched';
  }

  /** CSV: header row, then `reference,amount_rial,fee_rial,date`. */
  async importCsv(gatewayCode: string, csv: string): Promise<PspReportImportResponse> {
    if (!(await this.gatewayRow(gatewayCode))) throw new AppError('VALIDATION_ERROR', 'Unknown gateway.', { fields: [{ field: 'gatewayCode', message: 'Unknown gateway.' }] });
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let imported = 0;
    let matched = 0;
    let itemsCreated = 0;
    for (const [i, l] of lines.entries()) {
      if (i === 0 && /reference/i.test(l)) continue;
      const [reference, amountRial, feeRial, date] = l.split(',').map((c) => c.trim());
      if (!reference || !/^\d+$/.test(amountRial ?? '') || !/^\d*$/.test(feeRial ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
        throw new AppError('VALIDATION_ERROR', `Invalid CSV line ${i + 1}.`, { fields: [{ field: 'file', message: `Line ${i + 1} is invalid.` }] });
      }
      imported++;
      const r = await this.matchLine(gatewayCode, `csv:${gatewayCode}`, { reference, amountRial: Number(amountRial), feeRial: Number(feeRial || 0), date });
      if (r === 'matched') matched++;
      else itemsCreated++;
    }
    return { imported, matched, itemsCreated };
  }

  /** Daily: import yesterday's settlement report per gateway and flag missing successes (T+2). */
  async dailyReconciliation(): Promise<void> {
    const today = tehranDateOf(await dbNow(this.ds));
    const yesterday = addDaysIso(today, -1);
    const gateways = await this.ds.manager.find(BankGateway);
    for (const g of gateways) {
      try {
        const report = await this.adapter(g.code, g.supportsReverse).settlementReport(yesterday);
        for (const line of report) {
          await this.matchLine(g.code, g.code, { reference: line.gatewayReference, amountRial: line.amountRial, feeRial: line.feeRial, date: line.date });
        }
      } catch (e) {
        this.alerts.raise('Operations', 'PSP_REPORT_UNAVAILABLE', { gateway: g.code, error: (e as Error).message });
      }
    }
    const settled: { id: string; gateway_code: string; gateway_reference: string; order_id: string; amount: string }[] = await this.ds.query(
      `SELECT b.id, b.gateway_code, b.gateway_reference, b.order_id, b.amount FROM bank_transaction b
        WHERE b.type = 'Payment' AND b.status = 'Success' AND b.verified_at < now() - interval '2 days' AND b.verified_at > now() - interval '30 days'`,
    );
    for (const b of settled) {
      if (await this.recon.pspLineExists(b.gateway_code, b.gateway_reference)) continue;
      await this.recon.open({
        type: 'MISSING_IN_PSP_REPORT',
        severity: 'High',
        orderId: b.order_id,
        refs: { bankTransactionId: b.id, gatewayReference: b.gateway_reference },
        expectedAmount: Number(b.amount),
      });
    }
    // Late payments at gateways without reverse: absent from the report after T+2 → auto-reversed by the PSP.
    const autoReversed: { id: string; gateway_code: string; gateway_reference: string | null }[] = await this.ds.query(
      `SELECT id, gateway_code, gateway_reference FROM bank_transaction
        WHERE status = 'ReversalPending' AND next_attempt_at IS NULL AND updated_at < now() - interval '2 days'`,
    );
    for (const b of autoReversed) {
      if (b.gateway_reference && (await this.recon.pspLineExists(b.gateway_code, b.gateway_reference))) continue;
      await this.ds.manager.update(BankTransaction, { id: b.id, status: 'ReversalPending' }, { status: 'Reversed' });
      await this.recon.autoResolve(`LATE_PAYMENT:${b.id}`, 'Absent from PSP settlement after T+2: auto-reversed by the PSP.');
    }
  }

  /* ─────────── Admin views (FR-111) ─────────── */

  toListItem(b: BankTransaction): BankTransactionListItem {
    return {
      id: b.id,
      orderId: b.orderId,
      type: b.type,
      gatewayCode: b.gatewayCode,
      amount: b.amount,
      status: b.status,
      gatewayReference: b.gatewayReference,
      cardMask: b.cardMask,
      isAuthoritative: b.isAuthoritative,
      createdAt: b.createdAt.toISOString(),
    };
  }

  list(q: BankTxQuery): Promise<Page<BankTransactionListItem>> {
    const qb = this.ds.manager.createQueryBuilder(BankTransaction, 'b');
    if (q.status) qb.andWhere('b.status = :status', { status: q.status });
    if (q.type) qb.andWhere('b.type = :type', { type: q.type });
    if (q.gatewayCode) qb.andWhere('b.gatewayCode = :g', { g: q.gatewayCode });
    if (q.orderId) qb.andWhere('b.orderId = :o', { o: q.orderId });
    if (q.reference) qb.andWhere('(b.gatewayReference = :ref OR b.id = :ref)', { ref: q.reference });
    if (q.from) qb.andWhere('b.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('b.createdAt < :to', { to: q.to });
    return paginate(qb, 'b', q, (rows) => rows.map((r) => this.toListItem(r)));
  }

  async detail(id: string): Promise<BankTransactionDetail> {
    const b = await this.get(id);
    if (!b) throw notFound('Bank transaction');
    const logs = await this.ds.manager.find(BankCallLog, { where: { bankTransactionId: id }, order: { createdAt: 'ASC' } });
    return {
      ...this.toListItem(b),
      refundLegId: b.refundLegId,
      authorizedAt: b.authorizedAt?.toISOString() ?? null,
      verifiedAt: b.verifiedAt?.toISOString() ?? null,
      failureCode: b.failureCode,
      attempts: b.attempts,
      technicalLog: logs.map((l) => ({ at: l.createdAt.toISOString(), operation: l.operation, outcome: l.outcome, detail: l.detail })),
    };
  }
}
