import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { envOptional, loadConfig } from '../../config/env';
import { CryptoService } from '../../shared/security/crypto.service';
import { seedAccess, bootstrapSuperAdmin } from '../seeds/access.seed';
import { seedReference } from '../seeds/reference.seed';
import { seedDemo } from '../seeds/demo.seed';

/** Idempotent seeds: roles, gateways, templates, bootstrap SuperAdmin, demo data. */
async function main(): Promise<void> {
  process.env.JOBS_ENABLED = 'false';
  const log = new Logger('Seed');
  const config = loadConfig();
  const { AppModule } = await import('../../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const ds = app.get(DataSource);
  await seedAccess(ds);
  await seedReference(ds);
  const password = envOptional('BOOTSTRAP_ADMIN_PASSWORD');
  const totp = envOptional('BOOTSTRAP_ADMIN_TOTP_SECRET');
  const phone = envOptional('BOOTSTRAP_ADMIN_PHONE');
  if (password && totp && phone) {
    const r = await bootstrapSuperAdmin(ds, new CryptoService(config), { phone, password, totpSecret: totp });
    log.log(r === 'created' ? `bootstrap SuperAdmin ${phone} created` : 'admin already exists; bootstrap skipped');
  } else {
    log.warn('BOOTSTRAP_ADMIN_* not set; no admin created (run admin:bootstrap)');
  }
  if ((envOptional('SEED_DEMO_DATA') ?? 'false') === 'true') await seedDemo(app, envOptional('DEMO_MERCHANT_SECRET'));
  await app.close();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
