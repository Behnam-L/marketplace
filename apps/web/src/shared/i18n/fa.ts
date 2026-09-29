import type { ErrorCode } from '@bajet/contracts';
import { ApiError } from '../api/client';

/**
 * Persian copy. The PRD's English strings are the source text; this is the fa-IR
 * delivery translation (PRD §1.2, S-08).
 */
export const ERROR_FA: Partial<Record<ErrorCode | 'NETWORK_ERROR', string>> = {
  VALIDATION_ERROR: 'اطلاعات واردشده معتبر نیست.',
  UNAUTHENTICATED: 'لطفاً دوباره وارد شوید.',
  INVALID_SIGNATURE: 'امضای درخواست معتبر نیست.',
  SESSION_EXPIRED: 'نشست شما به پایان رسیده است. لطفاً دوباره وارد شوید.',
  OTP_REQUIRED: 'لطفاً ابتدا شماره موبایل خود را تأیید کنید.',
  STEP_UP_REQUIRED: 'برای ادامه، کد ورود دومرحله‌ای را وارد کنید.',
  FORBIDDEN: 'اجازه انجام این کار را ندارید.',
  MERCHANT_DISABLED: 'این فروشگاه غیرفعال است.',
  NOT_FOUND: 'موردی یافت نشد.',
  STATE_CHANGED: 'این مورد تغییر کرده است. برای دیدن آخرین وضعیت، صفحه را دوباره بارگذاری کنید.',
  ORDER_BUSY: 'پرداخت شما در حال پردازش است و اکنون قابل لغو نیست.',
  ORDER_EXPIRED: 'این نشست منقضی شده است. لطفاً پرداخت جدیدی را آغاز کنید.',
  ORDER_CONFLICT: 'سفارشی با همین شماره و اطلاعات متفاوت در جریان است.',
  ORDER_ALREADY_COMPLETED: 'این سفارش قبلاً پرداخت شده است.',
  CREDIT_CHANGED: 'اعتبار در دسترس شما تغییر کرده است. لطفاً انتخاب خود را بازبینی کنید.',
  DEADLINE_TOO_CLOSE: 'زمان کافی برای پرداخت بانکی باقی نمانده است. لطفاً پرداخت جدیدی را آغاز کنید.',
  ALLOCATION_PENDING: 'تا تأیید کامل تخصیص اعتبار، امکان بازپرداخت وجود ندارد.',
  IDEMPOTENCY_IN_PROGRESS: 'درخواست قبلی شما هنوز در حال پردازش است.',
  DUPLICATE_ENTITY: 'رکوردی با همین مقدار یکتا وجود دارد.',
  PLAN_IN_USE: 'این طرح در حال استفاده است.',
  LAST_ADMIN_MANAGER: 'این تغییر هیچ مدیر فعالی با دسترسی مدیریت باقی نمی‌گذارد.',
  SELF_APPROVAL_FORBIDDEN: 'سند نمی‌تواند توسط ایجادکننده‌اش تأیید شود.',
  API_KEY_LIMIT: 'هر فروشگاه حداکثر دو کلید فعال می‌تواند داشته باشد.',
  CHECKOUT_TOKEN_EXPIRED: 'این نشست منقضی شده است. لطفاً پرداخت جدیدی را آغاز کنید.',
  TOKEN_EXPIRED: 'این پیوند نامعتبر است یا منقضی شده است.',
  IDEMPOTENCY_KEY_REUSED: 'این درخواست قبلاً با اطلاعات دیگری ثبت شده است.',
  AMOUNT_OUT_OF_RANGE: 'مبلغ خارج از بازه مجاز است.',
  CONSUMER_NOT_ELIGIBLE: 'امکان استفاده از پرداخت اعتباری برای این مشتری وجود ندارد.',
  OTP_INVALID: 'کد واردشده نادرست است.',
  OTP_EXPIRED: 'این کد منقضی شده است. کد جدید درخواست کنید.',
  OTP_SESSION_SUPERSEDED: 'این کد دیگر معتبر نیست. از آخرین کد ارسال‌شده استفاده کنید.',
  IDENTITY_MISMATCH: 'اطلاعات واردشده با سوابق ما مطابقت ندارد.',
  NO_SELECTION: 'لطفاً یک منبع اعتبار انتخاب کنید یا کل مبلغ را با کارت بانکی بپردازید.',
  INSUFFICIENT_CREDIT: 'اعتبارهای انتخاب‌شده مبلغ لازم را پوشش نمی‌دهند. لطفاً منابع بیشتری انتخاب کنید.',
  REFUND_EXCEEDS_REFUNDABLE: 'مبلغ بازپرداخت از مبلغ قابل بازپرداخت بیشتر است.',
  AMOUNT_EXCEEDS_ORDER: 'مبلغ سند از مبلغ سفارش بیشتر است.',
  PAYMENT_AMOUNT_MISMATCH: 'مبلغ پرداخت باید دقیقاً برابر مبلغ صورت‌حساب باشد.',
  PLAN_ARCHIVED: 'طرح بایگانی‌شده قابل استفاده نیست.',
  FILE_NOT_STAGED: 'فایل بارگذاری‌شده یافت نشد یا منقضی شده است. دوباره بارگذاری کنید.',
  FILE_REJECTED: 'فایل در بررسی امنیتی رد شد.',
  OTP_LOCKED: 'تعداد تلاش‌های نادرست زیاد بود. لطفاً به فروشگاه برگردید و دوباره شروع کنید.',
  IDENTITY_LOCKED: 'تعداد تلاش‌های نادرست زیاد بود. لطفاً به فروشگاه برگردید و دوباره شروع کنید.',
  ACCOUNT_LOCKED: 'به‌دلیل تلاش‌های ناموفق، حساب شما ۱۵ دقیقه قفل شد.',
  RATE_LIMITED: 'درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
  OTP_RESEND_COOLDOWN: 'لطفاً پیش از درخواست کد جدید کمی صبر کنید.',
  OTP_RESEND_LIMIT: 'به حداکثر تعداد ارسال کد برای این پرداخت رسیده‌اید.',
  INQUIRY_LIMIT: 'به حداکثر دفعات استعلام اعتبار برای این پرداخت رسیده‌اید.',
  INTERNAL_ERROR: 'خطای غیرمنتظره‌ای رخ داد.',
  PROVIDER_ERROR: 'ارتباط با تأمین‌کننده اعتبار برقرار نشد.',
  GATEWAY_ERROR: 'نتوانستیم پرداخت بانکی شما را آغاز کنیم. لطفاً دوباره تلاش کنید.',
  SMS_UNAVAILABLE: 'نتوانستیم کد را ارسال کنیم. برای تلاش دوباره ضربه بزنید.',
  IDENTITY_SERVICE_UNAVAILABLE: 'در حال حاضر امکان استعلام هویت نیست. لطفاً دوباره تلاش کنید.',
  SERVICE_UNAVAILABLE: 'سرویس موقتاً در دسترس نیست.',
  NETWORK_ERROR: 'ارتباط برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.',
};

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const base = ERROR_FA[e.code] ?? 'خطای غیرمنتظره‌ای رخ داد.';
    const fields = e.details?.fields;
    if (e.code === 'VALIDATION_ERROR' && fields?.length) return `${base} (${fields.map((f) => FIELD_FA[f.field] ?? f.field).join('، ')})`;
    return base;
  }
  return 'خطای غیرمنتظره‌ای رخ داد.';
}

