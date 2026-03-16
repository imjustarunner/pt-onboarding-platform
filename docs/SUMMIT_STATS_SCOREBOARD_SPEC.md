# Summit Stats Challenge — Weekly Scoreboard & Game Model Spec

## Overview

The platform will support a **weekly scoreboard** designed for app-store integration. At the end of each week, a scoreboard is posted and visible to everyone who logs in. The game includes configurable thresholds, elimination, and weekly challenges assigned by team captains.

**Terminology:** Club = affiliation. Season = challenge. Each club runs seasons.

---

## 1. Weekly Scoreboard (Posted End of Week)

**When:** End of each week — Sunday to Sunday. Week begins at a configurable time (e.g., 12:00 AM). After that time, it is the next week.  
**Visibility:** All logged-in participants (non-eliminated)  
**Purpose:** App-store ready; primary view for mobile users

### Scoreboard Sections

| Section | Description |
|--------|-------------|
| **Top 5 Athletes** | Athletes with most points that week (across all teams) |
| **Top 5 Teams** | Teams with most collective points that week |
| **Top of Each Team** | Individual leader per team (one person per team) |

---

## 2. Configurable Point Thresholds

Program Managers can set:

| Threshold | Description | Used For |
|-----------|-------------|----------|
| **Team minimum points** | X points the team must collectively achieve per week | Team survives / team elimination |
| **Individual minimum points** | X points each person must achieve per week | Personal survival / elimination |

These thresholds determine who stays and who gets eliminated.

---

## 3. Elimination Board

**When:** End of every week (same as scoreboard post)

**Eliminated if:**
- Does **not** meet personal minimum points, OR
- Does **not** complete their assigned weekly challenge

**Display:** An "Elimination Board" shows who was eliminated that week (and historically).

**Admin comment:** The main admin adds a comment about each eliminated person (visible on the elimination board).

**Access:** Eliminated users are **booted completely** — no access to the challenge/event/season.

---

## 4. Weekly Challenges (3 per Week)

- **3 challenges** are defined each week
- Each challenge is a specific task (e.g., "Run 5 miles", "Complete 3 strength workouts", "Log 10,000 steps")
- **At start of week:** One person per challenge is assigned (3 people per team total)
- Assignment methods:
  - **Volunteer:** Team members can volunteer for a challenge
  - **Captain selects:** Team captain (Team Lead) assigns who does which challenge
- **Completion:** Separately added to the challenge (not derived from workouts)
  - Assigned person marks their challenge as completed and attaches proof/notes
  - The challenge then displays that it is completed

---

## 5. Data Model Additions (Proposed)

### New Tables / Columns

| Entity | Purpose |
|--------|---------|
| `challenge_weekly_config` | Per-challenge, per-week: team_min_points, individual_min_points, week_start |
| `challenge_weekly_tasks` | The 3 challenges per week (name, description, completion criteria) |
| `challenge_weekly_assignments` | Who is assigned to which weekly task (user_id, task_id, team_id, assigned_by, volunteered) |
| `challenge_weekly_completions` | When assigned person marks challenge done (assignment_id, completed_at, notes/attachment) |
| `challenge_weekly_scoreboard` | Snapshot at end of week: top 5 athletes, top 5 teams, top per team |
| `challenge_eliminations` | Who was eliminated, when, why (points_failed / challenge_not_completed), admin_comment |

### Extend `learning_program_classes`

- `team_min_points_per_week` INT NULL
- `individual_min_points_per_week` INT NULL
- `week_start_time` TIME NULL — e.g., 00:00:00 for midnight Sunday (week boundary)

---

## 6. API Endpoints (Proposed)

| Endpoint | Purpose |
|----------|---------|
| `GET /challenges/:id/scoreboard?week=YYYY-MM-DD` | Get posted scoreboard for a week |
| `GET /challenges/:id/elimination-board?week=YYYY-MM-DD` | Get elimination list for a week |
| `GET /challenges/:id/weekly-tasks?week=YYYY-MM-DD` | Get 3 challenges for the week |
| `POST /challenges/:id/weekly-tasks` | Program Manager creates 3 weekly tasks |
| `GET /challenges/:id/weekly-assignments?week=YYYY-MM-DD` | Get who is assigned to what |
| `POST /challenges/:id/weekly-assignments` | Captain assigns or user volunteers |
| `POST /challenges/:id/close-week` | Trigger end-of-week: compute scoreboard, eliminations, post |

---

## 7. App Integration Notes

- Scoreboard should be the **primary landing view** for app users
- Optimized for mobile (compact, scannable)
- Push notifications: "Scoreboard is live", "You were eliminated", "New weekly challenges"

---

## 8. Implementation Phases

### Phase 1: Scoreboard + Thresholds
- Add team/individual min points to challenge config
- Weekly scoreboard view (top 5 athletes, top 5 teams, top per team)
- End-of-week snapshot logic

### Phase 2: Elimination
- Elimination logic (didn’t meet points or didn’t complete challenge)
- Elimination board UI

### Phase 3: Weekly Challenges + Assignments
- 3 tasks per week
- Captain assignment + volunteer flow
- Completion tracking

---

## 9. Clarifications (Resolved)

### Week boundary
- **Sunday to Sunday.** Week begins at a configurable time on Sunday (e.g., 12:00 AM).
- After that time passes, it is the next week.

### Elimination
- Eliminated from the **season/event** — permanent for that season.
- **Main admin** adds a comment about each eliminated person.
- **Eliminated users are booted completely** — no access to the challenge/event.

### Challenge completion
- Completion is **separately added** to the challenge (not derived from workouts).
- **Start of week:** One person per challenge is assigned (3 people total per team).
- **When completed:** The assigned person marks their challenge as completed and attaches proof/notes.
- The challenge then **displays** that it is completed.
