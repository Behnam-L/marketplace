/** Fixed permission catalog and default role matrix (PRD §9.2). */
export const PERMISSIONS = [
  'providers.read',
  'providers.manage',
  'merchants.read',
  'merchants.manage',
  'merchants.credentials',
  'consumers.read',
  'consumers.pii',
  'consumers.block',
  'orders.read',
  'transactions.read',
  'refunds.create',
  'documents.read',
  'documents.manual',
  'documents.approve',
  'invoices.read',
  'invoices.settle',
  'plans.read',
  'plans.manage',
  'settings.read',
  'settings.manage',
  'reconciliation.read',
  'reconciliation.resolve',
  'messages.read',
  'messages.manage',
  'admins.manage',
  'roles.manage',
  'audit.read',
  'exports.create',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'providers.read': 'View credit providers',
  'providers.manage': 'Create and edit credit providers',
  'merchants.read': 'View merchants',
  'merchants.manage': 'Create and edit merchants; redeliver webhooks',
  'merchants.credentials': 'Generate and revoke merchant API keys',
  'consumers.read': 'View consumers',
  'consumers.pii': 'View unmasked national ID, date of birth and phone',
  'consumers.block': 'Block and unblock consumers',
  'orders.read': 'View orders and refunds',
  'transactions.read': 'View bank and provider transactions',
  'refunds.create': 'Create refunds and enter refund payee IBAN',
  'documents.read': 'View settlement documents',
  'documents.manual': 'Create and cancel manual documents',
  'documents.approve': 'Approve or reject manual documents',
  'invoices.read': 'View invoices',
  'invoices.settle': 'Mark invoices sent and record payments',
  'plans.read': 'View settlement plans',
  'plans.manage': 'Create, edit and archive settlement plans',
  'settings.read': 'View system settings',
  'settings.manage': 'Change system settings',
  'reconciliation.read': 'View reconciliation items',
  'reconciliation.resolve': 'Assign, resolve and re-drive reconciliation items; import PSP reports',
  'messages.read': 'View message logs and templates',
  'messages.manage': 'Manage message templates',
  'admins.manage': 'Manage admin users',
  'roles.manage': 'Manage roles and permissions',
  'audit.read': 'View the audit log',
  'exports.create': 'Export lists as CSV',
};

/** Permissions that require a fresh (≤ 5 min) TOTP step-up (§9.1). */
export const STEP_UP_PERMISSIONS: readonly Permission[] = [
  'settings.manage',
  'roles.manage',
  'admins.manage',
  'merchants.credentials',
  'invoices.settle',
];

export const DEFAULT_ROLES = ['SuperAdmin', 'Operations', 'Finance', 'Support', 'Viewer'] as const;
export type DefaultRole = (typeof DEFAULT_ROLES)[number];
export const SUPER_ADMIN_ROLE = 'SuperAdmin';

export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRole, readonly Permission[]> = {
  SuperAdmin: PERMISSIONS,
  Operations: [
    'providers.read', 'merchants.read', 'providers.manage', 'merchants.manage', 'merchants.credentials',
    'consumers.read', 'consumers.pii', 'consumers.block', 'orders.read', 'transactions.read', 'refunds.create',
    'documents.read', 'invoices.read', 'plans.read', 'settings.read', 'reconciliation.read',
    'reconciliation.resolve', 'messages.read', 'messages.manage', 'exports.create',
  ],
  Finance: [
    'providers.read', 'merchants.read', 'consumers.read', 'orders.read', 'transactions.read', 'refunds.create',
    'documents.read', 'invoices.read', 'plans.read', 'documents.manual', 'documents.approve', 'invoices.settle',
    'plans.manage', 'settings.read', 'reconciliation.read', 'reconciliation.resolve', 'audit.read', 'exports.create',
  ],
  Support: [
    'providers.read', 'merchants.read', 'consumers.read', 'consumers.pii', 'orders.read', 'transactions.read',
    'reconciliation.read', 'messages.read',
  ],
  Viewer: [
    'providers.read', 'merchants.read', 'consumers.read', 'orders.read', 'transactions.read', 'documents.read',
    'invoices.read', 'plans.read', 'settings.read', 'messages.read',
  ],
};
