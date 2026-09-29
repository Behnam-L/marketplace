/** Settlement terms frozen on the order at completion (FR-052, D-13). */
export interface SettlementTermsSnapshot {
  completedAt: string;
  /** Asia/Tehran calendar date of completion. */
  completedDate: string;
  totalAmount: number;
  cashAmount: number;
  gatewayCode: string | null;
  merchant: {
    merchantId: string;
    planId: string;
    planNumber: string;
    merchantReceivableMarginBps: number;
    cashSettlementEnabled: boolean;
    cashSettlementBps: number | null;
    installmentCount: number;
    maturityRule: 'EndOfJalaliMonth';
    cashSettlementDelayDays: number;
    /** M = Bâjet commission (BR-SET-02). */
    commissionAmount: number;
  };
  providers: Record<
    string,
    {
      planId: string;
      planNumber: string;
      providerPayableMarginBps: number;
      installmentCount: number;
      maturityRule: 'EndOfJalaliMonth';
      creditAmount: number;
      /** PMₚ = margin conceded to the provider (BR-SET-01). */
      marginAmount: number;
    }
  >;
}
