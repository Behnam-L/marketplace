import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { Merchant, MerchantApiKey, MerchantWebhookEvent } from './merchant.entity';
import { MerchantsService } from './merchants.service';
import { WebhooksService } from './webhooks.service';
import { MerchantsController } from './merchants.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, MerchantApiKey, MerchantWebhookEvent]), FilesModule, SettlementsModule],
  controllers: [MerchantsController],
  providers: [MerchantsService, WebhooksService],
  exports: [MerchantsService, WebhooksService],
})
export class MerchantsModule {}
