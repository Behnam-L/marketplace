import { envOptional } from '../../config/env';
import { totpAt } from '../../shared/security/totp';

/** `npm run admin:totp [secret]` — prints the current code (demo convenience, offline). */
const secret = process.argv[2] ?? envOptional('BOOTSTRAP_ADMIN_TOTP_SECRET');
if (!secret) {
  console.error('Usage: totp <base32-secret> (or set BOOTSTRAP_ADMIN_TOTP_SECRET)');
  process.exit(1);
}
const now = Date.now();
const remaining = 30 - Math.floor(now / 1000) % 30;
console.log(`${totpAt(secret, now)}  (valid ~${remaining}s)`);
