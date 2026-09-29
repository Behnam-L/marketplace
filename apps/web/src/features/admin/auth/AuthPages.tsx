import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toAsciiDigits, type AcceptInvitationResponse, type AdminSessionInfo, type LoginResponse } from '@bajet/contracts';
import { ApiError, api, setCsrfToken } from '../../../shared/api/client';
import { errorText, fieldErrors } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { TextField } from '../../../shared/ui/Field';
import { Banner } from '../../../shared/ui/Feedback';
import { useSession } from '../session';

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth-page" lang="fa" dir="rtl">
      <main className="card auth-card stack">
        <div className="row" style={{ gap: 12 }}>
          <span className="provider__logo" aria-hidden="true">
            ب
          </span>
          <span className="bon-title-medium">پنل مدیریت باجت</span>
        </div>
        <h1 className="bon-headline-small">{title}</h1>
        {children}
      </main>
    </div>
  );
}

function safeNext(next: string | null): string {
  return next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
}

/** FR-080 step 1: phone + password. */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await api<LoginResponse>('/admin/auth/login', { body: { phone: toAsciiDigits(phone), password } });
      navigate(`/admin/login/mfa?next=${encodeURIComponent(safeNext(params.get('next')))}`, { state: { mfaToken: r.mfaToken } });
    } catch (e) {
      setError(errorText(e) === 'لطفاً دوباره وارد شوید.' ? 'شماره یا گذرواژه نادرست است.' : errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthCard title="ورود">
      {params.get('next') && <Banner tone="info">نشست شما به پایان رسید. برای ادامه دوباره وارد شوید.</Banner>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="شماره موبایل" inputMode="tel" autoComplete="username" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <TextField label="گذرواژه" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <Banner tone="error">{error}</Banner>}
        <Button type="submit" block pending={pending}>
          ادامه
        </Button>
      </form>
      <Link to="/admin/reset-password">فراموشی گذرواژه</Link>
    </AuthCard>
  );
}

/** FR-080 step 2: TOTP. */
export function MfaPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { reload } = useSession();
  const mfaToken = (location.state as { mfaToken?: string } | null)?.mfaToken;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!mfaToken) {
    return (
      <AuthCard title="ورود دومرحله‌ای">
        <Banner tone="warning">مرحله ورود منقضی شد.</Banner>
        <Link to="/admin/login">بازگشت به ورود</Link>
      </AuthCard>
    );
  }
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const s = await api<AdminSessionInfo>('/admin/auth/mfa', { body: { mfaToken, totp: toAsciiDigits(code) } });
      setCsrfToken(s.csrfToken);
      await reload();
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'UNAUTHENTICATED' ? 'کد نادرست است یا مرحله ورود منقضی شده است.' : errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthCard title="ورود دومرحله‌ای">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="کد ۶ رقمی برنامه احراز هویت" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        {error && <Banner tone="error">{error}</Banner>}
        <Button type="submit" block pending={pending}>
          ورود
        </Button>
      </form>
    </AuthCard>
  );
}

/** FR-081: accept an invitation (or MFA re-enrolment): password → TOTP enrolment. */
export function InvitePage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [enrol, setEnrol] = useState<AcceptInvitationResponse | null>(null);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const accept = async () => {
    if (password !== password2) {
      setErrors({ password2: 'تکرار گذرواژه یکسان نیست.' });
      return;
    }
    setPending(true);
    setErrors({});
    setError(null);
    try {
      setEnrol(await api<AcceptInvitationResponse>('/admin/auth/invitations/accept', { body: { token, password } }));
    } catch (e) {
      setErrors(fieldErrors(e));
      if (!Object.keys(fieldErrors(e)).length) setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await api('/admin/auth/totp/confirm', { body: { token, totp: toAsciiDigits(code) } });
      navigate('/admin/login', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'UNAUTHENTICATED' ? 'کد نادرست است.' : errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthCard title={params.get('mode') === 'mfa' ? 'راه‌اندازی مجدد ورود دومرحله‌ای' : 'فعال‌سازی حساب'}>
      {!enrol ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void accept();
          }}
        >
          <TextField label="گذرواژه جدید" type="password" autoComplete="new-password" dir="ltr" help="حداقل ۱۲ نویسه" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <TextField label="تکرار گذرواژه" type="password" autoComplete="new-password" dir="ltr" value={password2} onChange={(e) => setPassword2(e.target.value)} error={errors.password2} />
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" block pending={pending}>
            ادامه
          </Button>
        </form>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p>این کلید را در برنامه احراز هویت (مانند Google Authenticator) ثبت کنید:</p>
          <div className="code-box">{enrol.totpSecret}</div>
          <details>
            <summary>نمایش پیوند otpauth</summary>
            <div className="code-box">{enrol.totpProvisioningUri}</div>
          </details>
          <TextField label="کد ۶ رقمی نمایش‌داده‌شده" inputMode="numeric" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" block pending={pending}>
            فعال‌سازی
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

/** FR-081: password reset via SMS link + current TOTP. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const request = async () => {
    setPending(true);
    setError(null);
    try {
      await api('/admin/auth/password-reset/request', { body: { phone: toAsciiDigits(phone) } });
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const confirm = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    try {
      await api('/admin/auth/password-reset/confirm', { body: { token, newPassword: password, totp: toAsciiDigits(code) } });
      navigate('/admin/login', { replace: true });
    } catch (e) {
      setErrors(fieldErrors(e));
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <AuthCard title="بازنشانی گذرواژه">
      {!token ? (
        sent ? (
          <Banner tone="success">اگر این شماره متعلق به یک مدیر فعال باشد، پیوند بازنشانی پیامک می‌شود.</Banner>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void request();
            }}
          >
            <TextField label="شماره موبایل" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {error && <Banner tone="error">{error}</Banner>}
            <Button type="submit" block pending={pending}>
              ارسال پیوند
            </Button>
          </form>
        )
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <TextField label="گذرواژه جدید" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.newPassword} help="حداقل ۱۲ نویسه" />
          <TextField label="کد ورود دومرحله‌ای" dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          {error && <Banner tone="error">{error}</Banner>}
          <Button type="submit" block pending={pending}>
            ذخیره گذرواژه
          </Button>
        </form>
      )}
      <Link to="/admin/login">بازگشت به ورود</Link>
    </AuthCard>
  );
}

/** FR-082: zero permitted sections. */
export function NoAccessPage() {
  const { logout } = useSession();
  return (
    <AuthCard title="دسترسی ندارید">
      <p>به هیچ بخشی دسترسی ندارید — با یک مدیر سیستم تماس بگیرید.</p>
      <Button variant="tonal" onClick={() => void logout()}>
        خروج
      </Button>
    </AuthCard>
  );
}
