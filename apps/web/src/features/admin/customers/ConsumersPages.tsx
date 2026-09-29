import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { ConsumerDetail, ConsumerListItem } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDate, jDateTime, toman } from '../../../shared/format/format';
import { CONSUMER_STATUS_FA, ORDER_STATUS_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/Dialog';
import { TextArea } from '../../../shared/ui/Field';
import { StatusBadge } from '../../../shared/ui/Feedback';
import { useApiQuery } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useCan } from '../session';

const fullName = (c: { firstName: string | null; lastName: string | null }) => (c.firstName ? `${c.firstName} ${c.lastName ?? ''}` : 'هنوز احراز نشده');

/** FR-113 consumer list (PII masked without consumers.pii). */
export function ConsumersListPage() {
  return (
    <ResourceList<ConsumerListItem>
      title="مشتریان"
      path="/admin/consumers"
      itemsName="مشتری"
      exportResource="consumers"
      rowHref={(c) => `/admin/consumers/${c.id}`}
      filters={[
        { name: 'phone', label: 'شماره موبایل (دقیق)', type: 'text', dir: 'ltr' },
        { name: 'name', label: 'نام', type: 'text' },
        { name: 'status', label: 'وضعیت', type: 'select', options: Object.entries(CONSUMER_STATUS_FA).map(([v, [l]]) => ({ value: v, label: l })) },
      ]}
      columns={[
        { key: 'name', label: 'نام', render: (c) => fullName(c) },
        { key: 'phone', label: 'موبایل', render: (c) => <Ltr>{c.phone}</Ltr> },
        { key: 'status', label: 'وضعیت', render: (c) => <StatusBadge map={CONSUMER_STATUS_FA} value={c.status} /> },
        { key: 'created', label: 'ثبت', render: (c) => jDateTime(c.createdAt) },
      ]}
    />
  );
}

export function ConsumerDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<ConsumerDetail>(`/admin/consumers/${id}`);
  const can = useCan();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'Blocked' | 'Active' | null>(null);
  const [reason, setReason] = useState('');
  const { pending, error, run } = useSubmit();
  const submit = async () => {
    const r = await run(() => api(`/admin/consumers/${id}/status`, { method: 'PATCH', body: { status: dialog, reason } }));
    if (r) {
      setDialog(null);
      setReason('');
      void qc.invalidateQueries();
    }
  };
  return (
    <QueryGate q={q}>
      {(c) => (
        <div className="stack">
          <PageHeader
            back="/admin/consumers"
            title={fullName(c)}
            subtitle={<Ltr>{c.phone}</Ltr>}
            actions={
              can('consumers.block') &&
              (c.status === 'Blocked' ? (
                <Button size="sm" variant="tonal" onClick={() => setDialog('Active')}>
                  رفع مسدودی
                </Button>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setDialog('Blocked')}>
                  مسدودسازی
                </Button>
              ))
            }
          />
          <div className="grid-2">
            <Section title="اطلاعات">
              <DL
                items={[
                  ['وضعیت', <StatusBadge key="s" map={CONSUMER_STATUS_FA} value={c.status} />],
                  ['محرومیت موقت تا', jDateTime(c.cooldownUntil)],
                  ['آخرین تراکنش', jDateTime(c.lastTransactionAt)],
                  ['ثبت', jDateTime(c.createdAt)],
                ]}
              />
            </Section>
            <Section title="هویت">
              {c.linkage ? (
                <DL
                  items={[
                    ['وضعیت پیوند', c.linkage.status],
                    ['کد ملی', <Ltr key="n">{c.linkage.nationalId}</Ltr>],
                    ['تاریخ تولد', c.linkage.dateOfBirth ? (c.piiVisible ? jDate(c.linkage.dateOfBirth) : c.linkage.dateOfBirth) : null],
                    ['تأیید', jDateTime(c.linkage.verifiedAt)],
                    ['آخرین تطبیق', jDateTime(c.linkage.lastMatchedAt)],
                  ]}
                />
              ) : (
                <p className="muted">هنوز احراز هویت نشده است.</p>
              )}
              {!c.piiVisible && <p className="muted bon-body-small">اطلاعات هویتی به‌صورت پوشیده نمایش داده می‌شود.</p>}
            </Section>
          </div>
          <Section title="تأمین‌کنندگان مرتبط">
            <SimpleTable
              rows={c.linkedProviders}
              columns={[
                { label: 'تأمین‌کننده', render: (p) => <Link to={`/admin/providers/${p.providerId}`}>{p.displayName}</Link> },
                { label: 'آخرین استفاده', render: (p) => jDateTime(p.lastUsedAt) },
              ]}
            />
          </Section>
          <Section title="سفارش‌ها">
            <SimpleTable
              rows={c.orders}
              columns={[
                { label: 'شماره', render: (o) => <Link to={`/admin/orders/${o.id}`}><Ltr>{o.merchantOrderNumber}</Ltr></Link> },
                { label: 'فروشگاه', render: (o) => o.merchantName },
                { label: 'مبلغ', render: (o) => toman(o.totalAmount), numeric: true },
                { label: 'وضعیت', render: (o) => <StatusBadge map={ORDER_STATUS_FA} value={o.status} /> },
                { label: 'زمان', render: (o) => jDateTime(o.createdAt) },
              ]}
            />
          </Section>
          {dialog && (
            <ConfirmDialog
              title={dialog === 'Blocked' ? 'مسدودسازی مشتری؟' : 'رفع مسدودی مشتری؟'}
              danger={dialog === 'Blocked'}
              confirmLabel={dialog === 'Blocked' ? 'مسدود شود' : 'رفع مسدودی'}
              pending={pending}
              onClose={() => setDialog(null)}
              onConfirm={() => void submit()}
            >
              <div className="stack">
                <p>{dialog === 'Blocked' ? 'پرداخت‌های جدید و تأیید کد این مشتری رد می‌شود؛ سفارش‌هایی که از مرحله کد تأیید گذشته‌اند ادامه می‌یابند.' : 'مشتری دوباره می‌تواند پرداخت جدید آغاز کند.'}</p>
                <TextArea label="دلیل" value={reason} onChange={(e) => setReason(e.target.value)} />
                <FormError error={error} />
              </div>
            </ConfirmDialog>
          )}
        </div>
      )}
    </QueryGate>
  );
}
