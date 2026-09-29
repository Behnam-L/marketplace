import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/client';
import { ErrorState, Skeleton } from '../../../shared/ui/Feedback';
import { BackIcon } from '../../../shared/ui/Icons';

export function PageHeader({ title, back, actions, subtitle }: { title: ReactNode; back?: string; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="row" style={{ gap: 4 }}>
        {back && (
          <Link to={back} className="icon-btn" aria-label="بازگشت">
            <BackIcon />
          </Link>
        )}
        <div className="stack stack--sm" style={{ gap: 2 }}>
          <h1 className="bon-headline-small">{title}</h1>
          {subtitle && <span className="muted bon-body-small">{subtitle}</span>}
        </div>
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card section" aria-label={title}>
      <div className="row row--between">
        <h2 className="bon-title-medium">{title}</h2>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Missing values render as "—" (in-progress orders, §8.3). */
export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="dl">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v === null || v === undefined || v === '' ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="در حال بارگذاری">
      <Skeleton height={32} width="40%" />
      <div className="card stack stack--sm">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={22} />
        ))}
      </div>
    </div>
  );
}

/** Loading / 404 / error states for detail pages. */
export function QueryGate<T>({ q, children }: { q: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <ErrorState text="موردی با این شناسه یافت نشد." />;
    return <ErrorState onRetry={() => void q.refetch()} />;
  }
  return <>{children(q.data as T)}</>;
}

export function SimpleTable<T>({ rows, columns, empty = 'موردی وجود ندارد.' }: { rows: T[]; columns: { label: string; render: (r: T) => ReactNode; numeric?: boolean }[]; empty?: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.label} className={c.numeric ? 'num' : undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Ltr({ children }: { children: ReactNode }) {
  return <bdi className="ltr">{children}</bdi>;
}
