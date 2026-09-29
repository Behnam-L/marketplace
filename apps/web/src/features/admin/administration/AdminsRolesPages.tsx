import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ADMIN_STATUSES, type AdminListItem, type CreateAdminRequest, type CreateAdminResponse, type Permission, type PermissionDto, type RoleDto } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { jDateTime, num } from '../../../shared/format/format';
import { ADMIN_STATUS_FA, PERMISSION_FA, ROLE_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/Dialog';
import { Checkbox, SelectField, TextArea, TextField } from '../../../shared/ui/Field';
import { Banner, StatusBadge } from '../../../shared/ui/Feedback';
import { useToast } from '../../../shared/ui/Toast';
import { useApiQuery, useUnsavedGuard } from '../common/api-hooks';
import { DL, Ltr, PageHeader, QueryGate, Section, SimpleTable } from '../common/Detail';
import { FormError, FormGrid, useSubmit } from '../common/FormBits';
import { ResourceList } from '../common/ResourceList';
import { useSession } from '../session';

const roleName = (name: string) => ROLE_FA[name] ?? name;

/* ───────────── Admins (FR-080) ───────────── */

export function AdminsListPage() {
  const roles = useApiQuery<RoleDto[]>('/admin/roles');
  return (
    <ResourceList<AdminListItem>
      title="کاربران ادمین"
      path="/admin/admins"
      itemsName="کاربر"
      rowHref={(a) => `/admin/admins/${a.id}`}
      primaryAction={{ label: 'دعوت کاربر', to: '/admin/admins/new', perm: 'admins.manage' }}
      filters={[
        { name: 'phone', label: 'شماره موبایل', type: 'text', dir: 'ltr' },
        { name: 'status', label: 'وضعیت', type: 'select', options: ADMIN_STATUSES.map((s) => ({ value: s, label: ADMIN_STATUS_FA[s][0] })) },
        { name: 'roleId', label: 'نقش', type: 'select', options: (roles.data ?? []).map((r) => ({ value: r.id, label: roleName(r.name) })) },
      ]}
      columns={[
        { key: 'name', label: 'نام', render: (a) => `${a.firstName} ${a.lastName}` },
        { key: 'phone', label: 'موبایل', render: (a) => <Ltr>{a.phone}</Ltr> },
        { key: 'role', label: 'نقش', render: (a) => roleName(a.roleName) },
        { key: 'status', label: 'وضعیت', render: (a) => <StatusBadge map={ADMIN_STATUS_FA} value={a.status} /> },
        { key: 'login', label: 'آخرین ورود', render: (a) => jDateTime(a.lastLoginAt) },
      ]}
    />
  );
}

export function AdminNewPage() {
  const navigate = useNavigate();
  const roles = useApiQuery<RoleDto[]>('/admin/roles');
  const [v, setV] = useState<CreateAdminRequest>({ firstName: '', lastName: '', phone: '', roleId: '' });
  const { pending, errors, error, run } = useSubmit();
  const toast = useToast();
  useUnsavedGuard(v.firstName !== '' || v.phone !== '');
  const submit = async () => {
    const r = await run(() => api<CreateAdminResponse>('/admin/admins', { body: { ...v, firstName: v.firstName.trim(), lastName: v.lastName.trim(), phone: v.phone.trim() } }));
    if (r) {
      toast(r.invitationDelivered ? 'دعوت‌نامه پیامکی ارسال شد.' : 'کاربر ایجاد شد، اما ارسال پیامک دعوت ناموفق بود. از صفحه کاربر دوباره ارسال کنید.');
      navigate(`/admin/admins/${r.id}`);
    }
  };
  return (
    <div className="stack">
      <PageHeader back="/admin/admins" title="دعوت کاربر ادمین" />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormGrid>
          <TextField label="نام" value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} error={errors.firstName} required />
          <TextField label="نام خانوادگی" value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} error={errors.lastName} required />
          <TextField label="شماره موبایل" dir="ltr" inputMode="tel" placeholder="09xxxxxxxxx" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} error={errors.phone} required />
          <SelectField
            label="نقش"
            placeholder="انتخاب کنید"
            value={v.roleId}
            options={(roles.data ?? []).map((r) => ({ value: r.id, label: roleName(r.name) }))}
            onChange={(e) => setV({ ...v, roleId: e.target.value })}
            error={errors.roleId}
            required
          />
        </FormGrid>
        <p className="muted bon-body-small">لینک دعوت یک‌بار مصرف و ۲۴ ساعته با پیامک برای کاربر ارسال می‌شود.</p>
        <FormError error={error} />
        <div className="row">
          <Button type="submit" pending={pending}>
            ارسال دعوت
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AdminDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<AdminListItem>(`/admin/admins/${id}`);
  const roles = useApiQuery<RoleDto[]>('/admin/roles');
  const { me } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ kind: 'role'; roleId: string } | { kind: 'status'; status: 'Active' | 'Inactive' } | { kind: 'mfa' } | null>(null);
  const [pickRole, setPickRole] = useState('');
  const { pending, error, run } = useSubmit();
  const isSelf = me?.admin.id === id;

  const done = (msg: string) => {
    toast(msg);
    setDialog(null);
    void qc.invalidateQueries();
  };
  const confirm = async () => {
    if (!dialog) return;
    if (dialog.kind === 'mfa') {
      const r = await run(() => api<{ delivered: boolean }>(`/admin/admins/${id}/reset-mfa`, { method: 'POST' }));
      if (r) done(r.delivered ? 'تأیید دومرحله‌ای بازنشانی و پیامک راه‌اندازی مجدد ارسال شد.' : 'بازنشانی انجام شد، اما ارسال پیامک ناموفق بود.');
      return;
    }
    const body = dialog.kind === 'role' ? { roleId: dialog.roleId } : { status: dialog.status };
    const r = await run(() => api<AdminListItem>(`/admin/admins/${id}`, { method: 'PATCH', body }));
    if (r) done('تغییرات ذخیره شد.');
  };
  const resend = async () => {
    const r = await run(() => api<{ delivered: boolean }>(`/admin/admins/${id}/resend-invitation`, { method: 'POST' }));
    if (r) toast(r.delivered ? 'دعوت‌نامه دوباره ارسال شد.' : 'ارسال پیامک دعوت ناموفق بود.');
  };

  return (
    <QueryGate q={q}>
      {(a) => (
        <div className="stack">
          <PageHeader
            back="/admin/admins"
            title={`${a.firstName} ${a.lastName}`}
            subtitle={<Ltr>{a.phone}</Ltr>}
            actions={
              <>
                {a.status === 'Invited' && (
                  <Button size="sm" variant="tonal" onClick={() => void resend()}>
                    ارسال مجدد دعوت
                  </Button>
                )}
                {a.status === 'Active' && me?.admin.roleName === 'SuperAdmin' && !isSelf && (
                  <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'mfa' })}>
                    بازنشانی تأیید دومرحله‌ای
                  </Button>
                )}
                {!isSelf && a.status === 'Active' && (
                  <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'status', status: 'Inactive' })}>
                    غیرفعال‌سازی
                  </Button>
                )}
                {!isSelf && a.status === 'Inactive' && (
                  <Button size="sm" variant="tonal" onClick={() => setDialog({ kind: 'status', status: 'Active' })}>
                    فعال‌سازی
                  </Button>
                )}
              </>
            }
          />
          {!dialog && <FormError error={error} />}
          <Section title="اطلاعات">
            <DL
              items={[
                ['وضعیت', <StatusBadge key="s" map={ADMIN_STATUS_FA} value={a.status} />],
                ['نقش', roleName(a.roleName)],
                ['آخرین ورود', jDateTime(a.lastLoginAt)],
                ['قفل تا', jDateTime(a.lockedUntil)],
                ['ایجاد', jDateTime(a.createdAt)],
              ]}
            />
          </Section>
          {!isSelf && (
            <Section title="تغییر نقش">
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <SelectField
                  label="نقش جدید"
                  placeholder="انتخاب کنید"
                  value={pickRole}
                  options={(roles.data ?? []).filter((r) => r.id !== a.roleId).map((r) => ({ value: r.id, label: roleName(r.name) }))}
                  onChange={(e) => setPickRole(e.target.value)}
                />
                <Button variant="outline" disabled={!pickRole} onClick={() => setDialog({ kind: 'role', roleId: pickRole })}>
                  اعمال
                </Button>
              </div>
            </Section>
          )}
          {dialog && (
            <ConfirmDialog
              title={dialog.kind === 'mfa' ? 'بازنشانی تأیید دومرحله‌ای؟' : dialog.kind === 'role' ? 'تغییر نقش کاربر؟' : dialog.status === 'Inactive' ? 'غیرفعال‌سازی کاربر؟' : 'فعال‌سازی کاربر؟'}
              danger={dialog.kind !== 'status' || dialog.status === 'Inactive'}
              pending={pending}
              onClose={() => setDialog(null)}
              onConfirm={() => void confirm()}
            >
              <div className="stack">
                {dialog.kind === 'role' && (
                  <p>
                    نقش از «{roleName(a.roleName)}» به «{roleName(roles.data?.find((r) => r.id === dialog.roleId)?.name ?? '')}» تغییر می‌کند. نشست‌های فعلی کاربر بسته می‌شود.
                  </p>
                )}
                {dialog.kind === 'status' && dialog.status === 'Inactive' && <p>کاربر از همه نشست‌ها خارج می‌شود و دیگر نمی‌تواند وارد شود.</p>}
                {dialog.kind === 'status' && dialog.status === 'Active' && <p>کاربر دوباره می‌تواند وارد پنل شود.</p>}
                {dialog.kind === 'mfa' && <p>نشست‌های کاربر بسته می‌شود و در ورود بعدی باید تأیید دومرحله‌ای را دوباره راه‌اندازی کند.</p>}
                <FormError error={error} />
              </div>
            </ConfirmDialog>
          )}
        </div>
      )}
    </QueryGate>
  );
}

