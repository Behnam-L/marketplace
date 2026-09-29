import { toAsciiDigits } from '@bajet/contracts';

const nf = new Intl.NumberFormat('fa-IR');

/** Integer Toman with thousands separators, never rounded (BR-RND display). */
export function toman(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${nf.format(amount)} تومان`;
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : nf.format(n);
}

/** Basis points → percent with up to 2 decimals. */
export function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '—';
  return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(bps / 100)}٪`;
}

/** "12.5" (ASCII or Persian digits) → 1250 bps; null if invalid (UI accepts ≤ 2 decimals). */
export function percentToBps(input: string): number | null {
  const s = toAsciiDigits(input.trim()).replace('٫', '.').replace('/', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  return Number(i) * 100 + Number(f.padEnd(2, '0'));
}

/** Parses a user-entered integer amount (Persian or ASCII digits, separators allowed). */
export function parseAmount(input: string): number | null {
  const s = toAsciiDigits(input).replace(/[,،٬\s]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' });
const dateTimeFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tehran',
});

/** Jalali date for an ISO instant or calendar date. */
export function jDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00+03:30`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function jDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

export function faDigits(s: string | number): string {
  return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** mm:ss countdown in Persian digits. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return faDigits(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
}
