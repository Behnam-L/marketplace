import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  BANK_TRANSACTION_STATUSES,
  PROVIDER_TRANSACTION_STATUSES,
  PROVIDER_TRANSACTION_TYPES,
  RECONCILIATION_ITEM_TYPES,
  RESOLUTION_TYPES,
  type BankTransactionDetail,
  type BankTransactionListItem,
  type ProviderTransactionListItem,
  type PspReportImportResponse,
  type ReconciliationItemDto,
  type RefundDetail,
  type RefundListItem,
} from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDateTime, num, toman } from '../../../shared/format/format';
import {
  BANK_TX_STATUS_FA,
  LEG_STATUS_FA,
  PTX_STATUS_FA,
  PTX_TYPE_FA,
  RECON_STATUS_FA,
  RECON_TYPE_FA,
  REFUND_STATUS_FA,
  RESOLUTION_FA,
} from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog, Dialog } from '../../../shared/ui/Dialog';
import { SelectField, TextArea, TextField } from '../../../shared/ui/Field';
import { Banner, StatusBadge } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan, useSession } from '../session';

const opts = (map: Record<string, [string, string]> | Record<string, string>, values: readonly string[]) =>
  values.map((v) => ({ value: v, label: Array.isArray((map as Record<string, unknown>)[v]) ? ((map as Record<string, [string, string]>)[v][0]) : ((map as Record<string, string>)[v] ?? v) }));

/* ───────────── Refunds ───────────── */

export function RefundsListPage() {
  return (
    <ResourceList<RefundListItem>
      title="بازپرداخت‌ها"
      path="/admin/refunds"
      itemsName="بازپرداخت"
      exportResource="refunds"
      rowHref={(r) => `/admin/refunds/${r.id}`}
      filters={[
        { name: 'status', label: 'وضعیت', type: 'select', options: opts(REFUND_STATUS_FA, Object.keys(REFUND_STATUS_FA)) },
        { name: 'orderId', label: 'شناسه سفارش', type: 'text', dir: 'ltr' },
        { name: 'merchantId', label: 'شناسه فروشگاه', type: 'text', dir: 'ltr' },
        { name: 'from', label: 'از تاریخ', type: 'dateFrom' },
        { name: 'to', label: 'تا تاریخ', type: 'dateTo' },
      ]}
      columns={[
        { key: 'id', label: 'شناسه', render: (r) => <Ltr>{r.id}</Ltr> },
        { key: 'order', label: 'سفارش', render: (r) => <Ltr>{r.orderId}</Ltr> },
        { key: 'amount', label: 'مبلغ', render: (r) => toman(r.amount), numeric: true },
        { key: 'by', label: 'ثبت‌کننده', render: (r) => (r.initiatedBy === 'Admin' ? 'ادمین' : 'فروشگاه') },
        { key: 'created', label: 'زمان', render: (r) => jDateTime(r.createdAt) },
        { key: 'status', label: 'وضعیت', render: (r) => <StatusBadge map={REFUND_STATUS_FA} value={r.status} /> },
      ]}
    />
  );
}