/* ───────────── Roles (FR-081) ───────────── */

export function RolesListPage() {
  const q = useApiQuery<RoleDto[]>('/admin/roles');
  return (
    <div className="stack">
      <PageHeader
        title="نقش‌ها و دسترسی‌ها"
        actions={
          <Link className="btn btn--filled btn--sm" to="/admin/roles/new">
            نقش جدید
          </Link>
        }
      />
      <QueryGate q={q}>
        {(roles) => (
          <div className="card">
            <SimpleTable
              rows={roles}
              columns={[
                { label: 'نام', render: (r) => <Link to={`/admin/roles/${r.id}`}>{roleName(r.name)}</Link> },
                { label: 'توضیح', render: (r) => r.description },
                { label: 'تعداد مجوز', render: (r) => num(r.permissionCodes.length), numeric: true },
                { label: 'کاربران', render: (r) => num(r.adminCount), numeric: true },
              ]}
            />
          </div>
        )}
      </QueryGate>
    </div>
  );
}

export function RoleNewPage() {
  const navigate = useNavigate();
  const [v, setV] = useState({ name: '', description: '' });
  const { pending, errors, error, run } = useSubmit();
  const submit = async () => {
    const r = await run(() => api<RoleDto>('/admin/roles', { body: v }));
    if (r) navigate(`/admin/roles/${r.id}`);
  };
  return (
    <div className="stack">
      <PageHeader back="/admin/roles" title="نقش جدید" />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="نام" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} required />
        <TextArea label="توضیح" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} error={errors.description} />
        <FormError error={error} />
        <div className="row">
          <Button type="submit" pending={pending}>
            ایجاد نقش
          </Button>
        </div>
      </form>
    </div>
  );
}

