import { readFileSync } from 'node:fs';

/**
 * Configuration comes only from environment variables. Every variable may also be
 * supplied as `<NAME>_FILE` pointing at a file (Docker secrets convention).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  publicWebUrl: string;
  publicApiUrl: string;
  dataEncryptionKey: Buffer;
  hashPepper: string;
  cookieSecure: boolean;
  jobsEnabled: boolean;
  mockIntegrations: boolean;
  fileStorageDir: string;
  logLevel: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
}

function raw(name: string): string | undefined {
  const direct = process.env[name];
  if (direct !== undefined && direct !== '') return direct;
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch (e) {
      throw new Error(`Cannot read ${name}_FILE (${file}): ${(e as Error).message}`);
    }
  }
  return undefined;
}

export function envString(name: string, fallback?: string): string {
  const v = raw(name) ?? fallback;
  if (v === undefined) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export function envOptional(name: string): string | undefined {
  return raw(name);
}

function envBool(name: string, fallback: boolean): boolean {
  const v = raw(name);
  if (v === undefined) return fallback;
  if (['true', '1', 'yes'].includes(v.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(v.toLowerCase())) return false;
  throw new Error(`Environment variable ${name} must be a boolean`);
}

function envInt(name: string, fallback: number): number {
  const v = raw(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

function databaseUrl(): string {
  const url = raw('DATABASE_URL');
  if (url) return url;
  const host = envString('DB_HOST', 'localhost');
  const port = envString('DB_PORT', '5432');
  const user = envString('DB_USER');
  const password = encodeURIComponent(envString('DB_PASSWORD'));
  const name = envString('DB_NAME');
  return `postgres://${user}:${password}@${host}:${port}/${name}`;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const key = Buffer.from(envString('DATA_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  const pepper = envString('HASH_PEPPER');
  if (pepper.length < 16) throw new Error('HASH_PEPPER must be at least 16 characters');
  const nodeEnv = envString('NODE_ENV', 'development');
  cached = {
    nodeEnv,
    port: envInt('PORT', 3000),
    databaseUrl: databaseUrl(),
    publicWebUrl: envString('PUBLIC_WEB_URL', 'http://localhost:8080').replace(/\/$/, ''),
    publicApiUrl: envString('PUBLIC_API_URL', 'http://localhost:8080').replace(/\/$/, ''),
    dataEncryptionKey: key,
    hashPepper: pepper,
    cookieSecure: envBool('COOKIE_SECURE', nodeEnv === 'production'),
    jobsEnabled: envBool('JOBS_ENABLED', true),
    mockIntegrations: envBool('MOCK_INTEGRATIONS', true),
    fileStorageDir: envString('FILE_STORAGE_DIR', './storage'),
    logLevel: envString('LOG_LEVEL', 'log'),
    corsOrigins: (raw('CORS_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    swaggerEnabled: envBool('SWAGGER_ENABLED', true),
  };
  return cached;
}

/** Test helper: forget the cached config after mutating process.env. */
export function resetConfigCache(): void {
  cached = null;
}
