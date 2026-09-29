import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ConnectionStatus } from '@bajet/contracts';
import { newId } from '../../shared/util/ids';
import { AlertService } from '../../shared/util/alerts';
import { JobsGate } from '../../shared/util/jobs-gate';
import { TimeoutError, withTimeout } from '../../shared/util/async';
import { CreditProvider, ProviderCallLog } from './credit-provider.entity';
import { MockProviderAdapter } from './adapters/mock-provider.adapter';
import { ConsumerKey, InquiryResult, OperationResult, ProviderAdapter, StatementLine, StatusResult } from './adapters/provider-adapter';

interface Sample {
  at: number;
  ok: boolean;
  latencyMs: number;
}

interface Health {
  samples: Sample[];
  consecutiveProbeFailures: number;
  consecutiveProbeSuccesses: number;
}

const WINDOW_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 5000;

/** BR-PRV-01 health decision (pure, unit-tested). */
export function nextConnectionStatus(
  current: ConnectionStatus,
  h: { consecutiveProbeFailures: number; consecutiveProbeSuccesses: number; errorRate: number; p95LatencyMs: number; sampleCount: number },
): ConnectionStatus {
  if (h.consecutiveProbeFailures >= 3) return 'Disconnected';
  const degraded = h.sampleCount > 0 && (h.errorRate >= 0.2 || h.p95LatencyMs > 5000);
  if (current === 'Disconnected') {
    if (h.consecutiveProbeSuccesses >= 3) return degraded ? 'Degraded' : 'Connected';
    return 'Disconnected';
  }
  if (current === 'Connected') return degraded ? 'Degraded' : 'Connected';
  // Degraded → Connected requires 3 consecutive successes and clear thresholds.
  if (!degraded && h.consecutiveProbeSuccesses >= 3) return 'Connected';
  return 'Degraded';
}

export function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
}

/**
 * Calls provider adapters with timeouts, logs every call (ProviderCallLog) and
 * tracks health from probes + live calls. Connection status is system-managed.
 */
