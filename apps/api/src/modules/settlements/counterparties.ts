import { Injectable } from '@nestjs/common';
import type { CounterpartyType } from '@bajet/contracts';

export interface CounterpartyResolver {
  /** Display names by id (missing ids are omitted). */
  names(ids: string[]): Promise<Map<string, string>>;
  exists(id: string): Promise<boolean>;
}

/**
 * Merchants, providers and consumers register how to resolve their ids so the
 * settlement module never reads their tables (no cross-module table access).
 */
@Injectable()
export class CounterpartyRegistry {
  private readonly resolvers = new Map<CounterpartyType, CounterpartyResolver>();
  private orderTotal?: (orderId: string) => Promise<number | null>;

  register(type: CounterpartyType, resolver: CounterpartyResolver): void {
    this.resolvers.set(type, resolver);
  }

  registerOrderTotalLookup(fn: (orderId: string) => Promise<number | null>): void {
    this.orderTotal = fn;
  }

  async names(type: CounterpartyType, ids: string[]): Promise<Map<string, string>> {
    const r = this.resolvers.get(type);
    return r && ids.length ? r.names([...new Set(ids)]) : new Map();
  }

  async exists(type: CounterpartyType, id: string): Promise<boolean> {
    const r = this.resolvers.get(type);
    return r ? r.exists(id) : false;
  }

  async totalOfOrder(orderId: string): Promise<number | null> {
    return this.orderTotal ? this.orderTotal(orderId) : null;
  }
}
