# AuricWell development and deployment runbook

Docker is optional. Local development and validation use native Node and MySQL; no Docker installation or background service is needed. Use Node 22 for the AuricWell frontend, PDF worker and integration checks. Keep the existing staff backend's deployed runtime unchanged.

## Local frontend

From `auricwell/`, run `npm ci` and `npm run dev`. Vite listens on `127.0.0.1:5174` and proxies only `/api/auricwell` to `AURICWELL_API_UPSTREAM` (default `http://127.0.0.1:3000`). Run `npm run build` and `npm test` for frontend validation.

## Backend configuration

Use the existing backend runtime/database environment and apply the additive migrations `database/migrations/1495_auricwell_product.sql`, `database/migrations/1509_auricwell_shared_clients.sql` `database/migrations/1510_auricwell_shared_staff.sql`, `database/migrations/1511_product_scoped_staff_identities.sql` and `database/migrations/1512_auricwell_shared_appointments.sql` through the normal migration process. Test a restored backup before any production migration. No migration was applied to a production database during implementation.

Required configuration:

| Setting | Purpose |
| --- | --- |
| `AURICWELL_ENABLED=true` | Mount access to the independent API; default is off |
| `AURICWELL_ORIGINS=https://auricwell.com` | Exact permitted browser mutation origin; comma-separated for reviewed preview origins |
| `AURICWELL_PUBLIC_ORIGIN=https://auricwell.com` | Account invitation/recovery URL |
| `AURICWELL_ACCOUNT_EMAIL_FROM` | Configured account-only email sender using existing mail service |
| `FAMILY_BILLING_ENCRYPTION_KEY_BASE64` | Existing AES encryption key infrastructure; back up and restrict access |
| `AURICWELL_CLAIMMD_CHAMPIONS_KEY` | Example practice-specific clearinghouse secret; upper-case slug with hyphens changed to underscores |
| `AURICWELL_FINANCIAL_PRACTICES` | Comma-separated slugs permitted to transmit claims/refunds/payments; empty blocks all external financial writes, including accounts labeled test |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Existing processor configuration; each practice also needs verified dedicated connected account |
| `AURICWELL_AI_MODEL` | Optional model override; existing Vertex configuration remains required |

Vonage and Google Cloud/Vision use existing backend runtime credentials. A configured vendor secret alone does not activate a practice integration: an operator must verify ownership, real account mode and vendor agreement evidence in Settings. Test-mode labels do not turn a live clearinghouse account into a sandbox.

Bootstrap a dedicated operator using `node src/scripts/auricwellOperator.js USERNAME 'Full Name' EMAIL`, supplying the password through stdin from an approved secret-handling mechanism. The script refuses terminal password input and never accepts it as a command-line argument. Enroll MFA, provision the practice through `/app`, and review owner permissions before sending account invitations.

## Onboarding

1. Choose new practice or transition; save legal identity, locations, timezone and therapy services.
2. Create the customer service agreement, order and BAA drafts. Fill actual entity/notice details and commercial terms. Have the operator approve the exact documents; activate signers and collect all required signatures.
3. Operator records separate infrastructure/vendor review evidence, then activates PHI workflows.
4. Configure providers, credentials/supervision, availability, billing identity, payer matches and enrollment. Create patients/care-team assignments only after PHI activation. Portal activation is separate from chart creation; assign guardian financial responsibility explicitly.
5. All file uploads require PHI activation because source exports may include extra patient columns; non-PHI manual practice/provider/payer setup remains available earlier. New practices skip migration. Transition practices follow the ordered reviewed imports. Missing/ambiguous rows remain issues. Historical reports never post live claims/charges. Enter any reviewed opening balance through billing after reconciliation, not by summing imported transaction balances.
6. Do not activate full replacement until every applicable outstanding item in `IMPLEMENTATION.md` and the user's operational acceptance plan is completed.

## Architecture correction before further rollout work

The intended architecture is one shared backend with the full-suite and AuricWell frontends. Organizations, patient demographics, new staff identities and new appointment core fields now use shared models. Provider clinical/billing profiles, prototype appointments, clinical notes and financial workflows still require consolidation before rollout. Follow [ARCHITECTURE.md](ARCHITECTURE.md). The workflow instructions below describe the current development prototype, not completion of the shared-backend requirement.

## Reviewed prototype chart consolidation

