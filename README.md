# Bâjet — combined-credit payment platform

A consumer pays one merchant order with credit from one or more credit providers plus a cash (bank-card) share, in a single checkout. Operations and finance teams run providers, merchants, settlements, reconciliation and refunds from an admin panel.

The product specification is [`docs/PRD.md`](docs/PRD.md). See also [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how it is built) and [`docs/DECISIONS.md`](docs/DECISIONS.md) (assumptions, and the status of every FR).

**Stack:** React + TypeScript (Vite) · NestJS + TypeScript · REST · PostgreSQL 16 with TypeORM migrations · Docker Compose · npm workspaces monorepo · modular monolith.

Every external service (credit providers, bank gateway, SMS, identity verification) has a mock implementation, so the whole system runs offline.

## Quick start

```bash
docker compose up --build
```

Then open **http://localhost:8080**. On first start, Compose:

1. generates random secrets into a Docker volume (nothing secret is stored in the repo),
2. starts PostgreSQL,
3. runs the database migrations and seeds (roles, settings, message templates, the first SuperAdmin, and demo plans, merchants and credit providers),
4. starts the API and the web app (nginx serves the SPA and proxies `/v1` to the API).

| URL | What |
|---|---|
| http://localhost:8080/admin | Admin panel |
| http://localhost:8080/v1/docs | Swagger UI (generated from code) |
| http://localhost:8080/v1/health | Health check |

To use another port: `WEB_PORT=9090 docker compose up --build`. To start again from an empty database: `docker compose down -v`.

## Demo walkthrough

### 1. Sign in to the admin panel

```bash
# password of the first SuperAdmin (phone 09120000000)
docker compose exec api cat /run/bajet-secrets/bootstrap_admin_password
# current 6-digit TOTP code (stands in for an authenticator app)
docker compose exec api npm run admin:totp
```

Sign in at `/admin/login` with phone `09120000000`, the password, then the TOTP code. To use a real authenticator app instead, add the secret from `/run/bajet-secrets/bootstrap_admin_totp_secret`.

### 2. Pay as a consumer

The demo merchant is seeded. This command plays the merchant's server: it calls the HMAC-signed merchant API and prints a checkout URL.

```bash
docker compose exec api npm run demo:checkout -- 2500000 09121234567
#                                                 amount (Toman)  consumer phone
```

Open the URL on a phone-sized window and go through the checkout:

- **Terms → OTP.** Demo mode shows the SMS on the page. Mock messages are also listed at `GET /v1/demo/sms`.
- **Identity.** Use any valid 10-digit national code (for example `0012345679`) and any birth date on or after 1299. Earlier dates simulate a mismatch.
- **Credit.** Pick one or more of the three demo providers. The split between card and credit updates live.
- **Bank.** The mock gateway page offers *Pay*, *Fail* and *Cancel*.
- **Result.** Back in the admin panel, open the order to see its bank and provider transactions, the settlement documents it generated, and its event history. Documents turn into invoices when they mature (daily job at 01:00 Tehran time).

## Local development

Requirements: Node 22, npm 10, PostgreSQL 16.

```bash
npm ci
cp .env.example .env              # fill DATABASE_URL, DATA_ENCRYPTION_KEY, HASH_PEPPER, BOOTSTRAP_ADMIN_*
set -a; . ./.env; set +a

npm run build -w @bajet/contracts
npm run build -w @bajet/api
npm run migration:run -w @bajet/api
npm run seed -w @bajet/api
node apps/api/dist/main.js        # API on :3000
npm run dev -w @bajet/web         # web on :5173, proxies /v1 to :3000
```

Useful scripts (run from the repo root):

| Command | What |
|---|---|
| `npm run build` | Build contracts, API and web |
| `npm run lint` | ESLint across the monorepo |
| `npm run typecheck` | TypeScript checks |
| `npm test` | All tests (contracts rules, API unit + e2e, web unit) |
| `npm run migration:generate -w @bajet/api -- src/database/migrations/<Name>` | New migration from entity changes |

API e2e tests need a PostgreSQL database named `bajet_test` (see `apps/api/.env.test`). Each suite recreates its schema.

## Repository layout

```
apps/api            NestJS API: config/, database/ (migrations, seeds, CLI), shared/, modules/<domain>/
apps/web            React SPA: app/, features/{consumer,checkout,admin}/, shared/, styles/
packages/contracts  Shared DTO types, enums, error codes, permissions, settings, money and Jalali helpers
docs/               PRD, architecture, decisions, design system
```

## Configuration

Configuration comes only from environment variables; every variable also accepts a `<NAME>_FILE` form. [`.env.example`](.env.example) lists them all. Behind HTTPS, set `COOKIE_SECURE=true` and point `PUBLIC_WEB_URL` / `PUBLIC_API_URL` at the public origin.
