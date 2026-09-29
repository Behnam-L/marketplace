import 'reflect-metadata';
import dataSource from '../data-source';
import { envOptional, envString, loadConfig } from '../../config/env';
import { CryptoService } from '../../shared/security/crypto.service';
import { generateTotpSecret, totpProvisioningUri } from '../../shared/security/totp';
import { bootstrapSuperAdmin, seedAccess } from '../seeds/access.seed';

/** `npm run admin:bootstrap` — creates the first SuperAdmin if no admin exists. */
async function main(): Promise<void> {
  const config = loadConfig();
  await dataSource.initialize();
  await seedAccess(dataSource);
  const totpSecret = envOptional('BOOTSTRAP_ADMIN_TOTP_SECRET') ?? generateTotpSecret();
  const phone = envString('BOOTSTRAP_ADMIN_PHONE');
  const result = await bootstrapSuperAdmin(dataSource, new CryptoService(config), {
    phone,
    password: envString('BOOTSTRAP_ADMIN_PASSWORD'),
    totpSecret,
  });
  if (result === 'created') {
    console.log(`SuperAdmin ${phone} created. Add this to your authenticator app:`);
    console.log(totpProvisioningUri(totpSecret, phone));
  } else {
    console.log('An admin already exists; bootstrap skipped.');
  }
  await dataSource.destroy();
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
