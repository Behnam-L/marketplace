import { Column, Entity, PrimaryColumn } from 'typeorm';
import { CreatedAt, IdColumn, RefColumn, UpdatedAt } from '../../shared/database/columns';

@Entity('system_setting')
export class SystemSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'jsonb' })
  valueJson: number | boolean;

  @RefColumn({ nullable: true })
  updatedBy: string | null;

  @CreatedAt()
  createdAt: Date;

  @UpdatedAt()
  updatedAt: Date;
}

/** Append-only (INSERT/SELECT only). */
@Entity('system_setting_change')
export class SystemSettingChange {
  @IdColumn()
  id: string;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'jsonb' })
  oldValue: number | boolean;

  @Column({ type: 'jsonb' })
  newValue: number | boolean;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @RefColumn()
  changedBy: string;

  @CreatedAt()
  createdAt: Date;
}
