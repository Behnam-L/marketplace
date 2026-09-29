import { Column, Entity, Index } from 'typeorm';
import { CreatedAt, EnumCol, IdColumn, RefColumn, Timestamp, UpdatedAt } from '../../shared/database/columns';
import { MESSAGE_STATUSES, type MessageStatus, type MessageTemplateStatus } from '@bajet/contracts';

@Entity('message_template')
@Index('uq_template_active', ['event', 'channel'], { unique: true, where: `status = 'Active'` })
export class MessageTemplate {
  @IdColumn()
  id: string;

  @Column({ type: 'varchar', length: 60 })
  event: string;

  @Column({ type: 'varchar', length: 10 })
  channel: 'SMS';

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 1000 })
  content: string;

  @Column({ type: 'text', array: true, default: '{}' })
  params: string[];

  @EnumCol(['Active', 'Inactive'])
  status: MessageTemplateStatus;

  @Column({ type: 'boolean', default: false })
  orphaned: boolean;

  @CreatedAt()
  createdAt: Date;

  @UpdatedAt()
  updatedAt: Date;
}

@Entity('message_log')
@Index('ix_message_log_created', ['createdAt'])
export class MessageLog {
  @IdColumn()
  id: string;

  @RefColumn({ nullable: true })
  templateId: string | null;

  @Column({ type: 'varchar', length: 60 })
  event: string;

  @Column({ type: 'varchar', length: 20 })
  recipient: string;

  @EnumCol(MESSAGE_STATUSES)
  status: MessageStatus;

  @Column({ type: 'varchar', length: 60, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerMessageId: string | null;

  @Timestamp({ nullable: true })
  sentAt: Date | null;

  @Timestamp({ nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @CreatedAt()
  createdAt: Date;
}
