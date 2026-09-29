import { INestApplicationContext, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlansService } from '../../modules/settlements/plans.service';
import { MerchantsService } from '../../modules/merchants/merchants.service';
import { CreditProvidersService } from '../../modules/credit-providers/credit-providers.service';
import { iban, legalNationalId, personalCode } from './demo-ids';

export const DEMO_MERCHANT_KEY_ID = 'mk_demo_store';

/**
 * Sample merchants, credit providers and settlement plans for a local demo.
 * Created through the domain services (same validation as the admin API).
 */
export async function seedDemo(app: INestApplicationContext, demoMerchantSecret: string | undefined): Promise<void> {
  const log = new Logger('Seed');
  const ds = app.get(DataSource);
  const existing: unknown[] = await ds.query(`SELECT 1 FROM merchant LIMIT 1`);
  if (existing.length) {
    log.log('demo data already present');
    return;
  }
  const plans = app.get(PlansService);
  const merchants = app.get(MerchantsService);
  const providers = app.get(CreditProvidersService);

  const mPlan = await plans.createMerchant({ merchantReceivableMarginBps: 300, cashSettlementEnabled: true, cashSettlementBps: 3000, installmentCount: 2, maturityRule: 'EndOfJalaliMonth' });
  const mPlanSimple = await plans.createMerchant({ merchantReceivableMarginBps: 250, cashSettlementEnabled: false, cashSettlementBps: null, installmentCount: 3, maturityRule: 'EndOfJalaliMonth' });
  const pPlans = [
    await plans.createProvider({ providerPayableMarginBps: 100, installmentCount: 1, maturityRule: 'EndOfJalaliMonth' }),
    await plans.createProvider({ providerPayableMarginBps: 150, installmentCount: 3, maturityRule: 'EndOfJalaliMonth' }),
    await plans.createProvider({ providerPayableMarginBps: 200, installmentCount: 2, maturityRule: 'EndOfJalaliMonth' }),
  ];

  const store = await merchants.create({
    displayName: 'فروشگاه نمونه',
    entityType: 'Legal',
    legalName: 'شرکت فروشگاه نمونه (نمایشی)',
    nationalId: legalNationalId(410001),
    economicId: '411000000011',
    managerName: 'مدیر نمونه',
    managerNationalCode: personalCode(700001),
    contactNumber: '02188000000',
    websiteUrl: 'https://shop.example.com',
    officeAddress: 'تهران، خیابان نمونه، پلاک ۱',
    iban: iban(410001),
    contractFileId: null,
    merchantSettlementPlanId: mPlan.id,
    status: 'Enabled',
    returnUrlDomains: ['shop.example.com', 'localhost'],
    webhookUrl: null,
  });
  await merchants.create({
    displayName: 'کتاب‌فروشی کوچک',
    entityType: 'Individual',
    legalName: 'سارا کریمی',
    nationalId: personalCode(700002),
    economicId: null,
    managerName: 'سارا کریمی',
    managerNationalCode: personalCode(700002),
    contactNumber: '09120000002',
    websiteUrl: 'https://books.example.com',
    officeAddress: 'اصفهان، خیابان نمونه',
    iban: iban(410002),
    contractFileId: null,
    merchantSettlementPlanId: mPlanSimple.id,
    status: 'Enabled',
    returnUrlDomains: ['books.example.com'],
    webhookUrl: null,
  });
  if (demoMerchantSecret) await merchants.createKeyWithSecret(store.id, DEMO_MERCHANT_KEY_ID, demoMerchantSecret);

  const names = ['اعتبار آبی (نمایشی)', 'وام سبز (نمایشی)', 'کیف اعتبار نارنجی (نمایشی)'];
  for (let i = 0; i < names.length; i++) {
    const p = await providers.create({
      legalName: `${names[i]} — شرکت تأمین مالی`,
      displayName: names[i],
      iconFileId: null,
      nationalId: legalNationalId(520001 + i),
      economicId: String(522000000010 + i),
      websiteUrl: `https://provider${i + 1}.example.com`,
      contactNumber: `0219000000${i}`,
      officeAddress: 'تهران',
      iban: iban(520001 + i),
      contractFileId: null,
      providerSettlementPlanId: pPlans[i].id,
      displayStatus: 'Enabled',
      adapterType: 'Mock',
      apiBaseUrl: `https://api.provider${i + 1}.example.com`,
      credentialsRef: `vault://providers/demo-${i + 1}`,
      inquiryKey: i === 2 ? 'Phone' : 'NationalId',
      sortOrder: i + 1,
    });
    // Demo providers start Connected so checkout works immediately (probes keep it current).
    await ds.query(`UPDATE credit_provider SET connection_status = 'Connected', connection_status_changed_at = now() WHERE id = $1`, [p.id]);
  }
  log.log('demo merchants, providers and plans created');
}
