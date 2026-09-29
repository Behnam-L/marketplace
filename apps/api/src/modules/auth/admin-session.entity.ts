import { Column, Entity, Index } from 'typeorm';
import { CreatedAt, IdColumn, RefColumn, Timestamp } from '../../shared/database/columns';

@Entity('admin_session')
@Index('uq_admin_session_token', ['tokenHash'], { unique: true })
export class AdminSession {
  @IdColumn()
  id: string;

  @RefColumn()
  adminUserId: string;

  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 64 })
  csrfToken: string;

  @Timestamp()
  lastSeenAt: Date;

  /** Absolute expiry (12 h). */
  @Timestamp()
  expiresAt: Date;

  @Timestamp({ nullable: true })
  stepUpAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreatedAt()
  createdAt: Date;
}
