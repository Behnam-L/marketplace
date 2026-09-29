import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting, SystemSettingChange } from './system-setting.entity';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsController } from './system-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting, SystemSettingChange])],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
