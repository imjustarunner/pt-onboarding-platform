# Unified Booking Architecture

Living contract for the multi-service scheduling and booking layer. Extends (does not replace) the office assignment spine and the clinical/medical billing plans.

Related: [`scheduling_booking_spec.md`](../scheduling_booking_spec.md), [`docs/MEDICAL_BILLING_CLAIMMD_PLAN.md`](MEDICAL_BILLING_CLAIMMD_PLAN.md), [`docs/INDIVIDUAL_PRACTITIONER_TENANTS_PLAN.md`](INDIVIDUAL_PRACTITIONER_TENANTS_PLAN.md).

## Decisions

1. **Canonical appointments** — One `appointments` row is the source of truth for “what was booked.” Calendar blocks, room slots, clinical sessions, and package ledgers are **linked facets**.
2. **Preserve office assignments** — `office_standing_assignments` → materializer → `office_events` stay first-class. Booking a client into an owned slot updates room state **and** upserts an appointment linked by `office_event_id`.
3. **Tenant catalog** — Business types → tenant services → staff service assignments drive what can be booked.
4. **Booking always on** — Unified booking is not a tenant feature toggle. Every tenant gets the appointments + catalog layer. Office assign/forfeit/request flows remain unchanged; adapters always may write appointments.
5. **Business types nest capabilities** — Selecting tenant service types (`agency_business_types`) opens the matching feature packs, public finders, and role surfaces. Counseling-only tenants must not see tutoring finders / learning modules; learning tenants must not get clinical note / medical billing packs unless those types are also enabled.
6. **Medical billing** — Optional settlement mode on clinical services when `medicalBillingEnabled` (and mental_health business type). Absence of medical billing does not disable cash/package billing. Legacy `healthcare` values alias to `mental_health`.

## Hierarchy

```
organization_type (tenant shell)
  └─ agency_business_types[]          ← what verticals this tenant sells
       └─ feature gates               ← vertical modules + public finders + role surfaces
            └─ tenant_services + staff_service_assignments
                 └─ booking_packages → entitlements → appointments
```

Platform → parent/affiliated org (optional) → tenant → business types → tenant services → programs/packages → staff assignments → client eligibility → booking options.

### Per-type service & package suites

Enabling a business type **seeds** that type’s default `tenant_services` + `booking_packages` (idempotent; never overwrites admin edits). Mental health pulls the ITSCO pay dictionary + `SERVICE_DESCRIPTIONS.md` direct CPT/HCPCS set (90791, 90832/34/37/39/40/46/47/53, 90785, 99051, 97535, H0004, H0023/25/31/32, H2014–H2018, H2021/22, H2032/33, S9454, T1017, pro-bono) with `service_code` so booking aligns with payroll/billing-report codes. Tutoring, coaching, consulting, learning, mentorship, skills development, and other each get a simple session + starter package. Booking options only expose services whose business type is still enabled. Providers pick **practice categories** (mental health / tutoring / coaching / consulting) gated by the tenant’s enabled business types; categories sync public enrollments and staff service assignments.

### Shared service-code catalog

Clinical/direct codes are reconciled across `payroll_service_code_rules` (pay math), `agency_medical_service_codes` (claim units), and `tenant_services.service_code` (booking) via `agencyServiceCodeCatalog.service.js`. Payroll-only codes (mileage, admin, meetings, bonuses, …) stay in payroll. Adding/updating a shared code in one surface mirrors it to the others; deleting/deactivating it removes it from all three. Domain-specific fields remain where they belong (pay divisors on payroll rules; unit ladders on medical; duration/modality on tenant services).

### Business type → capability packs

| Business type | Public service types | Nested feature keys (examples) | Role surfaces |
|---------------|----------------------|--------------------------------|---------------|
| `mental_health` | counseling, evaluation | noteAid, clinicalNoteGenerator, medicalBilling, medcancel, inSchoolSubmissions | provider, CPA, supervisor, counseling_enrollment |
| `learning` / `tutoring` | tutoring | standardsLearning, groupClass, learningProgramBilling, schoolPortals, skillBuilders | provider, tutoring_enrollment, school_staff |
| `coaching` | coaching | publicProviderFinder, aiProviderSearch | provider, practitioner_assistant, coaching_enrollment |
| `consulting` | consulting | publicProviderFinder, aiProviderSearch | provider, practitioner_assistant, consulting_enrollment |

