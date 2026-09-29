/**
 * Jalali (Persian) calendar arithmetic and Asia/Tehran date helpers.
 * Algorithm: Borkowski / jalaali-js (valid for Jalali years −61…3177).
 */

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}
export interface GregorianDate {
  gy: number;
  gm: number;
  gd: number;
}

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  if (jy < jp || jy >= BREAKS[bl - 1]) throw new RangeError(`Invalid Jalali year ${jy}`);
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): GregorianDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number): GregorianDate {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
  if (jy < 1 || jy > 3177 || jm < 1 || jm > 12 || jd < 1) return false;
  return jd <= jalaliMonthLength(jy, jm);
}

/** ISO `YYYY-MM-DD` helpers (calendar dates, no time zone). */
export function parseIsoDate(iso: string): GregorianDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Invalid ISO date ${iso}`);
  return { gy: Number(m[1]), gm: Number(m[2]), gd: Number(m[3]) };
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export function formatIsoDate(g: GregorianDate): string {
  return `${pad(g.gy, 4)}-${pad(g.gm)}-${pad(g.gd)}`;
}

export function isoToJalali(iso: string): JalaliDate {
  const g = parseIsoDate(iso);
  return toJalali(g.gy, g.gm, g.gd);
}

export function jalaliToIso(j: JalaliDate): string {
  return formatIsoDate(toGregorian(j.jy, j.jm, j.jd));
}

export function formatJalali(j: JalaliDate, sep = '-'): string {
  return `${pad(j.jy, 4)}${sep}${pad(j.jm)}${sep}${pad(j.jd)}`;
}

/** Adds days to an ISO calendar date. */
export function addDaysIso(iso: string, days: number): string {
  const g = parseIsoDate(iso);
  return formatIsoDate(d2g(g2d(g.gy, g.gm, g.gd) + days));
}

export const BUSINESS_TIME_ZONE = 'Asia/Tehran';

/** Calendar date (ISO) of an instant in Asia/Tehran. */
export function tehranDateOf(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * BR-SET-04: installment k (1…N) matures on the last day of Jalali month m₀ + k − 1,
 * where m₀ is the Jalali month containing the completion date. Returns ISO date.
 */
export function endOfJalaliMonthMaturity(completedIsoDate: string, k: number): string {
  const j = isoToJalali(completedIsoDate);
  const monthIndex = j.jy * 12 + (j.jm - 1) + (k - 1);
  const jy = Math.floor(monthIndex / 12);
  const jm = (monthIndex % 12) + 1;
  return jalaliToIso({ jy, jm, jd: jalaliMonthLength(jy, jm) });
}
