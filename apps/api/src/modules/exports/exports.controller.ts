import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional } from 'class-validator';
import { EXPORT_RESOURCES, type CreateExportRequest, type ExportDto, type ExportResource } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { ExportsService } from './exports.service';

class CreateExportDto implements CreateExportRequest {
  @IsIn(EXPORT_RESOURCES) resource: ExportResource;
  @IsOptional() @IsObject() filters: Record<string, string>;
}

@ApiTags('admin: exports')
@Controller('admin/exports')
export class ExportsController {
  constructor(private readonly exportsSvc: ExportsService) {}

  @Post()
  @HttpCode(202)
  @AdminAuth('exports.create')
  async create(@Body() body: CreateExportDto, @CurrentAdmin() admin: AdminPrincipal): Promise<ExportDto & { exportId: string }> {
    const filters = Object.fromEntries(Object.entries(body.filters ?? {}).filter(([, v]) => typeof v === 'string' && v !== '').map(([k, v]) => [k, String(v)]));
    const e = await this.exportsSvc.create(body.resource, filters, admin);
    return { ...e, exportId: e.id };
  }

  @Get()
  @AdminAuth('exports.create')
  list(@CurrentAdmin() admin: AdminPrincipal): Promise<ExportDto[]> {
    return this.exportsSvc.list(admin.adminId);
  }

  @Get(':id')
  @AdminAuth('exports.create')
  get(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal): Promise<ExportDto> {
    return this.exportsSvc.get(id, admin.adminId);
  }
}
