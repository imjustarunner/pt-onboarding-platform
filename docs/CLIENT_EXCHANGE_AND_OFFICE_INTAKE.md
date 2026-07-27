# Client Exchange & Office (Clinical) Digital Intake

Phase 4 foundation for office clients: a minimal public digital intake for new
clinical/office clients, a support/admin queue to assign them a first
provider, and a "Client Exchange" marketplace so providers can hand off an
existing office client to another provider without ever exposing the
client's identity to the browsing provider until an assignment is approved.

This is a **foundation** — it ships the core data model, API, and enough UI
to use the flow end-to-end. See "Not built yet" at the bottom for deliberately
deferred work.

## Data model

`database/migrations/1060_client_exchange.sql`:

- `client_exchange_listings` — one row per anonymized listing.
  - `client_id` (nullable — set NULL if the client row is ever deleted, listing stays for audit),
    `posted_by_user_id`, `current_provider_user_id`, `status` (`open` → `requested` →
    `approved`/`withdrawn`/`closed`), `demographics_json`, `presenting_problems_json`,
    `diagnoses_json`, `preferences_json`, `notes`.
- `client_exchange_requests` — one row per provider request against a listing.
  - `listing_id`, `requesting_provider_user_id`, `status` (`pending`/`approved`/`denied`/`withdrawn`),
    `message`, `resolved_by_user_id`, `resolved_at`, `denial_reason`.
- `clients.intake_preferences_json` — added on the existing `clients` table. Stores
  preferred day/time, modality, and presenting concern captured at public digital
  intake, before a provider is assigned.

`database/migrations/1061_clients_source_public_office_intake.sql` adds the
`PUBLIC_OFFICE_INTAKE` value to `clients.source`.

Office/clinical clients are **not** a new client type — they reuse the existing
`clients.client_type` enum (`school` = in-school, `clinical`/`learning` = in-office).
There is no separate "office org"; a client created by the public intake form has
`organization_id = agency_id` (mirrors how solo-practitioner/root-agency intake is
already resolved elsewhere in the app).

## Backend

- `backend/src/services/clientExchange.service.js` — all business logic (listing
  CRUD, request/approve/deny, redaction, pending-office-client queue, public intake
  client creation).
- `backend/src/controllers/clientExchange.controller.js` + `backend/src/routes/clientExchange.routes.js`
  — mounted at `/api/client-exchange` (all routes `authenticate`d).
- `backend/src/routes/publicOfficeIntake.routes.js` — mounted at `/api/public/office-intake`
  (no auth; the `authenticate` middleware already bypasses `/api/public/*`).
- `Client.model.js` / `client.controller.js` — `GET /api/clients` now accepts an
  optional `client_type` filter (comma-separated, e.g. `clinical,learning`), reused
  by the frontend to fetch "in-office" clients via the existing clients endpoint.

### API surface

Authenticated (`/api/client-exchange`):

| Method | Path | Notes |
|---|---|---|
| GET | `/listings?agencyId=&status=` | Redacted for anyone who isn't the poster/current provider/admin/support |
| GET | `/listings/:id` | Listing + its requests (also redacted per-viewer) |
| POST | `/listings` | `{ agencyId, clientId, demographics, presentingProblems, diagnoses, preferences, notes }` |
| POST | `/listings/:id/withdraw` | Poster, current provider, or admin/support |
| POST | `/listings/:id/requests` | `{ message }` — any agency member except the current provider |
| GET | `/my-requests?agencyId=` | The caller's own submitted requests |
| POST | `/requests/:id/approve` | Current provider or admin/support — reassigns the client, closes the listing, auto-denies other pending requests |
| POST | `/requests/:id/deny` | Current provider or admin/support |
| GET | `/pending-office-clients?agencyId=` | Support/admin/supervisor queue: office clients with no provider yet |

Public (`/api/public/office-intake`, no auth):

| Method | Path | Notes |
|---|---|---|
| GET | `/:agencySlug` | Resolves `{ id, name, slug }` for the intake page header |
| POST | `/:agencySlug` | Creates a `PENDING_REVIEW` `clinical` client, `provider_id = NULL`, with `intake_preferences_json` |

