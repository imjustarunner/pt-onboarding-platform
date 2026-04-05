# Summit Stats Team Challenge  
## Platform Structure & System Design Document

---

# 1. Platform Overview

**Summit Stats Team Challenge** is a competitive fitness platform designed for organizations to create and manage team-based fitness challenges.

The platform allows organizations to create structured programs where participants track workouts, contribute points to their teams, and compete on leaderboards through customizable fitness challenges.

The system is designed around a hierarchy that enables scalable management of organizations, program managers, teams, and participants.

---

# 2. Platform Hierarchy

The system structure is organized as follows:

**Agency** (Summit Stats Team Challenge — the app/platform)
└── **Club** (organization_type: affiliation) — People sign up their clubs!
└── **Season** (challenge / learning_program_class) — A club runs seasons
└── **Teams**
└── **Users** (Participants)

### Agency
The **Agency** is the Summit Stats Team Challenge platform. Organizations sign up their **clubs** to the platform.

---

### Club (Affiliation)

**The affiliation is the CLUB.** Clubs are the primary organizational unit. People sign up their clubs to the Summit Stats Team Challenge platform.

- **Club** = `organization_type: affiliation` in the database
- Clubs are created and managed by **Program Managers (Club Manager Accounts)**
- Each club operates independently and can run multiple **seasons**

**Self-service flow:** People from the main website can **"Create Club Manager Account"** — a public signup that creates an admin account. Once they have that account, they log in and **create a new club**. Club creation is what starts things off. See `SUMMIT_STATS_CLUB_MANAGER_SIGNUP_SPEC.md` for full details.

Examples of clubs:

- Corporate Wellness Clubs
- School Fitness Clubs
- Gym / CrossFit Clubs
- Youth Athletic Clubs
- Department Fitness Clubs

Clubs are assigned to **seasons** (challenges). A new season = a new competitive period with its own teams, scoreboard, and elimination.

---

# 3. User Roles

The system contains several user roles that determine access and permissions.

### Program Manager (Admin Account)

The **Program Manager** is responsible for managing a **club**.

Responsibilities include:

- Creating and managing seasons (challenges)
- Creating and assigning teams
- Assigning team managers / team leads
- Adding users (participants)
- Customizing seasons and scoring
- Monitoring leaderboards
- Managing the club store

Program Managers are the primary administrators of each club.

---

### Provider Accounts (Participants)

Provider accounts represent **participants within the system**.

Providers may:

- Join teams
- Submit workouts
- Upload workout screenshots
- Track challenge progress
- Interact with other participants
- View leaderboards
- Comment or react to workouts

Providers contribute points to their teams through their logged activities.

---

### Team Manager / Team Lead (Provider Plus)

Team Managers or Team Leads are upgraded provider accounts with additional permissions.

This role corresponds to what is currently called:

**`provider_plus`**

Responsibilities include:

- Managing team members
- Monitoring team progress
- Encouraging participation
- Viewing team statistics
- Supporting challenge engagement

Team Managers operate within the teams assigned to them by the Program Manager.

---

# 4. Seasons (Challenges)

**Seasons** are the core competitive structure within a club. (Internally: `learning_program_classes`; UI: "Seasons" or "Challenges.")

Each season represents a specific competition period with defined rules and parameters. A **new season** = a fresh competitive period with new teams, scoreboard, and elimination.

---

## Season Configuration

When creating a season, the Program Manager can define:

- Season name
- Description
- Start / end dates
- Activity types allowed
- Scoring rules
- Team and individual minimum points per week
- Weekly challenge goals
- Captain application controls (`captain_application_open`, `captains_finalized`)
- Season splash visibility and announcement copy
- Season settings JSON for feed/moderation/integration options

Examples of season types:

- Running seasons
- Total workout seasons
- Cross-training competitions
- Consistency challenges
- Team endurance seasons

---

# 5. Teams

Teams are created **within each season**.

Teams represent the primary competitive units of the platform.

Program Managers create teams and assign Team Managers (Provider Plus accounts) to oversee them.

Each team includes:

- Team name
- Team manager
- Team members
- Team statistics
- Team total points

Teams compete against other teams in the same season.

---

# 6. Workout Submission

Participants log their activities by submitting workouts.

Each workout entry includes:

- Activity type
- Distance or duration
- Time completed
- Workout notes
- Screenshot or photo upload

Example screenshot sources may include:

- Running apps
- Fitness trackers
- GPS watches
- Gym tracking apps

---

## Workout Display

Each workout submission generates a **workout card** that includes:

- Participant name
- Activity type
- Digital workout readout
- Screenshot preview
- Points earned
- Timestamp

Users may click the screenshot to view the full uploaded image.

Workouts now also support:

- GIF/image media attachments on workout posts
- Comment threads on workout cards
- Async Vision ingestion hook (job queue) for screenshot/media enrichment

---

# 7. Scoring System

The platform automatically calculates points based on the challenge configuration.

Scoring parameters are customizable by Program Managers.

Example scoring rules may include:

