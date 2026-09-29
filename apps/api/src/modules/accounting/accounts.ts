import type { CounterpartyType } from '@bajet/contracts';

/** Chart of accounts (BR-LED-02). */
export const Accounts = {
  pspClearing: (gatewayCode: string): string => `PSP_CLEARING:${gatewayCode}`,
  bankOperating: 'BANK_OPERATING',
  allocationSuspense: 'ALLOCATION_SUSPENSE',
  unallocatedCash: 'UNALLOCATED_CASH',
  counterparty: (type: CounterpartyType, id: string): string => `CP:${type.toUpperCase()}:${id}`,
  merchant: (id: string): string => `CP:MERCHANT:${id}`,
  provider: (id: string): string => `CP:PROVIDER:${id}`,
  consumer: (id: string): string => `CP:CONSUMER:${id}`,
  commissionRevenue: 'COMMISSION_REVENUE',
  providerMarginExpense: 'PROVIDER_MARGIN_EXPENSE',
  pspFeeExpense: 'PSP_FEE_EXPENSE',
  adjustments: 'ADJUSTMENTS',
} as const;

export interface PostingLine {
  account: string;
  debit?: number;
  credit?: number;
}
