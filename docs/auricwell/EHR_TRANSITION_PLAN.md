# AuricWell EHR transition plan

Reviewed November 10, 2026 against repository source. This is the agreed workflow direction and an implementation readiness review, not evidence of a completed practice migration. The management area is **AuricWell**; its migration workflow is **EHR Transition**. Keep the existing locations for operations and expose them again from the AuricWell home using the same records and services.

## Intended operator flow

1. **Import providers, then select one provider.** Reuse Import Providers. Keep provider and agency context while processing the active caseload one client at a time. Confirm the source EHR, source provider identifier and intended transition date.
2. **Resolve the client before writing.** Search the existing agency charts, including school clients. Show candidate name, DOB, school and stable IDs; require an explicit identity decision for uncertain matches. Resolve lookup failures before continuing. An existing school client retains its client ID, school enrollment, guardians, care-team assignments and clinical links. Creating a new chart must be an explicit reviewed outcome when identity is uncertain.
3. **Paste the chart in one workspace.** Reuse the current demographics/intake/treatment-plan boxes. Add contacts and insurance. Preview incoming versus existing fields and apply selected changes; blanks must not erase existing values. Conflicting values need review. Save per-step results so a partial failure resumes the same client.
4. **Preserve the client’s medical archive.** Staff export a client-specific PDF from the previous EHR and upload it to the same chart. Verify upload, page completeness, opening and authorized download. Source-system export automation and representative export compatibility have not been verified.
5. **Paste the provider’s week.** Review the actual week, timezone, client, provider, start/end, location/modality, service and recurrence for each row. Resolve matches, existing bookings and conflicts before applying. A copied week must not silently become a recurring series: explicitly confirm recurrence and its end/window.
6. **Reconcile and switch the provider.** Compare active-client and future-visit counts, inspect representative charts, verify appointment-to-chart/note access and confirm schedule ownership. From the agreed transition date, link school planning to real appointments. Track incomplete archives and the old EHR’s remaining responsibilities.

## Implementation status

The provider/client workbench, reviewed demographics/contact/insurance paste, historical intake/plan drafts with original dates, automatic PDF volumes/manifest, weekly agenda preview/commit, and linked dated school booking views are now implemented. See [EHR_TRANSITION_TRIAL.md](EHR_TRANSITION_TRIAL.md) for the sample preview, migration 1786 setup, usage and remaining trial acceptance. The initial gap inventory below documents the starting point; it is not the current list of missing features.

| Requirement | Source-reviewed status | Reuse and needed connection |
| --- | --- | --- |
| Import providers | Exists | `frontend/src/views/admin/ProviderDirectoryView.vue` has CSV/XLSX Import Providers. Reuse it; no new provider importer. |
| Select provider and assign clients | Partial | `EhrPatientListImportModal.vue` already accepts a provider and assigns new/existing clients. Harden identity resolution and preserve selected provider through the transition workbench. |
| Demographics paste | Exists, merge review missing | `ClientEhrBringUpToDatePanel.vue` and `demographicsImport.service.js` import main client fields. Nonempty incoming fields can replace existing fields; a before/after conflict review is still needed. |
| Additional contacts | Separate editor exists; paste missing | The demographics parser has no additional-contact output. Reuse `ClientAffiliatedContactsPanel.vue`, `/clients/:id/contacts` and existing guardian relationships. Import relationship, phone/email and preferences; review custody, disclosure and portal permissions separately. |
| Insurance paste | Missing | `ClientInsuranceEditor.vue` and `clientInsurance.service.js` support canonical coverage. Add a reviewed parser/adapter for primary/secondary coverage, payer mapping, subscriber relationship/demographics, member/group IDs and policy dates. Preserve authorizations and coverage provenance. Import does not establish eligibility or verified claim readiness. |
| Intake paste | Exists | Reuse the current import/review flow; retain original service/document date, author and source. Missing diagnoses remain pending review. Do not turn an imported signature into a new clinician attestation. |
| Most recent treatment plan paste | Exists, date review needed | Reuse parser/review and goal/objective handling. The current combined importer sets effective date to today; transition must retain the reviewed original effective date and distinguish it from the new review date. |
| Medical PDF upload/download | Partial | Shared chart documents use private GCS storage and a **25 MB per-file limit**. Rehearse actual export upload, reopen and authorized download. Larger-file acceptance needs a new resumable path or verified ordered volumes. |
| PDF notes as separate historical sessions | Not complete | The independent prototype reviews page ranges into its own note records. It does not prove canonical historical sessions, reliable note boundaries or safe source identity matching. Optional later phase. |
| Paste weekly agenda | Missing in shared transition UI | Existing scheduling and recurrence engines are the foundation. Prototype spreadsheet appointment imports delegate to canonical appointment persistence, but are not a completed shared paste workflow. |
| School planning ↔ actual appointments | Incomplete | School slots and booked appointments exist, with some same-day suppression. School saves/moves still update planning slots without moving an actual appointment. Persistent links and shared mutation orchestration are required. |

