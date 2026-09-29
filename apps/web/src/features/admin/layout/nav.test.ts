import { describe, expect, it } from 'vitest';
import type { Permission } from '@bajet/contracts';
import { NAV, firstPermitted } from './nav';

describe('admin navigation (FR-082)', () => {
  const canOnly = (...perms: Permission[]) => (p: Permission) => perms.includes(p);

  it('lands on the first section the role may see', () => {
    expect(firstPermitted(canOnly('orders.read'))).toBe('/admin/orders');
    expect(firstPermitted(canOnly('settings.read', 'audit.read'))).toBe('/admin/settings');
  });

  it('returns null when nothing is permitted (→ /no-access)', () => {
    expect(firstPermitted(canOnly())).toBeNull();
  });

  it('has unique routes', () => {
    const routes = NAV.flatMap((g) => g.items.map((i) => i.to));
    expect(new Set(routes).size).toBe(routes.length);
  });
});
