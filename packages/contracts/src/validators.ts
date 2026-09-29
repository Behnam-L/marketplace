/** Field validation rules shared by API and UI (PRD §9.3). */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Converts Persian/Arabic-Indic digits to ASCII. */
export function toAsciiDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    const a = ARABIC_DIGITS.indexOf(ch);
    out += p >= 0 ? String(p) : a >= 0 ? String(a) : ch;
  }
  return out;
}

/** Trim, NFC, Arabic ي/ك → Persian ی/ک. */
export function normaliseText(input: string): string {
  return input.trim().normalize('NFC').replace(/ي/g, 'ی').replace(/ك/g, 'ک');
}

/** Normalises `+98`/`0098`/`0` prefixes to E.164; returns null if invalid. */
export function normalisePhone(input: string): string | null {
  let s = toAsciiDigits(input).replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = s.slice(3);
  else if (s.startsWith('0098')) s = s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0')) s = s.slice(1);
  const e164 = `+98${s}`;
  return /^\+989\d{9}$/.test(e164) ? e164 : null;
}

/** `+989121233503` → `0912***3503` (FR-010). */
export function maskPhone(e164: string): string {
  const local = e164.startsWith('+98') ? `0${e164.slice(3)}` : e164;
  if (local.length < 8) return '***';
  return `${local.slice(0, 4)}***${local.slice(-4)}`;
}

/** Personal national code: 10 digits, Iranian checksum, not all-same-digit. */
export function isValidNationalCode(input: string): boolean {
  const s = toAsciiDigits(input);
  if (!/^\d{10}$/.test(s)) return false;
  if (/^(\d)\1{9}$/.test(s)) return false;
  const digits = s.split('').map(Number);
  const check = digits[9];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  const r = sum % 11;
  return r < 2 ? check === r : check === 11 - r;
}

/** Legal-entity national ID: 11 digits with the legal-entity checksum. */
export function isValidLegalNationalId(input: string): boolean {
  const s = toAsciiDigits(input);
  if (!/^\d{11}$/.test(s)) return false;
  if (/^(\d)\1{10}$/.test(s)) return false;
  const d = s.split('').map(Number);
  const weights = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
  const decimal = d[9] + 2;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] + decimal) * weights[i];
  let r = sum % 11;
  if (r === 10) r = 0;
  return r === d[10];
}

/** Economic ID: digits, 11–12 length (S-05). */
export function isValidEconomicId(input: string): boolean {
  return /^\d{11,12}$/.test(toAsciiDigits(input));
}

/** IBAN: `^IR\d{24}$` + ISO 13616 mod-97. */
export function isValidIban(input: string): boolean {
  const s = toAsciiDigits(input).replace(/\s/g, '').toUpperCase();
  if (!/^IR\d{24}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    numeric += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  }
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

export const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const OTP_PATTERN = /^\d{5}$/;

export function isValidHttpsUrl(input: string): boolean {
  if (input.length > 2048) return false;
  try {
    const u = new URL(input);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function maskNationalId(id: string): string {
  if (id.length <= 4) return '****';
  return `${'*'.repeat(id.length - 4)}${id.slice(-4)}`;
}

export function maskIban(iban: string): string {
  if (iban.length <= 8) return '****';
  return `${iban.slice(0, 4)}${'*'.repeat(iban.length - 8)}${iban.slice(-4)}`;
}

/** Password policy (§9.1): ≥ 12 chars and not in the breached list. */
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