/** Server field names → Persian labels for inline errors. */
export const FIELD_FA: Record<string, string> = {
  nationalId: 'شناسه ملی',
  economicId: 'کد اقتصادی',
  iban: 'شماره شبا',
  managerNationalCode: 'کد ملی مدیر',
  phone: 'شماره موبایل',
  contactNumber: 'شماره تماس',
  websiteUrl: 'وب‌سایت',
  webhookUrl: 'آدرس وب‌هوک',
  returnUrlDomains: 'دامنه‌های بازگشت',
  cashSettlementBps: 'درصد تسویه نقدی',
  password: 'گذرواژه',
  newPassword: 'گذرواژه جدید',
  note: 'توضیح',
  reason: 'دلیل',
  value: 'مقدار',
  amount: 'مبلغ',
  file: 'فایل',
  content: 'متن پیام',
  apiBaseUrl: 'آدرس API',
  dateOfBirth: 'تاریخ تولد',
  maturityDate: 'تاریخ سررسید',
  counterpartyId: 'طرف حساب',
  orderId: 'سفارش',
  linkedDocumentId: 'سند مرتبط',
  resolutionType: 'نوع حل',
  terms: 'شرایط و قوانین',
};

export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof ApiError) {
    for (const f of e.details?.fields ?? []) out[f.field] = localizeFieldMessage(f.message);
    if (e.code === 'DUPLICATE_ENTITY' && typeof e.details?.field === 'string') out[e.details.field] = 'این مقدار قبلاً ثبت شده است.';
    if (e.code === 'FILE_NOT_STAGED' && typeof e.details?.field === 'string') out[e.details.field] = ERROR_FA.FILE_NOT_STAGED!;
  }
  return out;
}

