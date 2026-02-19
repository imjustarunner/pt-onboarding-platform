# ADHD-Friendly To-Do Organizer & Project Check-In Assistant (Web App Spec)

I want the to-do list called **Momentum List** with the post-it notes being called **Momentum Stickies**.

---

## Naming & Hierarchy

| Term | Definition |
|------|------------|
| **Momentum Stickies** | Post-it notes that live **on top of everything** — floating, collapsible, database-persisted, draggable. Always visible. |
| **Momentum List** | The main action system (to-do list). Replaces the current "Checklist" rail card. Contains digest + checklist + tickets + notifications. |
| **Checklist** | Onboarding items (training, documents, custom). Lives **inside** the Momentum List as a section. |

### Visual Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│  App Shell (header, nav)                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MOMENTUM STICKIES (floating layer, always on top)               │   │
│  │  [Sticky 1] [Sticky 2] [Sticky 3] ...  [Collapse ▲]              │   │
│  │  - Collapsible (minimize to a bar or icon)                        │   │
│  │  - Persist position (x, y) in DB                                   │   │
│  │  - Drag & drop to reposition                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  Main Content (Dashboard, etc.)                                         │
│  ┌──────────┬──────────────────────────────────────────────────────┐  │
│  │ Rail     │  MOMENTUM LIST (when that tab is active)               │  │
│  │ - My Acct│  ┌─────────────────────────────────────────────────┐ │  │
│  │ - Momentum│  │ Digest (Today/Tomorrow Focus)                     │ │  │
│  │   List   │  │ Top 3 + Also on your radar + counts               │ │  │
│  │ - Docs   │  ├─────────────────────────────────────────────────┤ │  │
│  │ - Train  │  │ CHECKLIST (section inside Momentum List)          │ │  │
│  │ - Sched  │  │ - Training modules, Documents, Custom items       │ │  │
│  │ - Submit │  ├─────────────────────────────────────────────────┤ │  │
│  │          │  │ Assigned tickets, Notifications, User tasks       │ │  │
│  │          │  └─────────────────────────────────────────────────┘ │  │
│  └──────────┴──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Role & Objective

You are an ADHD-friendly To-Do Organizer and Project Check-In Assistant embedded inside a web application.

Your goal is to turn messy inputs (tickets, notifications, user notes, and ad-hoc requests) into a structured, prioritized action plan and a clean task list, with a daily login digest that tells the user what to focus on.

Tone: practical, supportive, direct (Executive Assistant vibes). No therapy-speak.

---

## Core Modules

### 1) Momentum Stickies (Post-it Notes / Scratchpads)

**Purpose:** quick capture + lightweight organization that is separate from the action-oriented Momentum List. Not tasks unless explicitly promoted.

**Data Model:**

```sql
-- momentum_stickies
CREATE TABLE momentum_stickies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  position_x INT DEFAULT 0,      -- for drag-drop
  position_y INT DEFAULT 0,
  is_collapsed BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- momentum_sticky_entries
CREATE TABLE momentum_sticky_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  momentum_sticky_id INT NOT NULL,
  text TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT FALSE,
  is_expanded BOOLEAN DEFAULT TRUE,  -- for long content
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (momentum_sticky_id) REFERENCES momentum_stickies(id) ON DELETE CASCADE
);
```

**Rules:**
- Users can create multiple Momentum Stickies.
- Each sticky supports multiple entries.
- Each entry must support:
  - Expand/collapse for long text
  - Boolean toggle (checked/flagged/done)
- Stickies are not "tasks" unless explicitly promoted into the task system.

**UX:**
- **Always on top**: Floating layer above main content, visible on all authenticated views
- **Collapsible**: Minimize to a bar or icon strip; expand on click
- **Database-persisted**: Position (x, y), collapsed state, content, entries
- **Drag & drop**: Reposition stickies; persist position on drop
- Fast access (sidebar widget or floating button)
- Minimal clicks to add entries (Enter to add, quick edit)
- Reliable saving (debounced auto-save; no lost notes)
- Optional: Pin/favorite a sticky

---

### 2) Momentum List (To-Do Action System)

**Purpose:** a single place for actionable items the user must complete.

**Contents (in order):**
1. **Daily Digest** (Top 3 Focus + Also on your radar + counts)
2. **Checklist** (section) — onboarding items:
   - Training modules
   - Documents
   - Custom checklist items
   - Training focuses with nested items
3. Assigned tickets (from ticket system)
4. Simplified action-required notifications
5. User-created tasks

**Display requirements:**
- Open task count
- "Action required" notification count
- Assigned ticket count and list

**Rail rename:** "Checklist" → **"Momentum List"**

---

### 3) Daily Digest (Login Check-In)

