import { hash, verify } from '@node-rs/argon2';
import { MIN_ADMIN_PASSWORD_LENGTH } from '@bajet/contracts';

/**
 * Offline breached-password check: a bundled list of the most common leaked
 * passwords (no network lookup is possible offline).
 */
const BREACHED = new Set(
  [
    '123456789012', 'password1234', 'qwertyuiop12', '111111111111', '123123123123', 'passwordpassword',
    'iloveyou1234', 'administrator', 'admin1234567', 'welcome12345', 'qwerty123456', '1234567890123',
    'abc123456789', 'letmein12345', 'passw0rd1234', 'changeme1234', 'football1234', 'monkey123456',
    'password123!', 'Password1234', 'P@ssw0rd1234', 'zaq12wsxcde3', '1q2w3e4r5t6y', 'qazwsxedcrfv',
  ].map((p) => p.toLowerCase()),
);

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  if (BREACHED.has(password.toLowerCase())) return 'This password appears in a list of breached passwords. Choose another.';
  return null;
}

// argon2id (the library default algorithm).
export const hashPassword = (password: string): Promise<string> =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export const verifyPassword = (hashed: string, password: string): Promise<boolean> =>
  verify(hashed, password).catch(() => false);