Migration 1509 requires the existing canonical `agencies` and `clients` schema. New practices receive a canonical clinical organization (initially inactive), and new charts use the shared Client model. There is no automatic production backfill or matching by name/email/birth date. Inspect actual migration state before applying it.

The operator API is under `/api/auricwell/practices/:slug` and requires an authenticated, MFA-verified operator with migration permission and PHI readiness:

- `POST /consolidation/preview`: supply `{}` to preview the next at-most-200 unconnected prototype charts and a new organization. To use an existing clinical organization, supply `agencyId` explicitly. Optional `mappings` contain `{ patientId, clientId }` for explicit links, or `{ patientId, distinctPerson: true }` to create a separate client after reviewing matching-name candidates. A slug collision requires explicit organization review; it never links automatically.
- Inspect the returned organization, source snapshots, candidate clients, target demographics and issues. Existing-target demographics will be retained. Reusing a client already linked to another chart is held for separate duplicate-chart review.
- `POST /consolidation`: send the same selection with `reviewed: true`, the exact `previewHash` and an `idempotencyKey`. Changed sources/targets/configuration invalidate the preview. Repeating the exact successful command returns the existing result. Review another batch until `remaining` is zero.

These are operator API endpoints; a dedicated conversion UI has not been added. Conversion retains source snapshots in encrypted historical `consolidation_archive` records and preserves chart IDs used by notes and imports. Unconverted prototype charts stay readable but cannot be edited or newly created in the prototype-only store. No shared-client demographic data is overwritten when linking an existing client. Import rollback retains shared charts and reports that manual review is required; it cannot terminate/archive clients that other shared workflows may use.

Core operational demographics follow the existing Client schema. AuricWell edits send `sharedFingerprint` and record revision; refresh after a conflict. Product metadata remains encrypted. Connecting a chart does not migrate provider identities, grant portal or full-suite access, activate organizations or finish the remaining EHR-domain consolidation.

## Patient intake

Newly provisioned practices include the `intake` capability. Existing AuricWell practices keep their saved capabilities: an operator can enable intake in Settings → Operator verification → Save intake capability. The `clients` capability is also required for patient-data operations, and `portal` is required to assign forms and for patient/guardian access. Clinical questionnaire setup is available before PHI activation; assigning and answering patient forms requires activated agreements/infrastructure readiness.

1. In Settings, create a patient intake questionnaire. Configure text, long-text, choice or yes/no questions and required fields. Revisions and retirement do not change forms already assigned.
2. Create a patient/guardian account in Settings. For a prospective client, explicitly select **Intake-only patient/guardian account** and leave chart/financial grants empty. Review the account before sending the existing account-setup invitation. For an existing client, select only the authorized charts and financial responsibility separately.
3. In Patient intake, assign the current questionnaire version to that account, choose an active clinical reviewer and record verified respondent capacity/authority. Existing-chart assignments require the respondent and reviewer to have chart access. Form assignments and correction tasks remain in-app.
4. The patient or guardian signs in, saves progress and submits reviewed answers. The submission is a retained questionnaire response, not a treatment-consent signature. Treatment/telehealth/financial agreements remain in their separate agreement workflow.
5. The assigned clinician or authorized supervisor reviews the exact submission, requests corrections if needed, then explicitly chooses a new chart or an existing chart. Matching-name/date suggestions never merge charts automatically. Linking a chart preserves its current demographics. Repeated acceptance creates at most one chart.
6. Grant patient/guardian chart access and financial responsibility separately in Settings after identity/authority review. Accepting intake does not expand either access grant. Authorized chart clinicians can read accepted intake responses and prior submission versions; revoking chart access removes that clinical access. Queue-only administrators cannot read responses.

Intake reuses encrypted, organization-scoped records from migration 1495; no additional database migration is needed for this increment. The current implementation supports staff-assigned authenticated intake, not public self-registration. High-volume pagination and release acceptance remain outstanding.

## Scheduling and recurring appointments

The Schedule workspace offers day, week and month views, provider filtering and practice-timezone appointment entry. Calendar dates, visit times and the home dashboard use the saved practice timezone. Patient/guardian users see authorized visits and can submit appointment requests; staff with explicit scheduling permission manage bookings.

