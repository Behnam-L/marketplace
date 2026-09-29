import { Check, Column, Entity, Index } from 'typeorm';
import { CreatedAt, IdColumn, MoneyColumn, RefColumn, Timestamp } from '../../shared/database/columns';

/** Append-only, double-entry (BR-LED-01). */
@Entity('journal_entry')
@Index('uq_journal_event_source', ['eventType', 'sourceId'], { unique: true })
export class JournalEntry {
  @IdColumn()
  id: string;

  @Column({ type: 'varchar', length: 60 })
  eventType: string;

  @Column({ type: 'varchar', length: 40 })
  sourceType: string;

  @Column({ type: 'varchar', length: 80 })
  sourceId: string;

  @Timestamp()
  postedAt: Date;

  @RefColumn({ nullable: true })
  reversesEntryId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  memo: string | null;

  @CreatedAt()
  createdAt: Date;
}

@Entity('ledger_line')
@Index('ix_ledger_line_account', ['accountCode'])
@Index('ix_ledger_line_entry', ['entryId'])
@Check('ck_ledger_line_one_side', '(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)')
export class LedgerLine {
  @IdColumn()
  id: string;

  @RefColumn()
  entryId: string;

  @Column({ type: 'varchar', length: 80 })
  accountCode: string;

  @MoneyColumn({ default: 0 })
  debit: number;

  @MoneyColumn({ default: 0 })
  credit: number;

  @CreatedAt()
  createdAt: Date;
}
