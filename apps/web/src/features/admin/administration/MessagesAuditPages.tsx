import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MESSAGE_STATUSES, type AuditLogDto, type ExportDto, type MessageEventDto, type MessageLogDto, type MessageTemplateDto, type MessageTemplateInput } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDateTime, num } from '../../../shared/format/format';
import { EXPORT_STATUS_FA, MESSAGE_STATUS_FA, type LabelMap } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { SelectField, TextArea, TextField } from '../../../shared/ui/Field';
import { Banner, StatusBadge } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useUnsavedGuard } from '../common/api-hooks';
import { Ltr, PageHeader, QueryGate, SimpleTable } from '../common/Detail';
import { FormError, FormGrid, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan } from '../session';

const TEMPLATE_STATUS_FA: LabelMap = { Active: ['فعال', 'green'], Inactive: ['غیرفعال', 'gray'] };

const EXPORT_RESOURCE_FA: Record<string, string> = {
  orders: 'سفارش‌ها',
  consumers: 'مشتریان',
  refunds: 'بازپرداخت‌ها',
  'bank-transactions': 'تراکنش‌های بانکی',
  'provider-transactions': 'تراکنش‌های اعتباری',
  documents: 'اسناد',
  invoices: 'صورت‌حساب‌ها',
  'reconciliation-items': 'مغایرت‌ها',
  'audit-logs': 'گزارش ممیزی',
  'message-logs': 'گزارش پیام‌ها',
};

/* ───────────── Message templates (FR-150) ───────────── */

export function TemplatesListPage() {
  const q = useApiQuery<MessageTemplateDto[]>('/admin/message-templates');
  const can = useCan();
  return (
    <div className="stack">
      <PageHeader
        title="قالب‌های پیام"
        actions={
          can('messages.manage') && (
            <Link className="btn btn--filled btn--sm" to="/admin/messages/templates/new">
              قالب جدید
            </Link>
          )
        }
      />
      <QueryGate q={q}>
        {(rows) => (
          <div className="card">
            <SimpleTable
              rows={rows}
              columns={[
                { label: 'نام', render: (t) => <Link to={`/admin/messages/templates/${t.id}`}>{t.name}</Link> },
                { label: 'رویداد', render: (t) => <Ltr>{t.event}</Ltr> },
                { label: 'کانال', render: (t) => t.channel },
                {
                  label: 'وضعیت',
                  render: (t) => (
                    <>
                      <StatusBadge map={TEMPLATE_STATUS_FA} value={t.status} /> {t.orphaned && <span className="badge badge--red">رویداد نامعتبر</span>}
                    </>
                  ),
                },
                { label: 'به‌روزرسانی', render: (t) => jDateTime(t.updatedAt) },
              ]}
            />
          </div>
        )}
      </QueryGate>
    </div>
  );
}

export function TemplateNewPage() {
  return <TemplateForm />;
}

export function TemplateDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<MessageTemplateDto>(`/admin/message-templates/${id}`);
  return <QueryGate q={q}>{(t) => <TemplateForm key={t.updatedAt} template={t} />}</QueryGate>;
}