| Activity | Points |
|--------|--------|
Running | Points per mile |
Cycling | Points per mile |
Workout Session | Fixed points |
Steps | Points per step threshold |

The system automatically updates:

- Individual points
- Team points
- Leaderboards

---

# 8. Seasonal Workflow (Current)

Each season now follows an explicit lifecycle:

1. **Manager starts season** (status active + splash enabled)
2. Participants see season splash with:
   - **Apply for captain** (while applications are open)
   - **Join season**
3. Manager reviews applications and **finalizes captains**
4. Season dashboard shows:
   - Overall season leaderboards and weekly scoreboard
   - Team weekly progress with member status (behind/met/ahead)
   - Workout feed and in-app message feed

### Seasonal Workflow API Surface

- `GET /api/learning-program-classes/discover`
- `POST /api/learning-program-classes/:classId/join`
- `GET /api/learning-program-classes/:classId/captain-applications`
- `POST /api/learning-program-classes/:classId/captain-applications`
- `PUT /api/learning-program-classes/:classId/captain-applications/:applicationId`
- `POST /api/learning-program-classes/:classId/captains/finalize`
- `GET /api/learning-program-classes/:classId/team-weekly-progress`
- `GET/POST /api/learning-program-classes/:classId/messages`
- `GET/POST/DELETE` workout comment routes
- `POST /api/learning-program-classes/:classId/workouts/:workoutId/media`

---

# 9. Messaging + Integration Direction

The in-app message feed is the default transport.

Bridge scaffold is implemented for future WhatsApp integration with adapter methods:

- `postMessageToChannel`
- `ingestExternalMessage`
- `mapExternalAuthor`

Google Vision is integrated as an async queue hook (`challenge_workout_vision_jobs`) so screenshot/media processing can be enabled without changing the workout submission UX.

---

# 8. Leaderboards

Leaderboards provide real-time competition tracking.

Leaderboards may include:

### Individual Leaderboard
Ranks participants based on total points.

### Team Leaderboard
Ranks teams based on cumulative team performance.

### Weekly Leaderboard
Tracks top performers for each week of the challenge.

### Season Leaderboard
Tracks overall performance across the entire challenge period.

Leaderboards update automatically when workouts are submitted.

---

# 9. Social Interaction

The platform includes social features designed to increase engagement.

Participants may:

- Comment on workouts
- React with emojis
- Encourage teammates
- Celebrate achievements

These interactions appear in the challenge activity feed.

---

# 10. Dashboard Structure

## My Dashboard

The **My Dashboard** is the main user entry point.

This dashboard displays:

- Active challenges
- Upcoming challenges
- Team assignment
- Personal statistics
- Recent activity

All challenges the user participates in appear on this dashboard.

---

## Challenge Dashboard

When a user selects a challenge from **My Dashboard**, they are taken to the **Challenge Dashboard**.

The Challenge Dashboard displays:

- Leaderboards
- Team rankings
- Activity feed
- Workout submissions
- Challenge rules
- Weekly progress
- Team performance metrics

This is the primary competition interface where participants monitor progress and engagement.

---

# 11. Club Store

Each **club** has its own **Club Store**. The store allows clubs to offer merchandise, rewards, or items to participants.

- **Per-club** — Each club manages its own store inventory and offerings
- **Program Manager** — Manages the club store (add items, set prices, fulfillment)
- **Participants** — Can browse and purchase from their club's store (e.g., using points, or direct purchase)
- **Integration** — Can tie to season points, achievements, or standalone purchases

*Implementation details to be defined.*

---

# 12. Records, Divisions & Recognition

**All records** are tracked, especially by **gender**. Club Managers can configure:

- **Master's Division** — Participants 53+ (age threshold customizable) get recognition (e.g., Fastest Master's Male, Fastest Master's Female).
- **Recognition of the Week** — Fastest male, fastest female, fastest Master's male, fastest Master's female (all customizable by Club Manager).
- **Gender & DOB** — Participants provide gender and date of birth for segmented leaderboards.

See `SUMMIT_STATS_RECORDS_AND_DIVISIONS_SPEC.md` for full details.

---

# 13. Club Manager Workflow

Club Managers can:

- **Add teams** — Create teams within a season.
- **Add users** — Add participants and assign them to teams.
- **Launch the season** — Set all parameters (scoring, thresholds, recognition categories, Master's age) and launch with one action.

Workout submission: **screenshots by default**, with **Strava sign-in** as the preferred method to import workouts directly into the club's season or assigned challenge.

---

# 14. Future Expansion Opportunities

The Summit Stats Team Challenge platform is designed to expand with additional features, including:

- Wearable integrations
- Automatic workout imports
- Advanced analytics
- Challenge seasons and playoffs
- Achievement badges
- Streak tracking
- Team rivalries
- Corporate wellness integrations

---

# 15. Core Platform Goal

The goal of Summit Stats Team Challenge is to transform fitness tracking into a **structured competitive environment** where individuals and teams can:

- Track performance
- Stay accountable
- Compete collaboratively
- Build consistent fitness habits

The platform combines **fitness tracking, team competition, and social engagement** into a unified experience designed to motivate long-term participation.

---