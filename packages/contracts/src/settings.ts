/** Typed system settings with defaults and inclusive ranges (PRD §4.2). */
export interface IntSettingDef {
  type: 'int';
  default: number;
  min: number;
  max?: number;
  description: string;
}
export interface BoolSettingDef {
  type: 'bool';
  default: boolean;
  description: string;
}
export type SettingDef = IntSettingDef | BoolSettingDef;

export const SETTINGS = {
  cashPaymentBps: { type: 'int', default: 2500, min: 0, max: 10000, description: 'Cash share of every order (basis points)' },
  allowCashOnly: { type: 'bool', default: true, description: 'Consumer may pay the full amount by bank card' },
  minOrderAmount: { type: 'int', default: 100_000, min: 1_000, description: 'Minimum order amount (Toman)' },
  maxOrderAmount: { type: 'int', default: 1_000_000_000, min: 1_000, description: 'Maximum order amount (Toman)' },
  sessionTtlMinutes: { type: 'int', default: 30, min: 10, max: 120, description: 'Checkout session lifetime before confirm' },
  paymentHoldMinutes: { type: 'int', default: 15, min: 5, max: 60, description: 'Payment deadline after confirm' },
  bankMinRemainingSeconds: { type: 'int', default: 120, min: 0, max: 600, description: 'Minimum time left to start a bank payment' },
  bankPendingMaxSeconds: { type: 'int', default: 1800, min: 600, max: 3600, description: 'Max time a bank transaction may stay unresolved' },
  otpTtlSeconds: { type: 'int', default: 120, min: 60, max: 600, description: 'OTP code lifetime' },
  otpMaxAttempts: { type: 'int', default: 5, min: 3, max: 10, description: 'Wrong OTP codes before lockout' },
  otpResendCooldownSeconds: { type: 'int', default: 60, min: 30, max: 300, description: 'Wait between OTP sends' },
  otpMaxResends: { type: 'int', default: 3, min: 1, max: 10, description: 'Max OTP resends per order' },
  identityMaxMismatchesPerOrder: { type: 'int', default: 5, min: 3, max: 10, description: 'Identity mismatches per order before lockout' },
  identityMaxMismatchesPerPhone24h: { type: 'int', default: 10, min: 5, max: 50, description: 'Identity mismatches per phone per 24h before cooldown' },
  phoneLockoutsBeforeCooldown: { type: 'int', default: 3, min: 1, max: 10, description: 'OTP lockouts per phone in 24h before cooldown' },
  phoneCooldownHours: { type: 'int', default: 24, min: 1, max: 168, description: 'Phone cooldown duration' },
  linkageRematchDays: { type: 'int', default: 30, min: 1, max: 365, description: 'Days before a verified phone↔ID linkage is re-matched' },
  providerInquiryTimeoutMs: { type: 'int', default: 8000, min: 2000, max: 20000, description: 'Per-provider credit inquiry deadline' },
  providerCallTimeoutMs: { type: 'int', default: 10000, min: 2000, max: 20000, description: 'Per-provider call timeout (reserve/allocate/release)' },
  maxInquiryAttempts: { type: 'int', default: 3, min: 1, max: 5, description: 'Credit inquiries per order' },
  maxReservationAttempts: { type: 'int', default: 3, min: 1, max: 5, description: 'Reservation attempts per order' },
  merchantCashSettlementDelayDays: { type: 'int', default: 1, min: 0, max: 7, description: 'Days until the merchant cash-settlement document matures' },
  invoiceDueDays: { type: 'int', default: 3, min: 0, max: 30, description: 'Invoice due date offset' },
  manualDocApprovalThreshold: { type: 'int', default: 50_000_000, min: 0, description: 'Manual document amount above which four-eyes approval is required' },
  checkoutKillSwitch: { type: 'bool', default: false, description: 'Stop all new checkouts' },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingsValues = {
  [K in SettingKey]: (typeof SETTINGS)[K]['type'] extends 'bool' ? boolean : number;
};
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function defaultSettings(): SettingsValues {
  const out: Record<string, number | boolean> = {};
  for (const k of SETTING_KEYS) out[k] = SETTINGS[k].default;
  return out as SettingsValues;
}

/**
 * Validates a single setting value against its type and range. Cross-field rule:
 * `minOrderAmount ≤ maxOrderAmount` (checked with the other current value).
 */
export function validateSettingValue(
  key: SettingKey,
  value: unknown,
  current: SettingsValues,
): string | null {
  const def: SettingDef = SETTINGS[key];
  if (def.type === 'bool') {
    return typeof value === 'boolean' ? null : 'Value must be true or false.';
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return 'Value must be an integer.';
  if (value < def.min) return `Value must be at least ${def.min}.`;
  if (def.max !== undefined && value > def.max) return `Value must be at most ${def.max}.`;
  if (key === 'minOrderAmount' && value > current.maxOrderAmount) return 'Minimum order amount cannot exceed the maximum.';
  if (key === 'maxOrderAmount' && value < current.minOrderAmount) return 'Maximum order amount cannot be below the minimum.';
  return null;
}
