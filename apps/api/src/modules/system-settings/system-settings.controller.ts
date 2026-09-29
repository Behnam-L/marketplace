import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { SettingChangeDto, SettingDto } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSettingDto } from './system-settings.dto';

@ApiTags('admin: settings')
@Controller('admin/settings')
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  @AdminAuth('settings.read')
  list(): Promise<SettingDto[]> {
    return this.settings.list();
  }

  /** Requires a reason and a TOTP step-up (FR-101). */
  @Patch(':key')
  @AdminAuth('settings.manage')
  async update(
    @Param('key') key: string,
    @Body() body: UpdateSettingDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() req: Request,
  ): Promise<SettingDto> {
    const { before, after } = await this.settings.update(key, body.value, body.reason, admin.adminId);
    setAuditBefore(req, before, 'SystemSetting', key);
    return after;
  }

  @Get(':key/history')
  @AdminAuth('settings.read')
  history(@Param('key') key: string): Promise<SettingChangeDto[]> {
    return this.settings.history(key);
  }
}
