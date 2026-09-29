import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_STATUSES, type CreateManualDocumentRequest, type DocumentDetail, type DocumentListItem } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDate, jDateTime, num, parseAmount, toman } from '../../../shared/format/format';
import { COUNTERPARTY_FA, DIRECTION_FA, DOC_KIND_FA, DOC_STATUS_FA, MANUAL_REASON_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/Dialog';
import { SelectField, TextArea, TextField } from '../../../shared/ui/Field';
import { StatusBadge } from '../../../shared/ui/Feedback';
import { JalaliDateInput, currentJalaliYear } from '../../../shared/ui/JalaliDateInput';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useFormIdempotencyKey, useUnsavedGuard } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section } from '../common/Detail';
import { FormError, FormGrid, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan, useSession } from '../session';

/** FR-130–132: payable / receivable documents. */
export function DocumentsListPage({ direction }: { direction: 'Payable' | 'Receivable' }) {
  return (
    <ResourceList<DocumentListItem>
      key={direction}
      title={`اسناد ${DIRECTION_FA[direction]}`}
      path="/admin/documents"
      fixedQuery={{ direction }}
      itemsName="سند"
      exportResource="documents"
      rowHref={(d) => `/admin/documents/${d.id}`}
      primaryAction={{ label: 'سند دستی', to: `/admin/documents/new?direction=${direction}`, perm: 'documents.manual' }}
      filters={[
        { name: 'status', label: 'وضعیت', type: 'select', options: DOCUMENT_STATUSES.map((s) => ({ value: s, label: DOC_STATUS_FA[s][0] })) },
        { name: 'kind', label: 'نوع', type: 'select', options: Object.entries(DOC_KIND_FA).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'counterpartyType', label: 'نوع طرف حساب', type: 'select', options: Object.entries(COUNTERPARTY_FA).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'counterpartyId', label: 'شناسه طرف حساب', type: 'text', dir: 'ltr' },
        { name: 'orderId', label: 'سفارش', type: 'text', dir: 'ltr' },
      ]}
      columns={[
        { key: 'num', label: 'شماره', render: (d) => <Ltr>{d.number}</Ltr> },
        { key: 'cp', label: 'طرف حساب', render: (d) => `${COUNTERPARTY_FA[d.counterpartyType]}: ${d.counterpartyName}` },
        { key: 'kind', label: 'نوع', render: (d) => DOC_KIND_FA[d.kind] },
        { key: 'inst', label: 'قسط', render: (d) => `${num(d.installmentIndex)}/${num(d.installmentCount)}` },
        { key: 'amount', label: 'مبلغ', render: (d) => toman(d.amount), numeric: true },
        { key: 'maturity', label: 'سررسید', render: (d) => jDate(d.maturityDate) },
        { key: 'status', label: 'وضعیت', render: (d) => <StatusBadge map={DOC_STATUS_FA} value={d.status} /> },
      ]}
    />
  );
}

