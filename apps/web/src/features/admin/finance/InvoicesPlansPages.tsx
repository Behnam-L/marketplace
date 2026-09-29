import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { INVOICE_STATUSES, type InvoiceDetail, type InvoiceListItem, type MerchantPlanDto, type ProviderPlanDto } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { bpsToPercent, jDate, jDateTime, num, parseAmount, percentToBps, toman } from '../../../shared/format/format';
import { COUNTERPARTY_FA, DIRECTION_FA, DOC_KIND_FA, DOC_STATUS_FA, INVOICE_STATUS_FA, PLAN_STATUS_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog, Dialog } from '../../../shared/ui/Dialog';
import { Checkbox, SelectField, TextField } from '../../../shared/ui/Field';
import { EmptyState, ErrorState, StatusBadge, TableSkeleton } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useFormIdempotencyKey } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, FormGrid, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan } from '../session';

/* ───────────── Invoices (FR-133/134) ───────────── */

export function InvoicesListPage({ direction }: { direction: 'Payable' | 'Receivable' }) {
  return (
    <ResourceList<InvoiceListItem>
      key={direction}
      title={`صورت‌حساب‌های ${DIRECTION_FA[direction]}`}
      path="/admin/invoices"
      fixedQuery={{ direction }}
      itemsName="صورت‌حساب"
      exportResource="invoices"
      rowHref={(i) => `/admin/invoices/${i.id}`}
      filters={[
        { name: 'status', label: 'وضعیت', type: 'select', options: INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_FA[s][0] })) },
        { name: 'counterpartyType', label: 'نوع طرف حساب', type: 'select', options: Object.entries(COUNTERPARTY_FA).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'counterpartyId', label: 'شناسه طرف حساب', type: 'text', dir: 'ltr' },
      ]}
      columns={[
        { key: 'num', label: 'شماره', render: (i) => <Ltr>{i.number}</Ltr> },
        { key: 'cp', label: 'طرف حساب', render: (i) => `${COUNTERPARTY_FA[i.counterpartyType]}: ${i.counterpartyName}` },
        { key: 'date', label: 'تاریخ', render: (i) => jDate(i.invoiceDate) },
        { key: 'period', label: 'دوره', render: (i) => `${jDate(i.periodFrom)} تا ${jDate(i.periodTo)}` },
        { key: 'count', label: 'اسناد', render: (i) => i.documentCount, numeric: true },
        { key: 'total', label: 'مبلغ', render: (i) => toman(i.totalAmount), numeric: true },
        { key: 'due', label: 'سررسید', render: (i) => jDate(i.dueDate) },
        { key: 'status', label: 'وضعیت', render: (i) => <StatusBadge map={INVOICE_STATUS_FA} value={i.status} /> },
      ]}
    />
  );
}

