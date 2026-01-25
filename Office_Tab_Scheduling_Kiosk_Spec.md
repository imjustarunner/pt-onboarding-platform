# Office Tab: Office Creation, In‑Office Scheduling, Kiosk Check‑In, Assessments, Mapping, SVG Map
Draft v1 (from narrative transcript)

## Purpose
Add a top-level **Office** tab that is the source of truth for **office rooms**, **in‑office scheduling**, **kiosk check‑in**, and **event‑linked questionnaires/assessments**. This is separate from **school scheduling**.

This feature intentionally does **not** track real people/clients for office visits. It stores **metadata only**, tied to **provider + office + room + date/time event**.

---

# 1) Top Navigation: Office Tab (Global)
Create a new top navigation item: **Office**.

Suggested sub-navigation (can be tabs or left nav):
1. **Office Schedule** (room schedules; booking requests; approvals)
2. **Provider Availability** (provider-managed in‑office availability grid)
3. **Kiosk** (check-in + launch questionnaires)
4. **Offices (Settings)** (office entity settings; rooms; agencies; svg link)
5. **Map** (SVG viewer; optional room click-to-schedule)
6. **Reports** (pseudo-client history exports)

Everyone can access the Office tab UI surface (visibility of actions depends on role).

---

# 2) Office Entity (Created Like Agency / Program / Organization)

## 2.1 Creation rules
- **Office** is a first-class entity created the same way as Agency/Program/Organization.
- **Only Super Administrator** can create an Office.
- **Agencies cannot create Offices.**
- Offices are sometimes shared by multiple agencies, so Office must support multi-agency assignment.

## 2.2 Office Settings (source of truth)
Office settings contain configuration only. Required settings:
- Office name
- Optional address (informational; NOT used as scheduling source of truth)
- **SVG map link** (URL or stored asset reference)
- **Assigned Agencies (multi-select)**
  - Assign multiple agencies to an office so those agencies can access scheduling and questionnaires for that office.
- **Room Types available at this office** (multi-select master list)
  - Example room types: Play Therapy, Individual Office, Tutoring Room, Play Room, etc.
- **Rooms list** (created one-by-one)
  - Each room has:
    - Room number (index/identifier)
    - Label (typed) e.g., “Office 2”, “Play Therapy”, “Play Room 1”, “Tutoring Room”
    - Room types (multi-select from office’s available room types)

## 2.3 Editing permissions
- Super Admin: full edit, including agency assignment.
- Once an agency is assigned to an office, that agency’s Admin/CPA/Staff can edit Office settings and rooms (same “settings” pattern as agency/program/org).

---

# 3) Provider In‑Office Availability (Improve Provider Scheduling)

This is **in-office only** and is distinct from school scheduling and distinct from EHR virtual availability.

## 3.1 Availability model
- `in_office_available` (global boolean) — default OFF.
- Weekly availability grid:
  - Monday–Sunday
  - Hour-by-hour
  - 7:00 AM to 9:00 PM
  - Default: all hours unavailable
- Providers select which hours are open for **IN OFFICE** sessions only.
- If a provider has **zero** open hours, automatically set `in_office_available = OFF`.

## 3.2 Payroll-triggered confirmation
When payroll is posted, prompt on provider login:
> “Payroll has been posted! Log in now to see your pay stub and confirm your current availability.”

Provider must confirm or adjust their in-office availability schedule.

## 3.3 Virtual availability policy note
Show this text in Provider Availability:
> “Virtual availability should be listed on the EHR only. Virtual sessions are expected to be conducted outside of the office unless approved as office space is reserved for in-office care.”

## 3.4 Two-week confirmation window
Every two weeks, providers must review the next two weeks and:
- Confirm in-office hours
- Confirm office reservations
- Add temporary openings or forfeit time (see section 6)

---

# 4) Office Scheduling (Room-by-Room Hourly Schedules)

## 4.1 Two scheduling layers must exist (do not merge them)
1) **Assigned Office Schedule** (HR expectation / “how they are hired”)
2) **Office Booking Schedule** (actual room reservations + kiosk events)

