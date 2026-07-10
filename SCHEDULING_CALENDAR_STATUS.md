# Scheduling & Calendar System — Status Tracker

> **Living document.** Updated after each development session.
> Last updated: July 9, 2026

---

## Glossary — Assigned vs Booked vs Open

Staff often confuse three different concepts. They live on different tables:

| Concept | Where it lives | Meaning |
|---------|----------------|---------|
| **Hold type** (was “Mode”) | `office_standing_assignments.availability_mode` | Recurring commitment: **Standing** (`AVAILABLE` = open-ended weekly/biweekly) vs **Temporary** (finite window with `temporary_until_date`). Does **not** mean the hour is free or booked. |
| **Booking** | `office_booking_plans` + `office_events.slot_state` | Whether occurrences are booked for client work. Grid red / `ASSIGNED_BOOKED` = this occurrence is booked. |
| **Open** | No active standing owner (or company hold / cancelled) | Room hour free for assign/request. |

A provider can be **Standing + Booked** at the same time: they own the weekly slot, and this week’s occurrence is booked.

**Primary UX:** My Schedule (`/dashboard?tab=my_schedule`). Buildings schedule is the master building grid of the same data. Provider Management → Office availability is a **report**, not the booking calendar.

---

## Phase 2e — Consolidation (July 9, 2026)

- Provider Management office table: Mode → Hold type; Booking column; hide staff/admin holds by default (`includeStaffHolds`).
- Slot modal Assign: frequency-key twin retirement on standing `update` (Grace BIWEEKLY→WEEKLY).
- Write pipeline: await materialize on staff assign / keep-available / temporary / recurrence; `staffBookEvent` upserts booking plan; booking-request approve uses `upsertBookingPlanAndMaterialize`.
- Nav: `/admin/schedule-approvals` redirects to `/admin/availability-intake`; Schedule hub cards clarify My Schedule vs Buildings master grid; My Schedule toolbar link to approve office requests.
- Legacy: `getWeeklyGrid` no longer creates events from `office_room_assignments` without standing ids; provider picker excludes admin/super_admin by default; standing assign rejects non-providers unless `allowStaffHold`.
- Script: `backend/src/scripts/inventoryStaffOfficeHolds.js` (dry-run; `--apply` to deactivate).

---

## Phase 2d — Weekly Reliability (July 9, 2026)

Root cause of “weekly rooms fall off every week”: watchdog `deactivateStaleStandingAssignments` killed AVAILABLE weekly standing rows when week-2+ events were missing (often after a non-blocking booking-plan failure or TEMPORARY/until-date caps). Staff re-approved → one week appeared → repeat.

### Changes shipped

| Area | Fix |
|------|-----|
| `officeStandingAssignmentMaintenance.service.js` | Only auto-deactivates expired **TEMPORARY** windows. AVAILABLE weekly/biweekly orphans are logged + rematerialized (12 weeks), never hard-killed for missing future events |
| Intake approve (`assignTemporaryOfficeFromRequest`) | Open-ended weekly (`AVAILABLE`, no until/count); booking-plan upsert is **blocking**; per-hour plans for multi-hour blocks; uses `OfficeStandingAssignment.create` (orphan active-slot takeover) |
| `OfficeStandingAssignment.resolveDuplicateSlotInsert` | Reactivates same-provider rows; takes over orphaned active physical slots; clean 409 on real conflicts |
| Materializer | AVAILABLE weekly ignores historical `temporary_until` / `active_until` / occurrence caps from old “weekly × 6” path |
| Migration `900_repair_open_ended_weekly_office_assignments.sql` | Clears until/count caps on active AVAILABLE weekly standing + plans |
| `getUserScheduleSummary` | Force-materializes viewed week + 2 ahead; returns `frequency` / `frequencyLabel` / `bookedFrequency` |

### Manual verification checklist

| Scenario | Expected |
|----------|----------|
| Approve Grace stuck intake (active-slot dup key) | Approves; slot appears; no raw MySQL error |
| Approve/re-book Gini weekly | Weeks 2–4 red on office grid; persists after refresh |
| Watchdog after weekly approve | `staleDeactivatedCount` does not include AVAILABLE weekly rows; may log rematerialize orphans |
| My Schedule for weekly provider | Shows Weekly label; week-2 blocks present |
| DROP_ASSIGNMENT / conflict resolver / kiosk | Still work (smoke) |

