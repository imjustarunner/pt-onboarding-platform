# Scheduling/Booking System Restructure + Clinical Note/Billing Integration (Cursor Spec)

## 0) One-paragraph context (put this at the top of your Cursor request)
We have an existing scheduling “spine” (weekly grid via `/users/:id/schedule-summary`) with office booking + supervision overlays and Google Calendar read/write sync already working. Separately, we now have a clinical data plane (`/api/clinical-data/*`) and a retention panel, but the **Note Aid / Clinical Note Generator** flow is not yet persisted into the clinical data plane and some context still has to be entered manually (e.g., `officeEventId`). This document specifies **incremental changes** to unify appointment types, enforce service-code/credential booking eligibility, attach notes + billing claim context to each booked session, and complete the integration between **booking → clinical session → note → billing**—without redesigning the schedule grid.

---

## 1) What exists today (do not rebuild; extend)
### 1.1 Unified schedule view (already working)
- Weekly schedule is built by `/users/:id/schedule-summary` and overlays:
  - office events/requests
  - school blocks/requests/assignments
  - supervision sessions
  - Google overlays (free/busy + list events)

**Reference:** `user.controller.js` (around lines 2104–2480 in your snippet)

### 1.2 Office booking flow (already working)
- Provider grid “book a slot” posts to `/office-schedule/booking-requests`:
  - If `ONCE` + same-day + room open ⇒ immediately creates BOOKED office event (`kind: auto_booked`)
  - Else ⇒ creates pending booking request (`kind: request`)

**Reference:** `officeSchedule.controller.js` (around lines 1487–1637)

### 1.3 Staff booking tools (already working)
- Staff routes under `/api/office-slots` support booking plan, book/unbook, assign open slots, etc.

**Reference:** `officeSlotActions.routes.js` (lines 26–41)

### 1.4 Google Calendar integration (already working)
- Read: freeBusy + listEvents overlays
- Write: office events booked/unbooked + supervision sessions create/update/cancel
- Service account w/ domain-wide delegation is in place.

**References:** `googleCalendar.service.js` (lines 46–66), `officeSlotActions.controller.js` (lines 382–425), `supervisionSessions.controller.js` (lines 104–226)

### 1.5 Supervision sessions + goals/policy (already working)
- Supervision session scheduling + optional Meet link sync is already implemented.
- Supervision policy defaults exist (tier rules, cadence, etc.).

**Reference:** `supervision.service.js` (lines 6–22)

### 1.6 Clinical data plane + retention panel (already working, partial integration)
- Routes mounted: `/api/clinical-data` and `/api/clinical-notes` are both live.
- Clinical session bootstrap requires `{ agencyId, clientId, officeEventId }`.
- Eligibility enforces: `client_type === clinical` and `OfficeEvent.status === BOOKED`.
- Retention panel works well **when context is provided**, but:
  - Billing desk still accepts `officeEventId` manually.
  - Note Aid “approve output” currently **only clears the form** and does not persist into `/clinical-data`.

**References:** `server.js` (lines 568–579), `clinicalData.routes.js` (lines 20–33), `clinicalEligibility.service.js` (lines 29–50), `LearningBillingDeskView.vue` (lines 40–49), `ClinicalNoteGeneratorView.vue` (approve flow around lines 1305–1315)

---

## 2) Goals (what to implement / change)
### 2.0 Scope guardrail (required)
- Tools and aids are agency-level only and must be accessed via **My Dashboard**.
- Do not attach tools/aids to sub-organizations, schools, or any school/other portal surfaces.

### 2.1 Unify appointment types + subtypes (new)
Add a consistent “appointment taxonomy” across schedule items (office events, supervision, blocks, meetings, etc.) so the scheduler can support new appointment types (e.g., group therapy, telehealth) **without redesign**.

**Source of truth requirement:** appointment types/subtypes must be stored in DB lookup tables first, with backend and frontend consuming those records (not hard-coded-only enums).