const MESSAGE_FA: Record<string, string> = {
  'Please enter a valid national ID.': 'لطفاً کد ملی معتبر وارد کنید.',
  'Please enter a valid IBAN.': 'لطفاً شماره شبای معتبر وارد کنید.',
  'Please enter a valid mobile number.': 'لطفاً شماره موبایل معتبر وارد کنید.',
  'Please enter a valid legal-entity national ID.': 'لطفاً شناسه ملی ۱۱ رقمی معتبر وارد کنید.',
  'Please enter a valid 11-digit legal-entity national ID.': 'لطفاً شناسه ملی ۱۱ رقمی معتبر وارد کنید.',
  'For individuals, the national ID must be a valid 10-digit personal code.': 'برای اشخاص حقیقی، کد ملی ۱۰ رقمی معتبر لازم است.',
  'Economic ID is required for legal entities.': 'کد اقتصادی برای اشخاص حقوقی الزامی است.',
  'Economic ID must be 11–12 digits.': 'کد اقتصادی باید ۱۱ یا ۱۲ رقم باشد.',
  "Please enter a valid manager's national code.": 'کد ملی مدیر معتبر نیست.',
  'Cash settlement percentage only applies when cash settlement is enabled.': 'درصد تسویه نقدی فقط وقتی تسویه نقدی فعال است معنا دارد.',
  'Please accept the terms and conditions to continue.': 'برای ادامه، شرایط و قوانین را بپذیرید.',
  'Must be an https URL (≤ 2048 characters).': 'آدرس باید با https شروع شود.',
  'Please enter a valid contact number.': 'شماره تماس معتبر نیست.',
  'Note must be at least 10 characters.': 'توضیح باید حداقل ۱۰ نویسه باشد.',
  'A reason is required.': 'وارد کردن دلیل الزامی است.',
  'Settlement plan not found.': 'طرح تسویه یافت نشد.',
  'The return URL host is not allowed for this merchant.': 'دامنه بازگشت برای این فروشگاه مجاز نیست.',
};

export function localizeFieldMessage(m: string): string {
  if (MESSAGE_FA[m]) return MESSAGE_FA[m];
  if (m.startsWith('Password must be at least')) return 'گذرواژه باید حداقل ۱۲ نویسه باشد.';
  if (m.includes('breached')) return 'این گذرواژه در فهرست گذرواژه‌های لورفته است. گذرواژه دیگری انتخاب کنید.';
  if (m.startsWith('Content must include')) return `متن باید پارامترهای لازم را داشته باشد: ${m.split(':')[1] ?? ''}`;
  if (m.startsWith('Value must be at least')) return `مقدار باید حداقل ${m.replace(/\D+/g, '')} باشد.`;
  if (m.startsWith('Value must be at most')) return `مقدار باید حداکثر ${m.replace(/\D+/g, '')} باشد.`;
  return m;
}

type Tone = 'gray' | 'blue' | 'green' | 'red' | 'yellow';
export type LabelMap = Record<string, [string, Tone]>;

export const ORDER_STATUS_FA: LabelMap = {
  Initiated: ['ایجادشده', 'gray'],
  AwaitingOtp: ['در انتظار کد تأیید', 'blue'],
  AwaitingIdentity: ['در انتظار احراز هویت', 'blue'],
  CreditInquiryInProgress: ['در حال استعلام اعتبار', 'blue'],
  AwaitingSupplierSelection: ['در انتظار انتخاب اعتبار', 'blue'],
  ReservationInProgress: ['در حال رزرو اعتبار', 'blue'],
  AwaitingBankPayment: ['در انتظار پرداخت بانکی', 'yellow'],
  PaymentVerifying: ['در حال تأیید پرداخت', 'yellow'],
  CancellationRequested: ['درخواست لغو', 'yellow'],
  AllocationInProgress: ['در حال تخصیص', 'blue'],
  Completed: ['تکمیل‌شده', 'green'],
  Cancelled: ['لغوشده', 'gray'],
  Expired: ['منقضی', 'gray'],
  Failed: ['ناموفق', 'red'],
};

