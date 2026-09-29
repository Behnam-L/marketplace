import { Column, Entity } from 'typeorm';
import type { FileKind, FileStatus, ScanStatus } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, UpdatedAt } from '../../shared/database/columns';

@Entity('file_object')
export class FileObject {
  @IdColumn()
  id: string;

  @EnumCol(['Icon', 'Contract', 'Report'])
  kind: FileKind;

  @Column({ type: 'varchar', length: 100 })
  mime: string;

  @Column({ type: 'integer' })
  size: number;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'varchar', length: 200 })
  storageKey: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  originalName: string | null;

  @EnumCol(['Staged', 'Committed'])
  status: FileStatus;

  @EnumCol(['Pending', 'Clean', 'Infected'])
  scanStatus: ScanStatus;

  @RefColumn({ nullable: true })
  uploadedBy: string | null;

  @CreatedAt()
  createdAt: Date;

  @UpdatedAt()
  updatedAt: Date;
}
