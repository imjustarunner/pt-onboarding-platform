# Summit Stats Team Challenge — Records, Divisions & Club Manager Workflow Spec

## Overview

This spec extends the Summit Stats Team Challenge platform with:
- **Record tracking** (especially by gender)
- **Master's Division** (53+) and other customizable recognition categories
- **Club Manager workflow** — add teams, add users, launch season with parameters
- **Workout submission** — screenshots (default) + Strava integration for club/season

---

## 1. Record Tracking (All Records, Especially by Gender)

### Requirements

- **All workout records** should be tracked and queryable.
- **Gender** must be captured for participants so leaderboards and recognition can be segmented.
- Records support:
  - Fastest male / fastest female (overall)
  - Fastest male / fastest female in Master's Division (53+)
  - Other club-manager-configurable categories

### Data Model

| Entity | Purpose |
|--------|---------|
| **Participant profile (challenge-scoped or club-scoped)** | Store `gender`, `date_of_birth` for challenge/leaderboard use |
| **User info** | Use existing `user_info_values` for `gender`, `date_of_birth` (or add challenge-specific overrides) |

**Gender options** (club-configurable or platform default):
- Male
- Female
- Non-binary / Other (optional, for inclusivity)
- Prefer not to say

**Date of birth** — used to compute age and Master's eligibility (e.g., 53+).

### Implementation Notes

- Participants must provide (or have on file) **gender** and **date_of_birth** to appear in gender/age-segmented leaderboards.
- If missing, they can still participate but may be excluded from "Fastest Male/Female" and "Master's" categories.
- Club Manager can require these fields before a user can join a season.

---

## 2. Master's Division (53+)

### Requirements

- **Master's Division** = participants who are **53 years or older** (age as of a reference date, e.g., season start or week start).
- **Recognition of the week** — e.g., "Fastest 53+ Male", "Fastest 53+ Female".
- **Customizable by Club Manager:**
  - Age threshold (default 53; could be 50, 55, etc.)
  - Which recognition categories to show (e.g., Fastest Male, Fastest Female, Fastest Master's Male, Fastest Master's Female)

### Recognition Categories (Club-Configurable)

| Category | Description | Example |
|----------|-------------|---------|
| Fastest Male | Top male by time/distance/points (configurable metric) | Weekly recognition |
| Fastest Female | Top female by metric | Weekly recognition |
| Fastest Master's Male | Top male 53+ | Weekly recognition |
| Fastest Master's Female | Top female 53+ | Weekly recognition |
| Top 5 Athletes | Overall (existing) | Weekly scoreboard |
| Top 5 Teams | Overall (existing) | Weekly scoreboard |
| Top per Team | One per team (existing) | Weekly scoreboard |

### Season Configuration (New Fields)

| Field | Type | Description |
|-------|------|-------------|
| `masters_age_threshold` | INT | Age to qualify for Master's (default 53) |
| `recognition_categories_json` | JSON | Array of enabled categories, e.g. `["fastest_male","fastest_female","fastest_masters_male","fastest_masters_female"]` |
| `recognition_metric` | ENUM/STRING | What "fastest" means: `points` \| `distance` \| `duration` \| `activities_count` |

### Weekly Scoreboard Extensions

- When posting the weekly scoreboard, compute and store:
  - Top male (by metric)
  - Top female (by metric)
  - Top Master's male (53+)
  - Top Master's female (53+)
- Display these in the scoreboard UI as "Recognition of the Week" (or similar).

---

## 3. Club Manager Workflow

### Requirements

The **Club Manager (Program Manager)** must be able to:

1. **Add a team** — Create teams within a season (already supported).
2. **Add users** — Add participants to the season and optionally assign them to teams.
3. **Launch the season** — Set all parameters and then "launch" (change status from draft → active) so the season goes live.

### Launch Season Flow

1. Club Manager configures the season:
   - Name, description, dates
   - Activity types, scoring rules
   - Team min points/week, individual min points/week
   - Master's age threshold, recognition categories
   - Weekly challenge goals
2. Club Manager adds teams.
3. Club Manager adds participants (and assigns to teams).
4. Club Manager clicks **"Launch Season"**:
   - Validates: at least one team, participants assigned, required config present
   - Sets status to `active`
   - Optionally sends notifications to participants

### UI / API

| Action | Endpoint / UI | Notes |
|--------|---------------|-------|
| Add team | `POST /learning-program-classes/:classId/teams` | Existing |
| Add participant | `PUT /learning-program-classes/:classId/providers` | Existing |
| Launch season | `POST /learning-program-classes/:classId/launch` (new) | Validates + sets status active |
| Configure recognition | In Create/Edit Challenge form | New fields: masters_age_threshold, recognition_categories_json |

---

## 4. Workout Submission: Screenshots + Strava

### Requirements

- **Default:** Users upload **screenshots** of their workouts (existing behavior).
- **Preferred:** Users can **sign into Strava** and import workouts directly into the club's season (or assigned challenge).
- Strava import should be available at:
  - **Club level** — import to the club's active season(s)
  - **Challenge level** — import to a specific assigned challenge

### Current State

- Strava OAuth and activity import already exist.
- Import is challenge-scoped: user selects activities and imports to a specific `learning_class_id`.

### Enhancements

1. **Club-level Strava import**
   - From Club Dashboard or Season view: "Import from Strava" → selects club's active season(s) or a specific season.
   - User picks activities → imports to chosen season.

2. **Challenge-level Strava import**
   - Already available on Challenge Dashboard: "Import from Strava" → imports to that challenge.
   - Ensure UX is clear: "Import to this season" with Strava as primary option, screenshot as fallback.

3. **Default / Preferred method**
   - Club Manager can set a season preference: "Encourage Strava" (show Strava import prominently) vs. "Screenshots only" (hide Strava for that season).
   - Most clubs will want both: Strava for convenience, screenshots for those without Strava.

### Data Model

- `challenge_workouts` already has `strava_activity_id` for Strava-imported workouts.
- No new tables required; ensure Strava import is visible and easy to use from both club and challenge views.

---

## 5. Implementation Phases

### Phase 1: Participant Demographics & Record Tracking
- Add `gender` and `date_of_birth` to challenge participant context (user_info or challenge-specific table).
- Ensure these are collected/editable when adding participants.
- Extend leaderboard queries to support gender and age filters.

### Phase 2: Master's Division & Recognition Categories
- Add `masters_age_threshold`, `recognition_categories_json`, `recognition_metric` to `learning_program_classes`.
- Extend weekly scoreboard logic to compute and store recognition categories.
- Update scoreboard UI to display "Recognition of the Week" (Fastest Male, Fastest Female, Fastest Master's Male, Fastest Master's Female).

### Phase 3: Club Manager Launch Flow
- Add "Launch Season" action with validation.
- Ensure Add Team and Add Participant flows are complete and easy to use.
- Optional: "Season setup wizard" that walks through: config → teams → participants → launch.

### Phase 4: Strava UX Improvements
- Add club-level "Import from Strava" entry point.
- Promote Strava as primary import method on Challenge Dashboard.
- Optional: Club Manager setting to encourage Strava vs. screenshots.

---

## 6. Open Questions

- Should gender/DOB be required to join a season, or optional (with exclusion from segmented leaderboards if missing)?
- Should "fastest" use points, distance, or duration — or be configurable per season?
- Should recognition categories be fully customizable (e.g., "Fastest 40+ Female") or a fixed set (Male, Female, Master's Male, Master's Female)?
