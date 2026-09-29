import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CreditProviderOption, CreditResponse, QuoteResponse } from '@bajet/contracts';
import { ApiError } from '../../../shared/api/client';
import { bpsToPercent, toman } from '../../../shared/format/format';
import { errorText } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { Checkbox } from '../../../shared/ui/Field';
import { Banner, Skeleton } from '../../../shared/ui/Feedback';
import { goToGateway, useIdempotencyKey, usePolling } from '../checkout-api';
import { useCheckout } from '../CheckoutContext';
import { CheckoutLayout } from '../CheckoutLayout';
import { CancelButton } from '../payment/CancelButton';

function Logo({ p }: { p: CreditProviderOption }) {
  return <span className="provider__logo">{p.iconUrl ? <img src={p.iconUrl} alt="" /> : p.displayName.slice(0, 1)}</span>;
}

/** FR-030–033: provider credit, selection, live server breakdown, cash-only, confirm. */
export function CreditScreen() {
  const { client, order, setOrder, refresh, handleError } = useCheckout();
  const [credit, setCredit] = useState<CreditResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [cashOnly, setCashOnly] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [ik, resetIk] = useIdempotencyKey();
  const inProgress = order.status === 'CreditInquiryInProgress' || credit?.inquiryStatus === 'InProgress';

  const loadCredit = useCallback(async () => {
    try {
      const c = await client.credit();
      setCredit(c);
      if (c.notice === 'CREDIT_CHANGED') setNotice('اعتبار در دسترس شما تغییر کرده است. لطفاً انتخاب خود را بازبینی کنید.');
      if (c.notice === 'RESERVATION_FAILED') setNotice('نتوانستیم اعتبار شما را رزرو کنیم. لطفاً دوباره تلاش کنید.');
    } catch (e) {
      handleError(e);
    }
  }, [client, handleError]);

  useEffect(() => {
    void loadCredit();
  }, [loadCredit]);
  usePolling(() => {
    void loadCredit();
    if (order.status === 'CreditInquiryInProgress') void refresh();
  }, 1000, inProgress);

  const selectable = useMemo(() => credit?.providers.filter((p) => p.selectable) ?? [], [credit]);
  const unreachable = credit?.providers.filter((p) => p.outcome === 'Error' || p.outcome === 'Timeout' || p.outcome === 'Late') ?? [];
  const fullCash = credit?.cashPaymentBps === 10000;
  const finished = credit && !inProgress;
  const noCredit = finished && !fullCash && selectable.length === 0;
  const allFailed = finished && !fullCash && credit.providers.length > 0 && unreachable.length === credit.providers.length;

  // Drop selections that are no longer selectable after a refresh.
  useEffect(() => {
    setSelected((s) => s.filter((id) => selectable.some((p) => p.providerId === id)));
  }, [selectable]);

  // UI recomputes fully from the server on every selection change (FR-032).
  useEffect(() => {
    if (!finished || order.status !== 'AwaitingSupplierSelection') return;
    if (!fullCash && !cashOnly && selected.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    client
      .quote(fullCash ? [] : cashOnly ? [] : selected, cashOnly)
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setQuoteError(null);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(e instanceof ApiError && (e.code === 'INSUFFICIENT_CREDIT' || e.code === 'NO_SELECTION') ? errorText(e) : handleError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [client, selected, cashOnly, fullCash, finished, order.status, handleError]);

  const toggle = (id: string) => {
    setCashOnly(false);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const confirm = async () => {
    setConfirmError(null);
    if (!quote) {
      setConfirmError(quoteError ?? 'لطفاً یک منبع اعتبار انتخاب کنید یا کل مبلغ را با کارت بانکی بپردازید.');
      return;
    }
    setPending(true);
    try {
      const r = await client.confirm(order.version, quote.allocations.map((a) => a.providerId), cashOnly, quote.quoteHash, ik);
      setOrder(r.order);
      if (r.next.type === 'redirect') goToGateway(r.next);
    } catch (e) {
      resetIk();
      if (e instanceof ApiError && e.code === 'CREDIT_CHANGED') {
        setNotice('اعتبار در دسترس شما تغییر کرده است. لطفاً انتخاب خود را بازبینی کنید.');
        await refresh();
        await loadCredit();
      } else if (e instanceof ApiError && e.code === 'STATE_CHANGED' && e.details?.quote) {
        setQuote(e.details.quote as QuoteResponse);
      } else setConfirmError(handleError(e, () => void confirm()));
    } finally {
      setPending(false);
    }
  };

  const retryInquiry = async () => {
    setRetrying(true);
    try {
      setOrder((await client.retryInquiry(order.version)).order);
      setNotice(null);
      await loadCredit();
    } catch (e) {
      setConfirmError(handleError(e));
    } finally {
      setRetrying(false);
    }
  };

  const providerName = (id: string) => credit?.providers.find((p) => p.providerId === id)?.displayName ?? '';

  return (
    <CheckoutLayout
      title="انتخاب اعتبار"
      footer={
        <div className="stack stack--sm">
          {confirmError && (
            <span className="field__error" role="alert">
              {confirmError}
            </span>
          )}
          <Button block onClick={() => void confirm()} pending={pending} disabled={!finished}>
            {cashOnly || fullCash ? 'پرداخت با کارت بانکی' : 'تأیید و ادامه'}
          </Button>
        </div>
      }
    >
      {notice && <Banner tone="warning">{notice}</Banner>}
      {!credit || inProgress ? (
        <section className="stack" aria-busy="true">
          <p className="bon-body-large">
            در حال بررسی اعتبار شما نزد {credit?.providers.length || ''} تأمین‌کننده…
          </p>
          {(credit?.providers.length ? credit.providers : [null, null]).map((p, i) => (
            <div key={p?.providerId ?? i} className="provider" aria-disabled="true">
              {p ? <Logo p={p} /> : <Skeleton width={40} height={40} radius={20} />}
              <div className="provider__body">{p ? p.displayName : <Skeleton width="60%" />}</div>
              {p && p.outcome !== 'Pending' ? <span className="muted bon-body-small">{p.availableAmount !== null ? toman(p.availableAmount) : '—'}</span> : <span className="spinner" aria-hidden="true" />}
            </div>
          ))}
        </section>
      ) : (
        <>
          {!fullCash && (
            <p className="bon-body-medium muted">
              {bpsToPercent(credit.cashPaymentBps)} از مبلغ با کارت بانکی و باقی از محل اعتبارهای انتخابی پرداخت می‌شود.
            </p>
          )}
          {unreachable.length > 0 && !allFailed &&
            unreachable.map((p) => (
              <Banner key={p.providerId} tone="warning">
                در حال حاضر امکان ارتباط با {p.displayName} نیست. سایر اعتبارهای شما نمایش داده شده است.
              </Banner>
            ))}
          {allFailed && <Banner tone="error">نتوانستیم اطلاعات اعتبار شما را دریافت کنیم. می‌توانید با کارت بانکی بپردازید یا دوباره تلاش کنید.</Banner>}
          {noCredit && !allFailed && <Banner tone="info">اعتبار در دسترسی یافت نشد.</Banner>}
          {!fullCash && (
            <section className="stack stack--sm" aria-label="اعتبارهای شما">
              {selectable.length > 1 && (
                <Checkbox
                  label="انتخاب همه"
                  checked={selected.length === selectable.length}
                  onChange={(e) => {
                    setCashOnly(false);
                    setSelected(e.target.checked ? selectable.map((p) => p.providerId) : []);
                  }}
                />
              )}
              {credit.providers
                .filter((p) => p.outcome === 'Ok')
                .map((p) => {
                  const isSel = selected.includes(p.providerId);
                  return (
                    <label key={p.providerId} className={`provider ${isSel ? 'provider--selected' : ''}`} aria-disabled={!p.selectable || undefined}>
                      <input type="checkbox" checked={isSel} disabled={!p.selectable} onChange={() => toggle(p.providerId)} style={{ width: 20, height: 20, accentColor: 'var(--bon-primary)' }} />
                      <Logo p={p} />
                      <span className="provider__body">
                        <span className="bon-title-small" style={{ display: 'block' }}>
                          {p.displayName}
                        </span>
                        <span className="bon-body-small muted">اعتبار در دسترس: {toman(p.availableAmount)}</span>
                      </span>
                    </label>
                  );
                })}
            </section>
          )}
          {(credit.allowCashOnly || noCredit) && !fullCash && (
            <Checkbox
              label="پرداخت کل مبلغ با کارت بانکی"
              checked={cashOnly}
              disabled={!credit.allowCashOnly}
              onChange={(e) => {
                setCashOnly(e.target.checked);
                if (e.target.checked) setSelected([]);
              }}
            />
          )}
          {(noCredit || allFailed) && credit.inquiryAttemptsLeft > 0 && (
            <Button variant="tonal" onClick={() => void retryInquiry()} pending={retrying}>
              تلاش دوباره
            </Button>
          )}
          <section className="card" aria-live="polite" aria-label="جزئیات پرداخت">
            <div className="kv">
              <span className="kv__k">پرداخت با کارت بانکی</span>
              <span className="kv__v">{quote ? toman(quote.cashAmount) : '—'}</span>
            </div>
            {quote?.allocations.map((a) => (
              <div key={a.providerId} className="kv">
                <span className="kv__k">{providerName(a.providerId)}</span>
                <span className="kv__v">{toman(a.amount)}</span>
              </div>
            ))}
            <div className="kv kv--total">
              <span className="kv__k">مبلغ کل</span>
              <span className="kv__v">{toman(order.totalAmount)}</span>
            </div>
            {quoteError && (
              <p className="field__error" role="alert">
                {quoteError}
              </p>
            )}
          </section>
        </>
      )}
      <CancelButton />
    </CheckoutLayout>
  );
}
