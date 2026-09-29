import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../../shared/api/client';
import { ROLE_FA } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { MenuIcon } from '../../../shared/ui/Icons';
import { useSecondsLeft } from '../../../shared/ui/Countdown';
import { mmss } from '../../../shared/format/format';
import { useSession } from '../session';
import { NAV } from './nav';

/** Warns 2 minutes before the 30-minute idle timeout (FR-080, §8.3: at 28 min). */
function IdleWarning() {
  const { me, reload, logout } = useSession();
  const left = useSecondsLeft(me?.session.idleExpiresAt);
  if (left === null || left > 120) return null;
  if (left === 0) {
    void logout();
    return null;
  }
  return (
    <Dialog
      title="نشست شما رو به پایان است"
      onClose={() => void reload()}
      actions={
        <>
          <Button variant="text" onClick={() => void logout()}>
            خروج
          </Button>
          <Button onClick={() => void api('/admin/me').then(() => reload())}>ادامه کار</Button>
        </>
      }
    >
      به‌دلیل عدم فعالیت، تا {mmss(left)} دیگر از حساب خارج می‌شوید. تغییرات ذخیره‌نشده از بین می‌روند.
    </Dialog>
  );
}

export function AdminLayout() {
  const { me, can, logout } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <div className="admin" lang="fa" dir="rtl">
      <nav className={`admin__nav ${open ? 'admin__nav--open' : ''}`} aria-label="منوی اصلی">
        <div className="row" style={{ padding: '8px 12px 16px' }}>
          <span className="provider__logo" aria-hidden="true">
            ب
          </span>
          <span className="bon-title-medium">باجت</span>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group} className="stack stack--sm" style={{ gap: 2 }}>
              <div className="nav-group">{g.group}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} className="nav-link">
                  {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      {open && <div className="dialog-backdrop" style={{ zIndex: 30 }} onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="admin__main">
        <header className="appbar">
          <button className="icon-btn admin__menu-btn" aria-label="باز کردن منو" aria-expanded={open} onClick={() => setOpen(true)}>
            <MenuIcon />
          </button>
          <div style={{ flex: 1 }} />
          <span className="bon-body-medium muted">
            {me?.admin.firstName} {me?.admin.lastName} · {ROLE_FA[me?.admin.roleName ?? ''] ?? me?.admin.roleName}
          </span>
          <Button variant="text" size="sm" onClick={() => void logout()}>
            خروج
          </Button>
        </header>
        <main className="admin__content" id="main">
          <Outlet />
        </main>
      </div>
      <IdleWarning />
    </div>
  );
}
