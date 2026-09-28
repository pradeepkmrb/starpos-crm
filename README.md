# StarPOS CRM

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
- Web: http://localhost:3000 — register an account to get a free-plan tenant, then explore the dashboard nav (Analytics, WhatsApp Channels, Contacts, Campaigns, Automations, CRM, Billing, API & Developers)

## Fully containerized

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up --build
```

## Required `.env` values to fully exercise every feature

| Var | Needed for |
|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | Meta's one-time webhook subscription challenge |
| `TOKEN_ENCRYPTION_KEY` | Encrypting stored WABA access tokens (32-byte hex) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Billing checkout + subscription webhooks |
| `SENTRY_DSN` | Error reporting (optional — app runs fine without it) |

Connecting a WhatsApp channel itself (WABA ID, phone number ID, access
token) happens per-tenant through the `/dashboard/channels` UI, not via env vars.
So does the Meta App ID and App Secret (used for Embedded Signup and to
verify inbound webhook signatures) — set those once as an admin in
`/dashboard/platform-admin`, not in `.env`.

## Workspace layout

- `apps/web` — Next.js dashboard (auth, channels, contacts, campaigns, automations, CRM leads, integrations, billing, analytics) + marketing/pricing pages
- `apps/mobile` — Expo (React Native) field-sales app for reps; installs with npm, outside the pnpm workspace — see its README
- `apps/api` — NestJS API; `src/worker.main.ts` is the BullMQ worker entrypoint (webhook processing, campaign sends, automation steps)
- `packages/db` — Prisma schema, migrations, seed script (3 pricing tiers)
- `packages/shared` — plan/limit constants, role hierarchy, and types shared by web + api
- `infra/docker` — Dockerfiles + docker-compose.yml

## Running tests

```bash
pnpm --filter @starpos-crm/api test
```

Covers CSV parsing (quoted cells, extra columns) and import column matching,
integration credential handling (masking, rotation, unknown-field rejection),
custom-field validation, Meta lead-ad field mapping,
keyword-matching for automations (including non-space-delimited
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
- Sends address a customer by phone number, so they go over WhatsApp.
  Messenger, Instagram and email conversations are answered from the Inbox,
  where the thread already says which channel to reply on.

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
| GET | `/channels` | Connected channels, each with its type |

Every failure answers with one envelope —
`{ "error": { "code", "message", "status" } }` — so integrations branch on
`error.code` rather than parsing prose. Requests are capped per key per
minute (`PUBLIC_API_RATE_LIMIT_PER_MINUTE`, default 120), reported through
`X-RateLimit-*` headers; the plan's monthly allowance is separate and is
metered on the outbound Meta calls a request makes.

Deleting a contact is deliberately absent from this surface: it also erases
their delivery history, so it stays a dashboard action.

## CRM (leads)

The **CRM** nav group holds three screens:

- **Leads** — the entry screen and pipeline. Fixed fields (name, mobile
  number, email, company, stage, owner, deal value, source, notes) plus every
  custom field the workspace has defined.
- **Lead Fields** — the field builder for the lead entry screen. See
  [Custom fields](#custom-fields) below.
- **Meta Ads** — links a Meta lead-ads instant form to this workspace.

## Custom fields

Both leads and contacts take tenant-defined fields, built from one place:

| Menu | Builds the form for | Answers stored in |
|---|---|---|
| CRM → Lead Fields | Lead entry screen | `Lead.customFieldsJson` |
| Engage → Contact Fields | Create and edit contact | `Contact.attributesJson` |

Add a text box, paragraph, number, date, dropdown, radio group or tick box,
and the matching entry screen picks it up immediately. Fields can be reordered,
marked required, and hidden without erasing anything.

- The definitions are rows in `CustomField`, discriminated by `entity`; the
  answers are one JSON column on the record, keyed by field key. A workspace
  reshaping its forms never means a migration.
- Keys are unique per entity, so leads and contacts can each have their own
  "city" without colliding, and neither entity's routes can reach the other's
  fields.
- A field's key is derived from its label once and never changes, so renaming a
  label keeps the answers already on file.
- Every write passes through `custom-field-values.ts`: a dropdown or radio
  answer has to be one of its choices, a number has to parse, a date has to be
  real, and a key with no definition is dropped rather than stored.
- Required is enforced on manual entry only. A lead arriving from a Meta ad, or
  a contact created by an inbound WhatsApp message or a CSV import, is never
  rejected for a missing answer — those can be filled in afterwards.

### Custom fields in a CSV import

Contact import carries custom fields as well as phone and name. Any column
whose header matches a contact field, by key or by label and ignoring case and
punctuation, is imported as that field's answer:

```
phone,name,preferred_city,marketing_consent
919876543210,"Rao, Textiles",Chennai,yes
```

Download CSV writes exactly this layout, so an export can be edited in a
spreadsheet and brought back without losing what it holds. The reader is
RFC 4180, so a quoted comma or quote inside a cell survives the round trip.

Nothing about a custom field can fail an import:

- A header matching no field is reported back, not silently dropped — a
  misspelt column is the likeliest reason an import appears to lose data.
- A value a field cannot hold (a choice that is not on the list, a number that
  will not parse) is left out and counted, and the row is still imported.
- A contact already on file keeps every answer the file does not carry, so a
  partial spreadsheet tops a record up instead of hollowing it out.

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

## Integrations (per-tenant)

**Workspace → Integrations** is where a tenant connects their own third-party
accounts. Today the catalog holds one category:

| Category | Provider | Needs |
|---|---|---|
| Payments | Razorpay | Key ID, key secret, optional webhook secret |
| Payments | Stripe | Secret key, optional publishable key and signing secret |

These are the **tenant's own** gateway keys, used to charge their customers.
They are unrelated to the platform-level `RAZORPAY_*` env values, which are how
this SaaS charges tenants for their own subscription.

- The catalog lives in `packages/shared/src/integrations.ts`. The dashboard
  renders each connect form from it and the API validates against the same
  entry, so adding a provider is one entry plus a verification branch in
  `payment-gateway.client.ts` — no migration, since `provider` is a string.
- Keys are checked against the provider before they are stored (a read-only
  call: one order for Razorpay, the account for Stripe), so a typo surfaces on
  this screen rather than on a customer's first payment.
- Keys are encrypted with `TOKEN_ENCRYPTION_KEY` and never returned to the
  browser. The screen shows a masked tail, and leaving a secret blank when
  updating keeps the stored one, so rotating one key does not mean retyping
  the rest.
- Test connection re-checks stored keys and records why a gateway stopped
  working. Pause keeps the keys but takes the gateway out of service.
- Anything needing a tenant's gateway calls
  `IntegrationsService.getActivePaymentGateway(tenantId)` rather than reading
  the table, so every caller is tenant-scoped by construction.

Reading the catalog is open to any member; connecting, pausing and
disconnecting require admin or owner.

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
- **Custom fields**: one builder serves every entry screen that has one. The
  definitions are rows (`CustomField`, discriminated by `entity`), the answers
  are one JSON column on the record. That keeps a tenant's form changes out of
  DDL, and validation in `custom-field-values.ts` is the single gate every
  write passes through, so the JSON column can never hold a key the tenant
  never defined.
- **Billing**: `PaymentProvider` interface with a Razorpay implementation;
  checkout redirects to Razorpay's hosted page (no card data touches this
  app). A tenant's plan only changes via a verified `subscription.activated`
  webhook, never on the client's say-so.
