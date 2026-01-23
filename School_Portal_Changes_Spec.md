# School Portal Changes — Spec (Draft v1)

**Goal:** Improve the School Portal so school staff can quickly view/edit a provider’s **day-by-day “soft schedule”**, see the provider’s **school caseload slots**, open clients in a **modal**, and collaborate via **comments/status** — without allowing school staff or providers to create brand‑new clients directly.

---

## 1) Users, Permissions, and Responsibilities

### Roles
- **School Staff**
  - View school roster (assigned + unassigned)
  - Assign *already-school-attached* clients into a provider’s available **slots**
  - Edit **soft schedule** times/notes (optional shared edit with providers)
  - Comment on clients / assignment status
- **Provider**
  - View their school profile page (photo, credentials, contact with link)
  - View their **slot-based caseload** and day schedules
  - Edit **soft schedule** times/notes (if permitted)
  - View/respond to comments (if permitted)
- **Support Team (Admin/Operations)**
  - **Creates/approves brand-new clients**
  - Assigns clients to schools/agencies
  - Monitors onboarding packets + document status
  - Controls global provider capacity rules, defaults, and access

### Hard permission constraints (per your direction)
- **School staff and providers must NOT be able to create new clients** in the portal UI.
- A **client “upload packet”** workflow may create a *blank* client record attached to the school and notify the support team (see section 6).

---

## 2) Information Architecture (Top-Level Navigation)

### Primary layout change (School Staff view)
- Replace “two weird buttons” with a clear **split-pane** layout:
  - **Left pane:** Providers (school-linked)  
  - **Right pane:** Clients / schedule interactions  
- Both panes visible at the same time (no toggle required).

### Day navigation
- Across the top: **Mon–Fri** as a full-width horizontal bar (long rectangle).
- Behavior:
  - Clicking a day expands that day’s panel (“accordion” feel).
  - Days that have at least one assigned provider should visually “light up.”
  - If a day has no provider assigned, show **Add Day** button.

---

## 3) School Day View (Core Screen)

### Day panel contents (when a day is selected/expanded)
For the selected day (e.g., Monday), display:

1) **Assigned Providers for that day**
   - Show provider cards (name + optional avatar)
   - Button: **Add Provider**
   - If more than one provider on that day, allow **multiple provider panels visible** simultaneously (ideal), or allow selecting one provider at a time (acceptable v1).

2) **Provider panel (per provider assigned to that day)**
   - **Caseload** displayed as client initials (chips/circles)
   - **Soft schedule** editor to the right:
     - Default hours: **8:00–3:00**
     - Pre-populate **7 slots** (editable)
     - Each slot supports:
       - Start time, end time (e.g., 7:50–8:20)
       - Optional note field
   - **Dropdown / section selector** (your “drop downs for sections”):
     - Intended use: choose sections like “Morning”, “Lunch”, “Afternoon” OR “Period/Block” (labels configurable)
     - The chosen section filters which assigned clients appear for quick scheduling

3) **Client interaction**
   - Clicking a client’s initials opens a **client modal**
   - Modal shows:
     - Client status (assigned/unassigned, document status, etc.)
     - Scrollable comment thread
     - Add comment box
   - Close modal with X, click next client → open new modal

---

## 4) Provider Page Within a School (School Staff + Provider)

When school staff clicks a provider name (link), open a provider “within-school” profile page.

### Provider page contents
- Profile picture
- Short blurb / credentials
- Contact info
- Optional action: “Message provider” (internal messaging / email trigger)

### Provider caseload slots view (separate from soft schedule)
- Show provider **slot capacity** and which clients occupy which slots.
- Slots are not tied to soft schedule ordering.
- Action: **Assign Client to Slot**
  - Only clients already attached to the school appear in the dropdown.
  - Assigning a client to a slot makes them eligible to be placed into the day’s soft schedule.

### Capacity rule
- Assigning a client to a provider consumes a slot (like your existing form logic).
- If no slots remain, assignment is blocked or requires admin override.

---

## 5) Unassigned Client Visibility + Collaboration

### School roster includes “Unassigned” list
- Clearly show clients not assigned to any provider.
- School staff can:
  - Add a comment like: “Where are we on this kid?”
  - Suggest provider/day capacity: “Destiny has 2 slots Wed; can she take this?”