function PaymentDialog({ inv, onClose }: { inv: InvoiceDetail; onClose: () => void }) {
  const [amount, setAmount] = useState(String(inv.totalAmount));
  const [reference, setReference] = useState('');
  const [ik, resetIk] = useFormIdempotencyKey();
  const [confirm, setConfirm] = useState(false);
  const { pending, errors, error, run } = useSubmit();
  const qc = useQueryClient();
  const submit = async () => {
    const r = await run(() =>
      api(`/admin/invoices/${inv.id}/payments`, { body: { amount: parseAmount(amount), paidAt: new Date().toISOString(), bankReference: reference }, idempotencyKey: ik }),
    );
    resetIk();
    setConfirm(false);
    if (r) {
      void qc.invalidateQueries();
      onClose();
    }
  };
  if (confirm) {
    return (
      <ConfirmDialog title={`ثبت ${inv.direction === 'Payable' ? 'پرداخت' : 'وصول'} ${toman(parseAmount(amount))}؟`} pending={pending} onClose={() => setConfirm(false)} onConfirm={() => void submit()}>
        همه اسناد این صورت‌حساب «تسویه‌شده» می‌شوند و سند حسابداری ثبت می‌شود. این کار برگشت‌پذیر نیست.
      </ConfirmDialog>
    );
  }
  return (
    <Dialog
      title={inv.direction === 'Payable' ? 'ثبت پرداخت صورت‌حساب' : 'ثبت وصول صورت‌حساب'}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            انصراف
          </Button>
          <Button disabled={!parseAmount(amount) || reference.trim().length < 3} onClick={() => setConfirm(true)}>
            ادامه
          </Button>
        </>
      }
    >
      <div className="stack">
        <p>مبلغ باید دقیقاً برابر مبلغ صورت‌حساب ({toman(inv.totalAmount)}) باشد؛ تفاوت‌ها با سند دستی تسویه می‌شوند.</p>
        <TextField label="مبلغ (تومان)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
        <TextField label="شماره مرجع بانکی" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} error={errors.bankReference} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<InvoiceDetail>(`/admin/invoices/${id}`);
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const markSent = async () => {
    try {
      await api(`/admin/invoices/${id}/mark-sent`, { method: 'POST', body: {} });
      void qc.invalidateQueries();
    } catch {
      toast('انجام نشد.');
    }
  };
  return (
    <QueryGate q={q}>
      {(inv) => (
        <div className="stack">
          <PageHeader
            back={`/admin/invoices/${inv.direction === 'Payable' ? 'payable' : 'receivable'}`}
            title={<>صورت‌حساب <Ltr>{inv.number}</Ltr></>}
            actions={
              can('invoices.settle') && (
                <>
                  {inv.status === 'Generated' && (
                    <Button size="sm" variant="outline" onClick={() => void markSent()}>
                      علامت ارسال
                    </Button>
                  )}
                  {['Generated', 'Sent', 'Overdue'].includes(inv.status) && (
                    <Button size="sm" onClick={() => setPaying(true)}>
                      {inv.direction === 'Payable' ? 'ثبت پرداخت' : 'ثبت وصول'}
                    </Button>
                  )}
                </>
              )
            }
          />
          <Section title="جزئیات">
            <DL
              items={[
                ['وضعیت', <StatusBadge key="s" map={INVOICE_STATUS_FA} value={inv.status} />],
                ['طرف حساب', `${COUNTERPARTY_FA[inv.counterpartyType]}: ${inv.counterpartyName}`],
                ['تاریخ صدور', jDate(inv.invoiceDate)],
                ['دوره', `${jDate(inv.periodFrom)} تا ${jDate(inv.periodTo)}`],
                ['سررسید', jDate(inv.dueDate)],
                ['مبلغ کل', toman(inv.totalAmount)],
                ['تعداد اسناد', inv.documentCount],
                ['زمان پرداخت', jDateTime(inv.paidAt)],
                ['مرجع بانکی', <Ltr key="b">{inv.bankReference}</Ltr>],
              ]}
            />
          </Section>
          <Section title="اسناد">
            <SimpleTable
              rows={inv.documents}
              columns={[
                { label: 'شماره', render: (d) => <Link to={`/admin/documents/${d.id}`}><Ltr>{d.number}</Ltr></Link> },
                { label: 'نوع', render: (d) => DOC_KIND_FA[d.kind] },
                { label: 'سفارش', render: (d) => (d.orderId ? <Ltr>{d.orderId}</Ltr> : '—') },
                { label: 'سررسید', render: (d) => jDate(d.maturityDate) },
                { label: 'مبلغ', render: (d) => toman(d.amount), numeric: true },
                { label: 'وضعیت', render: (d) => <StatusBadge map={DOC_STATUS_FA} value={d.status} /> },
              ]}
            />
          </Section>
          {paying && <PaymentDialog inv={inv} onClose={() => setPaying(false)} />}
        </div>
      )}
    </QueryGate>
  );
}

/* ───────────── Settlement plans (FR-100) ───────────── */

type Kind = 'provider' | 'merchant';