Both are associated to the Office entity (not provider address).

## 4.2 Office Booking Schedule UI
Each **room** has its own schedule:
- Monday–Sunday, 7am–9pm, hourly increments
- Each slot shows a state + optional initials

Slot states (color-coded):
- **Open/Unassigned**: available
- **Assigned**: provider has standing reservation/assignment (shows provider initials and provider color)
- **Released / Temporarily Available**: **Yellow** (requestable by others)
- **Booked**: **Red** (confirmed event)

Each provider assigned to an office gets:
- Unique color
- Initials displayed on the schedule

## 4.3 Assign Office action
Admin/CPA/Staff can assign a provider to a room:
- “Assign Office” button
- Room selector shows rooms with number + label (from Office settings)
- Once assigned, provider appears on the room schedule in assigned hours (per assigned schedule rules)

---

# 5) Booking & Reservation Workflows (Three Options)

## Option 1 — Support-assisted booking (provider needs help finding space)
Performed by CPA/Staff/Admin.
Steps:
1. Choose office + room type needs (multi-select)
2. Choose day/time slot(s)
3. Choose recurrence: **weekly / biweekly / monthly** (select all applicable)
4. Approve booking → writes reservation into Office Booking Schedule and creates event(s).

## Option 2 — Provider request by searching availability
Steps:
1. Provider searches by:
   - available times/days, or
   - office, or
   - office + room type
2. Provider selects an open slot
3. Provider sets:
   - recurrence: weekly/biweekly/monthly (select all applicable)
   - “Open to alternative room?” (Yes/No)
4. Request is submitted to CPA/Staff/Admin queue
5. CPA/Staff/Admin approve or deny with comment
6. On approval, request is “submitted into the schedule” similar to payroll submit/approve flow.

## Option 3 — Yellow-slot booking (provider released time)
Steps:
1. Assigned provider marks “I don’t need the office this week” (or similar) during two-week review → slot becomes **Yellow**
2. Another provider requests that slot (single occasion)
3. Approval can be done by:
   - Assigned provider (preferred), or
   - CPA/Staff/Admin
4. Assigned provider can approve the request and optionally forfeit more time/day/office in the same interaction.

---

# 6) Temporary Release / Forfeit Controls (Two-week process + Admin override)

## Provider actions (every two weeks)
Providers review their next two weeks and can choose:
- **Unbook but keep reservation/assignment**  
  Meaning: keep their standing assignment, but release specific times so others can use (Yellow).
- **Forfeit entirely**  
  Meaning: give up those days/hours/time slots (returns to open/unassigned or admin-managed).

## Admin/CPA/Staff overrides (always available)
Admins/CPA/Staff can click any reservation to:
- Unbook someone temporarily
- Forfeit their time/day/room
This is explicitly needed because staff do not update reliably and admin will cross-reference HR scheduling.

---

# 7) Events, Kiosk Check‑In, and Assessments (Metadata-Only)

## 7.1 Event definition
A booked room-hour for a provider creates an **Event**:
- office_id, room_id
- provider_id
- date + start hour (hour increment)
- recurrence metadata (weekly/biweekly/monthly)
- state: booked / released / canceled, etc.

**Visibility:** event details are available to the booked provider and admin/CPA/staff; other providers do not see it unless it is Yellow and they are requesting it.

## 7.2 Treat events as “pseudo-client” continuity
Because no real person is tracked, the system treats a recurring slot as a “pseudo-client” until reassigned:
- Example pseudo-client key: provider + office/room + weekday + time
- History accumulates over time **until a different provider gets that slot**.
- A history report can be downloaded for that pseudo-client key.

This is not guaranteed to be the same real person over time.

## 7.3 Gating question to reduce false continuity
Add question to questionnaire:
- “Is this your typical day and time that you see this provider?” (Yes/No)
Rules:
- Yes → store into pseudo-client history for that slot
- No → store as one-off event response (not appended to pseudo-client history)

