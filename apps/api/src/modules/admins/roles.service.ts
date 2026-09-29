import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  type Permission,
  type PermissionDto,
  type RoleDto,
  type RoleInput,
} from '@bajet/contracts';
import { AppError, notFound, validationError } from '../../shared/errors/app-error';
import { isUniqueViolation } from '../../shared/database/tx';
import { newId } from '../../shared/util/ids';
import { AdminUser, Role, RolePermission } from './admin.entity';

export const MANAGER_PERMISSIONS: Permission[] = ['admins.manage', 'roles.manage'];

@Injectable()
export class RolesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async permissionsOfRole(roleId: string, m: EntityManager = this.ds.manager): Promise<Permission[]> {
    const role = await m.findOne(Role, { where: { id: roleId } });
    if (!role) return [];
    if (role.isSystem) return [...PERMISSIONS];
    const rows = await m.find(RolePermission, { where: { roleId } });
    return rows.map((r) => r.permissionCode).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  }

  async roleName(roleId: string): Promise<string> {
    return (await this.ds.manager.findOne(Role, { where: { id: roleId } }))?.name ?? '';
  }

  permissions(): PermissionDto[] {
    return PERMISSIONS.map((code) => ({ code, description: PERMISSION_DESCRIPTIONS[code] }));
  }

  private async toDto(role: Role, m: EntityManager = this.ds.manager): Promise<RoleDto> {
    const adminCount = await m.count(AdminUser, { where: { roleId: role.id, status: In(['Active', 'Invited']) } });
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissionCodes: await this.permissionsOfRole(role.id, m),
      adminCount,
    };
  }

  async list(): Promise<RoleDto[]> {
    const roles = await this.ds.manager.find(Role, { order: { createdAt: 'ASC' } });
    return Promise.all(roles.map((r) => this.toDto(r)));
  }

  async get(id: string): Promise<RoleDto> {
    const role = await this.ds.manager.findOne(Role, { where: { id } });
    if (!role) throw notFound('Role');
    return this.toDto(role);
  }

  async create(input: RoleInput): Promise<RoleDto> {
    const id = newId('rol');
    try {
      await this.ds.manager.insert(Role, { id, name: input.name.trim(), description: input.description.trim(), isSystem: false });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError('DUPLICATE_ENTITY', 'A role with this name already exists.', { field: 'name' });
      throw e;
    }
    return this.get(id);
  }

  async update(id: string, input: Partial<RoleInput>): Promise<{ before: RoleDto; after: RoleDto }> {
    const before = await this.get(id);
    if (before.isSystem) throw new AppError('FORBIDDEN', 'The SuperAdmin role cannot be changed.');
    try {
      await this.ds.manager.update(Role, { id }, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError('DUPLICATE_ENTITY', 'A role with this name already exists.', { field: 'name' });
      throw e;
    }
    return { before, after: await this.get(id) };
  }

  /**
   * Counts active admins holding `perm`, optionally simulating a change: excluding an
   * admin, moving an admin to another role, or replacing a role's permission set.
   */
  async activeHolders(
    m: EntityManager,
    perm: Permission,
    sim: { excludeAdminId?: string; adminRoleOverride?: { adminId: string; roleId: string }; rolePermsOverride?: { roleId: string; perms: Permission[] } } = {},
  ): Promise<number> {
    const admins = await m.find(AdminUser, { where: { status: 'Active' } });
    const cache = new Map<string, Permission[]>();
    let n = 0;
    for (const a of admins) {
      if (a.id === sim.excludeAdminId) continue;
      const roleId = sim.adminRoleOverride?.adminId === a.id ? sim.adminRoleOverride.roleId : a.roleId;
      let perms = cache.get(roleId);
      if (!perms) {
        const role = await m.findOne(Role, { where: { id: roleId } });
        perms =
          sim.rolePermsOverride?.roleId === roleId && !role?.isSystem
            ? sim.rolePermsOverride.perms
            : await this.permissionsOfRole(roleId, m);
        cache.set(roleId, perms);
      }
      if (perms.includes(perm)) n++;
    }
    return n;
  }

  /** Serialises changes that could remove the last admin manager. */
  async lockManagers(m: EntityManager): Promise<void> {
    await m.query(`SELECT pg_advisory_xact_lock(hashtext('bajet:admin-managers'))`);
  }

  async setPermissions(id: string, codes: Permission[]): Promise<{ before: RoleDto; after: RoleDto }> {
    const before = await this.get(id);
    if (before.isSystem) throw new AppError('FORBIDDEN', 'The SuperAdmin role always holds every permission.');
    const unknown = codes.filter((c) => !(PERMISSIONS as readonly string[]).includes(c));
    if (unknown.length) throw validationError('permissionCodes', `Unknown permissions: ${unknown.join(', ')}`);
    const unique = [...new Set(codes)];
    await this.ds.transaction(async (m) => {
      await this.lockManagers(m);
      for (const perm of MANAGER_PERMISSIONS) {
        const remaining = await this.activeHolders(m, perm, { rolePermsOverride: { roleId: id, perms: unique } });
        if (remaining === 0) {
          throw new AppError('LAST_ADMIN_MANAGER', `This change would leave no active admin with ${perm}.`);
        }
      }
      await m.delete(RolePermission, { roleId: id });
      if (unique.length) await m.insert(RolePermission, unique.map((permissionCode) => ({ roleId: id, permissionCode })));
    });
    return { before, after: await this.get(id) };
  }
}
