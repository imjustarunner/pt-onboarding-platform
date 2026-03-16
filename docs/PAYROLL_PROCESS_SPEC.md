# Payroll Process Specification

**Version:** 1.1  
**Last Updated:** 2026-03-16  
**Purpose:** Single source of truth for payroll workflow, dropdown behavior, import/run visibility, and stage expectations. Update this document as requirements evolve.

---

## 1. Why Dropdown Options Differ Between Users

The **Prior period (for DB baseline)** and related payroll dropdowns can show different options for different people. This is expected and driven by:

### 1.1 Agency / Organization

- **Payroll is agency-scoped.** Each agency has its own pay periods.
- **User permissions:** `payrollAgencyOptions` controls which agencies a user can access:
  - **Super admins:** See all agencies (from `/agencies`).
  - **Others:** See only agencies they are assigned to (from `userAgencies`).
- **Child orgs excluded:** Orgs with `affiliated_agency_id` set (e.g., schools/programs) are excluded from payroll agency options.
- **Result:** User A (Agency X) and User B (Agency Y) will see different period lists.

### 1.2 Selected Period (Destination Context)

- **Prior period options are filtered by the selected destination period.**
- The filter uses `selectedPeriodForUi` / `selectedPeriod` (the period selected in **Period Details**).
- Only periods that:
  - End **before** the destination period’s start date, and
  - Are **not** draft, and
  - Are **not** the current period
- are shown in the Prior period dropdown.
- **Result:** Selecting a different period in Period Details changes which prior periods appear.

### 1.3 Show Off-Schedule Periods

- A checkbox **"Show off-schedule periods"** controls whether off-schedule periods are included.
- When unchecked (default): only periods aligned to the agency’s configured cadence are returned.
- When checked: legacy/off-schedule periods (e.g., 01/10→01/23) are included.
- **Result:** One user with this checked and another without it will see different period lists.

### 1.4 Summary

| Factor | Effect |
|--------|--------|
| Different agency | Different periods (each agency has its own) |
| Different selected period | Different prior-period options (filtered by destination) |
| Show off-schedule checked vs unchecked | Different period list (aligned vs all) |
| User role (super_admin vs other) | Different agencies available |

---

## 2. Seeing the Import and How It Was Coded at Each Time

### 2.1 Requirement

Users must be able to:

- See the import and how it was coded at each time.
- Sort through **Run 1**, **Run 2**, and **Run 3** one by one.
- See the most up-to-date state and any changes between runs.

### 2.2 Current Implementation

**Raw Import Audit (View)** provides:

- **Imported Snapshot:** Dropdown to pick which import (Run 1, Run 2, Run 3, etc.) to view.
- **Compare Against Import:** Dropdown to pick a baseline import for comparison.
- **Run Audit:** Shows the number of changes between the selected baseline and the selected import.
- **Change table:** Rows showing deltas (status, service code, units, etc.) between baseline and selected import.
- **Changes-only (default):** By default, the change table shows only relevant changes: unpaid→paid, draft needing edit, or late adds. Rows that were already paid in the baseline are hidden. Use "Show All" to include them.

**Labels:**

- Imports are labeled as `Run 1`, `Run 2`, `Run 3` via `slot_number` / `slot_label`.
- Each import shows: `Import #N • timestamp • uploader`.

**Rows filter (Draft Audit mode):**

- **Unpaid only (default):** Shows NO_NOTE and DRAFT_UNPAID rows — the unpaid items that need attention.
- **Draft only:** Shows only DRAFT rows (excludes NO_NOTE).
- **Show All:** Shows all rows (read-only for Draft Payable).

**Modes within Raw Import:**

- **Draft Audit:** Mark drafts as payable/unpayable.
- **Process H0031 / H0032 / H2014:** Enter minutes and mark Done. **All H2014 must be seen, approved, and changed before moving past raw import.** Payroll cannot run until these are processed.
- **Missed Appts (Paid in Full):** Display-only.
- **Processed:** Review rows marked Done.

### 2.3 Expected Behavior (Reference)

| Action | Expected Result |
|--------|-----------------|
| Select Run 1 | See raw rows as they were at Run 1 import time |
| Select Run 2 | See raw rows as they were at Run 2 import time |
| Select Run 3 | See raw rows as they were at Run 3 import time |
| Compare Run 1 vs Run 2 | See changes (new rows, status changes, unit changes) |
| Compare Run 2 vs Run 3 | Same for Run 2 → Run 3 |
| View latest | Default is most recent import; shows current state |

---

## 3. Payroll Stages (Lifecycle)

