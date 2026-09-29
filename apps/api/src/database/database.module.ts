import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { typeormOptions } from './typeorm.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ ...typeormOptions(config.databaseUrl), entities: [], autoLoadEntities: true }),
    }),
  ],
})
export class DatabaseModule {}