### Deferred (not this pass)

- Retire same-day `createIfRoomOpen` / legacy `office_room_assignments` grid backfill
- Merge all approval UIs into one screen
- Change 6-week confirm / DROP_ASSIGNMENT policy

---

## Phase 1 Stabilization (July 2026)

Fixes for reports of bookings appearing then disappearing, and recurring slots only showing for one week.

### Changes shipped

| Area | Fix |
|------|-----|
| `getWeeklyGrid` | Awaits `materializeWeek` before reading events (eliminates read-then-mutate race) |
| Materializer | Passes `replaceCancelled: true` when rematerializing standing assignments |
| Recurring approval | `invalidateOffice` + 12-week materialization after `approveOfficeBookingRequest` |
| Write paths | `invalidateOffice` on booking-plan, recurrence, keep-available, extend-temporary |
| Watchdog | `force: true` materialization before stale cleanup; 48h guard on stale deactivation |
| Week anchors | `useExactWeekStart: true` on schedule-summary and provider-availability materializers |
| Frontend | Office mutations always invalidate 90s schedule-summary cache + force refresh |
| Frontend | Office grid stale-while-revalidate (no blank flash on reload) |
| Logging | `[getWeeklyGrid]`, `[materializeWeek]`, `[watchdog]` structured logs |

### Manual verification checklist

| Scenario | Expected |
|----------|----------|
| Staff assigns recurring block (e.g. 11–4 weekly) | All hours visible immediately; persist after refresh |
| Admin approves recurring office request | Weeks 2–12 populated without navigating each week |
| Book assigned slot (once + recurring) | Stays visible after refresh; no revert after 90s |
| Biweekly booking on off-week | Slot open on off-week, booked on on-week — consistent across refreshes |
| Load grid twice within 15s | Same data both times (no flicker/vanish) |
| Watchdog run after new assignment | Assignment not deactivated within 48h of creation |

### Deferred to Phase 2

- ~~Retire `office_room_assignments` write path~~ → **Done (Phase 2a)**
- ~~Unify legacy vs canonical approval onto shared materialization service~~ → **Done (Phase 2a)**
- ~~Fix MONTHLY recurrence semantics~~ → **Done (Phase 2b)**
- ~~Move integrity auto-cancel off GET diagnostics~~ → **Done (Phase 2b)**
- ~~Consolidate three request queues into one UI~~ → **Done (Phase 2b — unified approvals tabs)**
- Retire legacy `office_room_assignments` reads (payroll/kiosk still use for historical data) → **Done (Phase 2c)** — canonical reads with legacy fallback in `officeProviderLocation.service.js`

### Phase 2c — Payroll & kiosk reads (July 2026)

| Area | Fix |
|------|-----|
| `officeProviderLocation.service.js` | `resolvePrimaryOfficeForUser` (standing → legacy fallback); `listProvidersAtLocationOnDate` (from `office_events`) |
| Payroll primary office | Reads active standing assignments first |
| Kiosk provider list | Reads materialized `office_events` for the date (not `office_room_assignments`) |

---

## Phase 2b — Integrity, MONTHLY, Unified Queue (July 2026)

### Changes shipped

| Area | Fix |
|------|-----|
| `officeScheduleIntegrity.service.js` | Read-only `scanIntegrityIssues`; mutations via `autoResolveIntegrityIssues` |
| `GET /admin/integrity-diagnostics` | Read-only scan (no side effects on page load) |
| `POST /admin/integrity-diagnostics/auto-resolve` | Cancels same-provider duplicate events; deactivates duplicate standing assignments |
| Conflict resolver UI | Auto-resolve runs on refresh; shows summary banner |
| Materializer `MONTHLY` | Books every 28 days from anchor (was incorrectly booking every week) |
| Intake approval | Booking plan uses `MONTHLY` frequency (not approximated as weekly) |
| `GET /admin/pending-queue-summary` | Counts across booking, intake, and legacy queues |
| `GET /admin/pending-intake-requests` | Cross-agency intake list for schedule managers |
| Office booking approvals UI | Tabs: Booking requests · Availability intake · Legacy room requests |

