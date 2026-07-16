# School Coverage Hub — Phase 1 Discovery

Source-of-truth audit for the School Coverage, Provider Assignment, and Event Management integration.
Do not create parallel records when an equivalent already exists.

## Canonical map

| Domain | Canonical store | Key files | Decision |
|--------|-----------------|-----------|----------|
| School org | `agencies` (`organization_type = 'school'`) + `school_profiles` | `Agency.model.js`, school profile migrations | **reuse** |
| Agency↔school link | `organization_affiliations` (SoT); `agency_schools` dual-write | `OrganizationAffiliation.model.js`, `AgencySchool.model.js` | **reuse** OA; migrate AS reads later |
| Provider day + capacity | `provider_school_assignments` (`slots_total` / `slots_available`) | `providerSlots.service.js`, `providerScheduling.controller.js`, `providerSelfAffiliations.controller.js` | **reuse / expand** |
| Portal day bar | `school_day_provider_assignments` (projection) | `schoolPortalDaySync.service.js` | **reuse** as projection |
| Soft schedule logistics | `soft_schedule_slots` | `schoolSoftSchedule.controller.js`, `SoftScheduleEditor.vue` | **reuse** |
| Client↔school | `client_organization_assignments` | school portal / client controllers | **reuse** |
| Client↔provider day | `client_provider_assignments` | `AssignDayModal.vue`, day-assignment APIs | **reuse** |
| Waitlist | `client_statuses.status_key = 'waitlist'` + `clients.waitlist_started_at` | `schoolPortal.controller.js`, `WaitlistNoteModal.vue` | **reuse** |
| Additional school day request | `provider_school_availability_requests` + `_blocks` | `availability.controller.js`, `AdditionalAvailabilitySubmit.vue`, `AvailabilityIntakeManagement.vue` | **reuse / expand** (prefer-school) |
| School / company events | `company_events` (types `school_back_to_school`, `school_spring_event`, …) | `schoolPortalEvents.service.js`, `CompanyEventsManager.vue` | **reuse / expand** |
| Event staffing requests | `company_event_session_provider_requests` → `company_event_session_providers` | `companyEventStaffing.controller.js` | **reuse** |
| Personal calendar | `provider_schedule_events` | `ProviderScheduleEvent.model.js` | **reuse** (out of school-parent scope) |
| Office room events | `office_events` | office schedule | **retire from this scope** |
| Coverage board (legacy UI) | School Overview | `SchoolOverviewDashboard.vue`, `GET /api/dashboard/school-overview` | **expand** into Caseload Hub |

## Capacity rules (shared service)

Aligned with School Overview:

- `slots_total` = `SUM(provider_school_assignments.slots_total)` where `is_active`
- `slots_used` = `COUNT(client_provider_assignments)` with active client, provider, and `service_day`
- `slots_available` = `max(0, slots_total - slots_used)`
- Waitlist = clients with `status_key = 'waitlist'` on active org assignment
- Unassigned clients = active clients at school with no active CPA provider
- Clients with provider but no day = CPA with provider and null `service_day`
- Unstaffed day = clients scheduled on a weekday with no active PSA for that weekday

## Open school days (derived, not a new marketplace table)

An open school day is derived when any of:

1. Weekday has clients (or waitlist demand) but no active provider assignment
2. Weekday has `slots_available > 0` (capacity remaining)
3. School has waitlist and unused capacity on another staffed day

Providers apply via existing school availability requests with preferred school org ids.

## Event publication

School portal events write the same `company_events` row (`organization_id` = school). No portal-only event copy.

## Checklist status (§28)

Searched and evaluated: event, schoolPortal, providerAvailability, additionalDay/school requests, schoolAssignment, providerSchool, schoolDay, affiliation, waitlist, clientAssignment, caseload/capacity, providerRequest/session requests, coverage, schoolStaff, notification.

## Out of scope naming traps

- `agency_team_coverage` — backoffice role days, not school caseload
- `skillBuildersEventProviders.service.js` — SB display roster, not shift requests
- `school_provider_schedule_entries` — legacy; soft slots are preferred
