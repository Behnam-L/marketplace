import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { newId } from '../../shared/util/ids';
import { AlertService } from '../../shared/util/alerts';
import { JobsGate } from '../../shared/util/jobs-gate';
import { JournalEntry, LedgerLine } from './ledger.entity';
import { PostingLine } from './accounts';

export interface PostingInput {
  eventType: string;
  sourceType: string;
  sourceId: string;
  lines: PostingLine[];
  reversesEntryId?: string | null;
  memo?: string;
}

export interface InvariantResult {
  name: string;
  expected: number;
  actual: number;
}
export type InvariantCheck = (m: EntityManager) => Promise<InvariantResult[]>;

/** Append-only double-entry ledger (BR-LED). */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  private readonly checks: InvariantCheck[] = [];

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: AlertService,
    private readonly jobs: JobsGate,
  ) {}

  /**
   * Posts a balanced entry inside the caller's transaction. Zero lines are dropped;
   * an entry whose lines are all zero is skipped. Idempotent on (eventType, sourceId):
   * returns the existing entry id on replay.
   */
  async post(m: EntityManager, input: PostingInput): Promise<string | null> {
    const lines = input.lines
      .map((l) => ({ account: l.account, debit: l.debit ?? 0, credit: l.credit ?? 0 }))
      .filter((l) => l.debit !== 0 || l.credit !== 0);
    for (const l of lines) {
      if (!Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit) || l.debit < 0 || l.credit < 0) {
        throw new Error(`Invalid ledger line for ${l.account}`);
      }
      if (l.debit > 0 && l.credit > 0) throw new Error('A ledger line has exactly one side');
    }
    if (lines.length === 0) return null;
    const debits = lines.reduce((a, l) => a + l.debit, 0);
    const credits = lines.reduce((a, l) => a + l.credit, 0);
    if (lines.length < 2 || debits !== credits) {
      throw new Error(`Unbalanced journal entry ${input.eventType}/${input.sourceId}: ${debits} ≠ ${credits}`);
    }
    const id = newId('jnl');
    const inserted: { id: string }[] = await m.query(
      `INSERT INTO journal_entry (id, event_type, source_type, source_id, posted_at, reverses_entry_id, memo)
       VALUES ($1, $2, $3, $4, now(), $5, $6) ON CONFLICT (event_type, source_id) DO NOTHING RETURNING id`,
      [id, input.eventType, input.sourceType, input.sourceId, input.reversesEntryId ?? null, input.memo ?? null],
    );
    if (inserted.length === 0) {
      const existing = await m.findOne(JournalEntry, { where: { eventType: input.eventType, sourceId: input.sourceId } });
      return existing?.id ?? null;
    }
    await m.insert(
      LedgerLine,
      lines.map((l) => ({ id: newId('lln'), entryId: id, accountCode: l.account, debit: l.debit, credit: l.credit })),
    );
    return id;
  }

  /** Posts the mirror image of an existing entry (corrections never mutate). */
  async reverse(m: EntityManager, original: { eventType: string; sourceId: string }, reversal: { eventType: string; sourceType: string; sourceId: string }): Promise<string | null> {
    const entry = await m.findOne(JournalEntry, { where: { eventType: original.eventType, sourceId: original.sourceId } });
    if (!entry) return null;
    const lines = await m.find(LedgerLine, { where: { entryId: entry.id } });
    return this.post(m, {
      ...reversal,
      reversesEntryId: entry.id,
      lines: lines.map((l) => ({ account: l.accountCode, debit: l.credit, credit: l.debit })),
    });
  }

  /** Σdebit − Σcredit for an account (or every account with the prefix). */
  async balance(account: string, m: EntityManager = this.ds.manager, prefix = false): Promise<number> {
    const rows: { b: string | null }[] = await m.query(
      `SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS b FROM ledger_line WHERE ${prefix ? 'account_code LIKE $1' : 'account_code = $1'}`,
      [prefix ? `${account}%` : account],
    );
    return Number(rows[0]?.b ?? 0);
  }

  async entriesFor(sourceId: string, m: EntityManager = this.ds.manager): Promise<{ eventType: string; lines: { account: string; debit: number; credit: number }[] }[]> {
    const entries = await m.find(JournalEntry, { where: { sourceId }, order: { createdAt: 'ASC' } });
    const out = [];
    for (const e of entries) {
      const lines = await m.find(LedgerLine, { where: { entryId: e.id } });
      out.push({ eventType: e.eventType, lines: lines.map((l) => ({ account: l.accountCode, debit: l.debit, credit: l.credit })) });
    }
    return out;
  }

  registerInvariant(check: InvariantCheck): void {
    this.checks.push(check);
  }

  /** BR-LED-09: trial balance and registered invariants; alerts on breach, never auto-fixes. */
  async checkInvariants(): Promise<InvariantResult[]> {
    const breaches: InvariantResult[] = [];
    const tb = await this.balance('', this.ds.manager, true);
    if (tb !== 0) breaches.push({ name: 'TRIAL_BALANCE', expected: 0, actual: tb });
    for (const check of this.checks) {
      for (const r of await check(this.ds.manager)) if (r.expected !== r.actual) breaches.push(r);
    }
    for (const b of breaches) this.alerts.raise('Finance', 'LEDGER_INVARIANT_BREACH', { ...b });
    return breaches;
  }

  @Cron('30 2 * * *', { timeZone: 'Asia/Tehran', name: 'ledger-invariants' })
  async nightly(): Promise<void> {
    await this.jobs.run('ledger-invariants', () => this.checkInvariants());
  }
}