### MONTHLY semantics

Monthly recurrence uses a **28-day cadence** from `booking_start_date`, consistent across:
- `officeSlotSeries.generateOccurrenceDates`
- `officeScheduleMaterializer.shouldBookOnDate`
- Frontend occurrence previews

Standing assignments remain weekday-based (`WEEKLY` assigned_frequency); the booking plan's `booked_frequency = MONTHLY` controls which weeks materialize as booked.

### Manual verification checklist

| Scenario | Expected |
|----------|----------|
| Open conflict resolver / refresh | Same-provider duplicates auto-resolved; GET diagnostics is read-only |
| Approve monthly intake request (× 6) | ~6 booked occurrences at 28-day intervals, not every week |
| Set booking plan to MONTHLY on grid | Off-weeks open; booked slots every 28 days |
| Office booking approvals tabs | Counts match pending items in each queue |
| Approve intake from approvals tab | Modal opens; approval materializes via canonical path |

---

## Phase 2 — Unified Booking Pipeline (July 2026)

All new office assignment writes now flow through one canonical path:

```
office_standing_assignments (+ optional office_booking_plans)
  → officeAssignmentOrchestrator.service.js
  → OfficeScheduleMaterializer.materializeWeek()
  → office_events
```

### Changes shipped

| Area | Fix |
|------|-----|
| `officeAssignmentOrchestrator.service.js` | New shared module: `materializeOfficeWeeks`, `assignOneTimeOfficeBlock`, `upsertBookingPlanAndMaterialize` |
| `staffAssignOpenSlot` (ONCE) | Temporary standing assignments instead of `office_room_assignments` |
| `approveRequest` (legacy room requests) | Canonical one-time block via orchestrator |
| `approveOfficeBookingRequest` (ONCE) | Standing + booking plan + materialized events (replaces direct `createIfRoomOpen`) |
| `assignTemporaryOfficeFromRequest` | Uses shared `upsertBookingPlanAndMaterialize` |

### Still legacy (read-only / historical)

- `getWeeklyGrid` backfills from existing `office_room_assignments` rows for pre-migration data
- Payroll primary office address still reads `office_room_assignments` (fallback until migrated)

### Manual verification checklist

| Scenario | Expected |
|----------|----------|
| Admin one-time assign on grid (ONCE) | Grey assigned slots with standing_assignment_id; no new `office_room_assignments` row |
| Approve legacy one-time room request | Same — events linked to standing assignment |
| Approve ONCE office booking request (with client) | Red booked slot; client context preserved |
| Approve availability intake request (weekly) | Booking plan + 6–12 week materialization via orchestrator |
| Recurring admin assign | Unchanged — already canonical |

---

## How the System Works (Architecture)

The platform has **two parallel session pipelines** that must stay in sync:

```
PUBLIC SIDE                           INTERNAL SIDE
─────────────────────────────────     ─────────────────────────────────────────
PublicProviderFinderView              OfficeScheduleView (admin)
PublicTutorFinderView                 AvailabilityIntakeManagement (admin)
                │                                    │
                ▼                                    ▼
public_appointment_requests       provider_office_availability_requests
        (PENDING)                  office_booking_requests
                │                  office_standing_assignments
                ▼                  office_booking_plans
     Admin approves                office_events  ◄── materialized by watchdog
                │
                ├─ IN_PERSON ──► finds ASSIGNED_AVAILABLE office_event → ASSIGNED_BOOKED
                └─ TUTORING  ──► creates learning_class_session + booking
```

**Week anchor:** All materialization uses `startOfWeekMonday() + useExactWeekStart: true` (Monday–Sunday grid). This was standardized across all five paths that call `materializeWeek` to prevent cache key mismatches and Sunday-slot gaps.

---

## Core Tables (Scheduling Domain)

