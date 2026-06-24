# Employee Lifecycle Tab

A dedicated HR/People Ops profile tab that consolidates onboarding and offboarding progress, employment milestone dates, and structured checklists in one place. It is visible on the admin user profile for backoffice admins (admin, super_admin, support) and hiring-capable staff when the agency has People Ops or hiring enabled.

---

## Relationship to Other Features

This tab is a **read/write operational view for HR**. It does not replace:

- **Account tab** status management buttons (Mark Active, Mark Terminated, Promote to Onboarding) — those remain in Account as today
- **Pre-hire / Onboarding packages** (`custom_checklist_items` + `tasks`) — the package-driven completion system continues to drive the portal and training progress; this tab reads from it via auto-sync
- **Credentialing tab** — detailed per-insurance credentialing grid
- **Leave of absence modal** — header button continues to work as-is

See also: [`docs/PEOPLE_OPS_PREHIRE_ONBOARDING_OVERHAUL.md`](PEOPLE_OPS_PREHIRE_ONBOARDING_OVERHAUL.md) for the broader pre-hire pipeline vision.

---

## Access

```
admin, super_admin, support          → always visible
staff + canManageHiring              → visible when agency has peopleOpsEnabled OR hiringEnabled
```

Hidden for guardian, school_staff, and SSC profile modes (same branching as Payroll tab).

---

## UI Sections

### Employee Summary Bar

Eight read-only fields drawn from existing data:

| Field | Source |
|-------|--------|
| Employee Status | `users.status` |
| Start Date | `user_info_values.start_date` / `users.provider_start_date` |
| First Client Date | `user_info_values.first_client_date` |
| Supervisor | `supervisor_assignments` (primary) |
| Last Day Worked | `user_separation_info.last_day_worked` |
| Termination Date | `users.termination_date` |
| Offboarding Status | Computed: N/A → Not Started → In Progress → Complete |

### Onboarding (left column)

1. **Progress bar** — `completed required items / total required items` (role-filtered)
2. **Missing Items** — yellow callout listing incomplete required items
3. **Key Dates Timeline** — chronological dots from milestone dates; green = past, yellow = upcoming
4. **Employment Dates** — editable date inputs that write to `user_info_values` (EAV):
   - Offer Accepted Date, Start Date, Orientation Date, TherapyNotes Training Date, First Client Date, First Payroll Submission, Probation End Date
5. **Grouped checklists** — five category groups (see inventory below)

### Offboarding (right column)

Entire column is grayed/disabled until `users.termination_date` is set.

1. **Termination Date input** — displayed only; to formally terminate use the Account tab "Mark Terminated" button
2. **Separation Information** — editable fields saved to `user_separation_info`
3. **Three offboarding checklist groups** — Access Removal, Property Return, Final Employment Items
4. **Offboarding Notes** — free-text, visible to HR and Admin only

---

## Full Checklist Inventory

### Onboarding

#### Accounts & Access (9 items — all staff)
| item_key | Label | Integration |
|----------|-------|-------------|
| `company_email_created` | Company Email Created | auto: workspace email |
| `logged_into_email` | Logged into Email | manual |
| `grasshopper_login` | Grasshopper Login | manual |
| `therapynotes_login` | TherapyNotes Login | auto: user_info_field `therapynotes_login` — provider only |
| `itsco_portal_login` | ITSCO Portal Login | manual |
| `google_drive_access` | Google Drive Access | manual |
| `slack_teams_access` | Slack/Teams Access | manual |
| `calendar_setup` | Calendar Setup | manual |
| `mfa_enabled` | MFA Enabled | manual |

