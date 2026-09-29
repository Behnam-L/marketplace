import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { CreatedAt, Timestamp } from '../database/columns';

@Entity('idempotency_record')
@Index('ix_idempotency_expires', ['expiresAt'])
export class IdempotencyRecord {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  scope: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'InProgress' | 'Done';

  @Column({ type: 'integer', nullable: true })
  responseCode: number | null;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: unknown;

  @Timestamp()
  expiresAt: Date;

  @CreatedAt()
  createdAt: Date;
}
