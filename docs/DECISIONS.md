# Decisions and assumptions

This file records every assumption made while building `docs/PRD.md` without asking questions, and the status of every functional requirement. Where the PRD is silent, the choice below applies. Where it is explicit, the PRD wins and this file only notes how it was implemented.

## 1. Functional requirement coverage

Every FR in the PRD is implemented. None is skipped. "Tests" names the spec that covers the acceptance criteria (paths under `apps/api/src/modules/`).

| FR | Title | Status | Where / tests |
|---|---|---|---|
| FR-001 | Availability check | Implemented | `checkout/merchant-checkout.service.ts` · `checkout/checkout.e2e-spec.ts` |
| FR-002 | Create checkout | Implemented (HMAC, idempotency, return-domain allow-list) | `checkout/merchant-checkout.service.ts`, `merchants/` · `checkout.e2e-spec.ts` |
| FR-003 | Order status for merchant | Implemented | `checkout/checkout.controller.ts` (`/merchant/...`) |
| FR-004 | Merchant webhooks | Implemented (outbox rows, signed, retried with back-off, admin redeliver) | `merchants/webhooks.service.ts` · `merchants.e2e-spec.ts` |
| FR-005 | Browser return | Implemented (signed return URL) | `checkout/checkout-view.service.ts` |
| FR-010 | Landing and checkout session | Implemented | `checkout/checkout-session.service.ts`, web `consumer/entry` |
| FR-011 | Terms acceptance | Implemented | `checkout-session.service.ts`, web `consumer/entry` |
| FR-012 | Send / resend OTP | Implemented (primary/secondary SMS failover) | `checkout-session.service.ts`, `notifications/` |
| FR-013 | Verify OTP | Implemented | `checkout-session.service.ts`, web `consumer/otp` |
| FR-020 | Linkage check | Implemented | `consumers/` · `consumers.e2e-spec.ts` |
| FR-021 | National ID step | Implemented | `consumers/`, web `consumer/identity` |
| FR-022 | Date of birth step | Implemented | `consumers/`, web `consumer/identity` |
| FR-023 | Identity limits and concurrency | Implemented | `consumers/` |
| FR-030 | Credit inquiry | Implemented (parallel, per-provider deadline) | `wallet/wallet.service.ts` · `wallet.e2e-spec.ts` |
| FR-031 | Credit display | Implemented | `checkout-view.service.ts`, web `checkout/credit` |
| FR-032 | Quote | Implemented (largest-remainder allocation) | `contracts/src/money.ts`, `checkout-flow.service.ts` |
| FR-033 | Cash-only and 100% cash | Implemented | `checkout-flow.service.ts` |
| FR-040 | Confirm and re-check | Implemented | `checkout-flow.service.ts` |
| FR-041 | Reservation outcome | Implemented | `wallet/`, `checkout-flow.service.ts` |
| FR-042 | Bank payment initiation | Implemented | `payments/`, `checkout-payments.service.ts` |
| FR-043 | Bank callback and verification | Implemented | `payments/` · `payments.e2e-spec.ts` |
| FR-044 | Retry payment | Implemented | `checkout-payments.service.ts` |
| FR-045 | Cancel | Implemented | `checkout-flow.service.ts`, web `checkout/payment/CancelButton.tsx` |
| FR-050 | Allocation | Implemented | `orders/orders.service.ts`, `wallet/` · `orders.e2e-spec.ts` |
| FR-051 | Result page | Implemented | web `checkout/result` |
| FR-052 | Completion postings | Implemented (append-only ledger, balanced entries) | `accounting/`, `settlements/` · `ledger.e2e-spec.ts` |
| FR-060 | Expiry job | Implemented | `checkout/checkout.jobs.ts` |
| FR-061 | Late payment | Implemented (auto-reverse + reconciliation item) | `checkout-payments.service.ts` |
| FR-070 | Create refund | Implemented | `refunds/` · `refunds.e2e-spec.ts` |
| FR-071 | Execute refund legs | Implemented | `refunds/` |
| FR-080 | Login and session | Implemented (password + mandatory TOTP, idle 30 min, absolute 12 h, lockout) | `auth/` · `auth.e2e-spec.ts` |
| FR-081 | Invitation, reset, bootstrap | Implemented (CLI bootstrap `admin:bootstrap`) | `auth/`, `admins/` |
| FR-082 | Navigation | Implemented (permission-filtered menu, 403 page) | web `admin/layout/nav.ts` |
| FR-083 | Audit log | Implemented (global interceptor, append-only table) | `audit/` |
| FR-090 | Credit providers | Implemented | `credit-providers/` |
| FR-091 | Provider status | Implemented (health job) | `credit-providers/provider-gateway.service.ts` |
| FR-092 | Merchants | Implemented | `merchants/` |
| FR-093 | Merchant credentials and disable | Implemented | `merchants/` |
| FR-100 | Settlement plans | Implemented | `settlements/` |
| FR-101 | System settings | Implemented | `system-settings/`, web `admin/administration/SettingsPage.tsx` |
| FR-110 | Orders | Implemented | `orders/`, web `admin/operations` |
| FR-111 | Bank transactions | Implemented | `transactions/` · `transactions.e2e-spec.ts` |
| FR-112 | Provider transactions | Implemented | `transactions/` |
| FR-113 | Consumers | Implemented (PII masked without `consumers.pii`) | `consumers/` |
| FR-114 | Export | Implemented (async CSV job, download via files) | `exports/` |
| FR-120 | Admin users | Implemented (last-manager guard) | `admins/` |
| FR-121 | Roles and permissions | Implemented | `admins/` |
| FR-130 | Automatic documents | Implemented | `settlements/documents.service.ts` |
| FR-131 | Manual documents | Implemented (four-eyes above threshold) | `settlements/` |
| FR-132 | Maturity and cancellation | Implemented | `settlements/documents.service.ts` |
| FR-133 | Invoices | Implemented | `settlements/invoices.service.ts` |
| FR-134 | Invoice payment | Implemented | `settlements/invoices.service.ts` |
| FR-140 | Bank reconciliation | Implemented (PSP CSV upload + daily import hook) | `reconciliation/` · `reconciliation.e2e-spec.ts` |
| FR-141 | Provider reconciliation | Implemented (daily statement pull from the adapter) | `reconciliation/` |
| FR-142 | Reconciliation queue | Implemented (assign, resolve, re-drive, suspense alert) | `reconciliation/` |
| FR-150 | Templates | Implemented (required-param validation, orphan flag) | `notifications/` |
| FR-151 | Message log | Implemented | `notifications/` |

