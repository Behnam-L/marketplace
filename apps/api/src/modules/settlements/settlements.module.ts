import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { Invoice, MerchantSettlementPlan, NumberSequence, ProviderSettlementPlan, SettlementDocument } from './settlement.entity';
import { CounterpartyRegistry } from './counterparties';
import { PlansService } from './plans.service';
import { DocumentsService } from './documents.service';
import { InvoicesService } from './invoices.service';
import { SettlementTermsService } from './settlement-terms.service';
import { PlansController, SettlementsController } from './settlements.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderSettlementPlan, MerchantSettlementPlan, SettlementDocument, Invoice, NumberSequence]),
    AccountingModule,
    SystemSettingsModule,
  ],
  controllers: [PlansController, SettlementsController],
  providers: [CounterpartyRegistry, PlansService, DocumentsService, InvoicesService, SettlementTermsService],
  exports: [CounterpartyRegistry, PlansService, DocumentsService, InvoicesService, SettlementTermsService],
})
export class SettlementsModule {}