## 7.4 Kiosk behavior
Kiosk shows events for the office/room and allows “Check in”:
- Check-in sends a message to the booked provider
- Check-in launches questionnaire(s) available for that office based on agency assignments

## 7.5 Questionnaires / assessments availability by agency assignment
- Offices can have multiple agencies assigned.
- Questionnaires available at kiosk depend on:
  - Office’s assigned agencies, and
  - Provider’s agency (as needed by your rules)
- Responses are stored tagged to provider + office + room + event time (no identity info stored).

## 7.6 Results visibility & removal rules
- Results appear in the booked provider’s account.
- Provider may **hide** results and request removal from their profile view.
- Results must **always remain accessible to admin staff** in the **Clients navigation**.
- System stores only metadata, not real identities.

---

# 8) Mapping / Search / “How the system checks availability”

## 8.1 Availability query order
When searching for provider in-office availability:
1. Check provider `in_office_available` (boolean)
2. If true, check selected hours for requested day/time
3. Only then proceed to room booking logic

## 8.2 Room booking constraints
- Hour-by-hour booking only (hour increments)
- Provider must have matching in-office availability for that time
- Room type constraints must match requested room types (unless “open to alternative room” is Yes)

---

# 9) SVG Office Map

## 9.1 Requirements
- Each Office stores a link/reference to its SVG map.
- Office tab includes **Map** view that renders the SVG.
- SVG link should also be visible in agency settings for agencies assigned to that office.

## 9.2 Optional enhancement (later)
Clickable rooms in SVG that deep-link to that room’s schedule.

---

# 10) Reporting
- Download report for pseudo-client history (slot history) until reassignment.
- Admin reports should be accessible in Office tab and/or Clients navigation.
- Provider reports limited to their own events.

---

# 11) Acceptance Criteria (MVP)
1. Super Admin can create an Office (like Agency/Program/Organization).
2. Office settings include rooms (number+label), room types, assigned agencies (multi), SVG map link.
3. Assigned agencies can edit Office settings (as configured).
4. Provider in-office availability grid exists (Mon–Sun, 7am–9pm hour increments), default off/unavailable.
5. If provider selects no hours, global in-office availability auto-switches to off.
6. Payroll prompt forces provider to confirm/update in-office availability.
7. Office Booking Schedule exists per room with states: open, assigned, yellow released, red booked; initials + provider color shown.
8. Three booking options exist with approval workflow and comments.
9. Two-week provider review allows release (yellow) or forfeit.
10. Admin/CPA/Staff can override by clicking reservations.
11. Booked slots create Events; kiosk check-in triggers provider notification and launches questionnaire.
12. Questionnaire responses are metadata-only and stored per provider+office+room+event.
13. “Typical day/time” question controls whether responses are appended to pseudo-client slot history.
14. Provider can hide results; admin always retains access via Clients navigation.
15. Pseudo-client history report export works per slot and stops when slot reassigned.

---

# Cursor Kickoff (Brief Paragraph to Start Implementation)
Build a new **Office** top-level navigation area and introduce **Office** as a first-class settings entity (created only by Super Admin) with rooms (number+label), room types, SVG map link, and **multi-agency assignment**. Implement two distinct scheduling layers: provider-managed **In‑Office Availability** (Mon–Sun hourly grid 7am–9pm, default unavailable, global boolean that auto-turns off if empty, payroll + two-week confirmation prompts) and an **Office Booking Schedule** per room (hourly grid with open/assigned/yellow released/red booked states, provider initials + unique color). Add the 3 booking workflows (support-assisted, provider request with approve/deny + comment, and yellow-slot single-occasion approval by assigned provider or admin). Create event records from bookings; build kiosk check-in for events that notifies the booked provider and launches questionnaires based on office/agency assignment. Store **metadata only** (no client identity) and implement pseudo-client slot history with the “typical day/time” gating question plus exportable history reports; allow providers to hide results while keeping admin access in Clients navigation.