The active AuricWell frontend is `frontend/src/auricwell`. The independent `auricwell/` prototype and its import services are not a shortcut to production readiness. Follow [ARCHITECTURE.md](ARCHITECTURE.md) and [ADMIN_PREVIEW.md](ADMIN_PREVIEW.md): use canonical shared records and preserve current access boundaries.

## Medical history strategy

**Initial transition requirement: complete, usable storage.** The transition does not depend on automatically rebuilding every old session. Keep the original PDF as the source record even if extraction is added later.

The trial now implements option 2 automatically for PDFs up to 256 MB/5,000 pages and stores the page/checksum manifest in the existing chart. Option 1 remains a future direct large-file alternative. Verified download and source completeness remain required.

1. **Preferred larger-file implementation:** resumable private object-storage upload with client/agency binding, bounded processing, progress/retry, integrity verification and authorized download. Record source system, external client ID, filename, bytes, checksum, page count, date range, uploader and import time. Validate a representative large active-client export before setting the supported file size.
2. **Near-term fallback:** split the client-specific PDF into ordered volumes below 25 MB, using an approved local/private tool. Keep a manifest with volume count and source page ranges. Verify that there are no missing/overlapping pages and every volume opens/downloads from the same chart. The app does not currently provide automatic splitting or manifest reconciliation.
3. **Temporary fallback:** retain historical access in TherapyNotes or the actual source EHR while using AuricWell for future work. Record which client’s history remains there, its date range, the owner and the unresolved export. Do not mark the archive complete or retire access until the alternative is verified. Source-system account/export availability remains an operational dependency.

If one export contains several clients, isolate each client’s pages before chart attachment; never attach a practice-wide export to one client. Keep any authorized source archive in appropriately restricted storage.

**Optional later extraction:** review client identity, note type, page boundaries, original date, author and source hash/page references. Import immutable historical documentation with historical provenance, not a newly signed encounter or a new claim. Any independent session records must be nonbillable historical sessions with duplicate prevention by source/client/page or note identity. OCR uncertainty needs manual review. Interrupted extraction must resume without repeating imported sessions. The complete PDF remains available regardless of extraction outcome.

## School schedule contract

Use one canonical appointment for each booked occurrence. The school calendar is a projection of that appointment after transition, with school slot/series identity retained. Do not rely on provider/client/date coincidence to identify the appointment.

| Action | Required result |
| --- | --- |
| Place an untimed client on a school day | Retain the existing planning/capacity behavior; show that no appointment is booked until time and required details are supplied. |
| Give the transitioned placement a valid time | Create or explicitly link the canonical appointment through shared scheduling; store the link. Count linked planning and booking once. |
| Provider changes a recurring time or weekday | Update the appointment series using existing recurrence rules and project the changed future occurrences into the school view. Remove stale old-day planning; retain exceptions. |
| Authorized school staff changes a client time | Move the linked appointment through the same shared service and show the result in both calendars. Enforce existing school/client/provider permissions. |
| Change one visit versus future visits | Require explicit scope. Preserve previous, completed, signed, claimed and exceptional occurrences according to the current scheduling rules. |
| Reorder the school list | Change display order only. A time change must be explicit and reviewed. |
| Cancel a visit | Preserve cancellation history and capacity/notification policy; do not recreate the visit from the old soft slot. |
| Retry or concurrent edit | Resume the same occurrence; stale previews fail for review, with no duplicate booking or silent overwrite. |

Reuse `ProviderScheduleEvent.model.js` and `appointmentScheduleSync.service.js` for linked provider event movement, plus the existing appointment/recurrence and office transition services. Adapt access and orchestration for schools rather than creating a second scheduling engine. Main/clinical/calendar side effects need recoverable steps; a successful planning save alone cannot report appointment synchronization success.

The current `schoolSoftScheduleCalendar.service.js` suppresses planning by provider/client/date and does not establish school identity, appointment status or a unique occurrence link. A canceled appointment, multiple visits per day, multiple schools or a weekday move must all be covered by the new linkage.

## Work order and acceptance