| Table | Purpose | Status |
|-------|---------|--------|
| `office_locations` | Physical buildings | ✅ |
| `office_rooms` | Rooms within a building | ✅ |
| `office_location_agencies` | Which agencies can use each office | ✅ |
| `office_standing_assignments` | Provider assigned to room+day+hour recurring | ✅ |
| `office_booking_plans` | Active booking plan for a standing assignment | ✅ |
| `office_events` | Materialized 1-hour slots (ASSIGNED_AVAILABLE / ASSIGNED_BOOKED / CANCELLED) | ✅ |
| `office_booking_requests` | Frequency-aware booking + DROP_ASSIGNMENT requests | ✅ |
| `provider_office_availability_requests` | Legacy per-slot approval requests | ✅ |
| `public_appointment_requests` | Public-facing booking requests | ✅ + new columns (865) |
| `learning_class_sessions` | Individual / group tutoring sessions | ✅ + new columns (866) |
| `learning_program_classes` | Class container for sessions | ✅ |
| `office_event_checkins` | Kiosk client check-in records | ✅ |
| `office_ehr_sync_log` | EHR sync run health per location | ✅ migration 867 |

**New columns added (recent migrations):**

| Column | Table | Migration | Purpose |
|--------|-------|-----------|---------|
| `last_ics_overlap_at` | `office_events` | 864 | Last confirmed ICS overlap |
| `ics_flag_type` | `office_events` | 864 | Coverage flag: no_coverage / non_clinical_busy / partial_coverage |
| `ics_flagged_at` | `office_events` | 864 | When flag was set |
| `ics_flag_cleared_by_user_id` | `office_events` | 864 | Admin who cleared it |
| `ics_flag_cleared_at` | `office_events` | 864 | When admin cleared it |
| `linked_office_event_id` | `public_appointment_requests` | 865 | Office event booked on approval |
| `linked_session_id` | `public_appointment_requests` | 865 | Tutoring session created on approval |
| `office_event_id` | `learning_class_sessions` | 866 | Room for in-person tutoring |
| `provider_user_id` | `learning_class_sessions` | 866 | Direct tutor association |

---

## What's Built & Working

### Office Scheduling Core
- [x] Standing assignments + booking plans + event materialization (Mon–Sun grid, Monday anchor)
- [x] Admin weekly grid view per office location
- [x] Booking requests: one-time, weekly, biweekly, monthly with occurrence-count validation
- [x] Legacy approval path (provider_office_availability_requests) auto-creates booking plan + materializes events
- [x] Self-conflict bug fix: re-approvals no longer blocked by own assignment
- [x] Pre-flight series validation: exact blocked date/room/provider in error messages
- [x] DROP_ASSIGNMENT workflow: watchdog queues for admin review instead of auto-dropping
- [x] Bi-weekly 6-week check-in reminder (provider confirms slot still needed)
- [x] Manual approval required to drop — no more auto-expiry
- [x] Read-only hallway board at `/office-schedule/board/:locationId?key=`

### Conflict Resolution
- [x] Integrity diagnostics: duplicate events/assignments/provider double-bookings
- [x] Auto-resolution of same-provider duplicates (cancel redundant events)
- [x] Weekly calendar conflict grid with hover details + color grouping
- [x] Rebook button: reassigns duplicate to another available room
- [x] Cross-room double-booking indicator on conflict entries
- [x] Inactive/archived provider cleanup (all future events cancelled)
- [x] Unique constraints enforced at DB level (migration 863)

### EHR / ICS Session Verification
- [x] ICS sync reads provider Therapy Notes calendar (via ICS URL each provider pastes in profile)
- [x] EHR sync now scans ASSIGNED_BOOKED events too (not just ASSIGNED_AVAILABLE) to refresh `last_ics_overlap_at`
- [x] Structured logging: ICS feed failures now emit console.warn with provider/location context
- [x] `office_ehr_sync_log` table tracks per-run stats: scanned, booked, overlap_updated, feeds_ok/failed
- [x] **Coverage audit** runs at 6-week cadence (same as booking confirm reminder):
  - Clinical keyword filter: `therapy / counseling / session / consultation / intake / tutoring / evaluation / assessment / treatment / supervision`
  - **Bookend rule**: if first + last hour of a contiguous same-day block have clinical ICS overlap → all middle hours are covered (no flag)
  - **Partial coverage**: first hour covered, last uncovered → tail hours flagged as `partial_coverage`
  - No ICS overlap at all → `no_coverage`
  - Non-clinical ICS event (busy but no keyword match) → `non_clinical_busy`
