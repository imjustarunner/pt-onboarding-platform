# People Operations — Pre-Hire & Onboarding Overhaul

**Goal:** Turn the existing applicant → pre-hire → onboarding → active-employee pipeline into one seamless, BambooHR-style People Operations experience. Every feature decision reuses existing app infrastructure rather than building parallel systems.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Vision & Target Flow](#2-vision--target-flow)
3. [People Ops UI — Navigation & Tab Structure](#3-people-ops-ui--navigation--tab-structure)
4. [Pre-Hire Settings Hub](#4-pre-hire-settings-hub)
5. [Mark Hired Modal](#5-mark-hired-modal)
6. [Candidate Token Portal (No-Login Pre-Hire Access)](#6-candidate-token-portal-no-login-pre-hire-access)
7. [Digital Forms & Document Reuse Strategy](#7-digital-forms--document-reuse-strategy)
8. [Multi-Signer Contract Workflow](#8-multi-signer-contract-workflow)
9. [Onboarding & Training Integration](#9-onboarding--training-integration)
10. [Implementation Phases](#10-implementation-phases)
11. [Open Questions & Risks](#11-open-questions--risks)

---

## 1. Current State

### 1.1 Dual Status Model

The platform tracks hiring and employee lifecycle through two parallel systems:

| Layer | Field | Values |
|-------|-------|--------|
| Hiring applicant stage | `hiring_profiles.stage` | `applied`, `hired`, `not_hired` |
| Employee lifecycle status | `users.status` | See table below |

`users.status` controls login access, dashboard visibility, and billing:

| Status | Display Label | Access |
|--------|--------------|--------|
| `PROSPECTIVE` | Prospective (Applicant) | No login, no platform access |
| `PENDING_SETUP` | Pending Setup | Token-only, password setup only |
| `PREHIRE_OPEN` | Pre-Hire | Pre-hire dashboard, tasks, docs, digital forms |
| `PREHIRE_REVIEW` | Ready for Review | Portal locked; waiting on staff review |
| `ONBOARDING` | Onboarding | Full onboarding scope; workspace login enabled |
| `ACTIVE_EMPLOYEE` | Active | Full platform access, on-demand training |

**Source files:**
- `frontend/src/utils/statusUtils.js` — status labels and badge classes
- `backend/src/utils/accessControl.js` — route-level status gates
- `backend/src/middleware/auth.middleware.js` — `checkPendingAccess` blocked routes

### 1.2 Existing Hiring Flow (as-built)

```
[Public careers / Manual creation]
        ↓
Applicant created
  users.status = PROSPECTIVE
  hiring_profiles.stage = applied
        ↓
Staff review (HiringCandidatesView tabs: Profile, Resume, Notes, Reviews, Tasks, Pre-Screen, References)
        ↓
"Mark hired (start setup)" clicked
  POST /api/hiring/candidates/:userId/promote
    → users.status = PENDING_SETUP
    → hiring_profiles.stage = hired (removed from Applicants list)
    → passwordless token generated (7 days)
    → job description document snapshot created
        ↓
Staff manually opens User Manager → assigns pre_hire onboarding package
    → users.status = PREHIRE_OPEN (triggered by package assignment)
    → training tasks, document sign tasks, checklist created
        ↓
Candidate completes pre-hire checklist
  (PendingCompletionView, OnboardingChecklistView)
    → users.status = PREHIRE_REVIEW
    → workspace account provisioned
    → admin notified
        ↓
Staff clicks "Promote to Onboarding"
  POST /api/users/:id/promote-to-onboarding
    → users.status = ONBOARDING
    → workspace login enabled
        ↓
Staff assigns onboarding package
    → training, docs, checklist for onboarding
        ↓
Staff marks active
  POST /api/users/:id/mark-complete
    → users.status = ACTIVE_EMPLOYEE
```

### 1.3 Current Pain Points

| Pain Point | Detail |
|------------|--------|
| Disconnected promote → package step | After "Mark hired," staff must separately go to User Manager and assign a pre-hire package. No guidance or default. |
| No pre-hire settings hub | Pre-hire package defaults, default docs, signer roles, token expiry, and reminder schedules are not configurable in one place. |
| Contracts not streamlined | Staff must pre-build all contract templates in the Documents Library before they can assign them. No shortcut from "Mark hired." |
| No multi-signer support | Document signing supports one signer (the employee). Hiring manager and owner countersignature is not supported. |
| Staff to-dos not visible | After a contract is sent, no dashboard surface shows pending internal countersignatures as staff tasks. |
| Candidate can't access docs without full login | Pre-hire document signing requires an authenticated session. Token links only support password setup. |
| Settings are scattered | Careers, intake links, onboarding packages, and agency flags live in separate admin surfaces. |
| Training blocked at pre-hire | Middleware blocks `/api/modules` and `/api/training-focuses` for `PREHIRE_OPEN` users even when pre-hire packages include training. |

---

## 2. Vision & Target Flow

One orchestrated flow where "Mark hired" is the single trigger that kicks off a pre-hire workflow. Staff configure defaults once. The candidate receives a token and completes pre-hire docs in a clean portal. Staff see outstanding countersignatures as to-dos. Onboarding is a natural continuation with their organization email and full login.

```
Applicant
    ↓ (staff clicks "Mark hired")
[Mark Hired Modal opens]
  ├── Pre-hire docs auto-loaded from default pre-hire package (settings)
  ├── Contract attached (from template or new upload)
  ├── Staff selects internal signers (e.g., Hiring Manager, Owner)
  └── Staff clicks "Send to candidate"
        ↓
Candidate receives token email
  [Candidate Token Portal — no full login]
    ├── Reviews + signs pre-hire digital forms
    ├── Signs contract (signature placed by staff in modal)
    └── Submits → triggers PREHIRE_OPEN
        ↓
[Pre-Hire tab in People Ops]
  ├── Candidate card shows outstanding staff countersignatures (to-dos)
  ├── Staff countersign contract (in-app)
  ├── Staff review pre-hire form submissions
  └── Staff click "Promote to Onboarding" when ready
        ↓
Onboarding
  [Candidate receives organization email login]
    ├── Signs onboarding documents
    ├── Completes training focuses & modules
    └── Sets up account information
        ↓
Active Employee
```

---

## 3. People Ops UI — Navigation & Tab Structure

### 3.1 Current Navigation (keep as-is)

The People Ops dropdown in `App.vue` already has:
- Applicants (`/admin/hiring`) — `hiringEnabled` gate
- Careers — `hiringEnabled` gate
- On-Demand Training — `peopleOpsEnabled` gate
- Training Modules — `peopleOpsEnabled` + admin
- Progress — `peopleOpsEnabled`

### 3.2 New: Pre-Hire Tab

Add a **Pre-Hire** tab/route to the People Ops section, visible to users with `canManageHiring`. This is a dedicated interface — separate from the Applicants list — that shows everyone in `PENDING_SETUP` or `PREHIRE_OPEN` or `PREHIRE_REVIEW`.

**Route:** `/:slug/admin/pre-hire`

**Pre-Hire list columns:**
- Name, role, date marked hired
- Pre-hire stage pill (Pending Setup / Pre-Hire / Ready for Review)
- Documents status (e.g., "2 of 3 signed")
- Outstanding staff countersignatures (badge if any)
- Days since hired

**Candidate detail view (drawer or page):**
- Summary cards: Pre-hire docs, staff countersignatures, checklist progress
- Tabs: Overview | Documents | Forms | Notes | Tasks

### 3.3 Applicants List (existing — minimal changes)

Keep the existing `HiringCandidatesView.vue` for `PROSPECTIVE` candidates. After "Mark hired," the candidate moves out of this list and into the new Pre-Hire list. The existing `stageFilter` already handles `hired` vs `applied` — no candidate should remain visible in both views simultaneously.

---

## 4. Pre-Hire Settings Hub

Add a new Settings section: **Settings → Hiring & Pre-Hire**. This is the configuration panel that powers the "Mark Hired" modal defaults and the entire pre-hire workflow.

### 4.1 Settings Sections

#### Default Pre-Hire Package
- Dropdown to select a saved `onboarding_packages` entry with `package_type = 'pre_hire'`
- This package is auto-applied when "Send to candidate" is clicked in the Mark Hired Modal
- Staff can override per candidate in the modal

#### Pre-Hire Document Templates
- Multi-select list of `document_templates` tagged as `document_stage = 'pre_hire'`
- These documents are pre-loaded into the Mark Hired Modal every time
- Staff can add or remove per candidate in the modal
- Documents are categorized as: **For Signature** or **For Review** (mapped to existing `document_action_type`)
- Note: This is an additive category tag on existing document templates — do not create a separate forms system

#### Contract Template
- Designate one `document_template` as the default contract for new hires
- The contract requires both candidate signature + one or more internal signers
- If none is set, the Mark Hired Modal prompts staff to attach one manually

#### Internal Signer Roles
- Define who must countersign contracts (e.g., Hiring Manager, Owner/Director)
- Stored as a list of role assignments: `{ role_label: "Hiring Manager", user_id: null }` — user_id resolved at hire time from the assigned hiring manager on the candidate or from a fallback list
- This is a new concept (see Phase 2 schema work)

#### Candidate Token Settings
- Token expiry duration (default: 7 days; options: 3, 7, 14, 30 days)
- Token email subject line (customizable)
- Token email body template (rich text, supports merge fields: `{{firstName}}`, `{{role}}`, `{{orgName}}`)
- Reminder schedule: how many days before expiry to send a reminder (default: 1 day)

#### Staff Notification Settings
- Which staff roles receive a notification when a candidate completes pre-hire forms
- Whether to send an email when a countersignature is required of a specific staff member

### 4.2 Where These Settings Live

| Setting | Storage | Notes |
|---------|---------|-------|
| Default pre-hire package | `agency_settings` or `agencies` table | New column or JSON field |
| Pre-hire document stage tag | `document_templates.employee_display_category` or new `document_stage` column | Prefer new column to avoid overloading existing categorization |
| Contract template designation | `agency_settings` | FK to `document_templates.id` |
| Internal signer roles | New table `hiring_signer_roles` | See Phase 2 |
| Token expiry | `agency_settings` | Integer (hours) |
| Token email templates | New or existing `email_templates` table | If email templates exist, add type `pre_hire_candidate_invite` |
| Staff notification prefs | Existing notification settings | Extend existing system |

---

## 5. Mark Hired Modal

When staff click **"Mark hired (start setup)"** in `HiringCandidatesView.vue`, instead of immediately calling the promote endpoint and showing the token link in a banner, a **modal** opens. The promote API call is deferred until the staff confirms in the modal.

### 5.1 Modal Sections

#### Candidate Summary (read-only)
- Name, applied role, email, phone
- Confirms which record is being promoted

#### Pre-Hire Documents (auto-loaded from settings)
- List of documents from the default pre-hire package + pre-hire tagged templates
- Each document shows: Title, Type (Signature | Review), action icons (preview, remove)
- Staff can add additional documents from the Documents Library inline
- Staff can re-order documents (candidate will see them in this order)

#### Contract
- If a default contract template is configured in settings, it appears here pre-selected
- If not, an "Attach contract" button opens the Documents Library picker
- Once selected, a **"Place signature fields"** button opens the existing `PDFFieldDefinitionBuilder` / `DocumentFieldLayoutEditor` in a sub-panel or slide-over
  - Candidate signature field (always required)
  - Staff countersignature fields (one per internal signer role)
  - Date, initials, and other field types from the existing field definition system
  - This reuses the existing `field_definitions` JSON on `document_templates` — no new signing infrastructure

#### Internal Signers
- List of signer role slots from settings (e.g., "Hiring Manager," "Owner")
- Each slot shows the resolved staff user (defaulting to settings) with an override dropdown
- Staff can add ad-hoc signers not in the default roles list
- Each signer is assigned a countersignature field on the contract (linked back to field placement above)

#### Candidate Message
- Subject line (pre-filled from settings template)
- Message body (pre-filled from settings template, editable inline)

#### Actions
- **Send to candidate** — promotes user to `PENDING_SETUP`, assigns documents as tasks, sends token email, creates staff countersign to-dos
- **Save as draft** — saves modal state without promoting (useful if staff need to get contract signed off first)
- **Cancel**

### 5.2 What Happens on "Send to Candidate"

1. `POST /api/hiring/candidates/:userId/promote` — status → `PENDING_SETUP`, generate token
2. Assign selected documents as tasks via `TaskAssignmentService.assignDocumentTask()` scoped to the candidate
3. Create internal signer to-do tasks for each staff countersigner (new task type: `countersignature`)
4. Send token email using configured template
5. Candidate card moves to Pre-Hire tab

---

## 6. Candidate Token Portal (No-Login Pre-Hire Access)

After "Send to candidate," the candidate receives an email with a link containing their token. This link leads to a **lightweight portal** that does not require a username/password.

### 6.1 Portal Behavior

The token URL resolves to a candidate-facing view: `/pre-hire/:token`

On load, the token is validated:
- If valid and not expired → show the portal
- If expired → show a friendly expiry message with contact info
- If already used (candidate has set a password) → redirect to `/login`

The portal displays:
- Welcome message with candidate name, role, and organization
- A checklist of pre-hire items to complete (in order)
- Each item links to the relevant form or document signing flow

### 6.2 What the Candidate Can Do in the Portal

| Action | Existing Infrastructure to Reuse |
|--------|----------------------------------|
| Sign documents (contract, pre-hire docs) | Adapted from `PublicIntakeSigning` — creates authenticated context from token, writes to `signed_documents` / `tasks` instead of intake submission storage |
| Fill out pre-hire digital forms | Reuse existing public intake form rendering (digital forms tagged `pre_hire`) |
| View submitted/signed documents | Read-only view of completed tasks |

### 6.3 Authentication Model

The token acts as a scoped, short-lived credential. The backend authenticates each portal request by resolving the token to a user record and verifying:
- Token has not expired
- User is in `PENDING_SETUP` or `PREHIRE_OPEN` status
- The requested resource belongs to that user

This is modeled on the existing `passwordless-login` and public intake patterns but scoped to pre-hire endpoints only. The candidate does not gain access to the full staff or employee platform.

### 6.4 Transition After Portal Completion

When the candidate finishes all pre-hire items in the portal:
- `users.status` → `PREHIRE_OPEN` (or immediately to `PREHIRE_REVIEW` if no further staff-required steps)
- Staff receives a notification
- Candidate sees a confirmation screen: "Thanks, your documents are under review. You will receive your login credentials once your onboarding is confirmed."
- Later, when staff promotes to `ONBOARDING`, the candidate receives their organization email and full login credentials

### 6.5 Visibility After Onboarding Login

Once the candidate has a full login:
- Signed pre-hire documents appear in their profile's Documents section (read-only)
- Pre-hire digital form submissions appear in their profile overview
- This matches the existing behavior for employee documents and tasks

---

## 7. Digital Forms & Document Reuse Strategy

### 7.1 Guiding Principle

**Do not rename or clone.** The existing Digital Forms system (`document_templates`, field definitions, signing workflow) is the single source of truth. Reuse it by adding categorical tagging rather than building a parallel "Hiring Forms" system.

### 7.2 Document Stage Tagging

Add a `document_stage` column to `document_templates`:

| Value | Meaning |
|-------|---------|
| `pre_hire` | Available in the Mark Hired Modal and Candidate Token Portal |
| `onboarding` | Available in onboarding packages |
| `ongoing` | Available for active employees |
| `general` | No stage restriction (default) |

This mirrors the existing `modules.stage` ENUM pattern (`pre-hire`, `onboarding`, `ongoing`) already in the training system. Multiple stages can apply to one template (stored as JSON array or junction table).

**Migration:** `database/migrations/{next_number}_document_template_stage.sql`

### 7.3 Digital Forms (Intake Forms)

Existing digital forms (public intake links) can be tagged as `pre_hire` in their settings. When a candidate is in the Token Portal, they see only forms tagged `pre_hire` that belong to the agency. Form submissions link to the candidate's user record, not an anonymous intake submission, so they appear in the candidate's profile.

The existing `IntakeLinksView.vue` in Settings → Digital Forms gains a "Stage" filter: All | Pre-Hire | Onboarding | General.

### 7.4 Signature Placement

All new pre-hire and contract documents use the **modern `field_definitions` JSON approach** (not the legacy `signature_x/y` columns). The existing `PDFFieldDefinitionBuilder.vue` and `DocumentFieldLayoutEditor.vue` support this. Staff use these tools inside the Mark Hired Modal to place:
- Candidate signature field
- One countersignature field per internal signer
- Supporting fields (date, initials, text boxes)

Legacy templates with only `signature_x/y` columns continue to work via `DocumentSigningService.resolveSignatureCoords()` fallback, but new contracts should always use `field_definitions`.

### 7.5 No Separate Hiring Forms System

There is no "Hiring Forms" section. Pre-hire content lives in:
- **Documents Library** (tagged `pre_hire`) — accessed by staff via Settings → Documents and by the Mark Hired Modal
- **Digital Forms / Intake Links** (tagged `pre_hire`) — accessed by staff via Settings → Digital Forms
- **Onboarding Packages** (`package_type = 'pre_hire'`) — bundles the above for quick assignment

---

## 8. Multi-Signer Contract Workflow

### 8.1 Current State

Document signing supports one authenticated signer (the employee/candidate). The `POST /api/document-signing/:taskId/countersign` endpoint exists but is not wired to a staff-facing to-do or notification system.

### 8.2 Target Behavior

Contracts require two signature layers:
1. **Candidate signature** — collected in the Candidate Token Portal before status advances
2. **Staff countersignature(s)** — collected in the staff People Ops app after the candidate signs, as staff to-dos

#### Staff Countersign Flow

After the candidate signs their portion of the contract:
1. The assigned internal signers (e.g., Hiring Manager, Owner) each receive a notification: "Action required: [Candidate Name]'s contract is ready for your countersignature."
2. The notification links to the Pre-Hire tab → candidate card → Documents section
3. The staff member clicks "Countersign" next to the contract
4. The existing `DocumentSigningWorkflow.vue` renders in countersign mode, showing the candidate's completed fields and highlighting the staff member's assigned signature field
5. On completion, the document is finalized and the full signed PDF is stored

#### Task Type: `countersignature`

A new task type `countersignature` is added to the existing `tasks` system. This allows:
- Staff to-do badges in the Pre-Hire tab
- Unified checklist rendering via `UnifiedChecklistTab.vue`
- Audit trail in `task_audit_log`

### 8.3 Staff Signer Detail Attachment

Each countersignature field on the contract is linked to a specific internal signer's identity. When the signer countersigns, the system captures:
- Signer name, role title, and signature image (existing e-sign capture)
- Timestamp and IP (existing audit system)
- E-sign consent and intent (existing `document_signature_workflow`)

This mirrors the full ESIGN compliance trail already in place for candidate signatures.

### 8.4 Schema Additions (Phase 2)

```sql
-- New table: internal signer role templates per agency
CREATE TABLE hiring_signer_roles (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  agency_id    INT NOT NULL,
  role_label   VARCHAR(100) NOT NULL,   -- e.g. "Hiring Manager"
  default_user_id INT NULL,             -- fallback signer if none resolved from candidate
  sort_order   TINYINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (default_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- New columns on tasks for countersignature assignments
ALTER TABLE tasks
  ADD COLUMN countersign_signer_user_id INT NULL,
  ADD COLUMN countersign_role_label VARCHAR(100) NULL,
  ADD COLUMN countersign_signed_at TIMESTAMP NULL,
  ADD COLUMN countersign_field_key VARCHAR(100) NULL;
```

Migration files follow the convention in `database/migrations/`.

---

## 9. Onboarding & Training Integration

### 9.1 Onboarding Package Automation

When staff clicks "Promote to Onboarding" (or when a future auto-trigger fires after all countersignatures are collected), the default onboarding package is automatically assigned rather than requiring a separate manual step in User Manager.

Settings → Hiring & Pre-Hire gains a **Default Onboarding Package** field (separate from the default pre-hire package). When set, the promote-to-onboarding endpoint assigns it automatically.

### 9.2 Training Focuses & Modules in Onboarding

Training focuses with `stage = 'onboarding'` and modules with `stage = 'onboarding'` are bundled into the default onboarding package. When assigned:
- The candidate (now in `ONBOARDING` status) can access `/api/training-focuses` and `/api/modules`
- Training tasks appear in their dashboard checklist via `UnifiedChecklistTab.vue`
- Progress is trackable from the admin Progress view already in the People Ops nav

### 9.3 Pre-Hire Training Gap

Currently, `backend/src/middleware/auth.middleware.js` blocks `/api/modules` and `/api/training-focuses` for `PREHIRE_OPEN` users. If pre-hire packages are designed to include training, this block must be relaxed to allow access to modules explicitly assigned to the user (task-scoped, not library-wide).

**Recommendation for Phase 3:** Add a package-type guard — if the user's active package type is `pre_hire` and the training focus was assigned via that package, allow access to that focus and its modules. Block library browsing still.

### 9.4 Account Setup in Onboarding

The account setup flow (`AccountInfoView.vue`, `account_types`, `user_accounts`) is not auto-triggered by package assignment. For the onboarding checklist to include account setup, a custom checklist item pointing to `/account-info` should be included in the default onboarding package. No schema change is needed — this uses the existing `user_checklist_assignments` pattern.

### 9.5 Training in Active Employee Stage

Training focuses with `stage = 'ongoing'` and on-demand training remain exclusive to `ACTIVE_EMPLOYEE` status. No change to this behavior.

---

## 10. Implementation Phases

### Phase 1 — UI & Settings Foundation (No schema changes)

| Task | Files Involved |
|------|---------------|
| Add Pre-Hire tab/route to People Ops nav | `App.vue`, new `PreHireView.vue` |
| Pre-Hire list — candidates in `PENDING_SETUP`, `PREHIRE_OPEN`, `PREHIRE_REVIEW` | New `PreHireView.vue`, `GET /api/users?status=PREHIRE*` |
| Add "Hiring & Pre-Hire" settings section (placeholder UI, read-only) | New settings component in `AgencyManagement.vue` or standalone settings route |
| Convert "Mark hired" button to open a modal instead of directly calling promote | `HiringCandidatesView.vue` — intercept button click, add `MarkHiredModal.vue` |
| Mark Hired Modal — candidate summary, document picker (reads existing library), send action | New `MarkHiredModal.vue`, uses existing `DocumentsLibraryView` data |
| Document stage filter in Digital Forms (Settings) | `IntakeLinksView.vue` — add stage filter/tag field |

### Phase 2 — Schema & API (Multi-signer, Settings Persistence)

| Task | Migration / File |
|------|-----------------|
| `document_templates.document_stage` column | `{next}_document_template_stage.sql` |
| `hiring_signer_roles` table | `{next}_hiring_signer_roles.sql` |
| `tasks` countersignature columns | `{next}_tasks_countersignature.sql` |
| `agency_settings` — default pre-hire package, default onboarding package, contract template, token expiry | `{next}_agency_prehire_settings.sql` |
| New API: `GET/POST /api/hiring/signer-roles` | New routes in `hiring.routes.js` |
| New API: `POST /api/hiring/candidates/:userId/send-prehire` — unified promote + assign + notify | `hiring.controller.js` |
| Countersign task creation on candidate document submission | `taskAssignment.service.js` |
| Staff countersign endpoint wired to to-do system | `documentSigning.controller.js` |

### Phase 3 — Candidate Token Portal

| Task | Files Involved |
|------|---------------|
| New public route `/pre-hire/:token` | `router/index.js`, new `CandidatePreHirePortalView.vue` |
| Token validation middleware (scoped, no full login) | New middleware or extend `auth.middleware.js` |
| Document signing in portal context (token-authenticated) | Adapter around `DocumentSigningWorkflow.vue` or new `TokenSigningView.vue` |
| Digital form rendering in portal | Reuse `PublicIntakeSigningView.vue` patterns, link submissions to `user_id` |
| Portal completion trigger → status advance + staff notification | `pendingCompletion.service.js` update |

### Phase 4 — Onboarding Automation & Training

| Task | Files Involved |
|------|---------------|
| Auto-assign default onboarding package on promote-to-onboarding | `user.controller.js` → `promote-to-onboarding` endpoint |
| Pre-hire training access guard (task-scoped, not library-wide) | `auth.middleware.js` → `checkPendingAccess` |
| Account setup checklist item auto-included in default onboarding package | Onboarding package defaults logic |
| Staff countersign completion notification → auto-promote trigger (optional) | New service or extend `pendingCompletion.service.js` |

### Phase 5 — Polish & Instrumentation

| Task | Notes |
|------|-------|
| Tutorial / onboarding tour for Pre-Hire tab | Extend `hiringCandidates.tour.js` pattern |
| Legacy status cleanup (`pending`, `ready_for_review`, `active`, `completed`) | Audit and deprecate in status maps after migration confirmed |
| Billing audit — ensure `PREHIRE_OPEN` / `PENDING_SETUP` are not counted as active onboardees until promote | `billingUsage.service.js` |
| Staff dashboard widget — "Pre-hire items needing your attention" | `DashboardView.vue` or new People Ops widget |
| Email audit — ensure all token and notification emails pass through unified email service | `unifiedEmail/*.js` |

---

## 11. Open Questions & Risks

| # | Question / Risk | Recommendation |
|---|----------------|---------------|
| 1 | **Token signing vs. full ESIGN compliance** — The existing ESIGN flow requires authenticated session. Does the token portal need full ESIGN (consent → intent → sign)? | Yes, but consent and intent steps can be adapted for token-auth context. Use same UI, different auth path. |
| 2 | **Pre-hire training access** — If training is included in a pre-hire package today, it silently fails due to middleware block. | Fix in Phase 3 with task-scoped guard. Communicate this gap to staff in settings UI until fixed. |
| 3 | **Agency feature flag split** — `hiringEnabled` (Applicants) vs `peopleOpsEnabled` (Training/Progress). Does Pre-Hire require both flags or just `hiringEnabled`? | Pre-Hire is a hiring feature — gate it under `hiringEnabled`. Multi-signer to-dos surface under both flags if `peopleOpsEnabled` is also on. |
| 4 | **Contract template ownership** — Who creates the contract PDF template? Staff in Documents Library today. Should there be a simplified contract builder? | Out of scope for this overhaul. Use existing template builder. Mark in settings UI: "Configure your contract template in Documents Library first." |
| 5 | **Candidate portal on mobile** — Token emails are often opened on mobile. Document signing workflow must be mobile-friendly. | Audit `DocumentSigningWorkflow.vue` for mobile responsiveness as part of Phase 3 QA. |
| 6 | **What happens if the token expires before the candidate signs?** | Staff sees "Token expired" status on the Pre-Hire candidate card and can regenerate via existing `POST /api/users/:id/send-setup-link`. Expose this button directly in the Pre-Hire candidate card. |
| 7 | **Legacy users in `PENDING_SETUP` without a pre-hire workflow** | These users won't have a pre-hire workflow entry. Pre-Hire tab should gracefully display them as "Setup initiated (no pre-hire package assigned)" with a prompt to assign a package. |
| 8 | **Internal signer default resolution** — If no hiring manager is assigned to a candidate, which staff user is the fallback countersigner? | Resolved from `hiring_signer_roles.default_user_id` per agency. Staff is prompted to confirm in the modal before sending. |
| 9 | **Billing for pre-hire users** — `ONBOARDING` users are currently billed as active. Where does `PREHIRE_OPEN` land? | Currently not billed. Verify this is intentional and document in `billingUsage.service.js`. |
| 10 | **Dual checklist systems** — Tasks vs. `onboarding_checklist_items` aren't in sync. Pre-hire portal should exclusively use the task-driven system (UnifiedChecklistTab). | In Phase 1/2, ensure new pre-hire document assignments write to `tasks` only. `OnboardingChecklistView` can remain for legacy users. |