### 2.2 Each booked session attaches:
- a clinical note record context (with template auto-selection by appointment type + service code)
- billing/claim context
- a service code assignment
...and enforces **service code eligibility by credential** at booking and edit time.

When a slot becomes `BOOKED`, and when a provider opens an already-booked slot, the system must idempotently ensure these linkages exist.

### 2.3 Booking and display rules
- Color-coded schedules by appointment type (intake/session/supervision/blocks)
- Assignments never display client names in the grid—only slot status.
- Sessions can always be marked: **Missed**, **No-Show**, **Canceled**.
- **Canceled** requires a reason. Note-writing remains available for all outcomes.

### 2.4 Finish the integration loop
- Booking → clinical session bootstrap should be automatic.
- Note Aid “Approve note output” must persist the approved note into `/clinical-data/...` (and still keep AI output transient until approval).
- Billing desk should not require manual `officeEventId` entry—derive it from the selected ledger/session row.

---

## 3) Appointment taxonomy (types/subtypes) + coloring
### 3.1 Types
- `Session`
- `Supervision`
- `Assessment/Evaluation`
- `Available Slot`
- `Schedule Block`
- `Meeting`
- `Event`
- `Indirect Services`

### 3.2 Subtypes (minimum set)
- Under **Available Slot**
  - `Available Intake`
  - `Available Session`
- Under **Event**
  - `Personal`
  - `Schedule Hold`

### 3.3 Requirements
- Every schedule item rendered in the weekly grid must map to:
  - `appointmentType`
  - optional `appointmentSubtype`
- Define a single source of truth for taxonomy and color mapping in DB lookup tables, with FE constants generated/synced from API payload metadata.
- Allow adding new types/subtypes without schema redesign (additive DB lookup rows + additive validation rules).

---

## 4) Availability, office restrictions, and assignments (extend existing behavior)
### 4.1 Provider availability per company and time
- Providers set availability per **company/agency**.
- Restrict scheduling for companies the provider is not assigned to.

### 4.2 Office constraints + UX warnings
- If a provider tries to schedule outside their assigned offices:
  - show notification + call-to-actions:
    - “Contact support”
    - “View available offices”
- Office availability view:
  - show therapist assignments per office and time
  - allow requests for unbooked office slots
  - approval workflow for those requests

> Keep the current booking-request approval mechanism; extend it so that “unbooked office slot requests” can be approved/denied similarly.

---

## 5) Recurring appointments (new)
### 5.1 Backend
- Support recurring scheduling for sessions (not just office blocks).
- Persist recurrence rules in a consistent way (e.g., `RRULE` string or normalized recurrence table).

### 5.2 Client booking restriction (new rule)
- Clients cannot book if:
  - there are **no available intake slots** (for first appointment) OR
  - there are **no available session slots** (for ongoing scheduling)
- The system must be able to evaluate availability by appointment subtype (`Available Intake` vs `Available Session`).

---

## 6) Service code eligibility (new)
### 6.1 Model and mapping
- Each appointment record must be linked to a service-code-compatible classification. Direct-service booked sessions must have a billable `serviceCode`; non-billable appointment types must map to an allowed non-billable/admin code set.
- `serviceCode` availability is restricted by provider credential:
  - service codes not eligible for that credential must not be selectable
  - and booking must be blocked server-side (not just UI)

### 6.2 Booking-time enforcement
- When turning a slot into a booked session (or editing a booked session), the provider must select:
  - appointment type/subtype (where relevant)
  - service code (for Sessions/Assessments)
  - modality (in-person/telehealth where relevant)
- Validate in UI and backend:
  - provider credential allows selected service code
  - the slot is eligible (e.g., correct appointment subtype, within availability, office assignment rules)
  - required service code presence rules by appointment type

---

