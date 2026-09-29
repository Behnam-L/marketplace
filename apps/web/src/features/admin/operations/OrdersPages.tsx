import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ORDER_STATUSES, type OrderDetail, type OrderListItem } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDate, jDateTime, num, parseAmount, toman } from '../../../shared/format/format';
import {
  ALLOCATION_FA,
  BANK_TX_STATUS_FA,
  DOC_KIND_FA,
  DOC_STATUS_FA,
  FAILURE_REASON_FA,
  ORDER_STATUS_FA,
  PTX_STATUS_FA,
  PTX_TYPE_FA,
  REFUND_ON_ORDER_FA,
  REFUND_STATUS_FA,
  RESERVATION_FA,
} from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { TextArea, TextField } from '../../../shared/ui/Field';
import { StatusBadge } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useFormIdempotencyKey } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan } from '../session';
import { useQueryClient } from '@tanstack/react-query';

const statusOptions = ORDER_STATUSES.filter((s) => s !== 'Initiated').map((s) => ({ value: s, label: ORDER_STATUS_FA[s][0] }));

/** FR-110 order list with filters (status values = §5.1). */
export function OrdersListPage() {
  return (
    <ResourceList<OrderListItem>
      title="سفارش‌ها"
      path="/admin/orders"
      itemsName="سفارش"
      exportResource="orders"
      rowHref={(o) => `/admin/orders/${o.id}`}
      filters={[
        { name: 'status', label: 'وضعیت', type: 'select', options: statusOptions },
        { name: 'allocationStatus', label: 'وضعیت تخصیص', type: 'select', options: Object.entries(ALLOCATION_FA).map(([v, [l]]) => ({ value: v, label: l })) },
        { name: 'refundStatus', label: 'بازپرداخت', type: 'select', options: Object.entries(REFUND_ON_ORDER_FA).map(([v, [l]]) => ({ value: v, label: l })) },
        { name: 'orderNumber', label: 'شماره سفارش', type: 'text', dir: 'ltr' },
        { name: 'phone', label: 'شماره موبایل (دقیق)', type: 'text', dir: 'ltr' },
        { name: 'merchantId', label: 'شناسه فروشگاه', type: 'text', dir: 'ltr' },
        { name: 'providerId', label: 'شناسه تأمین‌کننده', type: 'text', dir: 'ltr' },
        { name: 'minAmount', label: 'حداقل مبلغ', type: 'number' },
        { name: 'maxAmount', label: 'حداکثر مبلغ', type: 'number' },
        { name: 'from', label: 'از تاریخ', type: 'dateFrom' },
        { name: 'to', label: 'تا تاریخ', type: 'dateTo' },
      ]}
      columns={[
        { key: 'num', label: 'شماره', render: (o) => <Ltr>{o.merchantOrderNumber}</Ltr> },
        { key: 'merchant', label: 'فروشگاه', render: (o) => o.merchantName },
        { key: 'total', label: 'مبلغ کل', render: (o) => toman(o.totalAmount), numeric: true },
        { key: 'cash', label: 'نقدی', render: (o) => toman(o.cashAmount), numeric: true },
        { key: 'credit', label: 'اعتباری', render: (o) => toman(o.creditAmount), numeric: true },
        { key: 'providers', label: 'تأمین‌کننده‌ها', render: (o) => o.providerCount || '—', numeric: true },
        { key: 'created', label: 'ایجاد', render: (o) => jDateTime(o.createdAt) },
        { key: 'status', label: 'وضعیت', render: (o) => <StatusBadge map={ORDER_STATUS_FA} value={o.status} /> },
        { key: 'alloc', label: 'تخصیص', render: (o) => <StatusBadge map={ALLOCATION_FA} value={o.allocationStatus} /> },
      ]}
    />
  );
}

function RefundDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ik, resetIk] = useFormIdempotencyKey();
  const { pending, errors, error, run } = useSubmit();
  const toast = useToast();
  const qc = useQueryClient();
  const refundable = order.totalAmount - order.refundedAmount;
  const submit = async () => {
    const n = parseAmount(amount);
    if (!n) return;
    const r = await run(() => api(`/admin/orders/${order.id}/refunds`, { body: { amount: n, reason }, idempotencyKey: ik }));
    resetIk();
    if (r) {
      toast('بازپرداخت ثبت شد.');
      void qc.invalidateQueries();
      onClose();
    }
  };
  return (
    <Dialog
      title="ثبت بازپرداخت"
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="danger" pending={pending} disabled={!parseAmount(amount) || reason.trim().length < 3} onClick={() => void submit()}>
            ثبت بازپرداخت {parseAmount(amount) ? toman(parseAmount(amount)) : ''}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p>مبلغ قابل بازپرداخت: {toman(refundable)}. اجزای نقدی و اعتباری به نسبت پرداخت اولیه برگشت داده می‌شوند.</p>
        <TextField label="مبلغ (تومان)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
        <TextArea label="دلیل" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/** FR-110 order detail: consumer, reservations, bank/provider transactions, documents, refunds, timeline. */
export function OrderDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<OrderDetail>(`/admin/orders/${id}`);
  const can = useCan();
  const [refunding, setRefunding] = useState(false);
  return (
    <QueryGate q={q}>
      {(o) => (
        <div className="stack">
          <PageHeader
            back="/admin/orders"
            title={
              <>
                سفارش <Ltr>{o.merchantOrderNumber}</Ltr>
              </>
            }
            subtitle={<Ltr>{o.id}</Ltr>}
            actions={
              o.status === 'Completed' &&
              can('refunds.create') && (
                <Button variant="outline" size="sm" onClick={() => setRefunding(true)} disabled={o.refundedAmount >= o.totalAmount}>
                  ثبت بازپرداخت
                </Button>
              )
            }
          />
          <div className="grid-2">
            <Section title="خلاصه">
              <DL
                items={[
                  ['وضعیت', <StatusBadge key="s" map={ORDER_STATUS_FA} value={o.status} />],
                  ['دلیل شکست', o.failureReason ? FAILURE_REASON_FA[o.failureReason] : null],
                  ['وضعیت تخصیص', <StatusBadge key="a" map={ALLOCATION_FA} value={o.allocationStatus} />],
                  ['بازپرداخت', <StatusBadge key="r" map={REFUND_ON_ORDER_FA} value={o.refundStatus} />],
                  ['فروشگاه', <Link key="m" to={`/admin/merchants/${o.merchantId}`}>{o.merchantName}</Link>],
                  ['مبلغ کل', toman(o.totalAmount)],
                  ['سهم نقدی', toman(o.cashAmount)],
                  ['سهم اعتباری', toman(o.creditAmount)],
                  ['مبلغ بازپرداخت‌شده', toman(o.refundedAmount)],
                  ['ایجاد', jDateTime(o.createdAt)],
                  ['مهلت نشست', jDateTime(o.sessionExpiresAt)],
                  ['مهلت پرداخت', jDateTime(o.paymentDeadlineAt)],
                  ['تکمیل', jDateTime(o.completedAt)],
                ]}
              />
            </Section>
            <Section title="مشتری">
              {o.consumer ? (
                <DL
                  items={[
                    ['نام', o.consumer.firstName ? `${o.consumer.firstName} ${o.consumer.lastName ?? ''}` : 'هنوز احراز نشده'],
                    ['موبایل', <Ltr key="p">{o.consumer.phone}</Ltr>],
                    ['پرونده', <Link key="c" to={`/admin/consumers/${o.consumer.id}`}>مشاهده مشتری</Link>],
                    ['پذیرش شرایط', jDateTime(o.termsAcceptedAt)],
                    ['تعداد استعلام', o.inquiryAttempts],
                    ['تعداد رزرو', o.reservationAttempts],
                  ]}
                />
              ) : (
                <p className="muted">—</p>
              )}
            </Section>
          </div>
          <Section title="رزروهای اعتبار">
            <SimpleTable
              rows={o.reservations}
              columns={[
                { label: 'تأمین‌کننده', render: (r) => r.providerName },
                { label: 'نوبت', render: (r) => r.attemptNo, numeric: true },
                { label: 'مبلغ', render: (r) => toman(r.amount), numeric: true },
                { label: 'وضعیت', render: (r) => <StatusBadge map={RESERVATION_FA} value={r.status} /> },
                { label: 'برگشت‌داده‌شده', render: (r) => toman(r.reversedAmount), numeric: true },
                { label: 'مرجع', render: (r) => <Ltr>{r.providerReference ?? '—'}</Ltr> },
              ]}
            />
          </Section>
          <Section title="تراکنش‌های بانکی">
            <SimpleTable
              rows={o.bankTransactions}
              columns={[
                { label: 'شناسه', render: (b) => <Link to={`/admin/bank-transactions/${b.id}`}><Ltr>{b.id}</Ltr></Link> },
                { label: 'زمان', render: (b) => jDateTime(b.createdAt) },
                { label: 'نوع', render: (b) => (b.type === 'Payment' ? 'پرداخت' : 'بازپرداخت') },
                { label: 'مبلغ', render: (b) => toman(b.amount), numeric: true },
                { label: 'وضعیت', render: (b) => <StatusBadge map={BANK_TX_STATUS_FA} value={b.status} /> },
                { label: 'معتبر', render: (b) => (b.isAuthoritative ? <span className="badge badge--green">پرداخت معتبر</span> : '—') },
                { label: 'مرجع بانک', render: (b) => <Ltr>{b.gatewayReference ?? '—'}</Ltr> },
              ]}
            />
          </Section>
          <Section title="تراکنش‌های تأمین‌کننده">
            <SimpleTable
              rows={o.providerTransactions}
              columns={[
                { label: 'نوع', render: (t) => PTX_TYPE_FA[t.type] },
                { label: 'تأمین‌کننده', render: (t) => t.providerName },
                { label: 'مبلغ', render: (t) => toman(t.amount), numeric: true },
                { label: 'وضعیت', render: (t) => <StatusBadge map={PTX_STATUS_FA} value={t.status} /> },
                { label: 'تلاش', render: (t) => num(t.attempts), numeric: true },
                { label: 'زمان', render: (t) => jDateTime(t.createdAt) },
              ]}
            />
          </Section>
          <Section title="اسناد">
            <SimpleTable
              rows={o.documents}
              columns={[
                { label: 'شماره', render: (d) => <Link to={`/admin/documents/${d.id}`}><Ltr>{d.number}</Ltr></Link> },
                { label: 'طرف حساب', render: (d) => d.counterpartyName },
                { label: 'نوع', render: (d) => DOC_KIND_FA[d.kind] },
                { label: 'قسط', render: (d) => `${num(d.installmentIndex)}/${num(d.installmentCount)}` },
                { label: 'مبلغ', render: (d) => toman(d.amount), numeric: true },
                { label: 'سررسید', render: (d) => jDate(d.maturityDate) },
                { label: 'وضعیت', render: (d) => <StatusBadge map={DOC_STATUS_FA} value={d.status} /> },
              ]}
            />
          </Section>
          <Section title="بازپرداخت‌ها">
            <SimpleTable
              rows={o.refunds}
              columns={[
                { label: 'شناسه', render: (r) => <Link to={`/admin/refunds/${r.id}`}><Ltr>{r.id}</Ltr></Link> },
                { label: 'مبلغ', render: (r) => toman(r.amount), numeric: true },
                { label: 'وضعیت', render: (r) => <StatusBadge map={REFUND_STATUS_FA} value={r.status} /> },
                { label: 'زمان', render: (r) => jDateTime(r.createdAt) },
              ]}
            />
          </Section>
          <Section title="رویدادها">
            <ol className="timeline">
              {o.events.map((e) => (
                <li key={e.id}>
                  <span className="muted num">{jDateTime(e.createdAt)}</span>
                  <StatusBadge map={ORDER_STATUS_FA} value={e.toStatus} />
                  <span className="muted bon-body-small">
                    {e.actor}
                    {e.reason ? ` — ${e.reason}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
          {refunding && <RefundDialog order={o} onClose={() => setRefunding(false)} />}
        </div>
      )}
    </QueryGate>
  );
}
