# Scheduling & Calendar System — Status Tracker

> **Living document.** Updated after each development session.
> Last updated: June 16, 2026

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
| `backend/src/controllers/publicAgencyServices.controller.js` | Slug-based counseling + tutoring finder |
| `backend/src/controllers/kiosk.controller.js` | Kiosk check-in |
| `backend/src/routes/officeSchedule.routes.js` | All /api/office-schedule/* routes |
| `frontend/src/views/OfficeScheduleView.vue` | Main provider/admin office schedule view |
| `frontend/src/views/admin/OfficeBookingConflictResolverView.vue` | Conflict resolver dashboard |
| `frontend/src/views/admin/OfficeCoverageFlagsView.vue` | ICS coverage flags dashboard (new) |
| `frontend/src/views/admin/OfficeScheduleAuditView.vue` | Full schedule audit / print report |
| `frontend/src/components/admin/AvailabilityIntakeManagement.vue` | Office + public request approvals |
| `frontend/src/views/tutoring/VirtualTutoringSessionView.vue` | Virtual tutoring session UI |
| `frontend/src/views/tutoring/InPersonTutoringSessionView.vue` | In-person tutoring session UI |
| `frontend/src/views/public/PublicTutorFinderView.vue` | Public tutor booking page |
| `database/migrations/864–867_*.sql` | Most recent scheduling migrations |
