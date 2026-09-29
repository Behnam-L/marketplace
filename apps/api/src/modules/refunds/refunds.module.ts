import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditProvidersModule } from '../credit-providers/credit-providers.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { WalletModule } from '../wallet/wallet.module';
import { Refund, RefundLeg } from './refund.entity';
import { RefundsService } from './refunds.service';
import { MerchantRefundsController, RefundsAdminController } from './refunds.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Refund, RefundLeg]),
    AccountingModule,
    CreditProvidersModule,
    OrdersModule,
    PaymentsModule,
    ReconciliationModule,
    SettlementsModule,
    WalletModule,
  ],
  controllers: [MerchantRefundsController, RefundsAdminController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
