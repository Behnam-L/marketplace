import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateCredit,
  applyBpsHalfUp,
  largestRemainder,
  mulDivHalfUp,
  rialToToman,
  splitCash,
  splitInstallments,
} from './money';
import {
  endOfJalaliMonthMaturity,
  isLeapJalaliYear,
  isoToJalali,
  jalaliToIso,
  tehranDateOf,
  addDaysIso,
} from './jalali';
import {
  isValidIban,
  isValidLegalNationalId,
  isValidNationalCode,
  maskPhone,
  normalisePhone,
  normaliseText,
} from './validators';
import { defaultSettings, validateSettingValue } from './settings';

test('BR-CALC-03 v1 example', () => {
  const { cashAmount, creditAmount } = splitCash(20_000_000, 2500, false);
  assert.equal(cashAmount, 5_000_000);
  const r = allocateCredit(creditAmount, [
    { providerId: 'prv_a', availableAmount: 6_000_000 },
    { providerId: 'prv_b', availableAmount: 9_000_000 },
  ]);
  assert.deepEqual(r, {
    ok: true,
    allocations: [
      { providerId: 'prv_a', amount: 6_000_000 },
      { providerId: 'prv_b', amount: 9_000_000 },
    ],
  });
});

test('BR-CALC-03 largest remainder example', () => {
  const { cashAmount, creditAmount } = splitCash(10_000_001, 2500, false);
  assert.equal(cashAmount, 2_500_000);
  assert.equal(creditAmount, 7_500_001);
  const r = allocateCredit(creditAmount, [
    { providerId: 'prv_a', availableAmount: 3_000_000 },
    { providerId: 'prv_b', availableAmount: 7_000_000 },
  ]);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.allocations.map((a) => a.amount), [2_250_000, 5_250_001]);
});

test('insufficient and empty selection', () => {
  assert.deepEqual(allocateCredit(100, []), { ok: false, code: 'NO_SELECTION' });
  assert.deepEqual(allocateCredit(100, [{ providerId: 'a', availableAmount: 99 }]), {
    ok: false,
    code: 'INSUFFICIENT_CREDIT',
  });
});

test('E-42: 1 Toman across 2 providers → (1, 0)', () => {
  const r = allocateCredit(1, [
    { providerId: 'prv_a', availableAmount: 500 },
    { providerId: 'prv_b', availableAmount: 500 },
  ]);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.allocations, [{ providerId: 'prv_a', amount: 1 }]);
});

test('largest remainder never exceeds weights and sums exactly', () => {
  for (let i = 0; i < 200; i++) {
    const w = [1 + ((i * 7919) % 1000), 1 + ((i * 104729) % 777), 1 + ((i * 31) % 97)];
    const total = w.reduce((a, b) => a + b, 0);
    const k = (i * 13) % (total + 1);
    const res = largestRemainder(k, w.map((weight, j) => ({ id: `p${j}`, weight })));
    let sum = 0;
    w.forEach((weight, j) => {
      const s = res.get(`p${j}`) ?? 0;
      assert.ok(s <= weight);
      sum += s;
    });
    assert.equal(sum, k);
  }
});

test('rounding rules', () => {
  assert.equal(applyBpsHalfUp(20_000_000, 300), 600_000);
  assert.equal(applyBpsHalfUp(1, 5000), 1); // 0.5 → 1
  assert.equal(applyBpsHalfUp(1, 4999), 0);
  assert.equal(mulDivHalfUp(3_000_000, 600_000, 20_000_000), 90_000);
  assert.deepEqual(splitInstallments(10_000_001, 3), [3_333_333, 3_333_333, 3_333_335]);
  assert.equal(rialToToman(12_345_679), 1_234_567);
  assert.equal(rialToToman(-5), 0);
  assert.deepEqual(splitCash(1000, 0, false), { cashAmount: 0, creditAmount: 1000 });
});

test('Jalali conversion', () => {
  assert.deepEqual(isoToJalali('2026-09-29'), { jy: 1405, jm: 7, jd: 7 });
  assert.equal(jalaliToIso({ jy: 1405, jm: 1, jd: 1 }), '2026-03-21');
  assert.equal(isLeapJalaliYear(1403), true);
  assert.equal(isLeapJalaliYear(1404), false);
  // Cross-check against ICU's Persian calendar across several years.
  const fmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  let iso = '2020-01-01';
  for (let i = 0; i < 3000; i++) {
    const parts = fmt.formatToParts(new Date(`${iso}T12:00:00Z`));
    const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value.replace(/\D/g, ''));
    assert.deepEqual(isoToJalali(iso), { jy: get('year'), jm: get('month'), jd: get('day') }, iso);
    iso = addDaysIso(iso, 1);
  }
});

test('BR-SET-04 maturity example', () => {
  assert.equal(endOfJalaliMonthMaturity('2026-09-29', 1), jalaliToIso({ jy: 1405, jm: 7, jd: 30 }));
  assert.equal(endOfJalaliMonthMaturity('2026-09-29', 2), jalaliToIso({ jy: 1405, jm: 8, jd: 30 }));
  assert.equal(endOfJalaliMonthMaturity('2026-09-29', 3), jalaliToIso({ jy: 1405, jm: 9, jd: 30 }));
  // E-43: completed on the last day of a month → first installment same day.
  const last = jalaliToIso({ jy: 1405, jm: 7, jd: 30 });
  assert.equal(endOfJalaliMonthMaturity(last, 1), last);
  // Esfand crossing into the next year.
  assert.equal(endOfJalaliMonthMaturity(jalaliToIso({ jy: 1405, jm: 12, jd: 5 }), 2), jalaliToIso({ jy: 1406, jm: 1, jd: 31 }));
});

test('Tehran calendar date', () => {
  assert.equal(tehranDateOf(new Date('2026-09-29T21:00:00Z')), '2026-09-30');
  assert.equal(tehranDateOf(new Date('2026-09-29T20:00:00Z')), '2026-09-29');
});

test('validators', () => {
  assert.equal(normalisePhone('09121233503'), '+989121233503');
  assert.equal(normalisePhone('۰۹۱۲۱۲۳۳۵۰۳'), '+989121233503');
  assert.equal(normalisePhone('+989121233503'), '+989121233503');
  assert.equal(normalisePhone('00989121233503'), '+989121233503');
  assert.equal(normalisePhone('0212233'), null);
  assert.equal(maskPhone('+989121233503'), '0912***3503');
  assert.equal(isValidNationalCode('0499370899'), true);
  assert.equal(isValidNationalCode('0499370898'), false);
  assert.equal(isValidNationalCode('1111111111'), false);
  assert.equal(isValidLegalNationalId('10380284790'), true);
  assert.equal(isValidLegalNationalId('10380284791'), false);
  assert.equal(isValidIban('IR062960000000100324200001'), true);
  assert.equal(isValidIban('IR062960000000100324200002'), false);
  assert.equal(normaliseText('  علي كريمي '), 'علی کریمی');
});

test('settings validation', () => {
  const cur = defaultSettings();
  assert.equal(validateSettingValue('cashPaymentBps', 10000, cur), null);
  assert.notEqual(validateSettingValue('cashPaymentBps', 10001, cur), null);
  assert.notEqual(validateSettingValue('cashPaymentBps', 1.5, cur), null);
  assert.notEqual(validateSettingValue('minOrderAmount', cur.maxOrderAmount + 1, cur), null);
  assert.equal(validateSettingValue('allowCashOnly', false, cur), null);
});
