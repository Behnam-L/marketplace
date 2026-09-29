import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ADMIN_STATUSES, type AdminStatus, type Permission } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('admin_user')
@Index('uq_admin_phone', ['phoneE164'], { unique: true })
export class AdminUser {
  @IdColumn()
  id: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 16 })
  phoneE164: string;

  @RefColumn()
  roleId: string;

  @EnumCol(ADMIN_STATUSES)
  status: AdminStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'text', nullable: true })
  totpSecretEnc: string | null;

  /** Secret generated at invitation acceptance, activated after the first TOTP confirmation. */
  @Column({ type: 'text', nullable: true })
  pendingTotpSecretEnc: string | null;

  @Column({ type: 'integer', default: 0 })
  failedLogins: number;

  @Timestamp({ nullable: true })
  lockedUntil: Date | null;

  @Timestamp({ nullable: true })
  lastLoginAt: Date | null;

  /** Single-use SMS link token (invitation, MFA re-enrolment or password reset). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  actionTokenHash: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  actionTokenPurpose: 'invite' | 'mfa-reset' | 'password-reset' | null;

  @Timestamp({ nullable: true })
  actionTokenExpiresAt: Date | null;

  /** Short-lived token between password and TOTP steps of login. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  mfaTokenHash: string | null;

  @Timestamp({ nullable: true })
  mfaTokenExpiresAt: Date | null;

  @VersionCol()
  version: number;

  @CreatedAt()
  createdAt: Date;

  @UpdatedAt()
  updatedAt: Date;
}

@Entity('role')
@Index('uq_role_name', ['name'], { unique: true })
export class Role {
  @IdColumn()
  id: string;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @Column({ type: 'varchar', length: 300, default: '' })
  description: string;

  /** SuperAdmin: always holds every permission; cannot be edited. */
  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @CreatedAt()
  createdAt: Date;

  @UpdatedAt()
  updatedAt: Date;
}

@Entity('permission')
export class PermissionEntity {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  code: Permission;

  @Column({ type: 'varchar', length: 300 })
  description: string;

  @CreatedAt()
  createdAt: Date;
}

@Entity('role_permission')
export class RolePermission {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  roleId: string;

  @PrimaryColumn({ type: 'varchar', length: 60 })
  permissionCode: Permission;

  @CreatedAt()
  createdAt: Date;
}
