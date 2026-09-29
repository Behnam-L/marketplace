import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';

/**
 * Wraps scheduled jobs: honours JOBS_ENABLED, prevents overlapping runs of the same
 * job in this process and logs failures. Jobs remain callable directly (tests, re-drive).
 */
@Injectable()
export class JobsGate {
  private readonly logger = new Logger('Jobs');
  private readonly running = new Set<string>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.jobsEnabled;
  }

  async run<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (!this.config.jobsEnabled || this.running.has(name)) return undefined;
    this.running.add(name);
    try {
      return await fn();
    } catch (e) {
      this.logger.error(`job ${name} failed: ${(e as Error).message}`, (e as Error).stack);
      return undefined;
    } finally {
      this.running.delete(name);
    }
  }
}
