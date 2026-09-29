import { Column, Entity, Index } from 'typeorm';
import { CreatedAt, IdColumn, RefColumn } from '../../shared/database/columns';

/** Append-only (INSERT/SELECT only; enforced by trigger). */
@Entity('audit_log')
@Index('ix_audit_created', ['createdAt'])
@Index('ix_audit_entity', ['entityType', 'entityId'])
export class AuditLog {
  @IdColumn()
  id: string;

  @RefColumn({ nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  actorName: string | null;

  @Column({ type: 'varchar', length: 120 })
  action: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  entityType: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: unknown;

  @Column({ type: 'jsonb', nullable: true })
  after: unknown;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreatedAt()
  createdAt: Date;
}
