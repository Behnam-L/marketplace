import { Global, Module } from '@nestjs/common';
import { CryptoService } from './security/crypto.service';
import { DomainEvents } from './events/domain-events';
import { AlertService } from './util/alerts';
import { RateLimiter } from './util/rate-limiter';
import { JobsGate } from './util/jobs-gate';
import { HealthController } from './health/health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [CryptoService, DomainEvents, AlertService, RateLimiter, JobsGate],
  exports: [CryptoService, DomainEvents, AlertService, RateLimiter, JobsGate],
})
export class SharedModule {}
