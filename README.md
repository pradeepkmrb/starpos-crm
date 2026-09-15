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
- Web: http://localhost:3000 — register an account to get a free-plan tenant, then explore the dashboard nav (Analytics, WhatsApp Channels, Contacts, Campaigns, Automations, CRM, Billing)

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

- `apps/web` — Next.js dashboard (auth, channels, contacts, campaigns, automations, CRM leads, billing, analytics) + marketing/pricing pages
- `apps/api` — NestJS API; `src/worker.main.ts` is the BullMQ worker entrypoint (webhook processing, campaign sends, automation steps)
- `packages/db` — Prisma schema, migrations, seed script (3 pricing tiers)
- `packages/shared` — plan/limit constants, role hierarchy, and types shared by web + api
- `infra/docker` — Dockerfiles + docker-compose.yml

## Running tests

```bash
pnpm --filter @digitel/api test
```

Covers custom lead-field validation, Meta lead-ad field mapping,
keyword-matching for automations (including non-space-delimited
scripts like Chinese/Japanese/Thai), the entitlements/plan-limit boundary
math, and the tenant-scoping Prisma safety net.

## CRM (leads)

The **CRM** nav group holds three screens:

- **Leads** — the entry screen and pipeline. Fixed fields (name, mobile
  number, email, company, stage, owner, deal value, source, notes) plus every
  custom field the workspace has defined.
- **Lead Fields** — the field builder. Add a text box, paragraph, number,
  date, dropdown, radio group or tick box; the lead entry screen picks it up
  immediately. A field's key is derived from its label once and never changes,
  so renaming a label keeps the answers already on file. Hiding a field takes
  it off the form without erasing anything.
- **Meta Ads** — links a Meta lead-ads instant form to this workspace.

Answers live in `Lead.customFieldsJson`, keyed by field key, and are validated
against their definition on every write (`lead-custom-values.ts`): a dropdown
or radio answer has to be one of its choices, a number has to parse, a date
has to be real.

### Linking a Meta lead ad

1. Subscribe your Meta app's webhook to the `leadgen` field on the Page
   object, pointing at the same `/webhooks/meta` URL WhatsApp already uses —
   the processor routes by `change.field`, so one endpoint serves both.
2. Subscribe the Page to the app.
3. In **Meta Ads**, link the Page id and form id with a Page access token
   carrying `leads_retrieval`. The token is encrypted with
   `TOKEN_ENCRYPTION_KEY`, exactly like a WABA token, and is never returned to
   the browser.
4. Map each form question onto a lead field, or leave it on "decide
   automatically" — Meta's standard question names (`full_name`, `email`,
   `phone_number`, …) and any question whose name matches one of your field
   keys are recognised without configuration. Unmapped answers are appended to
   the lead's notes rather than dropped.
5. **Pull recent leads** fetches submissions Meta already holds, for anything
   that arrived before the webhook was wired.

Ingestion is idempotent on Meta's lead id, and a required custom field is
never enforced on an ad lead — a real enquiry is worth more than a complete
form.

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
- **Lead custom fields**: the definitions are rows (`LeadCustomField`), the
  answers are one JSON column on `Lead`. That keeps a tenant's form changes
  out of DDL, and validation in `lead-custom-values.ts` is the single gate
  every write passes through, so the JSON column can never hold a key the
  tenant never defined.
- **Billing**: `PaymentProvider` interface with a Razorpay implementation;
  checkout redirects to Razorpay's hosted page (no card data touches this
  app). A tenant's plan only changes via a verified `subscription.activated`
  webhook, never on the client's say-so.