export const FAILURE_REASON_FA: Record<string, string> = {
  OTP_LOCKED: 'قفل کد تأیید',
  IDENTITY_LOCKED: 'قفل احراز هویت',
  RESERVATION_FAILED: 'شکست رزرو اعتبار',
  CONSUMER_BLOCKED: 'مشتری مسدود',
};

export const ALLOCATION_FA: LabelMap = {
  NotApplicable: ['بدون اعتبار', 'gray'],
  Pending: ['در انتظار تأیید', 'yellow'],
  Confirmed: ['تأییدشده', 'green'],
  NeedsReconciliation: ['نیازمند مغایرت‌گیری', 'red'],
};

export const REFUND_ON_ORDER_FA: LabelMap = { None: ['بدون بازپرداخت', 'gray'], Partial: ['بازپرداخت جزئی', 'yellow'], Full: ['بازپرداخت کامل', 'blue'] };

export const REFUND_STATUS_FA: LabelMap = {
  Requested: ['ثبت‌شده', 'blue'],
  Processing: ['در حال انجام', 'yellow'],
  Completed: ['تکمیل‌شده', 'green'],
  NeedsReconciliation: ['نیازمند مغایرت‌گیری', 'red'],
  Rejected: ['ردشده', 'red'],
  Failed: ['ناموفق', 'red'],
};

export const LEG_STATUS_FA: LabelMap = {
  Pending: ['در انتظار', 'yellow'],
  Succeeded: ['موفق', 'green'],
  Failed: ['ناموفق', 'red'],
  NeedsReconciliation: ['نیازمند مغایرت‌گیری', 'red'],
};

export const BANK_TX_STATUS_FA: LabelMap = {
  Pending: ['در انتظار', 'yellow'],
  Authorized: ['مجاز', 'blue'],
  Success: ['موفق', 'green'],
  Failed: ['ناموفق', 'red'],
  Cancelled: ['لغوشده', 'gray'],
  ReversalPending: ['در انتظار برگشت', 'yellow'],
  Reversed: ['برگشت‌خورده', 'gray'],
  NeedsReconciliation: ['نیازمند مغایرت‌گیری', 'red'],
};

export const PTX_STATUS_FA: LabelMap = {
  Pending: ['در انتظار', 'yellow'],
  Confirmed: ['تأییدشده', 'green'],
  Failed: ['ناموفق', 'red'],
  Unknown: ['نامشخص', 'red'],
};

export const PTX_TYPE_FA: Record<string, string> = { Reservation: 'رزرو', Allocation: 'تخصیص', Release: 'آزادسازی', Reversal: 'برگشت' };

export const RESERVATION_FA: LabelMap = {
  Requested: ['درخواست‌شده', 'blue'],
  Reserved: ['رزروشده', 'blue'],
  Failed: ['ناموفق', 'red'],
  ReleasePending: ['در انتظار آزادسازی', 'yellow'],
  Released: ['آزادشده', 'gray'],
  AllocationPending: ['در انتظار تخصیص', 'yellow'],
  Allocated: ['تخصیص‌یافته', 'green'],
  NeedsReconciliation: ['نیازمند مغایرت‌گیری', 'red'],
};

export const DOC_STATUS_FA: LabelMap = {
  PendingApproval: ['در انتظار تأیید', 'yellow'],
  Scheduled: ['زمان‌بندی‌شده', 'blue'],
  Matured: ['سررسیدشده', 'yellow'],
  Invoiced: ['صورت‌حساب‌شده', 'blue'],
  Settled: ['تسویه‌شده', 'green'],
  Cancelled: ['ابطال‌شده', 'gray'],
  Rejected: ['ردشده', 'red'],
};

export const DOC_KIND_FA: Record<string, string> = { OrderSettlement: 'تسویه سفارش', CashSettlement: 'تسویه نقدی', Refund: 'بازپرداخت', Manual: 'دستی' };

export const INVOICE_STATUS_FA: LabelMap = {
  Generated: ['صادرشده', 'blue'],
  Sent: ['ارسال‌شده', 'blue'],
  Overdue: ['معوق', 'red'],
  Paid: ['پرداخت‌شده', 'green'],
  Collected: ['وصول‌شده', 'green'],
};

