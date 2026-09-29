import type { ReactNode } from 'react';
import type { LabelMap } from '../i18n/fa';
import { Button } from './Button';

export function Banner({ tone = 'info', children, role }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className={`banner banner--${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      {children}
    </div>
  );
}

export function StatusBadge({ map, value }: { map: LabelMap; value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  const [label, tone] = map[value] ?? [value, 'gray'];
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

export function Skeleton({ height = 20, width = '100%', radius }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card stack stack--sm" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={28} />
      ))}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 40 }}>
      <p className="bon-body-large muted">{title}</p>
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, text = 'نتوانستیم این اطلاعات را بارگذاری کنیم. لطفاً دوباره تلاش کنید.' }: { onRetry?: () => void; text?: string }) {
  return (
    <div className="card stack" role="alert" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 40 }}>
      <p className="bon-body-large">{text}</p>
      {onRetry && (
        <Button variant="tonal" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}