function PayeeIbanDialog({ legId, onClose }: { legId: string; onClose: () => void }) {
  const [iban, setIban] = useState('IR');
  const { pending, errors, error, run } = useSubmit();
  const qc = useQueryClient();
  const submit = async () => {
    const r = await run(() => api(`/admin/refund-legs/${legId}/payee`, { method: 'PATCH', body: { iban } }));
    if (r) {
      void qc.invalidateQueries();
      onClose();
    }
  };
  return (
    <Dialog
      title="شبای گیرنده بازپرداخت"
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            انصراف
          </Button>
          <Button pending={pending} onClick={() => void submit()}>
            ثبت
          </Button>
        </>
      }
    >
      <div className="stack">
        <p>درگاه این سفارش امکان بازپرداخت خودکار ندارد. شبای مشتری را وارد کنید تا سند پرداختنی در صورت‌حساب بعدی قرار گیرد.</p>
        <TextField label="شماره شبا" dir="ltr" value={iban} onChange={(e) => setIban(e.target.value)} error={errors.iban} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

export function RefundDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<RefundDetail>(`/admin/refunds/${id}`);
  const can = useCan();
  const [legId, setLegId] = useState<string | null>(null);
  return (
    <QueryGate q={q}>
      {(r) => (
        <div className="stack">
          <PageHeader back="/admin/refunds" title="جزئیات بازپرداخت" subtitle={<Ltr>{r.id}</Ltr>} />
          <Section title="خلاصه">
            <DL
              items={[
                ['وضعیت', <StatusBadge key="s" map={REFUND_STATUS_FA} value={r.status} />],
                ['سفارش', <Link key="o" to={`/admin/orders/${r.orderId}`}><Ltr>{r.orderId}</Ltr></Link>],
                ['مبلغ', toman(r.amount)],
                ['برگشت کارمزد فروشگاه', toman(r.merchantMarginRefund)],
                ['ثبت‌کننده', r.initiatedBy === 'Admin' ? 'ادمین' : 'فروشگاه'],
                ['دلیل', r.reason],
                ['زمان', jDateTime(r.createdAt)],
              ]}
            />
          </Section>
          <Section title="اجزای بازپرداخت">
            <SimpleTable
              rows={r.legs}
              columns={[
                { label: 'جزء', render: (l) => (l.legType === 'Cash' ? 'نقدی (کارت)' : `اعتبار — ${l.providerName}`) },
                { label: 'مبلغ', render: (l) => toman(l.amount), numeric: true },
                { label: 'برگشت کارمزد تأمین‌کننده', render: (l) => toman(l.providerMarginRefund), numeric: true },
                { label: 'وضعیت', render: (l) => <StatusBadge map={LEG_STATUS_FA} value={l.status} /> },
                {
                  label: 'شبای گیرنده',
                  render: (l) =>
                    l.payeeIbanMasked ? (
                      <Ltr>{l.payeeIbanMasked}</Ltr>
                    ) : l.needsPayeeIban && can('refunds.create') ? (
                      <Button size="sm" variant="tonal" onClick={() => setLegId(l.id)}>
                        ثبت شبا
                      </Button>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          </Section>
          {legId && <PayeeIbanDialog legId={legId} onClose={() => setLegId(null)} />}
        </div>
      )}
    </QueryGate>
  );
}

/* ───────────── Transactions (FR-111/112) ───────────── */

export function BankTransactionsPage() {
  return (
    <ResourceList<BankTransactionListItem>
      title="تراکنش‌های بانکی"
      path="/admin/bank-transactions"
      itemsName="تراکنش"
      exportResource="bank-transactions"
      rowHref={(b) => `/admin/bank-transactions/${b.id}`}
      filters={[
        { name: 'status', label: 'وضعیت', type: 'select', options: opts(BANK_TX_STATUS_FA, BANK_TRANSACTION_STATUSES) },
        { name: 'type', label: 'نوع', type: 'select', options: [{ value: 'Payment', label: 'پرداخت' }, { value: 'Refund', label: 'بازپرداخت' }] },
        { name: 'gatewayCode', label: 'درگاه', type: 'text', dir: 'ltr' },
        { name: 'reference', label: 'مرجع', type: 'text', dir: 'ltr' },
        { name: 'orderId', label: 'سفارش', type: 'text', dir: 'ltr' },
        { name: 'from', label: 'از تاریخ', type: 'dateFrom' },
        { name: 'to', label: 'تا تاریخ', type: 'dateTo' },
      ]}
      columns={[
        { key: 'ref', label: 'مرجع', render: (b) => <Ltr>{b.gatewayReference ?? b.id}</Ltr> },
        { key: 'gw', label: 'درگاه', render: (b) => <Ltr>{b.gatewayCode}</Ltr> },
        { key: 'at', label: 'زمان', render: (b) => jDateTime(b.createdAt) },
        { key: 'amount', label: 'مبلغ', render: (b) => toman(b.amount), numeric: true },
        { key: 'type', label: 'نوع', render: (b) => (b.type === 'Payment' ? 'پرداخت' : 'بازپرداخت') },
        { key: 'status', label: 'وضعیت', render: (b) => <StatusBadge map={BANK_TX_STATUS_FA} value={b.status} /> },
        { key: 'order', label: 'سفارش', render: (b) => (b.orderId ? <Ltr>{b.orderId}</Ltr> : '—') },
      ]}
    />
  );
}

export function BankTransactionDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<BankTransactionDetail>(`/admin/bank-transactions/${id}`);
  return (
    <QueryGate q={q}>
      {(b) => (
        <div className="stack">
          <PageHeader back="/admin/bank-transactions" title="تراکنش بانکی" subtitle={<Ltr>{b.id}</Ltr>} />
          <Section title="جزئیات">
            <DL
              items={[
                ['وضعیت', <StatusBadge key="s" map={BANK_TX_STATUS_FA} value={b.status} />],
                ['نوع', b.type === 'Payment' ? 'پرداخت' : 'بازپرداخت'],
                ['درگاه', <Ltr key="g">{b.gatewayCode}</Ltr>],
                ['مبلغ', toman(b.amount)],
                ['مرجع بانک', <Ltr key="r">{b.gatewayReference}</Ltr>],
                ['کارت', <Ltr key="c">{b.cardMask}</Ltr>],
                ['پرداخت معتبر سفارش', b.isAuthoritative ? 'بله' : 'خیر'],
                ['سفارش', b.orderId ? <Link key="o" to={`/admin/orders/${b.orderId}`}><Ltr>{b.orderId}</Ltr></Link> : null],
                ['کد خطا', b.failureCode],
                ['زمان ایجاد', jDateTime(b.createdAt)],
                ['مجازشدن', jDateTime(b.authorizedAt)],
                ['تأیید', jDateTime(b.verifiedAt)],
                ['تلاش‌ها', num(b.attempts)],
              ]}
            />
          </Section>
          <Section title="گزارش فنی">
            <SimpleTable
              rows={b.technicalLog}
              columns={[
                { label: 'زمان', render: (l) => jDateTime(l.at) },
                { label: 'عملیات', render: (l) => <Ltr>{l.operation}</Ltr> },
                { label: 'نتیجه', render: (l) => <Ltr>{l.outcome}</Ltr> },
                { label: 'جزئیات', render: (l) => <Ltr>{l.detail ?? '—'}</Ltr> },
              ]}
            />
          </Section>
        </div>
      )}
    </QueryGate>
  );
}

export function ProviderTransactionsPage() {
  return (
    <ResourceList<ProviderTransactionListItem>
      title="تراکنش‌های اعتباری"
      path="/admin/provider-transactions"
      itemsName="تراکنش"
      exportResource="provider-transactions"
      filters={[
        { name: 'type', label: 'نوع', type: 'select', options: opts(PTX_TYPE_FA, PROVIDER_TRANSACTION_TYPES) },
        { name: 'status', label: 'وضعیت', type: 'select', options: opts(PTX_STATUS_FA, PROVIDER_TRANSACTION_STATUSES) },
        { name: 'providerId', label: 'شناسه تأمین‌کننده', type: 'text', dir: 'ltr' },
        { name: 'reference', label: 'مرجع', type: 'text', dir: 'ltr' },
        { name: 'stuck', label: 'فقط موارد گیرکرده', type: 'select', options: [{ value: 'true', label: 'بله' }] },
        { name: 'from', label: 'از تاریخ', type: 'dateFrom' },
        { name: 'to', label: 'تا تاریخ', type: 'dateTo' },
      ]}
      rowHref={(t) => (t.orderId ? `/admin/orders/${t.orderId}` : '#')}
      columns={[
        { key: 'ref', label: 'مرجع', render: (t) => <Ltr>{t.providerReference ?? t.id}</Ltr> },
        { key: 'provider', label: 'تأمین‌کننده', render: (t) => t.providerName },
        { key: 'at', label: 'زمان', render: (t) => jDateTime(t.createdAt) },
        { key: 'type', label: 'نوع', render: (t) => PTX_TYPE_FA[t.type] },
        { key: 'amount', label: 'مبلغ', render: (t) => toman(t.amount), numeric: true },
        { key: 'status', label: 'وضعیت', render: (t) => <StatusBadge map={PTX_STATUS_FA} value={t.status} /> },
        { key: 'attempts', label: 'تلاش', render: (t) => num(t.attempts), numeric: true },
      ]}
    />
  );
}

/* ───────────── Reconciliation (FR-140–142) ───────────── */

function PspImportDialog({ onClose }: { onClose: () => void }) {
  const [gateway, setGateway] = useState('MOCK');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PspReportImportResponse | null>(null);
  const { pending, error, run } = useSubmit();
  const qc = useQueryClient();
  const submit = async () => {
    if (!file) return;
    const form = new FormData();
    form.set('gatewayCode', gateway);
    form.set('file', file);
    const r = await run(() => api<PspReportImportResponse>('/admin/reconciliation/psp-reports', { method: 'POST', form }));
    if (r) {
      setResult(r);
      void qc.invalidateQueries();
    }
  };
  return (
    <Dialog
      title="ورود گزارش تسویه PSP"
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            بستن
          </Button>
          <Button pending={pending} disabled={!file} onClick={() => void submit()}>
            بارگذاری
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="bon-body-small muted">ستون‌ها: reference,amount_rial,fee_rial,date (با سطر عنوان).</p>
        <TextField label="کد درگاه" dir="ltr" value={gateway} onChange={(e) => setGateway(e.target.value)} />
        <input type="file" accept=".csv,text/csv" aria-label="فایل CSV" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <FormError error={error} />
        {result && (
          <Banner tone="success">
            {num(result.imported)} سطر وارد شد؛ {num(result.matched)} تطبیق، {num(result.itemsCreated)} مورد مغایرت.
          </Banner>
        )}
      </div>
    </Dialog>
  );
}

export function ReconciliationListPage() {
  const can = useCan();
  const [importing, setImporting] = useState(false);
  return (
    <>
      <ResourceList<ReconciliationItemDto>
        title="مغایرت‌گیری"
        path="/admin/reconciliation-items"
        itemsName="مورد"
        exportResource="reconciliation-items"
        rowHref={(r) => `/admin/reconciliation/${r.id}`}
        headerExtra={
          can('reconciliation.resolve') && (
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              ورود گزارش PSP
            </Button>
          )
        }
        filters={[
          { name: 'status', label: 'وضعیت', type: 'select', options: opts(RECON_STATUS_FA, Object.keys(RECON_STATUS_FA)) },
          { name: 'type', label: 'نوع', type: 'select', options: opts(RECON_TYPE_FA, RECONCILIATION_ITEM_TYPES) },
          { name: 'orderId', label: 'سفارش', type: 'text', dir: 'ltr' },
        ]}
        columns={[
          { key: 'type', label: 'نوع', render: (r) => RECON_TYPE_FA[r.type] },
          { key: 'sev', label: 'اهمیت', render: (r) => ({ Low: 'کم', Medium: 'متوسط', High: 'زیاد' })[r.severity] },
          { key: 'order', label: 'سفارش', render: (r) => (r.orderId ? <Ltr>{r.orderId}</Ltr> : '—') },
          { key: 'exp', label: 'مورد انتظار', render: (r) => toman(r.expectedAmount), numeric: true },
          { key: 'act', label: 'واقعی', render: (r) => toman(r.actualAmount), numeric: true },
          { key: 'at', label: 'زمان', render: (r) => jDateTime(r.createdAt) },
          { key: 'status', label: 'وضعیت', render: (r) => <StatusBadge map={RECON_STATUS_FA} value={r.status} /> },
        ]}
      />
      {importing && <PspImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}

export function ReconciliationDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<ReconciliationItemDto>(`/admin/reconciliation-items/${id}`);
  const can = useCan();
  const { me } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [resolution, setResolution] = useState('');
  const [note, setNote] = useState('');
  const [docId, setDocId] = useState('');
  const [redrive, setRedrive] = useState(false);
  const { pending, errors, error, run } = useSubmit();
  const update = async (body: Record<string, unknown>) => {
    const r = await run(() => api(`/admin/reconciliation-items/${id}`, { method: 'PATCH', body }));
    if (r) {
      toast('ذخیره شد.');
      void qc.invalidateQueries();
    }
  };
  const doRedrive = async () => {
    const r = await run(() => api<ReconciliationItemDto>(`/admin/reconciliation-items/${id}/redrive`, { method: 'POST', body: {} }));
    setRedrive(false);
    if (r) {
      toast(r.status === 'Resolved' ? 'اجرای مجدد موفق بود و مورد حل شد.' : 'اجرای مجدد انجام شد اما هنوز حل نشده است.');
      void qc.invalidateQueries();
    }
  };
  const moneyAffecting = resolution === 'ManualDocument' || resolution === 'WrittenOff';
  return (
    <QueryGate q={q}>
      {(r) => (
        <div className="stack">
          <PageHeader back="/admin/reconciliation" title={RECON_TYPE_FA[r.type]} subtitle={<Ltr>{r.id}</Ltr>} />
          <Section title="جزئیات">
            <DL
              items={[
                ['وضعیت', <StatusBadge key="s" map={RECON_STATUS_FA} value={r.status} />],
                ['سفارش', r.orderId ? <Link key="o" to={`/admin/orders/${r.orderId}`}><Ltr>{r.orderId}</Ltr></Link> : null],
                ['مبلغ مورد انتظار', toman(r.expectedAmount)],
                ['مبلغ واقعی', toman(r.actualAmount)],
                ['ارجاع‌ها', <div key="refs" className="code-box">{JSON.stringify(r.refs, null, 1)}</div>],
                ['مسئول', r.assigneeId ? <Ltr key="a">{r.assigneeId}</Ltr> : null],
                ['نوع حل', r.resolutionType ? RESOLUTION_FA[r.resolutionType] : null],
                ['سند مرتبط', r.linkedDocumentId ? <Link key="d" to={`/admin/documents/${r.linkedDocumentId}`}><Ltr>{r.linkedDocumentId}</Ltr></Link> : null],
                ['توضیح', r.note],
                ['زمان ایجاد', jDateTime(r.createdAt)],
                ['زمان حل', jDateTime(r.resolvedAt)],
              ]}
            />
          </Section>
          {r.status !== 'Resolved' && can('reconciliation.resolve') && (
            <Section
              title="رسیدگی"
              actions={
                <>
                  <Button size="sm" variant="tonal" onClick={() => void update({ status: 'InReview', assigneeId: me?.admin.id })}>
                    برداشتن مورد
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRedrive(true)}>
                    اجرای مجدد عملیات
                  </Button>
                </>
              }
            >
              <SelectField label="نوع حل" value={resolution} placeholder="انتخاب کنید" options={RESOLUTION_TYPES.map((t) => ({ value: t, label: RESOLUTION_FA[t] }))} onChange={(e) => setResolution(e.target.value)} error={errors.resolutionType} />
              {moneyAffecting && <TextField label="شناسه سند دستی مرتبط" dir="ltr" value={docId} onChange={(e) => setDocId(e.target.value)} error={errors.linkedDocumentId} help="برای حل‌های مالی، ابتدا سند دستی بسازید." />}
              <TextArea label="توضیح" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
              <FormError error={error} />
              <Button pending={pending} disabled={!resolution || note.trim().length < 5} onClick={() => void update({ status: 'Resolved', resolutionType: resolution, note, linkedDocumentId: moneyAffecting ? docId : null })}>
                ثبت حل مورد
              </Button>
            </Section>
          )}
          {redrive && (
            <ConfirmDialog title="اجرای مجدد عملیات؟" pending={pending} onConfirm={() => void doRedrive()} onClose={() => setRedrive(false)}>
              عملیات گیرکرده (تخصیص، آزادسازی، برگشت یا برگشت بانکی) دوباره نزد طرف مقابل اجرا می‌شود.
            </ConfirmDialog>
          )}
        </div>
      )}
    </QueryGate>
  );
}

