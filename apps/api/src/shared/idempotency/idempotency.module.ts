import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecord } from './idempotency-record.entity';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  providers: [IdempotencyService, { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
