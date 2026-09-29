import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { resetConfigCache, loadConfig } from '../config/env';

/** Loads `.env.test` into process.env (tests never read the developer's .env). */
export function loadTestEnv(): void {
  const text = readFileSync(join(__dirname, '..', '..', '.env.test'), 'utf8');
  for (const line of text.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  resetConfigCache();
}

/**
 * Builds the full application against the test database. The schema is rebuilt
 * from migrations once per test file, so every suite starts clean.
 */
export async function createTestApp(): Promise<{ app: INestApplication; ds: DataSource }> {
  loadTestEnv();
  const { typeormOptions } = await import('../database/typeorm.options');
  const admin = new DataSource(typeormOptions(loadConfig().databaseUrl));
  await admin.initialize();
  await admin.query(`SELECT pg_advisory_lock(424242)`);
  try {
    await admin.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
    await admin.runMigrations({ transaction: 'each' });
  } finally {
    await admin.query(`SELECT pg_advisory_unlock(424242)`);
    await admin.destroy();
  }
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../bootstrap');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app, loadConfig());
  await app.init();
  const ds = app.get(DataSource);
  const { seedAccess } = await import('../database/seeds/access.seed');
  await seedAccess(ds);
  return { app, ds };
}
