import { useState } from 'react';
import type { MerchantPlanDto, ProviderPlanDto, UploadFileResponse } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { bpsToPercent, num } from '../../../shared/format/format';
import { errorText } from '../../../shared/i18n/fa';
import { SelectField } from '../../../shared/ui/Field';
import { useApiQuery } from '../common/api-hooks';

/** Stages a file (FR-090); the record save commits it atomically. */
export function FileUpload({ kind, label, value, currentUrl, onChange, error }: { kind: 'Icon' | 'Contract'; label: string; value: string | null; currentUrl?: string | null; onChange: (fileId: string | null) => void; error?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const upload = async (file: File) => {
    setStatus('در حال بارگذاری…');
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    try {
      const r = await api<UploadFileResponse>('/admin/files', { method: 'POST', form });
      onChange(r.fileId);
      setStatus('بارگذاری شد؛ با ذخیره فرم ثبت می‌شود.');
    } catch (e) {
      setStatus(errorText(e));
    }
  };
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        type="file"
        aria-label={label}
        accept={kind === 'Icon' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <span className="field__help">{kind === 'Icon' ? 'PNG، JPEG یا WebP تا ۵۱۲ کیلوبایت (SVG مجاز نیست).' : 'PDF تا ۱۰ مگابایت.'}</span>
      {currentUrl && !value?.startsWith('new:') && (
        <a href={currentUrl} target="_blank" rel="noopener">
          مشاهده فایل فعلی
        </a>
      )}
      {status && <span className="field__help">{status}</span>}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function PlanSelect({ kind, value, onChange, error }: { kind: 'provider' | 'merchant'; value: string; onChange: (v: string) => void; error?: string }) {
  const q = useApiQuery<(ProviderPlanDto | MerchantPlanDto)[]>(`/admin/${kind}-settlement-plans`, { status: 'Active' });
  const options = (q.data ?? []).map((p) => ({
    value: p.id,
    label:
      'providerPayableMarginBps' in p
        ? `${p.planNumber} — کارمزد ${bpsToPercent(p.providerPayableMarginBps)}، ${num(p.installmentCount)} قسط`
        : `${p.planNumber} — کمیسیون ${bpsToPercent(p.merchantReceivableMarginBps)}، ${num(p.installmentCount)} قسط${p.cashSettlementEnabled ? `، نقدی ${bpsToPercent(p.cashSettlementBps)}` : ''}`,
  }));
  return <SelectField label="طرح تسویه" value={value} placeholder="انتخاب طرح" options={options} onChange={(e) => onChange(e.target.value)} error={error} required />;
}