export const DIRECTION_FA: Record<string, string> = { Payable: 'پرداختنی', Receivable: 'دریافتنی' };
export const COUNTERPARTY_FA: Record<string, string> = { Merchant: 'فروشگاه', Provider: 'تأمین‌کننده', Consumer: 'مشتری' };
export const ENABLED_FA: LabelMap = { Enabled: ['فعال', 'green'], Disabled: ['غیرفعال', 'gray'] };
export const CONNECTION_FA: LabelMap = { Connected: ['متصل', 'green'], Degraded: ['کند', 'yellow'], Disconnected: ['قطع', 'red'] };
export const CONSUMER_STATUS_FA: LabelMap = { Inactive: ['تأییدنشده', 'gray'], Active: ['فعال', 'green'], Blocked: ['مسدود', 'red'] };
export const ADMIN_STATUS_FA: LabelMap = { Invited: ['دعوت‌شده', 'blue'], Active: ['فعال', 'green'], Inactive: ['غیرفعال', 'gray'] };
export const PLAN_STATUS_FA: LabelMap = { Active: ['فعال', 'green'], Archived: ['بایگانی‌شده', 'gray'] };
export const RECON_STATUS_FA: LabelMap = { Open: ['باز', 'red'], InReview: ['در حال بررسی', 'yellow'], Resolved: ['حل‌شده', 'green'] };
export const RECON_TYPE_FA: Record<string, string> = {
  AMOUNT_MISMATCH: 'مغایرت مبلغ',
  CASH_WITHOUT_ORDER: 'وجه بدون سفارش',
  MISSING_IN_PSP_REPORT: 'نبود در گزارش PSP',
  LATE_PAYMENT: 'پرداخت دیرهنگام',
  ALLOCATION_UNCONFIRMED: 'تخصیص تأییدنشده',
  RELEASE_UNCONFIRMED: 'آزادسازی تأییدنشده',
  REVERSAL_REJECTED: 'رد برگشت توسط تأمین‌کننده',
  REVERSAL_UNCONFIRMED: 'برگشت تأییدنشده',
  BANK_REVERSAL_FAILED: 'شکست برگشت بانکی',
  REFUND_LEG_FAILED: 'شکست بخشی از بازپرداخت',
  PROVIDER_STATEMENT_MISMATCH: 'مغایرت صورت‌حساب تأمین‌کننده',
};
export const RESOLUTION_FA: Record<string, string> = {
  Redriven: 'اجرای مجدد',
  ManualDocument: 'سند دستی',
  Reversed: 'برگشت‌داده‌شده',
  WrittenOff: 'سوخت‌شده',
  NoActionNeeded: 'بدون نیاز به اقدام',
};
export const MESSAGE_STATUS_FA: LabelMap = { Queued: ['در صف', 'yellow'], Sent: ['ارسال‌شده', 'blue'], Delivered: ['تحویل‌شده', 'green'], Failed: ['ناموفق', 'red'] };
export const WEBHOOK_STATUS_FA: LabelMap = { Pending: ['در انتظار', 'yellow'], Retrying: ['تلاش مجدد', 'yellow'], Delivered: ['تحویل‌شده', 'green'], Exhausted: ['متوقف', 'red'] };
export const EXPORT_STATUS_FA: LabelMap = { Pending: ['در صف', 'yellow'], Processing: ['در حال ساخت', 'blue'], Ready: ['آماده', 'green'], Failed: ['ناموفق', 'red'] };
export const ENTITY_TYPE_FA: Record<string, string> = { Individual: 'حقیقی', Legal: 'حقوقی' };
export const INQUIRY_KEY_FA: Record<string, string> = { NationalId: 'کد ملی', Phone: 'شماره موبایل' };
export const ROLE_FA: Record<string, string> = { SuperAdmin: 'مدیر ارشد', Operations: 'عملیات', Finance: 'مالی', Support: 'پشتیبانی', Viewer: 'ناظر' };
export const MANUAL_REASON_FA: Record<string, string> = { Adjustment: 'اصلاحیه', ReconciliationResolution: 'حل مغایرت', Other: 'سایر' };

