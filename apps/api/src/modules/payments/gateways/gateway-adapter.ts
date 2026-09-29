import type { RedirectInstruction } from '@bajet/contracts';

/**
 * Bank gateway (PSP) contract. Amounts cross this boundary in Rial (BR-MNY-03);
 * callers convert with tomanToRial / rialToToman.
 */
export interface GatewayInitResult {
  token: string;
  redirect: RedirectInstruction;
}

export type VerifyResult =
  | { status: 'Success'; amountRial: number; gatewayReference: string; cardMask: string | null }
  | { status: 'Failed'; reason: string };

export type InquiryResult =
  | { status: 'Paid'; amountRial: number; gatewayReference: string; cardMask: string | null }
  | { status: 'Unpaid' }
  | { status: 'Pending' }
  | { status: 'Reversed' };

export interface ParsedCallback {
  ref: string;
  reported: 'Success' | 'Failed' | 'Cancelled';
  amountRial: number | null;
}

export interface SettlementReportLine {
  gatewayReference: string;
  amountRial: number;
  feeRial: number;
  date: string;
}

export interface GatewayAdapter {
  readonly code: string;
  initiate(input: { ref: string; amountRial: number; callbackUrl: string }): Promise<GatewayInitResult>;
  parseCallback(payload: Record<string, unknown>): ParsedCallback | null;
  verify(input: { ref: string; token: string }): Promise<VerifyResult>;
  inquiry(input: { ref: string; token: string }): Promise<InquiryResult>;
  reverse(input: { ref: string; token: string }): Promise<void>;
  refund(input: { ref: string; amountRial: number; originalReference: string | null }): Promise<{ status: 'Success'; gatewayReference: string } | { status: 'Failed'; reason: string }>;
  settlementReport(date: string): Promise<SettlementReportLine[]>;
  isHealthy(): boolean;
}

export class GatewayUnavailableError extends Error {}
