import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SETTINGS, splitCash, type SettingChangeDto, type SettingDto, type SettingKey } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { bpsToPercent, jDateTime, num, percentToBps, toman } from '../../../shared/format/format';
import { SETTING_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { SelectField, TextArea, TextField } from '../../../shared/ui/Field';
import { Banner } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery } from '../common/api-hooks';
import { Ltr, PageHeader, QueryGate, SimpleTable } from '../common/Detail';
import { FormError, useSubmit } from '../common/FormBits';
import { useCan } from '../session';

type Value = number | boolean;
type Values = Partial<Record<SettingKey, Value>>;

const SAMPLE_ORDER = 10_000_000;

const isBps = (key: SettingKey) => key === 'cashPaymentBps';

function display(key: SettingKey, v: Value): string {
  if (typeof v === 'boolean') return v ? 'فعال' : 'غیرفعال';
  if (isBps(key)) return bpsToPercent(v);
  if (key === 'minOrderAmount' || key === 'maxOrderAmount' || key === 'manualDocApprovalThreshold') return toman(v);
  return num(v);
}

/** The breakdown of a 10,000,000 Toman order under a set of settings (§8.3 dangerous-action confirm). */
function sampleOrder(s: Values): string {
  if (s.checkoutKillSwitch) return 'پذیرفته نمی‌شود (توقف کامل پرداخت‌ها)';
  if (typeof s.minOrderAmount === 'number' && SAMPLE_ORDER < s.minOrderAmount) return 'پذیرفته نمی‌شود (کمتر از حداقل مبلغ)';
  if (typeof s.maxOrderAmount === 'number' && SAMPLE_ORDER > s.maxOrderAmount) return 'پذیرفته نمی‌شود (بیشتر از حداکثر مبلغ)';
  const { cashAmount, creditAmount } = splitCash(SAMPLE_ORDER, Number(s.cashPaymentBps ?? 0), false);
  const cashOnly = s.allowCashOnly ? ` · پرداخت کامل با کارت: ${toman(SAMPLE_ORDER)}` : '';
  return `نقدی ${toman(cashAmount)} + اعتباری ${toman(creditAmount)}${cashOnly}`;
}