### Redaction rules

Anyone browsing `GET /listings` who is **not** the poster, the current
provider, or agency admin/support/staff sees the listing with `clientId`,
`currentProviderName`, and `postedByName` stripped. `demographics_json` /
`presenting_problems_json` / `diagnoses_json` / `preferences_json` are
intentionally the only clinically-identifying data included in a listing —
callers are responsible for not putting the client's name/DOB/contact info in
those free-form fields (there is no PII scrub on the JSON contents in this
foundation).

## Frontend

- **Provider "My Clients"** (`frontend/src/components/dashboard/ProviderClientsTab.vue`)
  — added an **In-school / In-office** toggle above the roster. In-office
  fetches `GET /api/clients?agency_id=&provider_id=&client_type=clinical,learning`
  and renders a lightweight table (no fiscal-year/psychotherapy-totals columns,
  those are school-specific). A "Client Exchange →" link jumps to the exchange.
- **Client Exchange** (`frontend/src/components/clientExchange/`):
  `ClientExchangePanel.vue` (tabs: Open listings / My activity / Closed),
  `ListingCard.vue` (request / withdraw / expand-to-approve-deny), and
  `PostListingModal.vue` (pick one of your own — or, for admin/support, any
  agency — office clients and post it). Routed at `/client-exchange` and
  `/:organizationSlug/client-exchange` (`ClientExchange` / `OrganizationClientExchange`).
- **Support/admin new-clients queue** (`frontend/src/components/admin/OfficeIntakeQueuePanel.vue`)
  — lists pending office clients with their intake preferences and an inline
  "assign provider" dropdown (calls the existing `PUT /api/clients/:id/provider`).
  Routed at `/admin/office-intake-queue` and `/:organizationSlug/admin/office-intake-queue`.
- **Public digital intake** (`frontend/src/views/public/PublicOfficeIntakeView.vue`)
  — minimal name/phone/concern/preferred-time-and-modality form. Routed at
  `/office-intake/:agencySlug` and `/:organizationSlug/office-intake`.
- **Discoverability**: entries added to `frontend/src/navigation/quickNavCatalog.js`
  (`clients-exchange`, `admin-office-intake-queue`) so both surfaces show up in
  the Overview quick-nav / Ask Assistant navigation. Deep nav-menu wiring in
  `App.vue` was intentionally skipped for this foundation (see below).

## Shipped vs. stubbed

**Shipped (working end-to-end, smoke-tested against a live dev DB/API):**
- Migrations, full listing/request/approve/deny lifecycle with provider
  reassignment and auto-denial of competing requests.
- Redaction of client identity for non-privileged listing viewers.
- Public digital intake creating a real pending `clinical` client with
  `intake_preferences_json`.
- Support/admin pending-office-client queue with inline provider assignment.
- Provider in-school/in-office caseload filter.
- Client Exchange browse/post/request/approve/deny UI.

**Stubbed / deliberately deferred (foundation only):**
- No dedicated "office" sub-organization concept — office clients hang off
  the agency directly (`organization_id = agency_id`). If a tenant needs
  multiple physical office locations as distinct entities later, that's a
  follow-up (see `officeSlotSeries.service.js` / office locations for a
  possible integration point).
- No automated matching/recommendation of which provider should get a
  listing — purely a request/approve marketplace.
- No email/SMS notifications when a listing is posted, requested, or
  resolved (the existing `notificationDispatcher.service.js` would be the
  integration point).
- No PII scrub/validation on listing `notes`/`preferences_json` free text —
  posters are trusted not to include identifying details.
- `App.vue` top-nav menus were not modified (only the quick-nav catalog and an
  in-context link from the Clients tab); a full nav-menu placement pass is
  left for follow-up given how deeply nested/feature-flagged that file's
  existing admin menus are.
- Public intake form does not check for duplicate/returning clients (every
  submission creates a new client row) — no phone/name matching like the
  guardian intake-link flow has.
- No rate limiting/captcha on the public intake endpoint.
