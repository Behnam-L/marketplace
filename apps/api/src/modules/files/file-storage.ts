import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Object storage contract; the offline build stores files on local disk. */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

/** Antivirus scanner contract; the mock flags the EICAR test signature. */
export interface MalwareScanner {
  scan(data: Buffer): Promise<'Clean' | 'Infected'>;
}

export class MockMalwareScanner implements MalwareScanner {
  scan(data: Buffer): Promise<'Clean' | 'Infected'> {
    return Promise.resolve(data.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'Infected' : 'Clean');
  }
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

/** Magic-byte MIME sniffing for the allowed types. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