/** FR-131 manual document (system-generated number; four-eyes above threshold). */
export function DocumentNewPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [v, setV] = useState({
    direction: (params.get('direction') as 'Payable' | 'Receivable') ?? 'Payable',
    counterpartyType: 'Merchant' as 'Merchant' | 'Provider' | 'Consumer',
    counterpartyId: '',
    amount: '',
    maturityDate: null as string | null,
    orderId: '',
    reason: 'Adjustment' as CreateManualDocumentRequest['reason'],
    note: '',
  });
  const [ik, resetIk] = useFormIdempotencyKey();
  const { pending, errors, error, run, setErrors } = useSubmit();
  useUnsavedGuard(v.counterpartyId !== '' || v.note !== '');
  const submit = async () => {
    const amount = parseAmount(v.amount);
    if (!amount || !v.maturityDate) {
      setErrors({ amount: amount ? '' : 'مبلغ معتبر وارد کنید.', maturityDate: v.maturityDate ? '' : 'تاریخ سررسید را انتخاب کنید.' });
      return;
    }
    const body: CreateManualDocumentRequest = {
      direction: v.direction,
      counterpartyType: v.counterpartyType,
      counterpartyId: v.counterpartyId.trim(),
      amount,
      maturityDate: v.maturityDate,
      orderId: v.orderId.trim() || null,
      reason: v.reason,
      note: v.note,
    };
    const r = await run(() => api<DocumentDetail>('/admin/documents', { body, idempotencyKey: ik }));
    resetIk();
    if (r) navigate(`/admin/documents/${r.id}`);
  };
  return (
    <div className="stack">
      <PageHeader back={`/admin/documents/${v.direction === 'Payable' ? 'payable' : 'receivable'}`} title="سند دستی جدید" />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormGrid>
          <SelectField label="جهت" value={v.direction} options={Object.entries(DIRECTION_FA).map(([k, l]) => ({ value: k, label: l }))} onChange={(e) => setV({ ...v, direction: e.target.value as 'Payable' })} />
          <SelectField label="نوع طرف حساب" value={v.counterpartyType} options={Object.entries(COUNTERPARTY_FA).map(([k, l]) => ({ value: k, label: l }))} onChange={(e) => setV({ ...v, counterpartyType: e.target.value as 'Merchant' })} />
          <TextField label="شناسه طرف حساب" dir="ltr" value={v.counterpartyId} onChange={(e) => setV({ ...v, counterpartyId: e.target.value })} error={errors.counterpartyId} required />
          <TextField label="مبلغ (تومان)" inputMode="numeric" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} error={errors.amount} required />
          <JalaliDateInput label="تاریخ سررسید" value={v.maturityDate} minYear={currentJalaliYear() - 1} maxYear={currentJalaliYear() + 3} onChange={(d) => setV({ ...v, maturityDate: d })} error={errors.maturityDate} />
          <TextField label="شناسه سفارش (اختیاری)" dir="ltr" value={v.orderId} onChange={(e) => setV({ ...v, orderId: e.target.value })} error={errors.orderId} />
          <SelectField label="دلیل" value={v.reason} options={Object.entries(MANUAL_REASON_FA).map(([k, l]) => ({ value: k, label: l }))} onChange={(e) => setV({ ...v, reason: e.target.value as 'Other' })} />
        </FormGrid>
        <TextArea label="توضیح (حداقل ۱۰ نویسه)" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} error={errors.note} required />
        <FormError error={error} />
        <div className="row">
          <Button type="submit" pending={pending}>
            ثبت سند
          </Button>
        </div>
      </form>
    </div>
  );
}

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<DocumentDetail>(`/admin/documents/${id}`);
  const can = useCan();
  const { me } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [action, setAction] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [note, setNote] = useState('');
  const { pending, error, run } = useSubmit();
  const submit = async () => {
    const r = await run(() => api(`/admin/documents/${id}/${action}`, { method: 'POST', body: { note } }));
    if (r) {
      toast('انجام شد.');
      setAction(null);
      setNote('');
      void qc.invalidateQueries();
    }
  };
  return (
    <QueryGate q={q}>
      {(d) => (
        <div className="stack">
          <PageHeader
            back={`/admin/documents/${d.direction === 'Payable' ? 'payable' : 'receivable'}`}
            title={<>سند <Ltr>{d.number}</Ltr></>}
            actions={
              <>
                {d.status === 'PendingApproval' && can('documents.approve') && d.createdBy !== me?.admin.id && (
                  <>
                    <Button size="sm" onClick={() => setAction('approve')}>
                      تأیید
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAction('reject')}>
                      رد
                    </Button>
                  </>
                )}
                {d.isManual && (d.status === 'Scheduled' || d.status === 'Matured') && can('documents.manual') && (
                  <Button size="sm" variant="danger" onClick={() => setAction('cancel')}>
                    ابطال
                  </Button>
                )}
              </>
            }
          />
          <Section title="جزئیات">
            <DL
              items={[
                ['وضعیت', <StatusBadge key="s" map={DOC_STATUS_FA} value={d.status} />],
                ['جهت', DIRECTION_FA[d.direction]],
                ['طرف حساب', `${COUNTERPARTY_FA[d.counterpartyType]}: ${d.counterpartyName}`],
                ['نوع', DOC_KIND_FA[d.kind]],
                ['قسط', `${num(d.installmentIndex)} از ${num(d.installmentCount)}`],
                ['مبلغ', toman(d.amount)],
                ['سررسید', jDate(d.maturityDate)],
                ['سفارش', d.orderId ? <Link key="o" to={`/admin/orders/${d.orderId}`}><Ltr>{d.orderId}</Ltr></Link> : null],
                ['صورت‌حساب', d.invoiceId ? <Link key="i" to={`/admin/invoices/${d.invoiceId}`}><Ltr>{d.invoiceId}</Ltr></Link> : null],
                ['دلیل', d.reason ? MANUAL_REASON_FA[d.reason] : null],
                ['توضیح', d.note],
                ['دلیل ابطال/رد', d.cancelReason],
                ['ایجادکننده', <Ltr key="c">{d.createdBy}</Ltr>],
                ['تأییدکننده', <Ltr key="a">{d.approvedBy}</Ltr>],
                ['زمان ایجاد', jDateTime(d.createdAt)],
              ]}
            />
          </Section>
          {action && (
            <ConfirmDialog
              title={action === 'approve' ? `تأیید سند ${toman(d.amount)}؟` : action === 'reject' ? 'رد سند؟' : 'ابطال سند؟'}
              danger={action !== 'approve'}
              pending={pending}
              onClose={() => setAction(null)}
              onConfirm={() => void submit()}
            >
              <div className="stack">
                {action === 'cancel' && <p>برای این سند یک سند حسابداری معکوس ثبت می‌شود.</p>}
                <TextArea label={action === 'approve' ? 'توضیح (اختیاری)' : 'دلیل'} value={note} onChange={(e) => setNote(e.target.value)} />
                <FormError error={error} />
              </div>
            </ConfirmDialog>
          )}
        </div>
      )}
    </QueryGate>
  );
}
