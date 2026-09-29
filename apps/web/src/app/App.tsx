import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../shared/ui/Toast';
import { Spinner } from '../shared/ui/Feedback';
import { CheckoutApp, CheckoutMessage } from '../features/checkout/CheckoutApp';
import { TermsPage } from '../features/consumer/entry/LandingScreen';

const AdminApp = lazy(() => import('../features/admin/AdminApp'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/c/terms" element={<TermsPage />} />
            <Route path="/c/error" element={<CheckoutMessage title="درخواست نامعتبر" text="این درخواست پرداخت نامعتبر است. لطفاً به فروشگاه برگردید و دوباره تلاش کنید." />} />
            <Route path="/c/:token/*" element={<CheckoutApp />} />
            <Route
              path="/admin/*"
              element={
                <Suspense fallback={<div style={{ padding: 32 }}><Spinner label="در حال بارگذاری…" /></div>}>
                  <AdminApp />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
