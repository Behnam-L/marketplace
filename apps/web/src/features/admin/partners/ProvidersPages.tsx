import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ProviderDetail, ProviderInput, ProviderListItem } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDateTime, num, toman } from '../../../shared/format/format';
import { CONNECTION_FA, ENABLED_FA, INQUIRY_KEY_FA, INVOICE_STATUS_FA, DIRECTION_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/Dialog';
import { SelectField, TextField } from '../../../shared/ui/Field';
import { StatusBadge } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useFormIdempotencyKey, useUnsavedGuard } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, FormGrid, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan } from '../session';
import { FileUpload, PlanSelect } from './PartnerForms';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export function ProvidersListPage() {
  return (
    <ResourceList<ProviderListItem>
      title="تأمین‌کنندگان اعتبار"
      path="/admin/providers"
      itemsName="تأمین‌کننده"
      rowHref={(p) => `/admin/providers/${p.id}`}
      primaryAction={{ label: 'افزودن تأمین‌کننده', to: '/admin/providers/new', perm: 'providers.manage' }}
      filters={[
        { name: 'q', label: 'جستجو', type: 'text' },
        { name: 'displayStatus', label: 'وضعیت نمایش', type: 'select', options: Object.entries(ENABLED_FA).map(([v, [l]]) => ({ value: v, label: l })) },
        { name: 'connectionStatus', label: 'وضعیت اتصال', type: 'select', options: Object.entries(CONNECTION_FA).map(([v, [l]]) => ({ value: v, label: l })) },
        { name: 'sort', label: 'مرتب‌سازی', type: 'select', options: [{ value: 'sortOrder', label: 'ترتیب نمایش' }, { value: 'displayName', label: 'نام' }] },
      ]}
      columns={[
        {
          key: 'name',
          label: 'نام',
          render: (p) => (
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="provider__logo" style={{ width: 32, height: 32 }}>
                {p.iconUrl ? <img src={p.iconUrl} alt="" /> : p.displayName.slice(0, 1)}
              </span>
              {p.displayName}
            </span>
          ),
        },
        { key: 'display', label: 'وضعیت نمایش', render: (p) => <StatusBadge map={ENABLED_FA} value={p.displayStatus} /> },
        { key: 'conn', label: 'وضعیت اتصال', render: (p) => <StatusBadge map={CONNECTION_FA} value={p.connectionStatus} /> },
        { key: 'order', label: 'ترتیب', render: (p) => num(p.sortOrder), numeric: true },
        { key: 'created', label: 'ایجاد', render: (p) => jDateTime(p.createdAt) },
      ]}
    />
  );
}

const EMPTY: ProviderInput = {
  legalName: '',
  displayName: '',
  iconFileId: null,
  nationalId: '',
  economicId: '',
  websiteUrl: 'https://',
  contactNumber: '',
  officeAddress: '',
  iban: 'IR',
  contractFileId: null,
  providerSettlementPlanId: '',
  displayStatus: 'Enabled',
  adapterType: 'Mock',
  apiBaseUrl: 'https://',
  credentialsRef: '',
  inquiryKey: 'NationalId',
  sortOrder: 0,
};

