import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumersModule } from '../consumers/consumers.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { RefundsModule } from '../refunds/refunds.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { WalletModule } from '../wallet/wallet.module';
import { ExportJob } from './export.entity';
import { ExportsService } from './exports.service';
import { ExportSources } from './exports.sources';
import { ExportsController } from './exports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportJob]),
    ConsumersModule,
    FilesModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    ReconciliationModule,
    RefundsModule,
    SettlementsModule,
    WalletModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService, ExportSources],
})
export class ExportsModule {}
