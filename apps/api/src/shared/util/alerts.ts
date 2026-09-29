import { Injectable, Logger } from '@nestjs/common';

export type AlertAudience = 'Operations' | 'Finance' | 'Engineering';

/**
 * Operational alerts. No paging integration exists offline, so alerts are emitted
 * as structured `warn` log lines (`ALERT {...}`) that a log shipper can route.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger('Alert');
  readonly recent: { at: string; audience: AlertAudience; code: string; detail: Record<string, unknown> }[] = [];

  raise(audience: AlertAudience, code: string, detail: Record<string, unknown> = {}): void {
    const entry = { at: new Date().toISOString(), audience, code, detail };
    this.recent.push(entry);
    if (this.recent.length > 200) this.recent.shift();
    this.logger.warn(`ALERT ${JSON.stringify(entry)}`);
  }
}
