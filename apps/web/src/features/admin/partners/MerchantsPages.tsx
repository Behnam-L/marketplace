import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { CreateApiKeyResponse, MerchantDetail, MerchantInput, MerchantListItem } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDateTime, num } from '../../../shared/format/format';
import { ENABLED_FA, ENTITY_TYPE_FA, WEBHOOK_STATUS_FA, errorText } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog, Dialog } from '../../../shared/ui/Dialog';
import { SelectField, TextArea, TextField } from '../../../shared/ui/Field';
import { Banner, StatusBadge } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useFormIdempotencyKey, useUnsavedGuard } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, FormGrid, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan } from '../session';
import { FileUpload, PlanSelect } from './PartnerForms';
import { InvoiceSummaries } from './ProvidersPages';

export function MerchantsListPage() {
  return (
    <ResourceList<MerchantListItem>
      title="فروشگاه‌ها"
      path="/admin/merchants"
      itemsName="فروشگاه"
      rowHref={(m) => `/admin/merchants/${m.id}`}
      primaryAction={{ label: 'افزودن فروشگاه', to: '/admin/merchants/new', perm: 'merchants.manage' }}
      filters={[
        { name: 'q', label: 'جستجو', type: 'text' },
        { name: 'status', label: 'وضعیت', type: 'select', options: Object.entries(ENABLED_FA).map(([v, [l]]) => ({ value: v, label: l })) },
        { name: 'entityType', label: 'نوع شخصیت', type: 'select', options: Object.entries(ENTITY_TYPE_FA).map(([v, l]) => ({ value: v, label: l })) },
      ]}
      columns={[
        { key: 'name', label: 'نام نمایشی', render: (m) => m.displayName },
        { key: 'type', label: 'نوع', render: (m) => ENTITY_TYPE_FA[m.entityType] },
        { key: 'manager', label: 'مدیر', render: (m) => m.managerName },
        { key: 'contact', label: 'تماس', render: (m) => <Ltr>{m.contactNumber}</Ltr> },
        { key: 'nid', label: 'شناسه/کد ملی', render: (m) => <Ltr>{m.nationalId}</Ltr> },
        { key: 'status', label: 'وضعیت', render: (m) => <StatusBadge map={ENABLED_FA} value={m.status} /> },
      ]}
    />
  );
}

const EMPTY: MerchantInput = {
  displayName: '',
  entityType: 'Legal',
  legalName: '',
  nationalId: '',
  economicId: '',
  managerName: '',
  managerNationalCode: '',
  contactNumber: '',
  websiteUrl: 'https://',
  officeAddress: '',
  iban: 'IR',
  contractFileId: null,
  merchantSettlementPlanId: '',
  status: 'Enabled',
  returnUrlDomains: [],
  webhookUrl: null,
};