## 2. Structure and architecture

- **D-01 Module names.** The task lists `wallet` among the modules. The PRD has no consumer wallet or stored balance, so `wallet` holds the consumer's *credit lines*: inquiries, reservations, allocations and releases against credit providers.
- **D-02 Extra modules.** The PRD needs a few domains that the task's module list doesn't name. Each one got its own module: `audit` (FR-083), `files` (contracts and logos, with malware scan), `reconciliation` (FR-140–142), `refunds` (FR-070/071) and `exports` (FR-114). Each follows the same rules as the named modules (own tables, reached through exported services).
- **D-03 Web feature split.** `features/consumer/` holds the steps where the consumer identifies themself (landing and terms, OTP, identity). `features/checkout/` holds the payment steps (credit, bank payment, result) plus the shared checkout shell and state. `features/admin/` holds the panel, with one folder per menu group.
- **D-04 No cross-module table access.** Modules call each other's exported services. To avoid circular imports, a module that is called *back* by another exposes a small registration hook instead (for example `PaymentsService.registerHooks`, `ReconciliationService.registerRedrive`, `ExportsService.register`).
- **D-05 Outbox.** There is no message broker, so the outbox is made of domain rows written in the same transaction as the state change: provider transactions, merchant webhook events and message logs. After commit they are dispatched in-process, and interval jobs pick up anything that was not delivered.
- **D-06 Deadlines.** Expiry is enforced lazily on every read and write, plus a 15-second sweep job. There are no per-order delayed jobs, which keeps the process stateless across restarts.
- **D-07 Order state machine.** Every transition is compare-and-swap: row lock, status and version check, `version + 1`, and an `order_event` row. The client sends `If-Match: <version>`, and a mismatch returns `409 STATE_CHANGED`.
- **D-08 Append-only tables.** The `bajet_forbid_mutation()` trigger blocks UPDATE and DELETE on `audit_log`, `system_setting_change`, `journal_entry`, `ledger_line`, `identity_attempt`, `provider_call_log`, `order_event` and `bank_call_log`.
- **D-09 Money.** Money is integer Toman in `bigint` columns, read into JS numbers with a safe-integer check. Rates are in basis points. All rounding helpers live in `packages/contracts/src/money.ts`, so the API and web app compute identical figures.
- **D-10 Jalali calendar.** Implemented in `contracts` (no dependency) and verified against ICU for 3,000 consecutive days.

## 3. Behaviour where the PRD is open

