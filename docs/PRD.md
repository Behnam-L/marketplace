# PRD — Bâjet Combined-Credit Payment Platform

| | |
|---|---|
| Version | 2.0 — audited rewrite of v1 (`prd.md`) |
| Date | 2026-09-29 |
| Status | Build-ready. Where v1 and this document differ, this document wins. |

**Conventions (apply everywhere)**

- **Money:** `bigint` integer **Toman** (the system's minor unit; no subunits). Field suffix `Amount`. No floats in DB, code, or JSON. Rial conversion (×10) happens only inside bank/provider adapters (BR-MNY-03).
- **Percentages:** integer basis points, suffix `Bps` (0–10000 = 0–100%). UI accepts up to 2 decimals.
- **Time:** stored and exchanged as UTC ISO-8601. Business calendar = Jalali, timezone `Asia/Tehran`. Deadlines compared against DB server time only.
- **IDs:** prefixed ULIDs (`ord_`, `res_`, `btx_`, `ptx_`, `doc_`, `inv_`, `rfd_`, `mer_`, `prv_`, `csm_`, `adm_`).
- **Names:** entity/field names below are canonical for code, schema, and API.
- **Traceability to v1:** WF-01→FR-001/002/010 · WF-02→FR-011–013 · WF-03→FR-020–023 · WF-04→FR-030/031 · WF-05→FR-032/033 · WF-06→FR-040–042 · WF-07→FR-043/050/051 · WF-08→FR-060/061 · WF-09→FR-044/045 · WF-10→FR-090/091 · WF-11→FR-092/093 · WF-12→FR-100 · WF-13→FR-101 · WF-14→FR-110 · WF-15→FR-113 · WF-16→FR-120 · WF-17→FR-130–132 · WF-18→FR-133/134 · WF-19→FR-111 · WF-20→FR-112 · WF-21→FR-121 · WF-22→FR-150/151 · WF-23→FR-080–082.

---

## 1. Overview

### 1.1 Goals

| ID | Goal | Metric (target) |
|---|---|---|
| G1 | Consumer pays one merchant order with credit from ≥1 Credit Providers plus a cash portion, in one checkout | Availability-shown → Completed conversion; funnel per step (OTP sent → verified → identity verified → credit shown → confirmed → reserved → paid) |
| G2 | Race-free credit use | Double-allocation incidents (0); reservations held past `paymentDeadlineAt` + retry horizon (0) |
| G3 | Correct, auditable settlement | 100% of Completed orders have balanced ledger entries; % documents settled by maturity; avg days late |
| G4 | One admin control plane | Median onboarding time per provider/merchant; % documents auto-generated |
| G5 | Revenue | Net commission = Σ merchant margin − Σ provider margin |

### 1.2 Non-goals

- Credit underwriting, consumer repayment, collections (provider-owned).
- Consumer self-service portal/account (the consumer exists only inside checkout).
- Merchant self-service portal (merchant = API + webhooks; onboarding by Admin).
- Automated bank payouts/collections. Transfers happen outside the system and are **recorded** in it.
- Netting of payables vs receivables per counterparty (gross settlement).
- Multi-currency, card-on-file, consumer-adjustable cash percentage, chargeback/dispute workflow.
- Persian copy authoring (English strings here are the spec; fa-IR localisation is a delivery task).

### 1.3 User roles

| Role | Actor | Channel | Auth |
|---|---|---|---|
| Consumer | End customer | Checkout web app (mobile-first, fa-IR, RTL) | `checkoutToken` → session cookie → OTP |
| Merchant | Merchant backend | Merchant API, signed webhooks, browser redirects | API key + HMAC request signing |
| Credit Provider | Lender system | Outbound provider adapter; optional inbound webhooks | Per-provider credentials (mTLS where supported); HMAC webhooks |
| Bank Gateway (PSP) | Payment gateway | Redirect, callback, server-to-server verify/inquiry/reverse | Per-gateway credentials |
| Admin | Bâjet staff | Admin web app | Password + TOTP; RBAC (§9.2) |
| System | Scheduler/workers | Jobs | Internal |

Default admin roles: **SuperAdmin, Operations, Finance, Support, Viewer** (§9.2).

### 1.4 Priorities

P0 = end-to-end transaction + minimum control plane. P1 = daily operation/reconciliation. P2 = quality of life. Changes vs v1: admin login/navigation → **P0**; audit log → **P0**; ledger postings → **P0**; refunds and reconciliation → **P1** (new).

---

## 2. Audit findings

Type: **G** gap · **C** conflict · **A** ambiguity · **R** risk.

| ID | T | Finding in v1 | Resolution |
|---|---|---|---|
| A-01 | R | Redirect carries `phoneNumber`, `payableAmount`, `merchantId`, `merchantName` in the browser — tamperable; no merchant authentication at all. | Merchant creates the checkout server-to-server with HMAC (FR-002). Browser carries only an opaque `checkoutToken`. Merchant name comes from the `Merchant` record. |
| A-02 | G | No merchant return URLs, server-to-server notification, or status query, though WF-07 relies on "merchant notified independently". | `returnUrl`/`callbackUrl` on checkout; signed webhooks (FR-004); `GET` order status (FR-003). Merchant must not trust the browser return. |
| A-03 | C | Unique `(merchantId, orderNumber)` vs "restart from merchant" after OTP lockout — a new redirect would resume the locked order forever. | Uniqueness only over non-terminal + `Completed` orders (partial unique index). `Failed`/`Cancelled`/`Expired` free the number (BR-ORD-01). |
| A-04 | A | Duplicate `orderNumber` with a different amount/phone not covered. | `409 ORDER_CONFLICT`. |
| A-05 | C | §2.2 defines `Completed` as "allocation confirmed"; WF-07 shows `Completed` while allocation is still retrying. | `Completed` = consumer funding secured. Separate `allocationStatus` tracks provider confirmation. |
| A-06 | C | WF-07: `cashAmount = 0` orders must confirm allocation before `Completed`; failure path says allocation retries in background. | One rule for all orders: one synchronous allocation pass, then `Completed`; failures retry in background (FR-050). |
| A-07 | C | WF-06: bank-redirect init failure releases reservations → `ReservationFailed`; WF-09 keeps reservations for bank retry. | Init failure = a failed `BankTransaction`. Order stays `AwaitingBankPayment`; Retry/Cancel offered; hold deadline bounds it (FR-042). |
| A-08 | G | `CancellationRequested` used but not in state model; `BankPaymentSucceeded`/`BankPaymentFailed` states unused or inconsistent; `ReservationFailed` terminal vs "please try again". | Order state machine redefined (§5.1): adds `PaymentVerifying`, `AllocationInProgress`, `CancellationRequested`; failures become terminal `Failed` + `failureReason`. |
| A-09 | G | No timeout before credit is reserved; orders abandoned at OTP stay active and block their `orderNumber`. | `sessionExpiresAt` = created + 30 min for pre-confirm states; `paymentDeadlineAt` = confirm + 15 min afterwards (BR-ORD-02). |
| A-10 | G | Bank success after expiry → "manual reconciliation" only; consumer's cash stuck. | Never verify/settle a late payment; reverse via gateway automatically. Reconciliation item only if reversal fails (BR-BANK-03). |
| A-11 | G | At expiry, a `Pending` bank payment's outcome is unknown. | Expiry job queries gateway first; paid before deadline → proceed (FR-060). |
| A-12 | C | WF-09: "only the latest `BankTransaction` is authoritative" — a slower earlier success would be lost or double-charge. | First **verified** success wins (claimed atomically); any other success on the same order is reversed (BR-BANK-01). |
| A-13 | G | No refunds or reversals after completion. | Refund module: full/partial, provider reversal, consumer cash refund, merchant clawback (FR-070/071, BR-RFD). |
| A-14 | G | No accounting ledger; documents and states are mutable. | Double-entry append-only ledger (BR-LED). Document amounts immutable; corrections by new entries/documents. |
| A-15 | A | Meaning of "Provider Payable Margin" and "Merchant Receivable Margin" undefined. | Formulas in BR-SET-01/02. |
| A-16 | A | "Cash Settlement" / "Cash Settlement Percentage" undefined. | Share of merchant net paid D+1; rest in installments (BR-SET-03). |
| A-17 | A | "End of Jalali month" rule: first maturity and installment spacing undefined. | BR-SET-04. |
| A-18 | C | Document idempotency `(Order, installment index)` ignores counterparty; one order yields merchant + N provider documents. | Key = `(orderId, direction, counterpartyType, counterpartyId, kind, installmentIndex)`. |
| A-19 | G | Provider receivables for an allocation that is not yet confirmed. | Provider documents created only on allocation `Confirmed`; ledger uses an allocation-suspense account meanwhile. |
| A-20 | A | Document states `Scheduled` vs `PendingMaturity` indistinct; `Overdue` on both documents and invoices. | Document: `Scheduled → Matured → Invoiced → Settled`; `Overdue` only on invoices; lateness is derived from timestamps. |
| A-21 | G | Invoice period, due date, and how payment is recorded are undefined. | Daily run, due +3 days, Admin records full payment with bank reference (BR-INV). |
| A-22 | C | Plans are editable ("affects future only") yet archived "for stable reference". | Plans editable (audited); terms snapshotted on the order at completion; documents computed from snapshot. Referenced plans cannot be deleted. |
| A-23 | A | Manual document: Admin types the number; "validates against financial rules" undefined. | System-generated number; mandatory reason; four-eyes approval above threshold (BR-DOC). |
| A-24 | C | Rounding: floor (balances), half-up (cash), unspecified (supplier split, margins, installments beyond "remainder to last"). | One rule per calculation (BR-RND). Supplier split = largest remainder. |
| A-25 | A | Percentages specified as decimals ("0–100%"), invites floats. | Basis points. |
| A-26 | A | Toman vs Rial: gateways and some providers use Rial. | Integer Toman internally; adapters convert (BR-MNY-03). |
| A-27 | G | "Pay fully by bank card" offered in WF-04/05 but absent from state model. | Cash-only path: `AwaitingSupplierSelection → AwaitingBankPayment` with `cashAmount = totalAmount` (FR-033), gated by `allowCashOnly`. |
| A-28 | G | `cashPaymentPercentage = 100` flow unclear. | Skip credit inquiry; cash-only breakdown (FR-033). |
| A-29 | A | When the cash % snapshot is taken ("moment breakdown calculated" can happen many times). | Snapshot on entering `AwaitingSupplierSelection`; server is authoritative; confirm checks `quoteHash` (BR-CALC-05). |
| A-30 | G | Reservation failure says "try again" but the order is terminal. | Compensate, re-inquire, return to selection; max 3 attempts, then `Failed(RESERVATION_FAILED)`. |
| A-31 | G | No OTP resend throttling, code storage rule, or SMS failover. | Cooldown 60 s, max 3 resends/order, HMAC-hashed codes, secondary SMS provider. |
| A-32 | R | OTP lockout can be bypassed by unlimited new redirects. | Order → `Failed(OTP_LOCKED)`; 3 lockouts per phone in 24 h → 24 h cooldown. |
| A-33 | A | Identity lockout "same pattern as OTP" undefined. | 5 mismatches per order → `Failed(IDENTITY_LOCKED)`; 10 per phone per 24 h → cooldown. |
| A-34 | G | Verified phone↔national-ID linkage never re-checked (SIM reassignment). | Re-run phone↔ID match without user input if `lastMatchedAt` > 30 days. |
| A-35 | A | `ConsumerUser.Inactive` has no meaning. | `Inactive` = created, never OTP-verified; `Active` after first OTP; `Blocked` set by Admin. |
| A-36 | A | Merchant has both "National ID" and "National Number". | `nationalId` = entity identifier; `managerNationalCode` = manager's personal code. |
| A-37 | G | Provider `connectionStatus` transition rules undefined. | Health rules BR-PRV-01. Admin cannot set it. |
| A-38 | G | Provider API contract, sync vs async, unknown outcomes undefined; "provider-side or local ledger" undecided. | Adapter contract (BR-PRV-04); unknown → status query → release. Provider is balance authority; Bâjet adds a per-(consumer, provider) lock. No shadow balances. |
| A-39 | G | Availability web service semantics undefined. | FR-001. |
| A-40 | G | Minimum order amount "invented" but no value; no maximum. | Settings `minOrderAmount`, `maxOrderAmount` (BR-LIM). |
| A-41 | C | Login/navigation P0 in §1.4 but WF-23 is P2; audit log P2 in a money system. | Both P0. |
| A-42 | G | Admin auth method, 2FA, lockout undefined; invitation "email/SMS" but admins have no email. | Password + mandatory TOTP; SMS invitation (FR-080/081). |
| A-43 | G | No permission catalog or default roles. | §9.2. |
| A-44 | G | No reconciliation against PSP settlement reports or provider statements. | Daily reconciliation jobs + `ReconciliationItem` queue (FR-140–142). |
| A-45 | R | National ID and DOB stored with no protection rules. | Envelope encryption + blind index; masked by default (§9.5). |
| A-46 | A | Two-tab / stale-state handling described but no mechanism. | `Order.version`; consumer mutations require `If-Match`; `409 STATE_CHANGED`. |
| A-47 | G | No webhook/callback security for bank, provider, merchant. | §9.4. |
| A-48 | G | Refund while allocation is unconfirmed. | Blocked: `409 ALLOCATION_PENDING`. |
| A-49 | G | Provider must keep a reservation long enough for Bâjet's retries. | Contract requirement: provider hold ≥ 24 h unless released (BR-PRV-04). |
| A-50 | G | Checkout link reused on another device after OTP gives access to financial data. | OTP verification is bound to the checkout session; a new session must re-verify OTP (FR-010). |
| A-51 | G | Consumer first/last name source undefined. | Returned by identity service at DOB verification (FR-022). |
| A-52 | R | Contract/icon uploads unvalidated (SVG XSS, malware). | Type/size limits, AV scan, served from isolated domain (§9.3). |

---
## 3. Functional requirements

Format: **FR-xxx (priority) Title.** Requirement. Acceptance criteria (AC) as Given / When / Then.

### 3.1 Merchant integration

**FR-001 (P0) Availability check.** `GET /v1/merchant/availability?amount=` (server-to-server). `available = true` iff merchant `Enabled` ∧ `minOrderAmount ≤ amount ≤ maxOrderAmount` ∧ ≥1 provider (`displayStatus = Enabled` ∧ `connectionStatus ≠ Disconnected`) ∧ ≥1 bank gateway healthy ∧ SMS reachable ∧ `checkoutKillSwitch = false`. `degraded = true` if every available provider is `Degraded` or the identity service is unhealthy. Cached 30 s per merchant; p95 ≤ 300 ms.
- AC1 Given all providers `Disconnected`, when called, then `200 {available:false, reason:"NO_PROVIDER"}`.
- AC2 Given amount below minimum, then `available:false, reason:"AMOUNT_OUT_OF_RANGE"`.
- AC3 Given one provider `Degraded`, one `Connected`, then `available:true, degraded:false`.

**FR-002 (P0) Create checkout.** `POST /v1/merchant/checkouts` with `Idempotency-Key`. Validates BR-VAL; creates `ConsumerUser` (status `Inactive`) if phone unknown; creates `Order` (`Initiated → AwaitingOtp` in one transaction), `sessionExpiresAt = now + sessionTtlMinutes`; returns `checkoutUrl`.
- AC1 Given enabled merchant and valid signed request, when posted, then `201 {orderId, checkoutUrl, status:"AwaitingOtp", expiresAt}`.
- AC2 Given same key and same body, when replayed, then the original response is returned; given same key and different body, then `422 IDEMPOTENCY_KEY_REUSED`.
- AC3 Given a non-terminal order with the same `(merchantId, orderNumber)` and same amount+phone, then `200` with that order (resume); different amount or phone → `409 ORDER_CONFLICT`; a `Completed` one → `409 ORDER_ALREADY_COMPLETED`.
- AC4 Given two concurrent requests with the same `orderNumber` and different keys, then exactly one `Order` row exists (DB partial unique index) and both responses reference it.
- AC5 Given merchant `Disabled` → `403 MERCHANT_DISABLED`; consumer `Blocked` or in cooldown → `422 CONSUMER_NOT_ELIGIBLE`; `returnUrl` host not in merchant allowlist → `400 VALIDATION_ERROR`.

**FR-003 (P0) Order status for merchant.** `GET /v1/merchant/orders/{orderId}` and `?orderNumber=` return status, amounts, `allocationStatus`, refunds. Merchant must call this (or rely on webhook) before fulfilment.
- AC1 Given another merchant's orderId, then `404`.

**FR-004 (P0) Merchant webhooks.** Events: `order.completed`, `order.cancelled`, `order.expired`, `order.failed`, `refund.completed`, `refund.failed`. Signed (§9.4). At-least-once; retries at 1 m, 5 m, 15 m, 1 h, 3 h, 6 h, 12 h, 24 h, then `Exhausted` + ops alert. Enqueued via outbox in the same transaction as the state change.
- AC1 Given the merchant endpoint returns 500 twice then 200, then 3 attempts recorded, final `Delivered`, same `eventId` on every attempt.

**FR-005 (P0) Browser return.** "Return to merchant" redirects to `returnUrl?orderId&orderNumber&status&ts&sig` (HMAC). Informational only.

### 3.2 Checkout entry and OTP

**FR-010 (P0) Landing and checkout session.** Opening `/c/{checkoutToken}` exchanges the token for an HttpOnly session cookie bound to the order. Shows merchant display name (from record), total amount, masked phone (`0912***3503`), terms link. OTP verification is stored on the checkout session, not the order; a new session on an order past `AwaitingOtp` must pass OTP again before any step data is returned.
- AC1 Given a terminal order, when opened, then the matching result/expired/failed screen is shown.
- AC2 Given the order is at `AwaitingSupplierSelection` and the link is opened in a new browser, then a new OTP is required and no credit data is returned until verified; order status is unchanged.
- AC3 Given two tabs in one browser, then both show the same order; an action in one causes `409 STATE_CHANGED` in the other, which refetches and routes to the server's current step.

**FR-011 (P0) Terms acceptance.** Continue is blocked until the checkbox is ticked. Stores `termsVersion`, `acceptedAt`, IP, user agent.
- AC1 Given terms not accepted, when Continue, then no OTP is sent and message "Please accept the terms and conditions to continue."

**FR-012 (P0) Send / resend OTP.** 5-digit CSPRNG code, TTL `otpTtlSeconds` (120), stored as HMAC hash. SMS via primary provider; on error, secondary. Resend creates a new `OtpSession` and marks the previous `Superseded`. Cooldown `otpResendCooldownSeconds` (60); max `otpMaxResends` (3) per order.
- AC1 Given both SMS providers fail, then `OtpSession.dispatchStatus = Failed`, `503 SMS_UNAVAILABLE`, UI offers "Tap to try again".
- AC2 Given a resend 30 s after the previous send, then `429 OTP_RESEND_COOLDOWN` with `retryAfter`.
- AC3 Given 3 resends already, then `429 OTP_RESEND_LIMIT`.

**FR-013 (P0) Verify OTP.** Request carries `otpSessionId` + `code`.
- AC1 Given current session, correct code, `now < expiresAt`, then `OtpSession → Verified`, order → `AwaitingIdentity`, `ConsumerUser Inactive → Active`.
- AC2 Given `now ≥ expiresAt`, then `422 OTP_EXPIRED` (fail closed at exactly TTL).
- AC3 Given `otpSessionId` is not the current session, then `422 OTP_SESSION_SUPERSEDED` even if the code matches.
- AC4 Given the 5th wrong code, then `OtpSession → LockedOut`, order → `Failed(OTP_LOCKED)`, `423 OTP_LOCKED`, message "Too many incorrect attempts. Please return to the store and start again." (locks on the 5th, not the 6th).
- AC5 Given the phone's 3rd lockout within 24 h, then `ConsumerUser.cooldownUntil = now + 24 h`; new checkouts → `422 CONSUMER_NOT_ELIGIBLE`.
- AC6 Given consumer `Blocked` at verify time, then order → `Failed(CONSUMER_BLOCKED)`.

### 3.3 Identity

**FR-020 (P0) Linkage check.** On entering `AwaitingIdentity`: a `Verified` linkage with `lastMatchedAt ≥ now − linkageRematchDays` (30) → order advances. Stale → silent phone↔ID re-match: match updates `lastMatchedAt`; mismatch sets linkage `Revoked` and prompts for national ID.
- AC1 Given identity service times out, then order stays `AwaitingIdentity`, `503 IDENTITY_SERVICE_UNAVAILABLE`, retry offered, no attempt counted.

**FR-021 (P0) National ID step.** Local check: 10 digits + checksum (reject before any external call). Then external phone↔ID match. Match → `IdentityLinkage (PendingVerification)` scoped to this order.
- AC1 Given invalid checksum, then `400 VALIDATION_ERROR` "Please enter a valid national ID." and no external call.
- AC2 Given mismatch, then `422 IDENTITY_MISMATCH` and an `IdentityAttempt(Mismatch)` row.

**FR-022 (P0) Date of birth step.** Jalali picker; sent as Gregorian ISO date. External DOB↔ID match → linkage `Verified`; stores encrypted DOB and returned first/last name; order → `CreditInquiryInProgress` (or `AwaitingSupplierSelection` if `cashPaymentBps = 10000`).
- AC1 Given a `PendingVerification` linkage from an earlier, now-terminal order, then it is not trusted and national ID is requested again.

**FR-023 (P0) Identity limits and concurrency.** 5 mismatches (national ID + DOB combined) per order → `Failed(IDENTITY_LOCKED)`; 10 per phone per 24 h → phone cooldown 24 h. One `Verified` linkage per phone (unique); writes take a row lock on the consumer. A national ID may link to several phones.
- AC1 Given two orders for one phone verifying simultaneously, then one linkage row results and both orders proceed.

### 3.4 Credit inquiry and quote

**FR-030 (P0) Credit inquiry.** Parallel inquiry to providers with `displayStatus = Enabled` ∧ `connectionStatus ≠ Disconnected`, keyed by provider's `inquiryKey` (national ID or phone). Deadline `providerInquiryTimeoutMs` (8000) per provider, all in parallel. Each result: `Ok(availableAmount)` · `NoAccount` · `Error` · `Timeout`. Responses after the deadline are logged as `Late` and ignored. Max `maxInquiryAttempts` (3) per order.
- AC1 Given 2 of 3 providers respond, then order → `AwaitingSupplierSelection`, 2 providers listed, notice "We couldn't reach [Provider] right now. Showing your other available credit."
- AC2 Given all fail, then zero-credit screen with cash-only (if `allowCashOnly`) and "Try again".
- AC3 Given a provider returns 1,234,567.9 Toman or 12,345,679 Rial, then 1,234,567 Toman is stored (floor); a negative balance is stored as 0.

**FR-031 (P0) Credit display.** Each `Ok` provider shows its full available balance; balance 0 → shown disabled; `NoAccount` → hidden.

**FR-032 (P0) Quote.** `POST /v1/checkout/quote` computes the breakdown server-side (BR-CALC) for the selection with the order's snapshotted `cashPaymentBps`; UI recomputes fully on every selection change (no incremental patching). Returns `quoteHash`.
- AC1 Given v1 example (T 20,000,000; 2500 bps; available 6,000,000 and 9,000,000), then cash 5,000,000, allocations 6,000,000 and 9,000,000.
- AC2 Given selection covering less than `creditAmount`, then `422 INSUFFICIENT_CREDIT` "The selected credit lines don't cover the required amount. Please select additional sources."
- AC3 Given empty selection and not cash-only, then `422 NO_SELECTION`.

**FR-033 (P0) Cash-only and 100% cash.** If `allowCashOnly`, the consumer may choose "Pay fully by bank card" (`cashAmount = totalAmount`). If snapshotted `cashPaymentBps = 10000`, inquiry is skipped and only the cash breakdown is shown.
- AC1 Given `cashPaymentBps = 0`, then `cashAmount = 0` exactly and no bank step.

### 3.5 Reservation and bank payment

**FR-040 (P0) Confirm and re-check.** `POST /v1/checkout/confirm` (`Idempotency-Key`, `If-Match`, `quoteHash`). CAS `AwaitingSupplierSelection → ReservationInProgress`; set `paymentDeadlineAt = now + paymentHoldMinutes` (15). Fresh inquiry of selected providers; if any `share > available` (strict), release nothing yet, order → `CreditInquiryInProgress → AwaitingSupplierSelection`, `409 CREDIT_CHANGED` "Your available credit has changed. Please review your selection." Otherwise create one `CreditReservation (Requested)` + `ProviderTransaction (Reservation, Pending)` per provider with share > 0 and call reserve in parallel under the per-(consumer, provider) lock.
- AC1 Given `quoteHash` does not match a server recompute, then `409 STATE_CHANGED` with a fresh quote.
- AC2 Given share exactly equals fresh available, then reservation proceeds.
- AC3 Given the same key replayed, then no second reservation set is created.

**FR-041 (P0) Reservation outcome.** All `Reserved` → `AwaitingBankPayment` (cash > 0) or `AllocationInProgress` (cash = 0). Any `Failed`/unknown → all reservations of the attempt go `ReleasePending`, `reservationAttempts += 1`; attempts < `maxReservationAttempts` (3) → re-inquiry → `AwaitingSupplierSelection` with "We couldn't reserve your credit. Please try again."; else `Failed(RESERVATION_FAILED)`.
- AC1 Given 2 of 3 confirm and 1 fails, then 2 `Release` provider transactions are sent before the response; none left `Reserved`.
- AC2 Given a concurrent order for the same consumer and provider, then the provider (or the lock timeout, 15 s) rejects the second; no double-spend.

**FR-042 (P0) Bank payment initiation.** Create `BankTransaction (Payment, Pending)` for `cashAmount` on the highest-priority healthy gateway; return redirect data. Refuse if `paymentDeadlineAt − now < bankMinRemainingSeconds` (120) → `409 DEADLINE_TOO_CLOSE`. Init error → `BankTransaction Failed(INIT_ERROR)`, order stays `AwaitingBankPayment`, Retry/Cancel shown.
- AC1 Given gateway unreachable, then reservations are kept and "We couldn't start your bank payment. Please try again." is shown with Retry/Cancel.

**FR-043 (P0) Bank callback and verification.** `/v1/callbacks/bank/{gateway}` looks up our transaction reference; callback payload is never trusted for outcome. On reported success: `BankTransaction → Authorized`; CAS order `AwaitingBankPayment|CancellationRequested → PaymentVerifying` claiming this transaction; call gateway verify; verify OK and amount matches → `Success`, order → `AllocationInProgress`. Claim fails (order not payable, or another transaction already claimed) → do not verify; reverse (BR-BANK-03). Reported failure/cancel → `Failed`/`Cancelled`; order unchanged. Browser always ends at `/c/{token}/return`.
- AC1 Given the same callback delivered 3 times, then one verify call, one allocation pass.
- AC2 Given verify fails and deadline not passed, then order → `AwaitingBankPayment`, Retry/Cancel.
- AC3 Given callback amount ≠ `cashAmount × 10` Rial, then no verify, reversal, `ReconciliationItem(AMOUNT_MISMATCH)`.

**FR-044 (P0) Retry payment.** New `BankTransaction` for the same `cashAmount`; all attempts kept; the first verified success is authoritative (`isAuthoritative = true`).
- AC1 Given order `Expired`, then `409 ORDER_EXPIRED` "This session has expired. Please start a new payment."

**FR-045 (P0) Cancel.** Allowed in pre-confirm states and `AwaitingBankPayment`; `409 ORDER_BUSY` in `ReservationInProgress`/`PaymentVerifying`. No `Pending`/`Authorized` bank transaction → `Cancelled`, reservations released. Otherwise gateway inquiry: unresolved → `CancellationRequested`; later non-success (or `bankPendingMaxSeconds` = 1800 elapsed from transaction creation) → `Cancelled`; success → `PaymentVerifying` (payment wins; result page notes the cancel could not be applied).
- AC1 Given release fails at a provider, then the consumer still sees cancellation; release retries per BR-RETRY.

### 3.6 Allocation and completion

**FR-050 (P0) Allocation.** For each `Reserved` reservation: `→ AllocationPending`, send allocate (idempotency key `ptx.id`), parallel, `providerCallTimeoutMs` (10000). After this one pass, order → `Completed` with `allocationStatus = Confirmed` (all confirmed) or `Pending`; unconfirmed ones retry per BR-RETRY; exhaustion → reservation `NeedsReconciliation`, `allocationStatus = NeedsReconciliation`, `ReconciliationItem(ALLOCATION_UNCONFIRMED)`, ops alert. Same rule when `cashAmount = 0` (`allocationStatus` for cash-only = `NotApplicable`). Emits `order.completed`.
- AC1 Given cash paid and 1 of 2 allocations times out, then order `Completed`, `allocationStatus = Pending`, retry scheduled, consumer sees success.

**FR-051 (P0) Result page.** Shows providers used, credit per provider, cash, total, Bâjet order number, bank reference. "Return to Merchant" per FR-005. Closing the browser changes nothing (merchant has webhook).

**FR-052 (P0) Completion postings.** In the same DB transaction as `→ Completed`: snapshot settlement terms on the order and post the completion journal entry (BR-LED-03). Per-provider allocation confirmation posts BR-LED-04 and triggers provider documents (FR-130).

### 3.7 Expiry

**FR-060 (P0) Expiry job.** Runs every 15 s (plus delayed job at each deadline). Pre-confirm states with `now ≥ sessionExpiresAt` → `Expired`. `ReservationInProgress`/`AwaitingBankPayment` with `now ≥ paymentDeadlineAt` (exactly 15:00 counts as expired): if a `Pending`/`Authorized` bank transaction exists, run gateway inquiry — paid → `PaymentVerifying` (normal path); else → `Expired`. On `Expired`: all non-terminal reservations → `ReleasePending`; `order.expired` emitted. All via CAS on `(id, version)`.
- AC1 Given the timeout job and a consumer confirm hit the same order simultaneously, then exactly one transition succeeds; the loser gets `409 STATE_CHANGED`.

**FR-061 (P0) Late payment.** A success callback for an order that is not claimable → reversal (BR-BANK-03); consumer sees "Your payment was received after your session expired. It will be returned to your card automatically within 72 hours. Reference: {ref}."

### 3.8 Refunds (P1)

**FR-070 (P1) Create refund.** Merchant (`POST /v1/merchant/orders/{id}/refunds`) or Admin (`refunds.create`), with `Idempotency-Key`. Preconditions: order `Completed`; `allocationStatus ∈ {Confirmed, NotApplicable}`; `amount ≤ totalAmount − refundedAmount` (computed under order row lock). Splits per BR-RFD.
- AC1 Given refundable 3,000,000 and request 3,000,001, then `422 REFUND_EXCEEDS_REFUNDABLE`.
- AC2 Given `allocationStatus = Pending`, then `409 ALLOCATION_PENDING`.
- AC3 Given two concurrent refunds that together exceed refundable, then exactly one succeeds.

**FR-071 (P1) Execute refund legs.** Credit legs: `ProviderTransaction (Reversal)` per provider. Cash leg: gateway refund API if `gateway.supportsRefund`, else `PayableDocument` to consumer (`kind = Refund`) requiring payee IBAN entered by Support before invoicing. Merchant clawback: `ReceivableDocument` (`kind = Refund`). Ledger per BR-LED-06. Refund `Completed` when all legs succeed; retries per BR-RETRY; exhaustion → `NeedsReconciliation`. Emits `refund.completed`/`refund.failed`.
- AC1 Given the provider rejects a reversal permanently, then refund `NeedsReconciliation` and a `ReconciliationItem(REVERSAL_REJECTED)`.

### 3.9 Admin access

**FR-080 (P0) Login and session.** Phone + password, then TOTP. 5 failures → account locked 15 min. Session idle 30 min, absolute 12 h. Expiry redirects to `/admin/login?next=` and returns there after login. Warn at 2 min before idle timeout.
- AC1 Given correct password and wrong TOTP 5 times, then `423 ACCOUNT_LOCKED`.

**FR-081 (P0) Invitation, reset, bootstrap.** New admin receives single-use SMS link (24 h) to set password and enrol TOTP; delivery failure keeps the record `Invited` with "Resend". Password reset via SMS link + current TOTP; TOTP reset only by SuperAdmin. First SuperAdmin created by CLI bootstrap only.

**FR-082 (P0) Navigation.** Menu (v1 WF-23 list + Refunds, Reconciliation, Audit Log) filtered by permissions. Zero permitted sections → "You don't have access to any sections — contact an administrator."

**FR-083 (P0) Audit log.** Every admin mutation and every login/logout/failed login writes `AuditLog` (actor, action, entity, before/after with PII masked, IP, time). Append-only. Viewable with `audit.read`.

### 3.10 Providers and merchants

**FR-090 (P0) Credit Providers.** List (icon, display name, display status, connection status; sort/filter; paginated), create, details (all fields + payable/receivable invoice summaries linking to invoices), edit. Fields and validation per v1 WF-10 + BR-VAL, plus integration config: `adapterType`, `apiBaseUrl`, `credentialsRef` (secret store), `inquiryKey`, `sortOrder`. Files uploaded first to staging (`POST /files`) and committed atomically with the record; uncommitted files purged after 24 h. New provider starts `connectionStatus = Disconnected`.
- AC1 Given two admins create providers with the same `nationalId` concurrently, then one `201`, one `409 DUPLICATE_ENTITY {field:"nationalId"}`.
- AC2 Given IBAN fails mod-97, then `400` "Please enter a valid IBAN."

**FR-091 (P0) Provider status.** `displayStatus` editable; `Disabled` excludes the provider from inquiries started after the change; orders past inquiry are unaffected. `connectionStatus` system-managed (BR-PRV-01); transitions alert Operations.

**FR-092 (P0) Merchants.** List (display name, entity type, manager, contact, national ID, status), create, details (+ invoices), edit. Conditional validation by `entityType` (BR-VAL). Additional fields: `returnUrlDomains[]`, `webhookUrl`.
- AC1 Given `entityType = Individual`, then `economicId` optional and `nationalId` must be a 10-digit personal code.

**FR-093 (P0) Merchant credentials and disable.** Generate API key (`keyId` + secret shown once); max 2 active keys for rotation; revoke. `Disabled` → new checkouts `403 MERCHANT_DISABLED`; existing non-terminal orders continue; availability returns false.

### 3.11 Configuration

**FR-100 (P0) Settlement plans.** Provider plan: `providerPayableMarginBps` (0–10000), `installmentCount` (1–6), `maturityRule = EndOfJalaliMonth`. Merchant plan: `merchantReceivableMarginBps` (0–10000), `cashSettlementEnabled`, `cashSettlementBps` (100–10000, required iff enabled, else must be null), `installmentCount` (1–6), `maturityRule`. `planNumber` system-generated. Edits allowed and audited; they affect only orders completing afterwards (snapshot). Referenced plans cannot be deleted, only `Archived`; archived plans cannot be assigned.
- AC1 Given `cashSettlementEnabled = false` and `cashSettlementBps = 5000`, then `400` "Cash settlement percentage only applies when cash settlement is enabled."
- AC2 Given margin 0 or 10000, then accepted.

**FR-101 (P0) System settings.** Typed, range-validated keys (BR-LIM). Each change requires a reason and step-up TOTP; stored as append-only `SystemSettingChange`. Effective for orders entering the dependent step after save.
- AC1 Given an order already at `AwaitingSupplierSelection` when `cashPaymentBps` changes, then its quote and charge use the snapshotted value.

### 3.12 Monitoring

**FR-110 (P0) Orders.** List (system/merchant order number, merchant, total, cash, credit, provider count, created, status, allocation status) with filters (date range, merchant, status, allocationStatus, refundStatus, amount range, provider, exact phone, exact orderNumber); status filter values = §5.1. Details: consumer, per-provider reservations, bank transactions (chronological, authoritative flagged), provider transactions, documents, refunds, `OrderEvent` timeline. In-progress orders render missing data as "—".

**FR-111 (P1) Bank transactions.** List (reference, gateway, date, amount, type, status, order) + details with technical log.

**FR-112 (P1) Provider transactions.** List (reference, provider, date, type, amount, status). Filter `stuck=true`: reservation `Reserved`/`ReleasePending`/`AllocationPending` older than `paymentDeadlineAt + 5 min`.

**FR-113 (P1) Consumers.** List (first/last name or "Not yet verified", phone, status, registered) + details (last transaction, linked providers, orders). Admin sets `Active ↔ Blocked` with reason; blocking affects new checkouts and OTP verification, not orders past OTP.

**FR-114 (P2) Export.** Async CSV of any filtered list, ≤ 100,000 rows, PII masked unless `consumers.pii`.

### 3.13 Admin users and access (P1)

**FR-120 (P1) Admin users.** List/create/details/edit/deactivate/change role. Unique phone. Blocked: deactivating or re-roling the last active admin holding `admins.manage` or `roles.manage` → `409 LAST_ADMIN_MANAGER`. Admins cannot change their own role.

**FR-121 (P1) Roles and permissions.** Create roles; assign permissions from the fixed catalog (§9.2). Permission checks run on every request; removal takes effect on the next request (`403 FORBIDDEN`, UI refreshes menu). Same last-manager guard on permission removal.

### 3.14 Settlement (P1)

**FR-130 (P1) Automatic documents.** On `Completed`: merchant `PayableDocument`s from snapshot (BR-SET-02/03). On each allocation `Confirmed`: provider `ReceivableDocument`s (BR-SET-01). Idempotent by `sourceKey` (A-18).
- AC1 Given the job retried after a crash, then no duplicate documents.
- AC2 Given net 10,000,001 over 3 installments, then 3,333,333 / 3,333,333 / 3,333,335.

**FR-131 (P1) Manual documents.** `documents.manual`. Fields: direction, counterparty, amount (>0), maturity date, optional order, reason (`Adjustment|ReconciliationResolution|Other`), note (≥10 chars). Number system-generated. Amount > `manualDocApprovalThreshold` → `PendingApproval`; approver ≠ creator (`409 SELF_APPROVAL_FORBIDDEN`). Posts BR-LED-07 on `Scheduled`.
- AC1 Given `orderId` and amount > order `totalAmount`, then `422 AMOUNT_EXCEEDS_ORDER`.

**FR-132 (P1) Maturity and cancellation.** Daily 00:05 Tehran: `Scheduled` with `maturityDate ≤ today` → `Matured`. Only manual documents may be cancelled, only from `Scheduled`/`Matured`, with reason; posts a reversing entry. Automatic documents are corrected only by offsetting manual documents.

**FR-133 (P1) Invoices.** Daily 01:00 Tehran: group `Matured`, un-invoiced documents by `(direction, counterpartyType, counterpartyId)` → one invoice each (`periodFrom` = earliest maturity, `periodTo` = yesterday, total, count, `dueDate = invoiceDate + invoiceDueDays`). Documents → `Invoiced`. Unique per `(direction, counterpartyType, counterpartyId, invoiceDate)`. No documents → no invoice. Documents maturing after a run go to the next run.

**FR-134 (P1) Invoice payment.** `invoices.settle`, `Idempotency-Key`. Record `paidAt`, `bankReference`, `amount` (must equal `totalAmount`, else `422 PAYMENT_AMOUNT_MISMATCH`). Invoice → `Paid` (payable) / `Collected` (receivable); documents → `Settled`; ledger BR-LED-05. Daily job: `Sent` with `dueDate < today` → `Overdue`.

### 3.15 Reconciliation (P1)

**FR-140 (P1) Bank reconciliation.** Daily import of each gateway's settlement report (API or CSV upload). Match on gateway reference + amount. Outcomes: matched → none; in report not in system (or not `Success`) → `CASH_WITHOUT_ORDER`; `Success` missing from report after T+2 → `MISSING_IN_PSP_REPORT`; amount differs → `AMOUNT_MISMATCH`. Matched lines post BR-LED-08.

**FR-141 (P1) Provider reconciliation.** Daily provider statement vs provider transactions. Statement shows allocation we hold as `AllocationPending` → auto-confirm and resolve. Statement shows active hold we `Released` → re-send release. Other differences → item.

**FR-142 (P1) Reconciliation queue.** List/assign/resolve items. Resolution requires `resolutionType` (`Redriven|ManualDocument|Reversed|WrittenOff|NoActionNeeded`) + note; money-affecting resolutions link a manual document. "Re-drive" action retries the stuck provider/bank operation. `ALLOCATION_SUSPENSE` balance older than 24 h raises an alert.

### 3.16 Messaging (P2; OTP SMS is P0 with a built-in fallback template)

**FR-150 (P2) Templates.** Fields: event, channel (`SMS`), name, content, params. One `Active` template per `(event, channel)`. Creation validates that the event's required params (e.g. `{{code}}` for `otp.sent`) appear in content. Templates whose event no longer exists are flagged `orphaned`.

**FR-151 (P2) Message log.** Every send logged (template, recipient, status, provider, times, error); list with filters.

---
## 4. Business rules

### 4.1 Money and units

- **BR-MNY-01** All amounts are integer Toman (`bigint`, > 0 unless stated). JSON numbers are integers. Any non-integer input → `400`.
- **BR-MNY-02** All rates are integer basis points. `x × bps / 10000` is computed in integer arithmetic (BR-RND).
- **BR-MNY-03** Adapters: outbound Rial = Toman × 10. Inbound Rial → Toman = `floor(rial / 10)`. A bank callback/verify amount must equal `cashAmount × 10` exactly, otherwise FR-043 AC3.

### 4.2 Limits and settings (`SystemSetting`, all configurable)

| Key | Default | Range |
|---|---|---|
| `cashPaymentBps` | 2500 | 0–10000 |
| `allowCashOnly` | true | bool |
| `minOrderAmount` / `maxOrderAmount` | 100,000 / 1,000,000,000 | 1,000 ≤ min ≤ max |
| `sessionTtlMinutes` | 30 | 10–120 |
| `paymentHoldMinutes` | 15 | 5–60 |
| `bankMinRemainingSeconds` | 120 | 0–600 |
| `bankPendingMaxSeconds` | 1800 | 600–3600 |
| `otpTtlSeconds` / `otpMaxAttempts` | 120 / 5 | 60–600 / 3–10 |
| `otpResendCooldownSeconds` / `otpMaxResends` | 60 / 3 | 30–300 / 1–10 |
| `identityMaxMismatchesPerOrder` / `…PerPhone24h` | 5 / 10 | 3–10 / 5–50 |
| `phoneLockoutsBeforeCooldown` / `phoneCooldownHours` | 3 / 24 | 1–10 / 1–168 |
| `linkageRematchDays` | 30 | 1–365 |
| `providerInquiryTimeoutMs` / `providerCallTimeoutMs` | 8000 / 10000 | 2000–20000 |
| `maxInquiryAttempts` / `maxReservationAttempts` | 3 / 3 | 1–5 |
| `merchantCashSettlementDelayDays` | 1 | 0–7 |
| `invoiceDueDays` | 3 | 0–30 |
| `manualDocApprovalThreshold` | 50,000,000 | ≥ 0 |
| `checkoutKillSwitch` | false | bool |

### 4.3 Orders

- **BR-ORD-01** Partial unique index on `(merchantId, merchantOrderNumber)` where `status ∉ {Cancelled, Expired, Failed}`.
- **BR-ORD-02** `sessionExpiresAt = createdAt + sessionTtlMinutes` governs states before confirm. `paymentDeadlineAt = confirmAt + paymentHoldMinutes` governs `ReservationInProgress` and `AwaitingBankPayment`. Expired means `now ≥ deadline`.
- **BR-ORD-03** Every transition is a compare-and-swap: `UPDATE … WHERE id = ? AND status = ? AND version = ?`, increments `version`, and inserts an `OrderEvent` in the same transaction.
- **BR-ORD-04** No external call inside a DB transaction. Side effects (provider calls, webhooks, SMS) are dispatched via a transactional outbox.
- **BR-ORD-05** Amount limits and all range boundaries are inclusive.

### 4.4 Checkout calculation

- **BR-CALC-01 Cash split.** `cashAmount = roundHalfUp(T × cashPaymentBps / 10000)`; `creditAmount = T − cashAmount`. Cash-only: `cashAmount = T`, `creditAmount = 0`.
- **BR-CALC-02 Supplier allocation (largest remainder).** Selected providers `i` with available `aᵢ > 0`, `A = Σaᵢ`, required `K = creditAmount`.
  1. `A < K` → `INSUFFICIENT_CREDIT` (insufficient is strictly `K > A`).
  2. `A = K` → `shareᵢ = aᵢ`.
  3. `A > K` → `rawᵢ = K·aᵢ / A`; `shareᵢ = floor(rawᵢ)`; distribute `K − Σshareᵢ` one Toman each to providers ordered by fractional part desc, then `aᵢ` desc, then `providerId` asc. Guarantees `shareᵢ ≤ aᵢ` and `Σshareᵢ = K`.
  4. Providers with `shareᵢ = 0` are not reserved.
- **BR-CALC-03 Examples.**
  - v1: T = 20,000,000, 2500 bps → cash 5,000,000, K = 15,000,000; a = (6,000,000; 9,000,000) → shares (6,000,000; 9,000,000).
  - T = 10,000,001, 2500 bps → cash = roundHalfUp(2,500,000.25) = 2,500,000; K = 7,500,001; a = (3,000,000; 7,000,000) → raw (2,250,000.3; 5,250,000.7) → shares (2,250,000; 5,250,001).
- **BR-CALC-04** The UI may preview with the same shared pure function; the server result is authoritative.
- **BR-CALC-05** `cashPaymentBps` is snapshotted on the order when it first enters `AwaitingSupplierSelection`. `quoteHash = SHA-256(orderId | cashPaymentBps | sorted (providerId, share) | cashOnly)`.

### 4.5 Rounding (single rule per calculation)

| Calculation | Rule |
|---|---|
| Provider balance in (incl. Rial→Toman) | floor; negative → 0 |
| Cash portion; merchant margin; provider margin; cash-settlement part | half-up: `(x·bps + 5000) div 10000` |
| Supplier allocation | largest remainder (BR-CALC-02) |
| Installments | `floor(X/N)` each, remainder on the last |
| Refund legs and margin refunds | cumulative pro-rata (BR-RFD-02) |
| Display | exact integer, thousands separators, never rounded |

### 4.6 Settlement (terms snapshotted at `completedAt` into `Order.settlementTermsSnapshot`)

- **BR-SET-01 Provider.** Per allocated provider `p` with credit `Kₚ`: `PMₚ = roundHalfUp(Kₚ × providerPayableMarginBps / 10000)` = margin Bâjet concedes to the provider. Provider owes Bâjet `Kₚ − PMₚ` as `ReceivableDocument`s over the provider plan's `installmentCount`.
- **BR-SET-02 Merchant.** `M = roundHalfUp(T × merchantReceivableMarginBps / 10000)` = Bâjet commission. `merchantNet = T − M` owed to merchant as `PayableDocument`s.
- **BR-SET-03 Cash settlement.** If `cashSettlementEnabled`: `cashPart = roundHalfUp(merchantNet × cashSettlementBps / 10000)` → one document (`kind = CashSettlement`) maturing `completedDate + merchantCashSettlementDelayDays`. `merchantNet − cashPart` is split into installments. Otherwise all of `merchantNet` is split.
- **BR-SET-04 Maturity.** `m₀` = Jalali month containing `completedAt` (Asia/Tehran). Installment `k` (1…N) matures on the last day of Jalali month `m₀ + k − 1` (Esfand 29/30 per leap year). Provider documents use the order's `completedAt`, not the confirmation time.
- **BR-SET-05** Split per BR-RND; zero-amount documents are not created.
- **BR-SET-06** Net revenue per order = `M − ΣPMₚ`. May be negative; reported, not blocked.
- **Example.** T = 20,000,000 completed 2026-09-29 (1405-07-07). Merchant 300 bps, cash settlement 3000 bps, 2 installments → M = 600,000; net 19,400,000; cashPart 5,820,000 due 1405-07-08; installments 6,790,000 due 1405-07-30 and 1405-08-30. Provider P1 (K 6,000,000; 100 bps; 1 inst.) → 5,940,000 due 1405-07-30. P2 (K 9,000,000; 150 bps; 3 inst.) → 8,865,000 = 2,955,000 × 3 due 1405-07-30, 1405-08-30, 1405-09-30. Revenue 405,000.

### 4.7 Refunds

- **BR-RFD-01** Refundable = `totalAmount − Σ amount of refunds not Failed/Rejected`. `refundStatus` = `Partial` or `Full` accordingly.
- **BR-RFD-02 Cumulative pro-rata.** Let `Cⱼ` = cumulative refunded including refund `j`. Legs: allocate `Cⱼ` across original legs (cash `C`, each `Kₚ`) by BR-CALC-02 weights; this refund's leg = cumulative leg − previous cumulative leg. Merchant margin refund `mⱼ = roundHalfUp(Cⱼ·M/T) − roundHalfUp(Cⱼ₋₁·M/T)`. Provider margin refund per provider likewise on `Kₚ`, `PMₚ`. A full refund therefore returns exactly the original legs and margins.
- **BR-RFD-03 Resulting obligations.** Merchant clawback `Rⱼ − mⱼ` (`ReceivableDocument`, matures today). Provider `p`: Bâjet owes `Rₖₚ − pmₚ` (`PayableDocument`, matures today). Consumer: cash leg via gateway refund or `PayableDocument` to consumer.
- **Example.** Order above, refund 3,000,000 → legs cash 750,000, P1 900,000, P2 1,350,000; m = 90,000; pm = 9,000 / 20,250 → merchant clawback 2,910,000; provider payables 891,000 / 1,329,750; consumer 750,000.

### 4.8 Ledger (append-only, double-entry)

- **BR-LED-01** `JournalEntry` has ≥ 2 `LedgerLine`s; Σdebit = Σcredit; each line one positive side. `UPDATE`/`DELETE` revoked at DB-role level and blocked by trigger. Corrections = new entry with `reversesEntryId`. Idempotent: unique `(eventType, sourceId)`.
- **BR-LED-02 Accounts.** `PSP_CLEARING:{gateway}`, `BANK_OPERATING`, `ALLOCATION_SUSPENSE`, `UNALLOCATED_CASH`, `CP:MERCHANT:{id}`, `CP:PROVIDER:{id}`, `CP:CONSUMER:{id}` (counterparty positions; credit balance = Bâjet owes), `COMMISSION_REVENUE`, `PROVIDER_MARGIN_EXPENSE`, `PSP_FEE_EXPENSE`, `ADJUSTMENTS`.

| Rule | Event | Debit | Credit |
|---|---|---|---|
| BR-LED-03 | Order `Completed` | `PSP_CLEARING` C; `ALLOCATION_SUSPENSE` K | `CP:MERCHANT` T−M; `COMMISSION_REVENUE` M |
| BR-LED-04 | Allocation confirmed (p) | `CP:PROVIDER` Kₚ−PMₚ; `PROVIDER_MARGIN_EXPENSE` PMₚ | `ALLOCATION_SUSPENSE` Kₚ |
| BR-LED-05 | Invoice paid / collected | Payable: `CP:X` · Receivable: `BANK_OPERATING` | Payable: `BANK_OPERATING` · Receivable: `CP:X` |
| BR-LED-06 | Refund `j` | `CP:MERCHANT` Rⱼ−mⱼ; `COMMISSION_REVENUE` mⱼ | `CP:CONSUMER` (or `PSP_CLEARING` if gateway refund) cash leg; `CP:PROVIDER` Rₖₚ−pmₚ; `PROVIDER_MARGIN_EXPENSE` pmₚ |
| BR-LED-07 | Manual document | Payable: `ADJUSTMENTS` · Receivable: `CP:X` | Payable: `CP:X` · Receivable: `ADJUSTMENTS` |
| BR-LED-08 | PSP settlement matched | `BANK_OPERATING` net; `PSP_FEE_EXPENSE` fee | `PSP_CLEARING` gross |
| — | Verified success not attached to an order (reconciliation only) / its reversal | `PSP_CLEARING` / `UNALLOCATED_CASH` | `UNALLOCATED_CASH` / `PSP_CLEARING` |

- **BR-LED-09 Invariants (nightly check, alert on breach).** For each counterparty: `CP` balance = Σ open payable documents − Σ open receivable documents. `ALLOCATION_SUSPENSE` = Σ unconfirmed allocations. Trial balance = 0.

### 4.9 Documents and invoices

- **BR-DOC-01** Numbers: `PD-`/`RD-` + Jalali `yyyymmdd` + 6-digit daily sequence; invoices `PI-`/`RI-` likewise.
- **BR-DOC-02** Amount, counterparty, maturity date are immutable after creation.
- **BR-DOC-03** Manual: reason + note mandatory; with `orderId`, amount ≤ order `totalAmount`; four-eyes above `manualDocApprovalThreshold`.
- **BR-INV-01** Invoice is paid in full only; any difference is handled with a manual document.
- **BR-INV-02** Invoice lines (documents) are fixed at generation; late-maturing documents go to the next run.

### 4.10 Bank gateway

- **BR-BANK-01** First verified success wins; claimed by the CAS in FR-043.
- **BR-BANK-02** Verify only after a successful claim and only if the amount matches.
- **BR-BANK-03** Non-claimable success (late, duplicate, amount mismatch): call gateway reverse → `ReversalPending → Reversed`. If the gateway has no reverse API, do not verify (PSP auto-reverses unverified payments) and open `ReconciliationItem(LATE_PAYMENT)` to confirm via settlement report.
- **BR-BANK-04** Verify timeout: retry 3× within 60 s, then inquiry until `bankPendingMaxSeconds`; still unknown → treat as unpaid, call reverse, order leaves `PaymentVerifying` (§5.1).
- **BR-BANK-05** Gateways have `priority` and health; initiation uses the highest-priority healthy one.

### 4.11 Providers

- **BR-PRV-01 Health.** Probe every 30 s. `Degraded`: error rate ≥ 20% or p95 latency > 5 s over a rolling 5 min (probes + live calls). `Disconnected`: 3 consecutive probe failures. Back to `Connected`: 3 consecutive successes and thresholds clear.
- **BR-PRV-02 Lock.** Advisory lock on `(consumerUserId, providerId)` around each reserve call; wait ≤ 15 s, else that reservation fails `RESERVATION_BUSY`.
- **BR-PRV-03 Unknown outcome.** Timeout/5xx → status query up to 3×; still unknown → reserve treated as failed and a release sent (release of an unknown reference must succeed at the provider).
- **BR-PRV-04 Adapter contract (required of every provider).** `inquire`, `reserve(ref, amount)`, `allocate(ref)`, `release(ref)`, `reverse(ref, amount)`, `status(ref)`, `statement(date)`; all idempotent by `ref` (= `ProviderTransaction.id`); reservation hold ≥ 24 h unless released; provider enforces balance atomically.

### 4.12 Retries

- **BR-RETRY-01** Background operations (allocate, release, provider reversal, gateway reverse, refund legs): backoff `30 s × 2ⁿ`, ±20% jitter, cap 1 h, max 12 attempts (≈ 7 h). Exhausted → entity `NeedsReconciliation`, `ReconciliationItem`, Operations alert.
- **BR-RETRY-02** Merchant webhooks: FR-004 schedule. Scheduled jobs (maturity, invoices, reconciliation) rerun safely via unique keys.

---

## 5. State machines

Terminal states marked **†**. Every transition not listed is forbidden and returns `409 STATE_CHANGED` (API) or is rejected by the CAS (jobs).

### 5.1 Order

States: `Initiated` (transient), `AwaitingOtp`, `AwaitingIdentity`, `CreditInquiryInProgress`, `AwaitingSupplierSelection`, `ReservationInProgress`, `AwaitingBankPayment`, `PaymentVerifying`, `CancellationRequested`, `AllocationInProgress`, `Completed`†, `Cancelled`†, `Expired`†, `Failed`† (`failureReason`: `OTP_LOCKED`, `IDENTITY_LOCKED`, `RESERVATION_FAILED`, `CONSUMER_BLOCKED`).

| From | To | Trigger / guard |
|---|---|---|
| Initiated | AwaitingOtp | Checkout created (same transaction) |
| AwaitingOtp | AwaitingIdentity | OTP verified |
| AwaitingOtp | Failed | 5th wrong code (`OTP_LOCKED`); consumer `Blocked` at verify (`CONSUMER_BLOCKED`) |
| AwaitingIdentity | CreditInquiryInProgress | Linkage verified, `cashPaymentBps < 10000` |
| AwaitingIdentity | AwaitingSupplierSelection | Linkage verified, `cashPaymentBps = 10000` |
| AwaitingIdentity | Failed | Identity mismatch limit (`IDENTITY_LOCKED`) |
| CreditInquiryInProgress | AwaitingSupplierSelection | Inquiry finished (any outcome); snapshot `cashPaymentBps` on first entry |
| AwaitingSupplierSelection | CreditInquiryInProgress | Consumer retries inquiry; `inquiryAttempts < max` |
| AwaitingSupplierSelection | ReservationInProgress | Confirm, `creditAmount > 0`, valid `quoteHash`; sets `paymentDeadlineAt` |
| AwaitingSupplierSelection | AwaitingBankPayment | Confirm cash-only (`allowCashOnly` or 100% cash); sets `paymentDeadlineAt` |
| ReservationInProgress | AwaitingBankPayment | All reserved, `cashAmount > 0` |
| ReservationInProgress | AllocationInProgress | All reserved, `cashAmount = 0` |
| ReservationInProgress | CreditInquiryInProgress | Credit changed at re-check, or a reservation failed with attempts < max; releases dispatched; `paymentDeadlineAt` cleared |
| ReservationInProgress | Failed | Reservation failed at max attempts (`RESERVATION_FAILED`) |
| AwaitingBankPayment | PaymentVerifying | Success callback claimed, or expiry-job inquiry shows paid |
| AwaitingBankPayment | CancellationRequested | Cancel with a `Pending`/`Authorized` bank transaction |
| AwaitingBankPayment | Cancelled | Cancel with no pending bank transaction |
| PaymentVerifying | AllocationInProgress | Verify `Success` |
| PaymentVerifying | AwaitingBankPayment | Verify failed / resolved unpaid, `now < paymentDeadlineAt` |
| PaymentVerifying | Expired | Verify failed / resolved unpaid, `now ≥ paymentDeadlineAt` |
| CancellationRequested | PaymentVerifying | Pending transaction succeeds and is claimed |
| CancellationRequested | Cancelled | Pending transaction fails, or `bankPendingMaxSeconds` elapsed |
| AllocationInProgress | Completed | Allocation pass finished (any per-provider outcome) |
| AwaitingOtp, AwaitingIdentity, CreditInquiryInProgress, AwaitingSupplierSelection | Expired | `now ≥ sessionExpiresAt` |
| AwaitingOtp, AwaitingIdentity, AwaitingSupplierSelection | Cancelled | Consumer cancel |
| ReservationInProgress, AwaitingBankPayment | Expired | `now ≥ paymentDeadlineAt` and no paid transaction |

On entering `Cancelled`, `Expired`, `Failed`, or `ReservationInProgress → CreditInquiryInProgress`: every non-terminal reservation → `ReleasePending`.

**Forbidden (explicit):** any exit from a terminal state; skipping OTP or identity; `Completed` without a `Success` payment when `cashAmount > 0`; `AllocationInProgress`/`PaymentVerifying` → `Cancelled` or `Expired` while a verified payment exists; cancel during `ReservationInProgress`, `CreditInquiryInProgress`, `PaymentVerifying` (`409 ORDER_BUSY`); two transitions from one `version`.

**Sub-status on `Completed`:** `allocationStatus`: `NotApplicable` (no credit) · `Pending → Confirmed | NeedsReconciliation`; `NeedsReconciliation → Confirmed` (re-drive/reconciliation). `refundStatus`: `None → Partial → Full`, `None → Full`.

### 5.2 CreditReservation

| From | To | Trigger |
|---|---|---|
| Requested | Reserved | Provider confirms |
| Requested | Failed† | Provider rejects |
| Requested | ReleasePending | Outcome unknown after BR-PRV-03, or order left the reservation step |
| Reserved | AllocationPending | Order → `AllocationInProgress` |
| Reserved | ReleasePending | Order cancelled/expired/failed/re-inquiry |
| AllocationPending | Allocated† | Provider confirms allocation (live, retry, or statement) |
| AllocationPending | NeedsReconciliation | Retries exhausted |
| ReleasePending | Released† | Provider confirms release |
| ReleasePending | NeedsReconciliation | Retries exhausted |
| NeedsReconciliation | Allocated† / Released† | Re-drive or reconciliation evidence (same direction as before only) |

Forbidden: `AllocationPending → ReleasePending` (paid order never releases); `Allocated → Released`; `Released/Failed → Reserved/Allocated`; `NeedsReconciliation` switching direction. Refund reversals are tracked by `reversedAmount`, not state.

### 5.3 BankTransaction

`type = Payment`:

| From | To | Trigger |
|---|---|---|
| Pending | Authorized | Callback/inquiry reports success |
| Pending | Failed† / Cancelled† | Init error, reported failure/cancel, or unresolved after `bankPendingMaxSeconds` |
| Authorized | Success† | Claimed + verify OK |
| Authorized | Failed† | Claimed + verify rejected |
| Authorized | ReversalPending | Not claimable, or verify unknown (BR-BANK-03/04) |
| Failed, Cancelled | ReversalPending | Success reported later (late payment) |
| ReversalPending | Reversed† | Gateway confirms reverse / settlement report confirms auto-reversal |
| ReversalPending | NeedsReconciliation | Retries exhausted |

`type = Refund`: `Pending → Success† | Failed†`.

Forbidden: `Failed/Cancelled → Success`; `Success → Failed/Reversed` (post-completion money-back is a Refund); more than one `Success` per order with `isAuthoritative = true`.

### 5.4 ProviderTransaction

`type ∈ {Reservation, Allocation, Release, Reversal}`. `Pending → Confirmed† | Failed† | Unknown`; `Unknown → Confirmed† | Failed†` (status query/statement). Forbidden: `Confirmed ↔ Failed`. Retries are attempts on the same row (`attempts`, `nextAttemptAt`), never new rows.

### 5.5 OtpSession

`Sent → Verified† | Expired† | LockedOut† | Superseded†`. `dispatchStatus` (`Pending|Sent|Failed`) is independent. Forbidden: verify on any non-`Sent` session; verify at `now ≥ expiresAt`.

### 5.6 IdentityLinkage

`PendingVerification → Verified`; `PendingVerification → Abandoned†` (its order terminal); `Verified → Revoked†` (re-match mismatch). A new entry after revocation creates a new row. "NotLinked" = no row. Mismatches are `IdentityAttempt` rows, not states. Forbidden: reuse of a `PendingVerification` from another order; `Verified` without both external checks.

### 5.7 Refund

`Requested → Processing → Completed†`; `Processing → NeedsReconciliation → Completed†`; `Requested → Rejected†` (validation at execution). Legs (`RefundLeg`): `Pending → Succeeded† | Failed → Pending` (retry) `| NeedsReconciliation`. Forbidden: any change to amount after `Requested`; exit from `Completed`.

### 5.8 PayableDocument / ReceivableDocument

| From | To | Trigger |
|---|---|---|
| PendingApproval | Scheduled | Second admin approves (manual > threshold) |
| PendingApproval | Rejected† | Second admin rejects |
| Scheduled | Matured | Maturity job, `maturityDate ≤ today` |
| Matured | Invoiced | Invoice job |
| Invoiced | Settled† | Invoice `Paid`/`Collected` |
| Scheduled, Matured | Cancelled† | Manual documents only, with reason |

Forbidden: `Invoiced → Cancelled`; `Matured → Scheduled`; cancelling automatic documents; any amount/counterparty/maturity edit.

### 5.9 PayableInvoice / ReceivableInvoice

`Generated → Sent → Paid†|Collected†`; `Generated → Paid†|Collected†`; `Sent → Overdue → Paid†|Collected†`. Forbidden: adding/removing documents; `Overdue → Sent`; partial payment.

### 5.10 Other entities

| Entity | Transitions | Forbidden |
|---|---|---|
| `ReconciliationItem` | `Open → InReview → Resolved†`; `Open → Resolved†` (auto) | Reopen (create a new item) |
| `MessageLog` | `Queued → Sent → Delivered†|Failed†`; `Queued → Failed†` | Resend on same row |
| `MerchantWebhookEvent` | `Pending → Delivered†`; `Pending → Retrying → Delivered†|Exhausted`; `Exhausted → Retrying` (manual redeliver) | Payload change |
| `CreditProvider.displayStatus` | `Enabled ↔ Disabled` (Admin) | — |
| `CreditProvider.connectionStatus` | `Connected ↔ Degraded ↔ Disconnected`, `Connected ↔ Disconnected` (system only) | Admin edit |
| `Merchant.status` | `Enabled ↔ Disabled` | — |
| `ConsumerUser.status` | `Inactive → Active` (system, first OTP); `Active ↔ Blocked`, `Inactive → Blocked` (Admin) | Admin setting `Inactive` |
| `AdminUser.status` | `Invited → Active` (invite accepted); `Active ↔ Inactive`; `Invited → Inactive` | Last manager → `Inactive` |
| Settlement plans | `Active → Archived†` | Delete if referenced; assign archived |
| `MessageTemplate` | `Active ↔ Inactive` | Two `Active` per `(event, channel)` |

---
## 6. Data model

Common columns on every table: `id`, `createdAt`; mutable tables add `updatedAt`, `version`. Money columns `bigint`; rates `integer` (bps). **Append-only tables** (INSERT/SELECT only): `OrderEvent`, `JournalEntry`, `LedgerLine`, `AuditLog`, `SystemSettingChange`, `IdentityAttempt`, `ProviderCallLog`.

### 6.1 Entities

| Entity | Key fields | Constraints |
|---|---|---|
| `Merchant` | displayName, entityType (`Individual|Legal`), legalName, nationalId, economicId?, managerName, managerNationalCode, contactNumber, websiteUrl, officeAddress, iban, contractFileId, merchantSettlementPlanId, status, returnUrlDomains[], webhookUrl | UNIQUE nationalId; UNIQUE economicId (not null) |
| `MerchantApiKey` | merchantId, keyId, secretEnc, status (`Active|Revoked`), lastUsedAt | UNIQUE keyId; ≤ 2 Active per merchant |
| `CreditProvider` | legalName, displayName, iconFileId, nationalId, economicId, websiteUrl, contactNumber, officeAddress, iban, contractFileId, providerSettlementPlanId, displayStatus, connectionStatus, connectionStatusChangedAt, adapterType, apiBaseUrl, credentialsRef, inquiryKey (`NationalId|Phone`), sortOrder | UNIQUE nationalId; UNIQUE economicId |
| `BankGateway` | code, name, priority, healthStatus, supportsReverse, supportsRefund, credentialsRef | UNIQUE code |
| `ConsumerUser` | phoneE164, status, firstName?, lastName?, cooldownUntil?, lastTransactionAt | UNIQUE phoneE164 |
| `IdentityLinkage` | consumerUserId, nationalIdEnc, nationalIdHash, dobEnc?, status, orderId (for Pending), verifiedAt, lastMatchedAt | UNIQUE consumerUserId WHERE status = Verified |
| `IdentityAttempt` | orderId, consumerUserId, step (`NationalId|Dob|Rematch`), outcome (`Match|Mismatch|Error`) | — |
| `CheckoutSession` | orderId, tokenHash, otpVerifiedAt?, expiresAt | — |
| `OtpSession` | orderId, checkoutSessionId, codeHash, expiresAt, attempts, status, dispatchStatus, smsProvider | one `Sent` per order |
| `Order` | merchantId, merchantOrderNumber, consumerUserId, totalAmount, cashAmount?, creditAmount?, cashPaymentBps?, status, failureReason?, allocationStatus?, refundStatus, refundedAmount, sessionExpiresAt, paymentDeadlineAt?, inquiryAttempts, reservationAttempts, quoteHash?, returnUrl, callbackUrl?, checkoutTokenHash, termsVersion, termsAcceptedAt, settlementTermsSnapshot (json)?, completedAt?, version | Partial UNIQUE (merchantId, merchantOrderNumber) per BR-ORD-01; CHECK cash + credit = total when set |
| `OrderEvent` | orderId, fromStatus, toStatus, actor (`consumer|merchant|admin:{id}|system`), reason | — |
| `CreditInquiry` / `CreditInquiryResult` | orderId, attemptNo / inquiryId, providerId, outcome (`Ok|NoAccount|Error|Timeout|Late`), availableAmount?, latencyMs | UNIQUE (inquiryId, providerId) |
| `CreditReservation` | orderId, providerId, attemptNo, amount, status, providerReference, reservedAt, allocatedAt, releasedAt, reversedAmount | UNIQUE (orderId, providerId, attemptNo) |
| `ProviderTransaction` | orderId, reservationId?, refundLegId?, providerId, type, amount, status, providerReference, attempts, nextAttemptAt, lastError | UNIQUE id doubles as idempotency ref |
| `ProviderCallLog` | providerTransactionId?, providerId, operation, request/response (redacted), httpStatus, latencyMs | — |
| `BankTransaction` | orderId, refundLegId?, type (`Payment|Refund`), gatewayCode, amount, status, gatewayToken, gatewayReference, cardMask, authorizedAt, verifiedAt, isAuthoritative | UNIQUE (gatewayCode, gatewayReference); UNIQUE (orderId) WHERE isAuthoritative |
| `Refund` | orderId, amount, merchantMarginRefund, status, initiatedBy (`Merchant|Admin`), actorId, reason | — |
| `RefundLeg` | refundId, legType (`Cash|Credit`), providerId?, amount, providerMarginRefund, status, payeeIbanEnc? | — |
| `ProviderSettlementPlan` | planNumber, providerPayableMarginBps, installmentCount, maturityRule, status | UNIQUE planNumber; CHECK ranges |
| `MerchantSettlementPlan` | planNumber, merchantReceivableMarginBps, cashSettlementEnabled, cashSettlementBps?, installmentCount, maturityRule, status | CHECK cashSettlementBps IS NULL ⇔ NOT enabled |
| `SettlementDocument` (`PayableDocument` / `ReceivableDocument` via `direction`) | number, direction, counterpartyType (`Merchant|Provider|Consumer`), counterpartyId, orderId?, refundId?, kind (`OrderSettlement|CashSettlement|Refund|Manual`), installmentIndex, installmentCount, amount, maturityDate, status, invoiceId?, reason?, note?, createdBy, approvedBy?, sourceKey | UNIQUE number; UNIQUE sourceKey; CHECK amount > 0 |
| `Invoice` (`PayableInvoice` / `ReceivableInvoice` via `direction`) | number, direction, counterpartyType, counterpartyId, invoiceDate, periodFrom, periodTo, totalAmount, documentCount, dueDate, status, paidAt?, bankReference?, recordedBy? | UNIQUE (direction, counterpartyType, counterpartyId, invoiceDate) |
| `JournalEntry` / `LedgerLine` | eventType, sourceType, sourceId, postedAt, reversesEntryId? / entryId, accountCode, debit, credit | UNIQUE (eventType, sourceId); CHECK exactly one of debit/credit > 0 |
| `ReconciliationItem` | type, severity, orderId?, refs (json), expectedAmount?, actualAmount?, status, assigneeId?, resolutionType?, note?, linkedDocumentId? | — |
| `PspSettlementLine` / `ProviderStatementLine` | source file/date, reference, amount, fee?, matchedTxId? | UNIQUE (source, reference) |
| `AdminUser` | firstName, lastName, phoneE164, roleId, status, passwordHash (argon2id), totpSecretEnc, failedLogins, lockedUntil?, lastLoginAt | UNIQUE phoneE164 |
| `AdminSession` | adminUserId, tokenHash, lastSeenAt, expiresAt, ip, userAgent | — |
| `Role` / `Permission` / `RolePermission` | name / code, description / roleId, permissionCode | UNIQUE name; UNIQUE code |
| `SystemSetting` / `SystemSettingChange` | key, valueJson, updatedBy / key, oldValue, newValue, reason, changedBy | PK key |
| `MessageTemplate` | event, channel, name, content, params[], status, orphaned | UNIQUE (event, channel) WHERE Active |
| `MessageLog` | templateId?, event, recipient, status, provider, providerMessageId, sentAt, deliveredAt, error | — |
| `MerchantWebhookEvent` | merchantId, eventType, payload, status, attempts, nextAttemptAt, lastHttpStatus | — |
| `OutboxMessage` | aggregateType, aggregateId, type, payload, dispatchedAt? | — |
| `IdempotencyRecord` | scope (actor), key, requestHash, status (`InProgress|Done`), responseCode, responseBody, expiresAt (+24 h) | PK (scope, key) |
| `FileObject` | kind (`Icon|Contract|Report`), mime, size, sha256, storageKey, status (`Staged|Committed`), scanStatus | — |
| `AuditLog` | actorId, action, entityType, entityId, before, after, ip, userAgent | — |

### 6.2 Relations

- `Merchant 1—* Order`, `Merchant *—1 MerchantSettlementPlan`, `Merchant 1—* MerchantApiKey`.
- `CreditProvider *—1 ProviderSettlementPlan`, `CreditProvider 1—* CreditReservation`.
- `ConsumerUser 1—* Order`, `ConsumerUser 1—* IdentityLinkage` (≤ 1 Verified).
- `Order 1—* CheckoutSession`, `1—* OtpSession`, `1—* CreditInquiry`, `1—* CreditReservation`, `1—* BankTransaction`, `1—* ProviderTransaction`, `1—* Refund`, `1—* SettlementDocument`, `1—* OrderEvent`.
- `CreditReservation 1—* ProviderTransaction`; `Refund 1—* RefundLeg 1—* (ProviderTransaction | BankTransaction)`.
- `Invoice 1—* SettlementDocument`; `SettlementDocument`/`Invoice`/`Refund`/`Order` → `JournalEntry` via `(sourceType, sourceId)`.
- `AdminUser *—1 Role *—* Permission`.

---

## 7. REST API

**Conventions.** Base `/v1`, JSON, UTF-8. Amounts integer Toman. Lists: `?cursor=&limit=` (≤ 100, default 25) → `{items, nextCursor}`; filters as query params. Errors: `{"error":{"code","message","details","requestId"}}`. **IK** = `Idempotency-Key` header required (≤ 64 chars; replay returns stored response; same key + different body → `422 IDEMPOTENCY_KEY_REUSED`; in flight → `409 IDEMPOTENCY_IN_PROGRESS`). **IM** = `If-Match: <order.version>` required.

**Auth kinds.** `MER` merchant HMAC (§9.1) · `CHK` checkout session cookie (+ OTP-verified where marked ✓) · `ADM:<perm>` admin session + CSRF + permission · `PSP` gateway callback (untrusted; server-side verify) · `PRV` provider webhook HMAC.

### 7.1 Common error codes

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` (`details.fields[]`) |
| 401 | `UNAUTHENTICATED`, `INVALID_SIGNATURE`, `SESSION_EXPIRED`, `OTP_REQUIRED` |
| 403 | `FORBIDDEN`, `MERCHANT_DISABLED` |
| 404 | `NOT_FOUND` |
| 409 | `STATE_CHANGED`, `ORDER_BUSY`, `ORDER_EXPIRED`, `ORDER_CONFLICT`, `ORDER_ALREADY_COMPLETED`, `CREDIT_CHANGED`, `DEADLINE_TOO_CLOSE`, `ALLOCATION_PENDING`, `IDEMPOTENCY_IN_PROGRESS`, `DUPLICATE_ENTITY`, `PLAN_IN_USE`, `LAST_ADMIN_MANAGER`, `SELF_APPROVAL_FORBIDDEN` |
| 410 | `CHECKOUT_TOKEN_EXPIRED` |
| 422 | `IDEMPOTENCY_KEY_REUSED`, `AMOUNT_OUT_OF_RANGE`, `CONSUMER_NOT_ELIGIBLE`, `OTP_INVALID` (`attemptsLeft`), `OTP_EXPIRED`, `OTP_SESSION_SUPERSEDED`, `IDENTITY_MISMATCH` (`attemptsLeft`), `NO_SELECTION`, `INSUFFICIENT_CREDIT`, `REFUND_EXCEEDS_REFUNDABLE`, `AMOUNT_EXCEEDS_ORDER`, `PAYMENT_AMOUNT_MISMATCH`, `PLAN_ARCHIVED`, `FILE_NOT_STAGED` |
| 423 | `OTP_LOCKED`, `IDENTITY_LOCKED`, `ACCOUNT_LOCKED` |
| 429 | `RATE_LIMITED`, `OTP_RESEND_COOLDOWN` (`retryAfter`), `OTP_RESEND_LIMIT`, `INQUIRY_LIMIT` |
| 502 | `PROVIDER_ERROR`, `GATEWAY_ERROR` |
| 503 | `SMS_UNAVAILABLE`, `IDENTITY_SERVICE_UNAVAILABLE`, `SERVICE_UNAVAILABLE` |

### 7.2 Merchant API

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/merchant/availability?amount=` | MER | — | `200 {available, degraded, reason?, minAmount, maxAmount}` | 401 |
| POST | `/merchant/checkouts` | MER, IK | `{orderNumber, amount, phoneNumber, returnUrl, callbackUrl?, metadata?}` | `201`/`200 {orderId, checkoutUrl, status, expiresAt}` | 400, 403 `MERCHANT_DISABLED`, 409 `ORDER_CONFLICT`/`ORDER_ALREADY_COMPLETED`, 422 |
| GET | `/merchant/orders/{orderId}` · `/merchant/orders?orderNumber=` | MER | — | `200 {orderId, orderNumber, status, failureReason?, totalAmount, cashAmount, creditAmount, allocationStatus, refundStatus, refundedAmount, completedAt}` | 404 |
| POST | `/merchant/orders/{orderId}/refunds` | MER, IK | `{amount, reason}` | `202 {refundId, status}` | 409 `STATE_CHANGED`/`ALLOCATION_PENDING`, 422 `REFUND_EXCEEDS_REFUNDABLE` |
| GET | `/merchant/refunds/{refundId}` | MER | — | `200 {refundId, orderId, amount, status}` | 404 |
| POST | *(outbound)* `{merchant.webhookUrl}` | Signed by Bâjet | `{id, type, createdAt, data:{orderId, orderNumber, status, amounts…}}` | Merchant returns 2xx | Non-2xx/timeout (10 s) → retry |

### 7.3 Checkout API (consumer)

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/checkout/sessions` | token | `{checkoutToken}` | `200 {order}` + `Set-Cookie` | 404, 410 |
| GET | `/checkout/order` | CHK | — | `200 {orderId, status, version, merchantDisplayName, totalAmount, maskedPhone, sessionExpiresAt, paymentDeadlineAt, otpVerified, step}` | 401 |
| POST | `/checkout/terms` | CHK, IM | `{termsVersion, accepted:true}` | `200 {order}` | 400, 409 |
| POST | `/checkout/otp` | CHK | `{}` (send or resend) | `201 {otpSessionId, expiresAt, resendAvailableAt}` | 409, 429, 503 |
| POST | `/checkout/otp/verify` | CHK, IM | `{otpSessionId, code}` | `200 {order}` | 422, 423 `OTP_LOCKED` |
| POST | `/checkout/identity/national-id` | CHK✓, IM | `{nationalId}` | `200 {next:"dob"}` | 400, 422 `IDENTITY_MISMATCH`, 423, 503 |
| POST | `/checkout/identity/dob` | CHK✓, IM | `{dateOfBirth:"YYYY-MM-DD"}` | `200 {order}` | 400, 422, 423, 503 |
| GET | `/checkout/credit` | CHK✓ | — | `200 {inquiryStatus, providers:[{providerId, displayName, iconUrl, availableAmount, selectable, outcome}], cashPaymentBps, allowCashOnly, inquiryAttemptsLeft}` | 401 |
| POST | `/checkout/credit/inquiries` | CHK✓, IM | `{}` | `202 {order}` | 409, 429 `INQUIRY_LIMIT` |
| POST | `/checkout/quote` | CHK✓ | `{providerIds[], cashOnly}` | `200 {cashAmount, creditAmount, allocations:[{providerId, amount}], quoteHash}` | 422 `NO_SELECTION`/`INSUFFICIENT_CREDIT` |
| POST | `/checkout/confirm` | CHK✓, IK, IM | `{providerIds[], cashOnly, quoteHash}` | `202 {order, next:{type:"redirect", url, method, fields} | {type:"poll"}}` | 409 `CREDIT_CHANGED` (+ `quote`), `STATE_CHANGED`, `ORDER_EXPIRED` |
| POST | `/checkout/bank-payments` | CHK✓, IK, IM | `{}` | `201 {redirect:{url, method, fields}}` | 409 `DEADLINE_TOO_CLOSE`/`ORDER_EXPIRED`, 502 |
| POST | `/checkout/cancel` | CHK, IK, IM | `{}` | `200 {status:"Cancelled"|"CancellationRequested"}` | 409 `ORDER_BUSY` |
| GET | `/checkout/result` | CHK✓ | — | `200 {status, cashAmount, allocations[], bankReference, returnUrl}` | 409 (not terminal) |

### 7.4 Callbacks and inbound webhooks

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST/GET | `/callbacks/bank/{gatewayCode}` | PSP | Gateway-specific | Always `302 → /c/{token}/return` | Unknown reference → `302` to generic error page + alert |
| POST | `/webhooks/providers/{providerId}` | PRV | `{eventId, type, reference, status, amount?}` | `200` (duplicates too) | 401 bad signature/timestamp |

### 7.5 Admin API (prefix `/admin`)

| Method | Path | Auth | Request → Response | Errors |
|---|---|---|---|---|
| POST | `/auth/login` | — | `{phone, password}` → `200 {mfaToken}` | 401, 423 |
| POST | `/auth/mfa` | mfaToken | `{mfaToken, totp}` → `200` + cookie | 401, 423 |
| POST | `/auth/logout` | ADM | → `204` | — |
| POST | `/auth/invitations/accept` | invite token | `{token, password}` → `200 {totpProvisioningUri}`; then `POST /auth/totp/confirm {totp}` | 400, 410 |
| POST | `/auth/password-reset/request` · `/confirm` | — / reset token | `{phone}` → `202` · `{token, newPassword, totp}` → `204` | 400, 410 |
| GET | `/me` | ADM | → `{admin, permissions[]}` | 401 |
| POST | `/files` | ADM:any manage | multipart → `201 {fileId}` | 400 type/size, 422 scan failed |
| GET, POST | `/providers` | `providers.read`, `providers.manage` + IK | list · create body = FR-090 fields → `201` | 400, 409 `DUPLICATE_ENTITY`, 422 `PLAN_ARCHIVED`/`FILE_NOT_STAGED` |
| GET, PATCH | `/providers/{id}` | `providers.read`, `providers.manage` + `If-Match` | detail (+ invoice summaries) · partial update | 404, 409 |
| GET, POST | `/merchants` · GET, PATCH `/merchants/{id}` | `merchants.read`, `merchants.manage` | as providers | as providers |
| POST, DELETE | `/merchants/{id}/api-keys` · `/{keyId}` | `merchants.credentials` | → `201 {keyId, secret}` (once) · `204` | 409 (2 active) |
| GET | `/consumers`, `/consumers/{id}` | `consumers.read` (PII unmasked with `consumers.pii`) | list/detail | 404 |
| PATCH | `/consumers/{id}/status` | `consumers.block` | `{status:"Active"|"Blocked", reason}` | 409 |
| GET | `/orders`, `/orders/{id}` | `orders.read` | list/detail (events, reservations, transactions, documents, refunds) | 404 |
| POST | `/orders/{id}/refunds` | `refunds.create`, IK | `{amount, reason}` → `202` | as merchant refunds |
| GET | `/refunds`, `/refunds/{id}` | `orders.read` | list/detail | 404 |
| PATCH | `/refund-legs/{id}/payee` | `refunds.create` | `{iban}` → `200` | 400 |
| GET | `/bank-transactions`, `/{id}` · `/provider-transactions?stuck=` | `transactions.read` | list/detail | 404 |
| GET, POST | `/documents?direction=` | `documents.read`, `documents.manual` + IK | list · `{direction, counterpartyType, counterpartyId, amount, maturityDate, orderId?, reason, note}` → `201` | 400, 422 `AMOUNT_EXCEEDS_ORDER` |
| POST | `/documents/{id}/approve` · `/reject` · `/cancel` | `documents.approve` · `documents.approve` · `documents.manual` | `{note}` → `200` | 409 `SELF_APPROVAL_FORBIDDEN`/`STATE_CHANGED` |
| GET | `/invoices?direction=`, `/invoices/{id}` | `invoices.read` | list/detail with documents | 404 |
| POST | `/invoices/{id}/mark-sent` · `/invoices/{id}/payments` | `invoices.settle` (+ IK for payments) | `{}` · `{amount, paidAt, bankReference}` → `200` | 409, 422 `PAYMENT_AMOUNT_MISMATCH` |
| GET, POST | `/provider-settlement-plans`, `/merchant-settlement-plans` | `plans.read`, `plans.manage` | list · create → `201` | 400 |
| PATCH, POST | `/…-settlement-plans/{id}` · `/{id}/archive` | `plans.manage` | update · archive | 409 `STATE_CHANGED` |
| GET, PATCH | `/settings` · `/settings/{key}` | `settings.read`, `settings.manage` + step-up | `{value, reason}` → `200` | 400, 401 step-up required |
| GET | `/settings/{key}/history` | `settings.read` | list of changes | — |
| GET, POST, PATCH | `/admins`, `/admins/{id}` | `admins.manage` | CRUD, `{roleId, status}` | 409 `DUPLICATE_ENTITY`/`LAST_ADMIN_MANAGER` |
| POST | `/admins/{id}/resend-invitation` · `/reset-mfa` | `admins.manage` · SuperAdmin | → `202` | 409 |
| GET, POST, PATCH | `/roles`, `/roles/{id}`; PUT `/roles/{id}/permissions`; GET `/permissions` | `roles.manage` | `{permissionCodes[]}` | 409 `LAST_ADMIN_MANAGER` |
| GET, PATCH | `/reconciliation-items`, `/{id}` | `reconciliation.read`, `reconciliation.resolve` | `{status, assigneeId, resolutionType, note, linkedDocumentId?}` | 400, 409 |
| POST | `/reconciliation-items/{id}/redrive` · `/reconciliation/psp-reports` | `reconciliation.resolve` | `{}` · multipart CSV | 409, 400 |
| GET, POST, PATCH | `/message-templates`, `/{id}` · GET `/message-logs` | `messages.manage` · `messages.read` | template fields | 400 missing params |
| POST | `/merchant-webhook-events/{id}/redeliver` | `merchants.manage` | → `202` | 409 |
| GET | `/audit-logs` | `audit.read` | filters: actor, entity, date | — |
| POST, GET | `/exports`, `/exports/{id}` | `exports.create` | `{resource, filters}` → `202 {exportId}` · `{status, downloadUrl}` | 400 |

---
## 8. Frontend

Global: fa-IR, RTL, Jalali dates, Persian digits displayed / ASCII digits accepted, Toman with thousands separators. The server's `order.status` decides the route (single source of truth); every consumer screen refetches on focus and on `409 STATE_CHANGED`.

### 8.1 Checkout button (merchant page)

The merchant backend calls availability (FR-001) while rendering checkout; the browser never holds merchant secrets.

| State | Behaviour |
|---|---|
| Loading | Placeholder; if availability not answered in 2 s → treat as Unavailable |
| Available | Enabled "Pay with Bâjet combined credit" |
| Degraded (P2) | Enabled + banner "Credit checks may take longer right now." |
| Unavailable / error | Hidden, or disabled with "Combined-Credit payment is temporarily unavailable"; other methods unaffected |
| Click | Merchant backend `POST /checkouts` → browser redirect to `checkoutUrl`; on API error, show the unavailable text |

### 8.2 Consumer checkout app (`/c/:token/…`)

No standalone consumer area exists (non-goal); this app is the whole consumer surface. Countdown to `paymentDeadlineAt` is visible from confirm onwards.

| Route | Screen | Loading | Empty | Error |
|---|---|---|---|---|
| `/c/:token` | Landing: merchant, amount, masked phone, terms link + checkbox, Continue | Full-page skeleton | — | Invalid/unknown token: "This payment request is invalid. Please return to the store and try again." · `410`: expired screen |
| `/otp` | 5-digit input (`autocomplete=one-time-code`), TTL countdown, Resend (cooldown timer) | Button spinner on verify | — | Wrong code (attempts left) · expired · SMS failed ("We couldn't send your code. Tap to try again.") · locked → `/failed` |
| `/identity` | Step 1 national ID; step 2 DOB (Jalali picker) | Button spinner | — | Checksum inline · mismatch (attempts left) · service down + Retry · locked → `/failed` |
| `/credit` | Provider cards (logo, name, full balance, checkbox; zero = disabled), Select All, live breakdown (cash, per-provider credit, total), "Pay fully by bank card", Continue | Per-provider spinners, "Checking your credit with N providers…" (≤ 8 s) | No credit: "No available credit found." + cash-only + "Try again" | Partial: unreachable notice per provider · all failed: "We couldn't retrieve your credit information. You can pay by bank card, or try again." · insufficient: inline error on Continue |
| `/processing` | "Reserving your credit…" | Poll `GET /order` every 2 s | — | `CREDIT_CHANGED` → back to `/credit` with notice · reservation failed → `/credit` with "We couldn't reserve your credit. Please try again." |
| *(bank gateway)* | External | — | — | — |
| `/return` | "Confirming your payment…" | Poll every 2 s; after 30 s show "Still confirming — don't pay again." | — | Routes to result, payment-failed, expired, or late-payment |
| `/payment-failed` | Retry Payment / Cancel, countdown | Button spinner | — | `DEADLINE_TOO_CLOSE` / expired → `/expired` |
| `/result` | Success: providers + amounts, cash, total, references, "Return to Merchant" | Skeleton | — | — |
| `/cancelled`, `/expired`, `/failed`, `/late-payment` | Terminal copy per reason + "Return to store" (if `returnUrl` known) | — | — | — |

Session handling: missing/expired cookie → silently re-exchange token; if OTP was verified in another session → `/otp` again (FR-010). Network error → toast + Retry; mutations are IK-protected, so retry is safe.

### 8.3 Admin app (`/admin/…`)

| Area | Routes |
|---|---|
| Auth | `/login`, `/login/mfa`, `/invite/:token`, `/reset-password`, `/no-access` |
| Partners | `/providers`, `/providers/new`, `/providers/:id` · `/merchants`, `/merchants/new`, `/merchants/:id` |
| Customers | `/consumers`, `/consumers/:id` |
| Operations | `/orders`, `/orders/:id`, `/refunds`, `/refunds/:id`, `/bank-transactions`, `/bank-transactions/:id`, `/provider-transactions`, `/reconciliation`, `/reconciliation/:id` |
| Finance | `/documents/payable`, `/documents/receivable`, `/documents/new`, `/documents/:id`, `/invoices/payable`, `/invoices/receivable`, `/invoices/:id`, `/settlement-plans/provider(/new, /:id)`, `/settlement-plans/merchant(/new, /:id)` |
| Admin | `/admins(/new, /:id)`, `/roles(/:id)` (access management), `/settings`, `/messages/logs`, `/messages/templates(/new, /:id)`, `/audit-log`, `/exports` |

`/admin` redirects to the first permitted section. Routes without permission → 403 page; hidden from menu.

| State | Standard (all screens) |
|---|---|
| Loading | Table/detail skeleton; no layout shift |
| Empty | No data: "No {items} yet" + primary action if permitted · filtered: "No {items} match your filters." + Clear filters |
| Error | "We couldn't load this data. Please try again." + Retry; `404` → not-found state; `403` mid-session → toast, refresh `/me`, rebuild menu |
| Lists | Cursor pagination, filters/sort in URL query, row counts capped at "10,000+" |
| Forms | Inline + server field errors; submit disabled while pending; one IK per form mount; `If-Match` → on `409` "This record changed. Reload to see the latest."; unsaved-changes guard |
| Dangerous actions | Confirm dialog with impact: disable merchant/provider, block consumer, archive plan, change a setting (shows before/after breakdown for a 10,000,000 order), approve document, record payment, refund |
| Session | Idle warning at 28 min; expiry → `/login?next=`; return to same page after login |
| In-progress order detail | Missing values shown as "—", never an error |

---

## 9. Security

### 9.1 Authentication

| Actor | Mechanism |
|---|---|
| Admin | argon2id password (≥ 12 chars, breached-list check) + mandatory TOTP; 5 failures → 15 min lock; server-side session, 256-bit random cookie (`HttpOnly; Secure; SameSite=Strict`), rotated on login; idle 30 min, absolute 12 h; CSRF token header on mutations; step-up TOTP (≤ 5 min old) for `settings.manage`, `roles.manage`, `admins.manage`, `merchants.credentials`, `invoices.settle`. |
| Merchant | Headers `X-Bajet-Key-Id`, `X-Bajet-Timestamp`, `X-Bajet-Signature = hex(HMAC-SHA256(secret, ts + "\n" + method + "\n" + path + "\n" + hex(SHA-256(body))))`; `|now − ts| ≤ 300 s`; TLS 1.2+; optional IP allowlist; secrets stored encrypted (KMS), shown once, rotatable with 2 active keys. |
| Consumer | `checkoutToken` 128-bit random, stored hashed, valid until order terminal + 24 h; exchanged for `HttpOnly; Secure; SameSite=Lax` cookie bound to order; OTP verification bound to that session; no identity or credit data before OTP. |
| Provider / PSP | Outbound: per-provider credentials from secret store, mTLS where supported. Inbound provider webhooks: HMAC (same scheme) + `eventId` dedupe. PSP callbacks: untrusted input, outcome only from server-side verify/inquiry. |

### 9.2 Permissions matrix

| Permission | SuperAdmin | Operations | Finance | Support | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `providers.read` / `merchants.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `providers.manage` / `merchants.manage` | ✓ | ✓ | | | |
| `merchants.credentials` | ✓ | ✓ | | | |
| `consumers.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `consumers.pii` (unmasked national ID, DOB, phone) | ✓ | ✓ | | ✓ | |
| `consumers.block` | ✓ | ✓ | | | |
| `orders.read` / `transactions.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `refunds.create` | ✓ | ✓ | ✓ | | |
| `documents.read` / `invoices.read` / `plans.read` | ✓ | ✓ | ✓ | | ✓ |
| `documents.manual` / `documents.approve` | ✓ | | ✓ | | |
| `invoices.settle` | ✓ | | ✓ | | |
| `plans.manage` | ✓ | | ✓ | | |
| `settings.read` | ✓ | ✓ | ✓ | | ✓ |
| `settings.manage` | ✓ | | | | |
| `reconciliation.read` | ✓ | ✓ | ✓ | ✓ | |
| `reconciliation.resolve` | ✓ | ✓ | ✓ | | |
| `messages.read` | ✓ | ✓ | | ✓ | ✓ |
| `messages.manage` | ✓ | ✓ | | | |
| `admins.manage` / `roles.manage` | ✓ | | | | |
| `audit.read` | ✓ | | ✓ | | |
| `exports.create` | ✓ | ✓ | ✓ | | |

Default roles are editable except SuperAdmin (always all permissions). Checks run per request on the server; the UI only hides.

### 9.3 Validation

| Field | Rule |
|---|---|
| Phone | Normalise Persian digits, `+98`/`0098`/`0` prefixes → E.164; must match `^\+989\d{9}$` |
| Personal national code (consumer, individual merchant, manager) | 10 digits, standard Iranian checksum, not all-same-digit |
| Legal-entity national ID (legal merchant, provider) | 11 digits, legal-entity checksum |
| Economic ID | Digits, 11–12 length; required for `Legal`, optional for `Individual` |
| IBAN | `^IR\d{24}$`, ISO 13616 mod-97 |
| Amount | Integer, `minOrderAmount ≤ x ≤ maxOrderAmount` (orders); `> 0` elsewhere |
| Bps / installments | Integer 0–10000 (cash settlement 100–10000) / integer 1–6 |
| `orderNumber` | `^[A-Za-z0-9_-]{1,64}$` |
| URLs | `https`, ≤ 2048 chars; `returnUrl` host ∈ `returnUrlDomains` |
| OTP / DOB | `^\d{5}$` / valid date, 1900-01-01 ≤ DOB ≤ today |
| Text | Trim, Unicode NFC, Arabic ي/ك → Persian ی/ک, max lengths (names 100, addresses 500) |
| Files | Icon PNG/JPEG/WebP ≤ 512 KB (no SVG); contract PDF ≤ 10 MB; MIME sniffed; AV scan before commit; served from an isolated domain with `Content-Disposition: attachment` |

### 9.4 Webhooks and callbacks

- Inbound (provider): verify HMAC with constant-time compare, reject `|now − ts| > 300 s`, dedupe on `eventId` (unique), persist, respond 2xx, process asynchronously; processing is idempotent via state CAS.
- Inbound (PSP): look up by our reference only; ignore amounts/status in the payload for decisions; verify/inquiry server-to-server; duplicate callbacks are no-ops.
- Outbound (merchant): signed like merchant requests (`X-Bajet-Event-Id`, `X-Bajet-Timestamp`, `X-Bajet-Signature`); same `eventId` on retries; merchant must dedupe.

### 9.5 Data protection

- National ID and DOB: AES-256-GCM envelope encryption (KMS); lookups via `nationalIdHash = HMAC-SHA256(pepper, nationalId)`.
- Masking by default in UI, exports, and logs; never log OTP codes, secrets, full PAN, national ID, DOB.
- Checkout: strict CSP, no third-party scripts, `X-Frame-Options: DENY`, HSTS.
- Rate limits: checkout creation 50 req/s per merchant; OTP sends 5/h per phone; checkout endpoints 30/min per IP; admin login 10/min per IP.
- Retention: ledger, documents, invoices, audit log 10 years; OTP sessions and provider call logs 90 days.

---

## 10. Edge cases

| # | Scenario | Handling | Ref |
|---|---|---|---|
| **Duplicate submissions** ||||
| E-01 | Consumer double-clicks Confirm / Retry / Cancel | Same IK → replay. Different IK → CAS loses → `409 STATE_CHANGED` → refetch | FR-040, BR-ORD-03 |
| E-02 | Merchant retries checkout after a timeout | IK replay; without IK, `(merchantId, orderNumber)` resume or `409` | FR-002 |
| E-03 | Two tabs each start a bank payment and both pay | First verified success claims the order; the other is reversed | BR-BANK-01/03 |
| E-04 | Duplicate PSP callbacks / provider webhooks | Status check / `eventId` dedupe → no-op | FR-043, §9.4 |
| E-05 | Admin double-submits create/payment/refund | Per-form IK | §8.3 |
| **Retries** ||||
| E-06 | Allocation, release, reversal fail transiently | BR-RETRY-01, same provider ref each attempt | BR-PRV-04 |
| E-07 | Merchant webhook endpoint down | FR-004 schedule; `Exhausted` → alert + manual redeliver | FR-004 |
| E-08 | Document/invoice job crashes midway | Rerun; unique `sourceKey` / invoice key prevent duplicates | FR-130/133 |
| **Timeouts** ||||
| E-09 | Provider inquiry slow | Per-provider timeout; late responses ignored | FR-030 |
| E-10 | Reserve call times out | Status query ×3 → unknown → failed + release | BR-PRV-03 |
| E-11 | Verify call times out | BR-BANK-04; order stays `PaymentVerifying` until resolved | BR-BANK-04 |
| E-12 | Consumer idles at bank past deadline | Expiry job inquiry; unpaid → `Expired`; later success reversed | FR-060/061 |
| E-13 | Timeout job vs consumer action on same order | CAS; exactly one wins | BR-ORD-03 |
| **Partial failures** ||||
| E-14 | k of n reservations succeed | Release the k before responding; re-inquiry | FR-041 |
| E-15 | Cash captured, some allocations unconfirmed | `Completed`, `allocationStatus = Pending`, suspense balance, retries | FR-050 |
| E-16 | All allocations permanently fail after cash captured | `NeedsReconciliation`; ops re-drive; if impossible, Bâjet carries the credit shortfall until resolved via manual documents (merchant still paid) | FR-142 |
| E-17 | Refund: cash leg ok, credit leg fails | Refund `Processing` → retries → `NeedsReconciliation` | FR-071 |
| E-18 | File stored, DB insert fails | File stays `Staged`, purged after 24 h | FR-090 |
| **Third-party downtime** ||||
| E-19 | All providers down | Availability false; mid-flow → zero-credit screen, cash-only offered | FR-001/030 |
| E-20 | Primary gateway down | Next healthy gateway; none → availability false; mid-flow init error → Retry/Cancel | BR-BANK-05 |
| E-21 | SMS provider down | Failover; both down → availability false, `503` on send | FR-012 |
| E-22 | Identity service down | Availability `degraded`; linked consumers unaffected; others see retry at identity step | FR-020 |
| E-23 | Provider down during release | Retries; `stuck` filter; hold expires at provider ≥ 24 h anyway | FR-112 |
| **Expired sessions** ||||
| E-24 | Checkout cookie lost / new device | Token re-exchange; OTP again if already past OTP | FR-010 |
| E-25 | `sessionExpiresAt` passes on OTP or credit screen | `Expired`; next request `409 ORDER_EXPIRED` → `/expired` | FR-060 |
| E-26 | Admin session expires mid-form | Idle warning; after login return to page; unsaved data lost (warned) | FR-080 |
| E-27 | Admin loses a permission mid-session | Next request `403`; menu rebuilt | FR-121 |
| **Refunds / reversals** ||||
| E-28 | Refund exceeds refundable; concurrent refunds | Order row lock; `422` for the excess | FR-070 |
| E-29 | Refund after merchant already paid | Merchant `ReceivableDocument` (clawback) in next invoice run | BR-RFD-03 |
| E-30 | Provider rejects reversal (loan closed) | `NeedsReconciliation`; resolve with manual documents | FR-071 |
| E-31 | Late bank payment on expired/cancelled order | Reverse; consumer message with reference | BR-BANK-03 |
| E-32 | Cash refund, gateway has no refund API, IBAN unknown | Consumer `PayableDocument`; Support enters IBAN before invoicing | FR-071 |
| **Reconciliation mismatches** ||||
| E-33 | PSP report line with no `Success` transaction | `CASH_WITHOUT_ORDER` → reverse or refund | FR-140 |
| E-34 | `Success` absent from PSP report after T+2 | `MISSING_IN_PSP_REPORT` | FR-140 |
| E-35 | Amount differs (PSP or provider) | `AMOUNT_MISMATCH`; manual document on resolution | FR-140/141 |
| E-36 | Provider statement confirms an allocation we hold as pending | Auto-confirm, auto-resolve | FR-141 |
| E-37 | Provider shows a hold we released | Re-send release | FR-141 |
| E-38 | Ledger invariant breach | Nightly check alerts; no auto-fix | BR-LED-09 |
| **Configuration and boundaries** ||||
| E-39 | `cashPaymentBps` or plan changed mid-flow | Order uses its snapshot | BR-CALC-05, BR-SET |
| E-40 | Provider disabled after quote | Reservation still attempted; provider rejection → normal failure path | FR-091 |
| E-41 | Merchant disabled / consumer blocked mid-flow | Order continues (blocked consumer stopped only at OTP) | FR-093, FR-113 |
| E-42 | Credit of 1 Toman across 2 providers | Largest remainder → (1, 0); zero share not reserved | BR-CALC-02 |
| E-43 | Order completed on last day of a Jalali month | First installment matures same day | BR-SET-04 |
| E-44 | Exactly TTL / exactly 5th OTP failure / exactly 15:00 | Expired / locked / expired (fail closed) | FR-013, FR-060 |

---

## 11. Decisions and assumptions

**Decisions**

| ID | Decision | Why |
|---|---|---|
| D-01 | Merchant-signed server-to-server checkout creation replaces the parameter redirect. | Prevents amount/phone tampering (A-01). |
| D-02 | Canonical unit is integer Toman; Rial only in adapters. | Matches v1; gateways convert exactly (×10). |
| D-03 | Rates stored in basis points. | No floats; 2-decimal precision. |
| D-04 | `Completed` = funding secured; allocation tracked separately. | Resolves A-05/A-06; merchant can fulfil. |
| D-05 | Bank init failure keeps reservations; Retry/Cancel within hold. | Resolves A-07; fewer abandoned checkouts. |
| D-06 | First verified payment wins; others auto-reversed. | Prevents double charge (A-12). |
| D-07 | Late payments are reversed, not manually reconciled. | Consumer money returned without ops work (A-10). |
| D-08 | Cash-only path allowed (`allowCashOnly = true`). | v1 offers it twice; consumer otherwise dead-ends. |
| D-09 | Consumer cannot raise the cash share to cover a shortfall. | Kept v1 default. |
| D-10 | Reservation failure returns to selection (max 3), not terminal. | v1 says "try again". |
| D-11 | Supplier split by largest remainder, deterministic ties. | Exact sum, no over-allocation. |
| D-12 | Provider is the balance authority; Bâjet adds a per-(consumer, provider) lock, keeps no shadow balances. | Avoids a second source of truth. |
| D-13 | Settlement terms snapshotted at completion; plans editable. | Resolves A-22. |
| D-14 | Provider margin = discount Bâjet gives the provider on the amount the provider remits; merchant margin = Bâjet's commission. | Only reading consistent with v1 "Payable/Receivable" naming and revenue goal. |
| D-15 | Merchant cash settlement = share of merchant net paid D+1; rest in installments. | Only reading consistent with v1 field set. |
| D-16 | First installment matures at end of the Jalali month of completion. | Simplest reading of "end of Jalali month". |
| D-17 | One table each for documents and invoices, discriminated by `direction`. | Same shape and lifecycle; v1 names preserved as logical entities. |
| D-18 | Gross settlement; no netting; payments recorded manually in full. | Scope control. |
| D-19 | Double-entry append-only ledger with allocation-suspense account. | Required by rules; unconfirmed allocations visible. |
| D-20 | Automatic documents never cancelled; corrected by offsetting manual documents. | Keeps documents consistent with ledger. |
| D-21 | Refunds split cumulative pro-rata; margins refunded pro-rata. | Full refund returns exactly the originals; merchant repays only what it received. |
| D-22 | Refunds blocked while allocation is unconfirmed. | Provider reversal needs a confirmed draw. |
| D-23 | Admin auth = password + mandatory TOTP; invitations by SMS. | Money system; admins have no email. |
| D-24 | Audit log and login/navigation are P0. | Money system; v1 priority conflict. |
| D-25 | Four-eyes on manual documents above 50,000,000 Toman. | Fraud control. |
| D-26 | `ConsumerUser.Inactive` = never OTP-verified. | Gives the v1 state a meaning. |
| D-27 | Invoicing runs daily; due in 3 days. | Supports D+1 merchant cash settlement and month-end installments. |
| D-28 | OTP verification bound to the browser session. | Leaked checkout link ≠ access (A-50). |

**Assumptions (confirm with the named owner)**

| ID | Assumption | Owner |
|---|---|---|
| S-01 | Every provider can meet BR-PRV-04 (idempotent API, 24 h hold, status and statement APIs, releasing unknown refs is safe). | Partnerships |
| S-02 | Gateways offer verify + inquiry; unverified payments auto-reverse within the PSP window; reverse/refund APIs availability is per gateway. | Payments |
| S-03 | An identity service provides phone↔national-ID match and national-ID↔DOB match returning first/last name. | Compliance |
| S-04 | Default values: `cashPaymentBps` 2500, `minOrderAmount` 100,000, `maxOrderAmount` 1,000,000,000 Toman. | Product |
| S-05 | Economic ID length 11–12 digits. | Finance |
| S-06 | Retention 10 years for financial records and audit log. | Legal/Finance |
| S-07 | Merchant and provider API/webhook traffic uses HTTPS on the public internet. | Engineering |
| S-08 | Consumer-facing copy in this document is English source text; Persian copy produced during delivery. | Product |
| S-09 | Bâjet absorbs any loss from a captured order whose allocation can never be confirmed (E-16). | Finance/Risk |
