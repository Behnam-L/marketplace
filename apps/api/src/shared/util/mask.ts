import { maskIban, maskNationalId, maskPhone } from '@bajet/contracts';

const SECRET_KEYS = /password|secret|totp|token|otp|code$|codeHash|credentials/i;

/** Masks PII and secrets recursively for audit logs, exports and logs (§9.5). */
export function maskPii(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => maskPii(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') {
      if (SECRET_KEYS.test(k) && k !== 'credentialsRef') out[k] = '[redacted]';
      else if (/nationalId|nationalCode/i.test(k)) out[k] = maskNationalId(v);
      else if (/^(phone|phoneE164|contactNumber|recipient)$/i.test(k) && v.startsWith('+98')) out[k] = maskPhone(v);
      else if (/iban/i.test(k)) out[k] = maskIban(v);
      else if (/dateOfBirth|dob/i.test(k)) out[k] = '****-**-**';
      else out[k] = v;
    } else {
      out[k] = maskPii(v, depth + 1);
    }
  }
  return out;
}