function MerchantForm({ initial, existing, onSaved }: { initial: MerchantInput; existing?: MerchantDetail; onSaved: (id: string) => void }) {
  const [v, setV] = useState<MerchantInput>(initial);
  const [domains, setDomains] = useState(initial.returnUrlDomains.join('\n'));
  const [dirty, setDirty] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [ik, resetIk] = useFormIdempotencyKey();
  const { pending, errors, error, run } = useSubmit();
  useUnsavedGuard(dirty);
  const set = <K extends keyof MerchantInput>(k: K, value: MerchantInput[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setDirty(true);
  };
  const save = async () => {
    const body: MerchantInput = {
      ...v,
      economicId: v.economicId?.trim() ? v.economicId : null,
      webhookUrl: v.webhookUrl?.trim() ? v.webhookUrl : null,
      returnUrlDomains: domains.split(/[\s,،]+/).map((d) => d.trim()).filter(Boolean),
    };
    const r = await run(() =>
      existing
        ? api<MerchantDetail>(`/admin/merchants/${existing.id}`, { method: 'PATCH', body, ifMatch: existing.version })
        : api<MerchantDetail>('/admin/merchants', { body, idempotencyKey: ik }),
    );
    if (!existing) resetIk();
    if (r) {
      setDirty(false);
      onSaved(r.id);
    }
  };
  const individual = v.entityType === 'Individual';
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (existing?.status === 'Enabled' && v.status === 'Disabled') setConfirmDisable(true);
        else void save();
      }}
    >
      <Section title="اطلاعات فروشگاه">
        <FormGrid>
          <TextField label="نام نمایشی" value={v.displayName} onChange={(e) => set('displayName', e.target.value)} error={errors.displayName} required />
          <SelectField label="نوع شخصیت" value={v.entityType} options={Object.entries(ENTITY_TYPE_FA).map(([k, l]) => ({ value: k, label: l }))} onChange={(e) => set('entityType', e.target.value as 'Legal')} />
          <TextField label={individual ? 'نام کامل' : 'نام حقوقی'} value={v.legalName} onChange={(e) => set('legalName', e.target.value)} error={errors.legalName} required />
          <TextField label={individual ? 'کد ملی (۱۰ رقم)' : 'شناسه ملی (۱۱ رقم)'} dir="ltr" inputMode="numeric" value={v.nationalId} onChange={(e) => set('nationalId', e.target.value)} error={errors.nationalId} required />
          <TextField label={individual ? 'کد اقتصادی (اختیاری)' : 'کد اقتصادی'} dir="ltr" inputMode="numeric" value={v.economicId ?? ''} onChange={(e) => set('economicId', e.target.value)} error={errors.economicId} required={!individual} />
          <TextField label="نام مدیر" value={v.managerName} onChange={(e) => set('managerName', e.target.value)} error={errors.managerName} required />
          <TextField label="کد ملی مدیر" dir="ltr" inputMode="numeric" value={v.managerNationalCode} onChange={(e) => set('managerNationalCode', e.target.value)} error={errors.managerNationalCode} required />
          <TextField label="شماره تماس" dir="ltr" value={v.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} error={errors.contactNumber} />
          <TextField label="وب‌سایت" dir="ltr" value={v.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} error={errors.websiteUrl} />
          <TextField label="نشانی دفتر" value={v.officeAddress} onChange={(e) => set('officeAddress', e.target.value)} error={errors.officeAddress} />
          <TextField label="شماره شبا" dir="ltr" value={v.iban} onChange={(e) => set('iban', e.target.value)} error={errors.iban} />
          <FileUpload kind="Contract" label="قرارداد" value={v.contractFileId} currentUrl={existing?.contractUrl} onChange={(id) => set('contractFileId', id)} error={errors.contractFileId} />
        </FormGrid>
      </Section>
      <Section title="تسویه و یکپارچه‌سازی">
        <FormGrid>
          <PlanSelect kind="merchant" value={v.merchantSettlementPlanId} onChange={(x) => set('merchantSettlementPlanId', x)} error={errors.merchantSettlementPlanId} />
          <SelectField label="وضعیت" value={v.status} options={[{ value: 'Enabled', label: 'فعال' }, { value: 'Disabled', label: 'غیرفعال' }]} onChange={(e) => set('status', e.target.value as 'Enabled')} />
          <TextArea label="دامنه‌های مجاز بازگشت" dir="ltr" help="هر دامنه در یک سطر، مانند shop.example.com" value={domains} onChange={(e) => { setDomains(e.target.value); setDirty(true); }} error={errors.returnUrlDomains} />
          <TextField label="آدرس وب‌هوک (اختیاری)" dir="ltr" value={v.webhookUrl ?? ''} onChange={(e) => set('webhookUrl', e.target.value)} error={errors.webhookUrl} />
        </FormGrid>
      </Section>
      <FormError error={error} />
      <div className="row">
        <Button type="submit" pending={pending}>
          ذخیره
        </Button>
      </div>
      {confirmDisable && (
        <ConfirmDialog title="غیرفعال‌کردن فروشگاه؟" danger confirmLabel="غیرفعال شود" pending={pending} onClose={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void save(); }}>
          پرداخت‌های جدید این فروشگاه رد می‌شوند و بررسی دسترس‌پذیری «ناموجود» برمی‌گرداند. سفارش‌های در جریان ادامه می‌یابند.
        </ConfirmDialog>
      )}
    </form>
  );
}

