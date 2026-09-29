import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission } from '@bajet/contracts';
import { Spinner } from '../../shared/ui/Feedback';
import { AdminsListPage, AdminNewPage, AdminDetailPage, RolesListPage, RoleNewPage, RoleDetailPage } from './administration/AdminsRolesPages';
import { AuditLogPage, ExportsPage, MessageLogsPage, TemplateDetailPage, TemplateNewPage, TemplatesListPage } from './administration/MessagesAuditPages';
import { SettingsPage } from './administration/SettingsPage';
import { InvitePage, LoginPage, MfaPage, NoAccessPage, ResetPasswordPage } from './auth/AuthPages';
import { Guard } from './common/Guard';
import { ConsumerDetailPage, ConsumersListPage } from './customers/ConsumersPages';
import { DocumentDetailPage, DocumentNewPage, DocumentsListPage } from './finance/DocumentsPages';
import { InvoiceDetailPage, InvoicesListPage, PlanDetailPage, PlanNewPage, PlansListPage } from './finance/InvoicesPlansPages';
import { AdminLayout } from './layout/AdminLayout';
import { firstPermitted } from './layout/nav';
import {
  BankTransactionDetailPage,
  BankTransactionsPage,
  ProviderTransactionsPage,
  ReconciliationDetailPage,
  ReconciliationListPage,
  RefundDetailPage,
  RefundsListPage,
} from './operations/OperationsPages';
import { OrderDetailPage, OrdersListPage } from './operations/OrdersPages';
import { MerchantDetailPage, MerchantNewPage, MerchantsListPage } from './partners/MerchantsPages';
import { ProviderDetailPage, ProvidersListPage, ProviderNewPage } from './partners/ProvidersPages';
import { SessionProvider, useCan, useSession } from './session';

function Loading() {
  return (
    <div style={{ padding: 32 }}>
      <Spinner label="در حال بارگذاری…" />
    </div>
  );
}

/** Signed-in area: unauthenticated visitors go to login with a return path. */
function RequireSession({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!me) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

function Home() {
  const can = useCan();
  return <Navigate to={firstPermitted(can) ?? '/admin/no-access'} replace />;
}

const g = (perm: Permission, el: ReactNode) => <Guard perm={perm}>{el}</Guard>;

/** Admin panel (PRD §8.3, WF-23): routes mirror the permission-filtered menu. */
export default function AdminApp() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="login/mfa" element={<MfaPage />} />
        <Route path="invite/:token" element={<InvitePage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route
          path="no-access"
          element={
            <RequireSession>
              <NoAccessPage />
            </RequireSession>
          }
        />
        <Route
          element={
            <RequireSession>
              <AdminLayout />
            </RequireSession>
          }
        >
          <Route index element={<Home />} />

          <Route path="orders" element={g('orders.read', <OrdersListPage />)} />
          <Route path="orders/:id" element={g('orders.read', <OrderDetailPage />)} />
          <Route path="refunds" element={g('orders.read', <RefundsListPage />)} />
          <Route path="refunds/:id" element={g('orders.read', <RefundDetailPage />)} />
          <Route path="bank-transactions" element={g('transactions.read', <BankTransactionsPage />)} />
          <Route path="bank-transactions/:id" element={g('transactions.read', <BankTransactionDetailPage />)} />
          <Route path="provider-transactions" element={g('transactions.read', <ProviderTransactionsPage />)} />
          <Route path="reconciliation" element={g('reconciliation.read', <ReconciliationListPage />)} />
          <Route path="reconciliation/:id" element={g('reconciliation.read', <ReconciliationDetailPage />)} />

          <Route path="providers" element={g('providers.read', <ProvidersListPage />)} />
          <Route path="providers/new" element={g('providers.manage', <ProviderNewPage />)} />
          <Route path="providers/:id" element={g('providers.read', <ProviderDetailPage />)} />
          <Route path="merchants" element={g('merchants.read', <MerchantsListPage />)} />
          <Route path="merchants/new" element={g('merchants.manage', <MerchantNewPage />)} />
          <Route path="merchants/:id" element={g('merchants.read', <MerchantDetailPage />)} />

          <Route path="consumers" element={g('consumers.read', <ConsumersListPage />)} />
          <Route path="consumers/:id" element={g('consumers.read', <ConsumerDetailPage />)} />

          <Route path="documents/payable" element={g('documents.read', <DocumentsListPage direction="Payable" />)} />
          <Route path="documents/receivable" element={g('documents.read', <DocumentsListPage direction="Receivable" />)} />
          <Route path="documents/new" element={g('documents.manual', <DocumentNewPage />)} />
          <Route path="documents/:id" element={g('documents.read', <DocumentDetailPage />)} />
          <Route path="invoices/payable" element={g('invoices.read', <InvoicesListPage direction="Payable" />)} />
          <Route path="invoices/receivable" element={g('invoices.read', <InvoicesListPage direction="Receivable" />)} />
          <Route path="invoices/:id" element={g('invoices.read', <InvoiceDetailPage />)} />
          <Route path="settlement-plans/provider" element={g('plans.read', <PlansListPage kind="provider" />)} />
          <Route path="settlement-plans/merchant" element={g('plans.read', <PlansListPage kind="merchant" />)} />
          <Route path="settlement-plans/provider/new" element={g('plans.manage', <PlanNewPage kind="provider" />)} />
          <Route path="settlement-plans/merchant/new" element={g('plans.manage', <PlanNewPage kind="merchant" />)} />
          <Route path="settlement-plans/provider/:id" element={g('plans.read', <PlanDetailPage kind="provider" />)} />
          <Route path="settlement-plans/merchant/:id" element={g('plans.read', <PlanDetailPage kind="merchant" />)} />

          <Route path="admins" element={g('admins.manage', <AdminsListPage />)} />
          <Route path="admins/new" element={g('admins.manage', <AdminNewPage />)} />
          <Route path="admins/:id" element={g('admins.manage', <AdminDetailPage />)} />
          <Route path="roles" element={g('roles.manage', <RolesListPage />)} />
          <Route path="roles/new" element={g('roles.manage', <RoleNewPage />)} />
          <Route path="roles/:id" element={g('roles.manage', <RoleDetailPage />)} />
          <Route path="settings" element={g('settings.read', <SettingsPage />)} />
          <Route path="messages/templates" element={g('messages.read', <TemplatesListPage />)} />
          <Route path="messages/templates/new" element={g('messages.manage', <TemplateNewPage />)} />
          <Route path="messages/templates/:id" element={g('messages.read', <TemplateDetailPage />)} />
          <Route path="messages/logs" element={g('messages.read', <MessageLogsPage />)} />
          <Route path="audit-log" element={g('audit.read', <AuditLogPage />)} />
          <Route path="exports" element={g('exports.create', <ExportsPage />)} />

          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