#### Compliance Documents (10 items)
| item_key | Label | Integration | applies_to |
|----------|-------|-------------|-----------|
| `offer_letter_signed` | Offer Letter Signed | document_task: `offer_letter` | all |
| `employment_agreement_signed` | Employment Agreement Signed | document_task: `employment_agreement` | all |
| `w4_completed` | W-4 Completed | document_task: `w4` | all |
| `i9_completed` | I-9 Completed | document_task: `i9` | all |
| `direct_deposit_form` | Direct Deposit Form | document_task: `direct_deposit` | all |
| `confidentiality_agreement` | Confidentiality Agreement | document_task: `confidentiality_agreement` | all |
| `hipaa_training` | HIPAA Training | training_task: `hipaa` | all |
| `handbook_acknowledged` | Employee Handbook Acknowledgment | document_task: `employee_handbook` | all |
| `liability_insurance_uploaded` | Liability Insurance Uploaded | manual | provider |
| `license_verification` | License Verification | user_info_field: `license_type_number` | provider |

#### Background & Credentialing (7 items — provider)
| item_key | Label | Integration |
|----------|-------|-------------|
| `background_check_ordered` | Background Check Ordered | user_info_field: `provider_background_check_status` |
| `background_check_complete` | Background Check Complete | user_info_field: compound check on status value |
| `fingerprints_complete` | Fingerprints Complete | manual |
| `caqh_complete` | CAQH Complete | user_info_field: `caqh_provider_id` |
| `medicaid_enrollment` | Medicaid Enrollment | manual |
| `credentialing_submitted` | Credentialing Submitted | manual |
| `credentialing_approved` | Credentialing Approved | credentialing: `user_insurance_credentialing` |

#### Orientation Checklist (9 items)
| item_key | Label | Integration | applies_to |
|----------|-------|-------------|-----------|
| `mileage_training` | Mileage Training | manual | all |
| `therapynotes_training` | TherapyNotes Training | training_task: `therapynotes_training` | provider |
| `skill_builders_training` | Skill Builders Training | manual | all |
| `payroll_training` | Payroll Training | manual | all |
| `shadowed_provider` | Shadowed Provider | manual | provider |
| `completed_new_hire_orientation` | Completed New Hire Orientation | manual | all |
| `reviewed_benefits` | Reviewed Benefits | manual | all |
| `met_with_supervisor` | Met with {Supervisor Name} | supervision_session: first finalized session | all |
| `time_submission_training` | Time Submission Training | manual | all |

#### Equipment (5 items)
| item_key | Label | Integration | applies_to |
|----------|-------|-------------|-----------|
| `company_card_issued` | Company Card Issued | manual | all |
| `company_computer_issued` | Company Computer Issued | manual | all |
| `company_phone_issued` | Phone Extension Assigned | manual | all |
| `company_vehicle_assigned` | Company Vehicle Assigned | manual | provider |
| `keys_badge_issued` | Keys/Badge Issued | manual | all |

---

### Offboarding

#### Access Removal (7 items)
| item_key | Label |
|----------|-------|
| `offboard_email_disabled` | Email Disabled |
| `offboard_therapynotes_removed` | TherapyNotes Removed (provider) |
| `offboard_grasshopper_removed` | Grasshopper Removed |
| `offboard_itsco_portal_disabled` | ITSCO Portal Disabled |
| `offboard_google_drive_removed` | Google Drive Access Removed |
| `offboard_payroll_access_removed` | Payroll Access Removed |
| `offboard_mfa_removed` | MFA Removed |

#### Property Return (5 items)
| item_key | Label |
|----------|-------|
| `offboard_keys_returned` | Keys Returned |
| `offboard_phone_returned` | Phone Returned |
| `offboard_computer_returned` | Computer Returned |
| `offboard_company_card_returned` | Company Card Returned |
| `offboard_vehicle_returned` | Vehicle Returned (provider) |

#### Final Employment Items (7 items)
| item_key | Label |
|----------|-------|
| `offboard_final_payroll_submitted` | Final Payroll Submitted |
| `offboard_pto_paid_out` | PTO Paid Out |
| `offboard_mileage_reimbursement` | Mileage Reimbursement Completed |
| `offboard_benefits_terminated` | Benefits Terminated |
| `offboard_cobra_sent` | COBRA Information Sent |
| `offboard_licenses_transferred` | Licenses Transferred (provider) |
| `offboard_documentation_archived` | Documentation Archived |

---

## Database Schema

