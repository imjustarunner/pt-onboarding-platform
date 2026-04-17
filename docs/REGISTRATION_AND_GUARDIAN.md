# Registration catalog and guardian enrollment

Companion to [`SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md`](SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md). Covers **agency-scoped registration offers** (company events + learning classes), **guardian-only** visibility rules, and **deferred** intake-form / comms work.

## Where to find registration URLs (team reference)

- **Smart Registration / digital intake links** (the actual signup flow) use the app’s public intake routes:
  - Full: `/intake/{publicKey}`
  - Short: `/i/{publicKey}`
  - `publicKey` is the value stored on each row in **`intake_links.public_key`**. In the product, open **Admin → Digital forms / Intake links** ([`IntakeLinksView.vue`](../frontend/src/views/admin/IntakeLinksView.vue)) and use **Copy link** (or read the key from the list). The shareable URL is built with [`publicIntakeUrl.js`](../frontend/src/utils/publicIntakeUrl.js); deployments may set **`VITE_PUBLIC_INTAKE_BASE_URL`** so links point at the correct hostname.
- Set **Form type** to **Smart Registration** for event/class registration flows (`form_type = smart_registration`).
- **Public events-only pages** (scheduled Skill Builders / company events with registration):
  - `/open-events/{agencySlug}` — all upcoming **events** for the agency slug (alias: `/{agencySlug}/events` on the same public listing).
  - `/open-events/{agencySlug}/programs/{programSlug}/events` — program-scoped **events** (API: `GET /api/public/skill-builders/agency/:slug/programs/:programSlug/events`).
  - `/{organizationSlug}/programs/{programSlug}/events` — branded URL where the first segment may be the **agency** or a **program** portal slug (API: `GET /api/public/skill-builders/portal/:portalSlug/programs/:programSlug/events`).
  These pages load data from the public Skill Builders events APIs. **Only** events that are **`registration_eligible`** and have an **active** intake link tied to the event (**`intake_links.company_event_id`**) are listed. Optional **hero image**, **extra public details**, and **in-person venue** fields live on `company_events`. **Find closest session**: `POST /api/public/skill-builders/agency/:slug/events/nearest` with `{ "address": "…" }`.
- **Public enroll hub pages** (program enrollments + events together):
  - `/open-events/{agencySlug}/enroll` — lists affiliated **program** organizations; each card links to that program’s enroll hub (API: `GET /api/public/skill-builders/agency/:slug/enroll/programs`).
  - `/{agencySlug}/enroll` — same, branded.
  - `/open-events/{agencySlug}/programs/{programSlug}/enroll` and `/{portalSlug}/programs/{programSlug}/enroll` — **Program enrollments** (`learning_program_classes` with **`registration_eligible`**, open enrollment window, **active** intake with **`learning_class_id`** and no `company_event_id`) plus the same **events** as the events-only program page (API: `GET .../programs/:programSlug/enroll` and `GET .../portal/:portalSlug/programs/:programSlug/enroll`).
  Families use **Enroll now** → `/intake/{publicKey}` like events. **Events-only** pages link to the enroll hub when families need individual program enrollment.

## Goals

- **Catalog**: Union of registration-eligible `company_events` and `learning_program_classes` for a parent **agency** (`agencyId` query param). No roster PHI—titles, dates, eligibility flags only.
- **Guardians**: See **full name** for linked dependents in authenticated guardian APIs (not school portal). **Initials** remain the default for school staff, emails, and broad notifications (audit deferred).
- **Enrollment**: Guardian can request enrollment for linked `client_ids` into an open event or class; server validates `client_guardians`, agency, affiliation rules, and payer flags (MVP).

## Schema (migration `583_registration_eligibility.sql`)

- `company_events`: `registration_eligible`, `medicaid_eligible`, `cash_eligible` (TINYINT, default 0).
- `learning_program_classes`: same three columns.

Admins set flags in **Company events** UI and **Challenge / learning class** management UI.

## APIs (guardian, `client_guardian` role)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/guardian-portal/dependents?agencyId=` | Dependents linked to guardian with `clients.agency_id = agencyId`; includes `fullName`. |
| GET | `/api/guardian-portal/registration/catalog?agencyId=` | Normalized catalog items (`company_event` \| `learning_class`). |
| POST | `/api/guardian-portal/registration/company-events/:eventId/enroll` | Body: `agencyId`, `clientIds[]`, optional `payerType` (`medicaid` \| `cash`). |
| POST | `/api/guardian-portal/registration/learning-classes/:classId/enroll` | Same body shape. |

Access to `agencyId` requires at least one active `client_guardians` row to a client with that `clients.agency_id`.

## Payer flags (MVP)

- If `payerType=medicaid` and event/class `medicaid_eligible` is false → 400.
- If `payerType=cash` and `cash_eligible` is false → 400.
- Omitted `payerType` → allowed (intake can collect later).