@Injectable()
export class ProviderGatewayService {
  private readonly logger = new Logger(ProviderGatewayService.name);
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly health = new Map<string, Health>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: AlertService,
    private readonly jobs: JobsGate,
  ) {}

  /** Resolves the adapter implementation for a provider (only mocks ship offline). */
  adapterFor(providerId: string): ProviderAdapter {
    let a = this.adapters.get(providerId);
    if (!a) {
      a = new MockProviderAdapter(providerId);
      this.adapters.set(providerId, a);
    }
    return a;
  }

  /** Test/demo hook for the mock adapter. */
  mock(providerId: string): MockProviderAdapter {
    return this.adapterFor(providerId) as MockProviderAdapter;
  }

  private healthOf(providerId: string): Health {
    let h = this.health.get(providerId);
    if (!h) {
      h = { samples: [], consecutiveProbeFailures: 0, consecutiveProbeSuccesses: 0 };
      this.health.set(providerId, h);
    }
    return h;
  }

  private record(providerId: string, ok: boolean, latencyMs: number): void {
    const h = this.healthOf(providerId);
    const now = Date.now();
    h.samples.push({ at: now, ok, latencyMs });
    while (h.samples.length && h.samples[0].at < now - WINDOW_MS) h.samples.shift();
  }

  private async call<T>(
    providerId: string,
    operation: string,
    timeoutMs: number,
    fn: (a: ProviderAdapter) => Promise<T>,
    ptxId: string | null,
    request: object | null,
  ): Promise<T> {
    const started = Date.now();
    let outcome = 'ok';
    let response: object | null = null;
    try {
      const result = await withTimeout(fn(this.adapterFor(providerId)), timeoutMs);
      response = (typeof result === 'object' && result !== null ? result : { result }) as object;
      if (operation === 'inquire' || operation === 'statement') response = { kind: (result as { kind?: string }).kind ?? 'ok' };
      return result;
    } catch (e) {
      outcome = e instanceof TimeoutError ? 'timeout' : 'error';
      response = { error: (e as Error).message.slice(0, 200) };
      throw e;
    } finally {
      const latencyMs = Date.now() - started;
      this.record(providerId, outcome === 'ok', latencyMs);
      this.ds.manager
        .insert(ProviderCallLog, {
          id: newId('pcl'),
          providerTransactionId: ptxId,
          providerId,
          operation,
          request,
          response,
          httpStatus: outcome === 'ok' ? 200 : null,
          latencyMs,
          outcome,
        })
        .catch((err: unknown) => this.logger.warn(`call log insert failed: ${(err as Error).message}`));
    }
  }

  inquire(providerId: string, key: ConsumerKey, timeoutMs: number): Promise<InquiryResult> {
    return this.call(providerId, 'inquire', timeoutMs, (a) => a.inquire(key), null, { keyType: key.type });
  }

  reserve(providerId: string, ref: string, key: ConsumerKey, amount: number, timeoutMs: number): Promise<OperationResult> {
    return this.call(providerId, 'reserve', timeoutMs, (a) => a.reserve(ref, key, amount), ref, { ref, amount, keyType: key.type });
  }

  allocate(providerId: string, ref: string, reservationRef: string, timeoutMs: number): Promise<OperationResult> {
    return this.call(providerId, 'allocate', timeoutMs, (a) => a.allocate(ref, reservationRef), ref, { ref, reservationRef });
  }

  release(providerId: string, ref: string, reservationRef: string, timeoutMs: number): Promise<OperationResult> {
    return this.call(providerId, 'release', timeoutMs, (a) => a.release(ref, reservationRef), ref, { ref, reservationRef });
  }

  reverse(providerId: string, ref: string, allocationRef: string, amount: number, timeoutMs: number): Promise<OperationResult> {
    return this.call(providerId, 'reverse', timeoutMs, (a) => a.reverse(ref, allocationRef, amount), ref, { ref, allocationRef, amount });
  }

  status(providerId: string, ref: string, timeoutMs: number): Promise<StatusResult> {
    return this.call(providerId, 'status', timeoutMs, (a) => a.status(ref), ref, { ref });
  }

  statement(providerId: string, date: string, timeoutMs = 30_000): Promise<StatementLine[]> {
    return this.call(providerId, 'statement', timeoutMs, (a) => a.statement(date), null, { date });
  }

  /** Recent call log for a provider transaction (admin technical log). */
  async callLog(ptxId: string): Promise<ProviderCallLog[]> {
    return this.ds.manager.find(ProviderCallLog, { where: { providerTransactionId: ptxId }, order: { createdAt: 'ASC' } });
  }

  /** One probe round + status evaluation for every provider (BR-PRV-01). */
  async probeAll(): Promise<void> {
    const providers = await this.ds.manager.find(CreditProvider);
    await Promise.all(
      providers.map(async (p) => {
        const h = this.healthOf(p.id);
        try {
          await this.call(p.id, 'probe', PROBE_TIMEOUT_MS, (a) => a.probe(), null, null);
          h.consecutiveProbeSuccesses += 1;
          h.consecutiveProbeFailures = 0;
        } catch {
          h.consecutiveProbeFailures += 1;
          h.consecutiveProbeSuccesses = 0;
        }
        await this.evaluate(p);
      }),
    );
  }

  private async evaluate(p: CreditProvider): Promise<void> {
    const h = this.healthOf(p.id);
    const samples = h.samples.filter((s) => s.at >= Date.now() - WINDOW_MS);
    const errors = samples.filter((s) => !s.ok).length;
    const next = nextConnectionStatus(p.connectionStatus, {
      consecutiveProbeFailures: h.consecutiveProbeFailures,
      consecutiveProbeSuccesses: h.consecutiveProbeSuccesses,
      errorRate: samples.length ? errors / samples.length : 0,
      p95LatencyMs: p95(samples.map((s) => s.latencyMs)),
      sampleCount: samples.length,
    });
    if (next === p.connectionStatus) return;
    const r = await this.ds.manager.update(
      CreditProvider,
      { id: p.id, connectionStatus: p.connectionStatus },
      { connectionStatus: next, connectionStatusChangedAt: new Date() },
    );
    if (r.affected) {
      this.alerts.raise('Operations', 'PROVIDER_CONNECTION_CHANGED', { providerId: p.id, from: p.connectionStatus, to: next });
    }
  }

  @Interval('provider-health', 30_000)
  async healthJob(): Promise<void> {
    await this.jobs.run('provider-health', () => this.probeAll());
  }

  /** Test helper: forget health history. */
  resetHealth(): void {
    this.health.clear();
  }
}
