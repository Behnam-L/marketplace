import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumersModule } from '../consumers/consumers.module';
import { CreditProvidersModule } from '../credit-providers/credit-providers.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { WalletModule } from '../wallet/wallet.module';
import { CheckoutSession, OtpSession } from './checkout.entity';
import { CheckoutSessionService } from './checkout-session.service';
import { CheckoutFlowService } from './checkout-flow.service';
import { CheckoutPaymentsService } from './checkout-payments.service';
import { CheckoutViewService } from './checkout-view.service';
import { MerchantCheckoutService } from './merchant-checkout.service';
import { CheckoutJobs } from './checkout.jobs';
import { BankCallbackController, CheckoutController, MerchantCheckoutController } from './checkout.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckoutSession, OtpSession]),
    ConsumersModule,
    CreditProvidersModule,
    MerchantsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    ReconciliationModule,
    SystemSettingsModule,
    WalletModule,
  ],
  controllers: [MerchantCheckoutController, CheckoutController, BankCallbackController],
  providers: [CheckoutSessionService, CheckoutFlowService, CheckoutPaymentsService, CheckoutViewService, MerchantCheckoutService, CheckoutJobs],
  exports: [CheckoutFlowService, CheckoutPaymentsService, MerchantCheckoutService],
})
export class CheckoutModule {}