- [x] **Auto-drop is disabled** — `downgradeBookedWithoutExternalOverlap` is a no-op; all coverage decisions go to admin
- [x] Admin Coverage Flags page (`/admin/office-coverage-flags`) with Keep / Release actions
- [x] `GET /api/office-schedule/admin/ehr-sync-health` shows last 7 days of sync run stats

### Public Booking Integration
- [x] `publicProviderAvailability` (legacy finder) notifies provider on new request creation (was silent before)
- [x] `publicAgencyServices` (slug-based finder) already sent notifications — unchanged
- [x] On **APPROVED** in-person request: finds matching `ASSIGNED_AVAILABLE` office_event → marks `ASSIGNED_BOOKED` with MySQL named lock (prevents double-booking race condition)
- [x] `linked_office_event_id` stored on approved request for admin UI linkage
- [x] Admin Appointments tab shows "Office booked ✓" pill when booking auto-created
- [x] Approval response includes `linkedOfficeEventId`

### Tutoring Booking
- [x] Public tutor finder (`/:orgSlug/find-tutor`) creates `public_appointment_requests` with `service_type = tutoring`, subject area, grade level
- [x] On **APPROVED** tutoring request: find-or-create a `Private Tutoring` `learning_program_classes` (keyed `private_tutoring_{providerId}` per agency), then create `learning_class_session` with `mode = individual`, `session_subtype = tutoring`
- [x] In-person tutoring: session's `office_event_id` links to the booked room
- [x] Provider receives `tutoring_session_scheduled` notification with direct session launch URL
- [x] `VirtualTutoringSessionView` and `InPersonTutoringSessionView` are wired to `learning_class_sessions.id`

### Watchdog (Daily Tasks — `officeScheduleWatchdog.service.js`)
- [x] Daily ICS sync (refreshAllLocationsFromEhr) — marks ASSIGNED_AVAILABLE → ASSIGNED_BOOKED when TN overlap
- [x] Auto-book from internal provider_schedule_events (Phase A)
- [x] 6-week booking confirm reminders to providers
- [x] 6-week ICS coverage audit (new — flags insufficient clinical coverage)
- [x] Stale available slot pipeline: warn → queue DROP_ASSIGNMENT for admin review
- [x] Inactive/archived provider cleanup
- [x] Google Calendar mirror sync
- [x] Stale standing cleanup: expired TEMPORARY only; AVAILABLE weekly orphans rematerialized (Phase 2d)

---

## What's Partially Built / Needs Attention

### Kiosk (tables exist, basic check-in works — needs survey integration)
- [x] Kiosk route (`/kiosk/:locationId`) — touch-friendly, no PHI displayed
- [x] PIN-based slot identification (MMDD of DOB)
- [x] `office_event_checkins` table populated on check-in
- [x] Provider slot-turns-green on check-in (socket event)
- [ ] **Survey/questionnaire engine** (PHQ-9 / GAD-7) — tables exist from migration 241 but no active survey-to-kiosk link
- [ ] **Longitudinal score tracking** — line graph per provider+slot over time
- [ ] **PDF export** of survey results for EHR upload
- [ ] The spec calls for kiosk to show only providers booked TODAY at that location — verify this filter is enforced

### Credential Compliance Gating (tables exist — scheduling does not check them)
- [x] `user_compliance_documents` table exists (migration 110)
- [x] `is_blocking` column on credentials
- [ ] **Scheduling access gate**: if `is_blocking = true` and `expiration_date < today`, the provider should be blocked from office booking / standing assignment approval
- [ ] Credential expiration watchdog (30/14/1 day reminders) — `officeScheduleWatchdog` could add a `checkCredentialExpirations()` task
- [ ] Navigation: hide Schedule tab or show warning when credential is blocking

### Appointment Taxonomy Consistency
- [x] `office_events` has `appointment_type_code`, `appointment_subtype_code`, `service_code`, `modality`, `status_outcome` columns (migrations 445–446)
- [ ] Public booking → approval currently does not map `service_type` to `appointment_type_code` in the booked event
- [ ] Tutoring sessions created on approval do not populate `appointment_type_code` on the linked office event
- [ ] Service code eligibility by provider credential is specified but not enforced