## 7) Session outcomes: missed / no-show / canceled / delete (extend + standardize)
### 7.1 Outcomes
For direct-service sessions, the schedule interface must support:
- `Write Note`
- `Appointment Missed`
- `Appointment No-Show`
- `Appointment Canceled` (mandatory cancellation reason)
- `Delete` (soft-delete / legal-hold rules apply)

Outcome updates must not block note-writing. Template selection still auto-resolves from appointment type + service code.

### 7.2 Supervision requirements for delete (existing pattern; extend)
- Deletion by supervised therapists requires supervisor approval.
- Add feedback mechanism for supervisor decision.

### 7.3 Therapist “Hold” slots on cancellation
- Canceled sessions are tracked.
- Therapists can convert canceled slot into a `Schedule Hold` (subtype) to protect time.

---

## 8) Notes: templates, defaults, and storage rules
### 8.1 Template-driven note formats (new requirement)
- Each note must have a format/template by note type and/or service code (e.g., `H0032`).
- When a session is booked (or a booked session is opened), the note type is already chosen and the template is established.
- Template auto-selection priority:
  1) explicit appointment-type + service-code mapping
  2) service-code default note type
  3) appointment-type default template fallback

### 8.2 AI-generated content is transient (confirm + enforce)
- AI-generated content must **not** be stored automatically.
- Only the final approved note content is persisted to the clinical data plane.

### 8.3 Expandable instructions
- Each note type supports expandable “instructions” content visible in the UI.

### 8.4 Diagnosis and treatment planning
- Intake flow:
  - AI suggests diagnoses + justification based on structured inputs
  - post-intake AI generates a treatment plan using diagnostic details

### 8.5 Assessment integration
- Intake note includes completed assessment scores.
- AI interprets assessments and integrates findings into notes.

### 8.6 Treatment summaries + progress graphs
- Generate summaries based on cumulative note information.
- Track goal progress with graphs over time.

### 8.7 Termination notes
- Auto-populate with progress data + goal graphs.
- Include “future file handling instructions” sections, with additional signatures for sensitive info.

---

## 9) Note Aid AI integration UX (extend what exists)
> You already have Note Aid / Clinical Note Generator UI and some retention panel wiring. The change here is to make it **context-aware**, **persist approved notes**, and add the **7-day holding + one-button paste** workflow.

### 9.1 Expandable AI modal
- If AI integration enabled, show an **expandable modal** that is:
  - obvious
  - “technological” looking (clear affordance)
- Note type is preselected; template is loaded.
- Appointment context (`officeEventId`, `clinicalSessionId`, service code, note type/template) is preloaded before user interaction.

### 9.2 7-day holding + one-button paste
Providers can:
1) Select a “7-day holding” item representing work done outside the note (pre-saved snippet/transcript/summary reference).
2) Click a **one-button paste** to insert into the currently loaded template section(s).
3) Optionally redo dictation, then run “Gemini” step, then one-button paste again.

### 9.3 Record session modal
- Provide a “Record Session” modal:
  - full-screen or prominent
  - shows a **pulsing ‘Recording Now’** button
- after recording, it performs the remaining pipeline as previously discussed (transcription -> AI organize -> preview -> provider approval -> paste into template -> persist approved note)

---

## 10) Integration changes required (key gaps to close)
### 10.1 Booking → Clinical session bootstrap (new automation)
When a session is booked (or when a booked session is opened):
- Automatically bootstrap (or ensure existence of) a clinical session in `/clinical-data` using:
  - `agencyId`
  - `clientId`
  - `officeEventId`
- Ensure existence of note context scaffold and billing/claim context linkages for the same appointment/session.
- Store resulting `clinicalSessionId` and linkage IDs on the booked event record for easy retrieval.

### 10.2 Note Aid → Clinical data plane persistence (fix)
Replace current “Approve note output” behavior:
- Instead of only clearing transcript/audio state, on approval:
  1) ensure clinical session + note context exist (bootstrap if needed)
  2) `POST /clinical-data/sessions/:sessionId/notes` (or equivalent) with:
     - note type
     - template version
     - final approved content
     - service code + modifiers (if applicable)
     - metadata needed for audit/compliance
  3) then clear transcript/audio from form

