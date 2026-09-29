# Architecture

Bâjet is a **modular monolith**: one NestJS process, one PostgreSQL database, and one React single-page app served by nginx. There are no microservices, message brokers or distributed components. External services (credit providers, bank gateway, SMS, identity verification) sit behind interfaces with offline mock implementations.

```
 browser ──► nginx (web container, :8080)
               ├── /            React SPA  (consumer checkout /c/*, admin panel /admin/*)
               └── /v1/*  ───►  NestJS API (api container, :3000) ──► PostgreSQL 16 (db)
                                   │  in-process jobs (@nestjs/schedule)
                                   └─ adapters: credit providers · bank gateway · SMS · identity · storage (mocks)
 merchant server ──► /v1/merchant/*  (HMAC-signed)          ◄── webhooks (signed, retried)
```

## Repository layout

```
apps/api/src
  main.ts, bootstrap.ts   HTTP setup: /v1 prefix, helmet, validation pipe, error filter, Swagger (/v1/docs)
  app.module.ts           imports every module
  config/                 env-only configuration (supports <NAME>_FILE secrets)
  database/               TypeORM options, versioned migrations, seeds, CLI (migrate, seed, bootstrap, totp, demo-checkout)
  shared/                 errors, auth context and guards, idempotency, pagination, crypto/TOTP, ids, rate limiter, jobs gate
  modules/<domain>/       controller(s), service(s), entities, DTOs, *.spec / *.e2e-spec tests
apps/web/src
  app/                    router and providers
  features/consumer/      checkout entry, OTP, identity
  features/checkout/      checkout shell and state, credit selection, bank payment, result
  features/admin/         admin panel: auth, layout/nav, operations, partners, customers, finance, administration
  shared/                 API client, formatting (Jalali, Toman, Persian digits), i18n (fa), UI kit
  styles/                 Bon design tokens (light/dark), base and component CSS
packages/contracts        the only place API types live: DTOs, enums, error codes, permissions, settings, money/Jalali helpers
```

## Modules

Each module owns its tables. Other modules reach that data only through the owning module's exported service.

| Module | Owns | Notes |
|---|---|---|
| `system-settings` | settings, setting changes | Typed, range-checked keys; changes need a reason and step-up |
| `audit` | audit log | A global interceptor records every admin mutation with before/after |
| `notifications` | message templates, message log | SMS through primary/secondary providers; built-in fallback templates |
| `admins` | admin users, roles, permissions | Last-manager guard; invitations |
| `auth` | admin sessions, action tokens | Password + TOTP, CSRF, idle/absolute timeouts, step-up |
| `files` | file objects | Upload with malware scan; served with sandbox headers |
| `accounting` | journal entries, ledger lines | Append-only double entry; nightly invariant check |
| `settlements` | plans, documents, invoices, number sequences | Snapshot at completion; maturity and invoice jobs |
| `merchants` | merchants, API keys, webhook events | HMAC auth, key rotation, webhook outbox |
| `credit-providers` | providers, provider call log | Adapter registry and health job |
| `consumers` | consumers, identity linkage and attempts | Phone↔ID linkage, limits, cooldowns |
| `wallet` | credit inquiries, reservations, provider transactions | The consumer's credit lines: inquire, reserve, allocate, release |
| `payments` | bank gateways, bank transactions, call log | Gateway adapters, verify/reverse, retry job, mock gateway page |
| `orders` | orders, order events | State machine with compare-and-swap transitions |
| `checkout` | checkout and OTP sessions | Merchant API, consumer flow, expiry and recovery jobs |
| `refunds` | refunds, refund legs | Pro-rata split across cash and providers |
| `reconciliation` | reconciliation items, PSP and provider statement lines | Daily matching, queue, re-drive |
| `transactions` | none (reads only) | Admin views over bank and provider transactions |
| `exports` | export jobs | Async CSV, fed by per-module sources |

Dependencies point one way, roughly in the order `app.module.ts` imports the modules. When a lower module must be notified by a higher one (for example, reconciliation re-driving a payment), the higher module registers a callback at startup (`registerHooks`, `registerRedrive`, `register`) instead of importing it back.

## Key mechanisms

**Order state machine.** `orders/order-state.ts` lists the allowed transitions. `OrdersService.transition` locks the row, checks status and version, increments the version and writes an `order_event`, all in one transaction. Clients send `If-Match: <version>`; a stale version gets `409 STATE_CHANGED`, and the UI refetches and follows the server's `step`.