### EHR Integration (deeper than ICS)
- Current: each provider pastes their personal Therapy Notes ICS URL — read-only busy detection only
- [ ] **Phase 2**: Therapy Notes REST API integration (when available) to pull actual session titles, client IDs, billing codes
- [ ] **Admin visibility**: show a direct link to each provider's TN calendar from the Coverage Flags page
- [ ] `ensureAppointmentContext` is called when booking with `clientId` — but most bookings don't provide clientId from the public booking flow

### Guardian Portal for Tutoring
- [x] Guardian accounts created when `create_guardian = true` on intake link
- [x] Guardian dashboard shows Skill Builders card
- [ ] Guardian dashboard does not yet show scheduled tutoring sessions or launch buttons
- [ ] No guardian email notification when tutoring session is approved (provider gets it; guardian does not)

---

## What's Not Yet Built (Planned / Specced)

### From OVERHAUL_PLAN.md (Integrated Operations Platform)

| Item | Spec Location | Priority |
|------|---------------|----------|
| Credential expiration watchdog (30/14/1 day reminders) | OVERHAUL_PLAN §5.2 | High |
| Compliance hard block on scheduling if credential expired | OVERHAUL_PLAN §5.2 | High |
| After-hours auto-responder (Twilio) | OVERHAUL_PLAN §4.6 | Medium |
| Quiet hours gatekeeper per user | OVERHAUL_PLAN §4.5 | Medium |
| Emergency broadcast (SMS + email, throttled) | OVERHAUL_PLAN §5.1 | Medium |
| Kiosk survey engine (PHQ-9 / GAD-7) | Office_Tab_Scheduling_Kiosk_Spec §3.4 | High |
| Kiosk PDF export for EHR upload | Office_Tab_Scheduling_Kiosk_Spec §3.4 | Medium |
| SVG office map with room click-to-schedule | Office_Tab_Scheduling_Kiosk_Spec §5 | Low |
| Payroll-triggered provider availability confirmation | Office_Tab_Scheduling_Kiosk_Spec §3.2 | Medium |
| Document compliance dashboard (admin) | OVERHAUL_PLAN §3 | Medium |
| AcroForm automation (I-9, W-4 via pdf-lib) | OVERHAUL_PLAN §1.2 | Low |
| W-2 digital locker | OVERHAUL_PLAN §3 | Low |
| Masked Twilio messaging | OVERHAUL_PLAN §4.1 | Medium |
| Appointment taxonomy full enforcement | scheduling_booking_spec.md | High |

---

## What's Next (Recommended Order)

### 1 — Credential Compliance → Scheduling Gate (HIGH — safety/legal risk)
The system currently has no enforcement that a provider with an expired blocking credential can't book or hold an office slot. This is a compliance gap.

**Steps:**
- Add `checkCredentialExpirations()` to watchdog (30/14/1 day notifications)
- Add middleware check in `staffBookEvent` and `assignTemporaryOfficeFromRequest`: if provider has `is_blocking = true` AND `expiration_date < today` → 403 with clear message
- Navigation: show a warning badge on the Schedule tab or hide booking actions

**Files:** `officeScheduleWatchdog.service.js`, `officeSlotActions.controller.js`, `availability.controller.js`

---

### 2 — Kiosk Survey Engine (HIGH — core product promise)
The kiosk spec says providers should see check-in status + survey scores over time. Tables exist from migration 241 (`office_kiosk_event_tables`) but no active survey rendering.

**Steps:**
- Add PHQ-9 / GAD-7 survey flow to kiosk check-in (after PIN entry, before submit)
- Store `answers (JSON)` and `score` per check-in
- Provider dashboard: line graph of scores per slot signature over time
- PDF export button for EHR upload

**Files:** `kiosk.controller.js`, `KioskView.vue`, new `OfficeSurveyView.vue`

---

### 3 — Guardian Notification for Tutoring Sessions
When a tutoring session is approved and created, the guardian/client email should receive a notification with the session URL.

