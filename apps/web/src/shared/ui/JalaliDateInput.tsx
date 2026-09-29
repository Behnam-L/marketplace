import { useEffect, useId, useState } from 'react';
import { isValidJalaliDate, isoToJalali, jalaliMonthLength, jalaliToIso, tehranDateOf } from '@bajet/contracts';
import { faDigits } from '../format/format';

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/**
 * Jalali date picker (day / month / year selects). Emits a Gregorian ISO date, or
 * null while incomplete. Calendar conversion is separate from appearance (§4.6).
 */
export function JalaliDateInput({
  label,
  value,
  onChange,
  minYear,
  maxYear,
  error,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  minYear: number;
  maxYear: number;
  error?: string | null;
}) {
  const id = useId();
  const [parts, setParts] = useState(() => (value ? isoToJalali(value) : { jy: 0, jm: 0, jd: 0 }));
  useEffect(() => {
    if (value) setParts(isoToJalali(value));
  }, [value]);
  const set = (patch: Partial<{ jy: number; jm: number; jd: number }>) => {
    const next = { ...parts, ...patch };
    if (next.jy && next.jm && next.jd) next.jd = Math.min(next.jd, jalaliMonthLength(next.jy, next.jm));
    setParts(next);
    onChange(next.jy && next.jm && next.jd && isValidJalaliDate(next.jy, next.jm, next.jd) ? jalaliToIso(next) : null);
  };
  const j = parts;
  const years = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);
  const days = Array.from({ length: j.jy && j.jm ? jalaliMonthLength(j.jy, j.jm) : 31 }, (_, i) => i + 1);
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="field__label" style={{ marginBottom: 4 }}>
        {label}
      </legend>
      <div className="dob">
        <select className="field__control" aria-label="روز" value={j.jd || ''} onChange={(e) => set({ jd: Number(e.target.value) })}>
          <option value="">روز</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {faDigits(d)}
            </option>
          ))}
        </select>
        <select className="field__control" aria-label="ماه" value={j.jm || ''} onChange={(e) => set({ jm: Number(e.target.value) })}>
          <option value="">ماه</option>
          {JALALI_MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select className="field__control" aria-label="سال" value={j.jy || ''} onChange={(e) => set({ jy: Number(e.target.value) })}>
          <option value="">سال</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {faDigits(y)}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <span id={`${id}-err`} className="field__error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}

export function currentJalaliYear(): number {
  return isoToJalali(tehranDateOf(new Date())).jy;
}
