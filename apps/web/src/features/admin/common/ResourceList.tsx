import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ExportResource, Page, Permission } from '@bajet/contracts';
import { api } from '../../../shared/api/client';
import { num } from '../../../shared/format/format';
import { errorText } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { SelectField, TextField } from '../../../shared/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '../../../shared/ui/Feedback';
import { JalaliDateInput, currentJalaliYear } from '../../../shared/ui/JalaliDateInput';
import { useToast } from '../../../shared/ui/Toast';
import { useCan } from '../session';
import { useApiQuery } from './api-hooks';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export type FilterDef =
  | { name: string; label: string; type: 'text' | 'number'; placeholder?: string; dir?: 'ltr' }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { name: string; label: string; type: 'dateFrom' | 'dateTo' };

/** Tehran calendar date → UTC instant at local midnight (dateTo = next midnight). */
function dayBoundary(iso: string, next: boolean): string {
  const d = new Date(`${iso}T00:00:00+03:30`);
  if (next) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function ResourceList<T extends { id: string }>({
  title,
  path,
  columns,
  filters = [],
  fixedQuery,
  rowHref,
  itemsName,
  primaryAction,
  exportResource,
  headerExtra,
}: {
  title: string;
  path: string;
  columns: Column<T>[];
  filters?: FilterDef[];
  fixedQuery?: Record<string, string>;
  rowHref?: (row: T) => string;
  itemsName: string;
  primaryAction?: { label: string; to: string; perm: Permission };
  exportResource?: ExportResource;
  headerExtra?: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(filters.map((f) => [f.name, params.get(f.name) ?? ''])));
  const active = useMemo(() => Object.fromEntries(filters.map((f) => [f.name, params.get(f.name) ?? '']).filter(([, v]) => v !== '')), [filters, params]);
  const query = useMemo(() => {
    const q: Record<string, string> = { ...fixedQuery };
    for (const f of filters) {
      const v = active[f.name];
      if (!v) continue;
      if (f.type === 'dateFrom') q.from = dayBoundary(v, false);
      else if (f.type === 'dateTo') q.to = dayBoundary(v, true);
      else q[f.name] = v;
    }
    const cursor = params.get('cursor');
    if (cursor) q.cursor = cursor;
    return q;
  }, [active, filters, fixedQuery, params]);
  const list = useApiQuery<Page<T>>(path, query);
  const filtered = Object.keys(active).length > 0;

  const apply = () => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(draft)) if (v) next.set(k, v);
    setCursorStack([]);
    setParams(next);
  };
  const clear = () => {
    setDraft(Object.fromEntries(filters.map((f) => [f.name, ''])));
    setCursorStack([]);
    setParams(new URLSearchParams());
  };
  const go = (cursor: string | null, back = false) => {
    const next = new URLSearchParams(params);
    if (cursor) next.set('cursor', cursor);
    else next.delete('cursor');
    if (back) setCursorStack((s) => s.slice(0, -1));
    else setCursorStack((s) => [...s, params.get('cursor') ?? '']);
    setParams(next);
  };
  const exportList = async () => {
    try {
      const filtersForExport: Record<string, string> = { ...query };
      delete filtersForExport.cursor;
      await api('/admin/exports', { body: { resource: exportResource, filters: filtersForExport } });
      toast('خروجی در صف ساخت قرار گرفت.', { label: 'مشاهده خروجی‌ها', onClick: () => navigate('/admin/exports') });
    } catch (e) {
      toast(errorText(e));
    }
  };

  const total = list.data?.total;
  return (
    <section className="stack">
      <div className="page-head">
        <div className="stack stack--sm" style={{ gap: 2 }}>
          <h1 className="bon-headline-small">{title}</h1>
          {total !== undefined && (
            <span className="muted bon-body-small">
              {list.data?.capped ? '۱۰٬۰۰۰+' : num(total)} {itemsName}
            </span>
          )}
        </div>
        <div className="row">
          {headerExtra}
          {exportResource && can('exports.create') && (
            <Button variant="outline" size="sm" onClick={() => void exportList()}>
              خروجی CSV
            </Button>
          )}
          {primaryAction && can(primaryAction.perm) && (
            <Link className="btn btn--filled btn--sm" to={primaryAction.to}>
              {primaryAction.label}
            </Link>
          )}
        </div>
      </div>
      {filters.length > 0 && (
        <form
          className="card filters"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          aria-label="فیلترها"
        >
          {filters.map((f) =>
            f.type === 'select' ? (
              <SelectField key={f.name} label={f.label} value={draft[f.name] ?? ''} placeholder="همه" options={f.options} onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })} />
            ) : f.type === 'text' || f.type === 'number' ? (
              <TextField key={f.name} label={f.label} value={draft[f.name] ?? ''} dir={f.dir} inputMode={f.type === 'number' ? 'numeric' : undefined} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })} />
            ) : (
              <JalaliDateInput key={f.name} label={f.label} value={draft[f.name] || null} minYear={1400} maxYear={currentJalaliYear() + 1} onChange={(v) => setDraft({ ...draft, [f.name]: v ?? '' })} />
            ),
          )}
          <div className="row">
            <Button type="submit" size="sm">
              اعمال فیلتر
            </Button>
            {filtered && (
              <Button variant="text" size="sm" onClick={clear}>
                پاک کردن
              </Button>
            )}
          </div>
        </form>
      )}
      {list.isLoading ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : !list.data?.items.length ? (
        filtered ? (
          <EmptyState
            title={`هیچ ${itemsName}ی با این فیلترها یافت نشد.`}
            action={
              <Button variant="tonal" onClick={clear}>
                پاک کردن فیلترها
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={`هنوز ${itemsName}ی وجود ندارد.`}
            action={
              primaryAction && can(primaryAction.perm) ? (
                <Link className="btn btn--filled" to={primaryAction.to}>
                  {primaryAction.label}
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} scope="col">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((row) => {
                  const href = rowHref?.(row);
                  return (
                    <tr key={row.id} data-href={href} onClick={href ? () => navigate(href) : undefined}>
                      {columns.map((c, i) => (
                        <td key={c.key} className={c.numeric ? 'num' : undefined}>
                          {i === 0 && href ? (
                            <Link to={href} onClick={(e) => e.stopPropagation()}>
                              {c.render(row)}
                            </Link>
                          ) : (
                            c.render(row)
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row row--between">
            <Button variant="text" size="sm" disabled={cursorStack.length === 0} onClick={() => go(cursorStack[cursorStack.length - 1] || null, true)}>
              صفحه قبل
            </Button>
            <Button variant="text" size="sm" disabled={!list.data.nextCursor} onClick={() => go(list.data!.nextCursor)}>
              صفحه بعد
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
