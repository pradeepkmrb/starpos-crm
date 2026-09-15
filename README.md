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
- Web: http://localhost:3000 — register an account to get a free-plan tenant, then explore the dashboard nav (Analytics, WhatsApp Channels, Contacts, Campaigns, Automations, Billing, API & Developers)

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
math, the tenant-scoping Prisma safety net, the public API's Meta payload
builders and phone normalisation, and the guard rules that keep session
tokens and API keys on their own halves of the app.

## Public REST API

Each tenant gets an API key so their own systems can send WhatsApp messages
and sync contacts. The key is created on first visit to **API &
Developers** in the dashboard, which also documents every endpoint below
with a runnable curl example and a sample response.

- Base URL: `${NEXT_PUBLIC_API_URL}/api/v1`
- Auth: `X-API-Key: <key>` on every request. Session tokens are not accepted
  here, and an API key is not accepted on the dashboard routes.

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Verify a key; returns workspace, channels, usage and limits |
| POST | `/messages/send` | Free-form text (24-hour window only) |
| POST | `/messages/send-template` | Approved template; works outside the window |
| POST | `/messages/send-media` | Image, video, document, audio or sticker |
| POST | `/messages/send-interactive` | Reply buttons or a list picker |
| GET | `/messages/{id}` | Delivery state, by our id or Meta's wamid |
| GET | `/contacts` | Cursor-paginated list, with search and list filters |
| GET | `/contacts/by-number/{number}` | Fetch one contact by phone number |
| POST | `/contacts` | Create, or update the contact with that number |
| PATCH | `/contacts/{id}` | Update named fields on a contact |
| GET | `/lists` | Contact lists and their sizes |
| GET | `/templates` | Templates available to send |
| GET | `/channels` | Connected WhatsApp numbers |

Every failure answers with one envelope —
`{ "error": { "code", "message", "status" } }` — so integrations branch on
`error.code` rather than parsing prose. Requests are capped per key per
minute (`PUBLIC_API_RATE_LIMIT_PER_MINUTE`, default 120), reported through
`X-RateLimit-*` headers; the plan's monthly allowance is separate and is
metered on the outbound Meta calls a request makes.

Deleting a contact is deliberately absent from this surface: it also erases
their delivery history, so it stays a dashboard action.

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
- **API keys**: stored as a SHA-256 hash (the unique lookup column used to
  authenticate a request) alongside AES-GCM ciphertext, so an admin can
  re-read the key they already own instead of being forced to rotate.
  `TenantContextMiddleware` resolves either credential into the same tenant
  context, and only after no valid session token was presented, so a stray
  header cannot re-attribute a logged-in request.
- **Billing**: `PaymentProvider` interface with a Razorpay implementation;
  checkout redirects to Razorpay's hosted page (no card data touches this
  app). A tenant's plan only changes via a verified `subscription.activated`
  webhook, never on the client's say-so.