function TemplateForm({ template }: { template?: MessageTemplateDto }) {
  const navigate = useNavigate();
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const events = useApiQuery<MessageEventDto[]>('/admin/message-events');
  const [v, setV] = useState<MessageTemplateInput>({
    event: template?.event ?? '',
    channel: 'SMS',
    name: template?.name ?? '',
    content: template?.content ?? '',
    status: template?.status ?? 'Active',
  });
  const { pending, errors, error, run } = useSubmit();
  const readOnly = !can('messages.manage');
  const dirty = template ? v.name !== template.name || v.content !== template.content || v.status !== template.status || v.event !== template.event : v.name !== '' || v.content !== '';
  useUnsavedGuard(dirty);
  const eventDef = events.data?.find((e) => e.event === v.event);
  const used = [...v.content.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  const missing = eventDef ? eventDef.requiredParams.filter((p) => !used.includes(p)) : [];
  const submit = async () => {
    const r = template
      ? await run(() => api<MessageTemplateDto>(`/admin/message-templates/${template.id}`, { method: 'PATCH', body: { event: v.event, name: v.name, content: v.content, status: v.status } }))
      : await run(() => api<MessageTemplateDto>('/admin/message-templates', { body: v }));
    if (r) {
      toast('قالب ذخیره شد.');
      void qc.invalidateQueries();
      if (!template) navigate(`/admin/messages/templates/${r.id}`);
    }
  };
  return (
    <div className="stack">
      <PageHeader back="/admin/messages/templates" title={template ? template.name : 'قالب جدید'} />
      {template?.orphaned && <Banner tone="warning">رویداد این قالب دیگر در سیستم وجود ندارد و استفاده نمی‌شود.</Banner>}
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormGrid>
          <TextField label="نام" value={v.name} disabled={readOnly} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} required />
          <SelectField
            label="رویداد"
            placeholder="انتخاب کنید"
            value={v.event}
            disabled={readOnly}
            options={(events.data ?? []).map((e) => ({ value: e.event, label: `${e.event} — ${e.description}` }))}
            onChange={(e) => setV({ ...v, event: e.target.value })}
            error={errors.event}
            required
          />
          <SelectField
            label="وضعیت"
            value={v.status}
            disabled={readOnly}
            options={[
              { value: 'Active', label: 'فعال' },
              { value: 'Inactive', label: 'غیرفعال' },
            ]}
            onChange={(e) => setV({ ...v, status: e.target.value as 'Active' })}
          />
          <TextField label="کانال" value="SMS" disabled />
        </FormGrid>
        <TextArea label="متن پیام" value={v.content} disabled={readOnly} rows={5} onChange={(e) => setV({ ...v, content: e.target.value })} error={errors.content} required />
        {eventDef && (
          <p className="muted bon-body-small">
            پارامترهای لازم: <Ltr>{eventDef.requiredParams.map((p) => `{{${p}}}`).join(' ') || '—'}</Ltr>
          </p>
        )}
        {missing.length > 0 && (
          <Banner tone="warning">
            پارامترهای جاافتاده: <Ltr>{missing.map((p) => `{{${p}}}`).join(' ')}</Ltr>
          </Banner>
        )}
        <FormError error={error} />
        {!readOnly && (
          <div className="row">
            <Button type="submit" pending={pending}>
              ذخیره
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

/* ───────────── Message logs (FR-151) ───────────── */

export function MessageLogsPage() {
  return (
    <ResourceList<MessageLogDto>
      title="گزارش پیام‌ها"
      path="/admin/message-logs"
      itemsName="پیام"
      exportResource="message-logs"
      filters={[
        { name: 'recipient', label: 'گیرنده', type: 'text', dir: 'ltr' },
        { name: 'event', label: 'رویداد', type: 'text', dir: 'ltr' },
        { name: 'status', label: 'وضعیت', type: 'select', options: MESSAGE_STATUSES.map((s) => ({ value: s, label: MESSAGE_STATUS_FA[s][0] })) },
        { name: 'from', label: 'از تاریخ', type: 'dateFrom' },
        { name: 'to', label: 'تا تاریخ', type: 'dateTo' },
      ]}
      columns={[
        { key: 'time', label: 'زمان', render: (m) => jDateTime(m.createdAt) },
        { key: 'event', label: 'رویداد', render: (m) => <Ltr>{m.event}</Ltr> },
        { key: 'to', label: 'گیرنده', render: (m) => <Ltr>{m.recipient}</Ltr> },
        { key: 'status', label: 'وضعیت', render: (m) => <StatusBadge map={MESSAGE_STATUS_FA} value={m.status} /> },
        { key: 'provider', label: 'سرویس‌دهنده', render: (m) => <Ltr>{m.provider}</Ltr> },
        { key: 'delivered', label: 'تحویل', render: (m) => jDateTime(m.deliveredAt) },
        { key: 'error', label: 'خطا', render: (m) => m.error },
      ]}
    />
  );
}

/* ───────────── Audit log (FR-082) ───────────── */

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return (
    <pre dir="ltr" className="bon-body-small" style={{ margin: 0, maxWidth: 360, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(value, null, 1)}
    </pre>
  );
}

export function AuditLogPage() {
  return (
    <ResourceList<AuditLogDto>
      title="گزارش ممیزی"
      path="/admin/audit-logs"
      itemsName="رویداد"
      exportResource="audit-logs"
      filters={[
        { name: 'actorId', label: 'شناسه کاربر', type: 'text', dir: 'ltr' },
        { name: 'action', label: 'عملیات', type: 'text', dir: 'ltr' },
        { name: 'entityType', label: 'نوع موجودیت', type: 'text', dir: 'ltr' },
        { name: 'entityId', label: 'شناسه موجودیت', type: 'text', dir: 'ltr' },
        { name: 'from', label: 'از تاریخ', type: 'dateFrom' },
        { name: 'to', label: 'تا تاریخ', type: 'dateTo' },
      ]}
      columns={[
        { key: 'time', label: 'زمان', render: (a) => jDateTime(a.createdAt) },
        { key: 'actor', label: 'کاربر', render: (a) => a.actorName ?? <Ltr>{a.actorId ?? 'system'}</Ltr> },
        { key: 'action', label: 'عملیات', render: (a) => <Ltr>{a.action}</Ltr> },
        { key: 'entity', label: 'موجودیت', render: (a) => <Ltr>{[a.entityType, a.entityId].filter(Boolean).join(' ')}</Ltr> },
        { key: 'before', label: 'قبل', render: (a) => <Json value={a.before} /> },
        { key: 'after', label: 'بعد', render: (a) => <Json value={a.after} /> },
        { key: 'ip', label: 'IP', render: (a) => <Ltr>{a.ip}</Ltr> },
      ]}
    />
  );
}

/* ───────────── Exports (FR-082 / §8.3) ───────────── */

export function ExportsPage() {
  const q = useApiQuery<ExportDto[]>('/admin/exports');
  const pending = q.data?.some((e) => e.status === 'Pending' || e.status === 'Processing');
  return (
    <div className="stack">
      <PageHeader
        title="خروجی‌ها"
        subtitle="خروجی CSV هر فهرست از دکمه «خروجی» همان فهرست ساخته می‌شود."
        actions={
          <Button size="sm" variant="outline" pending={q.isFetching} onClick={() => void q.refetch()}>
            به‌روزرسانی
          </Button>
        }
      />
      {pending && <Banner>برخی خروجی‌ها در حال ساخت هستند؛ چند لحظه بعد به‌روزرسانی کنید.</Banner>}
      <QueryGate q={q}>
        {(rows) => (
          <div className="card">
            <SimpleTable
              rows={rows}
              empty="هنوز خروجی نساخته‌اید."
              columns={[
                { label: 'فهرست', render: (e) => EXPORT_RESOURCE_FA[e.resource] ?? e.resource },
                { label: 'وضعیت', render: (e) => <StatusBadge map={EXPORT_STATUS_FA} value={e.status} /> },
                { label: 'تعداد ردیف', render: (e) => num(e.rowCount), numeric: true },
                { label: 'زمان', render: (e) => jDateTime(e.createdAt) },
                {
                  label: '',
                  render: (e) =>
                    e.downloadUrl ? (
                      <a href={e.downloadUrl} download>
                        دانلود
                      </a>
                    ) : (
                      e.error
                    ),
                },
              ]}
            />
          </div>
        )}
      </QueryGate>
    </div>
  );
}