function ProviderForm({ initial, existing, onSaved }: { initial: ProviderInput; existing?: ProviderDetail; onSaved: (id: string) => void }) {
  const [v, setV] = useState<ProviderInput>(initial);
  const [dirty, setDirty] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [ik, resetIk] = useFormIdempotencyKey();
  const { pending, errors, error, run } = useSubmit();
  useUnsavedGuard(dirty);
  const set = <K extends keyof ProviderInput>(k: K, value: ProviderInput[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setDirty(true);
  };
  const save = async () => {
    const r = await run(() =>
      existing
        ? api<ProviderDetail>(`/admin/providers/${existing.id}`, { method: 'PATCH', body: v, ifMatch: existing.version })
        : api<ProviderDetail>('/admin/providers', { body: v, idempotencyKey: ik }),
    );
    if (!existing) resetIk();
    if (r) {
      setDirty(false);
      onSaved(r.id);
    }
  };
  const submit = () => (existing?.displayStatus === 'Enabled' && v.displayStatus === 'Disabled' ? setConfirmDisable(true) : void save());
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Section title="اطلاعات حقوقی">
        <FormGrid>
          <TextField label="نام حقوقی" value={v.legalName} onChange={(e) => set('legalName', e.target.value)} error={errors.legalName} required />
          <TextField label="نام نمایشی" value={v.displayName} onChange={(e) => set('displayName', e.target.value)} error={errors.displayName} required />
          <TextField label="شناسه ملی (۱۱ رقم)" dir="ltr" inputMode="numeric" value={v.nationalId} onChange={(e) => set('nationalId', e.target.value)} error={errors.nationalId} required />
          <TextField label="کد اقتصادی" dir="ltr" inputMode="numeric" value={v.economicId} onChange={(e) => set('economicId', e.target.value)} error={errors.economicId} required />
          <TextField label="وب‌سایت" dir="ltr" value={v.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} error={errors.websiteUrl} />
          <TextField label="شماره تماس" dir="ltr" value={v.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} error={errors.contactNumber} />
          <TextField label="نشانی دفتر" value={v.officeAddress} onChange={(e) => set('officeAddress', e.target.value)} error={errors.officeAddress} />
          <TextField label="شماره شبا" dir="ltr" value={v.iban} onChange={(e) => set('iban', e.target.value)} error={errors.iban} />
          <FileUpload kind="Icon" label="نماد (لوگو)" value={v.iconFileId} currentUrl={existing?.iconUrl} onChange={(id) => set('iconFileId', id)} error={errors.iconFileId} />
          <FileUpload kind="Contract" label="قرارداد" value={v.contractFileId} currentUrl={existing?.contractUrl} onChange={(id) => set('contractFileId', id)} error={errors.contractFileId} />
        </FormGrid>
      </Section>
      <Section title="تسویه و نمایش">
        <FormGrid>
          <PlanSelect kind="provider" value={v.providerSettlementPlanId} onChange={(x) => set('providerSettlementPlanId', x)} error={errors.providerSettlementPlanId} />
          <SelectField label="وضعیت نمایش" value={v.displayStatus} options={[{ value: 'Enabled', label: 'فعال' }, { value: 'Disabled', label: 'غیرفعال' }]} onChange={(e) => set('displayStatus', e.target.value as 'Enabled')} />
          <TextField label="ترتیب نمایش" type="number" min={0} value={v.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} error={errors.sortOrder} />
        </FormGrid>
      </Section>
      <Section title="یکپارچه‌سازی">
        <FormGrid>
          <SelectField label="نوع آداپتور" value={v.adapterType} options={[{ value: 'Mock', label: 'Mock (نمایشی)' }]} onChange={(e) => set('adapterType', e.target.value as 'Mock')} />
          <TextField label="آدرس پایه API" dir="ltr" value={v.apiBaseUrl} onChange={(e) => set('apiBaseUrl', e.target.value)} error={errors.apiBaseUrl} />
          <TextField label="ارجاع اعتبارنامه (در مخزن اسرار)" dir="ltr" value={v.credentialsRef} onChange={(e) => set('credentialsRef', e.target.value)} error={errors.credentialsRef} help="فقط ارجاع؛ خود رمز اینجا ذخیره نمی‌شود." />
          <SelectField label="کلید استعلام" value={v.inquiryKey} options={Object.entries(INQUIRY_KEY_FA).map(([k, l]) => ({ value: k, label: l }))} onChange={(e) => set('inquiryKey', e.target.value as 'Phone')} />
        </FormGrid>
      </Section>
      <FormError error={error} />
      <div className="row">
        <Button type="submit" pending={pending}>
          ذخیره
        </Button>
      </div>
      {confirmDisable && (
        <ConfirmDialog
          title="غیرفعال‌کردن تأمین‌کننده؟"
          danger
          confirmLabel="غیرفعال شود"
          pending={pending}
          onClose={() => setConfirmDisable(false)}
          onConfirm={() => {
            setConfirmDisable(false);
            void save();
          }}
        >
          این تأمین‌کننده از استعلام‌هایی که از این پس آغاز می‌شوند حذف می‌شود. سفارش‌هایی که از مرحله استعلام گذشته‌اند تحت تأثیر قرار نمی‌گیرند.
        </ConfirmDialog>
      )}
    </form>
  );
}

export function ProviderNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <div className="stack">
      <PageHeader back="/admin/providers" title="تأمین‌کننده جدید" />
      <ProviderForm
        initial={EMPTY}
        onSaved={(id) => {
          toast('تأمین‌کننده ایجاد شد (وضعیت اتصال تا موفقیت بررسی سلامت «قطع» است).');
          navigate(`/admin/providers/${id}`);
        }}
      />
    </div>
  );
}