export const PERMISSION_FA: Record<string, string> = {
  'providers.read': 'مشاهده تأمین‌کنندگان',
  'providers.manage': 'مدیریت تأمین‌کنندگان',
  'merchants.read': 'مشاهده فروشگاه‌ها',
  'merchants.manage': 'مدیریت فروشگاه‌ها و ارسال مجدد وب‌هوک',
  'merchants.credentials': 'ایجاد و ابطال کلید API فروشگاه',
  'consumers.read': 'مشاهده مشتریان',
  'consumers.pii': 'مشاهده اطلاعات هویتی کامل',
  'consumers.block': 'مسدود/رفع مسدودی مشتری',
  'orders.read': 'مشاهده سفارش‌ها و بازپرداخت‌ها',
  'transactions.read': 'مشاهده تراکنش‌های بانکی و اعتباری',
  'refunds.create': 'ثبت بازپرداخت و شبای گیرنده',
  'documents.read': 'مشاهده اسناد',
  'documents.manual': 'ایجاد و ابطال سند دستی',
  'documents.approve': 'تأیید/رد سند دستی',
  'invoices.read': 'مشاهده صورت‌حساب‌ها',
  'invoices.settle': 'ارسال و ثبت پرداخت صورت‌حساب',
  'plans.read': 'مشاهده طرح‌های تسویه',
  'plans.manage': 'مدیریت طرح‌های تسویه',
  'settings.read': 'مشاهده تنظیمات',
  'settings.manage': 'تغییر تنظیمات',
  'reconciliation.read': 'مشاهده مغایرت‌ها',
  'reconciliation.resolve': 'رسیدگی به مغایرت‌ها و ورود گزارش PSP',
  'messages.read': 'مشاهده پیام‌ها و قالب‌ها',
  'messages.manage': 'مدیریت قالب پیام',
  'admins.manage': 'مدیریت کاربران ادمین',
  'roles.manage': 'مدیریت نقش‌ها و دسترسی‌ها',
  'audit.read': 'مشاهده گزارش ممیزی',
  'exports.create': 'خروجی گرفتن از فهرست‌ها',
};

export const SETTING_FA: Record<string, string> = {
  cashPaymentBps: 'سهم نقدی هر سفارش',
  allowCashOnly: 'امکان پرداخت کامل با کارت',
  minOrderAmount: 'حداقل مبلغ سفارش (تومان)',
  maxOrderAmount: 'حداکثر مبلغ سفارش (تومان)',
  sessionTtlMinutes: 'مهلت نشست پیش از تأیید (دقیقه)',
  paymentHoldMinutes: 'مهلت پرداخت پس از تأیید (دقیقه)',
  bankMinRemainingSeconds: 'حداقل زمان باقی‌مانده برای شروع پرداخت (ثانیه)',
  bankPendingMaxSeconds: 'حداکثر زمان تراکنش بانکی نامشخص (ثانیه)',
  otpTtlSeconds: 'اعتبار کد تأیید (ثانیه)',
  otpMaxAttempts: 'حداکثر تلاش نادرست کد',
  otpResendCooldownSeconds: 'فاصله ارسال مجدد کد (ثانیه)',
  otpMaxResends: 'حداکثر ارسال مجدد کد',
  identityMaxMismatchesPerOrder: 'حداکثر عدم تطابق هویت در هر سفارش',
  identityMaxMismatchesPerPhone24h: 'حداکثر عدم تطابق هویت در ۲۴ ساعت',
  phoneLockoutsBeforeCooldown: 'قفل‌های مجاز پیش از محرومیت موقت',
  phoneCooldownHours: 'مدت محرومیت موقت (ساعت)',
  linkageRematchDays: 'تطبیق مجدد هویت پس از (روز)',
  providerInquiryTimeoutMs: 'مهلت استعلام تأمین‌کننده (میلی‌ثانیه)',
  providerCallTimeoutMs: 'مهلت فراخوانی تأمین‌کننده (میلی‌ثانیه)',
  maxInquiryAttempts: 'حداکثر دفعات استعلام',
  maxReservationAttempts: 'حداکثر دفعات رزرو',
  merchantCashSettlementDelayDays: 'فاصله تسویه نقدی فروشگاه (روز)',
  invoiceDueDays: 'مهلت پرداخت صورت‌حساب (روز)',
  manualDocApprovalThreshold: 'سقف سند دستی بدون تأیید دوم (تومان)',
  checkoutKillSwitch: 'توقف کامل پرداخت‌های جدید',
};