Defaults when none configured yet (seeded on first catalog load):

| `organization_type` | Default business types |
|---------------------|------------------------|
| `agency` | mental_health |
| `life_coach` | coaching |
| `consultant` | consulting |
| `learning` / `school` | learning, tutoring |
| `clinical` | mental_health |

Core ops (payroll, hiring, presence, etc.) stay unscoped by business type — platform/tenant availability still applies.

Capability audit endpoint: `GET /api/tenant-booking/agencies/:agencyId/capabilities`.

## Canonical appointment

### Core fields (`appointments`)

| Field | Notes |
|-------|--------|
| `agency_id` | Tenant |
| `parent_agency_id` | Affiliated org when applicable |
| `business_type` | e.g. mental_health, coaching |
| `tenant_service_id` | FK to catalog (nullable for legacy/import) |
| `provider_user_id` | Rendering / assigned staff |
| `start_at` / `end_at` | Wall/local datetime |
| `modality` | `IN_PERSON`, `TELEHEALTH`, `EITHER` |
| `location_id` / `office_location_id` / `room_id` | Optional |
| `status` | See statuses below |
| `participant_mode` | `individual` \| `multi` (auto when >1 client participant) |
| `office_event_id` | Office facet |
| `provider_schedule_event_id` | Calendar facet |
| `clinical_session_id` | Clinical plane reference (no PHI in main DB) |
| `package_entitlement_id` | Links `booking_package_entitlements` |
| `source` | `staff_grid`, `public`, `package`, `office_book`, `import`, … |
| `created_by_user_id` | Actor |

### Participants (`appointment_participants`)

Roles: `client`, `guardian`, `student`, `org_contact`, `other`. Flags for billing responsibility and reminder recipient.

### Billing stub (`appointment_billing`)

`settlement_mode`: `self_pay` \| `package` \| `insurance` \| `org` \| `grant` \| `other`. Amount/package refs; insurance fields nullable until medical path attaches.

### Statuses (reserved set)

Phase 1 live subset: `draft`, `confirmed`, `completed`, `canceled_by_provider`, `canceled_by_client`, `no_show`, `rescheduled`.

Full reserved set (for later phases): `requested`, `awaiting_approval`, `temporarily_held`, `awaiting_client_confirmation`, `awaiting_forms`, `awaiting_payment`, `client_confirmed`, `checked_in`, `in_progress`, `cancellation_requested`, `canceled_by_guardian`, `canceled_by_organization`, `late_canceled`, `billing_review_required`, `waiver_review_required`.

## Package / program ledger (Phase 2)

Tables: `booking_packages`, `booking_package_entitlements`, `booking_package_ledger`.

- Catalog packages are scoped by `business_type` (and optional tenant service subset).
- Entitlements track `sessions_remaining` + `sessions_reserved`.
- Consumption: `consume_on = reserve` (default) holds a session at book time; cancel releases; complete converts reserve → consume. `consume_on = complete` debits only when the appointment completes.
- Practitioner packages (`practitioner_session_packages` / entitlements) remain for coach packet flows; `practitioner_entitlement_id` can bridge into the unified ledger.

## Adapter matrix

| Legacy write path | Behavior |
|-------------------|----------|
| Office book / booking-plan client attach | Upsert appointment + `office_event_id`; room `slot_state` unchanged |
| Staff individual / group / telehealth session | Appointment first → PSE (+ counseling session facet when needed) |
| PSE personal / hold / meeting / huddle | Optional later; not required for session path |
| Package book | Link `package_entitlement_id`; reserve/consume via ledger |
| Portal / public request | Request stays; appointment on accept (Phase 5) |
| Supervision | Stays separate; optional later adapter |

## Office compatibility rules

- Do **not** drop or rewrite standing assignment materialization.
- `POST` office-slots book / booking-plan / cancel keep existing response shapes.
- Adapter is additive: after a successful book, call `appointment.service` upsert.
- Assign, forfeit, open-slot, intake toggles are out of booking UI redesign.

