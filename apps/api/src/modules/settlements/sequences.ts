import { EntityManager } from 'typeorm';
import { formatJalali, isoToJalali, tehranDateOf } from '@bajet/contracts';

export async function nextSequence(m: EntityManager, scope: string): Promise<number> {
  const rows: { last_value: number }[] = await m.query(
    `INSERT INTO number_sequence (scope, last_value) VALUES ($1, 1)
     ON CONFLICT (scope) DO UPDATE SET last_value = number_sequence.last_value + 1 RETURNING last_value`,
    [scope],
  );
  return rows[0].last_value;
}

/** BR-DOC-01: `PD-`/`RD-`/`PI-`/`RI-` + Jalali yyyymmdd + 6-digit daily sequence. */
export async function nextDailyNumber(m: EntityManager, prefix: 'PD' | 'RD' | 'PI' | 'RI', at = new Date()): Promise<string> {
  const jalali = formatJalali(isoToJalali(tehranDateOf(at)), '');
  const seq = await nextSequence(m, `${prefix}-${jalali}`);
  return `${prefix}-${jalali}-${String(seq).padStart(6, '0')}`;
}

export async function nextPlanNumber(m: EntityManager, prefix: 'PP' | 'MP'): Promise<string> {
  const seq = await nextSequence(m, `plan-${prefix}`);
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}
