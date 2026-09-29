import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { ConsumersModule } from '../consumers/consumers.module';
import { CreditProvidersModule } from '../credit-providers/credit-providers.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { PaymentsModule } from '../payments/payments.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { WalletModule } from '../wallet/wallet.module';
import { Order, OrderEvent } from './order.entity';
import { OrdersService } from './orders.service';
import { MerchantOrdersController, OrdersAdminController } from './orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderEvent]),
    AccountingModule,
    ConsumersModule,
    CreditProvidersModule,
    MerchantsModule,
    PaymentsModule,
    SettlementsModule,
    WalletModule,
  ],
  controllers: [OrdersAdminController, MerchantOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