### Status indicators
Each client row should show:
- Assignment status: **Assigned / Unassigned**
- Document packet status (see section 6)
- Readiness status: e.g., “Ready to schedule” / “Missing docs” / “Pending support review”

---

## 6) Client Packet Upload Workflow (No direct client creation)

### Desired behavior
- School staff can upload a **new client packet** (intake docs).
- System creates a **blank client placeholder record** attached to:
  - The school
  - The agency (ITSCO)
- System notifies the **support team** to finalize the client record and assignment.
- The new placeholder appears in the school roster with a status like:
  - “Pending Support Review” / “Docs received”

### Guardrails
- School staff cannot enter clinical details to create the client record fully.
- Providers cannot create new clients either.

---

## 7) Defaults & Edge Cases

### Defaults
- Default day schedule: **8:00–3:00**
- Default prefilled soft schedule: **7 editable slots**
- Default provider-day state: no provider assigned until added

### Edge cases
- Multiple providers on same day:
  - Preferred: show both panels simultaneously
  - Acceptable: tabs within the day panel to switch providers
- Client assigned to provider but not placed into a soft schedule:
  - Client still appears in provider caseload initials
  - Soft schedule remains independent
- Client removed/unassigned:
  - Remove from provider slots
  - Remove from any day schedules (or mark “unassigned” in schedule slot)

---

## 8) Suggested Data Model (Implementation Guidance)

> Names are examples; map to your existing schema as needed.

### Core entities
- **School**
- **Provider**
- **Client**
- **SchoolClient** (join: client attached to school)
- **ProviderSchool** (join: provider attached to school)
- **ProviderCapacity** (slots available at school)
- **ProviderClientAssignment** (slot occupancy)
- **SchoolDaySchedule**
  - school_id, weekday
- **DayProviderAssignment**
  - schedule_id, provider_id
- **SoftScheduleSlot**
  - day_provider_assignment_id
  - slot_index (1..7 default)
  - start_time, end_time, note
  - optional client_id (if scheduled)
- **Comments**
  - scope_type: client / assignment / day_schedule
  - scope_id
  - author_role, author_id, body, created_at

### Status fields
- `client_assignment_status` (assigned/unassigned)
- `client_packet_status` (none/uploaded/pending_review/approved)
- `client_readiness_status` (ready/missing_docs/pending)

---

## 9) Acceptance Criteria (Definition of Done)

1) **Day bar Mon–Fri** exists and expands day panels.
2) Days with assigned providers are visually indicated.
3) School staff can **Add Day** and **Add Provider** to a day.
4) Provider panels show:
   - client initials (caseload)
   - editable soft schedule with **7 default slots** and default **8–3**
5) Clicking client initials opens a **modal** with:
   - status fields
   - comment thread + add comment
6) Provider page within school shows:
   - profile info + contact
   - slot capacity + assigned clients + assign from school roster only
7) Uploading a new client packet creates a placeholder client linked to the school and notifies support team.
8) School staff/providers **cannot create brand-new clients** via manual entry.
9) Audit trail exists for:
   - assignment changes
   - schedule edits
   - comments

---

## 10) Out of Scope (for v1 unless you decide otherwise)
- Full messaging system (can be a stub link/action)
- Automated matching/recommendations for assignments
- Advanced permissions beyond role-based sections
- Billing/EHR integration

---

# Cursor Chat Prompt (Copy/Paste)

Use this message in Cursor Chat. Replace the bracketed path if needed.

> **Task:** Implement the School Portal redesign described in `School_Portal_Changes_Spec.md`.  
> **Source of truth:** Use the spec verbatim; do not invent new flows.  
> **Key requirements:** Mon–Fri day bar; providers left/clients right split pane; day expansion; Add Day/Add Provider; provider panels show caseload initials + editable soft schedule (7 default slots, default 8–3); client modal with status + comment thread; provider page within school with profile + slot-based caseload and “assign client” limited to school-attached clients; packet upload creates placeholder client and notifies support; school staff/providers cannot create brand-new clients.  
> **Deliverables:**  
> 1) UI components for SchoolDayBar, DayPanel, ProviderPanel, SoftScheduleEditor, ClientInitialsList, ClientModal, ProviderSchoolProfile.  
> 2) Data layer/API wiring (or mocked endpoints if backend not ready) matching the spec entities and actions.  
> 3) Role-based guards (school staff vs provider vs support).  
> 4) Basic tests (render + key interactions) and a short implementation note describing where state lives and how schedule edits are persisted.
