import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsIn } from 'class-validator';
import type { UploadFileResponse } from '@bajet/contracts';
import { AppError } from '../../shared/errors/app-error';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { FilesService } from './files.service';

class UploadFileDto {
  @IsIn(['Icon', 'Contract'])
  kind: 'Icon' | 'Contract';
}

function sendFile(res: Response, mime: string, name: string, data: Buffer): void {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(data);
}

@ApiTags('admin: files')
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Stage an upload; it is committed together with the provider/merchant record. */
  @Post('admin/files')
  @AdminAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { kind: { type: 'string', enum: ['Icon', 'Contract'] }, file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: UploadFileDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ): Promise<UploadFileResponse> {
    if (!admin.permissions.has('providers.manage') && !admin.permissions.has('merchants.manage')) {
      throw new AppError('FORBIDDEN', "You don't have permission to upload files.");
    }
    if (!file) throw new AppError('VALIDATION_ERROR', 'A file is required.', { fields: [{ field: 'file', message: 'Required.' }] });
    return { fileId: await this.files.stage(body.kind, file.buffer, file.originalname, admin.adminId) };
  }

  @Get('admin/files/:id')
  @AdminAuth()
  async download(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal, @Res() res: Response): Promise<void> {
    const kinds: ('Contract' | 'Icon' | 'Report')[] = ['Icon'];
    if (admin.permissions.has('providers.read') || admin.permissions.has('merchants.read')) kinds.push('Contract');
    if (admin.permissions.has('exports.create')) kinds.push('Report');
    const { file, data } = await this.files.read(id, kinds);
    sendFile(res, file.mime, file.originalName ?? file.id, data);
  }

  /** Provider icons are public (shown in checkout). Served as inert attachments. */
  @Get('public/icons/:id')
  async icon(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { file, data } = await this.files.read(id, ['Icon']);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(data);
  }
}
