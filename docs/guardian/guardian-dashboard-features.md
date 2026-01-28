# Guardian Dashboard — Feature Availability Spec (Post-Foundation)

## Context
Foundation is implemented:
- Program selector + program context routing
- `GET /api/guardian-portal/overview` returns `children[]` + unioned `programs[]` + child initials per program
- `GuardianPortalView.vue` uses a dashboard layout (left rail + right detail panel)
- Modules uses `TrainingFocusTab`
- Documents uses `DocumentsTab`
- Placeholders exist for Billing/Messages/Notifications/Policy
- Admin overview actions vary by `orgType` (school vs program) and hide when counts are zero

This document defines what a guardian should see and do **now**, and what becomes enabled in upcoming steps **without changing the dashboard layout**.

## Goal
- Define the **guardian-visible features** by panel and selection context
- Define **selection rules** for program + child context
- Define the **minimum API shape** required to power the UI consistently

---

## Dashboard Context Model

### Required state
- **`activeProgramSlug`** (required)
- **`activeOrgType`** (derived from selected program: `school|program|learning`)
- **`linkedChildrenInProgram[]`** (derived from overview response + `activeProgramSlug`)
- **`activeChildId`** (optional globally, but required for child-scoped panels)

### Context rules
- **Program selection is required**.
  - If only one program exists, auto-select it.
  - If multiple programs exist, guardian must select a program (default to first if none selected).
- **Child selection rules**:
  - If `linkedChildrenInProgram.length === 1`, **auto-select** that child (`activeChildId`).
  - If `linkedChildrenInProgram.length > 1`, require explicit child selection for child-scoped panels.
  - If `linkedChildrenInProgram.length === 0`, show a program-level empty state (guardian has program membership but no linked child in that program).

### Child-scoped panels (must require `activeChildId` when multiple children)
- Documents
- Modules/Progress (if training/progress is child-scoped)
- Scheduling/Appointments (future)

---

## Top Bar

### 1) Program selector (existing)
- Shows programs available to the guardian (union of explicit assignments + derived from children).
- Selecting a program updates the active org context (slug route + store context).

### 2) Child selector (add)
- **Filtered to active program**.
- Behavior:
  - Auto-select the only child when applicable.
  - When multiple children exist, child selector becomes required for child-scoped panels.
  - On program change, if the selected child is not in the program, clear child selection and re-apply the auto-select rule.

### 3) Optional: help/support icon + profile menu
- Can remain hidden until support/contact model is implemented.

---

## Left Rail

### Programs list
- Show program name
- Show `orgType` pill (school/program/learning)
- Show child initials enrolled in that program (from overview response)
- Clicking a program sets `activeProgramSlug` (same effect as dropdown)

### Children list
- Must be **filtered to active program**
- Clicking a child sets `activeChildId` and opens Child Details panel

### “My Dashboard” navigation
- Returns right panel to Overview state
- Overview state is program-contextual and child-contextual when applicable

### Coming Soon cards
- Visible but disabled
- Must preserve selected program/child context so users understand what will be scoped later

---

## Right Panel Panels

### Panel: My Dashboard (Overview)
Must include:

#### At-a-glance summary card
- **Action required docs count**
  - Default to `0` until docs are properly child/program scoped
- **Upcoming appointment** (future)
  - Show “No upcoming appointments” empty state
- **Module/progress indicator**
  - Show module completion progress if guardian training applies (future if not yet scoped)
- **Unread messages count**
  - Default to `0` until messaging is enabled

#### Action Queue card
- Purpose: prompt the guardian’s next best action based on current state.
- Example logic (non-exhaustive):
  - If multiple children in program and none selected → “Select a child to continue”
  - If required docs > 0 → “Complete required documents”
  - If upcoming appointment exists → “View appointment details”
  - Otherwise → “Explore modules” / “Review documents”

#### Recent Activity card (optional but recommended)
- Can be “coming soon” until backend events are available.

Empty state rules:
- If guardian has no programs and no children: explain that an organization must link them to a child record.
- If guardian has programs but no children in selected program: explain that they are enrolled but no child link exists for that program.

---

### Panel: Modules
- Render `TrainingFocusTab` in guardian mode.
- **Step 1 (now)**: program-scoped filtering (minimum).
- **Step 2 (later)**: if applicable, child-scoped filtering when multiple children exist.

Expected behavior:
- If multiple children and none selected: show a “Select a child to view modules” empty state.
- If child selected: show modules/progress relevant to the active child + active program.

---

### Panel: Documents
- Render `DocumentsTab` in guardian mode.
- **Step 1 (now)**: program-scoped filtering (minimum).
- **Step 2 (later)**: child-scoped filtering when multiple children exist.
- **Step 3 (later)**: signing + required/completed grouping and more explicit workflow steps.

Expected behavior:
- If multiple children and none selected: show a “Select a child to view documents” empty state.
- If child selected: show required and completed docs for that child in the active program.

---

### Panel: Child Details
- Show selected child overview:
  - Display name
  - initials
  - program(s) enrolled with the guardian
  - restriction indicators (if applicable)
- Must not expose any clinical/PHI beyond what the guardian role is intended to see.

---

### Panel: Account Details
- Guardian profile basics (name/email)
- Linked children list (all children across programs)
- Optional: show which programs each child is linked to

---

## Placeholders (Coming Soon)
Keep visible (disabled) but context-aware:
- Appointments / Scheduling
- Messages
- Notifications
- Billing
- Policy & Procedures

Placeholders should:
- Reflect selected program/child
- Show empty state and “Coming soon” messaging consistently

---

## Data Needed (Minimum)

### Enhance `GET /api/guardian-portal/overview`
Return shape (minimum):

- `programs[]`:
  - `id`
  - `slug`
  - `name`
  - `orgType` (server-normalized string: `school|program|learning`)
  - `children[]` (optional helper; initials per program)

- `children[]`:
  - `id`
  - `displayName` (or enough to build display name client-side)
  - `initials`
  - `dob` (optional)
  - `restrictedFlag` (optional)
  - `programSlugs[]` (or program ids) indicating where the child is enrolled for this guardian

### Optional counts (can be 0 until powered)
- `requiredDocsCountByProgram` (map)
- `unreadMessagesCountByProgram` (map)
- `upcomingAppointmentsCountByProgram` (map)

---

## Acceptance Criteria
- Guardian can select a program and see children filtered to that program.
- Guardian can select a child and the Documents/Modules panels reflect child context.
- My Dashboard shows at-a-glance + action queue + correct empty states.
- Placeholders remain visible but consistent with selected program/child context.

