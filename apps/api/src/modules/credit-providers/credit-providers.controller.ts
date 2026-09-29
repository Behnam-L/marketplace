import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Page, ProviderDetail, ProviderListItem } from '@bajet/contracts';
import { AdminAuth } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { IfMatch } from '../../shared/http/request-meta';
import { Idempotent } from '../../shared/idempotency/idempotency.interceptor';
import { CreditProvidersService } from './credit-providers.service';
import { ProviderDto, ProviderQueryDto, UpdateProviderDto } from './credit-providers.dto';

@ApiTags('admin: credit providers')
@Controller('admin/providers')
export class CreditProvidersController {
  constructor(private readonly providers: CreditProvidersService) {}

  @Get()
  @AdminAuth('providers.read')
  list(@Query() q: ProviderQueryDto): Promise<Page<ProviderListItem>> {
    return this.providers.list(q);
  }

  @Get(':id')
  @AdminAuth('providers.read')
  get(@Param('id') id: string): Promise<ProviderDetail> {
    return this.providers.get(id);
  }

  @Post()
  @Idempotent()
  @AdminAuth('providers.manage')
  create(@Body() body: ProviderDto): Promise<ProviderDetail> {
    return this.providers.create(body);
  }

  @Patch(':id')
  @AdminAuth('providers.manage')
  async update(@Param('id') id: string, @Body() body: UpdateProviderDto, @IfMatch() version: number, @Req() req: Request): Promise<ProviderDetail> {
    const { before, after } = await this.providers.update(id, body, version);
    setAuditBefore(req, before, 'CreditProvider', id);
    return after;
  }
}