1. **Navigation and safe identity:** AuricWell management home, EHR Transition plan, existing operation links and failed/ambiguous lookup protection.
2. **Provider/client transition workbench:** stable client mapping, reviewed demographic/contact merge, insurance paste, original clinical dates, and durable per-step progress/provenance. A selected provider is context, not proof of assignment or completed import.
3. **Verified archive:** representative large PDF rehearsal, storage/download support or chosen fallback. Historical extraction can wait.
4. **Agenda and school linkage:** reviewed agenda preview, shared booking, persistent school occurrence/series links, bidirectional edits and one capacity count.
5. **Small pilot and reconciliation:** include a new client, existing school client with incomplete demographics, multiple contacts, secondary insurance, large PDF, recurring series and an individual exception. Repeat the import and interrupt/resume it.

Before accepting the provider transition, verify:

- Existing school client ID, school relationships, guardians and old clinical records survive enrichment; explicit conflict choices are preserved.
- Failed/ambiguous identity lookups stop for resolution. Repeating a client import does not create another chart or duplicate contacts/assignments/documents.
- Primary/secondary insurance and subscriber values reach the existing editor; verification stays separate. Intake and plan provenance/date/signature meaning remain correct.
- The complete medical history opens and downloads, or a tracked fallback remains unresolved and old access is maintained.
- The source week and committed appointment counts agree. Every appointment opens the right chart and existing note workflow; conflicts and unmapped rows remain visible.
- Provider recurring weekday/time changes and school one-visit/future-series changes appear on both calendars. Test cancellations, untimed placements, multiple daily sessions/schools, school closures, capacity, concurrent edits and partial failures.
- Completed/signed/claimed encounters and individual exceptions are preserved. Imported historical notes do not create new claims or duplicate appointments.
- Confirm who owns future scheduling, how source calendar feeds/reminders stop duplicating visits/messages, how existing claims/balances remain reconciled, and who retains historical access. Reuse the [scheduling cutover review](../SCHEDULING_SESSION_INTEGRATION_REVIEW.md) and existing office transition controls.

This review does not change practice data, enable the prototype, upload client files, apply migrations, commission a practice, or certify a production cutover.

## Local changes from this review

- Added **Management → AuricWell**, an operations hub linking the existing tools, and the **EHR Transition** readiness plan. Existing entry points and permissions remain in use.
- Hardened patient-list import: failed/incomplete searches, uncertain/missing-DOB matches, duplicate matches and archived matches stop for review. Failed provider assignments remain pending; a failed demographics step can resume the same newly created chart in the current component’s memory. Successful rows are skipped on a same-window retry.
- EHR client creation no longer reuses a chart on initials alone. A same-agency initials candidate, including an archived chart, requires review before creation/assignment; `forceCreate` does not bypass that check. Distinct people sharing initials need the existing reviewed manual-client workflow. Legacy Note Aid behavior is preserved.
- Recovery is not durable across page reloads, and requests already sent cannot be canceled by a later context change. Concurrent import locking and stable source-ID mapping remain work for the unified transition workspace. These safeguards do not replace the demographic/contact conflict review or bidirectional school linkage described above.

Validation: 21 navigation/search tests, 21 patient-list import/parser tests and 10 backend creation tests passed with synthetic/mock data. The six changed/new Vue screens compile, JavaScript syntax checks pass, and scoped whitespace checks pass. No production import, deployment or full frontend build was performed; no dependencies or worktrees were duplicated.

## Evidence entry points

- `frontend/src/components/admin/EhrPatientListImportModal.vue`: provider context, lookup and assignment.
- `frontend/src/components/admin/clientChart/ClientEhrBringUpToDatePanel.vue`: existing paste pipeline and plan effective date.
- `backend/src/services/demographicsImport.service.js`: parsed fields and nonempty patch behavior.
- `frontend/src/components/client/ClientAffiliatedContactsPanel.vue`: existing contact editor.
- `frontend/src/components/billing/ClientInsuranceEditor.vue`, `backend/src/services/clientInsurance.service.js`: canonical coverage.
- `backend/src/utils/clientDocumentUpload.js`, `backend/src/controllers/phiDocuments.controller.js`: shared file size, storage and access.
- `backend/src/services/auricwell/imports.js`, `repository.js`, `sharedAppointments.js`, `scheduling.js`: prototype import/appointment adapters and recurrence foundation; deployment boundary remains important.
- `backend/src/controllers/schoolSoftSchedule.controller.js`, `backend/src/services/schoolSoftScheduleCalendar.service.js`: planning writes and date-based suppression.
- `backend/src/models/ProviderScheduleEvent.model.js`, `backend/src/services/appointmentScheduleSync.service.js`: existing linked appointment movement.
