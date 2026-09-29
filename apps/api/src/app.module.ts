import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { SharedModule } from './shared/shared.module';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminsModule } from './modules/admins/admins.module';
import { AuthModule } from './modules/auth/auth.module';
import { FilesModule } from './modules/files/files.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { CreditProvidersModule } from './modules/credit-providers/credit-providers.module';
import { ConsumersModule } from './modules/consumers/consumers.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    SharedModule,
    IdempotencyModule,
    SystemSettingsModule,
    AuditModule,
    NotificationsModule,
    AdminsModule,
    AuthModule,
    FilesModule,
    AccountingModule,
    SettlementsModule,
    MerchantsModule,
    CreditProvidersModule,
    ConsumersModule,
  ],
})
export class AppModule {}