export function InvoiceSummaries({ summaries }: { summaries: ProviderDetail['invoiceSummaries'] }) {
  return (
    <div className="grid-2">
      {summaries.map((s) => (
        <Section key={s.direction} title={`صورت‌حساب‌های ${DIRECTION_FA[s.direction]}`}>
          <DL
            items={[
              ['باز', `${s.openCount} (${toman(s.openAmount)})`],
              ['معوق', s.overdueCount],
              ['تسویه‌شده', s.paidCount],
            ]}
          />
          <SimpleTable
            rows={s.recent}
            columns={[
              { label: 'شماره', render: (i) => <Link to={`/admin/invoices/${i.id}`}><Ltr>{i.number}</Ltr></Link> },
              { label: 'مبلغ', render: (i) => toman(i.totalAmount), numeric: true },
              { label: 'وضعیت', render: (i) => <StatusBadge map={INVOICE_STATUS_FA} value={i.status} /> },
            ]}
            empty="صورت‌حسابی وجود ندارد."
          />
        </Section>
      ))}
    </div>
  );
}

export function ProviderDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<ProviderDetail>(`/admin/providers/${id}`);
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  return (
    <QueryGate q={q}>
      {(p) => (
        <div className="stack">
          <PageHeader
            back="/admin/providers"
            title={p.displayName}
            subtitle={<Ltr>{p.id}</Ltr>}
            actions={
              can('providers.manage') && (
                <Button variant={editing ? 'text' : 'outline'} size="sm" onClick={() => setEditing(!editing)}>
                  {editing ? 'انصراف از ویرایش' : 'ویرایش'}
                </Button>
              )
            }
          />
          {editing ? (
            <ProviderForm
              key={p.version}
              existing={p}
              initial={{
                legalName: p.legalName,
                displayName: p.displayName,
                iconFileId: p.iconFileId,
                nationalId: p.nationalId,
                economicId: p.economicId,
                websiteUrl: p.websiteUrl,
                contactNumber: p.contactNumber,
                officeAddress: p.officeAddress,
                iban: p.iban,
                contractFileId: p.contractFileId,
                providerSettlementPlanId: p.providerSettlementPlanId,
                displayStatus: p.displayStatus,
                adapterType: p.adapterType,
                apiBaseUrl: p.apiBaseUrl,
                credentialsRef: p.credentialsRef,
                inquiryKey: p.inquiryKey,
                sortOrder: p.sortOrder,
              }}
              onSaved={() => {
                toast('ذخیره شد.');
                setEditing(false);
                void qc.invalidateQueries();
              }}
            />
          ) : (
            <>
              <div className="grid-2">
                <Section title="اطلاعات">
                  <DL
                    items={[
                      ['نام حقوقی', p.legalName],
                      ['شناسه ملی', <Ltr key="n">{p.nationalId}</Ltr>],
                      ['کد اقتصادی', <Ltr key="e">{p.economicId}</Ltr>],
                      ['وب‌سایت', <Ltr key="w">{p.websiteUrl}</Ltr>],
                      ['تماس', <Ltr key="c">{p.contactNumber}</Ltr>],
                      ['نشانی', p.officeAddress],
                      ['شبا', <Ltr key="i">{p.iban}</Ltr>],
                      ['قرارداد', p.contractUrl ? <a key="k" href={p.contractUrl}>دریافت</a> : null],
                    ]}
                  />
                </Section>
                <Section title="وضعیت و یکپارچه‌سازی">
                  <DL
                    items={[
                      ['وضعیت نمایش', <StatusBadge key="d" map={ENABLED_FA} value={p.displayStatus} />],
                      ['وضعیت اتصال', <StatusBadge key="c" map={CONNECTION_FA} value={p.connectionStatus} />],
                      ['آخرین تغییر اتصال', jDateTime(p.connectionStatusChangedAt)],
                      ['طرح تسویه', p.planNumber],
                      ['آداپتور', p.adapterType],
                      ['آدرس API', <Ltr key="a">{p.apiBaseUrl}</Ltr>],
                      ['ارجاع اعتبارنامه', <Ltr key="r">{p.credentialsRef}</Ltr>],
                      ['کلید استعلام', INQUIRY_KEY_FA[p.inquiryKey]],
                      ['ترتیب نمایش', num(p.sortOrder)],
                    ]}
                  />
                </Section>
              </div>
              <InvoiceSummaries summaries={p.invoiceSummaries} />
            </>
          )}
        </div>
      )}
    </QueryGate>
  );
}