**Steps:**
- In `createTutoringSessionForPublicRequest`: look up the `created_guardian_user_id` or `matched_client_id`'s linked guardian
- Send `tutoring_session_scheduled` notification to guardian with session link
- Update guardian dashboard (`GuardianDashboardView.vue`) to show upcoming tutoring sessions

**Files:** `availability.controller.js`, `GuardianDashboardView.vue`

---

### 4 — Appointment Taxonomy on Bookings
When a public request is approved and an office event is booked, `appointment_type_code` and `service_code` should be populated from the request's `service_type`.

**Steps:**
- Map `public_appointment_requests.service_type` to a valid `appointment_type_code` (lookup via `schedulingTaxonomy.service.js`)
- Pass to `OfficeEvent.markBooked()` in `bookOfficeEventForPublicRequest`
- Tutoring office events get `appointment_type_code = 'tutoring'` (or equivalent)

**Files:** `availability.controller.js`, `schedulingTaxonomy.service.js`

---

### 5 — Payroll-Triggered Availability Confirmation
Per the spec: when payroll is posted, prompt provider on login to confirm their in-office availability.

**Steps:**
- Add a `payroll_posted_at` event listener or notification trigger
- On provider login after payroll post: show modal "Confirm your in-office availability"
- Link directly to provider availability grid

**Files:** Payroll controller (find post endpoint), provider login flow, new modal component

---

## Key Invariants (Things That Must Always Be True)

These are rules the codebase enforces that must not be broken by future changes:

1. **Week anchor**: All calls to `OfficeScheduleMaterializer.materializeWeek()` MUST use `OfficeScheduleMaterializer.startOfWeekMonday()` + `useExactWeekStart: true`. Breaking this causes Sunday-slot gaps and grid/cache mismatches.

2. **Named lock before booking**: Any path that transitions an `office_event` from `ASSIGNED_AVAILABLE` to `ASSIGNED_BOOKED` MUST acquire `GET_LOCK('office_slot_{eventId}', 5)` first to prevent double-booking race conditions.

3. **Auto-drop is disabled**: `downgradeBookedWithoutExternalOverlap` is intentionally a no-op. Do not re-enable auto-cancellation without admin confirmation workflow.

4. **Coverage audit is flag-only**: `auditIcsCoverageForLocation` sets flags but NEVER changes booking states, cancels events, or deactivates assignments. Admin resolves flags via Keep/Release.

5. **No assignment without booking plan on approve**: `assignTemporaryOfficeFromRequest` (legacy approval) MUST call `OfficeBookingPlan.upsertActive()` immediately after creating the standing assignment so the materializer emits `ASSIGNED_BOOKED` (not `ASSIGNED_AVAILABLE`).

6. **EHR sync scans both states**: `refreshLocationBookingsFromEhr` must include both `'ASSIGNED_AVAILABLE'` and `'ASSIGNED_BOOKED'` in its slot_state filter — available slots get promoted, booked slots get `last_ics_overlap_at` refreshed.

7. **Migration convention**: Always add new migrations as `.sql` files in `database/migrations/` named `{next_number}_{short_description}.sql`. Never add inline migrations.

8. **PENDING_EVAL session requests must not be directly approved**: Any request with `status = 'PENDING_EVAL'` is blocked until its paired evaluation appointment (`appointment_role = 'evaluation'`) is approved. Approving the evaluation automatically promotes the session to `PENDING`. Direct approval of `PENDING_EVAL` returns HTTP 409.

---

## Appointment Taxonomy

`public_appointment_requests` carries three complementary type fields:

| Field | Values | Purpose |
|-------|--------|---------|
| `service_type` | `counseling`, `tutoring` | Broad service category |
| `session_type` | `evaluation`, `tutoring`, `counseling`, `consultation` | Granular appointment type within service |
| `appointment_role` | `session`, `intake`, `evaluation` | Role in the paired-request chain |

### Provider enrollment types (`provider_public_service_enrollments.service_type`)

| Value | Effect |
|-------|--------|
| `counseling` | Appears on the "Find a Counselor" public page |
| `tutoring` | Appears on the "Find a Tutor" public page |
| `evaluation` | Listed as an available evaluator when new tutoring clients need a pre-session academic evaluation |

