import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { as, idemKey, type TestAdmin } from './admin-session';

/** Valid personal national code derived from a seed (checksum computed). */
export function nationalCode(seed: number): string {
  const body = String(100000000 + (seed % 800000000)).slice(0, 9).padStart(9, '0');
  const d = body.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
  const r = sum % 11;
  return body + String(r < 2 ? r : 11 - r);
}

/** Valid 11-digit legal-entity national ID derived from a seed. */
export function legalId(seed: number): string {
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

/** Valid Iranian IBAN derived from a seed. */
export function iban(seed: number): string {
  const bban = String(seed).padStart(22, '0').slice(-22);
  const numeric = `${bban}1827` + '00'; // "IR" = 18 27
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, '0');
  return `IR${check}${bban}`;
}

let seq = 1;
export const nextSeed = (): number => (seq += 7919);

export async function createMerchantPlan(app: INestApplication, admin: TestAdmin, over: Record<string, unknown> = {}): Promise<string> {
  const r = await as(app, admin)
    .post('/v1/admin/merchant-settlement-plans')
    .send({ merchantReceivableMarginBps: 300, cashSettlementEnabled: true, cashSettlementBps: 3000, installmentCount: 2, maturityRule: 'EndOfJalaliMonth', ...over })
    .expect(201);
  return r.body.id;
}

export async function createProviderPlan(app: INestApplication, admin: TestAdmin, over: Record<string, unknown> = {}): Promise<string> {
  const r = await as(app, admin)
    .post('/v1/admin/provider-settlement-plans')
    .send({ providerPayableMarginBps: 100, installmentCount: 1, maturityRule: 'EndOfJalaliMonth', ...over })
    .expect(201);
  return r.body.id;
}

export function merchantBody(planId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const s = nextSeed();
  return {
    displayName: `فروشگاه ${s}`,
    entityType: 'Legal',
    legalName: `شرکت ${s}`,
    nationalId: legalId(s),
    economicId: String(41100000000 + s),
    managerName: 'مدیر فروشگاه',
    managerNationalCode: nationalCode(s),
    contactNumber: '02188776655',
    websiteUrl: 'https://shop.example.com',
    officeAddress: 'تهران، خیابان ولیعصر',
    iban: iban(s),
    contractFileId: null,
    merchantSettlementPlanId: planId,
    status: 'Enabled',
    returnUrlDomains: ['shop.example.com'],
    webhookUrl: 'https://shop.example.com/hooks/bajet',
    ...over,
  };
}

export function providerBody(planId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const s = nextSeed();
  return {
    legalName: `اعتبار ${s}`,
    displayName: `اعتبار ${s}`,
    iconFileId: null,
    nationalId: legalId(s + 3),
    economicId: String(42200000000 + s),
    websiteUrl: 'https://lender.example.com',
    contactNumber: '02122334455',
    officeAddress: 'تهران',
    iban: iban(s + 3),
    contractFileId: null,
    providerSettlementPlanId: planId,
    displayStatus: 'Enabled',
    adapterType: 'Mock',
    apiBaseUrl: 'https://api.lender.example.com',
    credentialsRef: 'vault://providers/test',
    inquiryKey: 'NationalId',
    sortOrder: 1,
    ...over,
  };
}

export async function createMerchant(app: INestApplication, admin: TestAdmin, planId: string, over: Record<string, unknown> = {}): Promise<{ id: string; version: number }> {
  const r = await as(app, admin).post('/v1/admin/merchants').set('Idempotency-Key', idemKey()).send(merchantBody(planId, over)).expect(201);
  return { id: r.body.id, version: r.body.version };
}

export async function createProvider(app: INestApplication, ds: DataSource, admin: TestAdmin, planId: string, over: Record<string, unknown> = {}): Promise<string> {
  const r = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(providerBody(planId, over)).expect(201);
  await ds.query(`UPDATE credit_provider SET connection_status = 'Connected' WHERE id = $1`, [r.body.id]);
  return r.body.id;
}

/** Bank gateways used by the checkout tests (the seed creates the same ones). */
export async function seedGateways(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO bank_gateway (id, code, name, priority, health_status, supports_reverse, supports_refund, credentials_ref)
     VALUES ('gtw_TESTMOCK', 'MOCK', 'Mock PSP', 1, 'Healthy', true, true, 'vault://psp/mock'),
            ('gtw_TESTMOCKB', 'MOCK_B', 'Mock PSP B', 2, 'Healthy', false, false, 'vault://psp/mock-b')
     ON CONFLICT (code) DO NOTHING`,
  );
}