export function PlansListPage({ kind }: { kind: Kind }) {
  const q = useApiQuery<(ProviderPlanDto | MerchantPlanDto)[]>(`/admin/${kind}-settlement-plans`);
  const can = useCan();
  const navigate = useNavigate();
  const title = kind === 'provider' ? 'طرح‌های تسویه تأمین‌کننده' : 'طرح‌های تسویه فروشگاه';
  return (
    <div className="stack">
      <PageHeader
        title={title}
        actions={
          can('plans.manage') && (
            <Link className="btn btn--filled btn--sm" to={`/admin/settlement-plans/${kind}/new`}>
              طرح جدید
            </Link>
          )
        }
      />
      {q.isLoading ? (
        <TableSkeleton />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="هنوز طرحی وجود ندارد." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>شماره</th>
                <th>{kind === 'provider' ? 'کارمزد تأمین‌کننده' : 'کمیسیون فروشگاه'}</th>
                {kind === 'merchant' && <th>تسویه نقدی</th>}
                <th>اقساط</th>
                <th>در حال استفاده</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p) => (
                <tr key={p.id} data-href="1" onClick={() => navigate(`/admin/settlement-plans/${kind}/${p.id}`)}>
                  <td>
                    <Link to={`/admin/settlement-plans/${kind}/${p.id}`} onClick={(e) => e.stopPropagation()}>
                      <Ltr>{p.planNumber}</Ltr>
                    </Link>
                  </td>
                  <td className="num">{bpsToPercent('providerPayableMarginBps' in p ? p.providerPayableMarginBps : p.merchantReceivableMarginBps)}</td>
                  {kind === 'merchant' && <td>{'cashSettlementEnabled' in p && p.cashSettlementEnabled ? bpsToPercent(p.cashSettlementBps) : 'ندارد'}</td>}
                  <td className="num">{num(p.installmentCount)}</td>
                  <td>{p.inUse ? 'بله' : 'خیر'}</td>
                  <td>
                    <StatusBadge map={PLAN_STATUS_FA} value={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlanForm({ kind, existing, onSaved }: { kind: Kind; existing?: ProviderPlanDto | MerchantPlanDto; onSaved: (id: string) => void }) {
  const ep = existing as ProviderPlanDto | undefined;
  const em = existing as MerchantPlanDto | undefined;
  const [margin, setMargin] = useState(existing ? String(((kind === 'provider' ? ep!.providerPayableMarginBps : em!.merchantReceivableMarginBps) / 100)) : '');
  const [installments, setInstallments] = useState(String(existing?.installmentCount ?? 1));
  const [cashEnabled, setCashEnabled] = useState(em?.cashSettlementEnabled ?? false);
  const [cashPct, setCashPct] = useState(em?.cashSettlementBps ? String(em.cashSettlementBps / 100) : '');
  const { pending, errors, error, run, setErrors } = useSubmit();
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    const bps = percentToBps(margin);
    const cashBps = cashEnabled ? percentToBps(cashPct) : null;
    if (bps === null || bps > 10000) return setErrors({ margin: 'درصد بین ۰ تا ۱۰۰ با حداکثر دو رقم اعشار وارد کنید.' });
    if (cashEnabled && (cashBps === null || cashBps < 100 || cashBps > 10000)) return setErrors({ cashSettlementBps: 'درصد تسویه نقدی بین ۱ تا ۱۰۰ است.' });
    const body =
      kind === 'provider'
        ? { providerPayableMarginBps: bps, installmentCount: Number(installments), maturityRule: 'EndOfJalaliMonth' }
        : { merchantReceivableMarginBps: bps, cashSettlementEnabled: cashEnabled, cashSettlementBps: cashBps, installmentCount: Number(installments), maturityRule: 'EndOfJalaliMonth' };
    const r = await run(() =>
      existing
        ? api<{ id: string }>(`/admin/${kind}-settlement-plans/${existing.id}`, { method: 'PATCH', body, ifMatch: existing.version })
        : api<{ id: string }>(`/admin/${kind}-settlement-plans`, { body }),
    );
    setConfirm(false);
    if (r) onSaved(r.id);
  };
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (existing?.inUse) setConfirm(true);
        else void save();
      }}
    >
      <FormGrid>
        <TextField label={kind === 'provider' ? 'کارمزد پرداختنی به تأمین‌کننده (٪)' : 'کمیسیون دریافتنی از فروشگاه (٪)'} inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} error={errors.margin} help="تا دو رقم اعشار، مثلاً ۱٫۵" required />
        <SelectField label="تعداد اقساط" value={installments} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} onChange={(e) => setInstallments(e.target.value)} />
        <TextField label="قاعده سررسید" value="پایان ماه شمسی" disabled />
      </FormGrid>
      {kind === 'merchant' && (
        <FormGrid>
          <Checkbox label="تسویه نقدی (پرداخت بخشی از خالص در روز بعد)" checked={cashEnabled} onChange={(e) => setCashEnabled(e.target.checked)} />
          {cashEnabled && <TextField label="درصد تسویه نقدی (٪)" inputMode="decimal" value={cashPct} onChange={(e) => setCashPct(e.target.value)} error={errors.cashSettlementBps} />}
        </FormGrid>
      )}
      <FormError error={error} />
      <div className="row">
        <Button type="submit" pending={pending}>
          ذخیره
        </Button>
      </div>
      {confirm && (
        <ConfirmDialog title="ویرایش طرح در حال استفاده؟" pending={pending} onClose={() => setConfirm(false)} onConfirm={() => void save()}>
          تغییرات فقط بر سفارش‌هایی اثر دارد که از این پس تکمیل می‌شوند؛ سفارش‌های قبلی از شرایط ثبت‌شده خود استفاده می‌کنند.
        </ConfirmDialog>
      )}
    </form>
  );
}