### 10.3 Billing/Ledger → Office event linkage (fix)
- Expose/store `office_event_id` + `clinical_session_id` + billing/claim context identifier on ledger/session rows.
- Update billing desk UI so office event context is derived from selected row—no manual input.

### 10.4 Retention panel context (fix)
- Ensure `ClinicalArtifactRetentionPanel` is always mounted with context when launched from:
  - schedule booked session
  - billing ledger row
  - note aid

### 10.5 Optional: audit deep links
- Add `link_path` metadata for clinical audit rows to open the correct session/artifact context directly.

### 10.6 Provider sign → supervisor sign-off (clinical org)
Extends the notation + billing flow for agencies with `organization_type = 'clinical'`:

- **Provider signs completed note** — signature posted on note, tracked, submitted on billing claim. No separate "Submit for supervisor" action.
- **Per-provider billing settings** (admin/staff): e.g. "billing as supervisor". When enabled, signed notes auto-route to assigned supervisor for sign-off before finalizing.
- **Supervisor resolution**: `supervisor_assignments` (primary preferred).
- **Data**: `clinical_note_signoffs` (main DB) tracks awaiting-supervisor notes.
- **Momentum List**: "Notes to sign" section + quick link for supervisors.
- **APIs**: `GET /api/me/notes-to-sign`, `GET /api/me/notes-to-sign/count`, `POST /api/clinical-notes/:id/supervisor-sign` (Phase 3).
- **Files**: `454_clinical_note_signoffs.sql`, `notesToSign.controller.js`, `NotesToSignSection.vue`.

---

## 11) Data model changes (proposal; implement in migration-safe way)
### 11.0 DB lookup source-of-truth (required)
- `appointment_types` (code, label, color_token, active)
- `appointment_subtypes` (code, label, appointment_type_code, active)
- `service_codes` (code, label, billable, default_note_type, active)
- `credential_service_code_eligibility` (credential_code, service_code, allowed)
- Backend and frontend must derive selectable values from these lookup tables.

### 11.1 Add fields to OfficeEvent (or equivalent schedule-event model)
- `appointment_type` (FK to lookup)
- `appointment_subtype` (nullable FK)
- `service_code` (FK, required per appointment classification policy)
- `client_id` (nullable for availability blocks; required for booked clinical sessions)
- `clinical_session_id` (nullable until bootstrapped)
- `note_context_id` (nullable until ensured)
- `billing_context_id` (nullable until ensured)
- `status_outcome` (nullable: MISSED/NO_SHOW/CANCELED/COMPLETED)
- `cancellation_reason` (nullable but required if outcome=CANCELED)

### 11.2 Service code eligibility enforcement
- Eligibility must be enforced by lookup table joins/validation at booking and update time.
- Keep UI filtering in sync with same eligibility source.
- Reject invalid combinations server-side even if the UI sends them.

### 11.3 Note template versioning
- `note_templates` (note_type, version, schema/sections, instructions)
- Store `template_version` on persisted notes for audit reproducibility.

---

## 12) API changes (high-level contracts)
### 12.1 Schedule summary payload additions
Update `/users/:id/schedule-summary` response items to include:
- `appointmentType`, `appointmentSubtype`
- `serviceCode` (if applicable)
- `statusOutcome` + `cancellationReason` (if applicable)
- `clinicalSessionId` (if bootstrapped)
- `noteContextId`, `billingContextId` (if ensured)
- `displayStatus` (for UI: AVAILABLE/BOOKED/PENDING/BLOCKED/etc.)
- Confirm “no client names” in schedule items (only IDs as needed internally)

### 12.2 Booking endpoints
- Extend `/office-schedule/booking-requests` and staff booking endpoints to accept:
  - appointment taxonomy
  - service code selection (validated)
  - modality (if relevant)
  - recurrence rules (for recurring sessions)

