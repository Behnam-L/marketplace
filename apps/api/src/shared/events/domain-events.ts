import { Injectable, Logger } from '@nestjs/common';

/**
 * In-process, awaited domain event bus (no broker). Lets lower-level modules
 * report outcomes (e.g. a provider transaction was confirmed) to the modules that
 * orchestrate them without import cycles.
 */
export interface DomainEventMap {
  'providerTx.finalized': { providerTransactionId: string };
  'bankTx.finalized': { bankTransactionId: string };
}

type Handler<K extends keyof DomainEventMap> = (payload: DomainEventMap[K]) => Promise<void> | void;

@Injectable()
export class DomainEvents {
  private readonly logger = new Logger(DomainEvents.name);
  private readonly handlers = new Map<keyof DomainEventMap, Handler<never>[]>();

  on<K extends keyof DomainEventMap>(type: K, handler: Handler<K>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as Handler<never>);
    this.handlers.set(type, list);
  }

  async emit<K extends keyof DomainEventMap>(type: K, payload: DomainEventMap[K]): Promise<void> {
    for (const h of this.handlers.get(type) ?? []) {
      try {
        await (h as Handler<K>)(payload);
      } catch (e) {
        this.logger.error(`Handler for ${type} failed: ${(e as Error).message}`, (e as Error).stack);
      }
    }
  }
}
