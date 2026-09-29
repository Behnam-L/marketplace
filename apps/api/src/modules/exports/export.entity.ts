import { Column, Entity, Index } from 'typeorm';
import { EXPORT_RESOURCES, type ExportResource, type ExportStatus } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, UpdatedAt } from '../../shared/database/columns';

@Entity('export_job')
@Index('ix_export_status', ['status', 'createdAt'])
export class ExportJob {
  @IdColumn() id: string;
  @EnumCol(EXPORT_RESOURCES) resource: ExportResource;
  @Column({ type: 'jsonb', default: {} }) filters: Record<string, string>;
  @EnumCol(['Pending', 'Processing', 'Ready', 'Failed']) status: ExportStatus;
  /** PII stays unmasked only when the requester held `consumers.pii`. */
  @Column({ type: 'boolean', default: false }) piiAllowed: boolean;
  @Column({ type: 'integer', nullable: true }) rowCount: number | null;
  @RefColumn({ nullable: true }) fileId: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) error: string | null;
  @RefColumn() createdBy: string;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}