1. Configure active therapy services, practice locations and reviewed provider credentials/availability. Providers need an active practice membership with clinical permission and an active account. Supervised providers require an eligible assigned supervisor with supervision permission. Billing enrollment remains a separate claim-readiness decision.
2. Create a single visit or choose every 1, 2 or 4 weeks, with 2–52 visits. Review the generated dates before checking the review confirmation and saving. Every visit must pass eligibility, availability and patient/provider conflicts; any issue blocks the entire series. Daylight-saving changes preserve local appointment time. Nonexistent or ambiguous local times must be changed before booking.
3. Manage one visit to create an individual exception. To reschedule or cancel a future series, select a visit and choose the corresponding change scope, preview the affected visits and explicitly confirm. Completed/past visits, linked documentation/claims and individual exceptions are preserved and listed. Changing a series does not create charges, claims or notifications outside the app.
4. If a preview becomes stale, review a fresh preview. Retrying the same reviewed command with its request identifier returns the prior result. Scheduling changes retain before/after history in encrypted `appointment_change` records. Appointment bindings with documentation/claims or completed care cannot be rewritten; clinical corrections follow the documentation/billing workflow.

The API adds `GET /api/auricwell/practices/:slug/scheduling-options`, `POST .../appointment-series/preview` and `POST .../appointment-series`. Series commands specify `action` (`create`, `reschedule`, `cancel`); future changes reference `fromAppointmentId`. Committing requires `reviewed: true`, the exact `previewHash` and an `idempotencyKey`. Single-visit APIs accept practice-local `localStart` plus `durationMinutes`, or explicit start/end instants; updates require both `revision` and `sharedFingerprint`. New scheduling records use canonical appointments/participants and encrypted product/series metadata. Unconverted prototype visits are read-only. Patient, staff and appointment links require migrations 1509–1512. Docker is not required.

Conflict checks scan all practice appointments and linked notes/claims. Calendar display still depends on bounded workspace lists; large-practice pagination/load acceptance remains required before rollout. Calendar provider choices do not establish billing eligibility.

## Background imports

From `backend/`, run `npm run auricwell:imports` under **Node 22** with the intended environment's encryption/database configuration. This processes the queue once and exits; a scheduler can invoke the same command as a separate background job. It does not require Docker. The existing Node 18 staff backend remains on its current runtime; PDF parsing/rendering happens only in the Node 22 job, and the API serves saved private page previews. It processes queued imports, rechecks the uploading member's active migration permission and practice readiness, and recovers stale leases after 30 minutes. Failed imports require explicit retry in the app. Do not run the worker with legacy lifecycle/import functions. Run no more than the validated worker concurrency until OCR memory/runtime and resource-limit improvements are complete.

If the eventual hosting platform uses containers, `backend/Dockerfile.auricwell-worker` is an optional packaging recipe that can be built and verified remotely. The Mac does not need Docker for this.

## Frontend deployment artifact

From `auricwell/`, run `npm ci`, `npm run build`, then `npm start` to serve the standalone application using Node 22. Set `AURICWELL_API_UPSTREAM` to the trusted backend base URL. Route the AuricWell hostname to this service with TLS; it serves marketing at `/`, app routes at `/app`, and same-origin API proxying. Keep existing staff hostnames, SSO routes and branding on their current frontend. The upstream must be reachable only through the intended trusted proxy arrangement; verify forwarded IP handling before enabling rate limits in production. `auricwell/Dockerfile` remains an optional remote deployment packaging recipe.

No actual deployment or domain routing change is included in the development validation.

## Validation commands

- Frontend: `cd auricwell` then `npm run build`, `npm test`, and `npm audit`.
- Browser: start local frontend, then from repository root run `node auricwell/scripts/browser-check.mjs`. It uses installed Chrome and synthetic API responses only.
- Intake browser: with the same local frontend running, execute `node auricwell/scripts/intake-browser-check.mjs`. It covers staff setup/review and patient/guardian forms with intercepted synthetic API responses, and saves desktop/mobile screenshots in `deliverables/auricwell-verification/`.
- Calendar browser: run `node auricwell/scripts/scheduling-browser-check.mjs` against the same local frontend. It intercepts all API requests and saves synthetic calendar screenshots.
- Backend pure policies: `cd backend` then `node --test src/services/auricwell/policy.test.js`.
- Backend integration: from `backend/`, run `npm run test:auricwell` with Node 22 and an installed native MySQL server binary. The runner finds `mysqld` on PATH or in standard installation locations; `AURICWELL_MYSQLD` can select a specific executable. It installs a documented projection of the canonical organization/client schema and AuricWell migrations, creates a private temporary data directory, ignores installed MySQL configuration, binds only to `127.0.0.1:33471`, runs the synthetic tests and stops/removes its database afterward, including on failure. It neither starts an installed database service nor connects using project database credentials; both database pools are pinned to the temporary server. Port 33471 must be free. The current Mac's native MySQL is 9.5; the earlier baseline also passed on MySQL 8. Validate the actual deployment database version before rollout.
- Some execution sandboxes prevent native MySQL hardware initialization; run the same temporary-database command from a normal terminal or through the approved process runner in that case. No Docker fallback is needed.
- Legacy billing regression: from backend, `node ../frontend/node_modules/vitest/vitest.mjs run --config vitest.claimmd.config.js`.