**Money and rounding.** Amounts are integer Toman (`bigint`). Rates are basis points. `contracts/money.ts` holds the half-up bps math, cash/credit split, largest-remainder allocation across providers, installment split and cumulative pro-rata refunds. The API and web app use the same code.

**Idempotency.** Payment and money endpoints are marked `@Idempotent()`. A global interceptor stores `(scope, key, request hash) → response` in `idempotency_record`. A replay returns the stored response. A different body with the same key returns `422 IDEMPOTENCY_KEY_REUSED`, and a concurrent duplicate returns `409 IDEMPOTENCY_IN_PROGRESS`.

**Transactions and the outbox.** Balance and status changes run in one DB transaction (`inTransaction`/`Uow`). Side effects (provider calls, webhooks, SMS) are recorded as rows in that transaction and dispatched after commit (`Uow.after`). Interval jobs retry whatever is still pending.

**Ledger.** `journal_entry` and `ledger_line` are append-only (trigger-enforced), with a CHECK that each entry balances. Corrections are reversing entries. A nightly job checks the trial balance plus invariants registered by other modules.

**Authentication.** One global guard reads route metadata:
- `@AdminAuth(...permissions)`: session cookie + CSRF header, permission check, and step-up TOTP for sensitive permissions.
- `@MerchantAuth()`: `X-Bajet-Key-Id`, `X-Bajet-Timestamp` and `X-Bajet-Signature`, an HMAC-SHA256 over `timestamp\nmethod\npath?query\nsha256(body)`, with a 5-minute clock window.
- `@CheckoutAuth()`: the checkout session cookie issued when the checkout URL token is exchanged. `@CheckoutAuth(true)` also requires a verified OTP.

**Background jobs.** `@Interval`/`@Cron` in each module, wrapped by `JobsGate`, which honours `JOBS_ENABLED`, prevents overlapping runs and logs failures. Cron times use `Asia/Tehran`: document maturity 00:05, invoices 01:00, ledger check 02:30, reconciliation 03:00. Deadlines are compared against DB `now()`.

**External services.** Each has an interface and a mock, selected by `MOCK_INTEGRATIONS`: `ProviderAdapter`, `GatewayAdapter`, `SmsProvider`, `IdentityVerifier`, `MalwareScanner`, `FileStorage` and `KeyWrapper`. The mocks are deterministic, so the whole system runs offline.

**Errors.** Every error response is `{ error: { code, message, details, requestId } }`. Codes come from `contracts/errors.ts` with fixed HTTP statuses. The web app turns codes and field errors into Persian messages (`shared/i18n/fa.ts`).

**API documentation.** Swagger is generated from controllers and DTOs by the Nest CLI plugin: `/v1/docs` (UI) and `/v1/docs/openapi.json`.

## Frontend

- React 19, React Router 7 and TanStack Query. Persian RTL, mobile-first (412 px reference), Bon design tokens with light and dark themes.
- **Consumer checkout** (`/c/:token/*`): the server's `step` decides the route. Every screen refetches on focus and on `409`. Countdowns are corrected for clock skew using `serverTime`.
- **Admin panel** (`/admin/*`): `SessionProvider` loads `/admin/me` (permissions and CSRF token). API interceptors send an expired session to `/admin/login?next=…`, open the TOTP step-up dialog and retry the request, and refresh the menu on `403`. Routes are wrapped in `Guard` with the same permission as the menu item. The UI only hides what the server enforces anyway.
- The admin bundle is lazy-loaded, so the consumer checkout stays small.

## Deployment (Docker Compose)

| Service | Image | Role |
|---|---|---|
| `secrets` | `bajet-api` | Runs once and generates random secrets into the `secrets` volume |
| `db` | `postgres:16-alpine` | Reads its password from the secrets volume; data in `pgdata` |
| `api` | `bajet-api` | On start: migrate → seed (idempotent) → serve; health check `/v1/health` |
| `web` | `bajet-web` (nginx) | Serves the SPA and proxies `/v1` to `api`; CSP, HSTS and frame-deny headers |

Every setting comes from environment variables (see `.env.example`), and any of them can be given as `<NAME>_FILE`.

## Testing

- `packages/contracts`: `node --test` rules tests for money, Jalali dates and validators.
- `apps/api`: Jest. Unit specs, plus e2e specs that boot the whole app against a real PostgreSQL test database (`bajet_test`, recreated per suite) and drive complete flows (checkout, payments, refunds, settlements, reconciliation) through HTTP with mock adapters.
- `apps/web`: Vitest unit tests (formatting, navigation).
