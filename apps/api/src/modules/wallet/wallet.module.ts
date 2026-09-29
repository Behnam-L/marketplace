import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditProvidersModule } from '../credit-providers/credit-providers.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { CreditInquiry, CreditInquiryResult, CreditReservation, ProviderTransaction } from './wallet.entity';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditInquiry, CreditInquiryResult, CreditReservation, ProviderTransaction]),
    AccountingModule,
    CreditProvidersModule,
    ReconciliationModule,
    SystemSettingsModule,
  ],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
