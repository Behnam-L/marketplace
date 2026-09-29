import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Page, PspReportImportResponse, ReconciliationItemDto } from '@bajet/contracts';
import { AppError } from '../../shared/errors/app-error';
import { AdminAuth } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { ReconciliationService } from './reconciliation.service';
import { PspReportDto, ReconciliationQueryDto, UpdateReconciliationItemDto } from './reconciliation.dto';

@ApiTags('admin: reconciliation')
@Controller('admin')
export class ReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @Get('reconciliation-items')
  @AdminAuth('reconciliation.read')
  list(@Query() q: ReconciliationQueryDto): Promise<Page<ReconciliationItemDto>> {
    return this.recon.list(q);
  }

  @Get('reconciliation-items/:id')
  @AdminAuth('reconciliation.read')
  get(@Param('id') id: string): Promise<ReconciliationItemDto> {
    return this.recon.get(id);
  }

  @Patch('reconciliation-items/:id')
  @AdminAuth('reconciliation.resolve')
  async update(@Param('id') id: string, @Body() body: UpdateReconciliationItemDto, @Req() req: Request): Promise<ReconciliationItemDto> {
    const { before, after } = await this.recon.update(id, body);
    setAuditBefore(req, before, 'ReconciliationItem', id);
    return after;
  }

  @Post('reconciliation-items/:id/redrive')
  @HttpCode(200)
  @AdminAuth('reconciliation.resolve')
  redrive(@Param('id') id: string): Promise<ReconciliationItemDto> {
    return this.recon.redrive(id);
  }

  /** CSV columns: reference,amount_rial,fee_rial,date (header row required). */
  @Post('reconciliation/psp-reports')
  @AdminAuth('reconciliation.resolve')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { gatewayCode: { type: 'string' }, file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  importPsp(@UploadedFile() file: { buffer: Buffer } | undefined, @Body() body: PspReportDto): Promise<PspReportImportResponse> {
    if (!file) throw new AppError('VALIDATION_ERROR', 'A CSV file is required.', { fields: [{ field: 'file', message: 'Required.' }] });
    const text = file.buffer.toString('utf8');
    if (text.includes('\u0000')) throw new AppError('VALIDATION_ERROR', 'The file is not a CSV.', { fields: [{ field: 'file', message: 'Not a CSV.' }] });
    return this.recon.importPspReport(body.gatewayCode, text);
  }
}