## Open product risks (not solved in code)

- **Adult self-registration** for events (parent as participant): model as a `clients` row + guardian link vs separate registrant profile—TBD.
- **Child’s Medicaid covering parent** (or reverse): payer-of-record and billing rules—TBD with billing/intake owners.

## Public smart registration intake (`form_type = smart_registration`)

These routes are **unauthenticated** and share the global `publicIntakeLimiter` (per `publicKey` + IP).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/public-intake/:publicKey/registration-catalog` | Same catalog rules as guardian catalog (events + classes, `registration_eligible`, enrollment windows for classes). **Only** when the link is `smart_registration`. |
| POST | `/api/public-intake/:publicKey/match-client` | Body: `intakeData` + `organizationId` + `clients[]` (or `client`). Matches existing `clients` by **stored initials** (same derivation as intake client create) + **active** `client_organization_assignments` to the selected school org; optional DOB narrows ambiguous matches. |
| POST | `/api/public-intake/:publicKey/login-help` | Stub: logs `public_intake_login_help` with optional `submissionId` / `signerEmail` (for “notify staff” after registration). |

**Consent step** (`POST .../consent`) runs the same client match for smart registration and writes `registration_client_match` / `registration_matched_client_id` into `intake_data.responses.submission`.

**Finalize** (`POST .../:submissionId/finalize`) runs `enrollSmartRegistrationSelections`:

- `entityType` **`class`** → `LearningProgramClass.addClientMember` only if the class passes **registration_eligible** + active status + enrollment window (aligned with catalog).
- **`program_event`** → unchanged (staff assignment + shift signup).
- **`event`** or **`company_event`** → `skills_group_clients` via shared `enrollClientsInCompanyEvent` (same payer + school-affiliation rules as guardian `POST .../registration/company-events/:eventId/enroll`). Optional payer: per-selection `payerType` or submission `registrationPayerType` / `registration_payer_type` (`medicaid` \| `cash`).
- If `intake_links.company_event_id` is set, company-event selections must match that id. The public registration step **narrows the catalog to that event** and **hides the option picker** when only that event applies.

**New guardian accounts** from intake use a **72-hour** temporary password (`User.setTemporaryPassword`). Completion email and optional template placeholders include `REGISTRATION_LOGIN_EMAIL`, `REGISTRATION_TEMP_PASSWORD`, `PORTAL_LOGIN_URL`, `REGISTRATION_EVENT_SUMMARY`. Status polling returns `registrationCompletion` (no password) for the thank-you page.

**Returning guardian auto-match** (per-tenant `feature_flags.returningGuardianAutoMatchEnabled` on the **agency**): on finalize, when the flag is on and a **single** SQL match exists for the same guardian email + normalized selected site name + participant initials (via `client_guardians` → `clients` → `client_organization_assignments` / `agencies` / `school_profiles`), the intake **attaches** to that client instead of creating a duplicate. `clients.last_returning_match_submission_id` records the submission id; `intake_data.responses.submission` may include `registration_returning_guardian_auto_match` and `registration_returning_matched_initials`. Completion templates can use `{{RETURNING_MATCH_NOTICE}}` / `{{CLIENT_INITIALS}}`. If consent’s org-based single match (`registration_client_match === 'existing'`) disagrees with the auto-match client id, finalize **creates a new client** to avoid a wrong merge.

**Login**: If the user enters the **correct** temporary password after expiry, the API sends a **password reset** link (same token flow as recovery) instead of a generic failure.

Admin **Intake link** builder: registration source **`agency_catalog`** loads options from the public catalog at runtime; question steps/fields can use visibility **`new_client_only`** (hidden when `registration_client_match === 'existing'`). **Document**, **upload**, and **School ROI** steps support **`always`**, **`new_client_only`**, and **`existing_client_only`** so the signing flow matches the client match from consent; finalize only requires signatures for templates in visible document steps. **Omitted or unknown `visibility` is treated as `always`** so existing saved intakes behave unchanged until admins opt in to client-specific hiding. Conditional questions can target `registration_client_match` like other `showIf` keys.

## Still deferred / follow-ups

- **Email/SMS audit**: Ensure templates use initials + identifier for school-facing and bulk sends.
- **Rich completion**: Dynamic per-event registrant instructions, attachments, magic links beyond the current completion email + status hints.

## Related docs

- [Skill Builders program, school linkage, and cross-sub-organization affiliations](SKILL_BUILDERS_PROGRAM_AND_AFFILIATIONS.md)
- [Program enrollments initiative](PROGRAM_ENROLLMENTS_INITIATIVE.md)
- [Standards-aligned learning system initiative](STANDARDS_ALIGNED_LEARNING_SYSTEM_INITIATIVE.md)
