import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { ConsumerDetail, ConsumerListItem, Page } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { ConsumersService } from './consumers.service';
import { ConsumerQueryDto, SetConsumerStatusDto } from './consumers.dto';

@ApiTags('admin: consumers')
@Controller('admin/consumers')
export class ConsumersController {
  constructor(private readonly consumers: ConsumersService) {}

  /** PII (phone, national ID, DOB) is masked unless the admin holds `consumers.pii`. */
  @Get()
  @AdminAuth('consumers.read')
  list(@Query() q: ConsumerQueryDto, @CurrentAdmin() admin: AdminPrincipal): Promise<Page<ConsumerListItem>> {
    return this.consumers.list(q, admin.permissions.has('consumers.pii'));
  }

  @Get(':id')
  @AdminAuth('consumers.read')
  get(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal): Promise<ConsumerDetail> {
    return this.consumers.detail(id, admin.permissions.has('consumers.pii'));
  }

  @Patch(':id/status')
  @AdminAuth('consumers.block')
  async setStatus(@Param('id') id: string, @Body() body: SetConsumerStatusDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request): Promise<ConsumerDetail> {
    const { before } = await this.consumers.setStatus(id, body.status, body.reason);
    setAuditBefore(req, { status: before }, 'ConsumerUser', id);
    return this.consumers.detail(id, admin.permissions.has('consumers.pii'));
  }
}
