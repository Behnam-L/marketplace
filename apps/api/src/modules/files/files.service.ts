import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { FileKind } from '@bajet/contracts';
import { AppError, notFound } from '../../shared/errors/app-error';
import { sha256Hex } from '../../shared/security/crypto.service';
import { newId } from '../../shared/util/ids';
import { FileObject } from './file-object.entity';
import { FILE_STORAGE, FileStorage, MALWARE_SCANNER, MalwareScanner, sniffMime } from './file-storage';

const RULES: Record<'Icon' | 'Contract', { mimes: string[]; maxBytes: number }> = {
  Icon: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 512 * 1024 },
  Contract: { mimes: ['application/pdf'], maxBytes: 10 * 1024 * 1024 },
};

/** Staged uploads committed atomically with the owning record (FR-090, §9.3). */
@Injectable()
export class FilesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async stage(kind: 'Icon' | 'Contract', data: Buffer, originalName: string | null, uploadedBy: string): Promise<string> {
    const rule = RULES[kind];
    if (data.length === 0 || data.length > rule.maxBytes) {
      throw new AppError('VALIDATION_ERROR', `File is too large (max ${Math.round(rule.maxBytes / 1024)} KB).`, {
        fields: [{ field: 'file', message: 'Invalid size.' }],
      });
    }
    const mime = sniffMime(data);
    if (!mime || !rule.mimes.includes(mime)) {
      throw new AppError('VALIDATION_ERROR', `Unsupported file type. Allowed: ${rule.mimes.join(', ')}.`, {
        fields: [{ field: 'file', message: 'Unsupported file type.' }],
      });
    }
    const scan = await this.scanner.scan(data);
    if (scan !== 'Clean') throw new AppError('FILE_REJECTED', 'The file failed the security scan.');
    const id = newId('fil');
    const storageKey = `${kind.toLowerCase()}/${id}`;
    await this.storage.put(storageKey, data);
    await this.ds.manager.insert(FileObject, {
      id,
      kind,
      mime,
      size: data.length,
      sha256: sha256Hex(data),
      storageKey,
      originalName: originalName?.slice(0, 200) ?? null,
      status: 'Staged',
      scanStatus: 'Clean',
      uploadedBy,
    });
    return id;
  }

  /** Stores a system-generated file (exports) directly as committed. */
  async storeReport(data: Buffer, name: string, createdBy: string): Promise<string> {
    const id = newId('fil');
    const storageKey = `report/${id}`;
    await this.storage.put(storageKey, data);
    await this.ds.manager.insert(FileObject, {
      id,
      kind: 'Report',
      mime: 'text/csv',
      size: data.length,
      sha256: sha256Hex(data),
      storageKey,
      originalName: name,
      status: 'Committed',
      scanStatus: 'Clean',
      uploadedBy: createdBy,
    });
    return id;
  }

  /**
   * Commits a staged file inside the caller's transaction. Already-committed files of
   * the same kind are accepted (re-saving a record without changing its file).
   */
  async commit(m: EntityManager, fileId: string | null | undefined, kind: FileKind, currentFileId?: string | null): Promise<void> {
    if (!fileId || fileId === currentFileId) return;
    const f = await m.findOne(FileObject, { where: { id: fileId }, lock: { mode: 'pessimistic_write' } });
    if (!f || f.kind !== kind || f.status !== 'Staged' || f.scanStatus !== 'Clean') {
      throw new AppError('FILE_NOT_STAGED', 'The uploaded file was not found or has expired. Please upload it again.', {
        field: kind === 'Icon' ? 'iconFileId' : 'contractFileId',
      });
    }
    await m.update(FileObject, { id: fileId }, { status: 'Committed' });
  }

  async read(id: string, kinds: FileKind[]): Promise<{ file: FileObject; data: Buffer }> {
    const file = await this.ds.manager.findOne(FileObject, { where: { id } });
    if (!file || !kinds.includes(file.kind) || file.status !== 'Committed') throw notFound('File');
    return { file, data: await this.storage.get(file.storageKey) };
  }

  /** Purge uploads that were never committed (E-18). */
  async purgeStaged(olderThanHours = 24): Promise<number> {
    const rows = await this.ds.manager
      .createQueryBuilder(FileObject, 'f')
      .where(`f.status = 'Staged'`)
      .andWhere(`f.createdAt < now() - make_interval(hours => :h)`, { h: olderThanHours })
      .getMany();
    for (const f of rows) {
      await this.storage.delete(f.storageKey);
      await this.ds.manager.delete(FileObject, { id: f.id, status: 'Staged' });
    }
    return rows.length;
  }

  urlFor(fileId: string | null, kind: 'Icon' | 'Contract'): string | null {
    if (!fileId) return null;
    return kind === 'Icon' ? `/v1/public/icons/${fileId}` : `/v1/admin/files/${fileId}`;
  }
}
