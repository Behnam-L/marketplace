import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ExportDto, ExportResource, Page, Permission } from '@bajet/contracts';
import { AppError, notFound } from '../../shared/errors/app-error';
import { newId } from '../../shared/util/ids';
import { JobsGate } from '../../shared/util/jobs-gate';
import { maskPii } from '../../shared/util/mask';
import { FilesService } from '../files/files.service';
import { ExportJob } from './export.entity';
import { toCsv } from './csv';

export const MAX_EXPORT_ROWS = 100_000;

export interface ExportSource {
  permission: Permission;
  fetch: (filters: Record<string, string>, cursor: string | undefined, piiAllowed: boolean) => Promise<Page<object>>;
}

/** FR-114: async CSV of any filtered list (≤ 100,000 rows; PII masked unless `consumers.pii`). */
@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly sources = new Map<ExportResource, ExportSource>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly jobs: JobsGate,
  ) {}

  register(resource: ExportResource, source: ExportSource): void {
    this.sources.set(resource, source);
  }

  private toDto(e: ExportJob): ExportDto {
    return {
      id: e.id,
      resource: e.resource,
      status: e.status,
      rowCount: e.rowCount,
      downloadUrl: e.fileId ? `/v1/admin/files/${e.fileId}` : null,
      error: e.error,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async create(resource: ExportResource, filters: Record<string, string>, admin: { adminId: string; permissions: Set<Permission> }): Promise<ExportDto> {
    const source = this.sources.get(resource);
    if (!source) throw new AppError('VALIDATION_ERROR', 'Unknown export resource.', { fields: [{ field: 'resource', message: 'Unknown resource.' }] });
    if (!admin.permissions.has(source.permission)) throw new AppError('FORBIDDEN', "You don't have permission to export this list.");
    const job = this.ds.manager.create(ExportJob, {
      id: newId('exp'),
      resource,
      filters,
      status: 'Pending',
      piiAllowed: admin.permissions.has('consumers.pii'),
      rowCount: null,
      fileId: null,
      error: null,
      createdBy: admin.adminId,
    });
    await this.ds.manager.insert(ExportJob, job);
    return this.get(job.id, admin.adminId);
  }

  async get(id: string, adminId: string): Promise<ExportDto> {
    const e = await this.ds.manager.findOne(ExportJob, { where: { id, createdBy: adminId } });
    if (!e) throw notFound('Export');
    return this.toDto(e);
  }

  async list(adminId: string): Promise<ExportDto[]> {
    const rows = await this.ds.manager.find(ExportJob, { where: { createdBy: adminId }, order: { createdAt: 'DESC' }, take: 50 });
    return rows.map((r) => this.toDto(r));
  }

  async process(id: string): Promise<void> {
    const claim = await this.ds.manager.update(ExportJob, { id, status: 'Pending' }, { status: 'Processing' });
    if (!claim.affected) return;
    const job = await this.ds.manager.findOneOrFail(ExportJob, { where: { id } });
    try {
      const source = this.sources.get(job.resource)!;
      const rows: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      do {
        const page = await source.fetch({ ...job.filters, limit: '100' }, cursor, job.piiAllowed);
        for (const item of page.items) rows.push((job.piiAllowed ? item : maskPii(item)) as Record<string, unknown>);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && rows.length < MAX_EXPORT_ROWS);
      const limited = rows.slice(0, MAX_EXPORT_ROWS);
      const fileId = await this.files.storeReport(Buffer.from(toCsv(limited), 'utf8'), `${job.resource}-${job.id}.csv`, job.createdBy);
      await this.ds.manager.update(ExportJob, { id }, { status: 'Ready', rowCount: limited.length, fileId });
    } catch (e) {
      this.logger.error(`export ${id} failed: ${(e as Error).message}`);
      await this.ds.manager.update(ExportJob, { id }, { status: 'Failed', error: (e as Error).message.slice(0, 300) });
    }
  }

  async processPending(): Promise<void> {
    const rows = await this.ds.manager.find(ExportJob, { where: { status: 'Pending' }, order: { createdAt: 'ASC' }, take: 5 });
    for (const r of rows) await this.process(r.id);
  }

  @Interval('exports', 5000)
  async job(): Promise<void> {
    await this.jobs.run('exports', () => this.processPending());
  }
}