## Monitoring and recovery

Watch structured `auricwell_ehr` request-rejection logs (status/route/practice only), authentication limits, stale/failed import statuses, unresolved reviews, `transmitting`/`transmission_uncertain` claims, reserved/pending payment/refund attempts and missing reconciliation. Clinical bodies, password tokens and vendor keys must not enter log pipelines.

Unknown claim outcomes require clearinghouse reconciliation before a reviewed correction; do not reset a transmission state or generate a new remote ID to force a retry. Unknown processor outcomes retain their idempotency reservation. After 23 hours, an unresolved unbound payment/refund is held for processor investigation instead of issuing a fresh charge. The current implementation requires manual monitoring/reconciliation; automated operational queues and scheduled financial reconciliation remain release work.

## Reviewed shared staff connections

Migration 1510 requires the existing `users` table and adds a nullable, unique `auricwell_accounts.canonical_user_id` foreign key. Runtime identity reads require the current `users` identity/status/credential columns and `user_agencies.is_active`. It does not backfill, create full-suite users or grant memberships. The native test schema projects these columns; it is not a production migration rehearsal.

In the operator's practice workspace, open Settings → Review access for a staff member → enter the reviewed shared staff ID → Preview staff connection. Verify the account, shared name, credential and active status; explicitly confirm that the records identify the same person, then connect. Only identities already associated with the canonical agency can be selected. Operators themselves, portal identities, already-connected identities and accounts with multiple practice memberships cannot be connected by this release. After connection, review the provider's clinical credential mapping before enabling new care. Shared names are read-only in the provider editor; edit them through the shared staff record.

The API uses `POST /api/auricwell/practices/:slug/members/:id/shared-identity/preview` with `{ "userId": 123 }`. Apply at `POST .../shared-identity` with the same user ID, exact `previewHash`, `reviewed: true` and a stable `idempotencyKey`. A changed name, credential, access state or provider snapshot requires a fresh preview. Retries with the same command return the original result. Connections cannot be reassigned in place. A correction requires a separate audited process, not direct production SQL.

Connection preserves credentials, MFA, permissions, account activation state, historical author IDs and provider IDs. It archives the prior provider snapshot and resets clinical credential approval. Shared credential changes invalidate the mapping until reviewed; revoked shared or product access makes the provider ineligible for new care. These checks do not import payer enrollment or approve live claims. Shared clinical/billing profile conversion remains pending. New staff provisioning uses the product-scoped flow below; do not create hiring records for EHR staff.

## New staff and shared appointment operations

New owners and staff, including reviewed staff imports, receive canonical shared identities automatically in the account transaction. Pending AuricWell accounts remain pending until reviewed activation/invitation. `identity_product=auricwell_ehr` and `status=EHR_ONLY` prevent full-suite authentication, password setup and recovery. Migration 1511 preserves existing users and dynamically extends the deployment's current status enum. Validate this against a restored production schema before rollout; do not change an EHR identity to an employee status to enable clinical care.

In Settings → Review access, administrators can update the first/last name and professional credential of a new EHR-only identity. `PUT /api/auricwell/practices/:slug/members/:id/identity` requires `sharedFingerprint`. Refresh after a conflict and review changed clinical credential mappings. Full-suite identities and shared people affiliated with multiple agencies require their existing/shared review workflow. Existing-user connection is still operator-only; choose the explicit existing-record review option when adding such a staff account. Duplicate emails stop creation instead of merging identities.

Migration 1512 connects new visits to canonical `appointments`. Scheduling reads independently verify the owning agency and linked client/provider. Changed shared chart/provider assignments hold the visit for review. Do not bypass this using direct SQL. Canonical appointments with additional clinical/calendar/package links are held rather than updated outside those workflows. Prototype appointment conversion remains outstanding.