### 12.3 Clinical session bootstrap helper
Add an internal helper endpoint or service method:
- `ensureClinicalSession({ agencyId, clientId, officeEventId }) -> clinicalSessionId`
- `ensureAppointmentContext({ agencyId, clientId, officeEventId, appointmentType, serviceCode }) -> { clinicalSessionId, noteContextId, billingContextId }`

### 12.4 Persist note endpoint usage
On approve:
- call existing `/clinical-data/sessions/:id/notes` (or add if missing)
- ensure it supports:
  - note content
  - note type + template version
  - linkage to service code + office event
  - linkage to note context/billing context identifiers where applicable

---

## 13) Frontend changes (where to implement)
### 13.1 ScheduleAvailabilityGrid (core)
- Add appointment type/subtype UI selection when:
  - converting an available slot to booked
  - editing a booked slot
- Color-code based on taxonomy
- Hide client names; show slot status + type iconography

### 13.2 Booked session drawer/modal (new or extend existing)
When clicking a booked time slot:
- show appointment taxonomy
- show service code selector (filtered by credential)
- show quick actions:
  - Write Note
  - Missed
  - Cancel (reason required)
  - Delete (with approval workflow if supervised)

### 13.3 Note Aid / Clinical Note Generator
- Make it context-aware from schedule selection:
  - automatically receive `agencyId/clientId/officeEventId`
- Implement approve → persist workflow
- Add AI modal + 7-day holding + record session modal UX
- Keep Note Aid/Tools & Aids entry points under **My Dashboard** (agency context) only; do not surface under school or sub-organization portals.

### 13.4 Billing desk
- Remove manual officeEventId input
- Derive event/session IDs from selected row
- Auto-mount retention panel with correct IDs

---

## 14) Rollout plan (min risk)
1) **Schema + lookup tables** (appointment taxonomy + service code eligibility + color metadata)
2) **Server validation** (booking endpoints enforce eligibility)
3) **Schedule summary payload** (add fields; maintain backwards compatibility)
4) **Frontend** (show taxonomy + color coding; hide names)
5) **Appointment context ensure** (auto-create/link clinical session + note context + billing context on booking/open)
6) **Note Aid approve → persist** (feature-flagged)
7) **Billing desk linkage** (remove manual officeEventId)
8) **Audit deep links** (optional)

Use feature flags for:
- taxonomy UI
- service-code enforcement UI (backend enforcement always on once stable)
- note persistence from Note Aid
- 7-day holding + record modal

---

## 15) Acceptance criteria (done = true)
- Schedule grid supports all appointment types/subtypes and color-codes them.
- Grid never shows client names; only statuses + type labels/icons.
- Every appointment is tied to a service-code-compatible classification; direct-service booking requires a billable service code, filtered by credential and enforced server-side.
- Can mark sessions Missed/No-Show/Canceled (Canceled requires reason) and still write a note.
- Recurring sessions supported (and visible in summary) without breaking office booking approvals.
- Booking or opening a booked session idempotently ensures clinical session + note/billing context linkage.
- Note Aid “Approve” persists final note into clinical data plane and clears transient AI content afterward.
- Billing desk derives office event context from row selection; no manual officeEventId entry.
- Retention panel always has proper context when launched from schedule, billing, or note aid.
- Supervised delete requires supervisor approval and logs actions in audit trail.

---

## 16) Implementation notes for Cursor (how to approach)
- Prefer **additive changes** (new fields, lookup tables, optional response fields).
- Keep old flows working while new taxonomy/clinical integration rolls out.
- Add backend tests for:
  - credential/service code eligibility enforcement
  - outcome + cancellation reason validation
  - bootstrap linkage idempotency
- Add frontend tests for:
  - no client names in grid
  - service code filtering and booking block on invalid selection
  - approve note persists and clears transient data
