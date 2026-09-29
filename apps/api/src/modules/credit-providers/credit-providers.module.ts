import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { CreditProvider, ProviderCallLog } from './credit-provider.entity';
import { CreditProvidersService } from './credit-providers.service';
import { ProviderGatewayService } from './provider-gateway.service';
import { CreditProvidersController } from './credit-providers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditProvider, ProviderCallLog]), FilesModule, SettlementsModule],
  controllers: [CreditProvidersController],
  providers: [CreditProvidersService, ProviderGatewayService],
  exports: [CreditProvidersService, ProviderGatewayService],
})
export class CreditProvidersModule {}
