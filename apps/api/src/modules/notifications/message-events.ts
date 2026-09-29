import type { MessageEventDto } from '@bajet/contracts';

/** Catalog of message events, required params and built-in fallback templates (FR-150). */
export const MESSAGE_EVENTS: (MessageEventDto & { fallback: string })[] = [
  {
    event: 'otp.sent',
    requiredParams: ['code'],
    description: 'کد تأیید پرداخت',
    fallback: 'کد تأیید باجت: {{code}}\nاین کد را در اختیار دیگران قرار ندهید.',
  },
  {
    event: 'admin.invitation',
    requiredParams: ['link'],
    description: 'لینک دعوت ادمین (۲۴ ساعت)',
    fallback: 'دعوت به پنل مدیریت باجت: {{link}}',
  },
  {
    event: 'admin.password_reset',
    requiredParams: ['link'],
    description: 'لینک بازنشانی گذرواژه ادمین',
    fallback: 'بازنشانی گذرواژه پنل باجت: {{link}}',
  },
  {
    event: 'admin.mfa_reset',
    requiredParams: ['link'],
    description: 'لینک راه‌اندازی مجدد ورود دومرحله‌ای',
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
