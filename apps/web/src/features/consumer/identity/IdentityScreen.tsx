import { useEffect, useState } from 'react';
import { isValidNationalCode, toAsciiDigits } from '@bajet/contracts';
import { ApiError } from '../../../shared/api/client';
import { Button } from '../../../shared/ui/Button';
import { TextField } from '../../../shared/ui/Field';
import { Banner, Spinner } from '../../../shared/ui/Feedback';
import { currentJalaliYear, JalaliDateInput } from '../../../shared/ui/JalaliDateInput';
import { useCheckout } from '../../checkout/CheckoutContext';
import { CheckoutLayout } from '../../checkout/CheckoutLayout';

/** FR-020–022: linkage check, national ID, date of birth (Jalali picker). */
export function IdentityScreen() {
  const { order } = useCheckout();
  if (order.identityStep === 'check') return <LinkageCheck />;
  if (order.identityStep === 'dob') return <DobStep />;
  return <NationalIdStep />;
}

function mismatchText(e: ApiError): string {
  const left = e.details?.attemptsLeft;
  return `اطلاعات واردشده با سوابق ما مطابقت ندارد.${left ? ` ${left} تلاش دیگر باقی مانده است.` : ''}`;
}

function LinkageCheck() {
  const { client, order, setOrder, handleError } = useCheckout();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async () => {
    setPending(true);
    setError(null);
    try {
      setOrder((await client.identityCheck(order.version)).order);
    } catch (e) {
      setError(handleError(e));
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <CheckoutLayout title="بررسی هویت">
      {pending && <Spinner label="در حال بررسی اطلاعات هویتی…" />}
      {error && (
        <Banner tone="error">
          <div className="stack stack--sm">
            <span>{error}</span>
            <Button variant="tonal" size="sm" onClick={() => void run()}>
              تلاش دوباره
            </Button>
          </div>
        </Banner>
      )}
    </CheckoutLayout>
  );
}

function NationalIdStep() {
  const { client, order, setOrder, handleError } = useCheckout();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serviceDown, setServiceDown] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const id = toAsciiDigits(value.trim());
    // Local check before any external call (FR-021 AC1).
    if (!isValidNationalCode(id)) {
      setError('لطفاً کد ملی معتبر وارد کنید.');
      return;
    }
    setPending(true);
    setError(null);
    setServiceDown(false);
    try {
      setOrder((await client.nationalId(order.version, id)).order);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'IDENTITY_MISMATCH') setError(mismatchText(e));
      else if (e instanceof ApiError && e.code === 'IDENTITY_SERVICE_UNAVAILABLE') setServiceDown(true);
      else setError(handleError(e, () => void submit()));
    } finally {
      setPending(false);
    }
  };

  return (
    <CheckoutLayout
      title="احراز هویت"
      footer={
        <Button block onClick={() => void submit()} pending={pending}>
          ادامه
        </Button>
      }
    >
      <p className="bon-body-large">برای استعلام اعتبار، کد ملی صاحب این شماره موبایل را وارد کنید.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="کد ملی" inputMode="numeric" maxLength={10} dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} error={error} autoComplete="off" />
      </form>
      {serviceDown && <Banner tone="warning">در حال حاضر امکان استعلام هویت نیست. لطفاً دوباره تلاش کنید.</Banner>}
    </CheckoutLayout>
  );
}

function DobStep() {
  const { client, order, setOrder, handleError } = useCheckout();
  const [dob, setDob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceDown, setServiceDown] = useState(false);
  const [pending, setPending] = useState(false);
  const year = currentJalaliYear();

  const submit = async () => {
    if (!dob) {
      setError('تاریخ تولد را کامل انتخاب کنید.');
      return;
    }
    setPending(true);
    setError(null);
    setServiceDown(false);
    try {
      setOrder((await client.dob(order.version, dob)).order);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'IDENTITY_MISMATCH') setError(mismatchText(e));
      else if (e instanceof ApiError && e.code === 'IDENTITY_SERVICE_UNAVAILABLE') setServiceDown(true);
      else setError(handleError(e, () => void submit()));
    } finally {
      setPending(false);
    }
  };

  return (
    <CheckoutLayout
      title="تاریخ تولد"
      footer={
        <Button block onClick={() => void submit()} pending={pending}>
          ادامه
        </Button>
      }
    >
      <p className="bon-body-large">تاریخ تولد خود را به تقویم شمسی انتخاب کنید.</p>
      <JalaliDateInput label="تاریخ تولد" value={dob} onChange={setDob} minYear={1279} maxYear={year} error={error} />
      {serviceDown && <Banner tone="warning">در حال حاضر امکان استعلام هویت نیست. لطفاً دوباره تلاش کنید.</Banner>}
    </CheckoutLayout>
  );
}
