import type { Permission } from '@bajet/contracts';

export interface NavItem {
  to: string;
  label: string;
  perm: Permission;
}

/** FR-082: v1 WF-23 sections + Refunds, Reconciliation, Audit Log — filtered by permission. */
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'عملیات',
    items: [
      { to: '/admin/orders', label: 'سفارش‌ها', perm: 'orders.read' },
      { to: '/admin/refunds', label: 'بازپرداخت‌ها', perm: 'orders.read' },
      { to: '/admin/bank-transactions', label: 'تراکنش‌های بانکی', perm: 'transactions.read' },
      { to: '/admin/provider-transactions', label: 'تراکنش‌های اعتباری', perm: 'transactions.read' },
      { to: '/admin/reconciliation', label: 'مغایرت‌گیری', perm: 'reconciliation.read' },
    ],
  },
  {
    group: 'شرکا',
    items: [
      { to: '/admin/providers', label: 'تأمین‌کنندگان اعتبار', perm: 'providers.read' },
      { to: '/admin/merchants', label: 'فروشگاه‌ها', perm: 'merchants.read' },
    ],
  },
  { group: 'مشتریان', items: [{ to: '/admin/consumers', label: 'مشتریان', perm: 'consumers.read' }] },
  {
    group: 'مالی',
    items: [
      { to: '/admin/documents/payable', label: 'اسناد پرداختنی', perm: 'documents.read' },
      { to: '/admin/documents/receivable', label: 'اسناد دریافتنی', perm: 'documents.read' },
      { to: '/admin/invoices/payable', label: 'صورت‌حساب‌های پرداختنی', perm: 'invoices.read' },
      { to: '/admin/invoices/receivable', label: 'صورت‌حساب‌های دریافتنی', perm: 'invoices.read' },
      { to: '/admin/settlement-plans/provider', label: 'طرح‌های تسویه تأمین‌کننده', perm: 'plans.read' },
      { to: '/admin/settlement-plans/merchant', label: 'طرح‌های تسویه فروشگاه', perm: 'plans.read' },
    ],
  },
  {
    group: 'مدیریت',
    items: [
      { to: '/admin/admins', label: 'کاربران ادمین', perm: 'admins.manage' },
      { to: '/admin/roles', label: 'نقش‌ها و دسترسی‌ها', perm: 'roles.manage' },
      { to: '/admin/settings', label: 'تنظیمات سیستم', perm: 'settings.read' },
      { to: '/admin/messages/templates', label: 'قالب‌های پیام', perm: 'messages.read' },
      { to: '/admin/messages/logs', label: 'گزارش پیام‌ها', perm: 'messages.read' },
      { to: '/admin/audit-log', label: 'گزارش ممیزی', perm: 'audit.read' },
      { to: '/admin/exports', label: 'خروجی‌ها', perm: 'exports.create' },
    ],
  },
];

export function firstPermitted(can: (p: Permission) => boolean): string | null {
  for (const g of NAV) for (const i of g.items) if (can(i.perm)) return i.to;
  return null;
}
