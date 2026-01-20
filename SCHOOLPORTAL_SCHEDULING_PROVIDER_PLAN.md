# Implementation Plan: School Portal, Scheduling & Provider Management

**Context:** This plan bridges the gap between the recently implemented features (Provider Open/Closed status, Basic Roster, User Sorting) and the remaining requirements for Slot Management, Soft Scheduling, and School Staff Communication.

## Phase 1: User Management & Provider Configuration
*Focus: Refining the "Already Done" features and adding the School Affiliation configuration tab.*

### 1.1 User List Refinements (✅ Verification)
- [ ] **Verify Sorting:** Ensure the dropdown functions for `A-Z`, `Z-A`, `First/Last`, `Last/First`, and `Credential` (using best-effort credential parsing).
- [ ] **Visual Indicator:** Verify that Providers listed in the User Manager show a visual tag for "Open" or "Closed" (Accepting New Clients) status.

### 1.2 School Affiliation Tab (Provider Profile)
- [ ] **UI Implementation:** Create a "School Affiliation" tab within the Provider’s profile modal/page.
- [ ] **Navigation:** If a provider is at multiple schools, provide a sub-nav or dropdown to switch between school settings within this tab.
- [ ] **Global vs. School Override:**
    - Display the Global `provider_accepting_new_clients` toggle.
    - Create a specific toggle: `Open for additional school` (School-Specific Override).
    - *Logic:* If Global is Closed, but School Override is Open, allow assignments for that school only.

### 1.3 Availability & Slot Definition
- [ ] **Day/Time Selection:** Allow Provider to select days of the week and specific hours for that school (e.g., Mondays 8:00 AM - 12:00 PM).
- [ ] **Auto-Slot Calculation:**
    - Implement logic: Default `1 client per hour`.
    - *Example:* 4 hours selected = 4 Slots auto-populated.
- [ ] **Slot Override:** Allow Provider, Admin, or Internal Staff to manually adjust the `Total Slots` number for that day.
    - *Constraint:* School Staff (external) cannot change total slots.

---

## Phase 2: Client Assignment & Capacity Logic
*Focus: Connecting clients to providers based on the slots defined in Phase 1.*

### 2.1 Assignment Interface
- [ ] **School View Assignment:** In the School/Admin interface, allow dragging/assigning a client to a Provider's specific Day.
- [ ] **Capacity Check (Gating):**
    - [ ] Check `Open/Closed` status (Global vs. Override).
    - [ ] Check `Available Slots` (Total Slots - Assigned Clients).
    - [ ] **Blocker:** If Status is Closed OR Slots are Full, hide provider from assignment dropdown or disable selection.
    - [ ] **Override:** Allow Admin (only) to force-assign past capacity with a warning.
- [ ] **Client Profile Link:** Ensure the Client’s profile shows their assigned School, Provider, and Day.

---

## Phase 3: The "Soft Schedule" (Logistics Layer)
*Focus: The operational view where assigned clients are given specific times and locations.*

### 3.1 Separation of Concerns
- [ ] **Structure:** Ensure "Assignments" (Who is seeing Whom) is distinct from "Schedule" (When and Where).
- [ ] **Data Flow:** The Schedule view only populates with clients who have already been *Assigned* to that provider/day.

### 3.2 Schedule Interface
- [ ] **Card/List View:** Display the Provider, the Date, and the list of assigned clients.
- [ ] **Editable Fields (Text Based):**
    - Start Time / End Time.
    - Location (e.g., "Mrs. Brown's Room", "Library").
    - Notes (Operational notes for the school).
- [ ] **Reordering:** Allow drag-and-drop or "Move Up/Down" to reorder clients within the list.
- [ ] **Permissions:**
    - **School Staff:** Can Edit Time, Location, and Notes. Cannot add/remove clients (must go to Assignment flow).
    - **Provider/Admin:** Full Access.

---

## Phase 4: Communication Ecosystem
*Focus: Expanding the "Already Done" read-receipts into a full contextual comment system.*

### 4.1 Contextual Comment Bubbles
- [ ] **UI Integration:** Ensure the "Bubble" icon appears on Roster rows, Schedule cards, and Client Profiles.
- [ ] **Unread Logic (✅ Verification):** Verify the bubble is solid/colored when there are unread comments for the *current logged-in user* and clears upon opening.

### 4.2 Comment Modal Details
- [ ] **Fields:**
    - `Author` (Auto-populated).
    - `Timestamp` (Auto-populated).
    - `Category` (Dropdown: e.g., Behavior, Logistics, Medical. Managed in School Settings).
    - `Urgency` (Low, Medium, High).
    - `Comment Body`.
- [ ] **Access Control:** Visible to Admin, Agency Support, Assigned Provider, and School Staff associated with that organization.

### 4.3 School Staff Q&A (Help Desk)
- [ ] **Separate Channel:** Distinct from Client Comments.
- [ ] **Interface:** A "Contact Admin" or "Help" button on the School Staff Dashboard.
- [ ] **Visibility:**
    - School Staff sees *only* their own questions and answers.
    - Admin sees a queue of all School Staff questions.

---

## Phase 5: School Staff Dashboard
*Focus: What the external school user sees.*

### 5.1 Roster View (✅ Verification + Additions)
- [ ] **Columns:** Client Name, Status, Doc Status, Assigned Provider, Assigned Day.
- [ ] **Actions:** "View & Comment" button (triggers the modal from 4.2).

### 5.2 Schedule Cards
- [ ] **Dashboard Layout:** Show cards for the upcoming week (up to 5 days).
- [ ] **Content:** Group by Day -> Then by Provider.
- [ ] **Interaction:** Allow School Staff to click a Provider card to input the "Soft Schedule" details (Time/Location) defined in 3.2.

### 5.3 Notifications
- [ ] **"Current" Alert:** In-app notification highlighting when a client status changes to "Current" (Ready to be seen).

---

## Phase 6: Client Compliance Checklist
*Focus: Tracking the onboarding history.*

### 6.1 Checklist UI
- [ ] **Location:** Added to Client Profile (and visible in Provider/School views).
- [ ] **Fields:**
    - [ ] `Parents Contacted`: (Date Picker) + (Boolean: Successful/Unsuccessful).
    - [ ] `Intake Date`: (Date Picker - Scheduled or Accomplished).
    - [ ] `First Date of Service`: (Date Picker).
- [ ] **Audit Trail:**
    - Display "Last updated by [User] on [Date]" below this section.
- [ ] **Permissions:** Editable by Provider, Admin, and Staff. Read-only for School Staff (unless specified otherwise).

---

## Technical Tasks Summary (Backend & Database)
1.  **DB Updates:**
    - Add `slots_total` and `slots_override` to `provider_school_assignments`.
    - Create `school_schedule_details` table (linked to assignment) for Time, Location, Soft Notes.
    - Create `support_tickets` table for the School Staff Q&A feature.
    - Add `checklist_data` columns to `clients` table (parent_contact_date, intake_date, first_service_date, last_updated_by).
2.  **API Endpoints:**
    - `PUT /api/provider/availability`: Handle slot calculations and overrides.
    - `GET /api/school/schedule`: Fetch assigned clients with soft schedule details.
    - `PUT /api/school/schedule`: Update time/location/notes.
    - `POST /api/support/ticket`: Handle School Staff Q&A.