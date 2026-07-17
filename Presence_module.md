# SuperAdmin Feature Proposal: Presence + Time Tracker Module (Testing Only)

> **Superseded for entry UX:** Status setting now lives in the Messages chat sidebar (and Timedown/logout prompts for admin/super_admin/support). See [`docs/TEAM_COLLABORATION_OVERHAUL.md`](docs/TEAM_COLLABORATION_OVERHAUL.md). Team Board remains a roster view of the same `user_presence_status` data.

## Internal Development Instruction (Cursor)

Build and implement a **SuperAdmin-only** feature module inside the web application called:

**Presence + Time Tracker**

This module is for **testing and iteration only** and must remain hidden from all staff roles until explicitly approved for rollout. The purpose is to unify two operational needs:

1. A lightweight internal time-awareness system (not payroll-based clocking)
2. A simple way for staff with flexible/unlimited PTO to indicate when they are **in**, **out**, or temporarily unavailable

The feature should be implemented behind a **SuperAdmin access gate** so it can be tested safely before introducing it to the team.

---

## Purpose of the Module

Our organization needs a clear and realistic way to understand where staff are during the workday without forcing a rigid punch-clock system.

This module is designed to answer one simple operational question:

> “Who is currently working, who is briefly out, and who is off today?”

At this stage:

- **No staff are required to clock in or clock out**
- The system is meant for communication, coverage, and visibility
- Unlimited PTO is treated as a coordination workflow, not a balance-tracking system

---

## Core Concept: Status-Based Presence

Instead of timecards, the system is built around **Presence Status Updates**.

A staff member should be able to open the app and update their current status in under 10 seconds.

This is not intended to feel like surveillance — it is meant to support:

- planning
- teamwork
- scheduling
- real-time awareness
- operational accountability

---

## Status Options (Initial Set)

Each staff member can select one of the following statuses:

### In / Working
- **In – Available**
- **In – Heads Down** (working, limited interruptions)
- **In – Available for Phone** (reachable but may not be onsite)

### Out / Temporarily Away
- **Out – Quick (Under 90 min)**  
  *Requires expected return time*

### Out / Partial or Full Day
- **Out – AM**
- **Out – PM**
- **Out – Full Day**

### Other Situations
- **Traveling / Offsite**

---

## Timezone Requirements

Because staff operate across multiple time zones:

- All “Out” statuses must store **start and end timestamps**
- Display should adjust to the viewer’s timezone
- “Out AM/PM” should still record the actual local time window

Example:

- Out AM might default to 8:00am–12:00pm in the user’s timezone
- Admin views should normalize this clearly

---

## Quick Out Rule (90-Minute Limit)

The **Out – Quick** status is specifically for short absences:

- stepping out for a run
- an errand
- school pickup
- brief appointment

Rules:

- Max duration before escalation: **90 minutes**
- Return time is required (e.g., “Back by 2:15pm”)
- If return time passes without check-in, the system should optionally nudge the user

---

## Planned Time Off (Same Tool)

This module should support both:

- real-time status updates (today, right now)
- planned absences (future days)

Planned entries should still appear on the Team Board when active.

Examples:

- Out Full Day tomorrow
- Traveling next Thursday afternoon
- Out PM next Monday

---

## Visibility + Role Restrictions

### Notes and Reasons
Staff may optionally include a short note:

- “Back by 3:00”
- “Appointment”
- “Travel day”

### Visibility Rules
Notes should be visible only to:

- Admin roles
- Staff roles

Notes must **not** be visible to:

- Providers (a separate role category)

This is important for privacy and boundary clarity.

---

## Team Board Dashboard (Primary UI)

The main interface should be a **Team Board View**.

This should show:

- User photo (already in system)
- Name
- Current status
- Return time if applicable
- Traveling/offsite indicator

This should function like a real-time roster:

| Photo | Name | Status | Return |
|------|------|--------|--------|
| 🟢   | Jamie | In – Available | — |
| 🟡   | Sam   | Out – Quick | Back 2:15pm |
| 🔵   | Alex  | Traveling | — |
| 🔴   | Taylor| Out – Full Day | — |

The Team Board should become the single source of truth for:

- who is around
- who is off
- who is temporarily unavailable

---

## SuperAdmin Testing Gate (Critical)

This entire feature must remain restricted until ready.

Implementation requirements:

- Only visible to SuperAdmins
- No staff-facing UI until enabled
- Feature flag or role-gated route strongly preferred

Suggested control:

```ts
if (!currentUser.isSuperAdmin) return null;