### 3.1 Current Stages (DB `payroll_periods.status`)

| Stage | Description |
|-------|-------------|
| `draft` | Period exists, no import yet |
| `raw_imported` | Billing report imported; raw rows in DB |
| `staged` | Staging edits applied (Payroll Stage overrides) |
| `ran` | Payroll calculation run; summaries computed |
| `posted` | Period posted; locked for normal edits |
| `finalized` | Period finalized |

### 3.2 Raw Import Changes/Edits as a Stage

**Requirement:** Treat **raw import changes/edits** as a distinct stage in the workflow.

- This stage covers edits made to raw import rows **after** import and **before** (or as part of) staging:
  - Draft audit (mark drafts payable/unpayable)
  - H0031/H0032/H2014 minutes and Done processing
  - **H2014:** Must see, approve, and change all H2014 before moving past raw import.
  - Any other raw-row edits
- Implemented as a sub-stage of `raw_imported`: Run Payroll is gated until all H0031/H0032/H2014 rows requiring processing are marked Done.

---

## 4. Process Changes / Batch Catch-Up

### 4.1 Workflow

1. **Import Run 1** for the prior period.
2. **Draft audit:** Mark drafts as unpaid (Open Draft Audit → Raw Import).
3. **Create baseline run** (after draft audit).
4. **Upload Run 2** (and optionally Run 3) for the same period.
5. **Compare:** System compares baseline vs Run 2 (and Run 3 if provided).
6. **Add late notes** to the destination (present) pay period.

### 4.2 Paths

- **Import + draft audit path:** Import Run 1 → draft audit → create baseline → upload Run 2.
- **File compare path:** Upload 2 or 3 files directly; no DB baseline required. Use "None (use file compare)" for Prior period.

### 4.3 Run 1/2/3 Progression (Prior Period Selected)

When a prior period is selected in **Prior period (for DB baseline)**:

- **Run 1 in DB:** First run file input is grayed out; "View import" link appears to open Raw Import Audit for that import.
- **Run 2 in DB:** Second run file input is grayed out; "View import" link appears.
- **Run 3 in DB:** Latest run file input is grayed out; "View import" link appears.
- **Next step:** The first run slot that does not yet exist in the DB is the active upload target.

### 4.4 Run 1/2/3 Rules (Medical/Health Payroll)

- **One Run 1, one Run 2, one Run 3:** There should never be duplicate Run 1s (or 2s or 3s) for the same period. If duplicates exist, it is by error.
- **Comparison order:** Run 2 compares to Run 1; Run 3 compares to Run 2. Changes/differences are applicable to the current pay period.
- **Labels:** Imports are labeled by sequence (Run 1, Run 2, Run 3) in order of creation, not by import date.
- **Changes-only view (default):** When viewing Run 2 vs Run 1 (or Run 3 vs Run 2), the change table shows only: unpaid→paid, draft needing edit, or late adds. Rows already paid in the baseline are hidden. Use "Show All" to see everything.

### 4.5 View & Manage Imports

- **Button:** "View & Manage Imports" in Process Changes (or "Manage Imports" in Current Payroll Run).
- **Explicit Run tags:** Each import is tagged as Run 1, Run 2, or Run 3 of the pay period (stored in DB). Order is stable.
- **Actions per import:** **View** (opens Raw Import Audit), **Replace** (upload a new file to replace this run’s data; keeps the same Run 1/2/3 slot), **Delete** (removes the import; cannot be undone).
- **Replace:** Upload a new CSV/XLSX to replace the data for that run. The Run 1/2/3 slot stays the same. No re-upload of other runs needed.

### 4.6 Process Changes Aggregate

- **Collapsible:** Click the header to collapse/expand for viewing pleasure.
- **Clear:** Clears the aggregate history for this agency.

### 4.7 Runs Side-by-Side (Audit)

- **Button:** "Runs Side-by-Side (Audit)" in Current Payroll Run.
- **Purpose:** Auditing — view all runs (1, 2, 3) for a pay period in one table.
- **Columns:** Clinician, Service, Date, Client (initials or first name), Run 1 Units, Run 1 Status, Run 2 Units, Run 2 Status, Run 3 Units, Run 3 Status.
- **Behavior:** Rows that did not exist in Run 1 appear in Run 2 (or Run 3) as late adds. Aligned by provider + service + date + client.

---

## 5. Document Maintenance

- Update this spec when:
  - Dropdown logic or filters change.
  - New stages or statuses are added.
  - Import/run visibility behavior changes.
  - New workflow steps are introduced.
- Keep version and last-updated date current at the top.