EHR-origin visits use in-app notifications and the AuricWell-specific virtual-session reminder worker described below. Legacy full-suite reminder dispatch, SMS/email reply mutation, automated settlement and clinical-session linking remain blocked for them. Full-suite business update/cancel/settle operations also hold these visits until shared EHR clinical/billing orchestration is complete. Preserve the inactive-agency rollout gates.

## Documentation workspace

Open Documentation to see drafts on the left and to-do on the right. The supervision switch shows signed notes assigned to you for cosigning. Opening any note collapses both panels; use Show drafts/Show to do to reopen them. Review the complete center-panel note before signing. Past appointments without documentation appear in to-do for their provider; opening one prefills an unsigned form and never creates a charge.

The two frontends share the established writer prompt builder and generation settings. AuricWell does not yet expose every existing clinical context/editor capability; canonical clinical-note and context consolidation remains a release dependency. Do not describe the matching workspace layout as completion of that backend work.

Run `npm test -- src/views/admin/__tests__/ClinicalNoteGeneratorView.smoke.test.js` from frontend for the existing workspace regression and `node ../frontend/node_modules/vitest/vitest.mjs run --config vitest.note-aid.config.js` from backend for shared-writer checks. The main AuricWell browser script covers the documentation layout with intercepted synthetic APIs. AI generation remains subject to the practice's existing capability, agreement and consent gates.

## Shared insurance review

In Billing → Open billing tools → insurance, choose the patient and wait for current coverage to load. Review the primary carrier, electronic payer ID, member/subscriber information and patient billing identity before saving. Existing secondary coverage and intake-profile associations are preserved. Use Reload coverage after a stale-version error; it discards the form's unsaved edits and loads the current shared record. No automatic retry replaces intervening edits.

If earlier AuricWell coverage is present, expand Earlier coverage for review, compare it with the form's current shared coverage and explicitly confirm the conversion. The original is retained in an encrypted consolidation archive. Claim preparation and eligibility remain held until this review is complete. Imported payer identity still does not establish enrollment.

`GET /api/auricwell/practices/:slug/patients/:id/insurance` returns current coverage, `sharedFingerprint` and any earlier coverage requiring review. `PUT` requires that exact fingerprint, `reviewed: true`, and `consolidationReviewed: true` when applicable. Both require staff billing permission, active PHI readiness and practice-scoped chart access. Insurance changes invalidate prior claim approval snapshots, including changes made through the existing full-suite insurance service.

Runtime prerequisites are the existing `clients.billing_insurance_payload` and related insurance columns from the full-suite schema; no production migration was run. The synthetic browser check is `node auricwell/scripts/billing-browser-check.mjs` against the local frontend. No real insurance or patient data is used.

## Platform virtual sessions and patient appointment SMS

Apply `database/migrations/1619_auricwell_session_integrations.sql` before deploying this change, in addition to the existing AuricWell migrations. Session rooms, guest token hashes, delivery claims, and encrypted platform configuration have their own tables. The only account allowed to modify these settings is an MFA-verified AuricWell platform operator (`profile.operator`); practice administrators and individual providers cannot override them. Open **My practices → Platform settings → sessions and texting**, or `/platform/settings`. The same component appears for operators in practice Settings.

Defaults: Google Meet for scheduled video visits, email reminders enabled, patient SMS disabled, permanent virtual offices disabled. The worker runs only when `AURICWELL_ENABLED=true`. The permanent-office flag hides the AuricWell entry point and denies both authenticated and public office APIs; shared office routes also enforce the flag for EHR identities/clinical organizations. Re-enabling permanent offices or selecting Vonage video requires `VONAGE_CLINICAL_VIDEO_APPROVED=true` and the existing native-video credentials. These switches do not change full-suite Campaign 2 workforce messages.

Google setup:

- The organizer defaults to `ai@plottwistco.com`; override through the platform settings or the initial default `AURICWELL_GOOGLE_MEET_ORGANIZER`.
- Use the existing `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64` (or raw JSON) secret. Enable Google Meet API and domain-wide delegation for `https://www.googleapis.com/auth/meetings.space.created`. The organizer must be an actual Workspace user in the covered organization, not a Google Group.
- The backend creates a unique Open Meet space per appointment. Google accounts are not required for participants. Automatic recording, transcription, and smart notes are set off. This does not assert that every separate Gemini feature is disabled by that configuration.
- Providers click **Join session** while signed into AuricWell. The assigned provider or an authorized patient/guardian can obtain the link through the appointment endpoint, from 15 minutes before the start until 30 minutes after the end. Administrative schedule access alone does not expose the room.
- Client email reminders contain the direct Meet URL as requested. The URL is not included in general schedule/chart JSON or app audit details. The direct Google link works independently of the AuricWell login/join-time check, so keep it private. The app's existing games remain separate from the Google Meet tab.
- A room is reused across concurrent joins and reminders. Previously invited appointments keep their original video service when the platform switch changes. Rescheduling or reassigning the appointment closes the old Meet room and creates a new one. A one-minute worker restricts anonymous admission and ends Meet conferences for cancelled/completed, expired (end plus 30 minutes), withdrawn, or disabled appointments. Failed closure is retried. This is not an instantaneous Google-side expiry guarantee.