export function PlanNewPage({ kind }: { kind: Kind }) {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <PageHeader back={`/admin/settlement-plans/${kind}`} title="طرح تسویه جدید" />
      <PlanForm kind={kind} onSaved={(id) => navigate(`/admin/settlement-plans/${kind}/${id}`)} />
    </div>
  );
}

export function PlanDetailPage({ kind }: { kind: Kind }) {
  const { id = '' } = useParams();
  const q = useApiQuery<ProviderPlanDto | MerchantPlanDto>(`/admin/${kind}-settlement-plans/${id}`);
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [archive, setArchive] = useState(false);
  const { pending, run } = useSubmit();
  const doArchive = async () => {
    const r = await run(() => api(`/admin/${kind}-settlement-plans/${id}/archive`, { method: 'POST', body: {} }));
    setArchive(false);
    if (r) {
      toast('طرح بایگانی شد.');
      void qc.invalidateQueries();
    }
  };
  return (
    <QueryGate q={q}>
      {(p) => (
        <div className="stack">
          <PageHeader
            back={`/admin/settlement-plans/${kind}`}
            title={<>طرح <Ltr>{p.planNumber}</Ltr></>}
            subtitle={<StatusBadge map={PLAN_STATUS_FA} value={p.status} />}
            actions={
              can('plans.manage') &&
              p.status === 'Active' && (
                <Button size="sm" variant="outline" onClick={() => setArchive(true)}>
                  بایگانی
                </Button>
              )
            }
          />
          {p.status === 'Active' && can('plans.manage') ? (
            <PlanForm key={p.version} kind={kind} existing={p} onSaved={() => { toast('ذخیره شد.'); void qc.invalidateQueries(); }} />
          ) : (
            <Section title="شرایط">
              <DL
                items={[
                  ['درصد', bpsToPercent('providerPayableMarginBps' in p ? p.providerPayableMarginBps : p.merchantReceivableMarginBps)],
                  ['اقساط', num(p.installmentCount)],
                  ['تسویه نقدی', 'cashSettlementEnabled' in p ? (p.cashSettlementEnabled ? bpsToPercent(p.cashSettlementBps) : 'ندارد') : null],
                  ['در حال استفاده', p.inUse ? 'بله' : 'خیر'],
                ]}
              />
            </Section>
          )}
          {archive && (
            <ConfirmDialog title="بایگانی طرح؟" danger confirmLabel="بایگانی" pending={pending} onClose={() => setArchive(false)} onConfirm={() => void doArchive()}>
              طرح بایگانی‌شده دیگر قابل انتساب نیست. طرف‌حساب‌هایی که اکنون از آن استفاده می‌کنند تغییری نمی‌کنند.
            </ConfirmDialog>
          )}
        </div>
      )}
    </QueryGate>
  );
}