### `lifecycle_checklist_definitions`
Platform-level checklist item definitions with `integration_type` and `integration_ref` for future event-driven auto-completion. An `agency_id` column allows agency-specific overrides/additions.

### `user_lifecycle_checklist_items`
Per-user state for each applicable definition. Tracks `is_completed`, `completed_at`, `completed_by_user_id`, `completion_method` (`manual` | `auto` | `imported`), and `manually_overridden` (prevents auto-sync from re-checking an item HR explicitly unchecked).

### `user_separation_info`
One row per user when they separate. Stores last day worked, voluntary/involuntary, resignation date, rehire eligibility, exit interview status, and offboarding notes.

### `user_info_field_definitions` (seeded milestone dates)
Five new platform template fields in the existing EAV system:
- `offer_accepted_date`, `orientation_date`, `therapy_notes_training_date`, `first_payroll_submission_date`, `probation_end_date`

---

## Backend API

All routes are on `/api/users/:id/` and require `requireBackofficeAdmin` middleware.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lifecycle` | Full payload including summary, dates, timeline, groups, offboarding |
| `PATCH` | `/lifecycle/dates` | Update milestone dates (writes to `user_info_values` + `users.provider_start_date`) |
| `PATCH` | `/lifecycle/separation` | Update `user_separation_info` |
| `POST` | `/lifecycle/checklist/:definitionId/toggle` | Manual check/uncheck; sets `manually_overridden` on uncheck |
| `POST` | `/lifecycle/sync` | Re-run auto-sync (also called on every GET) |

### Key services

- `backend/src/services/lifecycle.service.js` — aggregates all data for the GET response
- `backend/src/services/lifecycleSync.service.js` — derives auto-completion from existing app data
- `backend/src/controllers/lifecycle.controller.js` — route handlers

---

## Auto-Completion Logic (Phase 1)

`lifecycleSync.service.js` runs on every Lifecycle tab load. It checks each non-manual definition and calls the appropriate resolver:

| integration_type | What it checks |
|-----------------|----------------|
| `user_info_field` | `user_info_values` for the `integration_ref` field key; non-empty value = complete |
| `document_task` | `tasks` with `task_type = 'document'` and `status = 'completed'`; title/type matched by `integration_ref` substring |
| `training_task` | `tasks` with `task_type = 'training'` and `status = 'completed'`; track name/slug matched |
| `account_setup` | For `workspace_email`: `users.email` is populated |
| `credentialing` | Any row in `user_insurance_credentialing` with `status = 'approved'` |
| `supervision_session` | Any finalized `supervision_sessions` row for this supervisee |
| `background_check_complete` (special) | `provider_background_check_status` in `user_info_values` contains complete/passed/cleared/approved |

HR manual toggles always win. When HR unchecks an auto item, `manually_overridden = 1` prevents auto-sync from re-checking it.

---

## Phase 2 — Event-Driven Hooks (Future)

Connect `syncLifecycleItems(userId)` from `lifecycleSync.service.js` into these existing call sites:

| Event | Where to hook |
|-------|---------------|
| Document task completed | Task update handler in payroll/documents controller |
| Training focus step completed | `trainingFocusProgress.service.js` |
| User info value updated | `userInfoValue.controller.js` bulk/single update |
| Status transitions | `mark-complete`, `mark-terminated`, `promote-to-onboarding` in `user.controller.js` |
| Credentialing status change | `agencyCredentialing.controller.js` approval flow |

---

## Phase 3 — Offboarding Automation (Future)

- Add `package_type = 'offboarding'` to `onboarding_packages` for structured offboarding task bundles
- Tie IT deprovisioning (Google Workspace disable, TherapyNotes removal) to checklist item completion
- Use lifecycle email templates (seeded in migration 090) for automated offboarding communications
- Auto-trigger offboarding checklist creation when `users.termination_date` is first set

---

## Out of Scope

- Employee self-service lifecycle view
- Replacing pre-hire/onboarding package checklists (`custom_checklist_items` + `tasks`)
- Full IT deprovisioning automation
- Leave of absence management (uses existing modal from the profile header)