Notifyre setup (no account or number has been purchased by the app):

1. Create the Notifyre account, execute its BAA, register the US patient appointment campaign, and purchase/link a dedicated number in Notifyre. Number verification in AuricWell proves account ownership of the number; the campaign approval and BAA references are superadmin attestations, not automated legal/campaign verification.
2. In platform settings, leave appointment SMS **Off**, enter the API token, E.164 number, approved campaign reference, and signed BAA reference, then save. The token is encrypted at rest and never returned to the browser; leaving its input blank keeps the saved secret.
3. Click **Verify saved Notifyre number**. It queries `/sms/numbers` with `x-api-token`; no message is sent. If the vendor's actual number response differs from the documented shapes, verification fails closed and needs adapter review. No live Notifyre account test has been possible yet.
4. Choose **Notifyre** and save. Changing the token/number/campaign/BAA reference clears verification. Configure Notifyre's registered START/STOP/HELP responses. US reminders include STOP/HELP instructions, and Notifyre manages its carrier/account unsubscribe list. Replies remain in Notifyre; this change does not implement inbound clinical conversation or “Y” attendance processing.
5. Open **Schedule → Reminder preferences** for each recipient. A saved valid phone, explicit appointment-text permission, and evidence are required. Consent is bound to the recipient's phone plus provider, campaign, and sending number. A provider/number/campaign switch requires renewed review; it never silently transfers old consent. Terms/privacy links and frequency/rate disclosures are displayed at opt-in.

To switch later, configure the registered patient sender in the existing Vonage compliance system, set `VONAGE_CLINICAL_APPROVED=true`, enter its number and Campaign 1 registration ID in platform settings, and choose **Vonage Campaign 1**. The sender must match the approved campaign, permit reminders, and not be the workforce sender. Existing Vonage tenant ownership, carrier approval, STOP and recipient permission gates remain active. The global routing choice does not authorize one practice to use another practice's registered number. There is no automatic fallback to another carrier on a failed/uncertain send. Calls retain their current integration.

Reminders and recovery:

- Only scheduled/confirmed virtual appointments within the next 30 days are eligible, with an active assigned provider, activated practice, and completed telehealth consent. Email uses the chart's saved address, respects the recipient's reminder choice and the existing automated-mail gates. Delivery credentials never enter browser-visible chart records.
- The minute worker sends a confirmation when more than a day remains, a reminder within one day, and a reminder within one hour. A booking created inside a reminder window receives only that currently due message. Persisted unique claims prevent two workers from sending the same reminder. Provider responses are recorded as **submitted**, not delivered.
- **Schedule → Reminder status** shows submitted, in-progress, cancelled, and uncertain outcomes. An ambiguous response is retained for review rather than automatically resent. Check the sending service's activity, confirm it was not sent, then allow another attempt. In-progress claims cannot be reset in the first five minutes. A later reminder window is a separate message.
- Changing the appointment or cancelling it is rechecked before dispatch. A message already accepted by the email/SMS provider cannot be retracted. Direct Meet links are retired by the lifecycle worker described above.
- Future Vonage guest links use an opaque token in the URL fragment (`/join/session#token=...`), with only its hash indexed in the database and the token removed from browser history after opening. Native SDK setup remains separately commissioned before enabling.

Validation: `npm run test:auricwell` from `backend/` uses disposable native MySQL and synthetic recipients with injected transports. Tests cover settings authority, encryption/redaction, tenant and patient access, simultaneous room creation, provider switching, stale links, cancellations, retirement retries, duplicate dispatch, scoped SMS consent, and ambiguous-send recovery. `npm run build` from `auricwell/` validates the client. One empty Meet space was created and retired successfully under `ai@plottwistco.com`; no patient invites or SMS were sent during implementation.
