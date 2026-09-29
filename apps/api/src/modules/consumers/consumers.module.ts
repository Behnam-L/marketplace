import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { ConsumerUser, IdentityAttempt, IdentityLinkage } from './consumer.entity';
import { ConsumersService } from './consumers.service';
import { ConsumersController } from './consumers.controller';
import { IDENTITY_VERIFIER, MockIdentityVerifier } from './identity-verifier';

@Module({
  imports: [TypeOrmModule.forFeature([ConsumerUser, IdentityLinkage, IdentityAttempt]), SystemSettingsModule, SettlementsModule],
  controllers: [ConsumersController],
  providers: [ConsumersService, { provide: IDENTITY_VERIFIER, useValue: new MockIdentityVerifier() }],
  exports: [ConsumersService, IDENTITY_VERIFIER],
})
export class ConsumersModule {}