- **D-20 Checkout resume.** The checkout URL carries an encrypted, single-purpose token. Exchanging it sets an HTTP-only session cookie, and reopening the same URL resumes the order at the step the server decides.
- **D-21 OTP resume.** The checkout view includes the live OTP session (`otp`) when the step is `otp`. A reloaded page reuses that code instead of requesting a new one and hitting the resend cooldown.
- **D-22 Identity check endpoint.** `POST /checkout/identity/check` runs the FR-020 linkage check explicitly. The web app calls it on entering the identity step, so a verified phone skips straight to credit.
- **D-23 Rate limiting.** Limits apply to checkout mutations (30 per minute per client IP), OTP sends (5 per hour per phone) and admin login (10 per minute per IP). Read endpoints are not limited.
- **D-24 OTP after verification.** If a request needs a verified OTP and the session isn't verified, it returns `OTP_REQUIRED` and the UI routes back to `/otp`. The order does not fail.
- **D-25 Consumer unblock.** Unblocking returns a consumer to `Active` if they had ever verified an OTP, otherwise to `Inactive`.
- **D-26 Invoice period.** `periodTo` = max(yesterday, latest maturity in the invoice). Documents due today still invoice on today's run, so the period never ends before its own documents.
- **D-27 Refund webhook.** The PRD names no failure event, so `refund.failed` is emitted when a refund ends in `Rejected`, or in `NeedsReconciliation` because one of its legs failed or stayed unresolved.
- **D-28 Webhook signing key.** When a merchant has two active API keys (rotation), webhooks are signed with the newer one.
- **D-29 Providers are legal entities.** Credit providers are licensed institutions, so a provider must be `Legal` (11-digit national ID). Merchants may be `Individual` or `Legal`.
- **D-30 Step-up window.** Actions in `STEP_UP_PERMISSIONS` (settings, credentials, refunds, manual documents, and so on) need a TOTP verified within the last 5 minutes. The TOTP entered at login counts as that verification. After 5 minutes the panel asks for a new code and retries the request automatically.
- **D-31 Setting-change confirmation.** Every setting change shows the before/after breakdown of a 10,000,000 Toman order (§8.3). The breakdown covers acceptance by the min/max limits, the kill switch, and the cash/credit split.
- **D-32 Alerts.** "Raise an alert" (suspense age, ledger invariant, provider down) is a structured `ALERT` log line with a code. The PRD names no paging system, and log shipping is the operator's choice.
- **D-33 Breached-password check.** Passwords are checked against a bundled offline list of common passwords, because the system must run fully offline.
- **D-34 File isolation.** The PRD asks for uploaded files to be served from an isolated domain. Downloads are served from `/v1/admin/files/:id` with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and a `sandbox` CSP, which gives the same protection without a second domain in the demo setup.
- **D-35 Webhook retry schedule.** Retries run at 1, 5, 15, 60, 180, 360, 720 and 1440 minutes, then the event becomes `Exhausted`. An admin can redeliver it by hand.

## 4. External services and demo mode

- **D-40 Every integration is an interface with a mock.** SMS (`MockSmsProvider`: primary and secondary, with an in-memory inbox), identity (`MockIdentityVerifier`: any valid national code matches, and a birth date before 1920-01-01 (11 Dey 1298) is a mismatch), credit providers (`MockProviderAdapter`: deterministic balances per national code, with failure controls), bank (`MockGatewayAdapter`: a demo payment page with Pay / Fail / Cancel), malware scanning (`MockMalwareScanner`: rejects the EICAR test string), storage (local disk) and key wrapping (local AES-256-GCM envelope keys). `MOCK_INTEGRATIONS=true` selects them. No real adapters are included, because no real provider APIs are specified.
- **D-41 Demo helpers.** With mock integrations enabled, `GET /v1/demo/sms` and `GET /v1/checkout/demo/sms` return recent mock SMS messages, and the checkout shows the code with a "demo environment" banner. These endpoints return 404 when mocks are off.
- **D-42 Demo seed.** `SEED_DEMO_DATA=true` (the default in Compose) seeds settlement plans, two merchants (API key `mk_demo_store`, with its secret generated into the secrets volume) and three credit providers already set to `Connected`, so a checkout works right after `docker compose up`.
- **D-43 Merchant button.** §8.1's "pay with Bâjet" button lives on the merchant's site, so it is not built. `npm run demo:checkout` plays the merchant role: it calls the signed merchant API and prints the checkout URL.

## 5. Operations

- **D-50 Secrets.** No secrets are committed. On first start, the `secrets` service generates the DB password, data-encryption key, hash pepper, bootstrap admin password and TOTP secret, and the demo merchant secret into a named volume. Services read them through `<NAME>_FILE` variables.
- **D-51 Migrations and seeds on start.** The API container runs `migrate`, then `seed` (idempotent), then the server. The first SuperAdmin is created only by the CLI bootstrap run inside that seed step, never through an API.
- **D-52 Single process.** Jobs run in the API process with `@nestjs/schedule`, and `JobsGate` prevents overlapping runs of a job within that process. Compose runs one API instance. Running several replicas would need `JOBS_ENABLED=false` on all but one of them. Jobs lock the rows they change, so a duplicate run is still safe, just wasted work.
- **D-53 Fonts.** The design system names a Persian typeface but ships no font files, so the web app uses a font stack: IRANYekanX, then Vazirmatn when installed, otherwise Tahoma / system sans-serif.
- **D-54 Docker base images.** Pinned to `node:22-bookworm-slim`, `postgres:16-alpine` and `nginx:1.27-alpine`.
- **D-B01 Versions.** TypeScript 5.9, NestJS 11, TypeORM 0.3, React 19, Vite 7 (the latest majors with stable peer support).