export function RoleDetailPage() {
  const { id = '' } = useParams();
  const q = useApiQuery<RoleDto>(`/admin/roles/${id}`);
  return <QueryGate q={q}>{(role) => <RoleEditor key={`${role.id}:${role.permissionCodes.join(',')}:${role.name}`} role={role} />}</QueryGate>;
}

function RoleEditor({ role }: { role: RoleDto }) {
  const perms = useApiQuery<PermissionDto[]>('/admin/permissions');
  const qc = useQueryClient();
  const toast = useToast();
  const { reload } = useSession();
  const [info, setInfo] = useState({ name: role.name, description: role.description });
  const [selected, setSelected] = useState<Set<Permission>>(new Set(role.permissionCodes));
  const [confirm, setConfirm] = useState(false);
  const infoForm = useSubmit();
  const permForm = useSubmit();
  const dirty = selected.size !== role.permissionCodes.length || role.permissionCodes.some((p) => !selected.has(p));
  useUnsavedGuard(dirty);
  const saveInfo = async () => {
    const r = await infoForm.run(() => api<RoleDto>(`/admin/roles/${role.id}`, { method: 'PATCH', body: info }));
    if (r) {
      toast('ذخیره شد.');
      void qc.invalidateQueries();
    }
  };
  const savePerms = async () => {
    const r = await permForm.run(() => api<RoleDto>(`/admin/roles/${role.id}/permissions`, { method: 'PUT', body: { permissionCodes: [...selected] } }));
    setConfirm(false);
    if (r) {
      toast('دسترسی‌ها ذخیره شد.');
      void qc.invalidateQueries();
      void reload();
    }
  };
  const added = [...selected].filter((p) => !role.permissionCodes.includes(p));
  const removed = role.permissionCodes.filter((p) => !selected.has(p));
  return (
    <div className="stack">
      <PageHeader back="/admin/roles" title={roleName(role.name)} subtitle={`${num(role.adminCount)} کاربر`} />
      {role.isSystem && <Banner>نقش مدیر ارشد همیشه همه دسترسی‌ها را دارد و قابل تغییر نیست.</Banner>}
      {!role.isSystem && (
        <Section title="مشخصات">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveInfo();
            }}
          >
            <FormGrid>
              <TextField label="نام" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} error={infoForm.errors.name} required />
              <TextField label="توضیح" value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} error={infoForm.errors.description} />
            </FormGrid>
            <FormError error={infoForm.error} />
            <div className="row">
              <Button type="submit" variant="outline" pending={infoForm.pending}>
                ذخیره مشخصات
              </Button>
            </div>
          </form>
        </Section>
      )}
      <Section title="دسترسی‌ها">
        <div className="grid-2">
          {(perms.data ?? []).map((p) => (
            <Checkbox
              key={p.code}
              label={
                <>
                  {PERMISSION_FA[p.code] ?? p.description} <Ltr>{p.code}</Ltr>
                </>
              }
              checked={selected.has(p.code)}
              disabled={role.isSystem}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(p.code);
                else next.delete(p.code);
                setSelected(next);
              }}
            />
          ))}
        </div>
        <FormError error={permForm.error} />
        {!role.isSystem && (
          <div className="row">
            <Button disabled={!dirty} onClick={() => setConfirm(true)}>
              ذخیره دسترسی‌ها
            </Button>
          </div>
        )}
      </Section>
      {confirm && (
        <ConfirmDialog title="تغییر دسترسی‌های نقش؟" pending={permForm.pending} onClose={() => setConfirm(false)} onConfirm={() => void savePerms()}>
          <div className="stack">
            <p>این تغییر بلافاصله برای {num(role.adminCount)} کاربر این نقش اعمال می‌شود.</p>
            {added.length > 0 && <p>افزوده: {added.map((p) => PERMISSION_FA[p] ?? p).join('، ')}</p>}
            {removed.length > 0 && <p>حذف: {removed.map((p) => PERMISSION_FA[p] ?? p).join('، ')}</p>}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
