# Summit Stats Challenge – Gap Analysis

## What Already Exists

| Area | Current State | Location |
|------|---------------|----------|
| **Classes (Challenges)** | `learning_program_classes` table with name, dates, status, metadata_json | `database/migrations/538_learning_program_classes.sql`, `LearningProgramClass.model.js` |
| **Class memberships** | `learning_class_provider_memberships`, `learning_class_client_memberships` | Same migration |
| **Provider / provider_plus** | Roles in `users.role` enum; `provider_plus` used for coordination | `database/migrations/438_add_provider_plus_role.sql`, `accessControl.js` |
| **Affiliations** | `organization_affiliations` links agencies to child orgs (school, program, learning) | `OrganizationAffiliation.model.js` |
| **Dashboard** | `DashboardView.vue` with rail cards, "My Dashboard" header | `DashboardView.vue` |
| **Learning classes API** | CRUD + `listMyLearningClasses` for providers/guardians | `learningProgramClasses.controller.js` |
| **Kudos/points** | `user_kudos_points`, leaderboard for agency | `Kudos.model.js` (different domain – peer recognition) |

## What Was Changed

| Area | Change |
|------|--------|
| **Classes → Challenges** | Extended `learning_program_classes` with `activity_types_json`, `scoring_rules_json`, `weekly_goal_minimum`; UI labels as "Challenges" |
| **provider_plus semantics** | Documented as Team Manager / Team Lead; `canManageTeam` helper in `challengePermissions.js` |
| **Dashboard** | Challenges rail card when user has challenge memberships; `ChallengesTab` component |
| **Learning classes routes** | Mounted at `/api/learning-program-classes` in `server.js` |

## What Was Added (Models/Tables)

| Table | Purpose |
|-------|---------|
| `challenge_teams` | Teams within a challenge; team_name, team_manager_user_id (provider_plus) |
| `challenge_team_members` | Provider membership in teams |
| `challenge_workouts` | Workout submissions (activity_type, distance, duration, points, screenshot, etc.) |

## What Was Added (Routes/Pages/Components)

| Route/Page | Purpose |
|-------------|---------|
| `GET /api/learning-program-classes/my` | User's challenges |
| `GET /api/learning-program-classes/:classId/teams` | List teams |
| `POST /api/learning-program-classes/:classId/teams` | Create team |
| `PUT /api/learning-program-classes/:classId/teams/:teamId` | Update team |
| `DELETE /api/learning-program-classes/:classId/teams/:teamId` | Delete team |
| `PUT /api/learning-program-classes/:classId/teams/:teamId/members` | Add/remove team members |
| `GET /api/learning-program-classes/:classId/leaderboard` | Individual + team leaderboards |
| `GET /api/learning-program-classes/:classId/activity` | Activity feed (workouts) |
| `POST /api/learning-program-classes/:classId/workouts` | Submit workout |
| **My Dashboard** | Challenges rail card; `ChallengesTab` |
| **Challenge Dashboard** | `/challenges/:id` and `/:slug/challenges/:id` – leaderboards, activity feed, teams, workout submission |

## Role/Permission Updates

| Role | Updates |
|------|---------|
| **admin / super_admin** | Program Manager; `canManageChallenges`; create challenges, teams, assign team managers |
| **provider_plus** | Team Manager / Team Lead; `canManageTeam` when assigned to team; `canManageChallenges` |
| **provider** | Participant; join teams, submit workouts, view leaderboards |
