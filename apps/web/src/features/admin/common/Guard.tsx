import type { ReactNode } from 'react';
import type { Permission } from '@bajet/contracts';
import { useCan } from '../session';

export function Forbidden() {
  return (
    <div className="card stack" role="alert" style={{ textAlign: 'center', paddingBlock: 48 }}>
      <h1 className="bon-headline-small">دسترسی ندارید</h1>
      <p className="muted">برای مشاهده این بخش مجوز لازم را ندارید.</p>
    </div>
  );
}

/** Routes without permission render a 403 page (UI only hides; the server enforces). */
export function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const can = useCan();
  return can(perm) ? <>{children}</> : <Forbidden />;
}
