import { Column, Entity, PrimaryColumn } from 'typeorm';
import { CreatedAt, Timestamp } from '../database/columns';

@Entity('idempotency_record')
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
