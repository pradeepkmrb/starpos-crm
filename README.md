# Digitel

Multi-tenant WhatsApp marketing SaaS (Bring Your Own Meta WhatsApp API) —
a Digitell-style clone. All 6 build phases are complete: auth & tenants,
WhatsApp connect/send, contacts & bulk campaigns, automations, billing &
plan enforcement, and analytics/polish. See `C:\Users\Hp\.claude\plans\keen-baking-nova.md`
for the original phased plan.

## Prerequisites

- Node 20+
- pnpm 9+ (`corepack enable`)
- Docker (for Postgres + Redis, or the full containerized stack)
- A Meta WhatsApp Business Cloud API app (Tech Provider) to actually send/receive messages
- A Razorpay account (optional — billing checkout is disabled until `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set)

## Local dev (fastest loop: infra in Docker, apps on host)

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up postgres redis -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API: http://localhost:4000/health (reports live DB connectivity)
- Web: http://localhost:3000 — register an account to get a free-plan tenant, then explore the dashboard nav (Analytics, WhatsApp Channels, Contacts, Campaigns, Automations, Billing)

## Fully containerized

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up --build
```

## Required `.env` values to fully exercise every feature

| Var | Needed for |
|---|---|
| `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Verifying inbound Meta webhooks |
| `TOKEN_ENCRYPTION_KEY` | Encrypting stored WABA access tokens (32-byte hex) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Billing checkout + subscription webhooks |
| `SENTRY_DSN` | Error reporting (optional — app runs fine without it) |

Connecting a WhatsApp channel itself (WABA ID, phone number ID, access
token) happens per-tenant through the `/dashboard/channels` UI, not via env vars.

## Workspace layout

- `apps/web` — Next.js dashboard (auth, channels, contacts, campaigns, automations, billing, analytics) + marketing/pricing pages
- `apps/api` — NestJS API; `src/worker.main.ts` is the BullMQ worker entrypoint (webhook processing, campaign sends, automation steps)
- `packages/db` — Prisma schema, migrations, seed script (3 pricing tiers)
- `packages/shared` — plan/limit constants, role hierarchy, and types shared by web + api
- `infra/docker` — Dockerfiles + docker-compose.yml

## Running tests

```bash
pnpm --filter @digitel/api test
```

Covers keyword-matching for automations (including non-space-delimited
scripts like Chinese/Japanese/Thai), the entitlements/plan-limit boundary
math, and the tenant-scoping Prisma safety net.

## Key architectural notes

- **Multi-tenancy**: row-level `tenantId` scoping. Every tenant-scoped Prisma
  query goes through an explicit `where: { tenantId }` in application code,
  backed by a defense-in-depth safety net (`apps/api/src/prisma/tenant-scoping.middleware.ts`)
  that auto-injects a missing `tenantId` filter for HTTP-request-triggered
  queries (via `AsyncLocalStorage`) — it never overrides an explicit value,
  so legitimate cross-tenant lookups (like `AuthService.switchTenant`) still
  work. Full Postgres RLS was considered and deliberately deferred — see
  project memory / conversation history for the reasoning.
- **Plan limits**: centralized in `EntitlementsService` — every "can I add
  one more X" check across contacts, channels, automations, team seats, and
  monthly API requests goes through it.
- **WhatsApp sends**: all go through `MetaGraphClient`, the single choke
  point where API-usage metering happens, so no call site can bypass quota.
- **Billing**: `PaymentProvider` interface with a Razorpay implementation;
  checkout redirects to Razorpay's hosted page (no card data touches this
  app). A tenant's plan only changes via a verified `subscription.activated`
  webhook, never on the client's say-so.
