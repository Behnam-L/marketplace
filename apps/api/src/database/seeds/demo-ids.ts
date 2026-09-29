/** Deterministic, checksum-valid identifiers for demo seed data. */
export function legalNationalId(seed: number): string {
  const body = `1${String(seed % 1_000_000_000).padStart(9, '0')}`;
  const d = body.split('').map(Number);
  const w = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
  const dec = d[9] + 2;
  let s = 0;
  for (let i = 0; i < 10; i++) s += (d[i] + dec) * w[i];
  let r = s % 11;
  if (r === 10) r = 0;
  return body + String(r);
}

export function personalCode(seed: number): string {
  const body = String(100000000 + (seed % 800000000)).slice(0, 9);
  const d = body.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
  const r = sum % 11;
  return body + String(r < 2 ? r : 11 - r);
}

export function iban(seed: number): string {
  const bban = String(seed).padStart(22, '0').slice(-22);
  let rem = 0;
  for (const ch of `${bban}182700`) rem = (rem * 10 + Number(ch)) % 97;
  return `IR${String(98 - rem).padStart(2, '0')}${bban}`;
}