/** FR-101 system settings: typed, range-validated, reason + TOTP step-up on change. */
export function SettingsPage() {
  const q = useApiQuery<SettingDto[]>('/admin/settings');
  const can = useCan();
  const [editing, setEditing] = useState<SettingDto | null>(null);
  const [history, setHistory] = useState<SettingKey | null>(null);
  return (
    <div className="stack">
      <PageHeader title="تنظیمات سیستم" subtitle="تغییرات برای سفارش‌هایی اعمال می‌شود که پس از ذخیره وارد مرحله مربوط شوند." />
      <QueryGate q={q}>
        {(settings) => {
          const values: Values = Object.fromEntries(settings.map((s) => [s.key, s.value]));
          return (
            <>
              <div className="card">
                <SimpleTable
                  rows={settings}
                  columns={[
                    {
                      label: 'تنظیم',
                      render: (s) => (
                        <div>
                          <div>{SETTING_FA[s.key] ?? s.key}</div>
                          <div className="muted bon-body-small">
                            <Ltr>{s.key}</Ltr>
                          </div>
                        </div>
                      ),
                    },
                    { label: 'مقدار', render: (s) => display(s.key, s.value), numeric: true },
                    { label: 'پیش‌فرض', render: (s) => display(s.key, s.default), numeric: true },
                    { label: 'بازه', render: (s) => (s.type === 'bool' ? '—' : `${display(s.key, s.min ?? 0)} تا ${s.max === null ? '∞' : display(s.key, s.max)}`) },
                    { label: 'آخرین تغییر', render: (s) => jDateTime(s.updatedAt) },
                    {
                      label: '',
                      render: (s) => (
                        <div className="row">
                          <Button size="sm" variant="text" onClick={() => setHistory(s.key)}>
                            سابقه
                          </Button>
                          {can('settings.manage') && (
                            <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                              ویرایش
                            </Button>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
              {editing && <EditSettingDialog setting={editing} values={values} onClose={() => setEditing(null)} />}
              {history && <HistoryDialog settingKey={history} onClose={() => setHistory(null)} />}
            </>
          );
        }}
      </QueryGate>
    </div>
  );
}

function EditSettingDialog({ setting, values, onClose }: { setting: SettingDto; values: Values; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = typeof setting.value === 'boolean' ? String(setting.value) : isBps(setting.key) ? bpsToPercent(setting.value) : String(setting.value);
  const [raw, setRaw] = useState(initial);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [localError, setLocalError] = useState<string | null>(null);
  const { pending, errors, error, run } = useSubmit();

  const parse = (): Value | null => {
    if (setting.type === 'bool') return raw === 'true';
    if (isBps(setting.key)) return percentToBps(raw);
    const n = Number(raw.replace(/[,،\s]/g, ''));
    return Number.isSafeInteger(n) ? n : null;
  };
  const next = parse();

  const review = () => {
    setLocalError(null);
    if (next === null) return setLocalError('مقدار معتبر وارد کنید.');
    if (typeof next === 'number') {
      if (setting.min !== null && next < setting.min) return setLocalError(`مقدار باید حداقل ${display(setting.key, setting.min)} باشد.`);
      if (setting.max !== null && next > setting.max) return setLocalError(`مقدار باید حداکثر ${display(setting.key, setting.max)} باشد.`);
    }
    if (next === setting.value) return setLocalError('مقدار تغییری نکرده است.');
    if (reason.trim().length < 3) return setLocalError('دلیل تغییر را بنویسید.');
    setStep('confirm');
  };
  const save = async () => {
    const r = await run(() => api<SettingDto>(`/admin/settings/${setting.key}`, { method: 'PATCH', body: { value: next, reason: reason.trim() } }));
    if (r) {
      toast('تنظیم ذخیره شد.');
      void qc.invalidateQueries();
      onClose();
    } else setStep('edit');
  };

  const title = SETTING_FA[setting.key] ?? setting.key;
  if (step === 'confirm' && next !== null) {
    const after = { ...values, [setting.key]: next };
    return (
      <Dialog
        title={`تغییر «${title}»؟`}
        onClose={onClose}
        actions={
          <>
            <Button variant="text" onClick={() => setStep('edit')}>
              بازگشت
            </Button>
            <Button variant={setting.key === 'checkoutKillSwitch' && next === true ? 'danger' : 'filled'} pending={pending} onClick={() => void save()}>
              ذخیره
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>
            {display(setting.key, setting.value)} ← {display(setting.key, next)}
          </p>
          <div className="stack" style={{ gap: 4 }}>
            <strong>اثر روی یک سفارش {toman(SAMPLE_ORDER)}:</strong>
            <span>پیش از تغییر: {sampleOrder(values)}</span>
            <span>پس از تغییر: {sampleOrder(after)}</span>
          </div>
          <p className="muted bon-body-small">برای ذخیره ممکن است کد تأیید دومرحله‌ای خواسته شود.</p>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog
      title={`ویرایش «${title}»`}
      onClose={onClose}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={review}>ادامه</Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted bon-body-small">{SETTINGS[setting.key].description}</p>
        {setting.type === 'bool' ? (
          <SelectField
            label="مقدار"
            value={raw}
            options={[
              { value: 'true', label: 'فعال' },
              { value: 'false', label: 'غیرفعال' },
            ]}
            onChange={(e) => setRaw(e.target.value)}
          />
        ) : (
          <TextField label={isBps(setting.key) ? 'مقدار (درصد)' : 'مقدار'} dir="ltr" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} error={errors.value} />
        )}
        <TextArea label="دلیل تغییر" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} required />
        {localError && <Banner tone="error">{localError}</Banner>}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

function HistoryDialog({ settingKey, onClose }: { settingKey: SettingKey; onClose: () => void }) {
  const q = useApiQuery<SettingChangeDto[]>(`/admin/settings/${settingKey}/history`);
  return (
    <Dialog
      title={`سابقه «${SETTING_FA[settingKey] ?? settingKey}»`}
      onClose={onClose}
      actions={
        <Button variant="text" onClick={onClose}>
          بستن
        </Button>
      }
    >
      <QueryGate q={q}>
        {(rows) => (
          <SimpleTable
            rows={rows}
            empty="هنوز تغییری ثبت نشده است."
            columns={[
              { label: 'زمان', render: (c) => jDateTime(c.createdAt) },
              { label: 'تغییر', render: (c) => `${display(settingKey, c.oldValue)} ← ${display(settingKey, c.newValue)}` },
              { label: 'دلیل', render: (c) => c.reason },
              { label: 'توسط', render: (c) => <Ltr>{c.changedBy}</Ltr> },
            ]}
          />
        )}
      </QueryGate>
    </Dialog>
  );
}