## Phase status

| Phase | Status | Notes |
|-------|--------|--------|
| 0 Architecture | Done | This doc |
| 1 Catalog + appointments + adapters | Done | Always-on booking; business-type capability nesting |
| 2 Packages / consumption | Done | `booking_packages` ledger; remaining sessions on book |
| 3 Cancellation policies | Done | Hierarchy + evaluate/cancel/waiver audit |
| 4 Reminders + two-way replies | Superseded | See [`SESSION_NOTIFICATION_SYSTEM.md`](SESSION_NOTIFICATION_SYSTEM.md) — full channel/rules/prefs/buffer stack |
| 5 Public + smart booking | Scaffold | `GET/POST /api/public/unified-booking/:slug/…` uses same resolver |

### Phase 3 — Policies

Hierarchy (most specific wins): appointment override → package → service → business type → tenant → affiliation (parent).

Tables: `booking_cancellation_policies`, `booking_cancellation_waivers`. Appointments store `cancel_deadline_at`, fee, recommendation snapshot, reason.

`POST /api/appointments/:id/evaluate-cancel` and cancel path apply fee / package forfeit|release|review; staff waiver writes audit.

### Phase 4 — Reminders

Tables: `appointment_reminders`, `appointment_communications`, `appointment_reply_reviews`, `booking_agency_settings`.

Defaults: 24h + 2h email (service → agency → platform default). Cron: `POST /api/tenant-booking/cron/reminders` with `x-cron-secret` (`CRON_SECRET` / `BOOKING_CRON_SECRET`). SMS/phone skipped without documented consent. Inbound CONFIRM/CANCEL → apply or `pending_review`.

### Phase 5 — Public scaffold

`GET /api/public/unified-booking/:agencySlug/booking-options` and `POST …/appointments` filter to `isPubliclyBookable` services. Legacy finders remain; full cascading UX / guardian flows can deepen here.

## APIs

- `GET /api/tenant-booking/business-type-catalog`
- `GET/PUT /api/tenant-booking/agencies/:agencyId/business-types` (returns `capabilities`)
- `GET /api/tenant-booking/agencies/:agencyId/capabilities`
- `GET/POST/PATCH/DELETE /api/tenant-booking/agencies/:agencyId/tenant-services`
- `GET/PUT /api/tenant-booking/agencies/:agencyId/tenant-services/:serviceId/staff`
- `GET /api/tenant-booking/agencies/:agencyId/booking-options` — resolver `{ serviceId?, providerId?, clientId? }` incl. `packagePreview`
- `GET/POST/PATCH /api/tenant-booking/agencies/:agencyId/packages`
- `GET /api/tenant-booking/agencies/:agencyId/clients/:clientId/entitlements`
- `POST /api/tenant-booking/agencies/:agencyId/entitlements`
- `GET/POST/PATCH /api/tenant-booking/agencies/:agencyId/cancellation-policies`
- `GET /api/tenant-booking/agencies/:agencyId/cancellation-policy-preview`
- `POST /api/tenant-booking/cron/reminders`
- `GET/POST /api/appointments`, `GET/PATCH /api/appointments/:id`, `POST /api/appointments/:id/cancel`
- `POST /api/appointments/:id/evaluate-cancel`, `GET …/timeline`, `POST …/reminders/reschedule`, `POST …/replies`
- `GET/POST /api/public/unified-booking/:agencySlug/booking-options|appointments`
- Schedule summary may include `appointmentId` on office/schedule overlays when linked

## Success criteria

- Tenant enables business types; vertical feature toggles / public finders / role surfaces nest correctly.
- Counseling-only tenants cannot enable tutoring public finders or learning-only modules without enabling learning/tutoring types.
- Booking UI and adapters work without a feature flag.
- Packages show remaining sessions on booking; reserve/release/consume update the ledger.
- Cancel evaluates policy (deadline, fee, package action) with waiver audit.
- Reminders schedule on book; cron sends email; SMS requires consent; replies land on timeline / review.
- Public unified booking path uses the same resolver for publicly bookable services.
- Office book still updates `office_events` / standing behavior and links an appointment.