**Purpose:** every login produces a short, prioritized plan: "what to focus on".

**Time rule (local):**
- If login time >= 18:00 → show "Tomorrow Focus"
- Else → show "Today Focus"

**Digest pulls from:**
1) Compliance & safety reminders (highest priority)
2) Overdue tasks
3) Client-blocking tasks
4) High priority tasks
5) Assigned tickets needing action
6) Upcoming recurring reminders
7) **Undone notes** (Momentum Stickies with unchecked entries; clinical notes / payroll posting)

**Digest output should be short:**
- Top 3 Focus items (always)
- Then "Also on your radar" (up to 5)
- Then counts (open tasks, overdue, assigned tickets, action-required notifications)

---

## Data Model (Web App Equivalent of the Excel Structure)

### A) TASKS (Active Instances)
**Fields:**
- taskId (unique; e.g., T-0001)
- category (Client Contact, Client Notes, Admin/Ops, Billing/Compliance, Personal, Other)
- organization (General, ITSCO, NLU, TISI, MH4K, PLTWST, AURWLL, RISREV, MNTRNG)
- priority (High, Medium, Low)
- deadline (YYYY-MM-DD or null)
- task (action phrase)
- notesContext (details/history/user responses)
- status (Open, Waiting, Done)
- plannedTime (YYYY-MM-DD or null)
- lastUpdated (YYYY-MM-DD)

**Notes:**
- Assigned tickets can be represented as Tasks (linked) OR as a separate "AssignedTicket" list surfaced alongside Tasks.
- Notifications may generate tasks only when tracking is required (see rules below).

### B) RECURRING RULES (Templates/Engine)
**Fields:**
- ruleId (e.g., R-0001)
- taskTemplate (e.g., "Finish clinical notes")
- category
- organization
- priorityDefault
- duePattern (e.g., "Every Tuesday end-of-day")
- reminderWindow (e.g., "Start reminding 2 days before")
- notesContext
- lastUpdated

---

## Operating Principles

### Single Source of Truth
- In the web app, persisted data is the truth (DB + integrations).
- The assistant must not invent tasks. It can suggest, but should confirm before creating tasks unless a rule explicitly mandates creation (e.g., overdue compliance escalation).

### Minimize Friction
- Ask short questions only when strictly required to classify or prioritize.
- If ambiguous:
  - Ask once (e.g., "Which org is this for?")
  - Otherwise default:
    - organization = General
    - priority = Medium
    - deadline = null

### Complete Output (When Export Needed)
- If exporting to Excel, return the full table snapshot, not diffs.
- Format: TSV in a code block, no headers.
- Dates: YYYY-MM-DD.
- After TSV, instruct: "Single-click cell A2 in Excel before pasting."

---

## Core Logic Rules

### 1) Organization Logic & Prioritization
Always assign an organization.

Default priority order (when urgency is unclear):
- ITSCO / TISI: highest urgency for compliance + client care deadlines
- NLU: urgent if client/parent contact is required
- PLTWST / AURWLL: high-leverage strategic work; chunk into smaller steps
- MH4K / RISREV: dormant; low priority unless a milestone exists
- MNTRNG: umbrella/legal/agreements
- General: personal admin or cross-org

### 2) Recurring Tasks (Separation Rule)
- TASKS contains only active, specific instances.
- RECURRING RULES contains templates/engines, not permanent placeholders.

Workflow:
- Do not automatically generate rows in TASKS for every recurring rule.
- During "Weekly Scan" and at login digest time:
  - Evaluate rules against current date/time
  - Mention upcoming reminders in digest
- Add to TASKS only when:
  1) user explicitly requests it, OR
  2) it becomes overdue and needs tracking, OR
  3) it is compliance-critical and must be tracked

### 3) Conversation Workflow (Gemini Assistant)
**Step A: Intake**
- Pull current TASKS, assigned tickets, and action-required notifications.
- Ask: "What's new since last time?" only if user initiates a planning session.

**Step B: Clarify (max 3 questions)**
- Org/Category ambiguity → ask once
- Deadline missing → ask once if it's likely time-sensitive
- Otherwise default (Medium priority, no deadline)

**Step C: Weekly Scan & Reminders**
- Identify overdue TASKS
- Identify upcoming RECURRING RULES items
- Prompt: "I see X coming up and Y is overdue. Is Y done?"

**Step D: Top 3 Recommendations**
- Overdue Compliance > Client Blocking > High Priority
- Optional capacity check: "Do you have 30 mins or 2 hours?"

**Step E: Output**
- Provide "Today Focus" (Top 3)
- Provide the full updated TASKS snapshot (and rules snapshot if requested)
- If in-app, update UI state and log changes

---

## Notifications: Snooze-Only for Critical Items

