# Individual Practitioner Tenants — Life Coach & Consultant Overhaul

**Goal:** Add two solo-with-team SaaS verticals (life coach, consultant) with sidebar-only UX matching the product mockups, and a platform-wide **prospective client** pipeline that upgrades existing client status, booking, intake, packages, and Vonage tools instead of duplicating them.

**Working rule:** Never ship a parallel feature when one exists. Prefer upgrade/overhaul in place. Update this document at the start of every phase and whenever a reuse decision changes.

---

## Table of Contents

1. [Locked Decisions](#1-locked-decisions)
2. [Vision & Target Funnel](#2-vision--target-funnel)
3. [Feature Reuse Matrix](#3-feature-reuse-matrix)
4. [Schema Decisions](#4-schema-decisions)
5. [UI Shell Map](#5-ui-shell-map)
6. [Mockup Widget Inventory (Phase 5)](#6-mockup-widget-inventory-phase-5)
7. [Implementation Phases](#7-implementation-phases)
8. [Back-Integration Notes (Tutoring & Clinical)](#8-back-integration-notes-tutoring--clinical)
9. [Phase Checklist](#9-phase-checklist)

---

## 1. Locked Decisions

| Decision | Choice |
|----------|--------|
| Tenant model | Solo by default; owner is the practitioner. Assistants/team via `user_agencies` (Phase 7: `staff` + permissions JSON). |
| Phase 1 scope | Foundation only: org types, sidebar shells (demo data), prospective **data model**, this planning doc. |
| Prospective for clients | Upgrade `client_statuses` — **do not** reuse employee `users.status = PROSPECTIVE` (hiring-only). |
| Layout | Hide global `App.vue` navbar for these verticals; dedicated sidebar shells (same pattern as school staff hide-nav). |
| Video | Upgrade existing Vonage / `video.service.js` join + email token patterns — no second video stack. |

---

## 2. Vision & Target Funnel

```
[Public booking / inquiry page]
        ↓
Client created/linked
  clients.client_status_id → status_key = prospective
  public_appointment_requests row (inquiry)
        ↓
Team / practitioner schedules Discovery Session
  email with join token → Vonage room
  status → screener (discovery scheduled/completed)
        ↓
Send client onboarding package (intake + docs + session package/pay)
  status → packet
        ↓
Completion
  status → current
  unlock client sidebar dashboard
```

**Practitioner side:** `life_coach` / `consultant` tenant → sidebar shell (no typical header) → pipeline, calendar, clients, analytics.

**Client side:** Prospective has no full dashboard (token-only later). After `current`, sidebar client shell (goals / sessions / resources style per mockup).

---

## 3. Feature Reuse Matrix

| Capability | Existing asset | Decision | Phase | Owner files |
|------------|----------------|----------|-------|-------------|
| Prospective status | `client_statuses` (`screener`, `packet`, `pending`, `current`, …); employee `users.status=PROSPECTIVE` is hiring-only | **Upgrade** — add `prospective`; formalize pipeline labels. Do **not** reuse employee PROSPECTIVE for clients. | 1 | `database/migrations/903_*.sql`, client settings UI |
| Inquiry / booking | `public_appointment_requests`, public finders, `AvailabilityIntakeView` | **Upgrade** — create/link `clients` at `prospective` on NEW_CLIENT inquiry for all public booking service types (`coaching`/`consulting`/`tutoring`/`counseling`/`evaluation`). Intake-link flows remain on `packet`. | 2 / 6 | `publicAgencyServices.controller.js`, `publicIntakeClient.service.js`, public service views |
| Discovery video + email token | `video.service.js` / Vonage; supervision & team-meeting join routes | **Upgrade** shared join-token + email pattern | 3 | `vonageVideo.service.js`, join routes |
| Docs / “pre-hire equivalent” | `intake_links`, onboarding packages, `PublicIntakeSigningView` | **Upgrade** client-facing package assignment; do not fork form engine | 4 | intake + package controllers |
| Session packages / pay | Learning billing, guardian payment cards, intake `paymentInfo` | **Upgrade** package purchase/selection | 4 | learning billing / guardian billing |
| Messaging / resources / calendar | Existing messaging, resources, office schedule | **Wire** in Phase 5; Phase 1 shells use demo widgets | 5 | various |
| Layout / nav | `App.vue` global navbar; school_staff hide; `TenantAdminDashboard` sidebar | **New shell** that hides global nav for these verticals | 1 | `PractitionerShell.vue`, `App.vue` |
| Org tenancy | `agencies.organization_type` | **Upgrade** ENUM with `life_coach`, `consultant` (root tenants like `agency`) | 1 | Agency model, agency routes, AgencyManagement |
| Client types | `clients.client_type` + `getAgencyEnabledClientTypes` | **Upgrade** — enable `basic_nonclinical` for life_coach/consultant (no parallel client table) | 1 | `client.controller.js` |
| Hiring PROSPECTIVE | `users.status`, `hiring_profiles` | **Leave alone** — employee applicants only | — | People Ops |

---

## 4. Schema Decisions

### 4.1 Organization types

```
agencies.organization_type ENUM(
  ...,
  'life_coach',
  'consultant'
)
```

- Root tenant types (like `agency`), **not** child affiliations.
- Solo SaaS: one practitioner owner; Phase 7 adds assistants via `user_agencies` (`staff` + `practitioner_assistant_permissions_json`).
- Defaults (Phase 1+): public booking/services intended; `feature_flags.practitionerVertical` + `portalVariant`-style chrome detection.

### 4.2 Client pipeline statuses (`client_statuses.status_key`)

| Key | Meaning in practitioner verticals |
|-----|-----------------------------------|
| `prospective` | Inquiry submitted; not yet discovery-complete |
| `screener` | Discovery scheduled and/or completed |
| `packet` | Client onboarding package sent / in progress |
| `current` | Active paying / engaged client — dashboard unlocked |
| `pending` / `waitlist` / `inactive` / … | Existing catalog; remain available |

**Canonical pipeline:** `prospective` → `screener` → `packet` → `current`

History continues via existing `client_status_history`.

### 4.3 Client type

Use existing `basic_nonclinical` for life_coach/consultant clients (enabled in `getAgencyEnabledClientTypes`). Do not add parallel `life_coach` / `consultant` client_type values unless a later phase proves necessary.

### 4.4 Public service types (Phase 2)

`agency_public_service_types.service_type` values:

| Type | Used by |
|------|---------|
| `counseling` | Clinical / agency public finders |
| `tutoring` | Learning public finders |
| `evaluation` | Eval enrollment bucket |
| `coaching` | `life_coach` tenants (default-enabled) |
| `consulting` | `consultant` tenants (default-enabled) |

Public URLs: `/{slug}/services`, `/{slug}/find-coach`, `/{slug}/find-consultant`.

NEW_CLIENT inquiries create/link clients at **`prospective`** for all public booking service types (coaching, consulting, tutoring, counseling, evaluation). Intake-link packet finalization still defaults to `packet`.

---

## 5. UI Shell Map

| Mockup | Route | Component | Notes |
|--------|-------|-----------|-------|
| Life coach practitioner | `/:organizationSlug/dashboard` | `LifeCoachPractitionerDashboardView.vue` via `OrganizationDashboardView` | Forest/gold theme tokens |
| Consultant practitioner | `/:organizationSlug/dashboard` | `ConsultantPractitionerDashboardView.vue` | Purple/navy theme tokens |
| Life coach client | `/:organizationSlug/client-dashboard` | `LifeCoachClientDashboardView.vue` | Client / guardian landing |
| Consultant client | `/:organizationSlug/client-dashboard` | `ConsultantClientDashboardView.vue` | Client / guardian landing |

Shared chrome: `frontend/src/layouts/PractitionerShell.vue`  
Helpers: `frontend/src/utils/practitionerVertical.js`  
Global nav suppression: `App.vue` when current org is practitioner vertical.

Phase 1 dashboards use **static demo data** matching mockups. Phase 5 wires real APIs.

---

## 6. Mockup Widget Inventory (Phase 5)

Map before building anything new:

| Mockup widget | Likely existing source | Gap? |
|---------------|------------------------|------|
| Active clients / sessions KPIs | Clients + sessions / office events | Wire counts |
| Revenue | Learning / guardian billing / Stripe | Wire if billing enabled |
| Upcoming sessions | Office schedule / learning sessions | Wire |
| Tasks / action plan | `tasks`, checklists | Wire / light upgrade |
| Resources / templates | Documents / resources modules | Wire |
| Messages | Platform chat / messaging | Wire |
| Goals / progress / life balance | **Possible gap** — no first-class goals module | Build only if inventory confirms gap |
| Invoices | Billing tables | Wire |
| Client progress snapshot | Client statuses / notes | Wire |

---

## 7. Implementation Phases

### Phase 0 — Planning doc & inventory

- This document.
- Exit: reuse matrix + phase gates agreed.

### Phase 1 — Foundation

- Migrations: org types + `prospective` status seed.
- Enable `basic_nonclinical` for these org types.
- Practitioner + client sidebar shells with demo data; hide global nav.
- `getDashboardRoute` + `OrganizationDashboardView` branching.
- Exit: creatable org types; shells render; prospective in DB.

### Phase 2 — Inquiry → prospective profile

- Default public booking for life_coach/consultant (`coaching` / `consulting` service types).
- Inquiry creates/links `clients` at `prospective`.
- Practitioner prospective list via upgraded intake/client filters + dashboard card.
- Branded booking frames: consultant service+calendar; life-coach 3-step free discovery.
- Discovery on/off/required via `feature_flags.discoveryBooking*`; slots use intake/new-client availability.
- Tenant-editable booking shell via `agencies.public_booking_settings` (hero copy, nav, specialties, value props, background). Logo/colors from agency branding.

### Phase 3 — Discovery session + email token → video

**Status: Pending (not started as a phase).** Public booking inquiry → `prospective` is Phase 2 only.

Clarified life-coach discovery flow:
1. Coach reviews the inquiry and **proposes a few time options** (not auto-confirmed from the public form alone).
2. Client gets a **private token link** where those options are **selectable**.
3. **Selecting a time books the discovery session** onto the coach’s calendar (real calendar event / appointment — not a soft hold).
4. That **same token** remains the client’s private access afterward: reminders context + eventually **join the Vonage discovery room** (no full client dashboard yet).
5. Coach (and client) get **reminder emails**; **SMS reminders** follow the same join-reminder pattern already used elsewhere (`joinReminder.service.js`) — email first, texts when SMS is enabled for the tenant.
6. Vonage room shows a **subtle countdown** (default **15 minutes**, editable by the coach when setting up / editing that discovery session on the calendar).
7. On book/accept → client status `prospective` → `screener`.

Reuse: Vonage / `video.service.js` join tokens; calendar booking + `joinReminder.service.js` — do not build a second video or reminder stack.

**Implementation status (MVP shipped):** `discovery_sessions` + `/api/discovery-sessions`, coach “Propose times” on life-coach dashboard, public `/{slug}/discovery/:token` select→book→countdown/join-token, join reminders extended for discovery.

**Still missing / polish (not blocking Phase 4):**
- Live Vonage publisher UI (token endpoint works; room component still stub-level)
- Propose options from live intake availability grid (today: datetime-local)
- Google Calendar sync for booked discovery
- Re-validate option still free at select time
- Optional: make public booking inquiry-only (no slot) now that propose/select is canonical

### Phase 4 — Post-discovery packet + session packages

After discovery, the coach **sends the next phase** (same client token pattern):
- Package options (subset of catalog)
- Documents to sign
- Other intake / info (Life Balance Wheel deferred)

**Package model (locked):**
1. Tenant catalog can hold many packages (e.g. 10+). Coach **assigns a subset** (e.g. only 3) as options for a given client.
2. Each package has a **session count**. On purchase/activation the client receives that balance; **each completed session decrements by 1**.
3. Each package has its own **missed-session policy** (examples: fee, 1 free rebooking, forfeit credit, etc.).
4. Each package has its own **payment settings**:
   - Pay in full (optional all-at-once discount / alternate total)
   - Installment plan (e.g. 4×¼ over a period, or 3 chunks, custom schedule)
   - Pay per session
5. Completion of packet purchase + required docs → `current` + client dashboard unlock.

**Reuse:** Stripe Connect + intake signing links; **do not** reuse employee `onboarding_packages` or learning-org-gated billing APIs as-is — new practitioner package/ledger tables modeled on tutoring token ledgers.

**Deferred (Phase 4 note):** Life Balance Wheel was deferred during packages; **V1 is now shipped** (see Future work).

### Future work (after phases 0–7)

- **Life Balance Wheel** — **V1 shipped** (migration 914 + `/api/life-balance`, SVG assessment, intake `life_balance_wheel`, packet docs, client detail tab, self-take). See `docs/LIFE_BALANCE_WHEEL_SPEC.md` §55 for V2+ (custom templates, importance scores, trend charts).

### Phase 5 — Wire dashboard widgets

- Replace demo data with real modules; build only true gaps.

### Phase 6 — Back-integrate prospective platform-wide

**Status: Done.** Tutoring (`learning`) and counseling/clinical public NEW_CLIENT booking use the same prospective creation path as life_coach/consultant (`PUBLIC_BOOKING_INQUIRY_CLIENT_OPTIONS`). Org resolution accepts learning/clinical/school/program roots (and affiliations). Intake-link packet finalization still defaults to `packet`; existing `screener` / `packet` / `pending` / `current` clients and meanings are unchanged.

### Phase 7 — Team expansion

**Status: Done.** Owners invite `staff` assistants under the same tenant via Settings → Team & Roles. Capabilities live on `user_agencies.practitioner_assistant_permissions_json` (`clients`, `inquiries`, `calendar`, `discovery`, `packets`, `messages`). Owner-only: public booking settings, package catalog, tenant settings/team. Inviting a second `ACTIVE_EMPLOYEE` graduates the tenant from Individuals → Organizations in platform HQ.

---

## 8. Back-Integration Notes (Tutoring & Clinical)

- Prospective is a **shared client_statuses key**, not a tutoring-only or coach-only table.
- Phase 6 upgraded `createBookingRequest` / `createPublicAppointmentRequest` so NEW_CLIENT across service types uses `PUBLIC_BOOKING_INQUIRY_CLIENT_OPTIONS` (`prospective` + `PENDING_REVIEW` + `PUBLIC_BOOKING_INQUIRY`).
- Intake-link `createClientAndGuardian` default remains **`packet`** (docs/signing stage).
- Existing agencies already using `screener` / `packet` keep those meanings; practitioner verticals use the documented pipeline mapping.
- Employee hiring `PROSPECTIVE` remains untouched.
- Regression checklist: public counselor/tutor finders, Availability Intake approval, guardian portal, learning billing.

---

## 9. Phase Checklist

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Planning MD | Done | This file |
| 1 — Foundation | Done | Org types, prospective seed, shells, routing, nav hide |
| 2 — Inquiry → prospective | Done | coaching/consulting hub; NEW_CLIENT → prospective; tenant scoping; dashboard list |
| 3 — Discovery + Vonage token | MVP done | Gaps: live video UI, availability picker, Google sync — polish later |
| 4 — Client onboarding + pay | Done | Catalog + subset assign; session balance; missed policy; per-package pay plans |
| 5 — Wire widgets | Done | Real KPIs / upcoming / tasks / activity; consultant client parity; chat badges |
| 6 — Tutoring/clinical back-integrate | Done | NEW_CLIENT → prospective across service types; intake packet default unchanged |
| 7 — Team expansion | Done | staff assistants + JSON caps; Team panel; scoped nav/API |

---

## 10. Superadmin Demo Testing Lab

**Status:** Done — **platform only** (not tenant dashboards)

The Testing Lab lives inside the Plot Twist HQ **platform command center** ([`SuperadminPlatformDashboard.vue`](frontend/src/views/admin/SuperadminPlatformDashboard.vue)), reached from `/admin` (platform mode) or `/admin-dashboard` with no tenant selected.

Tenant beta dashboards (`TenantAdminDashboard`) do **not** include the lab — there is no tenant-scoped superadmin.

Classic platform UI remains available via `/admin?classic=1`.

### Seeded demo practitioners (migration 904)

| Slug | Name | Org type |
|------|------|----------|
| `demo-consulting` | DEMO Consulting | `consultant` |
| `demo-life-coach` | DEMO Life Coach | `life_coach` |

**Demos do not need to appear in the billable Organizations list.** Platform HQ splits tenants into:

1. **Organizations** — company tenants counted for usage/billing
2. **Individuals** — solo `life_coach` / `consultant` with ≤1 active employee (graduates to Organizations when the team grows)
3. **Sandbox** — demo/fake/training tenants (Testing Lab only; excluded from org KPIs)

Name/slug heuristics (`demo`, `sandbox`, `training`, etc.) mark sandbox; no separate DB flag required yet.
