import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuditLogDto, Page } from '@bajet/contracts';
import { AdminAuth } from '../../shared/http/auth-context';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './audit.dto';

@ApiTags('admin: audit')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @AdminAuth('audit.read')
  list(@Query() q: AuditQueryDto): Promise<Page<AuditLogDto>> {
    return this.audit.list(q);
  }
}