Manage via **Provider Profile → Public Listings** toggle (three checkboxes).

### Evaluation gate flow (new tutoring clients)

```
New client books tutoring slot
        │
        ▼
Wizard step: "Has the student had academic testing in the past 3 months?"
        │
      Yes ──► Normal single request (session_type = tutoring, status = PENDING)
        │
       No ──► evalRequired = true
              │
              ├─ Provider enrolled for 'evaluation'?
              │     Yes ──► Same provider: selected slot becomes eval, client picks new session slot
              │     No  ──► Show evaluator list from GET /:slug/evaluators; client picks evaluator + eval slot
              │
              ▼
         Two paired requests created:
           Req 1: appointment_role = 'evaluation', session_type = 'evaluation', status = PENDING
           Req 2: appointment_role = 'session',    session_type = 'tutoring',   status = PENDING_EVAL (blocked)
           Both: paired_request_id pointing to each other

Admin approval flow:
  1. Eval request (PENDING) → admin approves → Req 2 automatically promoted PENDING_EVAL → PENDING
  2. Guardian receives "evaluation approved" email with session time
  3. Session request now approvable → admin approves → learning_class_session created
```

### What is NOT yet implemented (documented for future work)

- **Automatic assessment recency check**: Currently the "3 months" rule is self-reported by the client on the booking form. A future enhancement would auto-check `learning_evidence` records for the client to verify.
- **Credential-based evaluation eligibility**: Future — only providers meeting specific credential thresholds (e.g. licensed clinicians) should be enrollable as evaluators. Hold until credential compliance module is re-enabled.
- **Current client fast-path**: Existing clients skip the eval gate. Future: if a current client's last assessment was > 3 months ago (detectable from `learning_evidence`), prompt them to schedule a re-evaluation.

---

## File Map (Key Scheduling Files)

| File | Role |
|------|------|
| `backend/src/services/officeScheduleMaterializer.service.js` | Generates office_events from standing assignments + booking plans |
| `backend/src/services/officeScheduleEhrSync.service.js` | ICS overlap sync + 6-week coverage audit |
| `backend/src/services/officeScheduleWatchdog.service.js` | Daily/6-week automated tasks |
| `backend/src/services/officeSlotSeries.service.js` | Shared recurrence logic + pre-flight conflict validation |
| `backend/src/controllers/officeSchedule.controller.js` | Weekly grid, conflict resolver, coverage flags, EHR health |
| `backend/src/controllers/officeSlotActions.controller.js` | Book/unbook/set outcome on individual events |
| `backend/src/controllers/availability.controller.js` | Legacy office requests + public request approval (now creates real bookings) |
| `backend/src/controllers/publicProviderAvailability.controller.js` | Legacy public finder (agencyId + key) |
| `backend/src/controllers/publicAgencyServices.controller.js` | Slug-based counseling + tutoring + evaluator finder; eval-required booking creation |
| `backend/src/controllers/kiosk.controller.js` | Kiosk check-in |
| `backend/src/routes/officeSchedule.routes.js` | All /api/office-schedule/* routes |
| `frontend/src/views/OfficeScheduleView.vue` | Main provider/admin office schedule view |
| `frontend/src/views/admin/OfficeBookingConflictResolverView.vue` | Conflict resolver dashboard |
| `frontend/src/views/admin/OfficeCoverageFlagsView.vue` | ICS coverage flags dashboard (new) |
| `frontend/src/views/admin/OfficeScheduleAuditView.vue` | Full schedule audit / print report |
| `frontend/src/components/admin/AvailabilityIntakeManagement.vue` | Office + public request approvals (PENDING_EVAL-aware) |
| `frontend/src/components/publicServices/PublicBookingWizard.vue` | Multi-step booking wizard with eval gate step |
| `frontend/src/views/tutoring/VirtualTutoringSessionView.vue` | Virtual tutoring session UI |
| `frontend/src/views/tutoring/InPersonTutoringSessionView.vue` | In-person tutoring session UI |
| `frontend/src/views/public/PublicTutorFinderView.vue` | Public tutor booking page |
| `database/migrations/864–868_*.sql` | Most recent scheduling and taxonomy migrations |