export function MerchantNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <div className="stack">
      <PageHeader back="/admin/merchants" title="فروشگاه جدید" />
      <MerchantForm initial={EMPTY} onSaved={(id) => { toast('فروشگاه ایجاد شد.'); navigate(`/admin/merchants/${id}`); }} />
    </div>
  );
}

function ApiKeys({ m }: { m: MerchantDetail }) {
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [secret, setSecret] = useState<CreateApiKeyResponse | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const create = async () => {
    setPending(true);
    try {
      setSecret(await api<CreateApiKeyResponse>(`/admin/merchants/${m.id}/api-keys`, { method: 'POST', body: {} }));
      void qc.invalidateQueries();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const doRevoke = async () => {
    setPending(true);
    try {
      await api(`/admin/merchants/${m.id}/api-keys/${revoke}`, { method: 'DELETE' });
      setRevoke(null);
      void qc.invalidateQueries();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const active = m.apiKeys.filter((k) => k.status === 'Active').length;
  return (
    <Section
      title="کلیدهای API"
      actions={
        can('merchants.credentials') && (
          <Button size="sm" variant="tonal" onClick={() => void create()} pending={pending} disabled={active >= 2}>
            ایجاد کلید
          </Button>
        )
      }
    >
      <p className="muted bon-body-small">حداکثر دو کلید فعال برای چرخش کلید. رمز کلید فقط یک‌بار نمایش داده می‌شود.</p>
      <SimpleTable
        rows={m.apiKeys}
        columns={[
          { label: 'شناسه کلید', render: (k) => <Ltr>{k.keyId}</Ltr> },
          { label: 'وضعیت', render: (k) => (k.status === 'Active' ? <span className="badge badge--green">فعال</span> : <span className="badge badge--gray">ابطال‌شده</span>) },
          { label: 'آخرین استفاده', render: (k) => jDateTime(k.lastUsedAt) },
          { label: 'ایجاد', render: (k) => jDateTime(k.createdAt) },
          {
            label: '',
            render: (k) =>
              k.status === 'Active' && can('merchants.credentials') ? (
                <Button size="sm" variant="text" onClick={() => setRevoke(k.keyId)}>
                  ابطال
                </Button>
              ) : null,
          },
        ]}
        empty="کلیدی وجود ندارد."
      />
      {secret && (
        <Dialog title="کلید جدید" onClose={() => setSecret(null)} actions={<Button onClick={() => setSecret(null)}>ذخیره کردم</Button>}>
          <div className="stack">
            <Banner tone="warning">این رمز دیگر نمایش داده نمی‌شود. آن را همین حالا در سامانه فروشگاه ذخیره کنید.</Banner>
            <div>شناسه کلید:</div>
            <div className="code-box">{secret.keyId}</div>
            <div>رمز:</div>
            <div className="code-box">{secret.secret}</div>
          </div>
        </Dialog>
      )}
      {revoke && (
        <ConfirmDialog title="ابطال کلید؟" danger confirmLabel="ابطال" pending={pending} onClose={() => setRevoke(null)} onConfirm={() => void doRevoke()}>
          درخواست‌های امضاشده با کلید <Ltr>{revoke}</Ltr> از این پس رد می‌شوند.
        </ConfirmDialog>
      )}
    </Section>
  );
}

function Webhooks({ m }: { m: MerchantDetail }) {
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const redeliver = async (id: string) => {
    try {
      await api(`/admin/merchant-webhook-events/${id}/redeliver`, { method: 'POST', body: {} });
      toast('ارسال مجدد در صف قرار گرفت.');
      void qc.invalidateQueries();
    } catch (e) {
      toast(errorText(e));
    }
  };
  return (
    <Section title="رویدادهای وب‌هوک اخیر">
      <SimpleTable
        rows={m.recentWebhookEvents}
        columns={[
          { label: 'رویداد', render: (e) => <Ltr>{e.eventType}</Ltr> },
          { label: 'وضعیت', render: (e) => <StatusBadge map={WEBHOOK_STATUS_FA} value={e.status} /> },
          { label: 'تلاش‌ها', render: (e) => num(e.attempts), numeric: true },
          { label: 'آخرین HTTP', render: (e) => e.lastHttpStatus ?? '—', numeric: true },
          { label: 'ایجاد', render: (e) => jDateTime(e.createdAt) },
          { label: '', render: (e) => (e.status === 'Exhausted' && can('merchants.manage') ? <Button size="sm" variant="text" onClick={() => void redeliver(e.id)}>ارسال مجدد</Button> : null) },
        ]}
        empty="رویدادی ثبت نشده است."
      />
    </Section>
  );
}

export function MerchantDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<MerchantDetail>(`/admin/merchants/${id}`);
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  return (
    <QueryGate q={q}>
      {(m) => (
        <div className="stack">
          <PageHeader
            back="/admin/merchants"
            title={m.displayName}
            subtitle={<Ltr>{m.id}</Ltr>}
            actions={can('merchants.manage') && <Button variant={editing ? 'text' : 'outline'} size="sm" onClick={() => setEditing(!editing)}>{editing ? 'انصراف از ویرایش' : 'ویرایش'}</Button>}
          />
          {editing ? (
            <MerchantForm
              key={m.version}
              existing={m}
              initial={{
                displayName: m.displayName,
                entityType: m.entityType,
                legalName: m.legalName,
                nationalId: m.nationalId,
                economicId: m.economicId,
                managerName: m.managerName,
                managerNationalCode: m.managerNationalCode,
                contactNumber: m.contactNumber,
                websiteUrl: m.websiteUrl,
                officeAddress: m.officeAddress,
                iban: m.iban,
                contractFileId: m.contractFileId,
                merchantSettlementPlanId: m.merchantSettlementPlanId,
                status: m.status,
                returnUrlDomains: m.returnUrlDomains,
                webhookUrl: m.webhookUrl,
              }}
              onSaved={() => { toast('ذخیره شد.'); setEditing(false); void qc.invalidateQueries(); }}
            />
          ) : (
            <>
              <div className="grid-2">
                <Section title="اطلاعات">
                  <DL
                    items={[
                      ['وضعیت', <StatusBadge key="s" map={ENABLED_FA} value={m.status} />],
                      ['نوع شخصیت', ENTITY_TYPE_FA[m.entityType]],
                      ['نام حقوقی', m.legalName],
                      ['شناسه/کد ملی', <Ltr key="n">{m.nationalId}</Ltr>],
                      ['کد اقتصادی', <Ltr key="e">{m.economicId}</Ltr>],
                      ['مدیر', m.managerName],
                      ['کد ملی مدیر', <Ltr key="mc">{m.managerNationalCode}</Ltr>],
                      ['تماس', <Ltr key="c">{m.contactNumber}</Ltr>],
                      ['وب‌سایت', <Ltr key="w">{m.websiteUrl}</Ltr>],
                      ['نشانی', m.officeAddress],
                      ['شبا', <Ltr key="i">{m.iban}</Ltr>],
                      ['قرارداد', m.contractUrl ? <a key="k" href={m.contractUrl}>دریافت</a> : null],
                    ]}
                  />
                </Section>
                <Section title="یکپارچه‌سازی">
                  <DL
                    items={[
                      ['طرح تسویه', m.planNumber],
                      ['دامنه‌های بازگشت', m.returnUrlDomains.length ? <Ltr key="d">{m.returnUrlDomains.join(', ')}</Ltr> : null],
                      ['وب‌هوک', <Ltr key="h">{m.webhookUrl}</Ltr>],
                    ]}
                  />
                </Section>
              </div>
              <ApiKeys m={m} />
              <Webhooks m={m} />
              <InvoiceSummaries summaries={m.invoiceSummaries} />
            </>
          )}
        </div>
      )}
    </QueryGate>
  );
}
