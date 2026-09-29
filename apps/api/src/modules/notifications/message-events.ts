import type { MessageEventDto } from '@bajet/contracts';

/** Catalog of message events, required params and built-in fallback templates (FR-150). */
export const MESSAGE_EVENTS: (MessageEventDto & { fallback: string })[] = [
  {
    event: 'otp.sent',
    requiredParams: ['code'],
    description: 'Checkout one-time password',
    fallback: 'کد تأیید باجت: {{code}}\nاین کد را در اختیار دیگران قرار ندهید.',
  },
  {
    event: 'admin.invitation',
    requiredParams: ['link'],
    description: 'Admin invitation link (24 h)',
    fallback: 'دعوت به پنل مدیریت باجت: {{link}}',
  },
  {
    event: 'admin.password_reset',
    requiredParams: ['link'],
    description: 'Admin password reset link',
    fallback: 'بازنشانی گذرواژه پنل باجت: {{link}}',
  },
  {
    event: 'admin.mfa_reset',
    requiredParams: ['link'],
    description: 'Admin two-factor re-enrolment link',
    fallback: 'راه‌اندازی مجدد ورود دومرحله‌ای باجت: {{link}}',
  },
];

export type MessageEvent = 'otp.sent' | 'admin.invitation' | 'admin.password_reset' | 'admin.mfa_reset';

export function extractParams(content: string): string[] {
  return [...new Set([...content.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
}

export function render(content: string, params: Record<string, string>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => params[k] ?? '');
}