### Non-Dismissible Reminders
Some reminders must not be dismissible permanently. Only:
- Snooze (time options)
- Remind me later (next login)

### Buttons
- "Remind me later (next login)"
- "Snooze" (e.g., 1h, 3h, tomorrow morning)
- "Text me this" (send the message/digest to user's phone)

### Texting
- "Text me this" sends the current digest/reminder content (concise) to the user's phone via SMS provider.

---

## Clinical Notes / Payroll Posting Logic (Persistent Until Resolved)

### Concept
If the system identifies "undone notes" around payroll posting or other compliance checkpoints:
- The reminder must appear in the digest
- It must persist until resolved (snooze-only)
- It should escalate if consistently delinquent

### Escalation (example policy)
Track a rolling delinquency score:
- +1 each checkpoint where undone notes exist
- -1 when cleared (min 0)
Escalate prominence when score >= 2:
- Show as #1 item in digest until resolved
- Add a short prompt: "Did you do your notes today?"

### Conversion to Tasks
If undone notes remain unresolved beyond a threshold:
- Create a TASKS entry:
  - category: Client Notes or Billing/Compliance
  - organization: ITSCO/TISI (or the user's active clinical org)
  - priority: High
  - status: Open
  - notesContext: include checkpoint dates + counts

---

## Gemini Orchestration (CRUD + Audit)

Gemini is the orchestrator responsible for:
- Creating/updating/deleting user To-Do tasks (with confirmation unless rule-mandated)
- Generating login digests
- Summarizing assigned tickets + simplified notifications
- **Promoting Momentum Sticky entries into Tasks** when user requests
- Maintaining an audit log of actions:
  - what changed
  - why
  - source (user request, overdue rule, compliance rule, ticket sync)

Gemini should not silently delete user data.

---

## Implementation Phases

### Phase 1: Data + Backend
1. Migration: `momentum_stickies`, `momentum_sticky_entries`
2. Backend: CRUD API for stickies and entries
3. Backend: Position update endpoint (x, y, is_collapsed)

### Phase 2: Momentum Stickies UI
1. `MomentumStickiesOverlay.vue` — floating layer, always on top
2. Collapsible bar (minimize/expand)
3. Drag-and-drop (e.g., VueDraggable or native)
4. Persist position on drop
5. Add to `App.vue` or layout so it appears on all authenticated views

### Phase 3: Momentum List (Rename + Restructure)
1. Rename rail card "Checklist" → "Momentum List"
2. Create `MomentumListTab.vue` that contains:
   - Digest section (top)
   - Checklist section (existing `UnifiedChecklistTab` content)
   - Assigned tickets section
   - Notifications section
   - User tasks section
3. Wire digest logic (today vs tomorrow, sources)

### Phase 4: Notifications + Snooze
1. Snooze-only for critical reminders
2. "Remind me later (next login)", "Snooze", "Text me this"
3. Clinical notes / payroll persistence + escalation

### Phase 5: Gemini Integration ✅
1. Gemini CRUD + digest generation — done (Focus Assistant, create/update/delete with confirmation)
2. Audit logging — done (task_audit_log on create/update; task_deletion_log on delete)
3. Sticky → Task promotion — done (promoteEntryToTask)

---

## File / Component Mapping

| Current | New / Modified |
|---------|----------------|
| `UnifiedChecklistTab.vue` | Becomes a **section** inside `MomentumListTab.vue` |
| Rail card "checklist" | Rename to "momentum_list", label "Momentum List" |
| — | `MomentumStickiesOverlay.vue` (new, in App.vue) |
| — | `MomentumStickyCard.vue` (new) |
| — | `MomentumListTab.vue` (new, orchestrates digest + checklist + tickets + notifications) |
| — | `momentum_stickies` table, `momentum_sticky_entries` table |

---

## Acceptance Criteria

- [x] Users can create multiple Momentum Stickies, add entries, toggle boolean per entry, expand/collapse long content
- [x] Momentum Stickies float on top, are collapsible, persist position (drag-drop), database-backed
- [x] Momentum List shows digest + checklist + assigned tickets + notification counts
- [x] Digest on login (today vs tomorrow based on time)
- [x] Non-dismissible reminders: snooze-only + "next login" + "text me this"
- [x] Undone-notes reminders persist until resolved, escalate if delinquent
- [x] Gemini can CRUD tasks and produce digest with change logs

---

## Output Formatting Rules (If Export Needed)
- TSV inside a code block
- No headers
- Dates: YYYY-MM-DD
- After code block: "Single-click cell A2 in Excel before pasting."

Example TSV row:
T-001	Client Contact	NLU	High	2026-01-11	Call parent re: intake	Left VM 2/18	Open		2026-02-19
