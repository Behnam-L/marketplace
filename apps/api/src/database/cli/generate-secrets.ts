import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import { join } from 'node:path';
import { generateTotpSecret } from '../../shared/security/totp';

/**
 * Creates per-installation secrets once (Docker volume). Existing files are kept,
 * so restarts never rotate keys that encrypt stored data.
 */
const dir = process.argv[2] ?? '/run/bajet-secrets';
mkdirSync(dir, { recursive: true });

const WORDS = 'amber river cedar maple quartz harbor meadow falcon silver orbit lantern violet'.split(' ');
const passphrase = (): string =>
  Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]).join('-') + '-' + randomInt(1000, 9999);

const secrets: Record<string, () => string> = {
  db_password: () => randomBytes(24).toString('base64url'),
  data_encryption_key: () => randomBytes(32).toString('base64'),
  hash_pepper: () => randomBytes(32).toString('base64url'),
  bootstrap_admin_password: passphrase,
  bootstrap_admin_totp_secret: generateTotpSecret,
  demo_merchant_secret: () => randomBytes(32).toString('base64url'),
};

for (const [name, gen] of Object.entries(secrets)) {
  const file = join(dir, name);
  if (existsSync(file)) continue;
  writeFileSync(file, gen(), { mode: 0o644 });
  chmodSync(file, 0o644);
  console.log(`generated ${name}`);
}
console.log(`secrets ready in ${dir}`);
