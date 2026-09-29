import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AdminListItem, CreateAdminResponse, Page, PermissionDto, RoleDto as RoleView } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { AdminsService } from './admins.service';
import { RolesService } from './roles.service';
import { AdminQueryDto, CreateAdminDto, RoleDto, SetRolePermissionsDto, UpdateAdminDto, UpdateRoleDto } from './admins.dto';

@ApiTags('admin: admins')
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @AdminAuth('admins.manage')
  list(@Query() q: AdminQueryDto): Promise<Page<AdminListItem>> {
    return this.admins.list(q);
  }

  @Get(':id')
  @AdminAuth('admins.manage')
  get(@Param('id') id: string): Promise<AdminListItem> {
    return this.admins.get(id);
  }

  @Post()
  @AdminAuth('admins.manage')
  create(@Body() body: CreateAdminDto): Promise<CreateAdminResponse> {
    return this.admins.create(body);
  }

  @Patch(':id')
  @AdminAuth('admins.manage')
  async update(@Param('id') id: string, @Body() body: UpdateAdminDto, @CurrentAdmin() actor: AdminPrincipal, @Req() req: Request): Promise<AdminListItem> {
    const { before, after } = await this.admins.update(id, body, actor.adminId);
    setAuditBefore(req, before, 'AdminUser', id);
    return after;
  }

  @Post(':id/resend-invitation')
  @HttpCode(202)
  @AdminAuth('admins.manage')
  resend(@Param('id') id: string): Promise<{ delivered: boolean }> {
    return this.admins.resendInvitation(id);
  }

  @Post(':id/reset-mfa')
  @HttpCode(202)
  @AdminAuth('admins.manage')
  resetMfa(@Param('id') id: string, @CurrentAdmin() actor: AdminPrincipal): Promise<{ delivered: boolean }> {
    return this.admins.resetMfa(id, actor.roleId);
  }
}

@ApiTags('admin: roles')
@Controller('admin')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @AdminAuth('roles.manage')
  permissions(): PermissionDto[] {
    return this.roles.permissions();
  }

  @Get('roles')
  @AdminAuth()
  list(): Promise<RoleView[]> {
    return this.roles.list();
  }

  @Get('roles/:id')
  @AdminAuth('roles.manage')
  get(@Param('id') id: string): Promise<RoleView> {
    return this.roles.get(id);
  }

  @Post('roles')
  @AdminAuth('roles.manage')
  create(@Body() body: RoleDto): Promise<RoleView> {
    return this.roles.create(body);
  }

  @Patch('roles/:id')
  @AdminAuth('roles.manage')
  async update(@Param('id') id: string, @Body() body: UpdateRoleDto, @Req() req: Request): Promise<RoleView> {
    const { before, after } = await this.roles.update(id, body);
    setAuditBefore(req, before, 'Role', id);
    return after;
  }

  @Put('roles/:id/permissions')
  @AdminAuth('roles.manage')
  async setPermissions(@Param('id') id: string, @Body() body: SetRolePermissionsDto, @Req() req: Request): Promise<RoleView> {
    const { before, after } = await this.roles.setPermissions(id, body.permissionCodes);
    setAuditBefore(req, before, 'Role', id);
    return after;
  }
}
